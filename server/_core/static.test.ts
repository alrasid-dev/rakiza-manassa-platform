import express from "express";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { appShellHandler, cacheControlForFile, isStaticAssetRequest, missingAssetHandler } from "./static";

function fakeResponse() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: "",
    file: "",
    setHeader(key: string, value: string) {
      res.headers[key] = value;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    type(value: string) {
      res.headers["Content-Type"] = value;
      return res;
    },
    send(value: string) {
      res.body = value;
      return res;
    },
    sendFile(value: string) {
      res.file = value;
      return res;
    },
  };
  return res;
}

function runHandler(
  handler: (req: Request, res: Response, next: NextFunction) => unknown,
  requestPath: string,
  method = "GET",
) {
  const res = fakeResponse();
  const next = vi.fn();
  handler({ method, path: requestPath } as unknown as Request, res as unknown as Response, next as unknown as NextFunction);
  return { res, next };
}

describe("خدمة الملفات الثابتة وحماية الواجهة من الشاشة البيضاء", () => {
  it("يميّز طلبات الأصول عن مسارات التطبيق وعن مسارات الواجهة البرمجية", () => {
    expect(isStaticAssetRequest("/assets/index-CqpsTtQE.js")).toBe(true);
    expect(isStaticAssetRequest("/icons/pwa-192.png")).toBe(true);
    expect(isStaticAssetRequest("/assets/index-abc.js?v=2")).toBe(true);
    expect(isStaticAssetRequest("/manifest.webmanifest")).toBe(true);
    expect(isStaticAssetRequest("/tasks")).toBe(false);
    expect(isStaticAssetRequest("/") ).toBe(false);
    expect(isStaticAssetRequest("/api/trpc/court.me")).toBe(false);
    expect(isStaticAssetRequest("/api/report/data.json")).toBe(false);
  });

  it("يضبط سياسة التخزين المؤقت حسب نوع الملف", () => {
    expect(cacheControlForFile(path.join("public", "index.html"))).toBe("no-store, must-revalidate");
    expect(cacheControlForFile(path.join("public", "assets", "index-abc.js"))).toBe("public, max-age=31536000, immutable");
    expect(cacheControlForFile(path.join("public", "icons", "pwa-192.png"))).toBe("public, max-age=31536000, immutable");
    expect(cacheControlForFile(path.join("public", "sw.js"))).toBe("public, max-age=0, must-revalidate");
  });

  it("يرد 404 نصياً على أي أصل مفقود بدل إعادة صفحة HTML", () => {
    const { res, next } = runHandler(missingAssetHandler(), "/assets/index-old-hash.js");
    expect(res.statusCode).toBe(404);
    expect(res.body).toContain("الأصل غير موجود على هذا النشر");
    expect(res.headers["Cache-Control"]).toBe("no-store, must-revalidate");
    expect(next).not.toHaveBeenCalled();
  });

  it("يمرّر مسارات التطبيق والواجهة البرمجية دون اعتراض", () => {
    const page = runHandler(missingAssetHandler(), "/tasks");
    expect(page.next).toHaveBeenCalled();
    expect(page.res.statusCode).toBe(200);
    const api = runHandler(missingAssetHandler(), "/api/trpc/court.me");
    expect(api.next).toHaveBeenCalled();
  });

  it("يخدم هيكل التطبيق لمسارات التنقل بلا تخزين مؤقت", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rakiza-static-"));
    try {
      writeFileSync(path.join(dir, "index.html"), "<!doctype html><div id=\"root\"></div>", "utf8");
      const { res, next } = runHandler(appShellHandler(dir), "/rakiza-mail");
      expect(res.headers["Cache-Control"]).toBe("no-store, must-revalidate");
      expect(res.file).toBe(path.resolve(dir, "index.html"));
      expect(next).not.toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("لا يخدم هيكل التطبيق لمسارات الواجهة البرمجية", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rakiza-static-"));
    try {
      writeFileSync(path.join(dir, "index.html"), "<!doctype html>", "utf8");
      const { res, next } = runHandler(appShellHandler(dir), "/api/trpc/court.me");
      expect(next).toHaveBeenCalled();
      expect(res.file).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("يركّب الطبقات بترتيب صحيح: ملفات ثابتة ثم 404 للأصول ثم هيكل التطبيق", async () => {
    const { serveStatic } = await import("./static");
    const use = vi.fn();
    serveStatic({ use } as unknown as express.Express);
    expect(use).toHaveBeenCalledTimes(3);
  });
});
