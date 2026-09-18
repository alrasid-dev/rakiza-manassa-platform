import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TaskAttachmentPreviewDialog } from "@/components/TaskAttachmentPreviewDialog";
import { TaskCommentTimelinePanel } from "@/components/TaskCommentTimelinePanel";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { AlertCircle, AlertTriangle, ChevronLeft, ChevronRight, CheckCircle2, CircleDashed, Copy, Download, FilePlus2, FileText, ListChecks, Loader2, MessageCircle, Paperclip, Pin, PinOff, Play, RefreshCcw, RotateCw, Search, Send, ShieldAlert, Sparkles, UserRoundCheck, ZoomIn, ZoomOut } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";

type TaskStatus = "new" | "in_progress" | "under_review" | "completed" | "overdue" | "cancelled";

function taskStatusLabel(status: TaskStatus) {
  return ({ new: "جديدة", in_progress: "قيد التنفيذ", under_review: "بانتظار تأكيد المدير", completed: "مكتملة", overdue: "متأخرة", cancelled: "ملغاة" } as const)[status];
}

export function taskTypeLabel(taskType: "permanent" | "urgent" | null | undefined) {
  return taskType === "urgent" ? "عاجلة" : "عادية";
}

export function taskTypeBadgeClasses(taskType: "permanent" | "urgent" | null | undefined) {
  return taskType === "urgent" ? "bg-[#fbe0db] text-[#9d4034] ring-1 ring-[#e8b4a8]" : "bg-[#eef2ed] text-[#52665b] ring-1 ring-[#d9e0db]";
}

export type DashboardTaskFilterValue = "all" | "active" | "overdue" | "due_soon" | "completed";
export function taskMatchesDashboardFilter(task: { status: TaskStatus; dueAt: Date | string | number; scheduledFor?: Date | string | number | null }, filter: DashboardTaskFilterValue) {
  if (filter === "all") return true;
  if (filter === "active") return ["new", "in_progress", "under_review"].includes(task.status);
  if (filter === "completed") return task.status === "completed";
  return taskVisualState({ status: task.status, dueAt: task.dueAt, scheduledFor: task.scheduledFor }) === filter;
}

