import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Redirect, Route, Router as WouterRouter, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import PreviewWorkspace from "./pages/PreviewWorkspace";
import { JudgesPage } from "./pages/JudgesPage";
import { LeadershipAccessPage } from "./pages/LeadershipAccessPage";
import { SupportPage } from "./pages/SupportPage";
import { UserGuidePage } from "./pages/UserGuidePage";
import { AnnouncementsPage } from "./pages/AnnouncementsPage";
import { DecisionsPage } from "./pages/DecisionsPage";
import { MeetingsPage } from "./pages/MeetingsPage";
import { AchievementsPage } from "./pages/AchievementsPage";
import { GovernanceArchivePage } from "./pages/GovernanceArchivePage";
import { ReportUploadPage } from "./pages/ReportUploadPage";
import { ActivityLogPage, ApprovalsPage, DelaysPage, HierarchyAdminPage, ImportsPage, PersonnelAdminPage, ReportsDashboardPage, StatusAndLeavePage, TasksPage, TraineeManagementPage } from "./pages/FunctionalPages";
import DelegationPage from "./pages/DelegationPage";
import OwnerKpiPage from "./pages/OwnerKpiPage";
import RotationPage from "./pages/RotationPage";
import PersonalSettingsPage from "./pages/PersonalSettingsPage";
import PasswordRecoveryPage from "./pages/PasswordRecoveryPage";
import { AccessManagementPage, RegistrationPage } from "./pages/RegistrationPages";
import { IS_PREVIEW_MODE } from "./const";
import { TraineeCorrespondenceTemplatesPage } from "./pages/TraineeCorrespondenceTemplatesPage";
import AssistantsPage from "./pages/AssistantsPage";
import HierarchyWorkspacePage from "./pages/HierarchyWorkspacePage";
import { PlatformModulesPage } from "./pages/PlatformModulesPage";
import { EmailSettingsPage } from "./pages/EmailSettingsPage";
import { AuthExperimentPage } from "./pages/AuthExperimentPage";
import { AssetsPage } from "./pages/AssetsPage";
import ManagerAssignmentRequestPage from "./pages/ManagerAssignmentRequestPage";
import RakizaMailPage from "./pages/RakizaMailPage";
import DepartmentTemplatesPage from "./pages/DepartmentTemplatesPage";
import WorkflowMapPage from "./pages/WorkflowMapPage";
import MessagesPage from "./pages/MessagesPage";
import DataExportsPage from "./pages/DataExportsPage";
import DashboardOptionsPage from "./pages/DashboardOptionsPage";
import MinimalJusticePreviewPage from "./pages/MinimalJusticePreviewPage";
import EmeraldGlassPreviewPage from "./pages/EmeraldGlassPreviewPage";
import ExecutivePaperPreviewPage from "./pages/ExecutivePaperPreviewPage";
import PlatformSettingsPage from "./pages/PlatformSettingsPage";
import NotificationsPage from "./pages/NotificationsPage";
import LeadershipWorkloadPage from "./pages/LeadershipWorkloadPage";
import PerformanceReportEvaluationsPage from "./pages/PerformanceReportEvaluationsPage";
import CorrespondenceWorkspaceContent from "./pages/CorrespondenceWorkspaceContent";
import InstallAppsPage from "./pages/InstallAppsPage";
import EmployeeStaffAuthPage from "./pages/EmployeeStaffAuthPage";
import DepartmentDocumentsPage from "./pages/DepartmentDocumentsPage";

const routerBase = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");


