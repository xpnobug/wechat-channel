/**
 * WeChat connection probe.
 * 微信连接探测模块
 *
 * 用于检测机器人是否在线并可用
 */
import { getRobotState, WeChatApiError } from "./api.js";
import type { WeChatRobotState } from "./types.js";

/** 探测结果 */
export type WeChatProbeResult = {
  ok: boolean;              // 是否成功
  robot?: WeChatRobotState; // 机器人状态
  error?: string;           // 错误信息
  elapsedMs: number;        // 耗时（毫秒）
};

/**
 * Probe WeChat robot connection.
 * 探测微信机器人连接状态
 */
export async function probeWeChat(
  baseUrl: string,
  apiToken: string,
  robotId: number,
  timeoutMs = 5000,
): Promise<WeChatProbeResult> {
  // 检查必要参数
  if (!apiToken?.trim()) {
    return { ok: false, error: "No API token provided", elapsedMs: 0 };
  }
  if (!baseUrl?.trim()) {
    return { ok: false, error: "No base URL provided", elapsedMs: 0 };
  }

  const startTime = Date.now();

  try {
    const response = await getRobotState({
      baseUrl,
      apiToken,
      robotId,
      timeoutMs,
    });
    const elapsedMs = Date.now() - startTime;

    if (response.code === 200 && response.data) {
      const robot = response.data;
      // 检查机器人是否在线
      if (robot.status === "online") {
        return { ok: true, robot, elapsedMs };
      }
      return {
        ok: false,
        robot,
        error: robot.status === "offline" ? "Robot is offline" : "Robot status unknown",
        elapsedMs,
      };
    }

    return { ok: false, error: "Invalid response from WeChat backend", elapsedMs };
  } catch (err) {
    const elapsedMs = Date.now() - startTime;

    if (err instanceof WeChatApiError) {
      return { ok: false, error: err.message, elapsedMs };
    }

    if (err instanceof Error) {
      // 处理超时错误
      if (err.name === "AbortError") {
        return { ok: false, error: `Request timed out after ${timeoutMs}ms`, elapsedMs };
      }
      return { ok: false, error: err.message, elapsedMs };
    }

    return { ok: false, error: String(err), elapsedMs };
  }
}
