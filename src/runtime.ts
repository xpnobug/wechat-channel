/**
 * WeChat plugin runtime singleton.
 * 微信插件运行时单例
 *
 * 用于在插件的各个模块之间共享 PluginRuntime 实例
 */
import type { PluginRuntime } from "clawdbot/plugin-sdk";

/** 运行时实例 */
let runtime: PluginRuntime | null = null;

/**
 * Set the WeChat plugin runtime.
 * 设置微信插件运行时实例
 */
export function setWeChatRuntime(next: PluginRuntime): void {
  runtime = next;
}

/**
 * Get the WeChat plugin runtime.
 * 获取微信插件运行时实例
 * @throws 如果运行时未初始化
 */
export function getWeChatRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("WeChat runtime not initialized");
  }
  return runtime;
}
