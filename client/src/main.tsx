import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { platformHref, registerPlatformServiceWorker } from "./lib/pwa";
import { messageIfHtmlApiBody, trpcHttpUrl } from "./lib/runtime";
import "./lib/supabase-env";
import "./index.css";
import { applyAppearancePreferences, readAppearancePreferences } from "./lib/appearance";
const appearance = readAppearancePreferences();
applyAppearancePreferences(appearance.fontId, appearance.sizeId);

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  const loginPath = platformHref("login");
  if (window.location.pathname !== loginPath.replace(/\/$/, "")) window.location.href = loginPath;
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: trpcHttpUrl(),
      transformer: superjson,
      headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        }).then(async response => {
          const contentType = response.headers.get("content-type") || "";
          const htmlMessage = messageIfHtmlApiBody(await response.clone().text(), contentType);
          if (htmlMessage) throw new Error(htmlMessage);
          return response;
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

// إشارة إقلاع ناجح لحارس الإقلاع في /boot-guard.js: تمنع إنذاراً كاذباً على الأجهزة البطيئة،
// وتساعد على التمييز بين «الصفحة لم تُرسم» و«الصفحة لم تُحمَّل بعد».
(window as Window & { __RAKIZA_APP_MOUNTED__?: boolean }).__RAKIZA_APP_MOUNTED__ = true;

void registerPlatformServiceWorker();
