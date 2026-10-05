// server/sse-service.ts
// بثّ إشعارات فورية عبر Server-Sent Events. يُستخدم محلياً / Vercel Pro؛
// على Vercel Hobby نُسقط الاتصال ونعتمد على polling في العميل.
import type { Response } from "express";

const clients = new Map<number, Set<Response>>();

export function addSseClient(userId: number, res: Response): void {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(res);
}

export function removeSseClient(userId: number, res: Response): void {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(userId);
}

export function broadcastToUser(userId: number, payload: Record<string, unknown>): void {
  const set = clients.get(userId);
  if (!set) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of Array.from(set)) {
    try {
      res.write(data);
    } catch {
      removeSseClient(userId, res);
    }
  }
}

export function hasSseClients(userId: number): boolean {
  return (clients.get(userId)?.size ?? 0) > 0;
}
