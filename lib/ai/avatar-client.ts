/**
 * 阿里云数字人 Avatar 客户端
 *
 * 封装虚拟数字人开放平台 OpenAPI 调用：
 * - startAvatarInstance：启动一路 3D 播报数字人流媒体服务
 * - sendAvatarText：驱动数字人播报文本
 * - stopAvatarInstance：停止数字人流媒体服务，释放资源
 *
 * 使用 @alicloud/avatar20220130 TypeScript SDK
 * 文档参考：https://help.aliyun.com/zh/avatar/avatar/developer-reference/
 */

import Client, {
  CloseTimedResetOperateRequest,
  QueryTimedResetOperateStatusRequest,
  SendTextRequest,
  StartInstanceRequest,
  StartInstanceRequestApp,
  StartInstanceRequestUser,
  StartTimedResetOperateRequest,
  StopInstanceRequest,
} from "@alicloud/avatar20220130";
// biome-ignore lint/performance/noNamespaceImport: Alibaba Cloud SDK convention
import * as $OpenApi from "@alicloud/openapi-client";
// biome-ignore lint/performance/noNamespaceImport: Alibaba Cloud SDK convention
import * as $Util from "@alicloud/tea-util";

// ── 环境变量 ──────────────────────────────────────────────

const ALIBABA_CLOUD_ACCESS_KEY_ID =
  process.env.ALIBABA_CLOUD_ACCESS_KEY_ID ?? "";
const ALIBABA_CLOUD_ACCESS_KEY_SECRET =
  process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET ?? "";

/** 从数字人开放平台控制台的"业务配置详情"中获取 */
const AVATAR_TENANT_ID = Number(process.env.AVATAR_TENANT_ID ?? "0");
/** 从数字人开放平台控制台的"业务配置详情"中获取 */
const AVATAR_APP_ID = process.env.AVATAR_APP_ID ?? "";
/** 停复机实例 ID，从控制台"实例管理"页面获取 */
const AVATAR_INSTANCE_ID = process.env.AVATAR_INSTANCE_ID ?? "";

/**
 * 服务接入点
 * @see https://help.aliyun.com/zh/avatar/avatar/developer-reference/service-access-point
 */
const AVATAR_ENDPOINT = "avatar.cn-zhangjiakou.aliyuncs.com";

// ── 类型定义 ──────────────────────────────────────────────

/** StartInstance 返回的 RTC 频道信息 */
export type AvatarChannel = {
  channelId: string;
  token: string;
  expireTime: string;
  nonce: string;
  userId: string;
  appId: string;
  /** GSLB 地址列表 */
  gslb: string[];
};

export type StartAvatarResult = {
  sessionId: string;
  channel: AvatarChannel;
};

// ── 单例客户端 ──────────────────────────────────────────────

let _client: Client | null = null;

function getClient(): Client {
  if (_client) {
    return _client;
  }

  if (!ALIBABA_CLOUD_ACCESS_KEY_ID || !ALIBABA_CLOUD_ACCESS_KEY_SECRET) {
    throw new Error(
      "缺少阿里云 AccessKey 配置。请设置 ALIBABA_CLOUD_ACCESS_KEY_ID 和 ALIBABA_CLOUD_ACCESS_KEY_SECRET 环境变量。"
    );
  }

  const config = new $OpenApi.Config({
    accessKeyId: ALIBABA_CLOUD_ACCESS_KEY_ID,
    accessKeySecret: ALIBABA_CLOUD_ACCESS_KEY_SECRET,
    endpoint: AVATAR_ENDPOINT,
  });

  _client = new Client(config);
  return _client;
}

// ── 公开 API ──────────────────────────────────────────────

/**
 * 启动一路 3D 播报数字人流媒体服务
 *
 * 返回 sessionId 和 RTC channel 信息，
 * channel 用于前端 BroadcastingAvatarSDK 初始化 RTC 拉流。
 */
