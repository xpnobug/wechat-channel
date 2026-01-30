/**
 * WeChat API token resolution.
 * 微信 API Token 解析模块
 *
 * Token 来源优先级：
 * 1. 账户配置中的 apiToken
 * 2. 账户配置中的 tokenFile（从文件读取）
 * 3. 基础配置中的 apiToken（仅默认账户）
 * 4. 基础配置中的 tokenFile（仅默认账户）
 * 5. 环境变量 WECHAT_API_TOKEN（仅默认账户）
 */
import { readFileSync } from "node:fs";

import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";

import type { WeChatConfig } from "./types.js";

/** Token 解析结果 */
export type WeChatTokenResolution = {
  token: string;
  source: "env" | "config" | "configFile" | "none";
};

/**
 * Resolve WeChat API token from config or environment.
 * 从配置或环境变量解析微信 API Token
 */
export function resolveWeChatToken(
  config: WeChatConfig | undefined,
  accountId?: string | null,
): WeChatTokenResolution {
  const resolvedAccountId = accountId ?? DEFAULT_ACCOUNT_ID;
  const isDefaultAccount = resolvedAccountId === DEFAULT_ACCOUNT_ID;
  const baseConfig = config;
  const accountConfig =
    resolvedAccountId !== DEFAULT_ACCOUNT_ID
      ? (baseConfig?.accounts?.[resolvedAccountId] as WeChatConfig | undefined)
      : undefined;

  // 优先检查账户特定配置
  // Check account-specific config first
  if (accountConfig) {
    const token = accountConfig.apiToken?.trim();
    if (token) return { token, source: "config" };
    const tokenFile = accountConfig.tokenFile?.trim();
    if (tokenFile) {
      try {
        const fileToken = readFileSync(tokenFile, "utf8").trim();
        if (fileToken) return { token: fileToken, source: "configFile" };
      } catch {
        // 忽略文件读取错误
        // ignore read failures
      }
    }
  }

  // 默认账户检查基础配置
  // Check base config for default account
  if (isDefaultAccount) {
    const token = baseConfig?.apiToken?.trim();
    if (token) return { token, source: "config" };
    const tokenFile = baseConfig?.tokenFile?.trim();
    if (tokenFile) {
      try {
        const fileToken = readFileSync(tokenFile, "utf8").trim();
        if (fileToken) return { token: fileToken, source: "configFile" };
      } catch {
        // 忽略文件读取错误
        // ignore read failures
      }
    }
    // 检查环境变量
    // Check environment variable
    const envToken = process.env.WECHAT_API_TOKEN?.trim();
    if (envToken) return { token: envToken, source: "env" };
  }

  return { token: "", source: "none" };
}
