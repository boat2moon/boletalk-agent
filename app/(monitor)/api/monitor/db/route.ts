import "server-only";

import { getFirstChatId } from "@/lib/db/queries";

// 数据库连接检测接口（POST 请求）
// 用于心跳检测：验证数据库连接是否正常
// 通过查询 chat 表的第一条数据来检测数据库连通性
// 使用 POST 而非 GET，增加一点被恶意刷接口的门槛
//
// 额外好处：定期调用此接口可以防止 Neon 数据库因长时间无活动而被冻结（suspend）
//
// 返回值：
//   - 成功: { errno: 0, data: { id: "xxx" } }
//   - 失败: { errno: -1 }
export async function POST() {
  try {
    // 尝试从数据库查询第一条 chat 记录的 id
    const id = await getFirstChatId();

    // 如果没有查到任何数据（如数据库为空），也认为是异常
    if (!id) {
      return Response.json({ errno: -1 });
    }

    // 查询成功，返回 id 证明数据库连接正常
    return Response.json({ errno: 0, data: { id } });
  } catch (_error) {
    // 查询出错（如数据库连接断开），返回错误标识
    return Response.json({ errno: -1 });
  }
}
