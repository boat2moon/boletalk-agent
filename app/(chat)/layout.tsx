import { cookies } from "next/headers";
import Script from "next/script";
import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { DataStreamProvider } from "@/components/data-stream-provider";
import { GuestExpiredToast } from "@/components/guest-expired-toast";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { VoiceHealthProvider } from "@/components/voice-health-context";
import { VoiceModeProvider } from "@/components/voice-mode-context";
import { auth } from "../(auth)/auth";

export const dynamic = "force-dynamic";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js"
        strategy="beforeInteractive"
      />
      <DataStreamProvider>
        <VoiceModeProvider>
          <VoiceHealthProvider>
            <Suspense fallback={<div className="flex h-dvh" />}>
              <SidebarWrapper>{children}</SidebarWrapper>
            </Suspense>
          </VoiceHealthProvider>
        </VoiceModeProvider>
      </DataStreamProvider>
      <Suspense>
        <GuestExpiredToast />
      </Suspense>
    </>
  );
}

async function SidebarWrapper({ children }: { children: React.ReactNode }) {
  const [session, cookieStore] = await Promise.all([auth(), cookies()]);
  const isCollapsed = cookieStore.get("sidebar_state")?.value !== "true";

  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <AppSidebar user={session?.user} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
