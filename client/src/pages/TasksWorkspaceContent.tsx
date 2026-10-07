import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TaskAttachmentPreviewDialog } from "@/components/TaskAttachmentPreviewDialog";
import { TaskCommentTimelinePanel } from "@/components/TaskCommentTimelinePanel";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useSelectedUnit } from "@/contexts/SelectedUnitContext";
import { AlertCircle, AlertTriangle, ChevronLeft, ChevronRight, CheckCircle2, CircleDashed, Clock, Copy, Download, FilePlus2, FileText, ListChecks, Loader2, MessageCircle, Paperclip, Pencil, Pin, PinOff, Play, RefreshCcw, Repeat, RotateCw, Search, Send, ShieldAlert, Sparkles, UserRoundCheck, XCircle, ZoomIn, ZoomOut } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { taskWorkCountdownLabel } from "@/lib/work-hours";

type TaskStatus = "new" | "in_progress" | "under_review" | "completed" | "overdue" | "cancelled" | "paused";

function taskStatusLabel(status: TaskStatus) {
  return ({ new: "جديدة", in_progress: "قيد التنفيذ", under_review: "بانتظار تأكيد المدير", completed: "مكتملة", overdue: "متأخرة", cancelled: "ملغاة", paused: "موقوفة" } as const)[status];
}

function recurrenceLabel(task: { templateId?: number | null; recurrence?: string | null; recurrenceInterval?: number | null }) {
  if (!task.templateId || !task.recurrence || task.recurrence === "none") return null;
  const labels: Record<string, string> = {
    daily: "يومي",
    weekly: "أسبوعي",
    monthly: "شهري",
    yearly: "سنوي",
    custom: `كل ${task.recurrenceInterval || 1} أيام`,
  };
  return labels[task.recurrence] || null;
}

function parseSpecificDaysClient(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6);
    } catch {
      /* ignore */
    }
  }
  return [];
}

export function taskTypeLabel(taskType: "permanent" | "urgent" | null | undefined) {
  return taskType === "urgent" ? "عاجلة" : "عادية";
}

export function taskTypeBadgeClasses(taskType: "permanent" | "urgent" | null | undefined) {
  return taskType === "urgent" ? "bg-[#fbe0db] text-[#9d4034] ring-1 ring-[#e8b4a8]" : "bg-[#eef2ed] text-[#52665b] ring-1 ring-[#d9e0db]";
}

/** نص العداد الزمني للمهمة (قرب الاستحقاق أو التأخير). */
export function taskDeadlineText(dueAt: Date | string | number): { text: string; tone: "orange" | "red" } | null {
  const due = new Date(dueAt).getTime();
  if (Number.isNaN(due)) return null;
  const diff = due - Date.now();
  if (diff < 0) {
    const mins = Math.abs(Math.round(diff / 60000));
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return { text: `متأخر ${days} يوم`, tone: "red" };
    if (hours > 0) return { text: `متأخر ${hours} ساعة`, tone: "red" };
    return { text: `متأخر ${mins} دقيقة`, tone: "red" };
  }
  const mins = Math.round(diff / 60000);
  if (mins <= 60) return { text: `متبقي ${mins} دقيقة حتى الاستحقاق`, tone: "red" };
  const hours = Math.round(diff / 3600000);
  if (hours <= 24) return { text: `متبقي ${hours} ساعة حتى الاستحقاق`, tone: "orange" };
  return null;
}

/** نص العداد الزمني الجديد المبني على ساعات العمل (accumulateWorkMinutes) بمراحل دورة الحياة. */
export function taskWorkDeadlineText(task: { scheduledFor?: Date | string | number | null; status?: TaskStatus; isOpen?: boolean }): { text: string; tone: "muted" | "orange" | "red" } | null {
  return taskWorkCountdownLabel({ scheduledFor: task.scheduledFor ?? null, status: task.status, isOpen: task.isOpen });
}

export type DashboardTaskFilterValue = "all" | "active" | "overdue" | "due_soon" | "completed" | "open";
export function taskMatchesDashboardFilter(task: { status: TaskStatus; dueAt: Date | string | number; isOpen?: boolean; scheduledFor?: Date | string | number | null }, filter: DashboardTaskFilterValue) {
  if (filter === "all") return true;
  if (filter === "active") return ["new", "in_progress", "under_review"].includes(task.status);
  if (filter === "open") return Boolean(task.isOpen);
  if (filter === "completed") return task.status === "completed";
  return taskVisualState({ status: task.status, dueAt: task.dueAt, isOpen: task.isOpen, scheduledFor: task.scheduledFor }) === filter;
}

