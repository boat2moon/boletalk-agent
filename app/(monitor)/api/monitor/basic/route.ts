// 基础健康检查接口（GET 请求）
// 用于心跳检测：最简单的服务存活性检查
// 只要服务正常运行，这个接口就会返回 { errno: 0 }
// 外部监控工具（如 cron-job.org）定期调用此接口来确认服务是否在线
export function GET() {
  return Response.json({ errno: 0 });
}
