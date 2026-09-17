import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { autoAssignWorkflowSteps, canDistributeWorkflowPlan, workflowAssignmentSummary, workflowMatchReasonLabel, workflowMethodLabel, workflowPriorityLabel, workflowStaffLabel, type WorkflowDistributionMode, type WorkflowPlanStep, type WorkflowPriority, type WorkflowStaffOption } from "@/lib/workflow-map";
import { CheckCircle2, CirclePlus, FileSpreadsheet, GitBranch, Layers, Loader2, Sparkles, UploadCloud } from "lucide-react";
import React, { useMemo, useState } from "react";
import { toast } from "sonner";

type WorkflowDiagramNode = { order: number; title: string; x: number; y: number; width: number; height: number; centerX: number; centerY: number };
type WorkflowAnalysis = {
  map: { title: string; summary: string; steps: WorkflowPlanStep[] };
  diagram: { width: number; height: number; nodeWidth: number; nodeHeight: number; lanes: number; nodes: WorkflowDiagramNode[]; edges: Array<{ from: number; to: number; x1: number; y1: number; x2: number; y2: number }> };
  extractedText: string;
  method: string;
  model: string | null;
  documentName: string;
};
type CreatedTask = { order: number; taskId: number; assigneeProfileId: number; title: string };

async function fileAsBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = "";
  for (let index = 0; index < bytes.length; index += 0x8000) text += String.fromCharCode.apply(null, Array.from(bytes.subarray(index, index + 0x8000)));
  return btoa(text);
}

const ACCEPTED_FILES = ".docx,.xlsx,.xls,.pdf,.csv,.txt,.md,image/png,image/jpeg";

