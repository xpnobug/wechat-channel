/**
 * WeChat inbound message handler.
 * 微信入站消息处理器
 *
 * 处理收到的消息并分发到自动回复系统
 */

import type { MoltbotConfig } from "clawdbot/plugin-sdk";
import type { PluginRuntime } from "clawdbot/plugin-sdk";
import type { WeChatInboundMessage } from "./polling.js";
import { sendMessageWeChat } from "./send.js";

/** 入站消息处理依赖 */
export type WeChatInboundHandlerDeps = {
  cfg: MoltbotConfig;        // 配置对象
  runtime: PluginRuntime;    // 插件运行时
  accountId: string;         // 账户 ID
  baseUrl: string;           // API 服务地址
  apiToken: string;          // API Token
  robotId: number;           // 机器人 ID
  allowFrom?: string[];      // 允许的用户列表
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled"; // 访问策略
  requireMention?: boolean;  // 群聊是否需要 @机器人
};

/**
 * Handle inbound WeChat message.
 * 处理入站微信消息
 */
export async function handleWeChatInboundMessage(
  msg: WeChatInboundMessage,
  deps: WeChatInboundHandlerDeps,
): Promise<void> {
  const {
    cfg,
    runtime,
    accountId,
    baseUrl,
    apiToken,
    robotId,
    allowFrom = [],
    dmPolicy = "pairing",
    requireMention = true,
  } = deps;

  // 调试：记录 requireMention 检查
  // Debug: log requireMention check
  if (msg.chatType === "group") {
    console.log(`[WeChat] Group message check: requireMention=${requireMention}, isAtMe=${msg.isAtMe}`);
  }

  // 硬过滤：当 requireMention 为 true 时，跳过群聊中未 @机器人的消息
  // Hard filter: skip group messages without @mention when requireMention is true
  if (msg.chatType === "group" && requireMention && !msg.isAtMe) {
    return;
  }

  // 访问控制检查 - 始终检查发送者的 wxid（不检查群 ID）
  // Access control check - always check sender's wxid (not group id)
  const checkId = msg.senderWxid.toLowerCase();
  const normalizedAllowFrom = allowFrom.map((entry) =>
    entry.replace(/^(wechat|wx):/i, "").toLowerCase(),
  );

  // 检查发送者是否在允许列表中
  // Check if sender is allowed
  const isAllowed =
    dmPolicy === "open" ||
    normalizedAllowFrom.includes(checkId);

  console.log(`[WeChat] Allowlist check: sender=${checkId}, isAllowed=${isAllowed}, dmPolicy=${dmPolicy}`);

  if (!isAllowed && dmPolicy !== "pairing") {
    return;
  }

  // 配对模式：检查发送者是否需要审批
  // For pairing mode, check if sender needs approval
  if (dmPolicy === "pairing" && !normalizedAllowFrom.includes(checkId)) {
    const pairingReply = runtime.channel.pairing.buildPairingReply({
      cfg,
      channel: "wechat",
      senderId: msg.chatType === "group" ? msg.chatId : msg.senderWxid,
      senderName: msg.chatType === "group" ? `Group ${msg.chatId}` : (msg.senderNickname ?? msg.senderWxid),
    });

    if (pairingReply) {
      runtime.channel.pairing.upsertPairingRequest({
        channel: "wechat",
        accountId,
        senderId: msg.chatType === "group" ? msg.chatId : msg.senderWxid,
        senderName: msg.chatType === "group" ? `Group ${msg.chatId}` : msg.senderNickname,
        timestamp: Date.now(),
      });

      await sendMessageWeChat(msg.chatType === "group" ? msg.chatId : msg.senderWxid, pairingReply, {
        baseUrl,
        apiToken,
        robotId,
      });
    }
    return;
  }

  // 记录通道活动
  // Record channel activity
  runtime.channel.activity.record({
    channel: "wechat",
    accountId,
    direction: "inbound",
  });

  // 解析代理路由
  // Resolve agent route
  const route = runtime.channel.routing.resolveAgentRoute({
    cfg,
    channel: "wechat",
    accountId,
    peer: {
      kind: msg.chatType === "group" ? "group" : "dm",
      id: msg.chatType === "group" ? msg.chatId : msg.senderWxid,
    },
  });

  // 构建消息上下文
  // Build message context
  const fromLabel = msg.senderNickname ?? msg.senderWxid;

  const envelopeOptions = runtime.channel.reply.resolveEnvelopeFormatOptions(cfg);

  const body = runtime.channel.reply.formatInboundEnvelope({
    channel: "WeChat",
    from: fromLabel,
    timestamp: msg.timestamp,
    body: msg.body,
    chatType: msg.chatType === "group" ? "group" : "direct",
    sender: { name: msg.senderNickname ?? msg.senderWxid, id: msg.senderWxid },
    envelope: envelopeOptions,
  });

  const replyTo = msg.chatType === "group" ? msg.chatId : msg.senderWxid;
  const wechatTo = msg.chatType === "group" ? `group:${msg.chatId}` : `wechat:${msg.senderWxid}`;

  // 完成入站上下文
  // Finalize inbound context
  const ctxPayload = runtime.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: msg.body,
    CommandBody: msg.body,
    From: wechatTo,
    To: wechatTo,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: msg.chatType === "group" ? "group" : "direct",
    ConversationLabel: fromLabel,
    GroupSubject: msg.chatType === "group" ? msg.chatId : undefined,
    SenderName: msg.senderNickname ?? msg.senderWxid,
    SenderId: msg.senderWxid,
    Provider: "wechat",
    Surface: "wechat",
    MessageSid: msg.id,
    Timestamp: msg.timestamp,
    WasMentioned: msg.isAtMe,
    CommandAuthorized: true,
    OriginatingChannel: "wechat",
    OriginatingTo: wechatTo,
  });

  if (!ctxPayload) {
    return;
  }

  // 创建回复分发器（带打字指示）
  // Create reply dispatcher with proper interface
  const { dispatcher, replyOptions, markDispatchIdle } = runtime.channel.reply.createReplyDispatcherWithTyping({
    deliver: async (payload: { text?: string; body?: string; mediaUrl?: string }) => {
      const text = payload.text ?? payload.body ?? "";
      if (!text.trim()) return;

      const time = new Date().toLocaleTimeString();
      const preview = text.length > 50 ? text.substring(0, 50) + "..." : text;
      console.log(`[WeChat] ${time} Bot: ${preview}`);
      await sendMessageWeChat(replyTo, text, { baseUrl, apiToken, robotId });
    },
    onError: (err: unknown, info: { kind: string }) => {
      console.error(`[WeChat] Reply error (${info.kind}):`, err);
    },
  });

  // 使用完整系统分发回复
  // Dispatch reply using the full system
  try {
    await runtime.channel.reply.dispatchReplyFromConfig({
      ctx: ctxPayload,
      cfg,
      dispatcher,
      replyOptions,
    });
  } catch (error) {
    console.error(`[WeChat] Dispatch error:`, error);
  } finally {
    markDispatchIdle();
  }
}
