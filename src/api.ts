/**
 * WeChat Robot Admin Backend API client.
 * 微信机器人后台 API 客户端
 * @see wechat-robot-admin-backend documentation
 */

import type {
  WeChatApiResponse,
  WeChatContact,
  WeChatChatRoom,
  WeChatRobotInfo,
  WeChatRobotState,
  WeChatSendMessageResult,
  WeChatChatHistoryItem,
} from "./types.js";

/** 默认超时时间（毫秒） */
const DEFAULT_TIMEOUT_MS = 10000;

export type WeChatFetch = (input: string, init?: RequestInit) => Promise<Response>;

/** API 调用错误 */
export class WeChatApiError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly response?: string,
  ) {
    super(message);
    this.name = "WeChatApiError";
  }
}

/** API 调用参数 */
export type WeChatApiCallOptions = {
  baseUrl: string;      // API 服务地址
  apiToken: string;     // API 访问令牌
  robotId: number;      // 机器人 ID
  timeoutMs?: number;   // 超时时间（毫秒）
  fetch?: WeChatFetch;  // 自定义 fetch 函数
};

/**
 * Generic API call helper.
 * 通用 API 调用辅助函数
 */
async function callApi<T = unknown>(
  method: "GET" | "POST" | "DELETE",
  endpoint: string,
  options: WeChatApiCallOptions,
  body?: Record<string, unknown>,
): Promise<WeChatApiResponse<T>> {
  const { baseUrl, apiToken, robotId, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const url = new URL(endpoint, baseUrl);
  url.searchParams.set("id", String(robotId));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const fetcher = options.fetch ?? fetch;

  try {
    const response = await fetcher(url.toString(), {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const data = (await response.json()) as WeChatApiResponse<T>;

    if (data.code !== 200) {
      throw new WeChatApiError(
        data.message ?? `API error: ${endpoint}`,
        data.code,
        JSON.stringify(data),
      );
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get robot state/status.
 * 获取机器人状态
 */
export async function getRobotState(
  options: WeChatApiCallOptions,
): Promise<WeChatApiResponse<WeChatRobotState>> {
  return callApi<WeChatRobotState>("GET", "/api/v1/robot/state", options);
}

/**
 * Get robot info including wechat_id.
 * 获取机器人信息（包含微信 ID）
 */
export async function getRobotInfo(
  options: WeChatApiCallOptions,
): Promise<WeChatApiResponse<WeChatRobotInfo>> {
  return callApi<WeChatRobotInfo>("GET", "/api/v1/robot/view", options);
}

/**
 * Send text message.
 * 发送文本消息
 */
export async function sendTextMessage(
  options: WeChatApiCallOptions,
  params: { to_wxid: string; content: string; at?: string[] },
): Promise<WeChatApiResponse<WeChatSendMessageResult>> {
  return callApi<WeChatSendMessageResult>("POST", "/api/v1/message/send/text", options, {
    id: options.robotId,
    ...params,
  });
}

/**
 * Send image message (URL-based for phase 1).
 * 发送图片消息（URL 方式）
 */
export async function sendImageMessage(
  options: WeChatApiCallOptions,
  params: { to_wxid: string; image_url: string },
): Promise<WeChatApiResponse<WeChatSendMessageResult>> {
  // Note: wechat-robot-admin-backend uses multipart/form-data for image upload.
  // 注意：后端使用 multipart/form-data 上传图片，此处使用 URL 方式
  // For phase 1, we attempt to send image URL if the backend supports it.
  // If not supported, this will need to be updated to use multipart upload.
  return callApi<WeChatSendMessageResult>("POST", "/api/v1/message/send/image", options, {
    id: options.robotId,
    ...params,
  });
}

/**
 * Send voice message (multipart/form-data upload).
 * 发送语音消息（表单上传方式）
 *
 * @param options API 调用选项
 * @param params.to_wxid 接收者 wxid
 * @param params.voiceData 语音文件二进制数据
 * @param params.filename 文件名（可选，默认 voice.mp3）
 */
export async function sendVoiceMessage(
  options: WeChatApiCallOptions,
  params: { to_wxid: string; voiceData: Buffer | Uint8Array; filename?: string },
): Promise<WeChatApiResponse<WeChatSendMessageResult>> {
  const { baseUrl, apiToken, robotId, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const url = new URL("/api/v1/message/send/voice", baseUrl);
  url.searchParams.set("id", String(robotId));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const fetcher = options.fetch ?? fetch;

  try {
    // 构建 multipart/form-data
    const formData = new FormData();
    formData.append("id", String(robotId));
    formData.append("to_wxid", params.to_wxid);

    // 创建 Blob 并添加到表单
    const blob = new Blob([params.voiceData], { type: "audio/mpeg" });
    formData.append("voice", blob, params.filename ?? "voice.mp3");

    const response = await fetcher(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        // 不设置 Content-Type，让 fetch 自动设置 multipart/form-data 边界
      },
      body: formData,
      signal: controller.signal,
    });

    const data = (await response.json()) as WeChatApiResponse<WeChatSendMessageResult>;

    if (data.code !== 200) {
      throw new WeChatApiError(
        data.message ?? "Failed to send voice message",
        data.code,
        JSON.stringify(data),
      );
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get contact list (friends or chat rooms).
 * 获取联系人列表（好友或群聊）
 */
export async function getContactList(
  options: WeChatApiCallOptions,
  type: "friend" | "chat_room" = "friend",
): Promise<WeChatApiResponse<WeChatContact[]>> {
  const { baseUrl, apiToken, robotId, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const url = new URL("/api/v1/contact/list", baseUrl);
  url.searchParams.set("id", String(robotId));
  url.searchParams.set("type", type);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const fetcher = options.fetch ?? fetch;

  try {
    const response = await fetcher(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      signal: controller.signal,
    });

    const data = (await response.json()) as WeChatApiResponse<WeChatContact[]>;

    if (data.code !== 200) {
      throw new WeChatApiError(
        data.message ?? "Failed to get contact list",
        data.code,
        JSON.stringify(data),
      );
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get chat room list.
 * 获取群聊列表
 */
export async function getChatRoomList(
  options: WeChatApiCallOptions,
): Promise<WeChatApiResponse<WeChatChatRoom[]>> {
  return getContactList(options, "chat_room") as Promise<WeChatApiResponse<WeChatChatRoom[]>>;
}

/**
 * Get chat room members.
 * 获取群成员列表
 */
export async function getChatRoomMembers(
  options: WeChatApiCallOptions,
  chatRoomId: string,
): Promise<WeChatApiResponse<WeChatContact[]>> {
  const { baseUrl, apiToken, robotId, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const url = new URL("/api/v1/chat-room/members", baseUrl);
  url.searchParams.set("id", String(robotId));
  url.searchParams.set("chat_room_id", chatRoomId);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const fetcher = options.fetch ?? fetch;

  try {
    const response = await fetcher(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      signal: controller.signal,
    });

    const data = (await response.json()) as WeChatApiResponse<WeChatContact[]>;

    if (data.code !== 200) {
      throw new WeChatApiError(
        data.message ?? "Failed to get chat room members",
        data.code,
        JSON.stringify(data),
      );
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** 聊天记录查询参数 */
export type GetChatHistoryOptions = WeChatApiCallOptions & {
  contactId: string;    // 联系人 ID（好友 wxid 或群聊 ID）
  keyword?: string;     // 搜索关键词
  pageIndex?: number;   // 页码（从 1 开始）
  pageSize?: number;    // 每页数量
};

/**
 * Get chat history for a contact.
 * 获取与联系人的聊天记录
 */
export async function getChatHistory(
  options: GetChatHistoryOptions,
): Promise<WeChatApiResponse<{ items: WeChatChatHistoryItem[]; total: number }>> {
  const {
    baseUrl,
    apiToken,
    robotId,
    contactId,
    keyword,
    pageIndex = 1,
    pageSize = 20,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;
  const url = new URL("/api/v1/chat/history", baseUrl);
  url.searchParams.set("id", String(robotId));
  url.searchParams.set("contact_id", contactId);
  if (keyword) url.searchParams.set("keyword", keyword);
  url.searchParams.set("page_index", String(pageIndex));
  url.searchParams.set("page_size", String(pageSize));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const fetcher = options.fetch ?? fetch;

  try {
    const response = await fetcher(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      signal: controller.signal,
    });

    const data = (await response.json()) as WeChatApiResponse<{
      items: WeChatChatHistoryItem[];
      total: number;
    }>;

    if (data.code !== 200) {
      throw new WeChatApiError(
        data.message ?? "Failed to get chat history",
        data.code,
        JSON.stringify(data),
      );
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}
