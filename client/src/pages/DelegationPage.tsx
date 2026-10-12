import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { ShieldCheck, UserCheck } from "lucide-react";
import React, { FormEvent, useState } from "react";
import { toast } from "sonner";

export default function DelegationPage() {
  const utils = trpc.useUtils();
  const api = (trpc.court as any).delegation;
  const list = api?.list?.useQuery ? api.list.useQuery() : { data: [], isLoading: false, error: null };
  const users = api?.users?.useQuery ? api.users.useQuery() : { data: [] };
  const create = api?.create?.useMutation ? api.create.useMutation({ onSuccess: () => { utils.invalidate(); toast.success("تم إنشاء التفويض المؤقت. سيظهر لدى المفوض إليه ويختفي بانتهاء المدة."); }, onError: (error: { message: string }) => toast.error(error.message) }) : { mutate: () => undefined, isPending: false };
  const cancel = api?.cancel?.useMutation ? api.cancel.useMutation({ onSuccess: () => toast.success("أُلغي التفويض واختفت الصلاحية.") }) : { mutate: () => undefined, isPending: false };
  const [form, setForm] = useState({ delegateUserId: "", role: "department_manager", title: "", startsAt: "", endsAt: "", notes: "" });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate({ delegateUserId: Number(form.delegateUserId), role: form.role, title: form.title, startsAt: new Date(form.startsAt), endsAt: new Date(form.endsAt), notes: form.notes || undefined });
  };
  return <DashboardLayout><section dir="rtl" className="mx-auto max-w-5xl"><header className="mb-6"><p className="text-xs font-black tracking-[0.14em] text-[var(--rakiza-gold)]">رئاسة المحكمة</p><h1 className="mt-2 text-3xl font-black text-[var(--rakiza-ink)]">تفويض صلاحية مؤقت</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--rakiza-muted)]">ينشئ رئيس المحكمة مهمة تفويض بمدة واضحة. تظهر الصلاحية لدى المفوض إليه ثم تختفي تلقائياً عند انتهاء المهمة. الصلاحيات المطلقة تبقى للمالك ورئيس المحكمة.</p></header>
    <form onSubmit={submit} className="rounded-[1.5rem] border border-[var(--rakiza-border)] bg-white p-5"><div className="flex items-center gap-2"><UserCheck className="h-5 w-5 text-[var(--rakiza-olive-strong)]" /><h2 className="font-bold">مهمة تفويض جديدة</h2></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <select required value={form.delegateUserId} onChange={event => setForm({ ...form, delegateUserId: event.target.value })} className="h-11 rounded-xl border px-3 text-sm"><option value="">اختر المفوض إليه</option>{(users.data ?? []).map((user: any) => <option key={user.id} value={user.id}>{user.profileName || user.name} · {user.email}</option>)}</select>
        <select value={form.role} onChange={event => setForm({ ...form, role: event.target.value })} className="h-11 rounded-xl border px-3 text-sm"><option value="department_manager">مدير قسم</option><option value="court_secretary">أمين المحكمة</option><option value="assistant_president">مساعد الرئيس</option><option value="human_resources_manager">الموارد البشرية</option><option value="performance_monitor">مراقبة الأداء</option></select>
        <input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="عنوان مهمة التفويض" className="h-11 rounded-xl border px-3 text-sm md:col-span-2" />
        <label className="text-xs font-bold">يبدأ<input type="datetime-local" required value={form.startsAt} onChange={event => setForm({ ...form, startsAt: event.target.value })} className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-normal" /></label>
        <label className="text-xs font-bold">ينتهي<input type="datetime-local" required value={form.endsAt} onChange={event => setForm({ ...form, endsAt: event.target.value })} className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-normal" /></label>
        <textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="ملاحظة اختيارية" className="min-h-20 rounded-xl border p-3 text-sm md:col-span-2" />
      </div>
      <button type="submit" disabled={create.isPending} className="mt-4 rounded-xl bg-[var(--rakiza-olive-strong)] px-4 py-2.5 text-sm font-black text-white">{create.isPending ? "جارٍ الحفظ…" : "إنشاء التفويض"}</button>
    </form>
    <section className="mt-6 rounded-[1.5rem] border border-[var(--rakiza-border)] bg-white p-5"><h2 className="font-bold">التفويضات الحالية</h2>{list.isLoading ? <p className="mt-4 text-sm">جارٍ التحميل…</p> : list.data?.length ? list.data.map((row: any) => <article key={row.delegation.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--rakiza-border)] pt-3"><div><p className="font-bold">{row.delegation.title}</p><p className="text-xs text-[var(--rakiza-muted)]">{row.delegateName} · حتى {new Date(row.delegation.endsAt).toLocaleString("ar-SA")} · {row.delegation.status === "active" ? "ساري" : "منتهٍ"}</p></div>{row.delegation.status === "active" && <button type="button" onClick={() => cancel.mutate({ delegationId: row.delegation.id })} className="rounded-lg border px-3 py-1.5 text-xs font-bold">إنهاء الآن</button>}</article>) : <p className="mt-4 text-sm text-[var(--rakiza-muted)]">لا توجد تفويضات بعد.</p>}</section>
  </section></DashboardLayout>;
}
