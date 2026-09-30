import type { Express, Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { ENV } from "../_core/env";
import { getAccessPermission, getEffectiveRoles } from "../court-service";
import { getPoliciesForRoles, POLICY_SECTIONS } from "./policy-content";
import { generatePoliciesPdf } from "./policy-pdf";
import type { AppPermission } from "../access-control";

/** يُولّد PDF السياسات ويعيده كملف ثنائي مباشر (يُحمّل في المتصفح). */
export function registerPoliciesPdfRoute(app: Express) {
  app.get("/api/policies/my-policy.pdf", async (req: Request, res: Response) => {
    try {
      let user: { id: number; role: "user" | "admin"; email: string | null } | null = null;
      try {
        user = (await sdk.authenticateRequest(req)) as any;
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
      const sections = getPoliciesForRoles(roles, permission);
      const pdfBuffer = await generatePoliciesPdf("سياسات منصة ركيزة", sections);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="rakiza-policies-${user.id}.pdf"`);
      res.setHeader("Content-Length", String(pdfBuffer.length));
      res.setHeader("Cache-Control", "no-cache, no-store");
      res.send(pdfBuffer);
    } catch (error) {
      console.error("[policies] PDF failed:", error);
      res.status(500).json({ error: "فشل توليد الملف" });
    }
  });

  /** يُولّد PDF سياسة الحضور والانصراف فقط (قسم الحضور + الاستئذان). */
  app.get("/api/policies/attendance-policy.pdf", async (req: Request, res: Response) => {
    try {
      let user: { id: number; role: "user" | "admin"; email: string | null } | null = null;
      try {
        user = (await sdk.authenticateRequest(req)) as any;
      } catch {
        user = null;
      }
      if (!user || !user.id) {
        res.status(401).json({ error: "unauthenticated" });
        return;
      }
      const sections = POLICY_SECTIONS.filter(s => s.id === "attendance" || s.id === "leave_permission");
      const pdfBuffer = await generatePoliciesPdf("سياسة الحضور والانصراف", sections);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="attendance-policy.pdf"`);
      res.setHeader("Content-Length", String(pdfBuffer.length));
      res.setHeader("Cache-Control", "no-cache, no-store");
      res.send(pdfBuffer);
    } catch (error) {
      console.error("[policies] attendance PDF failed:", error);
      res.status(500).json({ error: "فشل توليد الملف" });
    }
  });
}
