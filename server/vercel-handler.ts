import { app } from "./_core/app";
import { serveStatic } from "./_core/static";

try {
  serveStatic(app);
} catch (error) {
  console.error("[vercel] static files unavailable at startup", error);
}

export default app;
