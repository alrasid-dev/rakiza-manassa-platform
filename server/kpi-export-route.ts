import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";
import { getAccessPermission, getEffectiveRoles } from "./court-service";
import { buildKpiWorkbook } from "./kpi-export-service";
import type { AppPermission } from "./access-control";

/** يُولّد ملف Excel بمؤشرات KPI ويعيده للتنزيل (المالك ورئيس المحكمة فقط). */
export function registerKpiExportRoute(app: Express) {
  app.get("/api/export/kpi", async (req: Request, res: Response) => {
    try {
      let user: { id: number; role: "user" | "admin"; email: string | null } | null = null;
      try {
        user = (await sdk.authenticateRequest(req)) as { id: number; role: "user" | "admin"; email: string | null };
      } catch {
        user = null;
      }
      if (!user || !user.id) {
        res.status(401).json({ error: "unauthenticated" });
        return;
      }
      const isOwner = user.role === "admin" || user.email?.trim().toLowerCase() === ENV.platformOwnerEmail;
      const permission: AppPermission = isOwner ? "full_control" : await getAccessPermission(user.email);
      const roles = await getEffectiveRoles(user.id, user.role === "admin");
      if (permission !== "full_control" && !roles.includes("court_president")) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const { buffer, filename } = await buildKpiWorkbook();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", String(buffer.length));
      res.setHeader("Cache-Control", "no-cache, no-store");
      res.send(buffer);
    } catch (error) {
      console.error("[kpi-export] failed:", error);
      res.status(500).json({ error: "فشل توليد الملف" });
    }
  });
}
