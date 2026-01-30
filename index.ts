/**
 * WeChat channel plugin entry point.
 * 微信通道插件入口文件
 */
import type { MoltbotPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

import { wechatDock, wechatPlugin } from "./src/channel.js";
import { setWeChatRuntime } from "./src/runtime.js";

/**
 * WeChat plugin definition.
 * 微信插件定义
 */
const plugin = {
  id: "wechat",
  name: "WeChat",
  description: "WeChat channel plugin (via wechat-robot-admin-backend)",
  configSchema: emptyPluginConfigSchema(),
  /**
   * Register the plugin with the Moltbot API.
   * 向 Moltbot API 注册插件
   */
  register(api: MoltbotPluginApi) {
    setWeChatRuntime(api.runtime);
    api.registerChannel({ plugin: wechatPlugin, dock: wechatDock });
  },
};

export default plugin;
