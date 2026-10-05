// server/sse-route.ts
// يربط مسار /api/sse/notifications بنظام البث الفوري (SSE).
import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { addSseClient, removeSseClient } from "./sse-service";

export function registerNotificationsSseRoute(app: Express): void {
  app.get("/api/sse/notifications", async (req: Request, res: Response) => {
    // على Vercel (Serverless) لا يمكن إبقاء اتصال مفتوح — نرد 204 ونعتمد على polling.
    if (process.env.VERCEL === "1") {
      res.status(204).end();
      return;
    }
    let user: { id: number } | null = null;
    try { user = await sdk.authenticateRequest(req); } catch { user = null; }
    if (!user) { res.status(401).json({ error: "غير مصرح" }); return; }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`: connected\n\n`);
    addSseClient(user.id, res);

    const heartbeat = setInterval(() => {
      try { res.write(`: ping\n\n`); } catch { /* تجاهل */ }
    }, 30_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      removeSseClient(user.id, res);
    });
  });
}
