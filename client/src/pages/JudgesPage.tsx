import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { CircleDashed, FilePenLine, Plus, Scale, ShieldCheck } from "lucide-react";
import React, { FormEvent, useState } from "react";

type JudgeStatus = "active" | "on_leave" | "inactive" | "pending_review";
type AttendanceMode = "in_person" | "remote" | "mixed";
type JudgeForm = { fullName: string; email: string; employeeNumber: string; jobTitle: string; judicialFormation: string; attendanceMode: AttendanceMode; status: JudgeStatus };
type Judge = { id: number; fullName: string; email: string | null; employeeNumber: string | null; jobTitle: string | null; judicialFormation: string | null; attendanceMode: AttendanceMode | null; status: JudgeStatus; traineeCount?: number };

const blankJudge: JudgeForm = { fullName: "", email: "", employeeNumber: "", jobTitle: "قاضٍ", judicialFormation: "", attendanceMode: "in_person", status: "active" };
const statusLabel: Record<JudgeStatus, string> = { active: "نشط", on_leave: "في إجازة", inactive: "موقوف", pending_review: "قيد المراجعة" };
const attendanceModeLabel: Record<AttendanceMode, string> = { in_person: "حضوري", remote: "عن بُعد", mixed: "هجين" };

export function JudgesPage() {
  const utils = trpc.useUtils();
  const judges = trpc.court.judges.list.useQuery();
  const judgesWithoutEmail = trpc.court.judges.withoutEmail.useQuery();
  const permission = trpc.court.registration.myPermission.useQuery();
  const canManage = permission.data === "full_control";
  const [form, setForm] = useState<JudgeForm>(blankJudge);
  const [editingJudgeId, setEditingJudgeId] = useState<number | null>(null);
  const create = trpc.court.judges.create.useMutation({ onSuccess: async () => { await utils.court.judges.list.invalidate(); setForm(blankJudge); } });
  const update = trpc.court.judges.update.useMutation({ onSuccess: async () => { await utils.court.judges.list.invalidate(); setEditingJudgeId(null); setForm(blankJudge); } });
  const archive = trpc.court.judges.archive.useMutation({ onSuccess: async () => { await utils.court.judges.list.invalidate(); } });
  const pending = create.isPending || update.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const payload = { fullName: form.fullName, email: form.email || undefined, employeeNumber: form.employeeNumber || undefined, jobTitle: form.jobTitle || undefined, judicialFormation: form.judicialFormation || undefined, attendanceMode: form.attendanceMode, status: form.status };
    if (editingJudgeId) update.mutate({ ...payload, judgeId: editingJudgeId });
    else create.mutate(payload);
  };
  const editJudge = (judge: Judge) => {
    setEditingJudgeId(judge.id);
    setForm({ fullName: judge.fullName, email: judge.email || "", employeeNumber: judge.employeeNumber || "", jobTitle: judge.jobTitle || "قاضٍ", judicialFormation: judge.judicialFormation || "", attendanceMode: judge.attendanceMode || "in_person", status: judge.status });
  };
  const archiveJudge = (judge: Judge) => {
    if (!window.confirm(`هل تريد أرشفة ملف القاضي "${judge.fullName}"؟ (لن يُحذف، بل يُوسم مؤرشفاً)`)) return;
    const reason = window.prompt("سبب الأرشفة (اختياري):")?.trim() || undefined;
    archive.mutate({ judgeId: judge.id, reason });
  };

  return <DashboardLayout><section className="mx-auto max-w-6xl">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold tracking-[0.14em] text-[#b18448]">تسلسل الأقسام</p><h1 className="mt-2 text-3xl font-bold text-[#12352f]">شؤون القضاة</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-[#65766d]">إدارة ملفات القضاة وتشكيلاتهم القضائية عبر مسار مستقل، مع حفظ جميع التغييرات ضمن سجل حركة المنصة.</p></div><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e9f0ea] text-[#1f5a47]"><Scale className="h-6 w-6" aria-hidden="true" /></div></div>
    {canManage ? <div className="mt-7 grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]"><form onSubmit={submit} className="rounded-[1.5rem] border border-[#e7e0d4] bg-white p-5 shadow-[0_10px_30px_rgba(30,51,42,0.05)]"><div className="flex items-center gap-2 text-[#12352f]"><Plus className="h-5 w-5 text-[#b18448]" /><h2 className="font-bold">{editingJudgeId ? "تعديل ملف القاضي" : "إضافة ملف قاضٍ"}</h2></div><p className="mt-2 text-xs leading-6 text-[#74817a]">إضافة وتعديل ملفات القضاة محصوران بمالك الصلاحية الكاملة، وتخضع العملية للتدقيق.</p><div className="mt-5 space-y-3"><Input value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} placeholder="الاسم الكامل" required /><Input value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} placeholder="البريد الرسمي" type="email" /><Input value={form.employeeNumber} onChange={event => setForm({ ...form, employeeNumber: event.target.value })} placeholder="الرقم الوظيفي" /><Input value={form.jobTitle} onChange={event => setForm({ ...form, jobTitle: event.target.value })} placeholder="المسمى الوظيفي" /><Input value={form.judicialFormation} onChange={event => setForm({ ...form, judicialFormation: event.target.value })} placeholder="التشكيل القضائي" /><select value={form.attendanceMode} onChange={event => setForm({ ...form, attendanceMode: event.target.value as AttendanceMode })} className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="in_person">حضور بالمقر</option><option value="remote">عن بُعد</option><option value="mixed">هجين</option></select><select value={form.status} onChange={event => setForm({ ...form, status: event.target.value as JudgeStatus })} className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm">{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="mt-5 flex gap-2"><Button disabled={pending} className="flex-1 bg-[#006c35] hover:bg-[#00552b]">{pending ? "جارٍ الحفظ…" : editingJudgeId ? "حفظ التعديل" : "إضافة ملف القاضي"}</Button>{editingJudgeId && <Button type="button" variant="outline" onClick={() => { setEditingJudgeId(null); setForm(blankJudge); }}>إلغاء</Button>}</div>{(create.error || update.error) && <p className="mt-3 text-xs leading-6 text-[#a04935]">{create.error?.message || update.error?.message}</p>}</form><JudgeList judges={judges.data as Judge[] | undefined} loading={judges.isLoading} canManage={canManage} onEdit={editJudge} onArchive={archiveJudge} /></div> : <div className="mt-7"><JudgeList judges={judges.data as Judge[] | undefined} loading={judges.isLoading} canManage={false} onEdit={() => undefined} onArchive={() => undefined} /></div>}<JudgesWithoutEmailSection data={judgesWithoutEmail.data} loading={judgesWithoutEmail.isLoading} />
  </section></DashboardLayout>;
}

