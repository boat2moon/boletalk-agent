import { Skeleton } from "@/components/ui/skeleton";

/**
 * 聊天页面加载骨架
 *
 * 在异步加载会话内容时显示，模拟聊天界面的布局结构。
 */
export function ChatSkeleton() {
  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* 顶栏骨架 */}
      <header className="flex items-center gap-2 px-2 py-1.5 md:px-2">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-6 w-20 rounded-md" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      </header>

      {/* 消息区骨架 */}
      <div className="flex flex-1 flex-col items-center gap-6 overflow-hidden px-4 pt-10">
        {/* 模拟几条消息气泡 */}
        <div className="flex w-full max-w-3xl flex-col gap-6">
          {/* 用户消息 */}
          <div className="flex justify-end">
            <Skeleton className="h-10 w-2/5 rounded-2xl" />
          </div>
          {/* AI 回复 */}
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-3/4 rounded-lg" />
            <Skeleton className="h-4 w-2/3 rounded-lg" />
            <Skeleton className="h-4 w-1/2 rounded-lg" />
          </div>
          {/* 用户消息 */}
          <div className="flex justify-end">
            <Skeleton className="h-10 w-1/3 rounded-2xl" />
          </div>
          {/* AI 回复 */}
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-4/5 rounded-lg" />
            <Skeleton className="h-4 w-3/5 rounded-lg" />
          </div>
        </div>
      </div>

      {/* 输入区骨架 */}
      <div className="sticky bottom-0 mx-auto flex w-full max-w-4xl px-2 pb-3 md:px-4 md:pb-4">
        <Skeleton className="h-12 w-full rounded-2xl" />
      </div>
    </div>
  );
}
