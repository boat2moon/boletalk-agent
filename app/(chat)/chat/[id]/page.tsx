import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { auth } from "@/app/(auth)/auth";
import { Chat } from "@/components/chat";
import { ChatSkeleton } from "@/components/chat-skeleton";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { InterviewHistoryView } from "@/components/interview-history-view";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { getChatById, getMessagesByChatId } from "@/lib/db/queries";
import { convertToUIMessages } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default function Page(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <ChatPage params={props.params} />
    </Suspense>
  );
}

async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chat = await getChatById({ id });

  if (!chat) {
    notFound();
  }

  const session = await auth();

  if (!session) {
    redirect("/api/auth/guest");
  }

  if (chat.visibility === "private") {
    if (!session.user) {
      return notFound();
    }

    if (session.user.id !== chat.userId) {
      return notFound();
    }
  }

  const messagesFromDb = await getMessagesByChatId({
    id,
  });

  const uiMessages = convertToUIMessages(messagesFromDb);

  // 电话面试 / 视频面试：渲染只读的面试总结页
  if (chat.chatType === "realtime" || chat.chatType === "avatar") {
    // 从消息的 createdAt 时间戳计算面试时长
    const durationSeconds =
      messagesFromDb.length >= 2
        ? Math.round(
            (new Date(
              messagesFromDb[messagesFromDb.length - 1]!.createdAt
            ).getTime() -
              new Date(messagesFromDb[0].createdAt).getTime()) /
              1000
          )
        : 0;

    return (
      <InterviewHistoryView
        chatId={chat.id}
        chatType={chat.chatType}
        durationSeconds={durationSeconds}
        messages={uiMessages}
      />
    );
  }

  const cookieStore = await cookies();
  const chatModelFromCookie = cookieStore.get("chat-model");
  const chatModel = chatModelFromCookie?.value || DEFAULT_CHAT_MODEL;

  return (
    <>
      <Chat
        autoResume={true}
        id={chat.id}
        initialChatModel={chatModel}
        initialChatType={chat.chatType}
        initialLastContext={chat.lastContext ?? undefined}
        initialMessages={uiMessages}
        initialVisibilityType={chat.visibility}
        isReadonly={session?.user?.id !== chat.userId}
      />
      <DataStreamHandler />
    </>
  );
}
