// server/_core/wait-until.ts
// غلاف آمن لـ waitUntil من @vercel/functions: يُبقي دالة Serverless حيّة حتى يكتمل الوعد
// (يمنع تجمّد المهام غير المنتظرة بعد إرسال الرد على Vercel). خارج Vercel يكون no-op.
import { waitUntil } from "@vercel/functions";

export function safeWaitUntil(promise: Promise<unknown>): void {
  try {
    waitUntil(promise);
  } catch {
    void promise.catch((e) => console.error("[waitUntil fallback]", e));
  }
}
