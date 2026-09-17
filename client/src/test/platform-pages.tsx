/**
 * سجل صفحات المنصة المستخدم في اختبارات الواجهة.
 * يقابل مسارات App.tsx حتى يكون الفحص شاملاً بلا تكرار للمسارات.
 */
import React, { type ComponentType } from "react";
import Home from "@/pages/Home";
import NotFound from "@/pages/NotFound";
import { JudgesPage } from "@/pages/JudgesPage";
import { LeadershipAccessPage } from "@/pages/LeadershipAccessPage";
import { SupportPage } from "@/pages/SupportPage";
import { UserGuidePage } from "@/pages/UserGuidePage";
import { AnnouncementsPage } from "@/pages/AnnouncementsPage";
import { DecisionsPage } from "@/pages/DecisionsPage";
import { MeetingsPage } from "@/pages/MeetingsPage";
import { AchievementsPage } from "@/pages/AchievementsPage";
import { GovernanceArchivePage } from "@/pages/GovernanceArchivePage";
import { ReportUploadPage } from "@/pages/ReportUploadPage";
import { ActivityLogPage, ApprovalsPage, DelaysPage, HierarchyAdminPage, ImportsPage, PersonnelAdminPage, ReportsDashboardPage, StatusAndLeavePage, TasksPage, TraineeManagementPage } from "@/pages/FunctionalPages";
import DelegationPage from "@/pages/DelegationPage";
import OwnerKpiPage from "@/pages/OwnerKpiPage";
import RotationPage from "@/pages/RotationPage";
import PersonalSettingsPage from "@/pages/PersonalSettingsPage";
import PasswordRecoveryPage from "@/pages/PasswordRecoveryPage";
import { AccessManagementPage, RegistrationPage } from "@/pages/RegistrationPages";
import { TraineeCorrespondenceTemplatesPage } from "@/pages/TraineeCorrespondenceTemplatesPage";
import AssistantsPage from "@/pages/AssistantsPage";
import HierarchyWorkspacePage from "@/pages/HierarchyWorkspacePage";
import { PlatformModulesPage } from "@/pages/PlatformModulesPage";
import { EmailSettingsPage } from "@/pages/EmailSettingsPage";
import { AuthExperimentPage } from "@/pages/AuthExperimentPage";
import { AssetsPage } from "@/pages/AssetsPage";
import ManagerAssignmentRequestPage from "@/pages/ManagerAssignmentRequestPage";
import RakizaMailPage from "@/pages/RakizaMailPage";
import DepartmentTemplatesPage from "@/pages/DepartmentTemplatesPage";
import WorkflowMapPage from "@/pages/WorkflowMapPage";
import MessagesPage from "@/pages/MessagesPage";
import DataExportsPage from "@/pages/DataExportsPage";
import DashboardOptionsPage from "@/pages/DashboardOptionsPage";
import MinimalJusticePreviewPage from "@/pages/MinimalJusticePreviewPage";
import EmeraldGlassPreviewPage from "@/pages/EmeraldGlassPreviewPage";
import ExecutivePaperPreviewPage from "@/pages/ExecutivePaperPreviewPage";
import PlatformSettingsPage from "@/pages/PlatformSettingsPage";
import NotificationsPage from "@/pages/NotificationsPage";
import LeadershipWorkloadPage from "@/pages/LeadershipWorkloadPage";
import PerformanceReportEvaluationsPage from "@/pages/PerformanceReportEvaluationsPage";
import CorrespondenceWorkspaceContent from "@/pages/CorrespondenceWorkspaceContent";
import InstallAppsPage from "@/pages/InstallAppsPage";
import EmployeeStaffAuthPage from "@/pages/EmployeeStaffAuthPage";

export type PlatformPage = { path: string; label: string; component: ComponentType };

