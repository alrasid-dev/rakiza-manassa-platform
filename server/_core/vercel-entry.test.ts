import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("مسار تشغيل Vercel", () => {
  it("لا يستخدم مدخل TypeScript يُترجم إلى استيراد بدون امتداد", () => {
    expect(existsSync(join(process.cwd(), "api/index.ts"))).toBe(true);
    expect(readFileSync(join(process.cwd(), "api/index.ts"), "utf8")).toContain('import app from "./handler.js";');
    expect(existsSync(join(process.cwd(), "server/vercel-handler.ts"))).toBe(true);
    const vercelConfig = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as { functions: Record<string, { includeFiles?: string }>; rewrites: Array<{ destination: string }> };
    expect(Object.keys(vercelConfig.functions)).toContain("api/index.ts");
    for (const pattern of Object.keys(vercelConfig.functions)) {
      expect(existsSync(join(process.cwd(), pattern))).toBe(true);
    }
    expect(vercelConfig.functions["api/index.ts"]?.includeFiles).toContain("api/handler.js");
    expect(vercelConfig.rewrites[0]?.destination).toBe("/api");
    expect(readFileSync(join(process.cwd(), "scripts/bundle-vercel-api.mjs"), "utf8")).toContain('const outfile = "api/handler.js"');
    const handlerEntry = readFileSync(join(process.cwd(), "server/vercel-handler.ts"), "utf8");
    const serverEntry = readFileSync(join(process.cwd(), "server.ts"), "utf8");
    const appEntry = readFileSync(join(process.cwd(), "server/_core/app.ts"), "utf8");
    const staticEntry = readFileSync(join(process.cwd(), "server/_core/static.ts"), "utf8");
    expect(handlerEntry).not.toMatch(/from ["']\.\.\/server["']/);
    expect(appEntry).not.toMatch(/from ["']\.\.\/routers["']/);
    expect(appEntry).toMatch(/from ["']\.\.\/routers\/index["']/);
    for (const source of [handlerEntry, serverEntry, appEntry, staticEntry]) {
      expect(source).not.toMatch(/from ["']vite["']/);
      expect(source).not.toMatch(/vite\.config/);
      expect(source).not.toMatch(/_core\/index/);
      expect(source).not.toMatch(/from ["']\.\/vite["']/);
    }
  });
});