export async function startAvatarInstance(
  userId: string
): Promise<StartAvatarResult> {
  const client = getClient();

  const request = new StartInstanceRequest({
    tenantId: AVATAR_TENANT_ID,
    app: new StartInstanceRequestApp({
      appId: AVATAR_APP_ID,
    }),
    user: new StartInstanceRequestUser({
      userId,
      userName: userId,
    }),
  });

  const runtime = new $Util.RuntimeOptions({});
  const response = await client.startInstanceWithOptions(request, runtime);
  const body = response.body;

  if (!body?.success) {
    throw new Error(
      `启动数字人失败: ${body?.code ?? "UNKNOWN"} - ${body?.message ?? "未知错误"}`
    );
  }

  const data = body.data;
  if (!data?.sessionId || !data?.channel) {
    throw new Error("启动数字人成功但缺少 sessionId 或 channel 信息");
  }

  const ch = data.channel;

  return {
    sessionId: data.sessionId,
    channel: {
      channelId: ch.channelId ?? "",
      token: ch.token ?? "",
      expireTime: ch.expireTime ?? "",
      nonce: ch.nonce ?? "",
      userId: ch.userId ?? "",
      appId: ch.appId ?? "",
      gslb: (ch.gslb as string[]) ?? [],
    },
  };
}

/**
 * 驱动数字人播报一段文本
 *
 * @param sessionId - 从 startAvatarInstance 获取的 sessionId
 * @param text - 要播报的文本内容（支持纯文本和 SSML）
 * @param interrupt - 是否打断当前正在播报的内容（默认 false，排队播报）
 */
export async function sendAvatarText(
  sessionId: string,
  text: string,
  interrupt = false
): Promise<void> {
  const client = getClient();

  const request = new SendTextRequest({
    tenantId: AVATAR_TENANT_ID,
    sessionId,
    text,
    interrupt,
    uniqueCode: crypto.randomUUID(),
  });

  const runtime = new $Util.RuntimeOptions({});
  const response = await client.sendTextWithOptions(request, runtime);
  const body = response.body;

  if (!body?.success) {
    throw new Error(
      `发送文本失败: ${body?.code ?? "UNKNOWN"} - ${body?.message ?? "未知错误"}`
    );
  }
}

/**
 * 停止数字人流媒体服务，释放资源
 *
 * ⚠️ 平台不会主动结束服务，必须手动调用。
 * 已启动但未停止的实例会持续计费。
 */
export async function stopAvatarInstance(sessionId: string): Promise<void> {
  const client = getClient();

  const request = new StopInstanceRequest({
    tenantId: AVATAR_TENANT_ID,
    sessionId,
  });

  const runtime = new $Util.RuntimeOptions({});
  const response = await client.stopInstanceWithOptions(request, runtime);
  const body = response.body;

  if (!body?.success) {
    console.error(
      `停止数字人失败: ${body?.code ?? "UNKNOWN"} - ${body?.message ?? "未知错误"}`
    );
    // 不抛异常，因为停止操作应尽力执行
  }
}

// ── 停复机（GPU 实例开/关机）管理 ─────────────────────────────

/**
 * 停复机状态枚举
 * - 10：开机（可使用）
 * - 11：开机中（等待中）
 * - 20：关机（不可使用）
 * - 21：关机中（不可使用）
 */
export type InstancePowerStatus = 10 | 11 | 20 | 21;

/**
 * 查询停复机实例的开关机状态
 */
export async function queryInstancePowerStatus(): Promise<{
  status: InstancePowerStatus;
  statusStr: string;
}> {
  const client = getClient();

  const request = new QueryTimedResetOperateStatusRequest({
    tenantId: AVATAR_TENANT_ID,
    instanceId: AVATAR_INSTANCE_ID,
  });

  const runtime = new $Util.RuntimeOptions({});
  const response = await client.queryTimedResetOperateStatusWithOptions(
    request,
    runtime
  );
  const body = response.body;

  if (!body?.success) {
    throw new Error(
      `查询停复机状态失败: ${body?.code ?? "UNKNOWN"} - ${body?.message ?? "未知错误"}`
    );
  }

  return {
    status: (body.data?.status as InstancePowerStatus) ?? 20,
    statusStr: body.data?.statusStr ?? "未知",
  };
}

