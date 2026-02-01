/**
 * WeChat message polling for receiving inbound messages.
 * 微信消息轮询模块，用于接收入站消息
 *
 * 使用 /api/v1/chat/history 端点轮询新消息
 */

import { getChatHistory, getContactList, getChatRoomList, getRobotInfo } from "./api.js";
import type { WeChatChatHistoryItem, WeChatPollingConfig } from "./types.js";

/** 入站消息类型 */
export type WeChatInboundMessage = {
  id: string;              // 消息唯一标识（contactId:msgId）
  msgId: number;           // 消息 ID
  from: string;            // 来源（群聊为群 ID，私聊为发送者 wxid）
  senderWxid: string;      // 发送者微信 ID
  senderNickname?: string; // 发送者昵称
  toWxid: string;          // 接收者微信 ID
  body: string;            // 消息内容
  timestamp: number;       // 时间戳（毫秒）
  chatType: "direct" | "group"; // 聊天类型
  chatId: string;          // 聊天 ID（联系人 ID）
  isAtMe: boolean;         // 是否 @了我
  isRecalled: boolean;     // 是否已撤回
  messageType: number;     // 消息类型
  attachmentUrl?: string;  // 附件 URL
};

/** 轮询器配置选项 */
export type WeChatPollingOptions = {
  baseUrl: string;                                    // API 服务地址
  apiToken: string;                                   // API Token
  robotId: number;                                    // 机器人 ID
  accountId: string;                                  // 账户 ID
  pollingConfig?: WeChatPollingConfig;                // 轮询配置
  onMessage: (msg: WeChatInboundMessage) => Promise<void>; // 消息回调
  onError?: (error: Error) => void;                   // 错误回调
  abortSignal?: AbortSignal;                          // 中止信号
};

/** 默认轮询间隔（毫秒） */
const DEFAULT_POLLING_INTERVAL_MS = 3000;
/** 默认最大轮询联系人数 */
const DEFAULT_MAX_POLL_CONTACTS = 50;

/**
 * WeChat message poller class.
 * 微信消息轮询器类
 */
export class WeChatMessagePoller {
  private readonly options: WeChatPollingOptions;
  /** 已处理的消息 ID 集合（用于去重） */
  private readonly seenMessageIds = new Set<string>();
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;
  /** 每个联系人的最后轮询时间戳 */
  private lastPollTimestamps = new Map<string, number>();
  /** 机器人微信 ID */
  private robotWxid: string | null = null;
  /** 机器人昵称 */
  private robotNickname: string | null = null;

  constructor(options: WeChatPollingOptions) {
    this.options = options;
  }

  /**
   * Start polling for messages.
   * 启动消息轮询
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log(`[微信] 轮询已启动`);

    // 监听 abortSignal，立即停止轮询器
    // Listen for abortSignal to immediately stop the poller
    if (this.options.abortSignal) {
      if (this.options.abortSignal.aborted) {
        this.stop();
        return;
      }
      this.options.abortSignal.addEventListener("abort", () => {
        console.log(`[微信] 收到中止信号，停止轮询`);
        this.stop();
      }, { once: true });
    }

    // 获取机器人信息（wxid 和昵称）
    // Fetch robot info to get the robot's wxid and nickname
    try {
      const robotInfo = await getRobotInfo({
        baseUrl: this.options.baseUrl,
        apiToken: this.options.apiToken,
        robotId: this.options.robotId,
      });
      this.robotWxid = robotInfo.data?.wechat_id ?? null;
      this.robotNickname = robotInfo.data?.nickname ?? null;
      if (this.robotNickname) {
        console.log(`[微信] 机器人昵称: ${this.robotNickname}`);
      }
    } catch {
      // 忽略获取机器人信息时的错误
      // Ignore errors when fetching robot info
    }

    // 初始化最后轮询时间戳为当前时间，避免获取旧消息
    // Initialize last poll timestamps to current time to avoid fetching old messages
    const now = Math.floor(Date.now() / 1000);
    const contactIds = await this.resolveContactIds();
    for (const contactId of contactIds) {
      this.lastPollTimestamps.set(contactId, now);
    }

    this.schedulePoll();
  }

  /**
   * Stop polling.
   * 停止轮询
   */
  stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Schedule next poll.
   * 调度下一次轮询
   */
  private schedulePoll(): void {
    if (!this.isRunning) return;

    const intervalMs =
      this.options.pollingConfig?.pollingIntervalMs ?? DEFAULT_POLLING_INTERVAL_MS;

    this.pollTimer = setTimeout(async () => {
      if (!this.isRunning) return;
      if (this.options.abortSignal?.aborted) {
        this.stop();
        return;
      }

      try {
        await this.poll();
      } catch (error) {
        this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
      }

      this.schedulePoll();
    }, intervalMs);
  }

