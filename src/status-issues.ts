/**
 * WeChat status issues collector.
 * 微信状态问题收集器
 *
 * 检测并报告配置问题，如 dmPolicy 设为 "open" 等安全风险
 */
import type { ChannelAccountSnapshot, ChannelStatusIssue } from "openclaw/plugin-sdk";

/** 微信账户状态类型 */
type WeChatAccountStatus = {
  accountId?: unknown;
  enabled?: unknown;
  configured?: unknown;
  dmPolicy?: unknown;
};

/** 检查是否为对象 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object");

/** 转换为字符串 */
const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined;

/**
 * Read WeChat account status from snapshot.
 * 从快照读取微信账户状态
 */
function readWeChatAccountStatus(value: ChannelAccountSnapshot): WeChatAccountStatus | null {
  if (!isRecord(value)) return null;
  return {
    accountId: value.accountId,
    enabled: value.enabled,
    configured: value.configured,
    dmPolicy: value.dmPolicy,
  };
}

/**
 * Collect status issues for WeChat accounts.
 * 收集微信账户的状态问题
 */
export function collectWeChatStatusIssues(
  accounts: ChannelAccountSnapshot[],
): ChannelStatusIssue[] {
  const issues: ChannelStatusIssue[] = [];
  for (const entry of accounts) {
    const account = readWeChatAccountStatus(entry);
    if (!account) continue;
    const accountId = asString(account.accountId) ?? "default";
    const enabled = account.enabled !== false;
    const configured = account.configured === true;
    if (!enabled || !configured) continue;

    // 警告：dmPolicy 设为 "open" 存在安全风险
    if (account.dmPolicy === "open") {
      issues.push({
        channel: "wechat",
        accountId,
        kind: "config",
        message:
          'WeChat dmPolicy is "open", allowing any user to message the bot without pairing.',
        fix: 'Set channels.wechat.dmPolicy to "pairing" or "allowlist" to restrict access.',
      });
    }
  }
  return issues;
}
