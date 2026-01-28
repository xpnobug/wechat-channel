# WeChat 通道插件

通过 wechat-robot-admin-backend API 实现微信消息发送和接收功能。

## 功能特性

- ✅ 发送文本消息
- ✅ 发送图片消息（URL）
- ✅ 群组和好友目录查询
- ✅ 多账户支持
- ✅ 健康检查探测
- ✅ 消息接收（轮询模式）

## 前置要求

1. 部署运行 [wechat-robot-admin-backend](https://github.com/user/wechat-robot-admin-backend)
2. 获取 API Token（在后端管理界面创建）
3. 记录 Robot ID（机器人实例 ID）

## 配置

在 `~/.clawdbot/config.yaml` 中添加：

```yaml
channels:
  wechat:
    enabled: true
    baseUrl: "http://localhost:9000"  # wechat-robot-admin-backend 地址
    apiToken: "your-api-token"        # API Token
    robotId: 1                        # 机器人 ID
    dmPolicy: "pairing"               # DM 策略: pairing | allowlist | open | disabled
    allowFrom:                        # 允许的用户 ID 列表
      - "wxid_abc123"
```

### 消息接收配置

要启用消息接收功能，需要配置轮询参数：

```yaml
channels:
  wechat:
    enabled: true
    baseUrl: "http://localhost:9000"
    apiToken: "your-api-token"
    robotId: 1
    polling:
      pollingIntervalMs: 3000         # 轮询间隔（毫秒），默认 3000
      pollContactIds:                 # 要轮询的联系人 ID 列表
        - "wxid_friend1"
        - "12345678@chatroom"
      # 或者使用自动轮询所有联系人
      # pollAllContacts: true
      # maxPollContacts: 50           # 最大轮询联系人数，默认 50
```

### 多账户配置

```yaml
channels:
  wechat:
    enabled: true
    # 默认账户
    baseUrl: "http://localhost:9000"
    apiToken: "default-token"
    robotId: 1

    # 其他账户
    accounts:
      work:
        baseUrl: "http://work-server:9000"
        apiToken: "work-token"
        robotId: 2
      personal:
        baseUrl: "http://personal-server:9000"
        apiToken: "personal-token"
        robotId: 3

    defaultAccount: "default"  # 可选，指定默认账户
```

### 使用 Token 文件

```yaml
channels:
  wechat:
    enabled: true
    baseUrl: "http://localhost:9000"
    tokenFile: "/path/to/wechat-token.txt"  # 从文件读取 Token
    robotId: 1
```

### 使用环境变量

```bash
export WECHAT_API_TOKEN="your-api-token"
```

```yaml
channels:
  wechat:
    enabled: true
    baseUrl: "http://localhost:9000"
    robotId: 1
    # 不配置 apiToken/tokenFile，将自动使用环境变量
```

## 使用方法

### 查看状态

```bash
clawdbot channels status --probe
```

### 发送消息

```bash
# 发送给个人
clawdbot message send --channel wechat --to wxid_xxx "你好"

# 发送给群聊
clawdbot message send --channel wechat --to 12345678@chatroom "大家好"

# 指定账户发送
clawdbot message send --channel wechat --account work --to wxid_xxx "工作消息"
```

### 查看联系人

```bash
# 列出好友
clawdbot directory list --channel wechat --type peers

# 列出群聊
clawdbot directory list --channel wechat --type groups
```

## DM 策略说明

| 策略 | 说明 |
|------|------|
| `pairing` | 默认策略，新用户需要配对审批 |
| `allowlist` | 仅允许 `allowFrom` 列表中的用户 |
| `open` | 允许所有用户（不推荐） |
| `disabled` | 禁用私聊功能 |

## 微信 ID 格式

| 类型 | 格式 | 示例 |
|------|------|------|
| 个人用户 | `wxid_xxx` | `wxid_abc123def456` |
| 群聊 | `数字@chatroom` | `12345678901@chatroom` |

## 完整配置示例

```json
{
  "channels": {
    "wechat": {
      "enabled": true,
      "baseUrl": "https://xxx.com",
      "apiToken": "ae3d7737-6eeb-48d0-b40c-339a1be8d4bf",
      "robotId": 5,
      "dmPolicy": "allowlist",
      "requireMention": false,
      "allowFrom": [
        "wxid_1kbur705rdkt722"
      ],
      "polling": {
        "pollingIntervalMs": 3000,
        "pollContactIds": [
          "571991817065@chatroom"
        ]
      }
    }
  }
}
```

## 配置字段详解

### 基础配置

| 字段 | 类型 | 必填 | 默认值 | 说明                                                       |
|------|------|------|--------|----------------------------------------------------------|
| `enabled` | boolean | 否 | `true` | 是否启用微信通道。设为 `false` 可临时禁用而不删除配置                          |
| `baseUrl` | string | 是 | - | wechat-robot-admin-backend API 服务地址，例如 `https://xxx.com` |
| `apiToken` | string | 是* | - | API 访问令牌，从后端管理界面获取                                       |
| `tokenFile` | string | 是* | - | Token 文件路径，从文件读取 API Token                               |
| `robotId` | number | 否 | `1` | 机器人实例 ID，在后端管理界面查看                                       |
| `name` | string | 否 | - | 账户显示名称，用于 CLI/UI 列表展示                                    |

> *`apiToken` 和 `tokenFile` 二选一，或使用环境变量 `WECHAT_API_TOKEN`

### 访问控制配置

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `dmPolicy` | string | 否 | `"pairing"` | 消息访问策略，控制谁可以与机器人对话 |
| `allowFrom` | string[] | 否 | `[]` | 允许的用户微信 ID 列表（wxid_xxx 格式） |
| `requireMention` | boolean | 否 | `true` | 群聊中是否需要 @机器人才回复。`true`: 仅回复 @机器人的消息；`false`: 回复所有消息 |

#### dmPolicy 策略说明

| 策略值 | 说明 | 适用场景 |
|--------|------|----------|
| `"pairing"` | 新用户需要配对审批后才能对话 | 默认策略，适合需要审核的场景 |
| `"allowlist"` | 仅允许 `allowFrom` 列表中的用户对话 | 限制特定用户使用 |
| `"open"` | 允许所有用户对话（不推荐） | 公开服务场景 |
| `"disabled"` | 禁用消息响应功能 | 仅用于发送消息，不接收 |

#### allowFrom 配置说明

- 填写用户的微信 ID（wxid_xxx 格式）
- 群聊和私聊都检查发送者的 wxid
- 示例：`["wxid_abc123", "wxid_def456"]`

### 消息接收配置 (polling)

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `pollingIntervalMs` | number | 否 | `3000` | 轮询间隔（毫秒）。推荐 1000-5000，值越小响应越快但 API 调用越频繁 |
| `pollContactIds` | string[] | 否 | `[]` | 要轮询的联系人 ID 列表。支持好友 wxid 和群聊 ID（xxx@chatroom） |
| `pollAllContacts` | boolean | 否 | `false` | 是否自动轮询所有联系人。启用后会自动获取好友和群聊列表 |
| `maxPollContacts` | number | 否 | `50` | 启用 `pollAllContacts` 时，最大轮询联系人数量 |

#### polling 配置示例

**方式一：指定联系人轮询**
```json
"polling": {
  "pollingIntervalMs": 3000,
  "pollContactIds": [
    "wxid_friend1",
    "57199817065@chatroom"
  ]
}
```

**方式二：自动轮询所有联系人**
```json
"polling": {
  "pollingIntervalMs": 5000,
  "pollAllContacts": true,
  "maxPollContacts": 30
}
```

## 常见问题

### Q: 连接失败，提示 "No API token provided"
确保配置了 `apiToken`、`tokenFile` 或环境变量 `WECHAT_API_TOKEN`。

### Q: 发送消息失败，提示 "Robot is offline"
检查 wechat-robot-admin-backend 中的机器人是否在线登录。

### Q: 如何接收消息？
配置 `polling` 参数启用消息接收。有两种方式：
1. 指定 `pollContactIds` 列表，仅轮询特定联系人
2. 设置 `pollAllContacts: true`，自动轮询所有联系人（最多 `maxPollContacts` 个）

### Q: 轮询间隔设置多少合适？
默认 3000ms (3秒) 是一个平衡实时性和服务器负载的推荐值。如果需要更快响应可以降低到 1000ms，但会增加 API 调用频率。

## 相关链接

- [wechat-robot-admin-backend API 文档](../../../wxchat/wechat-robot-admin-backend/README.md)
- [Clawdbot 通道配置文档](https://docs.clawd.bot/channels)
