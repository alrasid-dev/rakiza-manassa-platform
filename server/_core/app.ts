import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers/index";
import { createContext } from "./context";
import { handleTraineeDueSoonSchedule } from "../scheduled/trainee-due-soon";
import { handleDailyTaskReminderSchedule, handleLeaveStatusRefreshSchedule, handleSupportTicketEscalationSchedule, handleTaskEscalationSchedule, handleTraineeExcelSyncSchedule } from "../scheduled/task-automation";
import { handleAttendanceConfirmationSchedule } from "../scheduled/attendance-confirmation";
import { handleInternalMailSchedule } from "../scheduled/internal-mail";
import { trpcMutationOriginGuard } from "./originGuard";
import { securityHeaders } from "./securityHeaders";
import { dataConnectionsStatus } from "./data-connections";
import { registerEmployeeAuthRoutes } from "../employee-auth/routes";
import { loginFallbackErrorHandler, registerLoginConfigRoutes } from "./login-fallback";

export function createExpressApp() {
  const app = express();
  app.use(securityHeaders);
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerEmployeeAuthRoutes(app);
  registerLoginConfigRoutes(app);
  app.post("/api/scheduled/trainee-due-soon", handleTraineeDueSoonSchedule);
  app.post("/api/scheduled/daily-task-reminder", handleDailyTaskReminderSchedule);
  app.post("/api/scheduled/task-escalation", handleTaskEscalationSchedule);
  app.post("/api/scheduled/leave-status-refresh", handleLeaveStatusRefreshSchedule);
  app.post("/api/scheduled/trainee-excel-sync", handleTraineeExcelSyncSchedule);
  app.post("/api/scheduled/support-ticket-escalation", handleSupportTicketEscalationSchedule);
  app.post("/api/scheduled/attendance-confirmation", handleAttendanceConfirmationSchedule);
  app.post("/api/scheduled/internal-mail-dispatch", handleInternalMailSchedule);
  app.use(
    "/api/trpc",
    trpcMutationOriginGuard,
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  app.get("/health", (_req, res) => {
    res.json({ ok: true, name: "rakiza", brand: "رَكيزة", ...dataConnectionsStatus() });
  });
  // معالج الأخطاء البديل: يُسجَّل أخيراً ليحوّل أي خطأ غير مُعالج إلى رد منظم بدل 500 خام.
  app.use(loginFallbackErrorHandler);
  return app;
}

export const app = createExpressApp();
export default app;