function formatTaskDate(value: Date | string | number | null, isOpen?: boolean) {
  if (isOpen) return "مفتوح";
  if (value == null) return "—";
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function toDatetimeLocal(value: Date | string | number | null) {
  if (value == null) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export type TaskVisualState = "completed" | "overdue" | "due_soon" | "starting" | "normal" | "open";
export function taskVisualState(task: { status: TaskStatus; dueAt: Date | string | number; isOpen?: boolean; scheduledFor?: Date | string | number | null }, now = Date.now()): TaskVisualState {
  if (task.status === "completed") return "completed";
  if (task.isOpen) return "open";
  if (task.status === "overdue" || new Date(task.dueAt).getTime() <= now) return "overdue";
  if (new Date(task.dueAt).getTime() - now <= 24 * 60 * 60 * 1000) return "due_soon";
  if (task.scheduledFor && task.status === "new") {
    const scheduled = new Date(task.scheduledFor).getTime();
    if (Math.abs(scheduled - now) <= 2 * 60 * 60 * 1000) return "starting";
  }
  return "normal";
}

export function taskVisualClasses(state: TaskVisualState) {
  return ({ completed: "border-[#b9d8bf] bg-[#f2f8f2]", overdue: "border-2 border-red-500 bg-red-50 rakiza-task-overdue", due_soon: "border-[#ead594] bg-[#fffaf0] rakiza-task-due-soon", starting: "border-[#9ecfae] bg-[#eef7f1] rakiza-task-starting", open: "border-[#c9d8e8] bg-[#f2f7fb] rakiza-task-open", normal: "border-transparent bg-transparent" } as const)[state];
}

export function taskStateBadgeClasses(state: TaskVisualState) {
  return ({ completed: "bg-[#dff0e2] text-[#216345]", overdue: "bg-[#fbe0db] text-[#9d4034]", due_soon: "bg-[#fff0c2] text-[#80642b]", starting: "bg-[#d9f2e3] text-[#1c6b3f]", open: "bg-[#e3eef5] text-[#2c5d77]", normal: "bg-[#eef2ed] text-[#52665b]" } as const)[state];
}

export function taskStateIcon(state: TaskVisualState): { icon: typeof Play; label: string } {
  return ({ starting: { icon: Play, label: "بدء المهمة" }, due_soon: { icon: AlertTriangle, label: "قرب الاستحقاق" }, overdue: { icon: AlertCircle, label: "تأخير عاجل" }, completed: { icon: CheckCircle2, label: "منجزة" }, open: { icon: CircleDashed, label: "مهمة مفتوحة" }, normal: { icon: CircleDashed, label: "ضمن المسار" } } as const)[state];
}

export function TaskStateBadge({ state, statusLabel, stateText, onActivate }: { state: TaskVisualState; statusLabel: string; stateText: string; onActivate?: () => void }) {
  const { icon: StateIcon, label } = taskStateIcon(state);
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${taskStateBadgeClasses(state)}`}><button type="button" onClick={onActivate} disabled={!onActivate} title={label} aria-label={label} className={`group inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-transform duration-200 ${onActivate ? "cursor-pointer hover:scale-125 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current" : "cursor-default"}`}><StateIcon aria-hidden="true" className="h-4 w-4 transition-transform duration-200 group-hover:rotate-6 group-active:rotate-12" /></button><span>{statusLabel} · {stateText}</span></span>;
}

export function isPreviewableTaskImage(mimeType: string) {
  return mimeType === "image/png" || mimeType === "image/jpeg";
}

export function isPreviewableTaskAttachment(mimeType: string) {
  return isPreviewableTaskImage(mimeType) || mimeType === "application/pdf";
}

export function cycleTaskAttachmentIndex(currentIndex: number, total: number, direction: -1 | 1) {
  if (total <= 0) return -1;
  return (currentIndex + direction + total) % total;
}

export function splitTextByQuery(text: string, query: string) {
  const needle = query.trim();
  if (!needle) return [{ value: text, matches: false }];
  const normalizedText = text.toLocaleLowerCase();
  const normalizedNeedle = needle.toLocaleLowerCase();
  const parts: Array<{ value: string; matches: boolean }> = [];
  let cursor = 0;
  let matchAt = normalizedText.indexOf(normalizedNeedle, cursor);
  while (matchAt >= 0) {
    if (matchAt > cursor) parts.push({ value: text.slice(cursor, matchAt), matches: false });
    parts.push({ value: text.slice(matchAt, matchAt + needle.length), matches: true });
    cursor = matchAt + needle.length;
    matchAt = normalizedText.indexOf(normalizedNeedle, cursor);
  }
  if (cursor < text.length) parts.push({ value: text.slice(cursor), matches: false });
  return parts.length ? parts : [{ value: text, matches: false }];
}

export default function TasksWorkspaceContent() {
  const utils = trpc.useUtils();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const selectedTaskId = useMemo(() => {
    const value = Number(new URLSearchParams(search).get("taskId"));
    return Number.isInteger(value) && value > 0 ? value : null;
  }, [search]);
  const requestedTaskAction = useMemo(() => new URLSearchParams(search).get("action"), [search]);
  const requestedTaskFilter = useMemo(() => new URLSearchParams(search).get("filter") ?? "all", [search]);
  const requestedTab = useMemo(() => new URLSearchParams(search).get("tab") ?? "tasks", [search]);
  const [activeTab, setActiveTab] = useState<"tasks" | "approvals" | "future">(requestedTab === "approvals" ? "approvals" : requestedTab === "future" ? "future" : "tasks");
  useEffect(() => { setActiveTab(requestedTab === "approvals" ? "approvals" : requestedTab === "future" ? "future" : "tasks"); }, [requestedTab]);
  useEffect(() => {
    if (activeTab === "approvals") {
      const el = document.getElementById("task-approvals");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeTab]);
  const permission = trpc.court.registration.myPermission.useQuery();
  const roles = trpc.court.myRoles.useQuery();
  const canAssign = permission.data === "full_control" || roles.data?.some(role => role === "court_president" || role === "assistant_president" || role === "court_secretary" || role === "department_manager" || role === "trainee_affairs_manager");
  const routeTargets = trpc.court.tasks.routeTargets.useQuery(undefined, { enabled: Boolean(canAssign) });
  const people = trpc.court.people.list.useQuery(permission.data === "full_control" ? undefined : { personType: "administrative" });
  const currentProfile = trpc.court.people.self.useQuery();
  const units = trpc.court.units.list.useQuery();
  const holidayInfo = trpc.court.holidays.today.useQuery();
  const { selectedUnitId } = useSelectedUnit();
  const canManageTask = (task: { assigneeProfileId: number | null }) =>
    permission.data === "full_control" ||
    roles.data?.some(role => ["court_president", "assistant_president", "court_secretary", "human_resources_manager", "department_manager", "performance_monitor", "trainee_affairs_manager"].includes(role)) ||
    task.assigneeProfileId === currentProfile.data?.id;
  const [taskView, setTaskView] = useState<"mine" | "scope">("mine");
  const [selectedAssigneeProfileId, setSelectedAssigneeProfileId] = useState<number | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [dueFilter, setDueFilter] = useState<"all" | "overdue" | "dueSoon" | "completed">("all");
  const [futureRange, setFutureRange] = useState<"all" | "current_week" | "next_week" | "end_of_month">("all");
  const platformWide = permission.data === "full_control" || Boolean(roles.data?.some(role => role === "court_president" || role === "assistant_president" || role === "court_secretary"));
  const isManager = canAssign && !platformWide;
  const canDirectEdit = permission.data === "full_control" || Boolean(roles.data?.some(role => ["court_president", "assistant_president", "court_secretary", "human_resources_manager", "department_manager", "performance_monitor", "trainee_affairs_manager", "technical_support_manager"].includes(role)));
  const canReviewApprovals = permission.data !== "full_control" || Boolean(roles.data?.some(role => role === "court_secretary" || role === "court_president"));
  useEffect(() => {
    if (platformWide) setTaskView("scope");
  }, [platformWide]);
  useEffect(() => {
    if (isManager) setTaskView("scope");
  }, [isManager]);
  useEffect(() => {
    if (selectedUnitId) setTaskView("scope");
  }, [selectedUnitId]);
  const taskQuery = taskView === "mine" && currentProfile.data?.id ? { assigneeProfileId: currentProfile.data.id, dueFilter: dueFilter !== "all" ? dueFilter : undefined } : { unitId: selectedUnitId || undefined, assigneeProfileId: selectedAssigneeProfileId || undefined, dueFilter: dueFilter !== "all" ? dueFilter : undefined };
  const tasks = trpc.court.tasks.list.useQuery(taskQuery, { enabled: taskView === "scope" || Boolean(currentProfile.data?.id) });
  const futureTaskQuery = taskView === "mine" && currentProfile.data?.id ? { assigneeProfileId: currentProfile.data.id, futureRange } : { unitId: selectedUnitId || undefined, assigneeProfileId: selectedAssigneeProfileId || undefined, futureRange };
  const futureTasks = trpc.court.tasks.list.useQuery(futureTaskQuery, { enabled: activeTab === "future" && (taskView === "scope" || Boolean(currentProfile.data?.id)) });
  const taskGroups = useMemo(() => {
    const unitNameById = new Map<number, string>();
    for (const unit of units.data ?? []) unitNameById.set(unit.id, unit.name);
    const groups = new Map<number, { unitId: number; unitName: string; tasks: Array<{ id: number; title: string }> }>();
    for (const task of tasks.data ?? []) {
      const uid = (task as { unitId?: number | null }).unitId ?? 0;
      if (!groups.has(uid)) groups.set(uid, { unitId: uid, unitName: unitNameById.get(uid) ?? "غير مسند", tasks: [] });
      groups.get(uid)!.tasks.push({ id: task.id, title: task.title });
    }
    return [...groups.values()].sort((a, b) => a.unitName.localeCompare(b.unitName, "ar"));
  }, [tasks.data, units.data]);
  const conversations = trpc.court.communications.conversations.list.useQuery();
  const create = trpc.court.tasks.create.useMutation({
    onSuccess: () => { utils.court.tasks.list.invalidate(); setIsRecurring(false); setRecurrence("daily"); setIntervalDays(1); toast.success("تم إسناد المهمة وإشعار المكلف والنسخة المختارة."); },
  });
  const createSelf = trpc.court.tasks.createSelf.useMutation({
    onSuccess: () => { utils.court.tasks.list.invalidate(); setSelfForm({ title: "", priority: "normal", taskType: "permanent", taskNotes: "", scheduledFor: "", dueAt: "", isOpen: false }); toast.success("تم حفظ المهمة الذاتية وإشعار المدير المباشر للمراجعة."); },
  });
  const autoAssign = trpc.court.tasks.autoAssign.useMutation({
    onSuccess: result => { utils.court.tasks.list.invalidate(); toast.success(`تم توزيع ${result.assigned} مهمة، و${result.skipped} مهمة لم يتم إسنادها.`); },
    onError: error => toast.error(error.message || "تعذر التوزيع التلقائي."),
  });
  const update = trpc.court.tasks.update.useMutation({
    onSuccess: () => { utils.court.tasks.list.invalidate(); setEditDialog(null); toast.success("تم حفظ تعديلات المهمة."); },
    onError: error => toast.error(error.message || "تعذر تعديل المهمة."),
  });
  const requestModification = trpc.court.tasks.requestModification.useMutation({
    onSuccess: () => { utils.court.tasks.list.invalidate(); setModificationDialog(null); setModificationReason(""); toast.success("تم إرسال طلب التعديل للمدير للمراجعة."); },
    onError: error => toast.error(error.message || "تعذر إرسال طلب التعديل."),
  });
  const cancel = trpc.court.tasks.cancel.useMutation({
    onSuccess: () => { utils.court.tasks.list.invalidate(); setCancelDialog(null); setCancelReason(""); toast.success("تم إلغاء المهمة."); },
    onError: error => toast.error(error.message || "تعذر إلغاء المهمة."),
  });
  const acknowledge = trpc.court.tasks.acknowledge.useMutation({
    onSuccess: result => { utils.court.tasks.list.invalidate(); toast.success(result.earlyStartRewarded ? "تم بدء المهمة مبكراً وإضافة مكافأة إلى سجل الإنجاز." : "تم استلام المهمة وبدء التنفيذ."); },
    onError: error => { toast.error(error.message || "تعذر بدء المهمة حالياً."); },
  });
  const submitForReviewRequest = trpc.court.tasks.submitForReview.useMutation({
    onSuccess: (_result, input) => { utils.court.tasks.list.invalidate(); setCompletionConfirmDialog(null); setCompletionNote(""); setCompletionSuccessTaskId(input.taskId); toast.success("تم إتمام المهمة وإرسالها للمدير المباشر للمراجعة والاعتماد."); },
  });
  const submitForApprovalRequest = trpc.court.tasks.submitForApproval.useMutation({
    onSuccess: (_result, input) => { utils.court.tasks.list.invalidate(); setCompletionConfirmDialog(null); setCompletionNote(""); setCompletionSuccessTaskId(input.taskId); toast.success("تم إتمام المهمة وإرسالها للمدير للاعتماد."); },
    onError: error => toast.error(error.message || "تعذر إرسال المهمة للاعتماد."),
  });
  const submitForReview = {
    get isPending() { return submitForReviewRequest.isPending; },
    get error() { return submitForReviewRequest.error; },
    mutate: ({ taskId }: { taskId: number }) => {
      const task = tasks.data?.find(item => item.id === taskId);
      if (task) { setCompletionNote(""); setCompletionConfirmDialog({ taskId, title: task.title }); }
    },
  };
  const progressNote = trpc.court.tasks.addProgressNote.useMutation({
    onSuccess: (_result, input) => { utils.court.tasks.list.invalidate(); utils.court.tasks.timeline.invalidate({ taskId: input.taskId }); toast.success("تم حفظ التعليق في سجل المهمة."); },
  });
  const comment = {
    get isPending() { return progressNote.isPending; },
    get error() { return progressNote.error; },
    mutate: ({ taskId, comment: note }: { taskId: number; comment: string }) => progressNote.mutate({ taskId, note }),
  };
  const taskAttachmentsProcedure = trpc.court.tasks.attachments?.list;
  const taskAttachmentsUploadProcedure = trpc.court.tasks.attachments?.upload;
  const taskAttachmentsDownloadProcedure = (trpc.court.tasks.attachments as any)?.download;
  const taskAttachmentsDeleteProcedure = (trpc.court.tasks.attachments as any)?.delete;
  const updateStatus = trpc.court.tasks.updateStatus.useMutation({
    onSuccess: () => { utils.court.tasks.list.invalidate(); toast.success("تم تحديث حالة المهمة وتسجيل التعديل القيادي."); },
  });
  const routeTask = trpc.court.tasks.route.useMutation({
    onSuccess: (result, input) => { utils.court.tasks.list.invalidate(); utils.court.tasks.timeline.invalidate({ taskId: input.taskId }); setRouteDialog(null); setRouteReason(""); setRouteTargetProfileId(""); toast.success(`تمت إحالة المهمة إلى ${result.targetName}.`); },
  });
  const pendingExceptionRequests = trpc.court.tasks.exceptions.pendingForManager.useQuery();
  const requestException = trpc.court.tasks.exceptions.request.useMutation({
    onSuccess: (_result, input) => {
      utils.court.tasks.list.invalidate();
      utils.court.tasks.exceptions.pendingForManager.invalidate();
      setExceptionDialog(null);
      setExceptionReason("");
      toast.success(input.kind === "reassignment" ? "أُحيل طلب إعادة الإسناد إلى المدير المباشر." : "أُحيل بلاغ العائق إلى المدير المباشر.");
    },
    onError: (error: { message?: string }) => {
      toast.error(error?.message || "تعذر إرسال البلاغ. حاول مرة أخرى.");
    },
  });
  const decideException = trpc.court.tasks.exceptions.decide.useMutation({
    onSuccess: () => {
      utils.court.tasks.list.invalidate();
      utils.court.tasks.exceptions.pendingForManager.invalidate();
      setDecisionRequestId(null);
      setDecisionNote("");
      setDecisionAssigneeId("");
      toast.success("تم توثيق قرار المدير وإشعار المعنيين.");
    },
  });
  const pendingModifications = trpc.court.tasks.listModificationRequests.useQuery({ status: "pending" }, { enabled: canDirectEdit });
  const reviewModificationMutation = trpc.court.tasks.reviewModification.useMutation({
    onSuccess: () => { utils.court.tasks.list.invalidate(); utils.court.tasks.listModificationRequests.invalidate(); setModificationReviewNote(""); setModificationReviewRequestId(null); toast.success("تم تسجيل قرارك على طلب التعديل."); },
    onError: error => toast.error(error.message || "تعذر البت في الطلب."),
  });
  const [modificationReviewRequestId, setModificationReviewRequestId] = useState<number | null>(null);
  const [modificationReviewNote, setModificationReviewNote] = useState("");
  const pendingTaskApprovals = trpc.court.tasks.listPendingApprovals.useQuery(undefined, { enabled: canDirectEdit });
  const pendingDisciplinary = trpc.court.disciplinary.myTeam.useQuery(undefined, { enabled: canDirectEdit, retry: false });
  const reviewApprovalMutation = trpc.court.tasks.reviewApproval.useMutation({
    onSuccess: (result) => { utils.court.tasks.list.invalidate(); utils.court.tasks.listPendingApprovals.invalidate(); if (approvalDetails) utils.court.tasks.details.invalidate({ taskId: approvalDetails.taskId }); if (detailsTaskId) utils.court.tasks.details.invalidate({ taskId: detailsTaskId }); setApprovalReviewId(null); setApprovalReviewNote(""); setRejectReason(""); setRejectDialogOpen(false); setApproveDialogOpen(false); setApprovalDetails(null); setDetailsTaskId(null); toast.success(result.pointsAwarded > 0 ? `تم الاعتماد ومنح ${result.pointsAwarded} نقطة إنجاز.` : "تم تسجيل قرار الاعتماد."); },
    onError: (error) => { console.error("Approval error:", error); toast.error(error?.message || "تعذر البت في الاعتماد."); },
  });
  const [approvalReviewId, setApprovalReviewId] = useState<number | null>(null);
  const [approvalReviewNote, setApprovalReviewNote] = useState("");
  const [approvalRating, setApprovalRating] = useState<"excellent" | "good" | "acceptable">("good");
  const [approvalDetails, setApprovalDetails] = useState<{ taskId: number; approvalId: number; title: string } | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [selectedApprovalIds, setSelectedApprovalIds] = useState<number[]>([]);
  const bulkReviewApprovalsMutation = trpc.court.tasks.bulkReviewApprovals.useMutation({
    onSuccess: (result) => { utils.court.tasks.list.invalidate(); utils.court.tasks.listPendingApprovals.invalidate(); setSelectedApprovalIds([]); toast.success(`تمت معالجة ${result.processed} اعتماد${result.failed ? ` · تعذر ${result.failed}` : ""}.`); },
    onError: error => toast.error(error.message || "تعذر تنفيذ الاعتماد المجمع."),
  });
  const toggleApprovalSelection = (id: number) => setSelectedApprovalIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const allApprovalsSelected = (pendingTaskApprovals.data?.length ?? 0) > 0 && (pendingTaskApprovals.data ?? []).every(row => selectedApprovalIds.includes(row.approval.id));
  const toggleSelectAllApprovals = () => setSelectedApprovalIds(allApprovalsSelected ? [] : (pendingTaskApprovals.data ?? []).map(row => row.approval.id));
  const [commentDialog, setCommentDialog] = useState<{ taskId: number; title: string } | null>(null);
  const [commentText, setCommentText] = useState("");
  const [detailsComment, setDetailsComment] = useState("");
  const [reassignmentDialog, setReassignmentDialog] = useState<{ taskId: number; title: string } | null>(null);
  const [reassignmentReason, setReassignmentReason] = useState("");
  const [obstacleDialog, setObstacleDialog] = useState<{ taskId: number; title: string } | null>(null);
  const [obstacleDetail, setObstacleDetail] = useState("");
  const [detailsTaskId, setDetailsTaskId] = useState<number | null>(null);
  const taskDetails = trpc.court.tasks.details.useQuery({ taskId: detailsTaskId ?? 0 }, { enabled: Boolean(detailsTaskId) });
  const approvalTaskDetails = trpc.court.tasks.details.useQuery({ taskId: approvalDetails?.taskId ?? 0 }, { enabled: Boolean(approvalDetails?.taskId) });
  const markAsProcessed = trpc.court.tasks.markAsProcessed.useMutation({
    onSuccess: () => { utils.court.tasks.list.invalidate(); toast.success("تمت معالجة المهمة وتسجيل وقت الإتمام."); },
  });
  const addTaskCommentMutation = trpc.court.tasks.addComment.useMutation({
    onSuccess: (_result, input) => { utils.court.tasks.details.invalidate({ taskId: input.taskId }); utils.court.tasks.list.invalidate(); setCommentDialog(null); setCommentText(""); setDetailsComment(""); toast.success("تم حفظ التعليق في جدول التعليقات."); },
  });
  const reportObstacleMutation = trpc.court.tasks.reportObstacle.useMutation({
    onSuccess: () => { utils.court.tasks.list.invalidate(); setObstacleDialog(null); setObstacleDetail(""); toast.success("تم تسجيل العائق وإشعار الرئيس والأمين."); },
  });
  const requestReassignmentMutation = trpc.court.tasks.requestReassignment.useMutation({
    onSuccess: () => { utils.court.tasks.list.invalidate(); setReassignmentDialog(null); setReassignmentReason(""); toast.success("أُحيل طلب إعادة الإسناد إلى المدير المباشر."); },
  });
  const [extensionDialog, setExtensionDialog] = useState<{ taskId: number; title: string } | null>(null);
  const [extensionReason, setExtensionReason] = useState("");
  const [extensionDueAt, setExtensionDueAt] = useState("");
  const requestExtensionMutation = trpc.court.tasks.requestExtension.useMutation({
    onSuccess: () => { utils.court.tasks.list.invalidate(); setExtensionDialog(null); setExtensionReason(""); setExtensionDueAt(""); toast.success("تم طلب تمديد الموعد وتسجيله في سجل المهمة."); },
    onError: (error: { message?: string }) => toast.error(error.message || "تعذر طلب التمديد."),
  });
  const setPinned = trpc.court.tasks.setPinned.useMutation({
    onSuccess: () => { utils.court.tasks.list.invalidate(); },
  });
  const setNotes = trpc.court.tasks.setNotes.useMutation({
    onSuccess: () => { utils.court.tasks.list.invalidate(); },
  });
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});
  const [form, setForm] = useState({ title: "", priority: "normal" as "normal" | "high" | "critical", taskType: "permanent" as "permanent" | "urgent", taskNotes: "", attachments: [] as { originalName: string; mimeType: string; contentBase64: string }[], assigneeProfileId: "", watcherProfileId: "", scheduledFor: "", dueAt: "", recurrenceEndAt: "", isConfidential: false, confidentialityExpiresAt: "", isOpen: false });
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState<"daily" | "weekly" | "monthly" | "yearly" | "custom" | "specific_days">("daily");
  const [intervalDays, setIntervalDays] = useState(1);
  const [specificDays, setSpecificDays] = useState<number[]>([]);
  const [assigneeUnitId, setAssigneeUnitId] = useState("");
  useEffect(() => { if (isManager && currentProfile.data?.unitId && !assigneeUnitId) setAssigneeUnitId(String(currentProfile.data.unitId)); }, [isManager, currentProfile.data?.unitId, assigneeUnitId]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [watcherUnitId, setWatcherUnitId] = useState("");
  const [selfForm, setSelfForm] = useState({ title: "", priority: "normal" as "normal" | "high" | "critical", taskType: "permanent" as "permanent" | "urgent", taskNotes: "", scheduledFor: "", dueAt: "", isOpen: false });
  const [traineeCopyValue, setTraineeCopyValue] = useState("none");
  const [traineeCopyUnitId, setTraineeCopyUnitId] = useState("");
  const [comments, setComments] = useState<Record<number, string>>({});
  const [routeTargetsByTask, setRouteTargetsByTask] = useState<Record<number, string>>({});
  const [exceptionDialog, setExceptionDialog] = useState<{ taskId: number; kind: "reassignment" | "obstacle"; title: string } | null>(null);
  const openedObstacleTaskRef = useRef<number | null>(null);
  const [exceptionReason, setExceptionReason] = useState("");
  const [decisionRequestId, setDecisionRequestId] = useState<number | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [decisionAssigneeId, setDecisionAssigneeId] = useState("");
  const [routeDialog, setRouteDialog] = useState<{ taskId: number; title: string } | null>(null);
  const [routeTargetProfileId, setRouteTargetProfileId] = useState("");
  const [routeReason, setRouteReason] = useState("");
  const [completionConfirmDialog, setCompletionConfirmDialog] = useState<{ taskId: number; title: string } | null>(null);
  const [completionNote, setCompletionNote] = useState("");
  const [completionSuccessTaskId, setCompletionSuccessTaskId] = useState<number | null>(null);
  const [editDialog, setEditDialog] = useState<{ taskId: number } | null>(null);
  const [editForm, setEditForm] = useState({ title: "", taskNotes: "", priority: "normal" as "normal" | "high" | "critical", taskType: "permanent" as "permanent" | "urgent", scheduledFor: "", dueAt: "", isOpen: false, assigneeProfileId: "" });
  const [editUnitId, setEditUnitId] = useState("");
  const [editRecurrence, setEditRecurrence] = useState<"none" | "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "custom" | "specific_days">("none");
  const [editIntervalDays, setEditIntervalDays] = useState(1);
  const [editSpecificDays, setEditSpecificDays] = useState<number[]>([]);
  const [modificationDialog, setModificationDialog] = useState<{ taskId: number; title: string } | null>(null);
  const [modificationTitle, setModificationTitle] = useState("");
  const [modificationNotes, setModificationNotes] = useState("");
  const [modificationPriority, setModificationPriority] = useState<"normal" | "high" | "critical">("normal");
  const [modificationDueAt, setModificationDueAt] = useState("");
  const [modificationReason, setModificationReason] = useState("");
  const [cancelDialog, setCancelDialog] = useState<{ taskId: number; title: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [taskWorkspaceId, setTaskWorkspaceId] = useState<number | null>(null);
  const [workspaceUnitId, setWorkspaceUnitId] = useState<number | null>(null);
  const [taskAttachment, setTaskAttachment] = useState<{ originalName: string; mimeType: string; contentBase64: string } | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<{ id: number; originalName: string; storageUrl: string | null; mimeType: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [imageScale, setImageScale] = useState(1);
  const [imageRotation, setImageRotation] = useState(0);
  const [extractedTextByAttachment, setExtractedTextByAttachment] = useState<Record<number, string>>({});
  const [translatedTextByAttachment, setTranslatedTextByAttachment] = useState<Record<number, { text: string; language: string }>>({});
  const [textSearch, setTextSearch] = useState("");
  const [targetLanguage, setTargetLanguage] = useState<"en" | "fr" | "ur" | "tr" | "hi" | "bn">("en");
  const activePeople = (people.data ?? []).filter(person => person.status === "active" || person.status === "on_leave");
  const trainees = activePeople.filter(person => person.personType === "trainee");
  const assigneeCandidates = useMemo(() => assigneeUnitId ? activePeople.filter(p => p.unitId === Number(assigneeUnitId)) : [], [activePeople, assigneeUnitId]);
  const editAssigneeCandidates = editUnitId ? activePeople.filter(p => p.unitId === Number(editUnitId)) : activePeople;
  const watcherCandidates = useMemo(() => watcherUnitId ? activePeople.filter(p => p.unitId === Number(watcherUnitId)) : [], [activePeople, watcherUnitId]);
  const traineeCopyCandidates = useMemo(() => traineeCopyUnitId ? trainees.filter(p => p.unitId === Number(traineeCopyUnitId)) : [], [trainees, traineeCopyUnitId]);
  const suggestAssignees = trpc.court.tasks.suggestAssignees.useQuery(
    { unitId: Number(assigneeUnitId) },
    { enabled: suggestOpen && Boolean(assigneeUnitId) },
  );
  useEffect(() => {
    const first = suggestAssignees.data?.[0];
    if (suggestOpen && first && !form.assigneeProfileId) {
      setForm(current => ({ ...current, assigneeProfileId: String(first.profileId) }));
    }
  }, [suggestOpen, suggestAssignees.data, form.assigneeProfileId]);
  const selectedTask = tasks.data?.find(task => task.id === selectedTaskId);
  const workspaceTask = tasks.data?.find(task => task.id === taskWorkspaceId);
  const taskAttachments = taskAttachmentsProcedure?.useQuery ? taskAttachmentsProcedure.useQuery({ taskId: taskWorkspaceId ?? 1 }, { enabled: Boolean(taskWorkspaceId) }) : { data: [] as Array<{ id: number; originalName: string; mimeType: string; sizeBytes: number; storageUrl: string }>, isLoading: false, error: null };
  const taskAttachmentTextProcedure = trpc.court.tasks.attachments?.extractText;
  const extractAttachmentText = taskAttachmentTextProcedure?.useMutation ? taskAttachmentTextProcedure.useMutation({
    onSuccess: (result, input) => { setExtractedTextByAttachment(current => ({ ...current, [input.attachmentId]: result.text })); toast.success(result.text ? "تم استخراج النص من المرفق." : "لم يُعثر على نص قابل للاستخراج في المرفق."); },
  }) : { isPending: false, error: null, mutate: () => toast.error("استخراج النص غير متاح في هذه النسخة من الواجهة.") };
  const taskAttachmentTranslationProcedure = trpc.court.tasks.attachments?.translateText;
  const translateAttachmentText = taskAttachmentTranslationProcedure?.useMutation ? taskAttachmentTranslationProcedure.useMutation({
    onSuccess: (result, input) => { setTranslatedTextByAttachment(current => ({ ...current, [input.attachmentId]: { text: result.translation, language: result.targetLanguage } })); toast.success("تمت ترجمة النص المستخرج."); },
  }) : { isPending: false, error: null, mutate: () => toast.error("ترجمة النص غير متاحة في هذه النسخة من الواجهة.") };
  const uploadTaskAttachment = taskAttachmentsUploadProcedure?.useMutation ? taskAttachmentsUploadProcedure.useMutation({
    onSuccess: () => { utils.court.tasks.list.invalidate(); if (taskWorkspaceId) utils.court.tasks.attachments.list.invalidate({ taskId: taskWorkspaceId }); toast.success("تم حفظ المرفق في سجل المهمة."); setTaskAttachment(null); },
    onError: (error: any) => toast.error(error?.message || "تعذر رفع المرفق."),
  }) : { isPending: false, error: null, mutate: () => toast.error("رفع المرفقات غير متاح في هذه النسخة من الواجهة.") };

  const downloadTaskAttachment = taskAttachmentsDownloadProcedure?.useMutation ? taskAttachmentsDownloadProcedure.useMutation({
    onSuccess: (result: { fileName: string; mimeType: string; contentBase64: string }) => {
      try {
        const bytes = Uint8Array.from(atob(result.contentBase64), c => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: result.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = result.fileName; document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        toast.success("تم تحميل المرفق");
      } catch (error) {
        toast.error("تعذر تنزيل المرفق.");
      }
    },
    onError: (error: any) => toast.error(error?.message || "تعذر تنزيل المرفق."),
  }) : { isPending: false, mutate: () => toast.error("تنزيل المرفقات غير متاح في هذه النسخة من الواجهة.") };
  const [deleteAttachmentTarget, setDeleteAttachmentTarget] = useState<{ id: number; originalName: string } | null>(null);
  const deleteTaskAttachment = taskAttachmentsDeleteProcedure?.useMutation ? taskAttachmentsDeleteProcedure.useMutation({
    onSuccess: () => { if (taskWorkspaceId) utils.court.tasks.attachments.list.invalidate({ taskId: taskWorkspaceId }); toast.success("تم حذف المرفق."); setDeleteAttachmentTarget(null); },
    onError: (error: any) => toast.error(error?.message || "تعذر حذف المرفق."),
  }) : { isPending: false, mutate: () => toast.error("حذف المرفقات غير متاح في هذه النسخة من الواجهة.") };
  const actionTasks = (tasks.data ?? []).filter(task => task.assigneeProfileId === currentProfile.data?.id && task.status !== "completed" && task.status !== "cancelled");
  const mentionCandidates = activePeople.filter(person => person.id !== currentProfile.data?.id);
  const visibleTasks = useMemo(() => {
    const filter = requestedTaskFilter as DashboardTaskFilterValue;
    let filtered = filter === "all" ? (tasks.data ?? []) : (tasks.data ?? []).filter(task => taskMatchesDashboardFilter({ status: task.status as TaskStatus, dueAt: task.dueAt, isOpen: task.isOpen, scheduledFor: task.scheduledFor }, filter));
    if (!showCompleted && dueFilter !== "completed") filtered = filtered.filter(task => task.status !== "completed" && task.status !== "cancelled");
    return [...filtered].sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));
  }, [tasks.data, requestedTaskFilter, showCompleted, dueFilter]);

  useEffect(() => {
    if (completionSuccessTaskId === null) return;
    const timer = window.setTimeout(() => setCompletionSuccessTaskId(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [completionSuccessTaskId]);
  const selectedDecisionRequest = pendingExceptionRequests.data?.find(row => row.request.id === decisionRequestId);
  const decisionCandidates = selectedDecisionRequest ? activePeople.filter(person => person.id !== selectedDecisionRequest.request.requesterProfileId && (!selectedDecisionRequest.task.unitId || person.unitId === selectedDecisionRequest.task.unitId)) : [];
  const previewableAttachments = (taskAttachments.data ?? []).filter(attachment => isPreviewableTaskAttachment(attachment.mimeType));
  const previewIndex = attachmentPreview ? previewableAttachments.findIndex(attachment => attachment.id === attachmentPreview.id) : -1;
  const extractedPreviewText = attachmentPreview ? extractedTextByAttachment[attachmentPreview.id] : undefined;
  const translatedPreview = attachmentPreview ? translatedTextByAttachment[attachmentPreview.id] : undefined;
  const textSearchParts = extractedPreviewText ? splitTextByQuery(extractedPreviewText, textSearch) : [];
  const textMatchCount = textSearchParts.filter(part => part.matches).length;

  const openAttachmentPreview = (attachment: { id: number; originalName: string; storageUrl: string | null; mimeType: string }) => {
    setImageScale(1);
    setImageRotation(0);
    setPreviewLoading(true);
    setAttachmentPreview(attachment);
  };

  const navigateAttachmentPreview = (direction: -1 | 1) => {
    const nextIndex = cycleTaskAttachmentIndex(previewIndex, previewableAttachments.length, direction);
    const next = previewableAttachments[nextIndex];
    if (next) openAttachmentPreview(next);
  };

  const downloadExtractedText = () => {
    if (!attachmentPreview || !extractedPreviewText) return;
    const baseName = attachmentPreview.originalName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9\u0600-\u06FF._-]+/g, "_").slice(0, 100) || "extracted-text";
    const file = new Blob([extractedPreviewText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${baseName}-text.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const canOpenObstacle = requestedTaskAction === "obstacle" && selectedTask && selectedTask.status !== "completed" && selectedTask.status !== "cancelled";
    if (!canOpenObstacle || openedObstacleTaskRef.current === selectedTask.id) return;
    openedObstacleTaskRef.current = selectedTask.id;
    setObstacleDetail("");
    setObstacleDialog({ taskId: selectedTask.id, title: selectedTask.title });
  }, [requestedTaskAction, selectedTask, currentProfile.data?.id]);

  useEffect(() => {
    const previewAttachment = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link) return;
      const attachment = taskAttachments.data?.find(item => item.storageUrl === link.href || item.storageUrl === link.getAttribute("href"));
      if (!attachment || !isPreviewableTaskAttachment(attachment.mimeType)) return;
      event.preventDefault();
      openAttachmentPreview(attachment);
    };
    document.addEventListener("click", previewAttachment);
    return () => document.removeEventListener("click", previewAttachment);
  }, [taskAttachments.data]);

  const submitSelf = (event: FormEvent) => {
    event.preventDefault();
    createSelf.mutate({ title: selfForm.title, priority: selfForm.priority, taskType: selfForm.taskType, taskNotes: selfForm.taskNotes.trim() || undefined, scheduledFor: new Date(selfForm.scheduledFor), dueAt: selfForm.isOpen ? new Date("2099-12-31T23:59:59Z") : new Date(selfForm.dueAt), isOpen: selfForm.isOpen });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const selectedCopy = traineeCopyValue === "none" ? undefined : Number(traineeCopyValue);
    if (!form.assigneeProfileId) { toast.error("اختر المكلف بالمهمة قبل الإسناد."); return; }
    if (selectedCopy && !trainees.some(person => person.id === selectedCopy)) { toast.error("الملازم المختار كنسخة تنبيه لم يعد نشطاً."); return; }
    create.mutate({
      title: form.title,
      priority: form.priority,
      taskType: form.taskType,
      taskNotes: form.taskNotes.trim() || undefined,
      attachments: form.attachments.length ? form.attachments : undefined,
      assigneeProfileId: Number(form.assigneeProfileId),
      unitId: assigneeUnitId ? Number(assigneeUnitId) : undefined,
      traineeCopyProfileId: selectedCopy,
      scheduledFor: new Date(form.scheduledFor),
      dueAt: form.isOpen ? new Date("2099-12-31T23:59:59Z") : new Date(form.dueAt),
      isOpen: form.isOpen,
      watcherProfileId: form.watcherProfileId ? Number(form.watcherProfileId) : undefined,
      recurrence: isRecurring ? recurrence : "none",
      recurrenceInterval: recurrence === "custom" ? intervalDays : 1,
      specificDays: recurrence === "specific_days" ? specificDays : undefined,
      recurrenceEndAt: form.recurrenceEndAt ? new Date(form.recurrenceEndAt) : undefined,
      isConfidential: form.isConfidential,
      confidentialityExpiresAt: form.confidentialityExpiresAt ? new Date(form.confidentialityExpiresAt) : undefined,
    });
  };

  const openEditDialog = (task: {
    id: number;
    title: string;
    taskNotes: string | null;
    priority: "normal" | "high" | "critical";
    taskType: "permanent" | "urgent" | null;
    scheduledFor: Date | string | number;
    dueAt: Date | string | number;
    isOpen: boolean;
    assigneeProfileId: number | null;
    unitId: number | null;
    recurrence?: string | null;
    recurrenceInterval?: number | null;
    specificDays?: unknown;
  }) => {
    setEditForm({
      title: task.title,
      taskNotes: task.taskNotes ?? "",
      priority: task.priority,
      taskType: task.taskType ?? "permanent",
      scheduledFor: toDatetimeLocal(task.scheduledFor),
      dueAt: task.isOpen ? "" : toDatetimeLocal(task.dueAt),
      isOpen: Boolean(task.isOpen),
      assigneeProfileId: task.assigneeProfileId ? String(task.assigneeProfileId) : "",
    });
    setEditUnitId(task.unitId ? String(task.unitId) : "");
    setEditRecurrence((task.recurrence && task.recurrence !== "none" ? task.recurrence : "none") as typeof editRecurrence);
    setEditIntervalDays(task.recurrenceInterval ?? 1);
    setEditSpecificDays(parseSpecificDaysClient(task.specificDays));
    setEditDialog({ taskId: task.id });
  };

  const openModificationDialog = (task: { id: number; title: string; taskNotes: string | null; priority: "normal" | "high" | "critical"; dueAt: Date | string | number }) => {
    setModificationTitle(task.title);
    setModificationNotes(task.taskNotes ?? "");
    setModificationPriority(task.priority);
    setModificationDueAt(toDatetimeLocal(task.dueAt));
    setModificationReason("");
    setModificationDialog({ taskId: task.id, title: task.title });
  };

  const submitEdit = (event: FormEvent) => {
    event.preventDefault();
    if (!editDialog) return;
    if (editForm.title.trim().length < 3) { toast.error("العنوان قصير جداً."); return; }
    if (!editForm.scheduledFor) { toast.error("حدد موعد بدء المهمة."); return; }
    update.mutate({
      taskId: editDialog.taskId,
      title: editForm.title,
      taskNotes: editForm.taskNotes.trim() || null,
      priority: editForm.priority,
      taskType: editForm.taskType,
      scheduledFor: new Date(editForm.scheduledFor),
      dueAt: editForm.isOpen ? new Date("2099-12-31T23:59:59Z") : new Date(editForm.dueAt),
      isOpen: editForm.isOpen,
      assigneeProfileId: editForm.assigneeProfileId ? Number(editForm.assigneeProfileId) : null,
      unitId: editUnitId ? Number(editUnitId) : null,
      recurrence: editRecurrence,
      recurrenceInterval: editRecurrence === "custom" ? editIntervalDays : null,
      specificDays: editRecurrence === "specific_days" ? editSpecificDays : null,
    });
  };

  const submitCancel = () => {
    if (!cancelDialog) return;
    if (cancelReason.trim().length < 3) { toast.error("سبب الإلغاء يجب أن يكون 3 أحرف على الأقل."); return; }
    cancel.mutate({ taskId: cancelDialog.taskId, cancellationReason: cancelReason.trim() });
  };

  const runAutoAssign = () => {
    const unassignedCount = (tasks.data ?? []).filter(task => task.assigneeProfileId == null).length;
    const scopeLabel = selectedUnitId ? "القسم المحدد" : (platformWide ? "كل الأقسام" : "نطاق الإدارة");
    const message = unassignedCount
      ? `سيتم توزيع ${unassignedCount} مهمة غير مسندة في ${scopeLabel}. هل أنت متأكد؟`
      : `سيتم توزيع كل المهام غير المسندة في ${scopeLabel}. هل أنت متأكد؟`;
    if (window.confirm(message)) autoAssign.mutate({ unitId: selectedUnitId ?? undefined });
  };

  if (activeTab === "future") {
    return <section className="mx-auto max-w-6xl px-3 sm:px-4 md:px-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div><p className="text-xs font-bold tracking-[0.14em] text-[#b18448]">تشغيل ومتابعة</p><h1 className="mt-2 text-3xl font-bold text-[#12352f]">المهام المستقبلية</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-[#65766d]">عرض المهام المجدولة لوقت لاحق دون إمكانية العمل عليها قبل موعدها.</p></div>
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e9f0ea] text-[#1f5a47]"><ListChecks className="h-6 w-6" /></div>
      </header>
      <div className="mt-5 flex gap-2 rounded-2xl border border-[#e7e0d4] bg-white p-2" role="tablist" aria-label="عرض المهام">
        <Button type="button" size="sm" variant="outline" onClick={() => { setActiveTab("tasks"); setLocation("/tasks"); }}><ListChecks className="ml-1 h-4 w-4" />المهام والمتابعة</Button>
        <Button type="button" size="sm" variant="default" className="bg-[#8a6731]"><Clock className="ml-1 h-4 w-4" />📅 مهام مستقبلية {futureTasks.data?.length ? <span className="ml-1 rounded-full bg-[#2f7653] px-1.5 text-[10px] text-white">{futureTasks.data.length}</span> : null}</Button>
        {canDirectEdit && <Button type="button" size="sm" variant="outline" onClick={() => setActiveTab("approvals")}><CheckCircle2 className="ml-1 h-4 w-4" />الاعتمادات</Button>}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {(["all", "current_week", "next_week", "end_of_month"] as const).map(range => <Button key={range} type="button" size="sm" variant={futureRange === range ? "default" : "outline"} onClick={() => setFutureRange(range)} className={futureRange === range ? "bg-[#2f7653]" : ""}>{range === "all" ? "📅 الكل" : range === "current_week" ? "📅 الأسبوع الحالي" : range === "next_week" ? "📅 الأسبوع القادم" : "📅 حتى نهاية الشهر"}</Button>)}
      </div>
      <div className="mt-5 rounded-2xl border border-[#e7e0d4] bg-white p-5">
        {futureTasks.isLoading ? <p className="py-6 text-center text-sm text-[#6e7e75]">جارٍ تحميل المهام المستقبلية…</p> : futureTasks.data?.length ? <div className="divide-y divide-[#eee8de]">{futureTasks.data.map(task => <article key={task.id} className="flex flex-col gap-2 py-4 opacity-70 pointer-events-none"><div className="flex flex-wrap items-center justify-between gap-2"><p className="break-words font-bold text-[#26473a]">{task.title}</p><span className="rounded-full bg-[#fff3d6] px-2 py-0.5 text-[11px] font-bold text-[#a8601f]">⏳ لم يحن الموعد بعد</span></div><p className="text-xs text-[#75837c]">موعد البدء: {formatTaskDate(task.scheduledFor)} · الاستحقاق: {formatTaskDate(task.dueAt, task.isOpen)}</p></article>)}</div> : <p className="py-10 text-center text-sm text-[#738179]">لا توجد مهام مستقبلية ضمن هذا النطاق.</p>}
      </div>
    </section>;
  }

  return <section className="mx-auto max-w-6xl px-3 sm:px-4 md:px-6">
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div><p className="text-xs font-bold tracking-[0.14em] text-[#b18448]">تشغيل ومتابعة</p><h1 className="mt-2 text-3xl font-bold text-[#12352f]">{canAssign ? "المهام والمتابعة" : "مهامي وطلباتي"}</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-[#65766d]">{canAssign ? "إسناد مباشر ومتابعة مسار المعالجة، مع اختيار ملازم كنسخة تنبيه عند الحاجة." : "تظهر هنا المهام المخولة لك فقط، ويمكنك تأكيد المعالجة أو إرسال تعليق ضمن المسار المعتمد."}</p></div><div className="flex items-center gap-2"><Button type="button" onClick={() => setLocation("/correspondence?type=request")} variant="outline" className="border-[#b6d5bd] text-[#1d6243]"><Send className="ml-1 h-4 w-4" />إنشاء طلب</Button><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e9f0ea] text-[#1f5a47]"><ListChecks className="h-6 w-6" /></div></div>
    </header>
    <div className="mt-5 flex gap-2 rounded-2xl border border-[#e7e0d4] bg-white p-2" role="tablist" aria-label="عرض المهام">
      <Button type="button" size="sm" variant={activeTab === "tasks" ? "default" : "outline"} onClick={() => { setActiveTab("tasks"); setLocation("/tasks"); }} className={activeTab === "tasks" ? "bg-[#12352f]" : ""}><ListChecks className="ml-1 h-4 w-4" />المهام والمتابعة</Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setActiveTab("future")} className=""><Clock className="ml-1 h-4 w-4" />📅 مهام مستقبلية {futureTasks.data?.length ? <span className="ml-1 rounded-full bg-[#2f7653] px-1.5 text-[10px] text-white">{futureTasks.data.length}</span> : null}</Button>
      {canDirectEdit && <Button type="button" size="sm" variant={activeTab === "approvals" ? "default" : "outline"} onClick={() => setActiveTab("approvals")} className={activeTab === "approvals" ? "bg-[#8a6731]" : ""}><CheckCircle2 className="ml-1 h-4 w-4" />الاعتمادات</Button>}
    </div>
    {holidayInfo.data?.isHoliday && (
      <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 text-center">
        <p className="font-bold text-amber-900">
          🎉 اليوم {holidayInfo.data.holidayName} — إجازة رسمية
        </p>
        <p className="mt-1 text-sm text-amber-800">
          إنجاز أي مهمة اليوم يمنحك <strong>+3 نقاط مكافأة</strong>
        </p>
      </div>
    )}
    {holidayInfo.data?.isRamadan && !holidayInfo.data?.isHoliday && (
      <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 text-center">
        <p className="text-sm text-blue-900">
          🌙 شهر رمضان — ساعات العمل: {holidayInfo.data.workHours?.start} - {holidayInfo.data.workHours?.end}
        </p>
      </div>
    )}
    {attachmentPreview && <TaskAttachmentPreviewDialog attachment={attachmentPreview} attachments={taskAttachments.data ?? []} taskId={taskWorkspaceId} onClose={() => { setAttachmentPreview(null); setPreviewLoading(false); }} />}
    <Dialog open={Boolean(deleteAttachmentTarget)} onOpenChange={open => { if (!open) setDeleteAttachmentTarget(null); }}><DialogContent dir="rtl" className="max-w-sm"><DialogHeader><DialogTitle>حذف المرفق</DialogTitle><DialogDescription>سيتم حذف المرفق نهائياً ولا يمكن التراجع.</DialogDescription></DialogHeader><p className="rounded-lg bg-[#f7f5ef] px-3 py-2 text-sm font-bold text-[#355d4b]">{deleteAttachmentTarget?.originalName}</p><DialogFooter><Button type="button" variant="outline" onClick={() => setDeleteAttachmentTarget(null)}>إلغاء</Button><Button type="button" disabled={deleteTaskAttachment.isPending} onClick={() => deleteAttachmentTarget && deleteTaskAttachment.mutate({ attachmentId: deleteAttachmentTarget.id })} className="bg-[#a04935] hover:bg-[#83381f]">{deleteTaskAttachment.isPending ? "جارٍ الحذف…" : "حذف"}</Button></DialogFooter></DialogContent></Dialog>
    {tasks.data?.length ? <section className="mt-5 rounded-2xl border border-[#d7e6d8] bg-[#f7fbf7] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-[#12352f]">كتابة ومرفقات المهمة</p><p className="mt-1 text-xs text-[#6d7d74]">اختر المهمة، ثم دوّن تحديثك أو أضف ملفات العمل المرتبطة بها.</p></div><select aria-label="اختر القسم" value={workspaceUnitId?.toString() ?? ""} onChange={event => { const uid = event.target.value === "" ? null : Number(event.target.value); setWorkspaceUnitId(uid); setTaskWorkspaceId(null); setTaskAttachment(null); }} className="h-10 min-w-44 rounded-md border border-[#b8d1bc] bg-white px-3 text-sm"><option value="">اختر القسم</option>{taskGroups.map(group => <option key={group.unitId} value={group.unitId}>{group.unitName}</option>)}</select><select aria-label="اختر المهمة" value={taskWorkspaceId?.toString() ?? ""} disabled={workspaceUnitId === null} onChange={event => { setTaskWorkspaceId(event.target.value ? Number(event.target.value) : null); setTaskAttachment(null); }} className="h-10 min-w-56 rounded-md border border-[#b8d1bc] bg-white px-3 text-sm disabled:opacity-60"><option value="">{workspaceUnitId === null ? "اختر القسم أولاً" : "اختر المهمة"}</option>{(taskGroups.find(group => group.unitId === workspaceUnitId)?.tasks ?? []).map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></div>{workspaceTask && <div className="mt-4 grid gap-4 border-t border-[#dce8de] pt-4 lg:grid-cols-2"><div><label className="text-xs font-bold text-[#53675d]">تحديث أو ملاحظة داخل المهمة</label><Textarea value={comments[workspaceTask.id] || ""} onChange={event => setComments({ ...comments, [workspaceTask.id]: event.target.value })} placeholder="اكتب ما تم إنجازه أو ما يلزم متابعته…" className="mt-1 min-h-28 bg-white" /><Button size="sm" disabled={!comments[workspaceTask.id]?.trim() || comment.isPending} onClick={() => comment.mutate({ taskId: workspaceTask.id, comment: comments[workspaceTask.id]! })} className="mt-2 bg-[#12352f] hover:bg-[#1d5245]"><Send className="ml-1 h-4 w-4" />حفظ التحديث</Button></div><div><p className="text-xs font-bold text-[#53675d]">مرفقات المهمة</p><label className="mt-1 flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-[#b8d2bd] bg-white px-3 py-3 text-xs font-bold text-[#28623f]"><span className="flex min-w-0 items-center gap-2"><Paperclip className="h-4 w-4 shrink-0" />{taskAttachment ? taskAttachment.originalName : "PDF أو Word أو Excel أو صورة"}</span><input type="file" className="sr-only" accept="application/pdf,image/png,image/jpeg,.docx,.xlsx" onChange={event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 8 * 1024 * 1024) { toast.error("حجم المرفق يتجاوز 8 ميغابايت."); return; } const reader = new FileReader(); reader.onload = () => { const value = String(reader.result || ""); setTaskAttachment({ originalName: file.name, mimeType: file.type || "application/octet-stream", contentBase64: value.includes(",") ? value.split(",")[1] || "" : value }); }; reader.readAsDataURL(file); }} /></label><Button size="sm" disabled={!taskAttachment || uploadTaskAttachment.isPending} onClick={() => taskAttachment && uploadTaskAttachment.mutate({ taskId: workspaceTask.id, attachment: taskAttachment })} className="mt-2 bg-[#2f7653] hover:bg-[#245d41]">{uploadTaskAttachment.isPending ? "جارٍ رفع المرفق…" : "رفع المرفق"}</Button>{taskAttachments.isLoading ? <p className="mt-3 text-xs text-[#738179]">جارٍ تحميل المرفقات…</p> : taskAttachments.data?.length ? <div className="mt-3 space-y-2">{taskAttachments.data.map(attachment => <div key={attachment.id} className="flex items-center gap-2"><button type="button" onClick={() => downloadTaskAttachment.mutate({ attachmentId: attachment.id })} className="flex flex-1 items-center justify-between rounded-lg bg-white px-3 py-2 text-xs font-bold text-[#355d4b]"><span className="truncate">{attachment.originalName}</span><span className="mr-2 shrink-0 text-[#7a887f]">{Math.ceil(attachment.sizeBytes / 1024)} ك.ب</span></button><button type="button" aria-label={`حذف ${attachment.originalName}`} onClick={() => setDeleteAttachmentTarget({ id: attachment.id, originalName: attachment.originalName })} className="shrink-0 rounded-md border border-[#e8b4a8] px-2 py-1 text-xs font-bold text-[#a04a35] hover:bg-[#fff6f5]">🗑️</button></div>)}</div> : <p className="mt-3 text-xs text-[#738179]">لا توجد مرفقات لهذه المهمة بعد.</p>}{(taskAttachments.error || uploadTaskAttachment.error) && <p className="mt-3 text-xs text-[#a04a35]">{taskAttachments.error?.message || uploadTaskAttachment.error?.message}</p>}</div></div>}</section> : null}

    {workspaceTask && <section className="mt-4 rounded-2xl border border-[#d8e5da] bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold text-[#12352f]">إجراءات المهمة</p><p className="mt-1 text-xs leading-6 text-[#6d7d74]">أضف تعليقاً عادياً في السجل دون تصعيد، أو أتم المهمة للمراجعة، أو أحِلها للإدارة مع سبب موثق.</p></div><span className="rounded-full bg-[#eef4ef] px-3 py-1 text-xs font-bold text-[#355d4b]">{taskStatusLabel(workspaceTask.status as TaskStatus)}</span></div><div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">{workspaceTask.assigneeProfileId === currentProfile.data?.id && (workspaceTask.status === "in_progress" || workspaceTask.status === "new") && new Date(workspaceTask.scheduledFor).getTime() <= Date.now() && <Button type="button" size="sm" disabled={submitForReview.isPending} onClick={() => submitForReview.mutate({ taskId: workspaceTask.id })} className="bg-[#2f7653] hover:bg-[#245d41]"><CheckCircle2 className="ml-1 h-4 w-4" />{submitForReview.isPending ? "جارٍ الإرسال…" : "إتمام المهمة وإرسالها للمراجعة"}</Button>}{canAssign && <Button type="button" size="sm" variant="outline" onClick={() => { setRouteDialog({ taskId: workspaceTask.id, title: workspaceTask.title }); setRouteTargetProfileId(""); setRouteReason(""); }}><RefreshCcw className="ml-1 h-4 w-4" />إحالة للإدارة</Button>}</div><div className="mt-4 border-t border-[#e4ece5] pt-4"><label className="text-xs font-bold text-[#53675d]">تعليق عادي في سجل المهمة</label><Textarea value={comments[workspaceTask.id] || ""} onChange={event => setComments({ ...comments, [workspaceTask.id]: event.target.value })} placeholder="أضف ملاحظة أو استفساراً دون تغيير حالة المهمة…" className="mt-1 min-h-20 bg-[#fbfdfb]" /><Button type="button" size="sm" disabled={!comments[workspaceTask.id]?.trim() || comment.isPending} onClick={() => comment.mutate({ taskId: workspaceTask.id, comment: comments[workspaceTask.id]! })} className="mt-2 bg-[#12352f] hover:bg-[#1d5245]"><MessageCircle className="ml-1 h-4 w-4" />إضافة تعليق عادي</Button></div>{(submitForReview.error || routeTask.error || comment.error) && <p className="mt-3 text-xs text-[#a04a35]">{submitForReview.error?.message || routeTask.error?.message || comment.error?.message}</p>}</section>}
    {workspaceTask && <>{completionSuccessTaskId === workspaceTask.id && <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#b9d8bf] bg-[#eaf7eb] px-4 py-3 text-sm font-bold text-[#216345] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"><CheckCircle2 className="h-5 w-5" />تم إرسال الإتمام للمراجعة بنجاح.</div>}<TaskCommentTimelinePanel taskId={workspaceTask.id} candidates={workspaceTask.isConfidential ? mentionCandidates.filter(person => person.id === workspaceTask.assigneeProfileId || person.id === workspaceTask.watcherProfileId) : mentionCandidates} /></>}
    {selectedTaskId && <div className={`mt-6 rounded-2xl border p-4 ${selectedTask ? "border-[#b9d6bf] bg-[#f2f8f2]" : "border-[#efd3c4] bg-[#fff7f2]"}`}><div className="flex items-center gap-2 text-sm font-bold text-[#214c39]"><CheckCircle2 className="h-4 w-4" />{selectedTask ? `المهمة المحددة من الإشعار: ${selectedTask.title}` : "لا تتوفر المهمة المطلوبة ضمن نطاق صلاحيتك أو لم تعد موجودة."}</div>{selectedTask && <p className="mt-2 text-xs leading-6 text-[#65766d]">الجدولة: {formatTaskDate(selectedTask.scheduledFor)} · الاستحقاق: {formatTaskDate(selectedTask.dueAt, selectedTask.isOpen)} · الحالة: {taskStatusLabel(selectedTask.status as TaskStatus)}</p>}</div>}

    {(actionTasks.length > 0 || (pendingExceptionRequests.data?.length ?? 0) > 0 || (pendingModifications.data?.length ?? 0) > 0 || (pendingTaskApprovals.data?.length ?? 0) > 0 || (pendingDisciplinary.data?.length ?? 0) > 0) && <section className="mt-6 grid gap-4 lg:grid-cols-2" aria-label="إجراءات المهام وقرارات المدير">
      {actionTasks.length > 0 && <article className="rounded-[1.4rem] border border-[#d7e6d8] bg-[#f7fbf7] p-4"><div className="flex items-center gap-2"><UserRoundCheck className="h-4 w-4 text-[#2f7653]" /><h2 className="text-sm font-bold text-[#12352f]">إجراءات تنتظر منك</h2></div><div className="mt-3 space-y-3">{actionTasks.slice(0, 3).map(task => { const reachedStart = new Date(task.scheduledFor).getTime() <= Date.now(); return <div key={task.id} className="rounded-xl border border-[#e2ebe3] bg-white p-3"><p className="break-words text-sm font-bold text-[#29463b]">{task.title}</p>{recurrenceLabel(task) && <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700"><Repeat className="h-3 w-3" />{recurrenceLabel(task)}</span>}<p className="mt-1 text-[11px] text-[#748078]">وقت البدء: {formatTaskDate(task.scheduledFor)} · الحالة: {taskStatusLabel(task.status as TaskStatus)}</p><div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">{task.status === "new" && <Button size="sm" disabled={acknowledge.isPending} onClick={() => acknowledge.mutate({ taskId: task.id })} className="bg-[#2f7653] hover:bg-[#245d41]"><UserRoundCheck className="ml-1 h-3.5 w-3.5" />{reachedStart ? "بدء التنفيذ" : "بدء التنفيذ مبكراً"}</Button>}{task.status === "new" && reachedStart && <Button size="sm" variant="outline" onClick={() => { setExceptionReason(""); setExceptionDialog({ taskId: task.id, kind: "reassignment", title: task.title }); }}><RefreshCcw className="ml-1 h-3.5 w-3.5" />طلب إعادة إسناد</Button>}<Button size="sm" variant="outline" onClick={() => { setExceptionReason(""); setExceptionDialog({ taskId: task.id, kind: "obstacle", title: task.title }); }} className="border-[#efd1c4] text-[#a04a35]"><ShieldAlert className="ml-1 h-3.5 w-3.5" />يوجد عائق</Button>{task.status === "new" && !reachedStart && <span className="rounded-md bg-[#e7f3e9] px-2.5 py-2 text-[11px] font-bold text-[#2f7653]">يكافأ البدء المبكر في سجل الإنجاز</span>}</div></div>; })}</div></article>}
      {(pendingExceptionRequests.data?.length ?? 0) > 0 && <article className="rounded-[1.4rem] border border-[#ebd9a8] bg-[#fffdf6] p-4"><div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-[#96732b]" /><h2 className="text-sm font-bold text-[#12352f]">قرارات بانتظارك كمدير مباشر</h2></div><div className="mt-3 space-y-2">{pendingExceptionRequests.data?.slice(0, 3).map(row => <button type="button" key={row.request.id} onClick={() => { setDecisionRequestId(row.request.id); setDecisionNote(""); setDecisionAssigneeId(""); }} className="w-full rounded-xl border border-[#eee2bf] bg-white p-3 text-right hover:bg-[#fff9e8]"><p className="text-xs font-bold text-[#314d40]">{row.request.kind === "reassignment" ? "طلب إعادة إسناد" : "بلاغ عائق"} · {row.task.title}</p><p className="mt-1 text-[11px] leading-5 text-[#717d75]">من: {row.requesterName} · {row.request.reason}</p></button>)}</div></article>}
      {(pendingModifications.data?.length ?? 0) > 0 && <article className="rounded-[1.4rem] border border-[#d9e7dc] bg-[#f7fbf7] p-4"><div className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-[#2f7653]" /><h2 className="text-sm font-bold text-[#12352f]">طلبات تعديل المهام بانتظارك</h2></div><div className="mt-3 space-y-3">{pendingModifications.data?.map(row => { const proposed = row.request.proposedData as { title?: string; taskNotes?: string | null; priority?: string; dueAt?: string } | null; return <div key={row.request.id} className="rounded-xl border border-[#e7e0d4] bg-white p-3 text-right"><p className="text-xs font-bold text-[#314d40]">{row.task?.title}</p><p className="mt-1 text-[11px] leading-5 text-[#717d75]">من: {row.requesterName} · السبب: {row.request.reason}</p>{proposed && <p className="mt-1 text-[11px] leading-5 text-[#8a6d20]">المقترح: {[proposed.title && `العنوان: ${proposed.title}`, proposed.priority && `الأولوية: ${proposed.priority}`, proposed.dueAt && `الاستحقاق: ${proposed.dueAt}`].filter(Boolean).join(" · ")}</p>}{modificationReviewRequestId === row.request.id ? <div className="mt-2 space-y-2"><Textarea value={modificationReviewNote} onChange={event => setModificationReviewNote(event.target.value)} placeholder="ملاحظة القرار (اختياري)" className="min-h-16" /><div className="flex gap-2"><Button type="button" size="sm" onClick={() => reviewModificationMutation.mutate({ requestId: row.request.id, decision: "approved", note: modificationReviewNote.trim() || "تم الاعتماد" })} disabled={reviewModificationMutation.isPending} className="bg-[#2f7653] text-white hover:bg-[#245d41]">اعتماد</Button><Button type="button" size="sm" variant="outline" onClick={() => reviewModificationMutation.mutate({ requestId: row.request.id, decision: "rejected", note: modificationReviewNote.trim() || "تم الرفض" })} disabled={reviewModificationMutation.isPending} className="border-[#e8b4a8] text-[#a04a35]">رفض</Button></div></div> : <Button type="button" size="sm" variant="outline" onClick={() => { setModificationReviewRequestId(row.request.id); setModificationReviewNote(""); }} className="mt-2">مراجعة</Button>}</div>; })}</div></article>}

      {(pendingDisciplinary.data?.length ?? 0) > 0 && <article className="rounded-[1.4rem] border border-[#e8d9c4] bg-[#fffaf0] p-4"><div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-[#a8601f]" /><h2 className="text-sm font-bold text-[#12352f]">مساءلات بانتظار قرارك</h2><span className="rounded-full bg-[#f3e5bf] px-2 py-0.5 text-xs font-bold text-[#805d27]">{pendingDisciplinary.data?.length ?? 0}</span></div><div className="mt-3 space-y-2">{pendingDisciplinary.data?.slice(0, 3).map(c => <div key={c.id} className="rounded-xl border border-[#eee2cf] bg-white p-3 text-right"><p className="text-xs font-bold text-[#314d40]">{c.employeeName}</p><p className="mt-1 text-[11px] leading-5 text-[#717d75]">{(c.requestNote || "").slice(0, 120)}</p></div>)}</div><Button type="button" size="sm" variant="outline" onClick={() => setLocation("/disciplinary")} className="mt-3 border-[#cbb27a] text-[#8a6731] hover:bg-[#fff8ec]">فتح صفحة المساءلات لاتخاذ القرار</Button></article>}
      {(pendingTaskApprovals.data?.length ?? 0) > 0 && <article id="task-approvals" className={`rounded-[1.4rem] border p-4 ${activeTab === "approvals" ? "border-[#2f7653] bg-[#eef7ef] ring-2 ring-[#2f7653]/30" : "border-[#cfe3d2] bg-[#f2faf3]"}`}><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#2f7653]" /><h2 className="text-sm font-bold text-[#12352f]">مهام بانتظار اعتمادك</h2><span className="rounded-full bg-[#e7f3ea] px-2 py-0.5 text-xs font-bold text-[#2d6b4f]">{pendingTaskApprovals.data?.length ?? 0}</span></div><div className="flex flex-wrap items-center gap-2">{canReviewApprovals && <><label className="flex cursor-pointer items-center gap-1 text-xs font-bold text-[#2d6b4f]"><input type="checkbox" checked={allApprovalsSelected} onChange={toggleSelectAllApprovals} className="h-4 w-4 accent-[#2f7653]" />اختر الكل</label>{selectedApprovalIds.length > 0 && <><span className="text-xs font-bold text-[#2d6b4f]">المحدد: {selectedApprovalIds.length}</span><Button type="button" size="sm" onClick={() => bulkReviewApprovalsMutation.mutate({ approvalIds: selectedApprovalIds, decision: "approved" })} disabled={bulkReviewApprovalsMutation.isPending} className="bg-[#2f7653] text-white hover:bg-[#245d41]">اعتماد المحدد</Button><Button type="button" size="sm" variant="outline" onClick={() => bulkReviewApprovalsMutation.mutate({ approvalIds: selectedApprovalIds, decision: "rejected" })} disabled={bulkReviewApprovalsMutation.isPending} className="border-[#e8b4a8] text-[#a04a35]">رفض المحدد</Button></>}</>}</div></div><div className="mt-3 space-y-3">{pendingTaskApprovals.data?.map(row => <div key={row.approval.id} className="rounded-xl border border-[#e7e0d4] bg-white p-3 text-right"><div className="flex items-start gap-2">{canReviewApprovals && <input type="checkbox" checked={selectedApprovalIds.includes(row.approval.id)} onChange={() => toggleApprovalSelection(row.approval.id)} className="mt-1 h-4 w-4 shrink-0 accent-[#2f7653]" aria-label="اختر الاعتماد" />}<div className="min-w-0 flex-1"><p className="text-xs font-bold text-[#314d40]">{row.task?.title}</p><p className="mt-1 text-[11px] leading-5 text-[#717d75]">من: {row.submitterName}</p>{row.task?.taskNotes && <p className="mt-1 break-words text-[11px] leading-5 text-[#4c5f54]">{row.task?.taskNotes}</p>}{Number(row.task?.attachmentsCount ?? 0) > 0 && <p className="mt-1 text-[11px] font-bold text-gray-600">📎 {row.task?.attachmentsCount} مرفق — اضغط «تفاصيل» للاطلاع</p>}<Button type="button" size="sm" variant="outline" onClick={() => { setApprovalDetails({ taskId: row.approval.taskId, approvalId: row.approval.id, title: row.task?.title ?? "" }); setApprovalReviewNote(""); setApprovalRating("good"); }} className="mt-2 border-[#cbb27a] text-[#8a6d20]"><FileText className="ml-1 h-3.5 w-3.5" />📄 تفاصيل</Button>{canReviewApprovals && (approvalReviewId === row.approval.id ? <div className="mt-2 space-y-2"><Textarea value={approvalReviewNote} onChange={event => setApprovalReviewNote(event.target.value)} placeholder="ملاحظة القرار (اختياري)" className="min-h-16" /><div className="flex gap-2"><button type="button" onClick={() => setApprovalRating("excellent")} className={`px-3 py-1.5 rounded-md text-xs font-bold ${approvalRating === "excellent" ? "bg-green-600 ring-2 ring-black text-white" : "bg-green-100 text-green-800"}`}>🟢 ممتاز (+5)</button><button type="button" onClick={() => setApprovalRating("good")} className={`px-3 py-1.5 rounded-md text-xs font-bold ${approvalRating === "good" ? "bg-yellow-500 ring-2 ring-black text-white" : "bg-yellow-100 text-yellow-800"}`}>🟡 متوسط (+3)</button><button type="button" onClick={() => setApprovalRating("acceptable")} className={`px-3 py-1.5 rounded-md text-xs font-bold ${approvalRating === "acceptable" ? "bg-red-500 ring-2 ring-black text-white" : "bg-red-100 text-red-800"}`}>🔴 مقبول (+1)</button></div><div className="flex gap-2"><Button type="button" size="sm" onClick={() => reviewApprovalMutation.mutate({ approvalId: row.approval.id, decision: "approved", note: approvalReviewNote.trim() || "تم الاعتماد", managerRating: approvalRating })} disabled={reviewApprovalMutation.isPending} className="bg-[#2f7653] text-white hover:bg-[#245d41]">اعتماد + نقاط</Button><Button type="button" size="sm" variant="outline" onClick={() => reviewApprovalMutation.mutate({ approvalId: row.approval.id, decision: "rejected", note: approvalReviewNote.trim() || "تم الرفض" })} disabled={reviewApprovalMutation.isPending} className="border-[#e8b4a8] text-[#a04a35]">رفض</Button></div></div> : <Button type="button" size="sm" variant="outline" onClick={() => { setApprovalReviewId(row.approval.id); setApprovalReviewNote(""); setApprovalRating("good"); }} className="mt-2">مراجعة</Button>)}</div></div></div>)}</div></article>}

    </section>}

    <div className={`mt-7 grid gap-5 ${canAssign ? "xl:grid-cols-[21rem_minmax(0,1fr)]" : ""}`}>
      {permission.data !== "trainee" && <form onSubmit={submitSelf} className="rounded-2xl border border-[#d9e7dc] bg-[#f7fbf7] p-5 shadow-[0_10px_30px_rgba(30,51,42,0.04)]"><div className="flex items-center gap-2 text-[#12352f]"><FilePlus2 className="h-5 w-5 text-[#2f7653]" /><h2 className="font-bold">إنشاء مهمة لنفسي</h2></div><p className="mt-2 text-xs leading-6 text-[#60736a]">تحفظ المهمة باسمك وتظهر للمدير المباشر لمراجعتها أو رفعها للمسار الإداري التالي.</p><div className="mt-4 space-y-3"><Input required value={selfForm.title} onChange={event => setSelfForm({ ...selfForm, title: event.target.value })} placeholder="عنوان المهمة الذاتية" /><Textarea value={selfForm.taskNotes} onChange={event => setSelfForm({ ...selfForm, taskNotes: event.target.value })} placeholder="تفاصيل المهمة وشرحها (اختياري)…" className="mt-1 min-h-24" /><select value={selfForm.priority} onChange={event => setSelfForm({ ...selfForm, priority: event.target.value as typeof selfForm.priority })} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="normal">عادية</option><option value="high">عالية</option><option value="critical">حرجة</option></select><label className="block text-xs font-bold text-[#6a786f]">نوع المهمة<select value={selfForm.taskType} onChange={event => setSelfForm({ ...selfForm, taskType: event.target.value as typeof selfForm.taskType })} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="permanent">عادية</option><option value="urgent">عاجلة</option></select></label><label className="block text-xs font-bold text-[#6a786f]">من تاريخ<span className="mt-1 block font-normal text-[#8a6731]">متى تبدأ المهمة وتظهر لك كجاهزة للتنفيذ.</span><Input required value={selfForm.scheduledFor} onChange={event => setSelfForm({ ...selfForm, scheduledFor: event.target.value })} className="mt-1" type="datetime-local" /></label><label className="flex items-center gap-2 text-xs font-bold text-[#6a786f]"><input type="checkbox" checked={selfForm.isOpen} onChange={event => setSelfForm({ ...selfForm, isOpen: event.target.checked })} />مفتوح (بدون تاريخ انتهاء)</label><label className="block text-xs font-bold text-[#6a786f]">إلى تاريخ<span className="mt-1 block font-normal text-[#8a6731]">آخر وقت لإنهائها وإرسالها للمدير للتأكيد.</span><Input required={!selfForm.isOpen} disabled={selfForm.isOpen} value={selfForm.dueAt} onChange={event => setSelfForm({ ...selfForm, dueAt: event.target.value })} className="mt-1" type="datetime-local" /></label></div><Button disabled={createSelf.isPending} className="mt-4 w-full bg-[#2f7653] hover:bg-[#245d41]">{createSelf.isPending ? "جارٍ الحفظ…" : "حفظ وإرسال للمدير المباشر"}</Button>{createSelf.error && <p className="mt-3 flex gap-2 text-xs leading-6 text-[#a04a35]"><AlertCircle className="h-4 w-4 shrink-0" />{createSelf.error.message}</p>}</form>}
      {canAssign && <form onSubmit={submit} className="rounded-2xl border border-[#e7e0d4] bg-white p-5 shadow-[0_10px_30px_rgba(30,51,42,0.05)]"><div className="flex items-center gap-2 text-[#12352f]"><FilePlus2 className="h-5 w-5 text-[#b18448]" /><h2 className="font-bold">إسناد مهمة</h2></div><div className="mt-5 space-y-3"><Input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="عنوان المهمة" required /><Textarea value={form.taskNotes} onChange={event => setForm({ ...form, taskNotes: event.target.value })} placeholder="تفاصيل المهمة وشرحها (اختياري)…" className="mt-1 min-h-24" /><div className="space-y-2">
              <label className="block text-xs font-bold text-[#6a786f]">اختر الموظف أو القاضي أو الملازم القضائي المكلف</label>
              {isManager && currentProfile.data?.unitId ? <div className="h-10 w-full rounded-md border border-[#d8e5da] bg-[#f2f6f1] px-3 py-2 text-sm text-[#355d4b]">القسم: {currentProfile.data.unitName || ("قسم " + currentProfile.data.unitId)}</div> : <select value={assigneeUnitId} onChange={event => { setAssigneeUnitId(event.target.value); setForm({ ...form, assigneeProfileId: "" }); }} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm" required>
                <option value="">اختر الإدارة أو القسم أولاً</option>
                {units.data?.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>}
              <select value={form.assigneeProfileId} onChange={event => setForm({ ...form, assigneeProfileId: event.target.value })} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm disabled:opacity-60" required disabled={!assigneeUnitId}>
                <option value="">{assigneeUnitId ? "اختر الموظف المكلف من القائمة" : "يجب اختيار القسم أولاً"}</option>
                {assigneeCandidates.map(person => <option value={person.id} key={person.id}>{person.fullName} · {person.personType === "trainee" ? "ملازم" : person.personType === "judge" ? "قاضٍ" : "موظف"}</option>)}
              </select>
              <Button type="button" size="sm" variant="outline" disabled={!assigneeUnitId || suggestAssignees.isFetching} onClick={() => setSuggestOpen(open => !open)} className="w-full border-[#cbb27a] text-[#8a6731] hover:bg-[#fff8ec]"><Sparkles className="ml-1 h-4 w-4" />{suggestAssignees.isFetching ? "جارٍ حساب الأعباء…" : "اقترح مكلف الأقل حملاً"}</Button>
              {suggestOpen && <div className="rounded-xl border border-[#eadfc9] bg-[#fffdf7] p-3">{suggestAssignees.isLoading ? <p className="flex items-center gap-2 text-xs text-[#8a6731]"><Loader2 className="h-4 w-4 animate-spin" />جارٍ حساب أعباء العمل…</p> : suggestAssignees.data?.length ? <ul className="space-y-2">{suggestAssignees.data.map((candidate, index) => <li key={candidate.profileId} className="flex items-center justify-between gap-2 rounded-lg border border-[#efe6d3] bg-white px-3 py-2"><div className="min-w-0"><p className="flex items-center gap-2 text-sm font-bold text-[#12352f]"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#f3e5bf] text-[11px] text-[#9a7214]">{index + 1}</span>{candidate.fullName}</p><p className="mt-1 text-[11px] text-[#8a978e]">عبء {candidate.workload} · نشط {candidate.activeTaskCount} · بمراجعة {candidate.underReviewCount} · نقاط {candidate.totalPoints}</p></div><Button type="button" size="sm" variant="outline" onClick={() => { setForm({ ...form, assigneeProfileId: String(candidate.profileId) }); setSuggestOpen(false); }} className="shrink-0 border-[#b6d5bd] text-[#1d6243] hover:bg-[#eef6ef]">اختيار</Button></li>)}</ul> : <p className="text-xs leading-6 text-[#8a6731]">لا يوجد مرشحون متاحون حاليًا (الجميع غائب أو مجاز اليوم).</p>}</div>}
            </div>      <div className="space-y-2"><label className="block text-xs font-bold text-[#6a786f]">ملازم كنسخة تنبيه <span className="font-normal">(اختياري)</span></label><p className="text-[10px] leading-5 text-[#8a6731]">اختر القسم أولاً، ثم يظهر الملازمون التابعون له فقط.</p><select value={traineeCopyUnitId} onChange={event => { setTraineeCopyUnitId(event.target.value); setTraineeCopyValue("none"); }} disabled={!trainees.length} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="">اختر الإدارة أو القسم للنسخة</option>{units.data?.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select><Select value={traineeCopyValue} onValueChange={setTraineeCopyValue} disabled={!traineeCopyUnitId || !traineeCopyCandidates.length}><SelectTrigger className="mt-1 w-full"><SelectValue placeholder={traineeCopyUnitId ? "اختر الملازم من القسم المحدد" : "اختر القسم أولاً"} /></SelectTrigger><SelectContent><SelectItem value="none">لا توجد نسخة تنبيه</SelectItem>{traineeCopyCandidates.map(person => <SelectItem key={person.id} value={String(person.id)}>{person.fullName}</SelectItem>)}</SelectContent></Select>{!trainees.length && <span className="mt-1 block font-normal text-[#8a6731]">لا توجد ملفات ملازمين نشطة متاحة للنسخة حالياً.</span>}</div><label className="block text-xs font-bold text-[#6a786f]">نوع المهمة<select value={form.taskType} onChange={event => setForm({ ...form, taskType: event.target.value as typeof form.taskType })} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="permanent">عادية</option><option value="urgent">عاجلة</option></select></label><label className="block text-xs font-bold text-[#6a786f]">المرفقات (اختياري)<input type="file" className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm" accept="application/pdf,image/png,image/jpeg,.docx,.xlsx" onChange={event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 8 * 1024 * 1024) { toast.error("حجم المرفق يتجاوز 8 ميغابايت."); return; } const reader = new FileReader(); reader.onload = () => { const value = String(reader.result || ""); setForm(current => ({ ...current, attachments: [...current.attachments, { originalName: file.name, mimeType: file.type || "application/octet-stream", contentBase64: value.includes(",") ? value.split(",")[1] || "" : value }].slice(0, 5) })); }; reader.readAsDataURL(file); }} /></label><select value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value as typeof form.priority })} className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="normal">عادية</option><option value="high">عالية</option><option value="critical">حرجة</option></select><label className="block text-xs font-bold text-[#6a786f]">من تاريخ<span className="mt-1 block font-normal text-[#8a6731]">متى تصبح المهمة جاهزة للبدء وتظهر للمكلف.</span><Input value={form.scheduledFor} onChange={event => setForm({ ...form, scheduledFor: event.target.value })} className="mt-1" type="datetime-local" required /></label><label className="flex items-center gap-2 text-xs font-bold text-[#6a786f]"><input type="checkbox" checked={form.isOpen} onChange={event => setForm({ ...form, isOpen: event.target.checked })} />مفتوح (بدون تاريخ انتهاء)</label><label className="block text-xs font-bold text-[#6a786f]">إلى تاريخ<span className="mt-1 block font-normal text-[#8a6731]">آخر موعد لإنهاء المهمة وإرسالها للمدير للتأكيد.</span><Input required={!form.isOpen} disabled={form.isOpen} value={form.dueAt} onChange={event => setForm({ ...form, dueAt: event.target.value })} className="mt-1" type="datetime-local" /></label><div className="space-y-2">
              <label className="block text-xs font-bold text-[#6a786f]">المكلف بالمتابعة <span className="font-normal">(اختياري)</span></label>
              <p className="text-[10px] leading-5 text-[#8a6731]">نأمل اتباع التسلسل الإداري وفق التعليمات عند اختيار المتابع.</p>
              <select value={watcherUnitId} onChange={event => { setWatcherUnitId(event.target.value); setForm({ ...form, watcherProfileId: "" }); }} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm">
                <option value="">اختر الإدارة أو القسم للمتابع</option>
                {units.data?.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
              <select value={form.watcherProfileId} onChange={event => setForm({ ...form, watcherProfileId: event.target.value })} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm disabled:opacity-60" disabled={!watcherUnitId}>
                <option value="">{watcherUnitId ? "اختر المتابع من القائمة" : "لا يوجد متابع محدد"}</option>
                {watcherCandidates.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}
              </select>
            </div><label className="flex items-center gap-2 text-xs font-bold text-[#6a786f]"><input type="checkbox" checked={isRecurring} onChange={event => setIsRecurring(event.target.checked)} className="h-4 w-4 accent-[#2d6b4f]" />مهمة متكررة (تُنشأ تلقائياً)</label>{isRecurring && <><label className="block text-xs font-bold text-[#6a786f]">نوع التكرار<select value={recurrence} onChange={event => setRecurrence(event.target.value as typeof recurrence)} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="daily">يومي</option><option value="weekly">أسبوعي</option><option value="monthly">شهري</option><option value="yearly">سنوي</option><option value="custom">كل عدد أيام محدد</option><option value="specific_days">أيام محددة من الأسبوع</option></select></label>{recurrence === "custom" && <label className="block text-xs font-bold text-[#6a786f]">كل كم يوم؟ (1-30)<input type="number" min={1} max={30} value={intervalDays} onChange={event => setIntervalDays(Number(event.target.value))} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm" /></label>}{recurrence === "specific_days" && <div className="mt-2"><label className="text-sm font-medium">اختر الأيام</label><div className="flex flex-wrap gap-2 mt-1">{[{ day: 0, label: "الأحد" },{ day: 1, label: "الاثنين" },{ day: 2, label: "الثلاثاء" },{ day: 3, label: "الأربعاء" },{ day: 4, label: "الخميس" },{ day: 5, label: "الجمعة" },{ day: 6, label: "السبت" }].map(({ day, label }) => <label key={day} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={specificDays.includes(day)} onChange={event => { if (event.target.checked) { setSpecificDays([...specificDays, day]); } else { setSpecificDays(specificDays.filter(d => d !== day)); } }} className="h-4 w-4 accent-[#2d6b4f]" />{label}</label>)}</div>{specificDays.length === 0 && <p className="text-xs text-red-500 mt-1">⚠️ اختر يوم واحد على الأقل</p>}</div>}<label className="block text-xs font-bold text-[#6a786f]">نهاية التكرار (اختياري)<Input value={form.recurrenceEndAt} disabled={form.isOpen} onChange={event => setForm({ ...form, recurrenceEndAt: event.target.value })} className="mt-1" type="datetime-local" /></label><p className="text-xs text-[#8a9189]">{recurrence === "daily" ? "كل يوم 7 صباحاً" : recurrence === "weekly" ? "كل أحد 7 صباحاً" : recurrence === "monthly" ? "يوم 1 من كل شهر" : recurrence === "yearly" ? "1 يناير من كل سنة" : recurrence === "specific_days" ? "الأيام المحددة من الأسبوع" : `كل ${intervalDays} يوم`}</p></>}<label className="flex items-center gap-2 text-xs font-bold text-[#6a786f]"><input type="checkbox" checked={form.isConfidential} onChange={event => setForm({ ...form, isConfidential: event.target.checked })} />مهمة سرية</label>{form.isConfidential && <label className="block text-xs font-bold text-[#6a786f]">انتهاء السرية (اختياري)<Input value={form.confidentialityExpiresAt} onChange={event => setForm({ ...form, confidentialityExpiresAt: event.target.value })} className="mt-1" type="datetime-local" /></label>}</div><Button disabled={create.isPending || people.isLoading} className="mt-5 w-full bg-[#12352f] hover:bg-[#1d5245]">{create.isPending ? "جارٍ الإسناد…" : "إسناد المهمة"}</Button>{create.error && <p className="mt-3 flex gap-2 text-xs leading-6 text-[#a04a35]"><AlertCircle className="h-4 w-4 shrink-0" />{create.error.message}</p>}</form>}
      <div className="rounded-2xl border border-[#e7e0d4] bg-white p-5 shadow-[0_10px_30px_rgba(30,51,42,0.05)]"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-[#12352f]">{canAssign ? "المهام المسجلة" : "مهامي المسندة"}</h2><p className="mt-1 text-xs text-[#75837c]">تُعرض مهامك أولاً، ويمكن للمخول التبديل إلى نطاق الإدارة عند الحاجة.</p></div><div className="flex flex-wrap items-center gap-2"><div className="flex gap-2" role="group" aria-label="نطاق عرض المهام"><Button type="button" size="sm" variant={taskView === "mine" ? "default" : "outline"} onClick={() => setTaskView("mine")} className={taskView === "mine" ? "bg-[#12352f]" : ""}>مهامي</Button>{canAssign && <Button type="button" size="sm" variant={taskView === "scope" ? "default" : "outline"} onClick={() => setTaskView("scope")} className={taskView === "scope" ? "bg-[#8a6731]" : ""}>{platformWide ? "الكل" : "فريقي"}</Button>}</div>{taskView === "scope" && <select aria-label="اختر الموظف" value={selectedAssigneeProfileId ?? ""} onChange={e => setSelectedAssigneeProfileId(e.target.value ? Number(e.target.value) : null)} className="h-9 rounded-md border border-[#b8d1bc] bg-white px-2 text-xs font-bold text-[#315348]"><option value="">كل الموظفين</option>{activePeople.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}</select>}<select aria-label="فلتر الحالة" value={dueFilter} onChange={e => setDueFilter(e.target.value as typeof dueFilter)} className="h-9 rounded-md border border-[#b8d1bc] bg-white px-2 text-xs font-bold text-[#315348]"><option value="all">كل الحالات</option><option value="overdue">متأخرة</option><option value="dueSoon">قريبة (24 ساعة)</option><option value="completed">مكتملة</option></select>{canAssign && <Button type="button" size="sm" variant="outline" disabled={autoAssign.isPending} onClick={runAutoAssign} className="border-[#cbb27a] text-[#8a6731] hover:bg-[#fff8ec]"><Sparkles className="ml-1 h-4 w-4" />{autoAssign.isPending ? "جارٍ التوزيع…" : "وزّع تلقائياً"}</Button>}<Button type="button" size="sm" variant="outline" onClick={() => setShowCompleted(v => !v)} className={showCompleted ? "border-[#2f7653] text-[#2f7653]" : ""}>{showCompleted ? "إخفاء المكتملة" : "عرض المكتملة"}</Button></div></div>{tasks.isLoading ? <div className="mt-5 flex items-center gap-2 text-sm text-[#6e7e75]"><CircleDashed className="h-4 w-4 animate-spin" /> جارٍ تحميل المهام…</div> : visibleTasks.length ? <div className="mt-5 divide-y divide-[#eee8de]">{requestedTaskFilter !== "all" && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#b8d1bc] bg-[#eef6ef] px-3 py-2"><p className="text-xs font-bold text-[#2d6b4f]">الفلتر الحالي: {({ active: "قيد التنفيذ", open: "مفتوحة", overdue: "متأخرة", due_soon: "قرب موعدها", completed: "تمت المعالجة" } as Record<string, string>)[requestedTaskFilter] ?? requestedTaskFilter}</p><button type="button" onClick={() => setLocation("/tasks")} className="rounded-lg border border-[#b8d1bc] bg-white px-2.5 py-1 text-xs font-bold text-[#2d6b4f] transition hover:bg-[#dcebdd]">عرض الكل</button></div>}{visibleTasks.map(task => { const assignee = activePeople.find(person => person.id === task.assigneeProfileId); const taskConversation = conversations.data?.find(row => row.conversation.taskId === task.id); const focused = task.id === selectedTaskId; const visualState = taskVisualState({ status: task.status as TaskStatus, dueAt: task.dueAt, scheduledFor: task.scheduledFor }); const workLabel = taskWorkDeadlineText({ scheduledFor: task.scheduledFor, status: task.status as TaskStatus, isOpen: task.isOpen });
const stateText = (visualState === "overdue" ? "بدأ التأخير" : visualState === "due_soon" ? "قريب الاستحقاق" : visualState === "starting" ? "مهمة جديدة تبدأ الآن" : visualState === "completed" ? "منجز" : "ضمن المسار") + (workLabel ? ` · ${workLabel.text}` : ""); const isOwnTask = task.assigneeProfileId === currentProfile.data?.id; const onActivate = isOwnTask && task.status === "new" ? () => acknowledge.mutate({ taskId: task.id }) : isOwnTask && task.status === "in_progress" ? () => submitForReview.mutate({ taskId: task.id }) : undefined; return <article key={task.id} className={`rounded-2xl border bg-white p-4 shadow-[0_4px_14px_rgba(30,51,42,0.05)] transition hover:shadow-[0_8px_24px_rgba(30,51,42,0.09)] ${focused ? "border-[#2f7653] ring-1 ring-[#2f7653]/20" : "border-[#e7e0d4]"} ${taskVisualClasses(visualState)}`}><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => setDetailsTaskId(task.id)} className="text-right font-bold text-[#26473a] hover:text-[#1d5245] break-words hover:underline" title="فتح تفاصيل المهمة">{task.title}</button>{task.status === "paused" && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-bold text-gray-600">⏸️ موقوفة</span>}<span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${taskTypeBadgeClasses(task.taskType)}`}>{taskTypeLabel(task.taskType)}</span>{task.hasObstacle && <span className="rounded-full bg-[#fbe0db] px-2 py-0.5 text-[11px] font-bold text-[#9d4034]">عائق مسجّل</span>}{task.lastApprovalStatus === "rejected" && task.status === "in_progress" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">🔁 أُعيدت للتعديل{task.lastApprovalNote ? `: ${task.lastApprovalNote}` : ""}</span>}</div><p className="break-words mt-1 text-xs text-[#75837c]">المكلف: {assignee?.fullName || "غير محدد"} · الاستحقاق: {formatTaskDate(task.dueAt, task.isOpen)}</p></div><div className="flex items-center gap-1.5"><TaskStateBadge state={visualState} statusLabel={taskStatusLabel(task.status as TaskStatus)} stateText={stateText} onActivate={onActivate} />{task.managerRating && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${task.managerRating === "excellent" ? "bg-green-100 text-green-800" : task.managerRating === "acceptable" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}>{task.managerRating === "excellent" ? "🟢 ممتاز" : task.managerRating === "acceptable" ? "🔴 مقبول" : "🟡 متوسط"}</span>}{(() => { const dl = taskDeadlineText(task.dueAt); return dl ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${dl.tone === "red" ? "bg-[#fbe0db] text-[#9d4034]" : "bg-[#fff3d6] text-[#a8601f]"}`}>{dl.text}</span> : null; })()}{isOwnTask && <button type="button" onClick={() => setPinned.mutate({ taskId: task.id, isPinned: !task.isPinned })} aria-label={task.isPinned ? "فك تثبيت المهمة" : "تثبيت المهمة"} title={task.isPinned ? "فك التثبيت" : "تثبيت في أعلى القائمة"} className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition ${task.isPinned ? "bg-[#f3e5bf] text-[#9a7214] ring-1 ring-[#e0b13f]" : "text-[#8a978e] hover:bg-[#eef2ec]"}`}>{task.isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}</button>}</div></div>{(task.taskNotes || isOwnTask) && <div className="mt-3 rounded-lg border border-[#e7e0d4] bg-[#fbfaf6] px-2.5 py-2">{task.taskNotes && <p className="break-words whitespace-pre-wrap text-xs leading-5 text-[#4c5f54]">{task.taskNotes}</p>}{isOwnTask && <input value={notesDraft[task.id] ?? task.taskNotes ?? ""} onChange={event => setNotesDraft(current => ({ ...current, [task.id]: event.target.value }))} onBlur={event => { const value = event.target.value.trim(); if (value !== (task.taskNotes ?? "")) setNotes.mutate({ taskId: task.id, notes: value }); }} placeholder="أضف مفكرة سريعة لهذه المهمة…" className="mt-1 h-8 w-full rounded-md border border-input bg-white px-2 text-xs" />}</div>}<div className="mt-4 flex flex-wrap gap-2"><Button type="button" size="sm" disabled={markAsProcessed.isPending || task.status === "completed" || task.status === "cancelled" || new Date(task.scheduledFor).getTime() > Date.now() || !(isOwnTask || canAssign)} onClick={() => canDirectEdit ? markAsProcessed.mutate({ taskId: task.id }) : submitForReview.mutate({ taskId: task.id })} className="bg-[#2f7653] text-white hover:bg-[#245d41]"><CheckCircle2 className="ml-1 h-4 w-4" />{(markAsProcessed.isPending || submitForApprovalRequest.isPending) ? "جارٍ…" : canDirectEdit ? "تمت المعالجة" : "إتمام المهمة"}</Button><Button type="button" size="sm" variant="outline" onClick={() => { setCommentDialog({ taskId: task.id, title: task.title }); setCommentText(""); }}><MessageCircle className="ml-1 h-4 w-4" />إضافة تعليق</Button><Button type="button" size="sm" variant="outline" disabled={task.status === "completed" || task.status === "cancelled" || !isOwnTask} onClick={() => { setReassignmentDialog({ taskId: task.id, title: task.title }); setReassignmentReason(""); }} className="whitespace-normal"><RefreshCcw className="ml-1 h-4 w-4" />طلب سحب/إعادة إسناد</Button><Button type="button" size="sm" variant="outline" disabled={task.status === "completed" || task.status === "cancelled" || !(isOwnTask || canAssign)} onClick={() => { setObstacleDialog({ taskId: task.id, title: task.title }); setObstacleDetail(""); }} className="border-[#e8b98c] text-[#a8601f] hover:bg-[#fff6ec]"><AlertTriangle className="ml-1 h-4 w-4" />يوجد عائق</Button>{visualState === "overdue" && <Button type="button" size="sm" variant="outline" onClick={() => { setExtensionDialog({ taskId: task.id, title: task.title }); setExtensionReason(""); setExtensionDueAt(""); }} className="border-[#e8c97a] text-[#8a6d20] hover:bg-[#fff8ec]"><Clock className="ml-1 h-4 w-4" />طلب تمديد</Button>}<Button type="button" size="sm" variant="outline" onClick={() => setDetailsTaskId(task.id)}><FileText className="ml-1 h-4 w-4" />تفاصيل</Button>{canManageTask(task) && task.status !== "completed" && task.status !== "cancelled" && <>{canDirectEdit ? <><Button type="button" size="sm" variant="outline" onClick={() => openEditDialog(task)}><Pencil className="ml-1 h-4 w-4" />تعديل</Button><Button type="button" size="sm" variant="outline" onClick={() => { setCancelDialog({ taskId: task.id, title: task.title }); setCancelReason(""); }} className="border-[#e8b4a8] text-[#a04a35] hover:bg-[#fff6f5]"><XCircle className="ml-1 h-4 w-4" />إلغاء المهمة</Button></> : <Button type="button" size="sm" variant="outline" onClick={() => openModificationDialog(task)} className="border-[#cbb27a] text-[#8a6d20] hover:bg-[#fff8ec]"><Pencil className="ml-1 h-4 w-4" />طلب تعديل</Button>}</>}</div></article>; })}</div> : <p className="mt-5 rounded-2xl border border-dashed border-[#d8d1c5] bg-[#fbfaf6] px-5 py-10 text-center text-sm leading-7 text-[#738179]">{requestedTaskFilter !== "all" ? "لا توجد مهام مطابقة للفلتر الحالي." : "لا توجد مهام ظاهرة ضمن نطاقك حالياً."}</p>}{(tasks.error || acknowledge.error || comment.error || updateStatus.error) && <p className="mt-4 flex gap-2 text-xs leading-6 text-[#a04a35]"><AlertCircle className="h-4 w-4 shrink-0" />{tasks.error?.message || acknowledge.error?.message || comment.error?.message || updateStatus.error?.message}</p>}</div>
    </div>
    <Dialog open={Boolean(completionConfirmDialog)} onOpenChange={open => { if (!open) setCompletionConfirmDialog(null); }}><DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle>تأكيد إتمام المهمة</DialogTitle><DialogDescription>سيتم إرسال المهمة إلى المدير المباشر للمراجعة والاعتماد. لن تعد متاحة للتنفيذ حتى يُتخذ قرار المراجعة.</DialogDescription></DialogHeader><p className="rounded-lg bg-[#f7f5ef] px-3 py-2 text-sm font-bold text-[#355d4b]">{completionConfirmDialog?.title}</p><Textarea value={completionNote} onChange={event => setCompletionNote(event.target.value)} placeholder="رد/تفاصيل المعالجة والإنجاز (اختياري)…" className="mt-3 min-h-24" /><DialogFooter><Button type="button" variant="outline" onClick={() => setCompletionConfirmDialog(null)}>رجوع</Button><Button disabled={submitForApprovalRequest.isPending} onClick={() => completionConfirmDialog && submitForApprovalRequest.mutate({ taskId: completionConfirmDialog.taskId, note: completionNote.trim() || undefined })} className="bg-[#2f7653] hover:bg-[#245d41]"><CheckCircle2 className="ml-1 h-4 w-4" />{submitForApprovalRequest.isPending ? "جارٍ الإرسال…" : "تأكيد الإتمام"}</Button></DialogFooter>{submitForApprovalRequest.error && <p className="text-xs text-[#a04a35]">{submitForApprovalRequest.error.message}</p>}</DialogContent></Dialog>
    <Dialog open={Boolean(routeDialog)} onOpenChange={open => { if (!open) { setRouteDialog(null); setRouteTargetProfileId(""); setRouteReason(""); } }}><DialogContent dir="rtl" className="max-w-lg"><DialogHeader><DialogTitle>إحالة المهمة للإدارة</DialogTitle><DialogDescription>اختر المستلم الإداري واكتب سبب الإحالة. يسجل السبب في سجل تدقيق المهمة ولا يغير حالتها تلقائياً.</DialogDescription></DialogHeader><form onSubmit={event => { event.preventDefault(); if (routeDialog && routeTargetProfileId && routeReason.trim().length >= 3) routeTask.mutate({ taskId: routeDialog.taskId, targetProfileId: Number(routeTargetProfileId), note: routeReason.trim() }); }} className="space-y-3"><p className="rounded-lg bg-[#f7f5ef] px-3 py-2 text-xs font-bold text-[#355d4b]">المهمة: {routeDialog?.title}</p><select aria-label="المستلم الإداري" value={routeTargetProfileId} onChange={event => setRouteTargetProfileId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm" required><option value="">اختر الإدارة أو المسؤول المستلم</option>{routeTargets.data?.map(target => <option key={`${target.profileId}-${target.role}`} value={target.profileId}>{target.fullName} · {target.role === "department_manager" ? "مدير قسم" : target.role === "court_president" ? "الرئيس" : target.role === "assistant_president" ? "الرئيس المساعد" : "الأمين"}</option>)}</select><Textarea value={routeReason} onChange={event => setRouteReason(event.target.value)} placeholder="سبب الإحالة إلى الإدارة" className="min-h-24" required /><DialogFooter><Button type="button" variant="outline" onClick={() => setRouteDialog(null)}>إلغاء</Button><Button disabled={routeTask.isPending || !routeTargetProfileId || routeReason.trim().length < 3} className="bg-[#2f7653] hover:bg-[#245d41]">{routeTask.isPending ? "جارٍ الإحالة…" : "إحالة مع توثيق السبب"}</Button></DialogFooter>{routeTask.error && <p className="text-xs text-[#a04a35]">{routeTask.error.message}</p>}</form></DialogContent></Dialog>
    <Dialog open={Boolean(exceptionDialog)} onOpenChange={open => { if (!open) { setExceptionDialog(null); setExceptionReason(""); } }}><DialogContent dir="rtl" className="max-w-lg"><DialogHeader><DialogTitle>{exceptionDialog?.kind === "reassignment" ? "طلب إعادة إسناد المهمة" : "بلاغ وجود عائق"}</DialogTitle><DialogDescription>{exceptionDialog?.kind === "reassignment" ? "اكتب سبب عدم البدء. يُسجل خصم تلقائي وفق سياسة المهمة، ويذهب الطلب إلى المدير المباشر لاتخاذ قرار إعادة التوزيع." : "اكتب وصف العائق بوضوح. يصل البلاغ مباشرة إلى المدير المباشر مع سجل المهمة."}</DialogDescription></DialogHeader><form onSubmit={event => { event.preventDefault(); if (exceptionDialog && exceptionReason.trim().length >= 3) requestException.mutate({ taskId: exceptionDialog.taskId, kind: exceptionDialog.kind, reason: exceptionReason.trim() }); }} className="space-y-3"><p className="rounded-lg bg-[#f7f5ef] px-3 py-2 text-xs font-bold text-[#355d4b]">المهمة: {exceptionDialog?.title}</p><Textarea value={exceptionReason} onChange={event => setExceptionReason(event.target.value)} placeholder={exceptionDialog?.kind === "reassignment" ? "سبب طلب إعادة الإسناد" : "وصف العائق والإجراء المطلوب"} className="min-h-28" required /><DialogFooter><Button type="button" variant="outline" onClick={() => setExceptionDialog(null)}>إلغاء</Button><Button disabled={requestException.isPending || exceptionReason.trim().length < 3} className="bg-[#2f7653] hover:bg-[#245d41]">{requestException.isPending ? "جارٍ الإحالة…" : "إرسال للمدير المباشر"}</Button></DialogFooter>{requestException.error && <p className="text-xs text-[#a04a35]">{requestException.error.message}</p>}</form></DialogContent></Dialog>
    <Dialog open={Boolean(selectedDecisionRequest)} onOpenChange={open => { if (!open) setDecisionRequestId(null); }}><DialogContent dir="rtl" className="max-w-xl"><DialogHeader><DialogTitle>{selectedDecisionRequest?.request.kind === "reassignment" ? "قرار طلب إعادة الإسناد" : "قرار بلاغ العائق"}</DialogTitle><DialogDescription>يُسجل القرار والتعليق باسم المدير. خصم عدم البدء يُحتسب تلقائياً عند تقديم طلب إعادة الإسناد، وتُمنح مكافأة الإنجاز للمكلف الذي ينهي المهمة بعد اعتمادها.</DialogDescription></DialogHeader>{selectedDecisionRequest && <div className="space-y-3"><div className="rounded-xl bg-[#f7f5ef] p-3 text-sm leading-7 text-[#365247]"><p><strong>المهمة:</strong> {selectedDecisionRequest.task.title}</p><p><strong>مقدم الطلب:</strong> {selectedDecisionRequest.requesterName}</p><p><strong>السبب:</strong> {selectedDecisionRequest.request.reason}</p>{selectedDecisionRequest.request.deductionPoints < 0 && <p><strong>الخصم التلقائي:</strong> {selectedDecisionRequest.request.deductionPoints} نقطة</p>}</div>{selectedDecisionRequest.request.kind === "reassignment" && <label className="block text-xs font-bold text-[#546b5f]">إعادة الإسناد إلى<select value={decisionAssigneeId} onChange={event => setDecisionAssigneeId(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="">اختر موظفاً من القسم</option>{decisionCandidates.map(person => <option key={person.id} value={person.id}>{person.fullName} · {person.jobTitle || "موظف"}</option>)}</select></label>}<Textarea value={decisionNote} onChange={event => setDecisionNote(event.target.value)} placeholder="تعليق القرار الإداري" className="min-h-24" required /><DialogFooter><Button type="button" variant="outline" disabled={decideException.isPending || decisionNote.trim().length < 3} onClick={() => decideException.mutate({ requestId: selectedDecisionRequest.request.id, decision: "rejected", managerNote: decisionNote.trim() })}>رفض مع توثيق القرار</Button><Button disabled={decideException.isPending || decisionNote.trim().length < 3 || (selectedDecisionRequest.request.kind === "reassignment" && !decisionAssigneeId)} onClick={() => decideException.mutate({ requestId: selectedDecisionRequest.request.id, decision: "approved", managerNote: decisionNote.trim(), reassigneeProfileId: decisionAssigneeId ? Number(decisionAssigneeId) : undefined })} className="bg-[#2f7653] hover:bg-[#245d41]">{decideException.isPending ? "جارٍ حفظ القرار…" : "اعتماد القرار"}</Button></DialogFooter>{decideException.error && <p className="text-xs text-[#a04a35]">{decideException.error.message}</p>}</div>}</DialogContent></Dialog>
    <Dialog open={Boolean(commentDialog)} onOpenChange={open => { if (!open) setCommentDialog(null); }}><DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle>إضافة تعليق</DialogTitle><DialogDescription>يُحفظ التعليق في جدول تعليقات المهمة ويرتبط بحسابك.</DialogDescription></DialogHeader><p className="rounded-lg bg-[#f7f5ef] px-3 py-2 text-sm font-bold text-[#355d4b]">{commentDialog?.title}</p><Textarea value={commentText} onChange={event => setCommentText(event.target.value)} placeholder="اكتب تعليقك هنا…" className="min-h-28" /><DialogFooter><Button type="button" variant="outline" onClick={() => setCommentDialog(null)}>إلغاء</Button><Button disabled={addTaskCommentMutation.isPending || commentText.trim().length < 2} onClick={() => commentDialog && addTaskCommentMutation.mutate({ taskId: commentDialog.taskId, comment: commentText.trim() })} className="bg-[#12352f] hover:bg-[#1d5245]">{addTaskCommentMutation.isPending ? "جارٍ الحفظ…" : "حفظ التعليق"}</Button></DialogFooter>{addTaskCommentMutation.error && <p className="text-xs text-[#a04a35]">{addTaskCommentMutation.error.message}</p>}</DialogContent></Dialog>
    <Dialog open={Boolean(reassignmentDialog)} onOpenChange={open => { if (!open) setReassignmentDialog(null); }}><DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle>طلب سحب/إعادة إسناد</DialogTitle><DialogDescription>اكتب سبب طلب إعادة الإسناد، وسيُوجّه الطلب إلى المدير المباشر لاتخاذ القرار.</DialogDescription></DialogHeader><p className="rounded-lg bg-[#f7f5ef] px-3 py-2 text-sm font-bold text-[#355d4b]">{reassignmentDialog?.title}</p><Textarea value={reassignmentReason} onChange={event => setReassignmentReason(event.target.value)} placeholder="سبب طلب السحب أو إعادة الإسناد" className="min-h-28" /><DialogFooter><Button type="button" variant="outline" onClick={() => setReassignmentDialog(null)}>إلغاء</Button><Button disabled={requestReassignmentMutation.isPending || reassignmentReason.trim().length < 3} onClick={() => reassignmentDialog && requestReassignmentMutation.mutate({ taskId: reassignmentDialog.taskId, reason: reassignmentReason.trim() })} className="bg-[#2f7653] hover:bg-[#245d41]">{requestReassignmentMutation.isPending ? "جارٍ الإرسال…" : "إرسال الطلب"}</Button></DialogFooter>{requestReassignmentMutation.error && <p className="text-xs text-[#a04a35]">{requestReassignmentMutation.error.message}</p>}</DialogContent></Dialog>
    <Dialog open={Boolean(obstacleDialog)} onOpenChange={open => { if (!open) setObstacleDialog(null); }}><DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle>تسجيل عائق</DialogTitle><DialogDescription>سيُسجَّل العائق على المهمة ويُرسل إشعار فوري للرئيس والأمين.</DialogDescription></DialogHeader><p className="rounded-lg bg-[#f7f5ef] px-3 py-2 text-sm font-bold text-[#355d4b]">{obstacleDialog?.title}</p><Textarea value={obstacleDetail} onChange={event => setObstacleDetail(event.target.value)} placeholder="وصف العائق والإجراء المطلوب" className="min-h-28" /><DialogFooter><Button type="button" variant="outline" onClick={() => setObstacleDialog(null)}>إلغاء</Button><Button disabled={reportObstacleMutation.isPending || obstacleDetail.trim().length < 3} onClick={() => obstacleDialog && reportObstacleMutation.mutate({ taskId: obstacleDialog.taskId, detail: obstacleDetail.trim() })} className="bg-[#c26a2b] hover:bg-[#a8571f]">{reportObstacleMutation.isPending ? "جارٍ التسجيل…" : "تسجيل العائق وتنبيه القيادة"}</Button></DialogFooter>{reportObstacleMutation.error && <p className="text-xs text-[#a04a35]">{reportObstacleMutation.error.message}</p>}</DialogContent></Dialog>
    <Dialog open={Boolean(modificationDialog)} onOpenChange={open => { if (!open) setModificationDialog(null); }}><DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle>طلب تعديل المهمة</DialogTitle><DialogDescription>صف التعديل المطلوب واذكر السبب، وسيُرسل لمديرك المباشر للمراجعة والاعتماد.</DialogDescription></DialogHeader><form onSubmit={event => { event.preventDefault(); if (modificationDialog && modificationReason.trim().length >= 3) requestModification.mutate({ taskId: modificationDialog.taskId, proposedChanges: { title: modificationTitle.trim(), taskNotes: modificationNotes.trim() || null, priority: modificationPriority, dueAt: modificationDueAt ? new Date(modificationDueAt) : undefined }, reason: modificationReason.trim() }); }} className="space-y-3"><p className="rounded-lg bg-[#f7f5ef] px-3 py-2 text-sm font-bold text-[#355d4b]">{modificationDialog?.title}</p><label className="block text-xs font-bold text-[#6a786f]">العنوان المقترح<Input value={modificationTitle} onChange={event => setModificationTitle(event.target.value)} className="mt-1" required /></label><label className="block text-xs font-bold text-[#6a786f]">التفاصيل / الملاحظات<Textarea value={modificationNotes} onChange={event => setModificationNotes(event.target.value)} className="mt-1 min-h-20" /></label><label className="block text-xs font-bold text-[#6a786f]">الأولوية<select value={modificationPriority} onChange={event => setModificationPriority(event.target.value as "normal" | "high" | "critical")} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="normal">عادية</option><option value="high">عالية</option><option value="critical">حرجة</option></select></label><label className="block text-xs font-bold text-[#6a786f]">موعد الاستحقاق المقترح<Input value={modificationDueAt} onChange={event => setModificationDueAt(event.target.value)} className="mt-1" type="datetime-local" /></label><label className="block text-xs font-bold text-[#6a786f]">سبب طلب التعديل<Textarea value={modificationReason} onChange={event => setModificationReason(event.target.value)} placeholder="لماذا تحتاج هذا التعديل؟ (3 أحرف على الأقل)" className="mt-1 min-h-20" required minLength={3} /></label><DialogFooter><Button type="button" variant="outline" onClick={() => setModificationDialog(null)}>إلغاء</Button><Button type="submit" disabled={requestModification.isPending || modificationReason.trim().length < 3} className="bg-[#12352f] hover:bg-[#1d5245]">{requestModification.isPending ? "جارٍ الإرسال…" : "إرسال الطلب"}</Button></DialogFooter></form></DialogContent></Dialog>

    <Dialog open={Boolean(extensionDialog)} onOpenChange={open => { if (!open) setExtensionDialog(null); }}><DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle>طلب تمديد الموعد</DialogTitle><DialogDescription>حدد موعد الاستحقاق الجديد واذكر السبب، وسيُسجّل الطلب في سجل المهمة.</DialogDescription></DialogHeader><form onSubmit={event => { event.preventDefault(); if (extensionDialog && extensionReason.trim().length >= 10 && extensionDueAt) requestExtensionMutation.mutate({ taskId: extensionDialog.taskId, newDueAt: new Date(extensionDueAt), reason: extensionReason.trim() }); }} className="space-y-3"><p className="rounded-lg bg-[#f7f5ef] px-3 py-2 text-sm font-bold text-[#355d4b]">{extensionDialog?.title}</p><Input type="datetime-local" value={extensionDueAt} onChange={event => setExtensionDueAt(event.target.value)} aria-label="موعد الاستحقاق الجديد" required /><Textarea value={extensionReason} onChange={event => setExtensionReason(event.target.value)} placeholder="سبب طلب التمديد (10 أحرف على الأقل)" className="min-h-20" required minLength={10} /><DialogFooter><Button type="button" variant="outline" onClick={() => setExtensionDialog(null)}>إلغاء</Button><Button type="submit" disabled={requestExtensionMutation.isPending || extensionReason.trim().length < 10 || !extensionDueAt} className="bg-[#8a6d20] hover:bg-[#6f5718]">{requestExtensionMutation.isPending ? "جارٍ الإرسال…" : "إرسال الطلب"}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={Boolean(detailsTaskId)} onOpenChange={open => { if (!open) setDetailsTaskId(null); }}><DialogContent dir="rtl" className="max-w-2xl"><DialogHeader><DialogTitle>تفاصيل المهمة</DialogTitle><DialogDescription>كامل تفاصيل المهمة والتعليقات والسجل الزمني.</DialogDescription></DialogHeader>{taskDetails.isLoading ? <div className="flex items-center gap-2 py-6 text-sm text-[#6e7e75]"><CircleDashed className="h-4 w-4 animate-spin" />جارٍ تحميل التفاصيل…</div> : taskDetails.data ? <div className="space-y-4"><div className="rounded-xl bg-[#f7f5ef] p-4 text-sm leading-7 text-[#365247]"><p className="break-words"><strong>المهمة:</strong> {taskDetails.data.task.title}</p>{taskDetails.data.task.taskNotes && <p className="break-words whitespace-pre-wrap"><strong>التفاصيل:</strong> {taskDetails.data.task.taskNotes}</p>}<p><strong>الحالة:</strong> {taskStatusLabel(taskDetails.data.task.status as TaskStatus)}</p><p><strong>الأولوية:</strong> {taskDetails.data.task.priority}</p><p><strong>نوع المهمة:</strong> {taskTypeLabel(taskDetails.data.task.taskType)}</p><p><strong>الاستحقاق:</strong> {formatTaskDate(taskDetails.data.task.dueAt, taskDetails.data.task.isOpen)}</p>{taskDetails.data.task.completionNote && <p><strong>ملاحظة الإتمام:</strong> {taskDetails.data.task.completionNote}</p>}{taskDetails.data.task.obstacleDetail && <p className="text-[#9d4034]"><strong>تفاصيل العائق:</strong> {taskDetails.data.task.obstacleDetail}</p>}</div>{taskDetails.data.task.status !== "completed" && taskDetails.data.task.status !== "cancelled" && (taskDetails.data.task.assigneeProfileId === currentProfile.data?.id || canAssign) && <div className="flex flex-wrap gap-2">{taskDetails.data.task.assigneeProfileId === currentProfile.data?.id && taskDetails.data.task.status === "new" && <Button type="button" size="sm" disabled={acknowledge.isPending} onClick={() => acknowledge.mutate({ taskId: taskDetails.data!.task.id })} className="bg-[#12352f] hover:bg-[#1d5245]"><Play className="ml-1 h-4 w-4" />بدء العمل</Button>}{taskDetails.data.task.status === "in_progress" && <Button type="button" size="sm" disabled={submitForReview.isPending} onClick={() => submitForReview.mutate({ taskId: taskDetails.data!.task.id })} className="bg-[#2f7653] hover:bg-[#245d41]"><CheckCircle2 className="ml-1 h-4 w-4" />تمت المعالجة</Button>}</div>}{taskDetails.data.attachments.length > 0 && <div className="space-y-2"><p className="text-xs font-bold text-[#53675d]">المرفقات</p>{taskDetails.data.attachments.map(attachment => <button key={attachment.id} type="button" onClick={() => downloadTaskAttachment.mutate({ attachmentId: attachment.id, source: "task" })} disabled={downloadTaskAttachment.isPending} className="flex items-center gap-2 rounded-xl bg-white p-2 text-xs font-bold text-[#28623f] underline"><Paperclip className="h-3.5 w-3.5" />{attachment.originalName}</button>)}</div>}{(() => { const pendingApproval = (taskDetails.data.approvals ?? []).find((a: { id: number; status: string }) => a.status === "pending"); const canDecide = taskDetails.data.task.status === "under_review" && canReviewApprovals && Boolean(pendingApproval); if (!canDecide) return null; return <div className="rounded-xl border border-[#f3e5bf] bg-[#fffaf0] p-3"><h4 className="text-sm font-bold text-[#6f552c]">📝 قرارك على المهمة</h4><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => setApprovalRating("excellent")} className={`px-3 py-1.5 rounded-md text-xs font-bold ${approvalRating === "excellent" ? "bg-green-600 ring-2 ring-black text-white" : "bg-green-100 text-green-800"}`}>🟢 ممتاز (+5)</button><button type="button" onClick={() => setApprovalRating("good")} className={`px-3 py-1.5 rounded-md text-xs font-bold ${approvalRating === "good" ? "bg-yellow-500 ring-2 ring-black text-white" : "bg-yellow-100 text-yellow-800"}`}>🟡 متوسط (+3)</button><button type="button" onClick={() => setApprovalRating("acceptable")} className={`px-3 py-1.5 rounded-md text-xs font-bold ${approvalRating === "acceptable" ? "bg-red-500 ring-2 ring-black text-white" : "bg-red-100 text-red-800"}`}>🔴 مقبول (+1)</button></div><Textarea value={approvalReviewNote} onChange={event => setApprovalReviewNote(event.target.value)} placeholder="ملاحظة القرار (اختياري)" className="mt-2 min-h-16" /><div className="mt-2 flex flex-wrap gap-2"><Button type="button" size="sm" disabled={reviewApprovalMutation.isPending} onClick={() => pendingApproval && reviewApprovalMutation.mutate({ approvalId: pendingApproval.id, decision: "approved", note: approvalReviewNote.trim() || "تم الاعتماد", managerRating: approvalRating })} className="bg-[#2f7653] text-white hover:bg-[#245d41]">✅ اعتماد + تقييم</Button><Button type="button" size="sm" variant="outline" disabled={reviewApprovalMutation.isPending} onClick={() => pendingApproval && reviewApprovalMutation.mutate({ approvalId: pendingApproval.id, decision: "rejected", note: approvalReviewNote.trim() || "تم الرفض" })} className="border-[#e8b4a8] text-[#a04a35]">❌ رفض</Button></div></div>; })()}<div className="rounded-xl border border-[#d8e5da] bg-white p-3"><p className="text-xs font-bold text-[#53675d]">إضافة تعليق</p><Textarea value={detailsComment} onChange={event => setDetailsComment(event.target.value)} placeholder="اكتب تعليقاً على هذه المهمة…" className="mt-1 min-h-20 bg-[#fbfdfb]" /><Button type="button" size="sm" disabled={!detailsComment.trim() || addTaskCommentMutation.isPending} onClick={() => taskDetails.data && addTaskCommentMutation.mutate({ taskId: taskDetails.data.task.id, comment: detailsComment.trim() })} className="mt-2 bg-[#12352f] hover:bg-[#1d5245]"><Send className="ml-1 h-4 w-4" />{addTaskCommentMutation.isPending ? "جارٍ الحفظ…" : "إضافة تعليق"}</Button>{addTaskCommentMutation.error && <p className="mt-2 text-xs text-[#a04a35]">{addTaskCommentMutation.error.message}</p>}</div>{taskDetails.data.comments.length > 0 && <div className="space-y-2"><p className="text-xs font-bold text-[#53675d]">التعليقات</p>{taskDetails.data.comments.map(item => <article key={item.id} className="rounded-xl bg-white p-3"><p className="text-xs font-bold text-[#335349]">{item.authorName ?? "مستخدم المنصة"}</p><p className="mt-1 text-sm leading-6 text-[#50665a]">{item.comment}</p></article>)}</div>}{taskDetails.data.timeline.length > 0 && <div className="space-y-2"><p className="text-xs font-bold text-[#53675d]">السجل الزمني</p>{taskDetails.data.timeline.map(update => <article key={update.id} className="rounded-xl bg-white p-3"><p className="text-xs font-bold text-[#335349]">{update.actorName} · {update.updateType}</p>{update.note && <p className="mt-1 text-sm leading-6 text-[#50665a]">{update.note}</p>}</article>)}</div>}</div> : <p className="py-6 text-center text-sm text-[#748279]">لا تتوفر تفاصيل لهذه المهمة ضمن نطاقك.</p>}</DialogContent></Dialog>
    <Dialog open={Boolean(editDialog)} onOpenChange={open => { if (!open) setEditDialog(null); }}><DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>تعديل المهمة</DialogTitle><DialogDescription>عدّل بيانات المهمة ثم احفظ التغييرات.</DialogDescription></DialogHeader><form onSubmit={submitEdit} className="space-y-3"><label className="block text-xs font-bold text-[#6a786f]">العنوان<Input value={editForm.title} onChange={event => setEditForm({ ...editForm, title: event.target.value })} className="mt-1" required /></label><label className="block text-xs font-bold text-[#6a786f]">التفاصيل / الملاحظات<Textarea value={editForm.taskNotes} onChange={event => setEditForm({ ...editForm, taskNotes: event.target.value })} className="mt-1 min-h-20" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-bold text-[#6a786f]">الأولوية<select value={editForm.priority} onChange={event => setEditForm({ ...editForm, priority: event.target.value as typeof editForm.priority })} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="normal">عادية</option><option value="high">عالية</option><option value="critical">حرجة</option></select></label><label className="block text-xs font-bold text-[#6a786f]">نوع المهمة<select value={editForm.taskType} onChange={event => setEditForm({ ...editForm, taskType: event.target.value as typeof editForm.taskType })} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="permanent">عادية</option><option value="urgent">عاجلة</option></select></label><label className="block text-xs font-bold text-[#6a786f]">من تاريخ<Input value={editForm.scheduledFor} onChange={event => setEditForm({ ...editForm, scheduledFor: event.target.value })} className="mt-1" type="datetime-local" required /></label><label className="block text-xs font-bold text-[#6a786f]">إلى تاريخ<Input value={editForm.dueAt} onChange={event => setEditForm({ ...editForm, dueAt: event.target.value })} className="mt-1" type="datetime-local" disabled={editForm.isOpen} required={!editForm.isOpen} /></label></div><label className="flex items-center gap-2 text-xs font-bold text-[#6a786f]"><input type="checkbox" checked={editForm.isOpen} onChange={event => setEditForm({ ...editForm, isOpen: event.target.checked })} className="h-4 w-4" />مهمة مفتوحة (بدون تاريخ استحقاق)</label><label className="block text-xs font-bold text-[#6a786f]">القسم<select value={editUnitId} onChange={event => { setEditUnitId(event.target.value); setEditForm({ ...editForm, assigneeProfileId: "" }); }} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="">بدون قسم</option>{units.data?.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label><label className="block text-xs font-bold text-[#6a786f]">المكلف بالمهمة<select value={editForm.assigneeProfileId} onChange={event => setEditForm({ ...editForm, assigneeProfileId: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="">{editUnitId ? "اختر المكلف من القسم" : "بدون مكلف"}</option>{editAssigneeCandidates.map(person => <option key={person.id} value={person.id}>{person.fullName} · {person.personType === "trainee" ? "ملازم" : person.personType === "judge" ? "قاضٍ" : "موظف"}</option>)}</select></label><div className="mt-3 space-y-2"><label className="block text-xs font-bold text-[#6a786f]">التكرار<select value={editRecurrence} onChange={event => setEditRecurrence(event.target.value as typeof editRecurrence)} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="none">بدون تكرار</option><option value="daily">يومي</option><option value="weekly">أسبوعي (كل أحد)</option><option value="monthly">شهري (يوم 1)</option><option value="quarterly">ربع سنوي</option><option value="yearly">سنوي</option><option value="custom">كل X أيام</option><option value="specific_days">أيام محددة من الأسبوع</option></select></label>{editRecurrence === "custom" && <input type="number" min={1} max={365} value={editIntervalDays} onChange={event => setEditIntervalDays(Number(event.target.value))} placeholder="كل X أيام" className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm" />}{editRecurrence === "specific_days" && <div className="flex flex-wrap gap-2 mt-1">{[{ day: 0, label: "الأحد" },{ day: 1, label: "الاثنين" },{ day: 2, label: "الثلاثاء" },{ day: 3, label: "الأربعاء" },{ day: 4, label: "الخميس" },{ day: 5, label: "الجمعة" },{ day: 6, label: "السبت" }].map(({ day, label }) => <label key={day} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={editSpecificDays.includes(day)} onChange={event => { if (event.target.checked) { setEditSpecificDays([...editSpecificDays, day]); } else { setEditSpecificDays(editSpecificDays.filter(d => d !== day)); } }} className="h-4 w-4 accent-[#2d6b4f]" />{label}</label>)}</div>}{editRecurrence === "specific_days" && editSpecificDays.length === 0 && <p className="text-xs text-red-500 mt-1">⚠️ اختر يوم واحد على الأقل</p>}</div><DialogFooter><Button type="button" variant="outline" onClick={() => setEditDialog(null)}>إلغاء</Button><Button type="submit" disabled={update.isPending} className="bg-[#12352f] hover:bg-[#1d5245]">{update.isPending ? "جارٍ الحفظ…" : "حفظ التعديلات"}</Button></DialogFooter>{update.error && <p className="text-xs text-[#a04a35]">{update.error.message}</p>}</form></DialogContent></Dialog>
    <Dialog open={Boolean(cancelDialog)} onOpenChange={open => { if (!open) setCancelDialog(null); }}><DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle>إلغاء المهمة</DialogTitle><DialogDescription>سيتم إلغاء المهمة وحفظ سبب الإلغاء في سجلها.</DialogDescription></DialogHeader><p className="rounded-lg bg-[#f7f5ef] px-3 py-2 text-sm font-bold text-[#355d4b]">{cancelDialog?.title}</p><Textarea value={cancelReason} onChange={event => setCancelReason(event.target.value)} placeholder="سبب إلغاء المهمة (مطلوب، 3 أحرف على الأقل)…" className="min-h-28" /><DialogFooter><Button type="button" variant="outline" onClick={() => setCancelDialog(null)}>رجوع</Button><Button disabled={cancel.isPending || cancelReason.trim().length < 3} onClick={submitCancel} className="bg-[#a04a35] hover:bg-[#823a2a]">{cancel.isPending ? "جارٍ الإلغاء…" : "تأكيد الإلغاء"}</Button></DialogFooter>{cancel.error && <p className="text-xs text-[#a04a35]">{cancel.error.message}</p>}</DialogContent></Dialog>
    <Dialog open={Boolean(approvalDetails)} onOpenChange={open => { if (!open) setApprovalDetails(null); }}><DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>تفاصيل المهمة</DialogTitle><DialogDescription>استعرض تفاصيل المهمة والاعتمادات قبل اتخاذ القرار.</DialogDescription></DialogHeader>{approvalTaskDetails.isLoading ? <div className="flex items-center gap-2 py-6 text-sm text-[#6e7e75]"><CircleDashed className="h-4 w-4 animate-spin" />جارٍ تحميل التفاصيل…</div> : approvalTaskDetails.data ? <div className="space-y-4"><div className="rounded-xl bg-[#f7f5ef] p-4 text-sm leading-7 text-[#365247]"><p className="break-words"><strong>المهمة:</strong> {approvalTaskDetails.data.task.title}</p>{approvalTaskDetails.data.task.taskNotes && <p className="break-words whitespace-pre-wrap"><strong>التفاصيل:</strong> {approvalTaskDetails.data.task.taskNotes}</p>}<div className="mt-2 grid gap-1 sm:grid-cols-2"><p><strong>الحالة:</strong> {taskStatusLabel(approvalTaskDetails.data.task.status as TaskStatus)}</p><p><strong>الأولوية:</strong> {approvalTaskDetails.data.task.priority}</p><p><strong>المسؤول:</strong> {approvalTaskDetails.data.assigneeName || "غير محدد"}</p><p><strong>موعد البدء:</strong> {formatTaskDate(approvalTaskDetails.data.task.scheduledFor)}</p><p><strong>الاستحقاق:</strong> {formatTaskDate(approvalTaskDetails.data.task.dueAt, approvalTaskDetails.data.task.isOpen)}</p>{approvalTaskDetails.data.task.completedAt ? <p><strong>الإتمام:</strong> {formatTaskDate(approvalTaskDetails.data.task.completedAt)}</p> : null}</div></div>{approvalTaskDetails.data.lastEmployeeSubmission ? <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-xs font-bold text-[#12352f]">📎 عمل الموظف (المرفوع للاعتماد)</p><p className="mt-1 text-xs text-gray-600">📅 قدّمه: {approvalTaskDetails.data.lastEmployeeSubmission.submittedByName || "—"} — {approvalTaskDetails.data.lastEmployeeSubmission.submittedAt ? new Date(approvalTaskDetails.data.lastEmployeeSubmission.submittedAt).toLocaleString("ar-SA") : "—"}</p><p className="mt-2 text-xs font-medium">📝 ملاحظات الموظف:</p><p className="text-sm text-gray-800">{approvalTaskDetails.data.lastEmployeeSubmission.note || "لا توجد ملاحظات"}</p><p className="mt-2 text-xs font-medium">📎 المرفقات:</p>{approvalTaskDetails.data.allEmployeeAttachments?.length ? <div className="mt-1 flex flex-col gap-1.5">{approvalTaskDetails.data.allEmployeeAttachments.map((att: { id: number; fileName: string; sizeBytes: number | null; source: string }) => <button key={att.id} type="button" onClick={() => downloadTaskAttachment.mutate({ attachmentId: att.id, source: att.source })} disabled={downloadTaskAttachment.isPending} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-right text-blue-600 transition-colors hover:bg-blue-50" title="اضغط للتحميل"><span className="flex min-w-0 items-center gap-2 truncate">📎 {att.fileName}{att.source === "submission" ? <span className="text-xs text-gray-400">(تسليم)</span> : null}</span><span className="shrink-0 text-xs text-gray-500">{Math.round((att.sizeBytes ?? 0) / 1024)}KB</span></button>)}</div> : <p className="text-sm text-gray-500">لا توجد مرفقات</p>}</div> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm text-amber-800">⚠️ لم يُرفع أي عمل من الموظف بعد. لا تعتمد قبل استلام العمل.</p></div>}{approvalTaskDetails.data.attachments?.length ? <div className="rounded-xl border border-[#e7e0d4] p-3"><p className="text-xs font-bold text-[#12352f]">المرفقات</p><div className="mt-2 space-y-1.5">{approvalTaskDetails.data.attachments.map((att: { id: number; originalName: string; sizeBytes: number | null }) => <button key={att.id} type="button" onClick={() => downloadTaskAttachment.mutate({ attachmentId: att.id, source: "task" })} disabled={downloadTaskAttachment.isPending} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-right text-blue-600 transition-colors hover:bg-blue-50" title="اضغط للتحميل"><span className="flex min-w-0 items-center gap-2 truncate">📎 {att.originalName}</span><span className="shrink-0 text-xs text-gray-500">{Math.round((att.sizeBytes ?? 0) / 1024)}KB</span></button>)}</div></div> : null}{approvalTaskDetails.data.approvals?.length ? <div className="rounded-xl border border-[#e7e0d4] p-3"><p className="text-xs font-bold text-[#12352f]">الاعتمادات السابقة</p><div className="mt-2 space-y-1.5">{approvalTaskDetails.data.approvals.map((ap: { id: number; status: string; rating: string | null; reviewerName: string | null; reviewedAt: Date | string | number | null; note: string | null }) => <div key={ap.id} className="rounded-lg bg-[#fbfaf6] px-2.5 py-1.5 text-xs leading-5 text-[#4c5f54]"><span className="font-bold">{ap.status === "approved" ? "معتمد" : ap.status === "rejected" ? "مرفوض" : "معلق"}</span>{ap.rating ? ` · ${ap.rating === "excellent" ? "🟢 ممتاز" : ap.rating === "acceptable" ? "🔴 مقبول" : "🟡 متوسط"}` : ""}{ap.reviewerName ? ` · ${ap.reviewerName}` : ""}{ap.reviewedAt ? ` · ${formatTaskDate(ap.reviewedAt)}` : ""}{ap.note ? <p className="mt-0.5 text-[#7a887f]">{ap.note}</p> : null}</div>)}</div></div> : null}<div className="rounded-xl border border-[#e7e0d4] p-3"><p className="text-xs font-bold text-[#12352f]">السجل الزمني</p><TaskCommentTimelinePanel taskId={approvalDetails?.taskId ?? 0} candidates={mentionCandidates} /></div></div> : <p className="py-6 text-center text-sm text-[#6e7e75]">تعذر تحميل التفاصيل.</p>}<DialogFooter><Button type="button" variant="outline" onClick={() => setApprovalDetails(null)}>إغلاق</Button><Button type="button" variant="outline" disabled={reviewApprovalMutation.isPending} onClick={() => { setRejectReason(""); setRejectDialogOpen(true); }} className="border-[#e8b4a8] text-[#a04a35]">❌ رفض</Button><Button type="button" disabled={reviewApprovalMutation.isPending} onClick={() => setApproveDialogOpen(true)} className="bg-[#2f7653] text-white hover:bg-[#245d41]">✅ اعتماد</Button></DialogFooter>{reviewApprovalMutation.error && <p className="px-6 pb-4 text-xs text-[#a04a35]">{reviewApprovalMutation.error.message}</p>}</DialogContent></Dialog>
    <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}><DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle>رفض المهمة</DialogTitle><DialogDescription>اكتب سبب الرفض وسيُعاد إشعار الموظف به وتعود المهمة للتنفيذ.</DialogDescription></DialogHeader><Textarea value={rejectReason} onChange={event => setRejectReason(event.target.value)} placeholder="سبب الرفض (إلزامي، 10-500 حرف)…" className="min-h-28" /><DialogFooter><Button type="button" variant="outline" onClick={() => setRejectDialogOpen(false)}>إلغاء</Button><Button type="button" disabled={reviewApprovalMutation.isPending || rejectReason.trim().length < 10 || rejectReason.trim().length > 500} onClick={() => approvalDetails && reviewApprovalMutation.mutate({ approvalId: approvalDetails.approvalId, decision: "rejected", note: rejectReason.trim() })} className="bg-[#a04a35] hover:bg-[#823a2a]">❌ تأكيد الرفض</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}><DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle>اعتماد المهمة</DialogTitle><DialogDescription>قيّم عمل الموظف وأضف ملاحظة اختيارية، ثم أكّد الاعتماد.</DialogDescription></DialogHeader><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setApprovalRating("excellent")} className={`px-3 py-1.5 rounded-md text-xs font-bold ${approvalRating === "excellent" ? "bg-green-600 ring-2 ring-black text-white" : "bg-green-100 text-green-800"}`}>🟢 ممتاز (+5)</button><button type="button" onClick={() => setApprovalRating("good")} className={`px-3 py-1.5 rounded-md text-xs font-bold ${approvalRating === "good" ? "bg-yellow-500 ring-2 ring-black text-white" : "bg-yellow-100 text-yellow-800"}`}>🟡 متوسط (+3)</button><button type="button" onClick={() => setApprovalRating("acceptable")} className={`px-3 py-1.5 rounded-md text-xs font-bold ${approvalRating === "acceptable" ? "bg-red-500 ring-2 ring-black text-white" : "bg-red-100 text-red-800"}`}>🔴 مقبول (+1)</button></div><Textarea value={approvalReviewNote} onChange={event => setApprovalReviewNote(event.target.value)} placeholder="ملاحظة القرار (اختياري)…" className="mt-3 min-h-20" /><DialogFooter><Button type="button" variant="outline" onClick={() => setApproveDialogOpen(false)}>إلغاء</Button><Button type="button" disabled={reviewApprovalMutation.isPending} onClick={() => approvalDetails && reviewApprovalMutation.mutate({ approvalId: approvalDetails.approvalId, decision: "approved", note: approvalReviewNote.trim() || "تم الاعتماد", managerRating: approvalRating })} className="bg-[#2f7653] text-white hover:bg-[#245d41]">✅ تأكيد الاعتماد</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
