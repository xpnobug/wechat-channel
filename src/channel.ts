import type {
  ChannelAccountSnapshot,
  ChannelDock,
  ChannelGatewayContext,
  ChannelPlugin,
  MoltbotConfig,
} from "openclaw/plugin-sdk";
import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId,
  PAIRING_APPROVED_MESSAGE,
  setAccountEnabledInConfigSection,
} from "openclaw/plugin-sdk";

import {
  listWeChatAccountIds,
  resolveDefaultWeChatAccountId,
  resolveWeChatAccount,
  type ResolvedWeChatAccount,
} from "./accounts.js";
import { wechatMessageActions } from "./actions.js";
import { getContactList, getChatRoomList } from "./api.js";
import { WeChatConfigSchema } from "./config-schema.js";
import { handleWeChatInboundMessage } from "./inbound.js";
import { createWeChatPoller } from "./polling.js";
import { probeWeChat } from "./probe.js";
import { getWeChatRuntime } from "./runtime.js";
import { sendMessageWeChat } from "./send.js";
import { collectWeChatStatusIssues } from "./status-issues.js";

const meta = {
  id: "wechat",
  label: "WeChat",
  selectionLabel: "WeChat (Robot Admin)",
  docsPath: "/channels/wechat",
  docsLabel: "wechat",
  blurb: "WeChat messaging via wechat-robot-admin-backend API.",
  aliases: ["wx"],
  order: 85,
  quickstartAllowFrom: true,
};

/**
 * Normalize WeChat messaging target.
 * 标准化微信消息目标
 *
 * 支持格式：wechat:wxid_xxx, wx:wxid_xxx, group:xxx@chatroom
 */
function normalizeWeChatMessagingTarget(raw: string): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  // Strip wechat:, wx:, or group: prefix
  // 移除 wechat:, wx:, 或 group: 前缀
  return trimmed.replace(/^(wechat|wx|group):/i, "");
}

export const wechatDock: ChannelDock = {
  id: "wechat",
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
    blockStreaming: true,
  },
  outbound: { textChunkLimit: 2048 },
  config: {
    resolveAllowFrom: ({ cfg, accountId }) =>
      resolveWeChatAccount({ cfg: cfg as MoltbotConfig, accountId }).config.allowFrom ?? [],
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => entry.replace(/^(wechat|wx):/i, ""))
        .map((entry) => entry.toLowerCase()),
  },
  groups: {
    resolveRequireMention: ({ cfg, accountId }) => {
      const account = resolveWeChatAccount({ cfg: cfg as MoltbotConfig, accountId });
      return account.config.requireMention ?? true;
    },
  },
  threading: {
    resolveReplyToMode: () => "off",
  },
};