  /**
   * Resolve contact IDs to poll.
   * 解析要轮询的联系人 ID 列表
   */
  private async resolveContactIds(): Promise<string[]> {
    const config = this.options.pollingConfig;

    // 如果指定了联系人 ID 列表，直接使用
    // If explicit contact IDs are provided, use them
    if (config?.pollContactIds && config.pollContactIds.length > 0) {
      return config.pollContactIds;
    }

    // 如果启用了轮询所有联系人，从目录获取
    // If pollAllContacts is enabled, fetch from directory
    if (config?.pollAllContacts) {
      const contactIds: string[] = [];
      const maxContacts = config.maxPollContacts ?? DEFAULT_MAX_POLL_CONTACTS;

      try {
        // 获取好友列表
        // Get friends
        const friendsResponse = await getContactList(
          {
            baseUrl: this.options.baseUrl,
            apiToken: this.options.apiToken,
            robotId: this.options.robotId,
          },
          "friend",
        );
        for (const contact of friendsResponse.data ?? []) {
          if (contactIds.length >= maxContacts) break;
          contactIds.push(contact.wechat_id);
        }

        // 获取群聊列表
        // Get chat rooms
        if (contactIds.length < maxContacts) {
          const roomsResponse = await getChatRoomList({
            baseUrl: this.options.baseUrl,
            apiToken: this.options.apiToken,
            robotId: this.options.robotId,
          });
          for (const room of roomsResponse.data ?? []) {
            if (contactIds.length >= maxContacts) break;
            contactIds.push(room.wechat_id);
          }
        }
      } catch {
        // 忽略获取联系人列表时的错误
        // Ignore errors when fetching contact list
      }

      return contactIds;
    }

    return [];
  }

