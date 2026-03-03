/**
 * 数字人停复机（GPU 实例）电源管理 API
 *
 * GET  /api/avatar/power → 查询当前开关机状态
 * POST /api/avatar/power → 触发开机（不等待完成）
 *
 * 前端用法：
 * 1. GET 查状态 → 如果 status !== 10 → POST 触发开机
 * 2. 轮询 GET（每 3s）→ 直到 status === 10（开机完成）
 * 3. 然后再调 /api/avatar/start 启动会话
 */

import { auth } from "@/app/(auth)/auth";
import {
  ensureInstancePoweredOn,
  queryInstancePowerStatus,
} from "@/lib/ai/avatar-client";
import { ChatSDKError } from "@/lib/errors";

/**
 * 查询停复机状态
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const { status, statusStr } = await queryInstancePowerStatus();

    return Response.json({ status, statusStr });
  } catch (error) {
    console.error("查询停复机状态失败:", error);
    return Response.json(
      { error: "查询状态失败", status: 20, statusStr: "未知" },
      { status: 500 }
    );
  }
}

/**
 * 触发开机（非阻塞：仅发送开机请求，不等待完成）
 */
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    // 这里直接调 ensureInstancePoweredOn 在后台处理
    // 但我们不 await 到完成，只发起开机请求就行
    // 实际上我们让前端自己 poll GET，所以这里只需触发开机
    const { status } = await queryInstancePowerStatus();

    if (status === 10) {
      return Response.json({
        status: 10,
        statusStr: "开机",
        message: "已是开机状态",
      });
    }

    if (status === 20) {
      // 已关机，触发开机（非阻塞）
      // 直接调 ensureInstancePoweredOn 但不等它完成
      ensureInstancePoweredOn().catch((err) => {
        console.error("[Avatar] 后台自动开机失败:", err);
      });

      return Response.json({
        status: 11,
        statusStr: "开机中",
        message: "已发送开机请求，请轮询 GET /api/avatar/power 等待完成",
      });
    }

    // 正在开机中或关机中
    return Response.json({
      status,
      statusStr: status === 11 ? "开机中" : "关机中",
      message: "请等待状态变化",
    });
  } catch (error) {
    console.error("触发开机失败:", error);
    return Response.json({ error: "触发开机失败" }, { status: 500 });
  }
}