export const wechatPlugin: ChannelPlugin<ResolvedWeChatAccount> = {
  id: "wechat",
  meta,
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
    reactions: false,
    threads: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels.wechat"] },
  configSchema: buildChannelConfigSchema(WeChatConfigSchema),
  config: {
    listAccountIds: (cfg) => listWeChatAccountIds(cfg as MoltbotConfig),
    resolveAccount: (cfg, accountId) =>
      resolveWeChatAccount({ cfg: cfg as MoltbotConfig, accountId }),
    defaultAccountId: (cfg) => resolveDefaultWeChatAccountId(cfg as MoltbotConfig),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg: cfg as MoltbotConfig,
        sectionKey: "wechat",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg: cfg as MoltbotConfig,
        sectionKey: "wechat",
        accountId,
        clearBaseFields: ["apiToken", "tokenFile", "name", "baseUrl", "robotId"],
      }),
    isConfigured: (account) => Boolean(account.apiToken?.trim() && account.baseUrl?.trim()),
    describeAccount: (account): ChannelAccountSnapshot => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.apiToken?.trim()),
      tokenSource: account.tokenSource,
      baseUrl: account.baseUrl,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      resolveWeChatAccount({ cfg: cfg as MoltbotConfig, accountId }).config.allowFrom ?? [],
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => entry.replace(/^(wechat|wx):/i, ""))
        .map((entry) => entry.toLowerCase()),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(
        (cfg as MoltbotConfig).channels?.wechat?.accounts?.[resolvedAccountId],
      );
      const basePath = useAccountPath
        ? `channels.wechat.accounts.${resolvedAccountId}.`
        : "channels.wechat.";
      return {
        policy: account.config.dmPolicy ?? "pairing",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: formatPairingApproveHint("wechat"),
        normalizeEntry: (raw) => raw.replace(/^(wechat|wx):/i, ""),
      };
    },
  },
  groups: {
    resolveRequireMention: ({ cfg, accountId }) => {
      const account = resolveWeChatAccount({ cfg: cfg as MoltbotConfig, accountId });
      return account.config.requireMention ?? true;
    },
  },
  threading: {
    resolveReplyToMode: () => "off",
  },
  actions: wechatMessageActions,
  messaging: {
    normalizeTarget: normalizeWeChatMessagingTarget,
    targetResolver: {
      looksLikeId: (raw) => {
        const trimmed = raw.trim();
        if (!trimmed) return false;
        // WeChat IDs: wxid_xxx or chat room IDs ending with @chatroom
        return /^wxid_[a-z0-9]+$/i.test(trimmed) || /@chatroom$/i.test(trimmed);
      },
      hint: "<wxid|chatRoomId>",
    },
  },
  directory: {
    self: async () => null,
    listPeers: async ({ cfg, accountId, query, limit }) => {
      const account = resolveWeChatAccount({ cfg: cfg as MoltbotConfig, accountId });
      if (!account.apiToken) return [];
      try {
        const response = await getContactList(
          {
            baseUrl: account.baseUrl,
            apiToken: account.apiToken,
            robotId: account.robotId,
          },
          "friend",
        );
        const contacts = response.data ?? [];
        const q = query?.trim().toLowerCase() || "";
        return contacts
          .filter(
            (c) =>
              !q ||
              c.nickname?.toLowerCase().includes(q) ||
              c.wechat_id?.toLowerCase().includes(q),
          )
          .slice(0, limit && limit > 0 ? limit : undefined)
          .map((c) => ({ kind: "user" as const, id: c.wechat_id, name: c.nickname }));
      } catch {
        return [];
      }
    },
    listGroups: async ({ cfg, accountId, query, limit }) => {
      const account = resolveWeChatAccount({ cfg: cfg as MoltbotConfig, accountId });
      if (!account.apiToken) return [];
      try {
        const response = await getChatRoomList({
          baseUrl: account.baseUrl,
          apiToken: account.apiToken,
          robotId: account.robotId,
        });
        const rooms = response.data ?? [];
        const q = query?.trim().toLowerCase() || "";
        return rooms
          .filter((r) => !q || r.nickname?.toLowerCase().includes(q))
          .slice(0, limit && limit > 0 ? limit : undefined)
          .map((r) => ({ kind: "group" as const, id: r.wechat_id, name: r.nickname }));
      } catch {
        return [];
      }
    },
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg: cfg as MoltbotConfig,
        channelKey: "wechat",
        accountId,
        name,
      }),
    validateInput: ({ accountId, input }) => {
      if (input.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
        return "WECHAT_API_TOKEN can only be used for the default account.";
      }
      if (!input.useEnv && !input.token && !input.tokenFile) {
        return "WeChat requires apiToken or --token-file (or --use-env).";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const namedConfig = applyAccountNameToChannelSection({
        cfg: cfg as MoltbotConfig,
        channelKey: "wechat",
        accountId,
        name: input.name,
      });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({
              cfg: namedConfig,
              channelKey: "wechat",
            })
          : namedConfig;
      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            wechat: {
              ...next.channels?.wechat,
              enabled: true,
              ...(input.useEnv
                ? {}
                : input.tokenFile
                  ? { tokenFile: input.tokenFile }
                  : input.token
                    ? { apiToken: input.token }
                    : {}),
              ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
              ...(input.robotId ? { robotId: input.robotId } : {}),
            },
          },
        } as MoltbotConfig;
      }
      return {
        ...next,
        channels: {
          ...next.channels,
          wechat: {
            ...next.channels?.wechat,
            enabled: true,
            accounts: {
              ...(next.channels?.wechat?.accounts ?? {}),
              [accountId]: {
                ...(next.channels?.wechat?.accounts?.[accountId] ?? {}),
                enabled: true,
                ...(input.tokenFile
                  ? { tokenFile: input.tokenFile }
                  : input.token
                    ? { apiToken: input.token }
                    : {}),
                ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
                ...(input.robotId ? { robotId: input.robotId } : {}),
              },
            },
          },
        },
      } as MoltbotConfig;
    },
  },
  pairing: {
    idLabel: "wechatUserId",
    normalizeAllowEntry: (entry) => entry.replace(/^(wechat|wx):/i, ""),
    notifyApproval: async ({ cfg, id }) => {
      const account = resolveWeChatAccount({ cfg: cfg as MoltbotConfig });
      if (!account.apiToken) throw new Error("WeChat API token not configured");
      await sendMessageWeChat(id, PAIRING_APPROVED_MESSAGE, {
        baseUrl: account.baseUrl,
        apiToken: account.apiToken,
        robotId: account.robotId,
      });
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => {
      if (!text) return [];
      if (limit <= 0 || text.length <= limit) return [text];
      const chunks: string[] = [];
      let remaining = text;
      while (remaining.length > limit) {
        const window = remaining.slice(0, limit);
        const lastNewline = window.lastIndexOf("\n");
        const lastSpace = window.lastIndexOf(" ");
        let breakIdx = lastNewline > 0 ? lastNewline : lastSpace;
        if (breakIdx <= 0) breakIdx = limit;
        const rawChunk = remaining.slice(0, breakIdx);
        const chunk = rawChunk.trimEnd();
        if (chunk.length > 0) chunks.push(chunk);
        const brokeOnSeparator = breakIdx < remaining.length && /\s/.test(remaining[breakIdx]);
        const nextStart = Math.min(remaining.length, breakIdx + (brokeOnSeparator ? 1 : 0));
        remaining = remaining.slice(nextStart).trimStart();
      }
      if (remaining.length) chunks.push(remaining);
      return chunks;
    },
    chunkerMode: "text",
    textChunkLimit: 2048,
    sendText: async ({ to, text, accountId, cfg }) => {
      const result = await sendMessageWeChat(to, text, {
        accountId: accountId ?? undefined,
        cfg: cfg as MoltbotConfig,
      });
      return {
        channel: "wechat",
        ok: result.ok,
        messageId: result.messageId ?? "",
        error: result.error ? new Error(result.error) : undefined,
      };
    },
    sendMedia: async ({ to, text, mediaUrl, accountId, cfg }) => {
      const result = await sendMessageWeChat(to, text ?? "", {
        accountId: accountId ?? undefined,
        mediaUrl,
        cfg: cfg as MoltbotConfig,
      });
      return {
        channel: "wechat",
        ok: result.ok,
        messageId: result.messageId ?? "",
        error: result.error ? new Error(result.error) : undefined,
      };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: collectWeChatStatusIssues,
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      tokenSource: snapshot.tokenSource ?? "none",
      baseUrl: snapshot.baseUrl ?? null,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ account, timeoutMs }) =>
      probeWeChat(account.baseUrl, account.apiToken, account.robotId, timeoutMs),
    buildAccountSnapshot: ({ account, runtime }) => {
      const configured = Boolean(account.apiToken?.trim() && account.baseUrl?.trim());
      return {
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured,
        tokenSource: account.tokenSource,
        baseUrl: account.baseUrl,
        running: runtime?.running ?? false,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? null,
        lastInboundAt: runtime?.lastInboundAt ?? null,
        lastOutboundAt: runtime?.lastOutboundAt ?? null,
        dmPolicy: account.config.dmPolicy ?? "pairing",
      };
    },
  },
  gateway: {
    startAccount: async (ctx: ChannelGatewayContext<ResolvedWeChatAccount>) => {
      const { cfg, accountId, account, abortSignal, setStatus, getStatus } = ctx;

      console.log(`[WeChat Gateway] startAccount called for ${accountId}`);

      // Check if polling is configured
      const pollingConfig = account.polling ?? account.config.polling;
      console.log(`[WeChat Gateway] pollingConfig:`, pollingConfig);
      if (!pollingConfig?.pollContactIds?.length && !pollingConfig?.pollAllContacts) {
        // No polling configured, skip starting
        console.log(`[WeChat Gateway] No polling configured, skipping`);
        return null;
      }

      if (!account.apiToken) {
        throw new Error("WeChat API token not configured");
      }

      const pluginRuntime = getWeChatRuntime();

      // Create and start the poller
      const poller = createWeChatPoller({
        baseUrl: account.baseUrl,
        apiToken: account.apiToken,
        robotId: account.robotId,
        accountId,
        pollingConfig,
        abortSignal,
        onMessage: async (msg) => {
          try {
            await handleWeChatInboundMessage(msg, {
              cfg,
              runtime: pluginRuntime,
              accountId,
              baseUrl: account.baseUrl,
              apiToken: account.apiToken,
              robotId: account.robotId,
              allowFrom: account.config.allowFrom,
              dmPolicy: account.config.dmPolicy,
              requireMention: account.config.requireMention,
            });

            // Update status with last inbound time
            const status = getStatus();
            setStatus({
              ...status,
              lastInboundAt: new Date().toISOString(),
            });
          } catch (error) {
            const status = getStatus();
            setStatus({
              ...status,
              lastError: error instanceof Error ? error.message : String(error),
            });
          }
        },
        onError: (error) => {
          const status = getStatus();
          setStatus({
            ...status,
            lastError: error.message,
          });
        },
      });

      await poller.start();

      // Update status to running
      setStatus({
        ...getStatus(),
        running: true,
        lastStartAt: new Date().toISOString(),
        lastError: null,
      });

      // Store poller reference for stopAccount
      return poller;
    },
    stopAccount: async (ctx: ChannelGatewayContext<ResolvedWeChatAccount>) => {
      const { setStatus, getStatus } = ctx;
      // The poller is returned from startAccount and passed here
      // But we don't have direct access, so we rely on abortSignal
      setStatus({
        ...getStatus(),
        running: false,
        lastStopAt: new Date().toISOString(),
      });
    },
  },
};