  /**
   * Poll for new messages.
   * 轮询新消息
   */
  private async poll(): Promise<void> {
    const contactIds = await this.resolveContactIds();
    if (contactIds.length === 0) return;

    // 轮询每个联系人的新消息
    // Poll each contact for new messages
    for (const contactId of contactIds) {
      if (!this.isRunning) break;
      if (this.options.abortSignal?.aborted) break;

      try {
        const response = await getChatHistory({
          baseUrl: this.options.baseUrl,
          apiToken: this.options.apiToken,
          robotId: this.options.robotId,
          contactId,
          pageIndex: 1,
          pageSize: 20,
        });

        const items = response.data?.items ?? [];
        const lastPollTimestamp = this.lastPollTimestamps.get(contactId) ?? 0;

        // 处理新消息（响应中最新的在前，所以反转处理旧的先）
        // Process new messages (newest first in response, so we reverse to process oldest first)
        const newMessages = items
          .filter((item) => {
            const messageKey = `${contactId}:${item.msg_id}`;
            if (this.seenMessageIds.has(messageKey)) return false;
            // 立即添加到已处理集合，防止重复
            // Add to seen immediately to prevent duplicates
            this.seenMessageIds.add(messageKey);
            if (item.created_at <= lastPollTimestamp) return false;
            return true;
          })
          .reverse();

        for (const item of newMessages) {
          // 跳过机器人自己发送的消息
          // Skip messages sent by the robot itself
          if (item.message_source === "robot") continue;
          if (this.robotWxid && item.sender_wxid === this.robotWxid) continue;

          // 跳过已撤回的消息
          // Skip recalled messages
          if (item.is_recalled) continue;

          // 暂时只处理文本消息（type 1 = 文本）
          // Skip non-text messages for now (type 1 = text)
          if (item.type !== 1) continue;

          const inboundMessage = this.convertToInboundMessage(item, contactId);

          const sender = item.sender_nickname ?? item.sender_wxid;
          const content = inboundMessage.body.length > 50 ? inboundMessage.body.substring(0, 50) + "..." : inboundMessage.body;
          const atMe = inboundMessage.isAtMe ? " [@]" : "";
          console.log(`[微信] 收到消息 ${sender}${atMe}: ${content}`);

          await this.options.onMessage(inboundMessage);
        }

        // 更新此联系人的最后轮询时间戳
        // Update last poll timestamp for this contact
        if (items.length > 0) {
          const maxTimestamp = Math.max(...items.map((item) => item.created_at));
          this.lastPollTimestamps.set(contactId, maxTimestamp);
        }
      } catch (error) {
        console.error(`[微信] 轮询错误:`, error);
      }
    }

    // 清理旧的已处理消息 ID，防止内存泄漏
    // Clean up old seen message IDs to prevent memory leak
    if (this.seenMessageIds.size > 10000) {
      const idsArray = Array.from(this.seenMessageIds);
      const toRemove = idsArray.slice(0, 5000);
      for (const id of toRemove) {
        this.seenMessageIds.delete(id);
      }
    }
  }

  /**
   * Convert chat history item to inbound message.
   * 将聊天记录项转换为入站消息
   */
  private convertToInboundMessage(
    item: WeChatChatHistoryItem,
    contactId: string,
  ): WeChatInboundMessage {
    const isChatRoom = item.is_chat_room || contactId.endsWith("@chatroom");
    const content = item.content || "";
    const displayContent = item.display_full_content || "";

    // 检查是否 @了我：
    // 1. API 的 is_atme 字段
    // 2. display_full_content 包含 "在群聊中@了你"（系统提示）
    // 3. content 包含 @robotNickname
    // Check if @mentioned:
    // 1. API is_atme field
    // 2. display_full_content contains "在群聊中@了你" (system hint)
    // 3. content contains @robotNickname
    let isAtMe = item.is_atme;
    if (!isAtMe && displayContent.includes("@了你")) {
      isAtMe = true;
    }
    if (!isAtMe && this.robotNickname && content) {
      isAtMe = content.includes(`@${this.robotNickname}`);
    }

    // 调试：输出 @检测信息
    if (isChatRoom) {
      console.log(`[微信] @检测: api.is_atme=${item.is_atme}, robotNickname=${this.robotNickname}, content前30字="${content.slice(0, 30)}", 最终isAtMe=${isAtMe}`);
    }

    return {
      id: `${contactId}:${item.msg_id}`,
      msgId: item.msg_id,
      from: isChatRoom ? contactId : item.sender_wxid,
      senderWxid: item.sender_wxid,
      senderNickname: item.sender_nickname,
      toWxid: item.to_wxid,
      body: content || displayContent,
      timestamp: item.created_at * 1000, // 转换为毫秒
      chatType: isChatRoom ? "group" : "direct",
      chatId: contactId,
      isAtMe,
      isRecalled: item.is_recalled,
      messageType: item.type,
      attachmentUrl: item.attachment_url,
    };
  }
}

/**
 * Create a WeChat message poller.
 * 创建微信消息轮询器
 */
export function createWeChatPoller(options: WeChatPollingOptions): WeChatMessagePoller {
  return new WeChatMessagePoller(options);
}