function Router() {
  return (
    <WouterRouter base={routerBase || undefined}>
    <Switch>
      <Route path="/apps" component={InstallAppsPage} />
      <Route path="/login" component={AuthExperimentPage} />
      <Route path="/staff-login" component={EmployeeStaffAuthPage} />
      <Route path="/recover" component={PasswordRecoveryPage} />
      <Route path="/approvals" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="archive" /> : ApprovalsPage} />
      <Route path="/delegation" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="people" /> : DelegationPage} />
      <Route path="/owner-kpi" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="reports" /> : OwnerKpiPage} />
      <Route path="/rotation" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="reports" /> : RotationPage} />
      <Route path="/personal-settings" component={PersonalSettingsPage} />
      <Route path="/design-preview" component={MinimalJusticePreviewPage} />
      <Route path="/emerald-glass-preview" component={EmeraldGlassPreviewPage} />
      <Route path="/executive-paper-preview" component={ExecutivePaperPreviewPage} />
      <Route path="/notifications" component={NotificationsPage} />
      <Route path="/platform-settings" component={PlatformSettingsPage} />
      <Route path="/" component={Home} />
      <Route path="/dashboard-options" component={DashboardOptionsPage} />
      <Route path="/leadership-workload" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="reports" /> : LeadershipWorkloadPage} />
      <Route path="/report-evaluations" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="reports" /> : PerformanceReportEvaluationsPage} />
      <Route path="/assistants" component={AssistantsPage} />
      <Route path="/tasks" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="tasks" /> : TasksPage} />
      <Route path="/guide" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="tasks" /> : UserGuidePage} />
      <Route path="/support" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="tasks" /> : SupportPage} />
      <Route path="/announcements" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="tasks" /> : AnnouncementsPage} />
      <Route path="/achievements" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="tasks" /> : AchievementsPage} />
      <Route path="/rakiza-mail" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="tasks" /> : RakizaMailPage} />
      <Route path="/correspondence" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="tasks" /> : CorrespondenceWorkspaceContent} />
      <Route path="/people" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="people" /> : PersonnelAdminPage} />
      <Route path="/personnel" component={() => <Redirect to="/people" />} />
      <Route path="/trainees" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="people" /> : TraineeManagementPage} />
      <Route path="/judges" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="people" /> : JudgesPage} />
      <Route path="/delays" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="delays" /> : DelaysPage} />
      <Route path="/decisions" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="decisions" /> : DecisionsPage} />
      <Route path="/meetings" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="meetings" /> : MeetingsPage} />
      <Route path="/reports" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="reports" /> : ReportsDashboardPage} />
      <Route path="/report-upload" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="reports" /> : ReportUploadPage} />
      <Route path="/status" component={StatusAndLeavePage} />
      <Route path="/assets" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="people" /> : AssetsPage} />
      <Route path="/imports" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="imports" /> : ImportsPage} />
      <Route path="/register" component={RegistrationPage} />
      <Route path="/access-management" component={AccessManagementPage} />
      <Route path="/owner-control" component={AccessManagementPage} />
      <Route path="/platform-modules" component={PlatformModulesPage} />
      <Route path="/department-documents" component={DepartmentDocumentsPage} />
      <Route path="/email-settings" component={EmailSettingsPage} />
      <Route path="/auth-experiment" component={AuthExperimentPage} />
      <Route path="/trainee-correspondence-templates" component={TraineeCorrespondenceTemplatesPage} />
      <Route path="/leadership-access" component={LeadershipAccessPage} />
      <Route path="/manager-assignment-request" component={ManagerAssignmentRequestPage} />
      <Route path="/internal-mail" component={() => <Redirect to="/rakiza-mail" />} />
      <Route path="/department-templates" component={DepartmentTemplatesPage} />
                            <Route path="/workflow-map" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="reports" /> : WorkflowMapPage} />
      <Route path="/messages" component={MessagesPage} />
      <Route path="/data-exports" component={DataExportsPage} />
      <Route path="/activity-log" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="archive" /> : ActivityLogPage} />
      <Route path="/hierarchy" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="people" /> : HierarchyWorkspacePage} />
      <Route path="/archive" component={IS_PREVIEW_MODE ? () => <PreviewWorkspace workspace="archive" /> : GovernanceArchivePage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
    </WouterRouter>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster position="top-center" richColors />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