export default function WorkflowMapPage() {
  const staffQuery = trpc.court.workflowMap.staff.useQuery();
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<WorkflowAnalysis | null>(null);
  const [mode, setMode] = useState<WorkflowDistributionMode>("auto");
  const [manualAssignees, setManualAssignees] = useState<Record<number, number | "">>({});
  const [priorities, setPriorities] = useState<Record<number, WorkflowPriority>>({});
  const [created, setCreated] = useState<CreatedTask[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<number | null>(null);

  const analyze = trpc.court.workflowMap.analyze.useMutation({
    onSuccess: result => {
      const payload = result as WorkflowAnalysis;
      setAnalysis(payload);
      setManualAssignees({});
      setPriorities({});
      setCreated([]);
      setSelectedOrder(payload.map.steps[0]?.order ?? null);
      toast.success(`تم استخراج ${payload.map.steps.length} خطوة من المستند.`);
    },
    onError: error => toast.error(error.message),
  });
  const distribute = trpc.court.workflowMap.distribute.useMutation({
    onSuccess: result => {
      const payload = result as { created: CreatedTask[] };
      setCreated(payload.created);
      toast.success(`أُنشئت ${payload.created.length} مهمة من مخطط سير العمل.`);
    },
    onError: error => toast.error(error.message),
  });

  const steps = analysis?.map.steps ?? [];
  const staff = (staffQuery.data ?? []) as WorkflowStaffOption[];
  const autoPreview = useMemo(() => autoAssignWorkflowSteps({ steps, staff }), [steps, staff]);
  const autoById = useMemo(() => new Map(autoPreview.map(item => [item.order, item])), [autoPreview]);
  const staffById = useMemo(() => new Map(staff.map(member => [member.id, member])), [staff]);

  const resolvedSteps = useMemo(() => steps.map(step => ({
    order: step.order,
    title: step.title,
    description: step.description,
    ownerUnitHint: step.ownerUnitHint,
    slaDays: step.slaDays,
    priority: priorities[step.order] ?? "normal" as WorkflowPriority,
    assigneeProfileId: mode === "auto" ? autoById.get(step.order)?.assigneeProfileId ?? null : (typeof manualAssignees[step.order] === "number" ? manualAssignees[step.order] as number : null),
    matchReason: autoById.get(step.order)?.matchReason ?? "balanced" as const,
  })), [steps, priorities, mode, manualAssignees, autoById]);

  const assignedCount = resolvedSteps.filter(step => step.assigneeProfileId).length;
  const readiness = canDistributeWorkflowPlan({ steps: steps.length, mode, staffCount: staff.length, assignedCount, isPending: distribute.isPending });

  const runAnalysis = async () => {
    if (!file) { toast.error("اختر ملف إجراءات بصيغة Word أو Excel أو PDF أو CSV أو صورة."); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("الحد الأقصى لحجم ملف المخطط 10 ميجابايت."); return; }
    analyze.mutate({ originalName: file.name, mimeType: file.type || "", contentBase64: await fileAsBase64(file) });
  };

  const runDistribution = () => {
    if (!analysis) { toast.error("حلّل مستنداً أولاً."); return; }
    if (!readiness.ok) { toast.error(readiness.reason); return; }
    distribute.mutate({
      sourceName: analysis.documentName,
      title: analysis.map.title,
      mode,
      steps: resolvedSteps.map(step => ({ order: step.order, title: step.title, description: step.description || undefined, assigneeProfileId: step.assigneeProfileId ?? undefined, priority: step.priority, slaDays: step.slaDays })),
    });
  };
  return <DashboardLayout><section dir="rtl" className="mx-auto w-full max-w-6xl">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-bold tracking-[0.14em] text-[#b18448]">سير العمل وخطة القسم</p>
        <h1 className="mt-2 text-3xl font-bold text-[#12352f]">مخطط سير العمل</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[#52685d]">ارفع مستند الإجراءات (Word أو Excel أو PDF أو صورة)، فيُقرأ ويُستخرج منه المخطط المتسلسل، ثم وزّع خطواته آلياً أو يدوياً كي تصبح مهام فعلية بإشعارات.</p>
      </div>
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e1ebe0] text-[#1f5a47]"><GitBranch className="h-6 w-6" /></div>
    </header>

    <div className="mt-7 rounded-[1.6rem] border border-[#d1dbcf] bg-[#f8f8f3] p-5 shadow-[0_10px_30px_rgba(30,51,42,0.05)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-[#1f4a36]">١. مستند الإجراءات</h2>
          <p className="mt-1 text-xs text-[#66766e]">Word وExcel وCSV وTXT تُقرأ محلياً، أما PDF والصور فتُقرأ بالذكاء الاصطناعي (OCR). الحد الأقصى 10 ميجابايت.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-[#e6efe4] px-3 py-1.5 text-[11px] font-bold text-[#2d6b4f]"><Sparkles className="h-3.5 w-3.5" />قراءة ذكية بمراجعة بشرية</span>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem]">
        <label htmlFor="workflow-source" className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#9fbea5] bg-[#eef2eb] p-4 text-sm text-[#3e5c4d]">
          {file ? <FileSpreadsheet className="h-5 w-5 text-[#2d6b4f]" /> : <UploadCloud className="h-5 w-5 text-[#2d6b4f]" />}
          <span className="min-w-0 flex-1">{file ? file.name : "اختر ملف الإجراءات أو الخطة (DOCX · XLSX · PDF · CSV · PNG · JPEG)"}</span>
        </label>
        <input id="workflow-source" type="file" accept={ACCEPTED_FILES} className="sr-only" onChange={event => { setFile(event.target.files?.[0] ?? null); setAnalysis(null); setCreated([]); }} />
        <Button type="button" disabled={analyze.isPending || !file} onClick={runAnalysis} className="h-12 bg-[#2d6b4f] text-sm font-black text-white hover:bg-[#245a41]">
          {analyze.isPending ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />جارٍ قراءة المستند…</> : <><Sparkles className="ml-2 h-4 w-4" />تحليل المستند وبناء المخطط</>}
        </Button>
      </div>
    </div>

    {analysis && <div className="mt-6 space-y-6">
      <div className="rounded-[1.6rem] border border-[#d1dbcf] bg-white p-5 shadow-[0_10px_30px_rgba(30,51,42,0.05)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-[#1f4a36]">٢. مخطط سير العمل المستخرج</h2>
            <p className="mt-1 text-sm font-bold text-[#315c4a]">{analysis.map.title}</p>
            {analysis.map.summary ? <p className="mt-1 max-w-3xl text-xs leading-6 text-[#66766e]">{analysis.map.summary}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-bold">
            <span className="rounded-full bg-[#eaf4ff] px-3 py-1.5 text-[#26628d]">{workflowMethodLabel(analysis.method)}</span>
            <span className="rounded-full bg-[#e6efe4] px-3 py-1.5 text-[#2d6b4f]"><Layers className="ml-1 inline h-3.5 w-3.5" />{analysis.map.steps.length} خطوة</span>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-[#e2e8df] bg-[#fbfcfa] p-3">
          <svg role="img" aria-label="مخطط سير العمل المتسلسل" viewBox={`0 0 ${analysis.diagram.width} ${Math.max(analysis.diagram.height, 140)}`} className="h-auto w-full min-w-[42rem]" style={{ direction: "ltr" }}>
            <defs>
              <marker id="workflow-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#7fa88f" />
              </marker>
            </defs>
            {analysis.diagram.edges.map(edge => <line key={`${edge.from}-${edge.to}`} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} stroke="#9fbea5" strokeWidth="2" markerEnd="url(#workflow-arrow)" />)}
            {analysis.diagram.nodes.map(node => {
              const step = steps.find(item => item.order === node.order);
              const assignee = staffById.get(resolvedSteps.find(item => item.order === node.order)?.assigneeProfileId ?? -1);
              const isSelected = selectedOrder === node.order;
              return <g key={node.order} role="button" tabIndex={0} aria-label={`الخطوة ${node.order}: ${node.title}`} onClick={() => setSelectedOrder(node.order)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") setSelectedOrder(node.order); }} style={{ cursor: "pointer" }}>
                <rect x={node.x} y={node.y} width={node.width} height={node.height} rx="16" fill={isSelected ? "#e0f1e3" : "#ffffff"} stroke={isSelected ? "#2d6b4f" : "#cddccd"} strokeWidth={isSelected ? 2.5 : 1.5} />
                <circle cx={node.x + node.width - 22} cy={node.y + 22} r="13" fill="#2d6b4f" />
                <text x={node.x + node.width - 22} y={node.y + 27} textAnchor="middle" fontSize="12" fontWeight="700" fill="#ffffff">{node.order}</text>
                <text x={node.x + node.width - 44} y={node.y + 27} textAnchor="end" fontSize="13" fontWeight="700" fill="#1f4a36" direction="rtl">{node.title.length > 26 ? `${node.title.slice(0, 26)}…` : node.title}</text>
                <text x={node.x + node.width - 44} y={node.y + 52} textAnchor="end" fontSize="11" fill="#66766e" direction="rtl">المدة {step?.slaDays ?? 3} يوم · {workflowPriorityLabel(priorities[node.order] ?? "normal")}</text>
                <text x={node.x + node.width - 44} y={node.y + 72} textAnchor="end" fontSize="11" fill="#2d6b4f" direction="rtl">{assignee ? assignee.fullName : "بلا منفذ بعد"}</text>
              </g>;
            })}
          </svg>
        </div>
        <p className="mt-2 text-[11px] text-[#718078]">اقرأ المخطط من اليمين إلى اليسار صفّاً بعد صف. اضغط أي خطوة لتحديدها في جدول التوزيع.</p>
      </div>

      <div className="rounded-[1.6rem] border border-[#d1dbcf] bg-white p-5 shadow-[0_10px_30px_rgba(30,51,42,0.05)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-[#1f4a36]">٣. توزيع الخطوات على المنفذين</h2>
            <p className="mt-1 text-xs text-[#66766e]">التوزيع الآلي يطابق اسم الموظف في نص الخطوة، ثم وحدة المالك المقترحة، ثم يوزّع بالتساوي حسب الحمل. والتوزيع اليدوي يبقى قرارك لكل خطوة.</p>
          </div>
          <div className="inline-flex rounded-xl border border-[#cddccd] bg-[#f2f5f0] p-1" role="group" aria-label="نمط التوزيع">
            {(["auto", "manual"] as WorkflowDistributionMode[]).map(option => <button key={option} type="button" aria-pressed={mode === option} onClick={() => setMode(option)} className={`rounded-lg px-3 py-2 text-xs font-black transition ${mode === option ? "bg-[#2d6b4f] text-white" : "text-[#315c4a] hover:bg-[#e3ece1]"}`}>{option === "auto" ? "توزيع آلي" : "توزيع يدوي"}</button>)}
          </div>
        </div>

        <p className="mt-3 rounded-xl bg-[#f4f8f3] px-3 py-2 text-[11px] font-bold text-[#3f5f4f]">{mode === "auto" ? workflowAssignmentSummary(autoPreview) : `التوزيع اليدوي: تم إسناد ${assignedCount} من ${steps.length} خطوة.`}</p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[46rem] text-right text-xs">
            <thead className="bg-[#f1f5ef] text-[#315c4a]">
              <tr>
                <th scope="col" className="px-3 py-2 font-black">الخطوة</th>
                <th scope="col" className="px-3 py-2 font-black">المدة (أيام)</th>
                <th scope="col" className="px-3 py-2 font-black">الأولوية</th>
                <th scope="col" className="px-3 py-2 font-black">المنفذ</th>
              </tr>
            </thead>
            <tbody>
              {steps.map(step => {
                const auto = autoById.get(step.order);
                const manualId = manualAssignees[step.order];
                return <tr key={step.order} className={`border-t border-[#e8eee6] ${selectedOrder === step.order ? "bg-[#f3f9f2]" : ""}`}>
                  <td className="px-3 py-3">
                    <button type="button" onClick={() => setSelectedOrder(step.order)} className="text-right text-[13px] font-bold text-[#1f4a36] underline decoration-[#b9d2ba] underline-offset-4">{step.order}. {step.title}</button>
                    {step.ownerUnitHint ? <p className="mt-1 text-[11px] text-[#718078]">الوحدة المقترحة: {step.ownerUnitHint}</p> : null}
                  </td>
                  <td className="px-3 py-3">
                    <input type="number" min={1} max={120} aria-label={`مدة الخطوة ${step.order} بالأيام`} value={step.slaDays} readOnly className="h-9 w-20 rounded-lg border border-[#dce6dc] bg-[#fbfcfa] px-2 text-xs font-bold text-[#315c4a]" />
                  </td>
                  <td className="px-3 py-3">
                    <select aria-label={`أولوية الخطوة ${step.order}`} value={priorities[step.order] ?? "normal"} onChange={event => setPriorities(current => ({ ...current, [step.order]: event.target.value as WorkflowPriority }))} className="h-9 rounded-lg border border-[#dce6dc] bg-white px-2 text-xs font-bold text-[#315c4a]">
                      {(["normal", "high", "critical"] as WorkflowPriority[]).map(priority => <option key={priority} value={priority}>{workflowPriorityLabel(priority)}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    {mode === "auto" ? <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-[#2d6b4f]">{workflowStaffLabel(staffById.get(auto?.assigneeProfileId ?? -1))}</span>
                      {auto ? <span className="text-[10px] text-[#718078]">{workflowMatchReasonLabel(auto.matchReason)}</span> : null}
                    </div> : <select aria-label={`منفذ الخطوة ${step.order}`} value={typeof manualId === "number" ? manualId : ""} onChange={event => setManualAssignees(current => ({ ...current, [step.order]: event.target.value ? Number(event.target.value) : "" }))} className="h-9 w-full rounded-lg border border-[#dce6dc] bg-white px-2 text-xs font-bold text-[#315c4a]">
                      <option value="">اختر المنفذ…</option>
                      {staff.map(member => <option key={member.id} value={member.id}>{workflowStaffLabel(member)}</option>)}
                    </select>}
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dbe8dd] bg-[#f8fbf8] p-3">
          <p className="text-[11px] font-bold text-[#3f5f4f]">{readiness.reason}</p>
          <Button type="button" disabled={!readiness.ok} onClick={runDistribution} className="bg-[#0e6a40] text-sm font-black text-white hover:bg-[#0b5733]">
            {distribute.isPending ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />جارٍ إنشاء المهام…</> : <><CirclePlus className="ml-2 h-4 w-4" />إنشاء المهام وتوزيعها</>}
          </Button>
        </div>
      </div>

      {created.length > 0 && <div className="rounded-[1.6rem] border border-[#cfe4d3] bg-[#f4fbf4] p-5 shadow-[0_10px_30px_rgba(30,51,42,0.05)] sm:p-6">
        <div className="flex items-center gap-2 text-[#1f4a36]"><CheckCircle2 className="h-5 w-5 text-[#2d6b4f]" /><h2 className="text-lg font-black">٤. المهام المُنشأة</h2></div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {created.map(task => <li key={task.taskId} className="rounded-xl border border-[#d9e8dc] bg-white px-3 py-2 text-xs">
            <p className="font-bold text-[#1f4a36]">{task.order}. {task.title}</p>
            <p className="mt-1 text-[11px] text-[#66766e]">المنفذ: {workflowStaffLabel(staffById.get(task.assigneeProfileId))}</p>
          </li>)}
        </ul>
        <p className="mt-3 text-[11px] text-[#66766e]">أُرسل إشعار إسناد لكل منفذ، ويمكن متابعة المهام من صفحة المهام.</p>
      </div>}

      {analysis.extractedText ? <details className="rounded-[1.6rem] border border-[#d1dbcf] bg-white p-5 shadow-[0_10px_30px_rgba(30,51,42,0.05)]">
        <summary className="cursor-pointer text-sm font-black text-[#1f4a36]">النص المستخرج من المستند (للمراجعة والتدقيق)</summary>
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-[#f7faf6] p-3 text-[11px] leading-6 text-[#3f5f4f]" dir="rtl">{analysis.extractedText}</pre>
      </details> : null}
    </div>}
  </section></DashboardLayout>;
}
