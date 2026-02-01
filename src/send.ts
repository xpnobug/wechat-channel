/**
 * WeChat message sending module.
 * 微信消息发送模块
 *
 * 支持发送文本消息、图片消息和语音消息
 */
import * as fs from "node:fs";

import type { MoltbotConfig } from "openclaw/plugin-sdk";

import { sendTextMessage, sendImageMessage, sendVoiceMessage } from "./api.js";
import { resolveWeChatAccount } from "./accounts.js";

/** 发送选项 */
export type WeChatSendOptions = {
  apiToken?: string;    // API Token（可选，优先使用）
  baseUrl?: string;     // API 服务地址（可选，优先使用）
  robotId?: number;     // 机器人 ID（可选，优先使用）
  accountId?: string;   // 账户 ID
  cfg?: MoltbotConfig;  // 配置对象
  mediaUrl?: string;    // 图片 URL（发送图片时使用）
  voiceFilePath?: string; // 语音文件路径（发送语音时使用）
  at?: string[];        // 群聊中 @的用户 wxid 列表
};

/** 发送结果 */
export type WeChatSendResult = {
  ok: boolean;          // 是否成功
  messageId?: string;   // 消息 ID
  error?: string;       // 错误信息
};

/**
 * Resolve send context from options.
 * 从选项中解析发送上下文
 */
function resolveSendContext(options: WeChatSendOptions): {
  baseUrl: string;
  apiToken: string;
  robotId: number;
} {
  // 如果提供了配置对象，从账户解析
  if (options.cfg) {
    const account = resolveWeChatAccount({
      cfg: options.cfg,
      accountId: options.accountId,
    });
    return {
      baseUrl: options.baseUrl ?? account.baseUrl,
      apiToken: options.apiToken ?? account.apiToken,
      robotId: options.robotId ?? account.robotId,
    };
  }

  // 使用直接传入的参数或默认值
  return {
    baseUrl: options.baseUrl ?? "http://localhost:9000",
    apiToken: options.apiToken ?? "",
    robotId: options.robotId ?? 1,
  };
}

/**
 * Send message to WeChat user or group.
 * 发送消息到微信用户或群聊
 *
 * @param toWxid - 目标微信 ID（用户 wxid 或群聊 ID）
 * @param text - 消息文本内容
 * @param options - 发送选项
 */
export async function sendMessageWeChat(
  toWxid: string,
  text: string,
  options: WeChatSendOptions = {},
): Promise<WeChatSendResult> {
  const { baseUrl, apiToken, robotId } = resolveSendContext(options);

  // 检查必要参数
  if (!apiToken) {
    return { ok: false, error: "No WeChat API token configured" };
  }

  if (!toWxid?.trim()) {
    return { ok: false, error: "No to_wxid provided" };
  }

  // 发送语音（如果提供了 voiceFilePath）
  if (options.voiceFilePath) {
    try {
      // 读取语音文件
      const voiceData = await fs.promises.readFile(options.voiceFilePath);
      // 从路径中提取文件名
      const filename = options.voiceFilePath.split("/").pop() ?? "voice.mp3";
      const response = await sendVoiceMessage(
        { baseUrl, apiToken, robotId },
        { to_wxid: toWxid.trim(), voiceData, filename },
      );
      // 如果同时有文本，单独发送
      if (text?.trim()) {
        await sendTextMessage(
          { baseUrl, apiToken, robotId },
          { to_wxid: toWxid.trim(), content: text, at: options.at },
        );
      }
      return { ok: true, messageId: response.data?.message_id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // 发送图片（如果提供了 mediaUrl）
  if (options.mediaUrl) {
    try {
      const response = await sendImageMessage(
        { baseUrl, apiToken, robotId },
        { to_wxid: toWxid.trim(), image_url: options.mediaUrl },
      );
      // 如果同时有文本，单独发送
      if (text?.trim()) {
        await sendTextMessage(
          { baseUrl, apiToken, robotId },
          { to_wxid: toWxid.trim(), content: text, at: options.at },
        );
      }
      return { ok: true, messageId: response.data?.message_id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // 发送文本消息
  if (!text?.trim()) {
    return { ok: false, error: "No message content provided" };
  }

  try {
    const response = await sendTextMessage(
      { baseUrl, apiToken, robotId },
      { to_wxid: toWxid.trim(), content: text, at: options.at },
    );
    return { ok: true, messageId: response.data?.message_id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
