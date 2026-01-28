/**
 * WeChat account resolution module.
 * 微信账户解析模块
 *
 * 支持多账户配置，解析账户 ID、Token、API 地址等信息
 */
import type { MoltbotConfig } from "clawdbot/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "clawdbot/plugin-sdk";

import type { ResolvedWeChatAccount, WeChatAccountConfig, WeChatConfig } from "./types.js";
import { resolveWeChatToken } from "./token.js";

/** 默认 API 地址 */
const DEFAULT_BASE_URL = "http://localhost:9000";
/** 默认机器人 ID */
const DEFAULT_ROBOT_ID = 1;

/**
 * List configured account IDs from config.
 * 从配置中列出已配置的账户 ID
 */
function listConfiguredAccountIds(cfg: MoltbotConfig): string[] {
  const accounts = (cfg.channels?.wechat as WeChatConfig | undefined)?.accounts;
  if (!accounts || typeof accounts !== "object") return [];
  return Object.keys(accounts).filter(Boolean);
}

/**
 * List all WeChat account IDs.
 * 列出所有微信账户 ID
 */
export function listWeChatAccountIds(cfg: MoltbotConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  // 如果没有配置任何账户，返回默认账户
  if (ids.length === 0) return [DEFAULT_ACCOUNT_ID];
  return ids.sort((a, b) => a.localeCompare(b));
}

/**
 * Resolve the default WeChat account ID.
 * 解析默认微信账户 ID
 */
export function resolveDefaultWeChatAccountId(cfg: MoltbotConfig): string {
  const wechatConfig = cfg.channels?.wechat as WeChatConfig | undefined;
  // 优先使用配置中指定的默认账户
  if (wechatConfig?.defaultAccount?.trim()) return wechatConfig.defaultAccount.trim();
  const ids = listWeChatAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) return DEFAULT_ACCOUNT_ID;
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

/**
 * Resolve account config by ID.
 * 根据 ID 解析账户配置
 */
function resolveAccountConfig(
  cfg: MoltbotConfig,
  accountId: string,
): WeChatAccountConfig | undefined {
  const accounts = (cfg.channels?.wechat as WeChatConfig | undefined)?.accounts;
  if (!accounts || typeof accounts !== "object") return undefined;
  return accounts[accountId] as WeChatAccountConfig | undefined;
}

/**
 * Merge base config with account-specific config.
 * 合并基础配置和账户特定配置
 */
function mergeWeChatAccountConfig(cfg: MoltbotConfig, accountId: string): WeChatAccountConfig {
  const raw = (cfg.channels?.wechat ?? {}) as WeChatConfig;
  const { accounts: _ignored, defaultAccount: _ignored2, ...base } = raw;
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  // 账户配置覆盖基础配置
  return { ...base, ...account };
}

/**
 * Resolve WeChat account with all settings.
 * 解析微信账户的完整设置
 */
export function resolveWeChatAccount(params: {
  cfg: MoltbotConfig;
  accountId?: string | null;
}): ResolvedWeChatAccount {
  const accountId = normalizeAccountId(params.accountId);
  const baseEnabled = (params.cfg.channels?.wechat as WeChatConfig | undefined)?.enabled !== false;
  const merged = mergeWeChatAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  // 账户启用需要基础配置和账户配置都启用
  const enabled = baseEnabled && accountEnabled;
  const tokenResolution = resolveWeChatToken(
    params.cfg.channels?.wechat as WeChatConfig | undefined,
    accountId,
  );

  return {
    accountId,
    name: merged.name?.trim() || undefined,
    enabled,
    baseUrl: merged.baseUrl?.trim() || DEFAULT_BASE_URL,
    apiToken: tokenResolution.token,
    tokenSource: tokenResolution.source,
    robotId: merged.robotId ?? DEFAULT_ROBOT_ID,
    config: merged,
    polling: merged.polling,
  };
}

/**
 * List all enabled WeChat accounts.
 * 列出所有已启用的微信账户
 */
export function listEnabledWeChatAccounts(cfg: MoltbotConfig): ResolvedWeChatAccount[] {
  return listWeChatAccountIds(cfg)
    .map((accountId) => resolveWeChatAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}
