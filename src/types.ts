/**
 * WeChat channel plugin type definitions.
 * 微信通道插件类型定义
 */

/** 微信账户配置 */
export type WeChatAccountConfig = {
  /** 账户显示名称（用于 CLI/UI 列表展示） */
  name?: string;
  /** 是否启用此账户，默认 true */
  enabled?: boolean;
  /** API 服务地址（例如 "http://localhost:9000"） */
  baseUrl?: string;
  /** API 访问令牌 */
  apiToken?: string;
  /** Token 文件路径（从文件读取 API Token） */
  tokenFile?: string;
  /** 机器人实例 ID */
  robotId?: number;
  /** 消息访问策略，默认 pairing */
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  /** 允许的用户微信 ID 列表（wxid_xxx 格式） */
  allowFrom?: string[];
  /** 最大媒体文件大小（MB） */
  mediaMaxMb?: number;
  /** 群聊中是否需要 @机器人才回复，默认 true */
  requireMention?: boolean;
  /** 消息接收轮询配置 */
  polling?: WeChatPollingConfig;
};

/** 完整微信配置（支持多账户） */
export type WeChatConfig = {
  /** 多账户配置 */
  accounts?: Record<string, WeChatAccountConfig>;
  /** 默认账户 ID */
  defaultAccount?: string;
} & WeChatAccountConfig;

/** Token 来源类型 */
export type WeChatTokenSource = "env" | "config" | "configFile" | "none";

/** 解析后的微信账户 */
export type ResolvedWeChatAccount = {
  accountId: string;              // 账户 ID
  name?: string;                  // 显示名称
  enabled: boolean;               // 是否启用
  baseUrl: string;                // API 服务地址
  apiToken: string;               // API Token
  tokenSource: WeChatTokenSource; // Token 来源
  robotId: number;                // 机器人 ID
  config: WeChatAccountConfig;    // 原始配置
  polling?: WeChatPollingConfig;  // 轮询配置
};

// ============================================
// API 响应类型（来自 wechat-robot-admin-backend）
// ============================================

/** API 响应通用格式 */
export type WeChatApiResponse<T = unknown> = {
  code: number;      // 状态码（200 表示成功）
  message: string;   // 响应消息
  data?: T;          // 响应数据
};

/** 机器人信息 */
export type WeChatRobotInfo = {
  id: number;           // 机器人 ID
  robot_code: string;   // 机器人编码
  owner: string;        // 所有者
  status: string;       // 状态
  wechat_id?: string;   // 微信 ID
  nickname?: string;    // 昵称
};

/** 机器人状态 */
export type WeChatRobotState = {
  status: "online" | "offline";  // 在线状态
  last_heartbeat?: number;       // 最后心跳时间
};

/** 联系人信息 */
export type WeChatContact = {
  id: number;                      // 数据库 ID
  wechat_id: string;               // 微信 ID
  alias?: string;                  // 别名
  nickname: string;                // 昵称
  avatar?: string;                 // 头像 URL
  type: "friend" | "chat_room";   // 类型：好友或群聊
  remark?: string;                 // 备注名
};

/** 群聊信息 */
export type WeChatChatRoom = {
  id: number;               // 数据库 ID
  wechat_id: string;        // 群聊 ID（xxx@chatroom）
  nickname: string;         // 群名称
  avatar?: string;          // 群头像 URL
  chat_room_owner?: string; // 群主 wxid
};

/** 发送消息结果 */
export type WeChatSendMessageResult = {
  message_id?: string;  // 消息 ID
};

// ============================================
// 聊天记录类型
// ============================================

/**
 * 消息类型枚举
 * @see https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Receiving_standard_messages.html
 */
export type WeChatMessageType =
  | 1     // 文本消息
  | 3     // 图片消息
  | 34    // 语音消息
  | 37    // 好友验证
  | 40    // 可能认识的人
  | 42    // 名片分享
  | 43    // 视频消息
  | 47    // 表情消息
  | 48    // 位置消息
  | 49    // 应用消息（链接、文件等）
  | 50    // 语音通话
  | 51    // 初始化
  | 52    // 通话通知
  | 53    // 通话邀请
  | 62    // 小视频
  | 9999  // 未知类型
  | 10000 // 系统消息
  | 10002;// 撤回消息

/** 应用消息子类型 */
export type WeChatAppMessageType =
  | 1     // 文本
  | 2     // 图片
  | 3     // 音频
  | 4     // 视频
  | 5     // 链接（文章）
  | 6     // 文件
  | 8     // 表情
  | 17    // 实时位置共享
  | 57    // 引用回复
  | 2000  // 转账
  | 2001; // 红包

/** 聊天记录项 */
export type WeChatChatHistoryItem = {
  id: number;                       // 数据库 ID
  msg_id: number;                   // 消息 ID
  client_msg_id: number;            // 客户端消息 ID
  is_chat_room: boolean;            // 是否群聊消息
  is_atme: boolean;                 // 是否 @了我
  is_recalled: boolean;             // 是否已撤回
  type: WeChatMessageType;          // 消息类型
  app_msg_type?: WeChatAppMessageType; // 应用消息子类型
  content: string;                  // 消息内容
  display_full_content?: string;    // 显示内容（处理后）
  message_source?: string;          // 消息来源（robot/user）
  from_wxid: string;                // 发送者 wxid
  sender_wxid: string;              // 实际发送者 wxid（群聊中）
  to_wxid: string;                  // 接收者 wxid
  attachment_url?: string;          // 附件 URL
  created_at: number;               // 创建时间（Unix 时间戳）
  updated_at: number;               // 更新时间（Unix 时间戳）
  sender_nickname?: string;         // 发送者昵称
  sender_avatar?: string;           // 发送者头像 URL
};

/** 聊天记录响应 */
export type WeChatChatHistoryResponse = {
  items: WeChatChatHistoryItem[];  // 消息列表
  total: number;                   // 总数
};

/** 轮询配置 */
export type WeChatPollingConfig = {
  /** 轮询间隔（毫秒），默认 3000 */
  pollingIntervalMs?: number;
  /** 要轮询的联系人 ID 列表（好友 wxid 或群聊 ID） */
  pollContactIds?: string[];
  /** 是否轮询所有联系人，默认 false */
  pollAllContacts?: boolean;
  /** 最大轮询联系人数（pollAllContacts 为 true 时生效），默认 50 */
  maxPollContacts?: number;
};