export const PLATFORM_PAGES: PlatformPage[] = [
  { path: "/", label: "لوحة القيادة", component: Home },
  { path: "/login", label: "دخول رَكيزة", component: AuthExperimentPage },
  { path: "/staff-login", label: "دخول الموظفين", component: EmployeeStaffAuthPage },
  { path: "/recover", label: "استعادة الحساب", component: PasswordRecoveryPage },
  { path: "/register", label: "طلب التسجيل", component: RegistrationPage },
  { path: "/apps", label: "تثبيت التطبيقات", component: InstallAppsPage },
  { path: "/guide", label: "دليل الاستخدام", component: UserGuidePage },
  { path: "/support", label: "الدعم", component: SupportPage },
  { path: "/personal-settings", label: "إعدادات الموظف", component: PersonalSettingsPage },
  { path: "/email-settings", label: "إعدادات البريد", component: EmailSettingsPage },
  { path: "/notifications", label: "الإشعارات", component: NotificationsPage },
  { path: "/announcements", label: "الإعلانات الداخلية", component: AnnouncementsPage },
  { path: "/achievements", label: "الإنجازات", component: AchievementsPage },
  { path: "/tasks", label: "المهام", component: TasksPage },
  { path: "/approvals", label: "طلبات الاعتماد", component: ApprovalsPage },
  { path: "/delegation", label: "التفويض", component: DelegationPage },
  { path: "/rotation", label: "المداورة", component: RotationPage },
  { path: "/delays", label: "المتعثرات", component: DelaysPage },
  { path: "/decisions", label: "التعاميم والقرارات", component: DecisionsPage },
  { path: "/meetings", label: "الاجتماعات", component: MeetingsPage },
  { path: "/reports", label: "التقارير", component: ReportsDashboardPage },
  { path: "/report-upload", label: "رفع التقارير", component: ReportUploadPage },
  { path: "/report-evaluations", label: "تقييم التقارير", component: PerformanceReportEvaluationsPage },
  { path: "/leadership-workload", label: "عبء القيادة", component: LeadershipWorkloadPage },
  { path: "/owner-kpi", label: "مؤشرات المالك", component: OwnerKpiPage },
  { path: "/people", label: "شؤون الموظفين", component: PersonnelAdminPage },
  { path: "/trainees", label: "شؤون الملازمين", component: TraineeManagementPage },
  { path: "/judges", label: "شؤون القضاة", component: JudgesPage },
  { path: "/hierarchy", label: "الهيكل الإداري", component: HierarchyWorkspacePage },
  { path: "/hierarchy-legacy", label: "الهيكل (الشاشة القديمة)", component: HierarchyAdminPage },
  { path: "/assets", label: "العهد والأصول", component: AssetsPage },
  { path: "/status", label: "الحالة والإجازات", component: StatusAndLeavePage },
  { path: "/imports", label: "الاستيراد", component: ImportsPage },
  { path: "/data-exports", label: "تصدير البيانات", component: DataExportsPage },
  { path: "/rakiza-mail", label: "بريد رَكيزة", component: RakizaMailPage },
  { path: "/messages", label: "الدردشات", component: MessagesPage },
  { path: "/correspondence", label: "المراسلات", component: CorrespondenceWorkspaceContent },
  { path: "/assistants", label: "المساعدون", component: AssistantsPage },
  { path: "/archive", label: "الأرشيف والاحتفاظ", component: GovernanceArchivePage },
  { path: "/activity-log", label: "سجل الحركة", component: ActivityLogPage },
  { path: "/access-management", label: "إدارة الصلاحيات", component: AccessManagementPage },
  { path: "/platform-modules", label: "وحدات المنصة", component: PlatformModulesPage },
  { path: "/platform-settings", label: "إعدادات المنصة", component: PlatformSettingsPage },
  { path: "/dashboard-options", label: "خيارات لوحة القيادة", component: DashboardOptionsPage },
  { path: "/leadership-access", label: "وصول القيادة", component: LeadershipAccessPage },
  { path: "/manager-assignment-request", label: "طلب تكليف مدير", component: ManagerAssignmentRequestPage },
  { path: "/department-templates", label: "قوالب الأقسام", component: DepartmentTemplatesPage },
  { path: "/workflow-map", label: "مخطط سير العمل", component: WorkflowMapPage },
  { path: "/trainee-correspondence-templates", label: "قوالب مراسلات الملازمين", component: TraineeCorrespondenceTemplatesPage },
  { path: "/design-preview", label: "معاينة الهوية", component: MinimalJusticePreviewPage },
  { path: "/emerald-glass-preview", label: "معاينة الزجاج", component: EmeraldGlassPreviewPage },
  { path: "/executive-paper-preview", label: "معاينة الورق التنفيذي", component: ExecutivePaperPreviewPage },
  { path: "/404", label: "صفحة غير موجودة", component: NotFound },
];
