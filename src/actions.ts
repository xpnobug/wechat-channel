/**
 * WeChat message actions.
 * 微信消息动作处理
 *
 * 提供消息发送等操作的适配器
 */
import type {
  ChannelMessageActionAdapter,
  ChannelMessageActionName,
  MoltbotConfig,
} from "openclaw/plugin-sdk";
import { jsonResult, readStringParam } from "openclaw/plugin-sdk";

import { listEnabledWeChatAccounts } from "./accounts.js";
import { sendMessageWeChat } from "./send.js";

const providerId = "wechat";

/**
 * Get list of enabled WeChat accounts with valid tokens.
 * 获取已启用且有有效 Token 的微信账户列表
 */
function listEnabledAccounts(cfg: MoltbotConfig) {
  return listEnabledWeChatAccounts(cfg).filter(
    (account) => account.enabled && account.tokenSource !== "none",
  );
}

/** 微信消息动作适配器 */
export const wechatMessageActions: ChannelMessageActionAdapter = {
  /**
   * List available actions.
   * 列出可用的动作
   */
  listActions: ({ cfg }) => {
    const accounts = listEnabledAccounts(cfg as MoltbotConfig);
    if (accounts.length === 0) return [];
    const actions = new Set<ChannelMessageActionName>(["send"]);
    return Array.from(actions);
  },

  /** 是否支持按钮（微信不支持） */
  supportsButtons: () => false,

  /**
   * Extract send parameters from tool call.
   * 从工具调用中提取发送参数
   */
  extractToolSend: ({ args }) => {
    const action = typeof args.action === "string" ? args.action.trim() : "";
    if (action !== "sendMessage") return null;
    const to = typeof args.to === "string" ? args.to : undefined;
    if (!to) return null;
    const accountId = typeof args.accountId === "string" ? args.accountId.trim() : undefined;
    return { to, accountId };
  },

  /**
   * Handle message action.
   * 处理消息动作
   */
  handleAction: async ({ action, params, cfg, accountId }) => {
    if (action === "send") {
      const to = readStringParam(params, "to", { required: true });
      const content = readStringParam(params, "message", {
        required: true,
        allowEmpty: true,
      });
      const mediaUrl = readStringParam(params, "media", { trim: false });

      const result = await sendMessageWeChat(to ?? "", content ?? "", {
        accountId: accountId ?? undefined,
        mediaUrl: mediaUrl ?? undefined,
        cfg: cfg as MoltbotConfig,
      });

      if (!result.ok) {
        return jsonResult({
          ok: false,
          error: result.error ?? "Failed to send WeChat message",
        });
      }

      return jsonResult({ ok: true, to, messageId: result.messageId });
    }

    throw new Error(`Action ${action} is not supported for provider ${providerId}.`);
  },
};