function formatTaskDate(value: Date | string | number) {
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export type TaskVisualState = "completed" | "overdue" | "due_soon" | "starting" | "normal";
export function taskVisualState(task: { status: TaskStatus; dueAt: Date | string | number; scheduledFor?: Date | string | number | null }, now = Date.now()): TaskVisualState {
  if (task.status === "completed") return "completed";
  if (task.status === "overdue" || new Date(task.dueAt).getTime() <= now) return "overdue";
  if (new Date(task.dueAt).getTime() - now <= 24 * 60 * 60 * 1000) return "due_soon";
  if (task.scheduledFor && task.status === "new") {
    const scheduled = new Date(task.scheduledFor).getTime();
    if (Math.abs(scheduled - now) <= 2 * 60 * 60 * 1000) return "starting";
  }
  return "normal";
}

export function taskVisualClasses(state: TaskVisualState) {
  return ({ completed: "border-[#b9d8bf] bg-[#f2f8f2]", overdue: "border-[#efc0b5] bg-[#fff3ef] rakiza-task-overdue", due_soon: "border-[#ead594] bg-[#fffaf0] rakiza-task-due-soon", starting: "border-[#9ecfae] bg-[#eef7f1] rakiza-task-starting", normal: "border-transparent bg-transparent" } as const)[state];
}

export function taskStateBadgeClasses(state: TaskVisualState) {
  return ({ completed: "bg-[#dff0e2] text-[#216345]", overdue: "bg-[#fbe0db] text-[#9d4034]", due_soon: "bg-[#fff0c2] text-[#80642b]", starting: "bg-[#d9f2e3] text-[#1c6b3f]", normal: "bg-[#eef2ed] text-[#52665b]" } as const)[state];
}

export function taskStateIcon(state: TaskVisualState): { icon: typeof Play; label: string } {
  return ({ starting: { icon: Play, label: "بدء المهمة" }, due_soon: { icon: AlertTriangle, label: "قرب الاستحقاق" }, overdue: { icon: AlertCircle, label: "تأخير عاجل" }, completed: { icon: CheckCircle2, label: "منجزة" }, normal: { icon: CircleDashed, label: "ضمن المسار" } } as const)[state];
}

export function TaskStateBadge({ state, statusLabel, stateText, onActivate }: { state: TaskVisualState; statusLabel: string; stateText: string; onActivate?: () => void }) {
  const { icon: StateIcon, label } = taskStateIcon(state);
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${taskStateBadgeClasses(state)}`}><button type="button" onClick={onActivate} disabled={!onActivate} title={label} aria-label={label} className={`group -ml-1 mr-1 inline-flex h-6 w-6 items-center justify-center rounded-full align-middle transition-transform duration-200 ${onActivate ? "cursor-pointer hover:scale-125 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current" : "cursor-default"}`}><StateIcon aria-hidden="true" className="h-4 w-4 transition-transform duration-200 group-hover:rotate-6 group-active:rotate-12" /></button>{statusLabel} · {stateText}</span>;
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
  const permission = trpc.court.registration.myPermission.useQuery();
  const roles = trpc.court.myRoles.useQuery();
  const canAssign = permission.data === "full_control" || roles.data?.some(role => role === "court_president" || role === "assistant_president" || role === "court_secretary" || role === "department_manager" || role === "trainee_affairs_manager");
  const routeTargets = trpc.court.tasks.routeTargets.useQuery(undefined, { enabled: Boolean(canAssign) });
  const people = trpc.court.people.list.useQuery();
  const currentProfile = trpc.court.people.self.useQuery();
  const units = trpc.court.units.list.useQuery();
  const [taskView, setTaskView] = useState<"mine" | "scope">("mine");
  const platformWide = permission.data === "full_control" || Boolean(roles.data?.some(role => role === "court_president" || role === "assistant_president" || role === "court_secretary"));
  const taskQuery = taskView === "mine" && currentProfile.data?.id ? { assigneeProfileId: currentProfile.data.id } : undefined;
  const tasks = trpc.court.tasks.list.useQuery(taskQuery, { enabled: taskView === "scope" || Boolean(currentProfile.data?.id) });
  const conversations = trpc.court.communications.conversations.list.useQuery();
  const create = trpc.court.tasks.create.useMutation({
    onSuccess: () => { utils.court.tasks.list.invalidate(); toast.success("تم إسناد المهمة وإشعار المكلف والنسخة المختارة."); },
  });
  const createSelf = trpc.court.tasks.createSelf.useMutation({
    onSuccess: () => { utils.court.tasks.list.invalidate(); setSelfForm({ title: "", priority: "normal", taskType: "permanent", taskNotes: "", scheduledFor: "", dueAt: "" }); toast.success("تم حفظ المهمة الذاتية وإشعار المدير المباشر للمراجعة."); },
  });
  const acknowledge = trpc.court.tasks.acknowledge.useMutation({
    onSuccess: result => { utils.court.tasks.list.invalidate(); toast.success(result.earlyStartRewarded ? "تم بدء المهمة مبكراً وإضافة مكافأة إلى سجل الإنجاز." : "تم استلام المهمة وبدء التنفيذ."); },
  });
  const submitForReviewRequest = trpc.court.tasks.submitForReview.useMutation({
    onSuccess: (_result, input) => { utils.court.tasks.list.invalidate(); setCompletionConfirmDialog(null); setCompletionNote(""); setCompletionSuccessTaskId(input.taskId); toast.success("تم إتمام المهمة وإرسالها للمدير المباشر للمراجعة والاعتماد."); },
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
  const [commentDialog, setCommentDialog] = useState<{ taskId: number; title: string } | null>(null);
  const [commentText, setCommentText] = useState("");
  const [detailsComment, setDetailsComment] = useState("");
  const [reassignmentDialog, setReassignmentDialog] = useState<{ taskId: number; title: string } | null>(null);
  const [reassignmentReason, setReassignmentReason] = useState("");
  const [obstacleDialog, setObstacleDialog] = useState<{ taskId: number; title: string } | null>(null);
  const [obstacleDetail, setObstacleDetail] = useState("");
  const [detailsTaskId, setDetailsTaskId] = useState<number | null>(null);
  const taskDetails = trpc.court.tasks.details.useQuery({ taskId: detailsTaskId ?? 0 }, { enabled: Boolean(detailsTaskId) });
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
  const setPinned = trpc.court.tasks.setPinned.useMutation({
    onSuccess: () => { utils.court.tasks.list.invalidate(); },
  });
  const setNotes = trpc.court.tasks.setNotes.useMutation({
    onSuccess: () => { utils.court.tasks.list.invalidate(); },
  });
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});
  const [form, setForm] = useState({ title: "", priority: "normal" as "normal" | "high" | "critical", taskType: "permanent" as "permanent" | "urgent", taskNotes: "", attachments: [] as { originalName: string; mimeType: string; contentBase64: string }[], assigneeProfileId: "", watcherProfileId: "", scheduledFor: "", dueAt: "", recurrence: "none" as "none" | "daily" | "weekly" | "monthly" | "custom", recurrenceEndAt: "", isConfidential: false, confidentialityExpiresAt: "" });
  const [assigneeUnitId, setAssigneeUnitId] = useState("");
  const [watcherUnitId, setWatcherUnitId] = useState("");
  const [selfForm, setSelfForm] = useState({ title: "", priority: "normal" as "normal" | "high" | "critical", taskType: "permanent" as "permanent" | "urgent", taskNotes: "", scheduledFor: "", dueAt: "" });
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
  const [taskWorkspaceId, setTaskWorkspaceId] = useState<number | null>(null);
  const [taskAttachment, setTaskAttachment] = useState<{ originalName: string; mimeType: string; contentBase64: string } | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<{ id: number; originalName: string; storageUrl: string; mimeType: string } | null>(null);
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
  const watcherCandidates = useMemo(() => watcherUnitId ? activePeople.filter(p => p.unitId === Number(watcherUnitId)) : [], [activePeople, watcherUnitId]);
  const traineeCopyCandidates = useMemo(() => traineeCopyUnitId ? trainees.filter(p => p.unitId === Number(traineeCopyUnitId)) : [], [trainees, traineeCopyUnitId]);
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
  }) : { isPending: false, error: null, mutate: () => toast.error("رفع المرفقات غير متاح في هذه النسخة من الواجهة.") };
  const actionTasks = (tasks.data ?? []).filter(task => task.assigneeProfileId === currentProfile.data?.id && task.status !== "completed" && task.status !== "cancelled");
  const mentionCandidates = activePeople.filter(person => person.id !== currentProfile.data?.id);
  const visibleTasks = useMemo(() => {
    const filter = requestedTaskFilter as DashboardTaskFilterValue;
    const filtered = filter === "all" ? (tasks.data ?? []) : (tasks.data ?? []).filter(task => taskMatchesDashboardFilter({ status: task.status as TaskStatus, dueAt: task.dueAt, scheduledFor: task.scheduledFor }, filter));
    return [...filtered].sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));
  }, [tasks.data, requestedTaskFilter]);

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

  const openAttachmentPreview = (attachment: { id: number; originalName: string; storageUrl: string; mimeType: string }) => {
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
    createSelf.mutate({ title: selfForm.title, priority: selfForm.priority, taskType: selfForm.taskType, taskNotes: selfForm.taskNotes.trim() || undefined, scheduledFor: new Date(selfForm.scheduledFor), dueAt: new Date(selfForm.dueAt) });
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
      traineeCopyProfileId: selectedCopy,
      scheduledFor: new Date(form.scheduledFor),
      dueAt: new Date(form.dueAt),
      watcherProfileId: form.watcherProfileId ? Number(form.watcherProfileId) : undefined,
      recurrence: form.recurrence,
      recurrenceEndAt: form.recurrenceEndAt ? new Date(form.recurrenceEndAt) : undefined,
      isConfidential: form.isConfidential,
      confidentialityExpiresAt: form.confidentialityExpiresAt ? new Date(form.confidentialityExpiresAt) : undefined,
    });
  };

  return <section className="mx-auto max-w-6xl">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-bold tracking-[0.14em] text-[#b18448]">تشغيل ومتابعة</p><h1 className="mt-2 text-3xl font-bold text-[#12352f]">{canAssign ? "المهام والمتابعة" : "مهامي وطلباتي"}</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-[#65766d]">{canAssign ? "إسناد مباشر ومتابعة مسار المعالجة، مع اختيار ملازم كنسخة تنبيه عند الحاجة." : "تظهر هنا المهام المخولة لك فقط، ويمكنك تأكيد المعالجة أو إرسال تعليق ضمن المسار المعتمد."}</p></div><div className="flex items-center gap-2"><Button type="button" onClick={() => setLocation("/correspondence?type=request")} variant="outline" className="border-[#b6d5bd] text-[#1d6243]"><Send className="ml-1 h-4 w-4" />إنشاء طلب</Button><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e9f0ea] text-[#1f5a47]"><ListChecks className="h-6 w-6" /></div></div>
    </header>
    {attachmentPreview && <TaskAttachmentPreviewDialog attachment={attachmentPreview} attachments={taskAttachments.data ?? []} taskId={taskWorkspaceId} onClose={() => { setAttachmentPreview(null); setPreviewLoading(false); }} />}
    {tasks.data?.length ? <section className="mt-5 rounded-[1.35rem] border border-[#d7e6d8] bg-[#f7fbf7] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-[#12352f]">كتابة ومرفقات المهمة</p><p className="mt-1 text-xs text-[#6d7d74]">اختر المهمة، ثم دوّن تحديثك أو أضف ملفات العمل المرتبطة بها.</p></div><select aria-label="اختيار مهمة للكتابة والمرفقات" value={taskWorkspaceId?.toString() ?? ""} onChange={event => { setTaskWorkspaceId(event.target.value ? Number(event.target.value) : null); setTaskAttachment(null); }} className="h-10 min-w-56 rounded-md border border-[#b8d1bc] bg-white px-3 text-sm"><option value="">اختر مهمة</option>{tasks.data.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></div>{workspaceTask && <div className="mt-4 grid gap-4 border-t border-[#dce8de] pt-4 lg:grid-cols-2"><div><label className="text-xs font-bold text-[#53675d]">تحديث أو ملاحظة داخل المهمة</label><Textarea value={comments[workspaceTask.id] || ""} onChange={event => setComments({ ...comments, [workspaceTask.id]: event.target.value })} placeholder="اكتب ما تم إنجازه أو ما يلزم متابعته…" className="mt-1 min-h-28 bg-white" /><Button size="sm" disabled={!comments[workspaceTask.id]?.trim() || comment.isPending} onClick={() => comment.mutate({ taskId: workspaceTask.id, comment: comments[workspaceTask.id]! })} className="mt-2 bg-[#12352f] hover:bg-[#1d5245]"><Send className="ml-1 h-4 w-4" />حفظ التحديث</Button></div><div><p className="text-xs font-bold text-[#53675d]">مرفقات المهمة</p><label className="mt-1 flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-[#b8d2bd] bg-white px-3 py-3 text-xs font-bold text-[#28623f]"><span className="flex min-w-0 items-center gap-2"><Paperclip className="h-4 w-4 shrink-0" />{taskAttachment ? taskAttachment.originalName : "PDF أو Word أو Excel أو صورة"}</span><input type="file" className="sr-only" accept="application/pdf,image/png,image/jpeg,.docx,.xlsx" onChange={event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 8 * 1024 * 1024) { toast.error("حجم المرفق يتجاوز 8 ميغابايت."); return; } const reader = new FileReader(); reader.onload = () => { const value = String(reader.result || ""); setTaskAttachment({ originalName: file.name, mimeType: file.type || "application/octet-stream", contentBase64: value.includes(",") ? value.split(",")[1] || "" : value }); }; reader.readAsDataURL(file); }} /></label><Button size="sm" disabled={!taskAttachment || uploadTaskAttachment.isPending} onClick={() => taskAttachment && uploadTaskAttachment.mutate({ taskId: workspaceTask.id, attachment: taskAttachment })} className="mt-2 bg-[#2f7653] hover:bg-[#245d41]">{uploadTaskAttachment.isPending ? "جارٍ رفع المرفق…" : "رفع المرفق"}</Button>{taskAttachments.isLoading ? <p className="mt-3 text-xs text-[#738179]">جارٍ تحميل المرفقات…</p> : taskAttachments.data?.length ? <div className="mt-3 space-y-2">{taskAttachments.data.map(attachment => <a key={attachment.id} href={attachment.storageUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs font-bold text-[#355d4b]"><span className="truncate">{attachment.originalName}</span><span className="mr-2 shrink-0 text-[#7a887f]">{Math.ceil(attachment.sizeBytes / 1024)} ك.ب</span></a>)}</div> : <p className="mt-3 text-xs text-[#738179]">لا توجد مرفقات لهذه المهمة بعد.</p>}{(taskAttachments.error || uploadTaskAttachment.error) && <p className="mt-3 text-xs text-[#a04a35]">{taskAttachments.error?.message || uploadTaskAttachment.error?.message}</p>}</div></div>}</section> : null}

    {workspaceTask && <section className="mt-4 rounded-[1.35rem] border border-[#d8e5da] bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold text-[#12352f]">إجراءات المهمة</p><p className="mt-1 text-xs leading-6 text-[#6d7d74]">أضف تعليقاً عادياً في السجل دون تصعيد، أو أتم المهمة للمراجعة، أو أحِلها للإدارة مع سبب موثق.</p></div><span className="rounded-full bg-[#eef4ef] px-3 py-1 text-xs font-bold text-[#355d4b]">{taskStatusLabel(workspaceTask.status as TaskStatus)}</span></div><div className="mt-3 flex flex-wrap gap-2">{workspaceTask.assigneeProfileId === currentProfile.data?.id && workspaceTask.status === "in_progress" && <Button type="button" size="sm" disabled={submitForReview.isPending} onClick={() => submitForReview.mutate({ taskId: workspaceTask.id })} className="bg-[#2f7653] hover:bg-[#245d41]"><CheckCircle2 className="ml-1 h-4 w-4" />{submitForReview.isPending ? "جارٍ الإرسال…" : "إتمام المهمة وإرسالها للمراجعة"}</Button>}{canAssign && <Button type="button" size="sm" variant="outline" onClick={() => { setRouteDialog({ taskId: workspaceTask.id, title: workspaceTask.title }); setRouteTargetProfileId(""); setRouteReason(""); }}><RefreshCcw className="ml-1 h-4 w-4" />إحالة للإدارة</Button>}</div><div className="mt-4 border-t border-[#e4ece5] pt-4"><label className="text-xs font-bold text-[#53675d]">تعليق عادي في سجل المهمة</label><Textarea value={comments[workspaceTask.id] || ""} onChange={event => setComments({ ...comments, [workspaceTask.id]: event.target.value })} placeholder="أضف ملاحظة أو استفساراً دون تغيير حالة المهمة…" className="mt-1 min-h-20 bg-[#fbfdfb]" /><Button type="button" size="sm" disabled={!comments[workspaceTask.id]?.trim() || comment.isPending} onClick={() => comment.mutate({ taskId: workspaceTask.id, comment: comments[workspaceTask.id]! })} className="mt-2 bg-[#12352f] hover:bg-[#1d5245]"><MessageCircle className="ml-1 h-4 w-4" />إضافة تعليق عادي</Button></div>{(submitForReview.error || routeTask.error || comment.error) && <p className="mt-3 text-xs text-[#a04a35]">{submitForReview.error?.message || routeTask.error?.message || comment.error?.message}</p>}</section>}
    {workspaceTask && <>{completionSuccessTaskId === workspaceTask.id && <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#b9d8bf] bg-[#eaf7eb] px-4 py-3 text-sm font-bold text-[#216345] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"><CheckCircle2 className="h-5 w-5" />تم إرسال الإتمام للمراجعة بنجاح.</div>}<TaskCommentTimelinePanel taskId={workspaceTask.id} candidates={workspaceTask.isConfidential ? mentionCandidates.filter(person => person.id === workspaceTask.assigneeProfileId || person.id === workspaceTask.watcherProfileId) : mentionCandidates} /></>}
    {selectedTaskId && <div className={`mt-6 rounded-2xl border p-4 ${selectedTask ? "border-[#b9d6bf] bg-[#f2f8f2]" : "border-[#efd3c4] bg-[#fff7f2]"}`}><div className="flex items-center gap-2 text-sm font-bold text-[#214c39]"><CheckCircle2 className="h-4 w-4" />{selectedTask ? `المهمة المحددة من الإشعار: ${selectedTask.title}` : "لا تتوفر المهمة المطلوبة ضمن نطاق صلاحيتك أو لم تعد موجودة."}</div>{selectedTask && <p className="mt-2 text-xs leading-6 text-[#65766d]">الجدولة: {formatTaskDate(selectedTask.scheduledFor)} · الاستحقاق: {formatTaskDate(selectedTask.dueAt)} · الحالة: {taskStatusLabel(selectedTask.status as TaskStatus)}</p>}</div>}

    {(actionTasks.length > 0 || (pendingExceptionRequests.data?.length ?? 0) > 0) && <section className="mt-6 grid gap-4 lg:grid-cols-2" aria-label="إجراءات المهام وقرارات المدير">
      {actionTasks.length > 0 && <article className="rounded-[1.4rem] border border-[#d7e6d8] bg-[#f7fbf7] p-4"><div className="flex items-center gap-2"><UserRoundCheck className="h-4 w-4 text-[#2f7653]" /><h2 className="text-sm font-bold text-[#12352f]">إجراءات تنتظر منك</h2></div><div className="mt-3 space-y-3">{actionTasks.slice(0, 3).map(task => { const reachedStart = new Date(task.scheduledFor).getTime() <= Date.now(); return <div key={task.id} className="rounded-xl border border-[#e2ebe3] bg-white p-3"><p className="text-sm font-bold text-[#29463b]">{task.title}</p><p className="mt-1 text-[11px] text-[#748078]">وقت البدء: {formatTaskDate(task.scheduledFor)} · الحالة: {taskStatusLabel(task.status as TaskStatus)}</p><div className="mt-3 flex flex-wrap gap-2">{task.status === "new" && <Button size="sm" disabled={acknowledge.isPending} onClick={() => acknowledge.mutate({ taskId: task.id })} className="bg-[#2f7653] hover:bg-[#245d41]"><UserRoundCheck className="ml-1 h-3.5 w-3.5" />{reachedStart ? "بدء التنفيذ" : "بدء التنفيذ مبكراً"}</Button>}{task.status === "new" && reachedStart && <Button size="sm" variant="outline" onClick={() => { setExceptionReason(""); setExceptionDialog({ taskId: task.id, kind: "reassignment", title: task.title }); }}><RefreshCcw className="ml-1 h-3.5 w-3.5" />طلب إعادة إسناد</Button>}<Button size="sm" variant="outline" onClick={() => { setExceptionReason(""); setExceptionDialog({ taskId: task.id, kind: "obstacle", title: task.title }); }} className="border-[#efd1c4] text-[#a04a35]"><ShieldAlert className="ml-1 h-3.5 w-3.5" />يوجد عائق</Button>{task.status === "new" && !reachedStart && <span className="rounded-md bg-[#e7f3e9] px-2.5 py-2 text-[11px] font-bold text-[#2f7653]">يكافأ البدء المبكر في سجل الإنجاز</span>}</div></div>; })}</div></article>}
      {(pendingExceptionRequests.data?.length ?? 0) > 0 && <article className="rounded-[1.4rem] border border-[#ebd9a8] bg-[#fffdf6] p-4"><div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-[#96732b]" /><h2 className="text-sm font-bold text-[#12352f]">قرارات بانتظارك كمدير مباشر</h2></div><div className="mt-3 space-y-2">{pendingExceptionRequests.data?.slice(0, 3).map(row => <button type="button" key={row.request.id} onClick={() => { setDecisionRequestId(row.request.id); setDecisionNote(""); setDecisionAssigneeId(""); }} className="w-full rounded-xl border border-[#eee2bf] bg-white p-3 text-right hover:bg-[#fff9e8]"><p className="text-xs font-bold text-[#314d40]">{row.request.kind === "reassignment" ? "طلب إعادة إسناد" : "بلاغ عائق"} · {row.task.title}</p><p className="mt-1 text-[11px] leading-5 text-[#717d75]">من: {row.requesterName} · {row.request.reason}</p></button>)}</div></article>}
    </section>}

    <div className={`mt-7 grid gap-5 ${canAssign ? "xl:grid-cols-[21rem_minmax(0,1fr)]" : ""}`}>
      {permission.data !== "trainee" && <form onSubmit={submitSelf} className="rounded-[1.5rem] border border-[#d9e7dc] bg-[#f7fbf7] p-5 shadow-[0_10px_30px_rgba(30,51,42,0.04)]"><div className="flex items-center gap-2 text-[#12352f]"><FilePlus2 className="h-5 w-5 text-[#2f7653]" /><h2 className="font-bold">إنشاء مهمة لنفسي</h2></div><p className="mt-2 text-xs leading-6 text-[#60736a]">تحفظ المهمة باسمك وتظهر للمدير المباشر لمراجعتها أو رفعها للمسار الإداري التالي.</p><div className="mt-4 space-y-3"><Input required value={selfForm.title} onChange={event => setSelfForm({ ...selfForm, title: event.target.value })} placeholder="عنوان المهمة الذاتية" /><Textarea value={selfForm.taskNotes} onChange={event => setSelfForm({ ...selfForm, taskNotes: event.target.value })} placeholder="تفاصيل المهمة وشرحها (اختياري)…" className="mt-1 min-h-24" /><select value={selfForm.priority} onChange={event => setSelfForm({ ...selfForm, priority: event.target.value as typeof selfForm.priority })} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="normal">عادية</option><option value="high">عالية</option><option value="critical">حرجة</option></select><label className="block text-xs font-bold text-[#6a786f]">نوع المهمة<select value={selfForm.taskType} onChange={event => setSelfForm({ ...selfForm, taskType: event.target.value as typeof selfForm.taskType })} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="permanent">عادية</option><option value="urgent">عاجلة</option></select></label><label className="block text-xs font-bold text-[#6a786f]">موعد الجدولة<span className="mt-1 block font-normal text-[#8a6731]">متى تبدأ المهمة وتظهر لك كجاهزة للتنفيذ.</span><Input required value={selfForm.scheduledFor} onChange={event => setSelfForm({ ...selfForm, scheduledFor: event.target.value })} className="mt-1" type="datetime-local" /></label><label className="block text-xs font-bold text-[#6a786f]">موعد الاستحقاق<span className="mt-1 block font-normal text-[#8a6731]">آخر وقت لإنهائها وإرسالها للمدير للتأكيد.</span><Input required value={selfForm.dueAt} onChange={event => setSelfForm({ ...selfForm, dueAt: event.target.value })} className="mt-1" type="datetime-local" /></label></div><Button disabled={createSelf.isPending} className="mt-4 w-full bg-[#2f7653] hover:bg-[#245d41]">{createSelf.isPending ? "جارٍ الحفظ…" : "حفظ وإرسال للمدير المباشر"}</Button>{createSelf.error && <p className="mt-3 flex gap-2 text-xs leading-6 text-[#a04a35]"><AlertCircle className="h-4 w-4 shrink-0" />{createSelf.error.message}</p>}</form>}
      {canAssign && <form onSubmit={submit} className="rounded-[1.5rem] border border-[#e7e0d4] bg-white p-5 shadow-[0_10px_30px_rgba(30,51,42,0.05)]"><div className="flex items-center gap-2 text-[#12352f]"><FilePlus2 className="h-5 w-5 text-[#b18448]" /><h2 className="font-bold">إسناد مهمة</h2></div><div className="mt-5 space-y-3"><Input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="عنوان المهمة" required /><Textarea value={form.taskNotes} onChange={event => setForm({ ...form, taskNotes: event.target.value })} placeholder="تفاصيل المهمة وشرحها (اختياري)…" className="mt-1 min-h-24" /><div className="space-y-2">
              <label className="block text-xs font-bold text-[#6a786f]">اختر الموظف أو القاضي أو الملازم القضائي المكلف</label>
              <select value={assigneeUnitId} onChange={event => { setAssigneeUnitId(event.target.value); setForm({ ...form, assigneeProfileId: "" }); }} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm" required>
                <option value="">اختر الإدارة أو القسم أولاً</option>
                {units.data?.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
              <select value={form.assigneeProfileId} onChange={event => setForm({ ...form, assigneeProfileId: event.target.value })} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm disabled:opacity-60" required disabled={!assigneeUnitId}>
                <option value="">{assigneeUnitId ? "اختر الموظف المكلف من القائمة" : "يجب اختيار القسم أولاً"}</option>
                {assigneeCandidates.map(person => <option value={person.id} key={person.id}>{person.fullName} · {person.personType === "trainee" ? "ملازم" : person.personType === "judge" ? "قاضٍ" : "موظف"}</option>)}
              </select>
            </div>      <div className="space-y-2"><label className="block text-xs font-bold text-[#6a786f]">ملازم كنسخة تنبيه <span className="font-normal">(اختياري)</span></label><p className="text-[10px] leading-5 text-[#8a6731]">اختر القسم أولاً، ثم يظهر الملازمون التابعون له فقط.</p><select value={traineeCopyUnitId} onChange={event => { setTraineeCopyUnitId(event.target.value); setTraineeCopyValue("none"); }} disabled={!trainees.length} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="">اختر الإدارة أو القسم للنسخة</option>{units.data?.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select><Select value={traineeCopyValue} onValueChange={setTraineeCopyValue} disabled={!traineeCopyUnitId || !traineeCopyCandidates.length}><SelectTrigger className="mt-1 w-full"><SelectValue placeholder={traineeCopyUnitId ? "اختر الملازم من القسم المحدد" : "اختر القسم أولاً"} /></SelectTrigger><SelectContent><SelectItem value="none">لا توجد نسخة تنبيه</SelectItem>{traineeCopyCandidates.map(person => <SelectItem key={person.id} value={String(person.id)}>{person.fullName}</SelectItem>)}</SelectContent></Select>{!trainees.length && <span className="mt-1 block font-normal text-[#8a6731]">لا توجد ملفات ملازمين نشطة متاحة للنسخة حالياً.</span>}</div><label className="block text-xs font-bold text-[#6a786f]">نوع المهمة<select value={form.taskType} onChange={event => setForm({ ...form, taskType: event.target.value as typeof form.taskType })} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="permanent">عادية</option><option value="urgent">عاجلة</option></select></label><label className="block text-xs font-bold text-[#6a786f]">المرفقات (اختياري)<input type="file" className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm" accept="application/pdf,image/png,image/jpeg,.docx,.xlsx" onChange={event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 8 * 1024 * 1024) { toast.error("حجم المرفق يتجاوز 8 ميغابايت."); return; } const reader = new FileReader(); reader.onload = () => { const value = String(reader.result || ""); setForm(current => ({ ...current, attachments: [...current.attachments, { originalName: file.name, mimeType: file.type || "application/octet-stream", contentBase64: value.includes(",") ? value.split(",")[1] || "" : value }].slice(0, 5) })); }; reader.readAsDataURL(file); }} /></label><select value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value as typeof form.priority })} className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="normal">عادية</option><option value="high">عالية</option><option value="critical">حرجة</option></select><label className="block text-xs font-bold text-[#6a786f]">موعد الجدولة<span className="mt-1 block font-normal text-[#8a6731]">متى تصبح المهمة جاهزة للبدء وتظهر للمكلف.</span><Input value={form.scheduledFor} onChange={event => setForm({ ...form, scheduledFor: event.target.value })} className="mt-1" type="datetime-local" required /></label><label className="block text-xs font-bold text-[#6a786f]">موعد الاستحقاق<span className="mt-1 block font-normal text-[#8a6731]">آخر موعد لإنهاء المهمة وإرسالها للمدير للتأكيد.</span><Input value={form.dueAt} onChange={event => setForm({ ...form, dueAt: event.target.value })} className="mt-1" type="datetime-local" required /></label><div className="space-y-2">
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
            </div><label className="block text-xs font-bold text-[#6a786f]">التكرار<select value={form.recurrence} onChange={event => setForm({ ...form, recurrence: event.target.value as typeof form.recurrence })} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="none">غير متكررة</option><option value="daily">يومياً</option><option value="weekly">أسبوعياً</option><option value="monthly">شهرياً</option><option value="custom">مخصص</option></select></label>{form.recurrence !== "none" && <label className="block text-xs font-bold text-[#6a786f]">نهاية التكرار<Input value={form.recurrenceEndAt} onChange={event => setForm({ ...form, recurrenceEndAt: event.target.value })} className="mt-1" type="datetime-local" /></label>}<label className="flex items-center gap-2 text-xs font-bold text-[#6a786f]"><input type="checkbox" checked={form.isConfidential} onChange={event => setForm({ ...form, isConfidential: event.target.checked })} />مهمة سرية</label>{form.isConfidential && <label className="block text-xs font-bold text-[#6a786f]">انتهاء السرية (اختياري)<Input value={form.confidentialityExpiresAt} onChange={event => setForm({ ...form, confidentialityExpiresAt: event.target.value })} className="mt-1" type="datetime-local" /></label>}</div><Button disabled={create.isPending || people.isLoading} className="mt-5 w-full bg-[#12352f] hover:bg-[#1d5245]">{create.isPending ? "جارٍ الإسناد…" : "إسناد المهمة"}</Button>{create.error && <p className="mt-3 flex gap-2 text-xs leading-6 text-[#a04a35]"><AlertCircle className="h-4 w-4 shrink-0" />{create.error.message}</p>}</form>}
      <div className="rounded-[1.5rem] border border-[#e7e0d4] bg-white p-5 shadow-[0_10px_30px_rgba(30,51,42,0.05)]"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-[#12352f]">{canAssign ? "المهام المسجلة" : "مهامي المسندة"}</h2><p className="mt-1 text-xs text-[#75837c]">تُعرض مهامك أولاً، ويمكن للمخول التبديل إلى نطاق الإدارة عند الحاجة.</p></div><div className="flex gap-2" role="group" aria-label="نطاق عرض المهام"><Button type="button" size="sm" variant={taskView === "mine" ? "default" : "outline"} onClick={() => setTaskView("mine")} className={taskView === "mine" ? "bg-[#12352f]" : ""}>مهامي</Button>{canAssign && <Button type="button" size="sm" variant={taskView === "scope" ? "default" : "outline"} onClick={() => setTaskView("scope")} className={taskView === "scope" ? "bg-[#8a6731]" : ""}>{platformWide ? "كل المنصة" : "نطاق الإدارة"}</Button>}</div></div>{tasks.isLoading ? <div className="mt-5 flex items-center gap-2 text-sm text-[#6e7e75]"><CircleDashed className="h-4 w-4 animate-spin" /> جارٍ تحميل المهام…</div> : visibleTasks.length ? <div className="mt-5 divide-y divide-[#eee8de]">{requestedTaskFilter !== "all" && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#b8d1bc] bg-[#eef6ef] px-3 py-2"><p className="text-xs font-bold text-[#2d6b4f]">الفلتر الحالي: {({ active: "قيد التنفيذ", overdue: "متأخرة", due_soon: "قرب موعدها", completed: "تمت المعالجة" } as Record<string, string>)[requestedTaskFilter] ?? requestedTaskFilter}</p><button type="button" onClick={() => setLocation("/tasks")} className="rounded-lg border border-[#b8d1bc] bg-white px-2.5 py-1 text-xs font-bold text-[#2d6b4f] transition hover:bg-[#dcebdd]">عرض الكل</button></div>}{visibleTasks.map(task => { const assignee = activePeople.find(person => person.id === task.assigneeProfileId); const taskConversation = conversations.data?.find(row => row.conversation.taskId === task.id); const focused = task.id === selectedTaskId; const visualState = taskVisualState({ status: task.status as TaskStatus, dueAt: task.dueAt, scheduledFor: task.scheduledFor }); const stateText = visualState === "overdue" ? "بدأ التأخير" : visualState === "due_soon" ? "قريب الاستحقاق" : visualState === "starting" ? "مهمة جديدة تبدأ الآن" : visualState === "completed" ? "منجز" : "ضمن المسار"; const isOwnTask = task.assigneeProfileId === currentProfile.data?.id; const onActivate = isOwnTask && task.status === "new" ? () => acknowledge.mutate({ taskId: task.id }) : isOwnTask && task.status === "in_progress" ? () => submitForReview.mutate({ taskId: task.id }) : undefined; return <article key={task.id} className={`rounded-2xl border bg-white p-4 shadow-[0_4px_14px_rgba(30,51,42,0.05)] transition hover:shadow-[0_8px_24px_rgba(30,51,42,0.09)] ${focused ? "border-[#2f7653] ring-1 ring-[#2f7653]/20" : "border-[#e7e0d4]"} ${taskVisualClasses(visualState)}`}><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-[#26473a]">{task.title}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${taskTypeBadgeClasses(task.taskType)}`}>{taskTypeLabel(task.taskType)}</span>{task.hasObstacle && <span className="rounded-full bg-[#fbe0db] px-2 py-0.5 text-[11px] font-bold text-[#9d4034]">عائق مسجّل</span>}</div><p className="mt-1 text-xs text-[#75837c]">المكلف: {assignee?.fullName || "غير محدد"} · الاستحقاق: {formatTaskDate(task.dueAt)}</p></div><div className="flex items-center gap-1.5"><TaskStateBadge state={visualState} statusLabel={taskStatusLabel(task.status as TaskStatus)} stateText={stateText} onActivate={onActivate} />{isOwnTask && <button type="button" onClick={() => setPinned.mutate({ taskId: task.id, isPinned: !task.isPinned })} aria-label={task.isPinned ? "فك تثبيت المهمة" : "تثبيت المهمة"} title={task.isPinned ? "فك التثبيت" : "تثبيت في أعلى القائمة"} className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition ${task.isPinned ? "bg-[#f3e5bf] text-[#9a7214] ring-1 ring-[#e0b13f]" : "text-[#8a978e] hover:bg-[#eef2ec]"}`}>{task.isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}</button>}</div></div>{(task.taskNotes || isOwnTask) && <div className="mt-3 rounded-lg border border-[#e7e0d4] bg-[#fbfaf6] px-2.5 py-2">{task.taskNotes && <p className="text-xs leading-5 text-[#4c5f54]">{task.taskNotes}</p>}{isOwnTask && <input value={notesDraft[task.id] ?? task.taskNotes ?? ""} onChange={event => setNotesDraft(current => ({ ...current, [task.id]: event.target.value }))} onBlur={event => { const value = event.target.value.trim(); if (value !== (task.taskNotes ?? "")) setNotes.mutate({ taskId: task.id, notes: value }); }} placeholder="أضف مفكرة سريعة لهذه المهمة…" className="mt-1 h-8 w-full rounded-md border border-input bg-white px-2 text-xs" />}</div>}<div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"><Button type="button" size="sm" disabled={markAsProcessed.isPending || task.status === "completed" || task.status === "cancelled" || !(isOwnTask || canAssign)} onClick={() => markAsProcessed.mutate({ taskId: task.id })} className="bg-[#2f7653] text-white hover:bg-[#245d41]"><CheckCircle2 className="ml-1 h-4 w-4" />{markAsProcessed.isPending ? "جارٍ…" : "تمت المعالجة"}</Button><Button type="button" size="sm" variant="outline" onClick={() => { setCommentDialog({ taskId: task.id, title: task.title }); setCommentText(""); }}><MessageCircle className="ml-1 h-4 w-4" />إضافة تعليق</Button><Button type="button" size="sm" variant="outline" disabled={task.status === "completed" || task.status === "cancelled" || !isOwnTask} onClick={() => { setReassignmentDialog({ taskId: task.id, title: task.title }); setReassignmentReason(""); }}><RefreshCcw className="ml-1 h-4 w-4" />طلب سحب/إعادة إسناد</Button><Button type="button" size="sm" variant="outline" disabled={task.status === "completed" || task.status === "cancelled" || !(isOwnTask || canAssign)} onClick={() => { setObstacleDialog({ taskId: task.id, title: task.title }); setObstacleDetail(""); }} className="border-[#e8b98c] text-[#a8601f] hover:bg-[#fff6ec]"><AlertTriangle className="ml-1 h-4 w-4" />يوجد عائق</Button><Button type="button" size="sm" variant="outline" onClick={() => setDetailsTaskId(task.id)}><FileText className="ml-1 h-4 w-4" />تفاصيل</Button></div></article>; })}</div> : <p className="mt-5 rounded-2xl border border-dashed border-[#d8d1c5] bg-[#fbfaf6] px-5 py-10 text-center text-sm leading-7 text-[#738179]">{requestedTaskFilter !== "all" ? "لا توجد مهام مطابقة للفلتر الحالي." : "لا توجد مهام ظاهرة ضمن نطاقك حالياً."}</p>}{(tasks.error || acknowledge.error || comment.error || updateStatus.error) && <p className="mt-4 flex gap-2 text-xs leading-6 text-[#a04a35]"><AlertCircle className="h-4 w-4 shrink-0" />{tasks.error?.message || acknowledge.error?.message || comment.error?.message || updateStatus.error?.message}</p>}</div>
    </div>
    <Dialog open={Boolean(completionConfirmDialog)} onOpenChange={open => { if (!open) setCompletionConfirmDialog(null); }}><DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle>تأكيد إتمام المهمة</DialogTitle><DialogDescription>سيتم إرسال المهمة إلى المدير المباشر للمراجعة والاعتماد. لن تعد متاحة للتنفيذ حتى يُتخذ قرار المراجعة.</DialogDescription></DialogHeader><p className="rounded-lg bg-[#f7f5ef] px-3 py-2 text-sm font-bold text-[#355d4b]">{completionConfirmDialog?.title}</p><Textarea value={completionNote} onChange={event => setCompletionNote(event.target.value)} placeholder="رد/تفاصيل المعالجة والإنجاز (اختياري)…" className="mt-3 min-h-24" /><DialogFooter><Button type="button" variant="outline" onClick={() => setCompletionConfirmDialog(null)}>رجوع</Button><Button disabled={submitForReviewRequest.isPending} onClick={() => completionConfirmDialog && submitForReviewRequest.mutate({ taskId: completionConfirmDialog.taskId, note: completionNote.trim() || undefined })} className="bg-[#2f7653] hover:bg-[#245d41]"><CheckCircle2 className="ml-1 h-4 w-4" />{submitForReviewRequest.isPending ? "جارٍ الإرسال…" : "تأكيد الإتمام"}</Button></DialogFooter>{submitForReviewRequest.error && <p className="text-xs text-[#a04a35]">{submitForReviewRequest.error.message}</p>}</DialogContent></Dialog>
    <Dialog open={Boolean(routeDialog)} onOpenChange={open => { if (!open) { setRouteDialog(null); setRouteTargetProfileId(""); setRouteReason(""); } }}><DialogContent dir="rtl" className="max-w-lg"><DialogHeader><DialogTitle>إحالة المهمة للإدارة</DialogTitle><DialogDescription>اختر المستلم الإداري واكتب سبب الإحالة. يسجل السبب في سجل تدقيق المهمة ولا يغير حالتها تلقائياً.</DialogDescription></DialogHeader><form onSubmit={event => { event.preventDefault(); if (routeDialog && routeTargetProfileId && routeReason.trim().length >= 3) routeTask.mutate({ taskId: routeDialog.taskId, targetProfileId: Number(routeTargetProfileId), note: routeReason.trim() }); }} className="space-y-3"><p className="rounded-lg bg-[#f7f5ef] px-3 py-2 text-xs font-bold text-[#355d4b]">المهمة: {routeDialog?.title}</p><select aria-label="المستلم الإداري" value={routeTargetProfileId} onChange={event => setRouteTargetProfileId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm" required><option value="">اختر الإدارة أو المسؤول المستلم</option>{routeTargets.data?.map(target => <option key={`${target.profileId}-${target.role}`} value={target.profileId}>{target.fullName} · {target.role === "department_manager" ? "مدير قسم" : target.role === "court_president" ? "الرئيس" : target.role === "assistant_president" ? "الرئيس المساعد" : "الأمين"}</option>)}</select><Textarea value={routeReason} onChange={event => setRouteReason(event.target.value)} placeholder="سبب الإحالة إلى الإدارة" className="min-h-24" required /><DialogFooter><Button type="button" variant="outline" onClick={() => setRouteDialog(null)}>إلغاء</Button><Button disabled={routeTask.isPending || !routeTargetProfileId || routeReason.trim().length < 3} className="bg-[#2f7653] hover:bg-[#245d41]">{routeTask.isPending ? "جارٍ الإحالة…" : "إحالة مع توثيق السبب"}</Button></DialogFooter>{routeTask.error && <p className="text-xs text-[#a04a35]">{routeTask.error.message}</p>}</form></DialogContent></Dialog>
    <Dialog open={Boolean(exceptionDialog)} onOpenChange={open => { if (!open) { setExceptionDialog(null); setExceptionReason(""); } }}><DialogContent dir="rtl" className="max-w-lg"><DialogHeader><DialogTitle>{exceptionDialog?.kind === "reassignment" ? "طلب إعادة إسناد المهمة" : "بلاغ وجود عائق"}</DialogTitle><DialogDescription>{exceptionDialog?.kind === "reassignment" ? "اكتب سبب عدم البدء. يُسجل خصم تلقائي وفق سياسة المهمة، ويذهب الطلب إلى المدير المباشر لاتخاذ قرار إعادة التوزيع." : "اكتب وصف العائق بوضوح. يصل البلاغ مباشرة إلى المدير المباشر مع سجل المهمة."}</DialogDescription></DialogHeader><form onSubmit={event => { event.preventDefault(); if (exceptionDialog && exceptionReason.trim().length >= 3) requestException.mutate({ taskId: exceptionDialog.taskId, kind: exceptionDialog.kind, reason: exceptionReason.trim() }); }} className="space-y-3"><p className="rounded-lg bg-[#f7f5ef] px-3 py-2 text-xs font-bold text-[#355d4b]">المهمة: {exceptionDialog?.title}</p><Textarea value={exceptionReason} onChange={event => setExceptionReason(event.target.value)} placeholder={exceptionDialog?.kind === "reassignment" ? "سبب طلب إعادة الإسناد" : "وصف العائق والإجراء المطلوب"} className="min-h-28" required /><DialogFooter><Button type="button" variant="outline" onClick={() => setExceptionDialog(null)}>إلغاء</Button><Button disabled={requestException.isPending || exceptionReason.trim().length < 3} className="bg-[#2f7653] hover:bg-[#245d41]">{requestException.isPending ? "جارٍ الإحالة…" : "إرسال للمدير المباشر"}</Button></DialogFooter>{requestException.error && <p className="text-xs text-[#a04a35]">{requestException.error.message}</p>}</form></DialogContent></Dialog>
    <Dialog open={Boolean(selectedDecisionRequest)} onOpenChange={open => { if (!open) setDecisionRequestId(null); }}><DialogContent dir="rtl" className="max-w-xl"><DialogHeader><DialogTitle>{selectedDecisionRequest?.request.kind === "reassignment" ? "قرار طلب إعادة الإسناد" : "قرار بلاغ العائق"}</DialogTitle><DialogDescription>يُسجل القرار والتعليق باسم المدير. خصم عدم البدء يُحتسب تلقائياً عند تقديم طلب إعادة الإسناد، وتُمنح مكافأة الإنجاز للمكلف الذي ينهي المهمة بعد اعتمادها.</DialogDescription></DialogHeader>{selectedDecisionRequest && <div className="space-y-3"><div className="rounded-xl bg-[#f7f5ef] p-3 text-sm leading-7 text-[#365247]"><p><strong>المهمة:</strong> {selectedDecisionRequest.task.title}</p><p><strong>مقدم الطلب:</strong> {selectedDecisionRequest.requesterName}</p><p><strong>السبب:</strong> {selectedDecisionRequest.request.reason}</p>{selectedDecisionRequest.request.deductionPoints < 0 && <p><strong>الخصم التلقائي:</strong> {selectedDecisionRequest.request.deductionPoints} نقطة</p>}</div>{selectedDecisionRequest.request.kind === "reassignment" && <label className="block text-xs font-bold text-[#546b5f]">إعادة الإسناد إلى<select value={decisionAssigneeId} onChange={event => setDecisionAssigneeId(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="">اختر موظفاً من القسم</option>{decisionCandidates.map(person => <option key={person.id} value={person.id}>{person.fullName} · {person.jobTitle || "موظف"}</option>)}</select></label>}<Textarea value={decisionNote} onChange={event => setDecisionNote(event.target.value)} placeholder="تعليق القرار الإداري" className="min-h-24" required /><DialogFooter><Button type="button" variant="outline" disabled={decideException.isPending || decisionNote.trim().length < 3} onClick={() => decideException.mutate({ requestId: selectedDecisionRequest.request.id, decision: "rejected", managerNote: decisionNote.trim() })}>رفض مع توثيق القرار</Button><Button disabled={decideException.isPending || decisionNote.trim().length < 3 || (selectedDecisionRequest.request.kind === "reassignment" && !decisionAssigneeId)} onClick={() => decideException.mutate({ requestId: selectedDecisionRequest.request.id, decision: "approved", managerNote: decisionNote.trim(), reassigneeProfileId: decisionAssigneeId ? Number(decisionAssigneeId) : undefined })} className="bg-[#2f7653] hover:bg-[#245d41]">{decideException.isPending ? "جارٍ حفظ القرار…" : "اعتماد القرار"}</Button></DialogFooter>{decideException.error && <p className="text-xs text-[#a04a35]">{decideException.error.message}</p>}</div>}</DialogContent></Dialog>
    <Dialog open={Boolean(commentDialog)} onOpenChange={open => { if (!open) setCommentDialog(null); }}><DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle>إضافة تعليق</DialogTitle><DialogDescription>يُحفظ التعليق في جدول تعليقات المهمة ويرتبط بحسابك.</DialogDescription></DialogHeader><p className="rounded-lg bg-[#f7f5ef] px-3 py-2 text-sm font-bold text-[#355d4b]">{commentDialog?.title}</p><Textarea value={commentText} onChange={event => setCommentText(event.target.value)} placeholder="اكتب تعليقك هنا…" className="min-h-28" /><DialogFooter><Button type="button" variant="outline" onClick={() => setCommentDialog(null)}>إلغاء</Button><Button disabled={addTaskCommentMutation.isPending || commentText.trim().length < 2} onClick={() => commentDialog && addTaskCommentMutation.mutate({ taskId: commentDialog.taskId, comment: commentText.trim() })} className="bg-[#12352f] hover:bg-[#1d5245]">{addTaskCommentMutation.isPending ? "جارٍ الحفظ…" : "حفظ التعليق"}</Button></DialogFooter>{addTaskCommentMutation.error && <p className="text-xs text-[#a04a35]">{addTaskCommentMutation.error.message}</p>}</DialogContent></Dialog>
    <Dialog open={Boolean(reassignmentDialog)} onOpenChange={open => { if (!open) setReassignmentDialog(null); }}><DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle>طلب سحب/إعادة إسناد</DialogTitle><DialogDescription>اكتب سبب طلب إعادة الإسناد، وسيُوجّه الطلب إلى المدير المباشر لاتخاذ القرار.</DialogDescription></DialogHeader><p className="rounded-lg bg-[#f7f5ef] px-3 py-2 text-sm font-bold text-[#355d4b]">{reassignmentDialog?.title}</p><Textarea value={reassignmentReason} onChange={event => setReassignmentReason(event.target.value)} placeholder="سبب طلب السحب أو إعادة الإسناد" className="min-h-28" /><DialogFooter><Button type="button" variant="outline" onClick={() => setReassignmentDialog(null)}>إلغاء</Button><Button disabled={requestReassignmentMutation.isPending || reassignmentReason.trim().length < 3} onClick={() => reassignmentDialog && requestReassignmentMutation.mutate({ taskId: reassignmentDialog.taskId, reason: reassignmentReason.trim() })} className="bg-[#2f7653] hover:bg-[#245d41]">{requestReassignmentMutation.isPending ? "جارٍ الإرسال…" : "إرسال الطلب"}</Button></DialogFooter>{requestReassignmentMutation.error && <p className="text-xs text-[#a04a35]">{requestReassignmentMutation.error.message}</p>}</DialogContent></Dialog>
    <Dialog open={Boolean(obstacleDialog)} onOpenChange={open => { if (!open) setObstacleDialog(null); }}><DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle>تسجيل عائق</DialogTitle><DialogDescription>سيُسجَّل العائق على المهمة ويُرسل إشعار فوري للرئيس والأمين.</DialogDescription></DialogHeader><p className="rounded-lg bg-[#f7f5ef] px-3 py-2 text-sm font-bold text-[#355d4b]">{obstacleDialog?.title}</p><Textarea value={obstacleDetail} onChange={event => setObstacleDetail(event.target.value)} placeholder="وصف العائق والإجراء المطلوب" className="min-h-28" /><DialogFooter><Button type="button" variant="outline" onClick={() => setObstacleDialog(null)}>إلغاء</Button><Button disabled={reportObstacleMutation.isPending || obstacleDetail.trim().length < 3} onClick={() => obstacleDialog && reportObstacleMutation.mutate({ taskId: obstacleDialog.taskId, detail: obstacleDetail.trim() })} className="bg-[#c26a2b] hover:bg-[#a8571f]">{reportObstacleMutation.isPending ? "جارٍ التسجيل…" : "تسجيل العائق وتنبيه القيادة"}</Button></DialogFooter>{reportObstacleMutation.error && <p className="text-xs text-[#a04a35]">{reportObstacleMutation.error.message}</p>}</DialogContent></Dialog>
    <Dialog open={Boolean(detailsTaskId)} onOpenChange={open => { if (!open) setDetailsTaskId(null); }}><DialogContent dir="rtl" className="max-w-2xl"><DialogHeader><DialogTitle>تفاصيل المهمة</DialogTitle><DialogDescription>كامل تفاصيل المهمة والتعليقات والسجل الزمني.</DialogDescription></DialogHeader>{taskDetails.isLoading ? <div className="flex items-center gap-2 py-6 text-sm text-[#6e7e75]"><CircleDashed className="h-4 w-4 animate-spin" />جارٍ تحميل التفاصيل…</div> : taskDetails.data ? <div className="space-y-4"><div className="rounded-xl bg-[#f7f5ef] p-4 text-sm leading-7 text-[#365247]"><p><strong>المهمة:</strong> {taskDetails.data.task.title}</p>{taskDetails.data.task.taskNotes && <p><strong>التفاصيل:</strong> {taskDetails.data.task.taskNotes}</p>}<p><strong>الحالة:</strong> {taskStatusLabel(taskDetails.data.task.status as TaskStatus)}</p><p><strong>الأولوية:</strong> {taskDetails.data.task.priority}</p><p><strong>نوع المهمة:</strong> {taskTypeLabel(taskDetails.data.task.taskType)}</p><p><strong>الاستحقاق:</strong> {formatTaskDate(taskDetails.data.task.dueAt)}</p>{taskDetails.data.task.completionNote && <p><strong>ملاحظة الإتمام:</strong> {taskDetails.data.task.completionNote}</p>}{taskDetails.data.task.obstacleDetail && <p className="text-[#9d4034]"><strong>تفاصيل العائق:</strong> {taskDetails.data.task.obstacleDetail}</p>}</div>{taskDetails.data.task.status !== "completed" && taskDetails.data.task.status !== "cancelled" && (taskDetails.data.task.assigneeProfileId === currentProfile.data?.id || canAssign) && <div className="flex flex-wrap gap-2">{taskDetails.data.task.assigneeProfileId === currentProfile.data?.id && taskDetails.data.task.status === "new" && <Button type="button" size="sm" disabled={acknowledge.isPending} onClick={() => acknowledge.mutate({ taskId: taskDetails.data!.task.id })} className="bg-[#12352f] hover:bg-[#1d5245]"><Play className="ml-1 h-4 w-4" />بدء العمل</Button>}{taskDetails.data.task.status === "in_progress" && <Button type="button" size="sm" disabled={submitForReview.isPending} onClick={() => submitForReview.mutate({ taskId: taskDetails.data!.task.id })} className="bg-[#2f7653] hover:bg-[#245d41]"><CheckCircle2 className="ml-1 h-4 w-4" />تمت المعالجة</Button>}</div>}{taskDetails.data.attachments.length > 0 && <div className="space-y-2"><p className="text-xs font-bold text-[#53675d]">المرفقات</p>{taskDetails.data.attachments.map(attachment => <a key={attachment.id} href={attachment.storageUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl bg-white p-2 text-xs font-bold text-[#28623f] underline"><Paperclip className="h-3.5 w-3.5" />{attachment.originalName}</a>)}</div>}<div className="rounded-xl border border-[#d8e5da] bg-white p-3"><p className="text-xs font-bold text-[#53675d]">إضافة تعليق</p><Textarea value={detailsComment} onChange={event => setDetailsComment(event.target.value)} placeholder="اكتب تعليقاً على هذه المهمة…" className="mt-1 min-h-20 bg-[#fbfdfb]" /><Button type="button" size="sm" disabled={!detailsComment.trim() || addTaskCommentMutation.isPending} onClick={() => taskDetails.data && addTaskCommentMutation.mutate({ taskId: taskDetails.data.task.id, comment: detailsComment.trim() })} className="mt-2 bg-[#12352f] hover:bg-[#1d5245]"><Send className="ml-1 h-4 w-4" />{addTaskCommentMutation.isPending ? "جارٍ الحفظ…" : "إضافة تعليق"}</Button>{addTaskCommentMutation.error && <p className="mt-2 text-xs text-[#a04a35]">{addTaskCommentMutation.error.message}</p>}</div>{taskDetails.data.comments.length > 0 && <div className="space-y-2"><p className="text-xs font-bold text-[#53675d]">التعليقات</p>{taskDetails.data.comments.map(item => <article key={item.id} className="rounded-xl bg-white p-3"><p className="text-xs font-bold text-[#335349]">{item.authorName ?? "مستخدم المنصة"}</p><p className="mt-1 text-sm leading-6 text-[#50665a]">{item.comment}</p></article>)}</div>}{taskDetails.data.timeline.length > 0 && <div className="space-y-2"><p className="text-xs font-bold text-[#53675d]">السجل الزمني</p>{taskDetails.data.timeline.map(update => <article key={update.id} className="rounded-xl bg-white p-3"><p className="text-xs font-bold text-[#335349]">{update.actorName} · {update.updateType}</p>{update.note && <p className="mt-1 text-sm leading-6 text-[#50665a]">{update.note}</p>}</article>)}</div>}</div> : <p className="py-6 text-center text-sm text-[#748279]">لا تتوفر تفاصيل لهذه المهمة ضمن نطاقك.</p>}</DialogContent></Dialog>
  </section>;
}
