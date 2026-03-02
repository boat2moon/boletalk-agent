import { cookies } from "next/headers";
import { Suspense } from "react";
import { Chat } from "@/components/chat";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { ModeAwareContainer } from "@/components/mode-aware-container";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { generateUUID } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<div className="flex h-dvh" />}>
      <NewChatPage />
    </Suspense>
  );
}

async function NewChatPage() {
  const cookieStore = await cookies();
  const modelIdFromCookie = cookieStore.get("chat-model");
  const id = generateUUID();

  const chatModel = modelIdFromCookie?.value || DEFAULT_CHAT_MODEL;

  return (
    <>
      <ModeAwareContainer
        chatId={id}
        isReadonly={false}
        selectedVisibilityType="private"
      >
        <Chat
          autoResume={false}
          id={id}
          initialChatModel={chatModel}
          initialMessages={[]}
          initialVisibilityType="private"
          isReadonly={false}
          key={id}
        />
      </ModeAwareContainer>
      <DataStreamHandler />
    </>
  );
}
