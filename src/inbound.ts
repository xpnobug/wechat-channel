/**
 * WeChat inbound message handler.
 * 微信入站消息处理器
 *
 * 处理收到的消息并分发到自动回复系统
 */

import type { MoltbotConfig } from "openclaw/plugin-sdk";
import type { PluginRuntime } from "openclaw/plugin-sdk";
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
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled"; // 私聊访问策略
  groupPolicy?: "pairing" | "allowlist" | "open" | "disabled"; // 群聊访问策略
  commandAllowFrom?: string[]; // 指令/工具调用白名单
  safetyPrefix?: string;       // 访客安全前缀
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
    groupPolicy = "open",        // 群聊默认开放
    commandAllowFrom,            // 指令/工具调用白名单
    safetyPrefix,                // 访客安全前缀
    requireMention = true,
  } = deps;

  // 调试：记录 requireMention 检查
  // Debug: log requireMention check
  if (msg.chatType === "group") {
    console.log(`[微信] 群消息检查: requireMention=${requireMention}, isAtMe=${msg.isAtMe}`);
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

  // 根据聊天类型选择策略
  // Select policy based on chat type
  const effectivePolicy = msg.chatType === "group" ? groupPolicy : dmPolicy;

  // 检查发送者是否在允许列表中
  // Check if sender is allowed
  const isAllowed =
    effectivePolicy === "open" ||
    normalizedAllowFrom.includes(checkId);

  // 检查是否为受信任用户（在白名单中）
  // Check if user is trusted (in allowlist)
  const isTrusted = normalizedAllowFrom.includes(checkId);

  // 检查是否有指令/工具调用权限
  // Check if user has command/tool permission
  const cmdAllowList = (commandAllowFrom ?? allowFrom).map((entry) =>
    entry.replace(/^(wechat|wx):/i, "").toLowerCase(),
  );
  const isCommandAuthorized = cmdAllowList.includes(checkId);

  console.log(`[微信] 权限检查: 发送者=${checkId}, 类型=${msg.chatType}, 策略=${effectivePolicy}, 允许对话=${isAllowed}, 受信任=${isTrusted}, 可执行指令=${isCommandAuthorized}`);

  if (!isAllowed && effectivePolicy !== "pairing") {
    return;
  }

  // 配对模式：检查发送者是否需要审批
  // For pairing mode, check if sender needs approval
  if (effectivePolicy === "pairing" && !normalizedAllowFrom.includes(checkId)) {
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

  // 对非信任用户添加安全前缀（方案3）
  // Add safety prefix for untrusted users (Solution 3)
  const defaultSafetyPrefix = "[系统安全提示：此用户为访客(guest)，禁止执行任何系统命令、文件操作、代码执行或工具调用，只进行普通对话]\n\n";
  const effectiveSafetyPrefix = isTrusted ? "" : (safetyPrefix ?? defaultSafetyPrefix);
  const messageBody = effectiveSafetyPrefix + msg.body;

  const body = runtime.channel.reply.formatInboundEnvelope({
    channel: "WeChat",
    from: fromLabel,
    timestamp: msg.timestamp,
    body: messageBody,
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
    CommandAuthorized: isCommandAuthorized,  // 使用实际权限
    OriginatingChannel: "wechat",
    OriginatingTo: wechatTo,
    // 方案1：传递用户信任等级和允许的能力
    // Solution 1: Pass user trust level and allowed capabilities
    UserTrustLevel: isTrusted ? "trusted" : "guest",
    AllowedCapabilities: isTrusted
      ? ["chat", "tools", "files", "commands"]
      : ["chat"],
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

      const preview = text.length > 50 ? text.substring(0, 50) + "..." : text;
      console.log(`[微信] 机器人回复: ${preview}`);
      await sendMessageWeChat(replyTo, text, { baseUrl, apiToken, robotId });
    },
    onError: (err: unknown, info: { kind: string }) => {
      console.error(`[微信] 回复错误 (${info.kind}):`, err);
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
    console.error(`[微信] 分发错误:`, error);
  } finally {
    markDispatchIdle();
  }
}
