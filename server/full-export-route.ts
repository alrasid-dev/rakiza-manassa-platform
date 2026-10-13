import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";
import { getAccessPermission, getEffectiveRoles } from "./court-service";
import { buildFullWorkbook } from "./kpi-export-service";
import type { AppPermission } from "./access-control";

/** يُولّد ملف Excel كاملاً (12 ورقة) جاهزاً لـ Power BI ويعيده للتنزيل (المالك ورئيس المحكمة فقط). */
export function registerFullExportRoute(app: Express) {
  app.get("/api/export/full", async (req: Request, res: Response) => {
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
      const from = typeof req.query.from === "string" && req.query.from ? req.query.from : undefined;
      const to = typeof req.query.to === "string" && req.query.to ? req.query.to : undefined;
      const unitId = Number(req.query.unitId);
      const status = typeof req.query.status === "string" && req.query.status ? req.query.status : undefined;
      const profileId = Number(req.query.profileId);

      const { buffer, filename } = await buildFullWorkbook({
        from,
        to,
        unitId: Number.isFinite(unitId) && unitId > 0 ? unitId : undefined,
        status,
        profileId: Number.isFinite(profileId) && profileId > 0 ? profileId : undefined,
        exportedBy: isOwner ? "مالك المنصة" : (user.email ?? ""),
      });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", String(buffer.length));
      res.setHeader("Cache-Control", "no-cache, no-store");
      res.send(buffer);
    } catch (error) {
      console.error("[full-export] failed:", error);
      res.status(500).json({ error: "فشل توليد الملف" });
    }
  });
}