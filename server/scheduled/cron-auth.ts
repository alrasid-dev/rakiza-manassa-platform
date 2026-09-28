import { createHash, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { ENV } from "../_core/env";

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * تحقق ثانٍ لمسارات /api/scheduled/* عبر هيدر `x-cron-secret`
 * (مسار GitHub Actions). لا يعمل إلا إذا كان CRON_SECRET مضبوطاً وغير فارغ.
 * عند غياب الهيدر أو عدم تطابقه يعيد false ويبقى مسار Heartbeat (taskUid) كما هو.
 * المقارنة آمنة ضد هجمات التوقيت، ويُسمح بتمرير `secret` صراحةً لأغراض الاختبار.
 */
export function isValidCronSecret(req: Request, secret: string = ENV.cronSecret): boolean {
  if (!secret) return false;
  const header = req.headers["x-cron-secret"];
  const provided = typeof header === "string" ? header : Array.isArray(header) ? header[0] : "";
  if (!provided) return false;
  return safeEqual(provided, secret);
}