/**
 * 确保停复机实例已开机
 *
 * 流程：
 * 1. 查询当前状态
 * 2. 如果已开机 → 直接返回
 * 3. 如果已关机 → 调用开机 API + 轮询等待
 * 4. 如果开机中 → 仅轮询等待
 * 5. 如果关机中 → 等待关机完成再开机
 *
 * ⚠️ 开机需要 1-5 分钟，轮询间隔 3 秒
 * ⚠️ 开机完成后开始计费
 */
export async function ensureInstancePoweredOn(): Promise<void> {
  const MAX_WAIT_MS = 5 * 60 * 1000; // 最多等 5 分钟
  const POLL_INTERVAL_MS = 3000; // 每 3 秒查一次
  const startTime = Date.now();

  let { status, statusStr } = await queryInstancePowerStatus();
  console.log(`[Avatar] 当前停复机状态: ${statusStr} (${status})`);

  // 已开机
  if (status === 10) {
    return;
  }

  // 关机中 → 等关机完成
  while (status === 21) {
    if (Date.now() - startTime > MAX_WAIT_MS) {
      throw new Error("等待停复机关机完成超时，请稍后重试");
    }
    await sleep(POLL_INTERVAL_MS);
    ({ status, statusStr } = await queryInstancePowerStatus());
    console.log(`[Avatar] 等待关机完成: ${statusStr} (${status})`);
  }

  // 已关机 → 发起开机
  if (status === 20) {
    console.log("[Avatar] 停复机已关机，正在开机...");
    const client = getClient();
    const request = new StartTimedResetOperateRequest({
      tenantId: AVATAR_TENANT_ID,
      instanceId: AVATAR_INSTANCE_ID,
    });
    const runtime = new $Util.RuntimeOptions({});
    const response = await client.startTimedResetOperateWithOptions(
      request,
      runtime
    );
    const body = response.body;

    if (!body?.success) {
      throw new Error(
        `开机失败: ${body?.code ?? "UNKNOWN"} - ${body?.message ?? "未知错误"}`
      );
    }
    console.log("[Avatar] 开机请求已发送，等待开机完成...");
  }

  // 轮询等待开机完成
  while (true) {
    if (Date.now() - startTime > MAX_WAIT_MS) {
      throw new Error(
        "停复机开机超时（已等待超过 5 分钟），请在控制台检查实例状态"
      );
    }
    await sleep(POLL_INTERVAL_MS);
    ({ status, statusStr } = await queryInstancePowerStatus());
    console.log(`[Avatar] 等待开机: ${statusStr} (${status})`);

    if (status === 10) {
      console.log("[Avatar] 停复机开机完成 ✓");
      return;
    }
  }
}

/**
 * 停复机关机，释放 GPU 资源（停止按量计费）
 *
 * ⚠️ 关机后无法使用数字人，需重新开机（1-5 分钟）
 */
export async function powerOffInstance(): Promise<void> {
  const client = getClient();

  // 先检查是否已关机
  const { status } = await queryInstancePowerStatus();
  if (status === 20 || status === 21) {
    console.log("[Avatar] 停复机已处于关机/关机中状态，无需重复关机");
    return;
  }

  const request = new CloseTimedResetOperateRequest({
    tenantId: AVATAR_TENANT_ID,
    instanceId: AVATAR_INSTANCE_ID,
  });

  const runtime = new $Util.RuntimeOptions({});
  const response = await client.closeTimedResetOperateWithOptions(
    request,
    runtime
  );
  const body = response.body;

  if (body?.success) {
    console.log("[Avatar] 停复机关机请求已发送 ✓（约 1 分钟内完成）");
  } else {
    console.error(
      `停复机关机失败: ${body?.code ?? "UNKNOWN"} - ${body?.message ?? "未知错误"}`
    );
  }
}

// ── 工具函数 ──────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
