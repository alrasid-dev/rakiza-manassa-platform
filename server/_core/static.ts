import express, { type Express, type NextFunction, type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function moduleDirname() {
  return path.dirname(fileURLToPath(import.meta.url));
}

export function resolvePublicDir() {
  const here = moduleDirname();
  const candidates = [
    path.resolve(process.cwd(), "public"),
    path.resolve(process.cwd(), "dist", "public"),
    path.resolve(here, "../..", "dist", "public"),
    path.resolve(here, "..", "..", "public"),
    path.resolve(here, "public"),
  ];
  return candidates.find(candidate => fs.existsSync(path.join(candidate, "index.html"))) ?? candidates[0];
}

/** امتدادات الملفات الثابتة: أي طلب يحمل أحدها ولا وجود له يجب أن يُرد بـ 404 لا بصفحة HTML. */
const STATIC_ASSET_EXTENSIONS = /\.(?:js|mjs|cjs|jsx|ts|tsx|css|map|json|webmanifest|txt|xml|wasm|png|jpg|jpeg|gif|svg|ico|webp|avif|bmp|woff2?|ttf|otf|eot|mp3|mp4|webm|pdf|zip|csv|xlsx)$/i;

/** الأصول المُجزّأة (hash) لا تتغيّر أبداً، فتُخزَّن سنة كاملة بلا إعادة تحقق. */
const IMMUTABLE_ASSET = /[\\/]assets[\\/]|[\\/]icons[\\/]|[\\/]__manus__[\\/]/i;

/** هل الطلب يخص ملفاً ثابتاً (لا صفحة تطبيق)؟ */
export function isStaticAssetRequest(requestPath: string) {
  const clean = String(requestPath || "").split("?")[0].split("#")[0];
  if (clean.startsWith("/api/")) return false;
  return STATIC_ASSET_EXTENSIONS.test(clean);
}

/**
 * سياسة التخزين المؤقت:
 * - index.html: no-store حتى يحصل كل زيارة على حزمة الواجهة المطابقة للنشر الحالي (يمنع الشاشة البيضاء).
 * - الأصول المُجزّأة: سنة كاملة immutable (سرعة، ولا خطر تعارض أسماء).
 * - الباقي: إعادة تحقق فورية.
 */
export function cacheControlForFile(filePath: string) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  if (/index\.html$/i.test(normalized)) return "no-store, must-revalidate";
  if (IMMUTABLE_ASSET.test(normalized)) return "public, max-age=31536000, immutable";
  return "public, max-age=0, must-revalidate";
}

/** يُعيد 404 صريحاً لأي أصل مفقود، فلا يستلم المتصفح HTML مكان JavaScript (سبب الشاشة البيضاء). */
export function missingAssetHandler() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (!isStaticAssetRequest(req.path)) return next();
    res.status(404);
    res.setHeader("Cache-Control", "no-store, must-revalidate");
    res.type("text/plain; charset=utf-8").send(`الأصل غير موجود على هذا النشر: ${req.path}`);
  };
}

/** يُسلّم صفحة التطبيق لأي مسار داخلي، مع منع تخزينها مؤقتاً. */
export function appShellHandler(distPath: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api/")) return next();
    const indexFile = path.resolve(distPath, "index.html");
    if (!fs.existsSync(indexFile)) return next();
    res.setHeader("Cache-Control", "no-store, must-revalidate");
    res.sendFile(indexFile);
  };
}

export function serveStatic(app: Express) {
  const distPath = resolvePublicDir();
  if (!fs.existsSync(path.join(distPath, "index.html"))) {
    console.error(`Could not find the build directory: ${distPath}, make sure to build the client first`);
  }

  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      res.setHeader("Cache-Control", cacheControlForFile(filePath));
    },
  }));
  app.use(missingAssetHandler());
  app.use(appShellHandler(distPath));
}
