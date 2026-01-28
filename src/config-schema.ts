/**
 * WeChat channel config schema.
 * 微信通道配置模式定义
 *
 * 使用 Zod 进行配置验证
 */
import { MarkdownConfigSchema } from "clawdbot/plugin-sdk";
import { z } from "zod";

/** 轮询配置模式 */
const pollingConfigSchema = z.object({
  pollingIntervalMs: z.number().int().positive().optional(),   // 轮询间隔（毫秒）
  pollContactIds: z.array(z.string()).optional(),              // 要轮询的联系人 ID 列表
  pollAllContacts: z.boolean().optional(),                     // 是否轮询所有联系人
  maxPollContacts: z.number().int().positive().optional(),     // 最大轮询联系人数
});

/** 微信账户配置模式 */
const wechatAccountSchema = z.object({
  name: z.string().optional(),                                             // 账户显示名称
  enabled: z.boolean().optional(),                                         // 是否启用
  markdown: MarkdownConfigSchema,                                          // Markdown 渲染配置
  baseUrl: z.string().optional(),                                          // API 服务地址
  apiToken: z.string().optional(),                                         // API Token
  tokenFile: z.string().optional(),                                        // Token 文件路径
  robotId: z.number().int().positive().optional(),                         // 机器人 ID
  dmPolicy: z.enum(["pairing", "allowlist", "open", "disabled"]).optional(), // 访问策略
  allowFrom: z.array(z.string()).optional(),                               // 允许的用户列表
  mediaMaxMb: z.number().optional(),                                       // 最大媒体文件大小（MB）
  polling: pollingConfigSchema.optional(),                                 // 轮询配置
});

/** 完整微信配置模式（支持多账户） */
export const WeChatConfigSchema = wechatAccountSchema.extend({
  accounts: z.object({}).catchall(wechatAccountSchema).optional(), // 多账户配置
  defaultAccount: z.string().optional(),                           // 默认账户 ID
});