function JudgeList({ judges, loading, canManage, onEdit, onArchive }: { judges: Judge[] | undefined; loading: boolean; canManage: boolean; onEdit: (judge: Judge) => void; onArchive: (judge: Judge) => void }) {
  return <div className="rounded-[1.5rem] border border-[#e7e0d4] bg-white p-5 shadow-[0_10px_30px_rgba(30,51,42,0.05)]"><div className="flex items-center gap-2 text-[#12352f]"><ShieldCheck className="h-5 w-5 text-[#b18448]" /><h2 className="font-bold">ملفات القضاة</h2></div>{loading ? <div className="mt-6 flex items-center gap-2 text-sm text-[#6e7e75]"><CircleDashed className="h-4 w-4 animate-spin" /> جارٍ تحميل ملفات شؤون القضاة…</div> : judges?.length ? <div className="mt-5 divide-y divide-[#eee8de]">{judges.map(judge => <article key={judge.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-bold text-[#29463b]">{judge.fullName}</p><p className="mt-1 text-xs text-[#75837c]">{judge.jobTitle || "قاضٍ"} · {judge.judicialFormation || "دون تشكيل مسجل"} · {judge.employeeNumber || "دون رقم وظيفي"} · {judge.traineeCount ?? 0} ملازم مرتبط</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#eef2f6] px-3 py-1 text-xs font-bold text-[#446075]">{attendanceModeLabel[judge.attendanceMode || "in_person"]}</span><span className={`rounded-full px-3 py-1 text-xs font-bold ${judge.status === "active" ? "bg-[#eef3ed] text-[#386048]" : "bg-[#f7efe0] text-[#8a6731]"}`}>{statusLabel[judge.status]}</span>{canManage && <Button type="button" variant="outline" size="sm" onClick={() => onEdit(judge)}><FilePenLine className="ml-1 h-3.5 w-3.5" />تعديل</Button>}{canManage && <Button type="button" variant="outline" size="sm" onClick={() => onArchive(judge)} className="text-[#a04935]">أرشفة</Button>}</div></article>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-[#d8d1c5] bg-[#fbfaf6] px-5 py-10 text-center text-sm leading-7 text-[#738179]">لا توجد ملفات قضاة ظاهرة ضمن نطاق صلاحيتك حالياً.</div>}</div>;
}

type JudgeWithoutEmail = { id: number; fullName: string; unitId: number | null; judicialFormation: string | null; nationalId: string | null; jobTitle: string | null };

function JudgesWithoutEmailSection({ data, loading }: { data: JudgeWithoutEmail[] | undefined; loading: boolean }) {
  return <div className="mt-7 rounded-[1.5rem] border border-[#e7e0d4] bg-white p-5 shadow-[0_10px_30px_rgba(30,51,42,0.05)]"><div className="flex items-center gap-2 text-[#12352f]"><ShieldCheck className="h-5 w-5 text-[#b18448]" /><h2 className="font-bold">قضاة بدون بريد إلكتروني</h2></div><p className="mt-2 text-xs leading-6 text-[#74817a]">القضاة التاليون ليس لهم بريد رسمي مسجل ويحتاجون إضافة يدوية.</p>{loading ? <p className="mt-4 text-sm text-[#6e7e75]">جارٍ التحميل…</p> : data?.length ? <div className="mt-4 divide-y divide-[#eee8de]">{data.map(judge => <div key={judge.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-bold text-[#29463b]">{judge.fullName}</p><p className="mt-1 text-xs text-[#75837c]">القسم: {judge.unitId ?? "غير مسند"} · التشكيل: {judge.judicialFormation || "دون تشكيل"} · الهوية الوطنية: {judge.nationalId || "—"} · المسمى: {judge.jobTitle || "قاضٍ"}</p></div></div>)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-[#d8d1c5] p-6 text-center text-sm text-[#738179]">لا يوجد قضاة بدون بريد إلكتروني.</div>}</div>;
}
