import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CorrespondenceAttachmentPicker, type CorrespondenceAttachmentDraft } from "@/components/CorrespondenceAttachmentPicker";
import { correspondenceRoleCapabilities, type CorrespondencePermission } from "@/lib/correspondenceRole";
import { trpc } from "@/lib/trpc";
import { AlertCircle, ClipboardCheck, Mail } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { traineeCorrespondenceTemplates } from "./TraineeCorrespondenceTemplatesPage";
import { departmentCorrespondenceTemplates } from "./DepartmentCorrespondenceTemplates";
import { toast } from "sonner";

export default function CorrespondenceWorkspaceContent() {
  const [, setLocation] = useLocation();
  const [location] = useLocation();
  const utils = trpc.useUtils();
  const people = trpc.court.people.list.useQuery();
  const selfProfile = trpc.court.people.self.useQuery();
  const judges = trpc.court.people.list.useQuery({ personType: "judge" }, { enabled: true });
  const units = trpc.court.units.list.useQuery();
  const levels = trpc.court.hierarchy.list.useQuery();
  const correspondences = trpc.court.correspondence.list.useQuery();
  const permission = trpc.court.registration.myPermission.useQuery();
  const roles = trpc.court.myRoles.useQuery();
  const capabilities = correspondenceRoleCapabilities(permission.data as CorrespondencePermission, roles.data);
  const [copySearch, setCopySearch] = useState("");
  const [attachments, setAttachments] = useState<CorrespondenceAttachmentDraft[]>([]);
  const [form, setForm] = useState({
    correspondenceType: "request" as "request" | "letter",
    senderProfileId: "",
    unitId: "",
    copyUnitId: "",
    departmentManagerProfileId: "",
    recipientProfileId: "",
    copyProfileIds: [] as number[],
    subject: "",
    body: "",
    managerProfileIds: [] as number[],
  });
  const create = trpc.court.correspondence.create.useMutation({
    onSuccess: ({ taskId }) => {
      utils.court.correspondence.list.invalidate();
      utils.court.tasks.list.invalidate();
      toast.success(`تم إنشاء الطلب وربط مهمة المتابعة رقم ${taskId}.`);
      setForm(current => ({ ...current, subject: "", body: "", recipientProfileId: "", copyProfileIds: [], managerProfileIds: [] }));
      setAttachments([]);
    },
  });
  const route = trpc.court.correspondence.route.useMutation({
    onSuccess: () => {
      utils.court.correspondence.list.invalidate();
      utils.court.tasks.list.invalidate();
      toast.success("تم تحديث مسار المراسلة والمهمة المرتبطة بها.");
    },
  });

  const activePeople = Array.from(new Map([...((people.data ?? []).filter(person => person.status === "active")), ...((judges.data ?? []).filter(person => person.status === "active"))].map(person => [person.id, person])).values());
  const senderUnitIds = Array.from(new Set(activePeople.map(person => person.unitId ?? 0))).sort((a, b) => a - b);
  const ownProfile = selfProfile.data;
  const selectedUnitId = form.unitId ? Number(form.unitId) : undefined;
  const selectedCopyUnitId = form.copyUnitId ? Number(form.copyUnitId) : undefined;
  const sectionPeople = activePeople.filter(person => person.unitId === selectedUnitId);
  const managerIds = new Set((levels.data ?? []).map(item => item.level.managerProfileId));
  const sectionManagers = sectionPeople.filter(person => managerIds.has(person.id));
  const recipientPersonType = sectionPeople.find(person => person.id === Number(form.recipientProfileId))?.personType;
  const recipientIsJudge = recipientPersonType === "judge";
  const copyCandidates = selectedCopyUnitId ? activePeople.filter(person => person.unitId === selectedCopyUnitId && person.id !== Number(form.senderProfileId)) : [];
  const copySearchResults = copySearch.trim().length > 0
    ? activePeople.filter(person => person.id !== Number(form.senderProfileId) && person.fullName.toLocaleLowerCase().includes(copySearch.trim().toLocaleLowerCase()))
    : copyCandidates;
  const copySelectedPeople = activePeople.filter(person => form.copyProfileIds.includes(person.id));
  const allCopyCandidatesSelected = copyCandidates.length > 0 && copyCandidates.every(person => form.copyProfileIds.includes(person.id));

  useEffect(() => {
    if ((capabilities.isEmployee || capabilities.isTrainee) && ownProfile && !form.senderProfileId) {
      setForm(current => ({ ...current, senderProfileId: String(ownProfile.id), correspondenceType: "request" }));
    }
  }, [capabilities.isEmployee, capabilities.isTrainee, form.senderProfileId, ownProfile]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.split("?")[1] || "");
    if (searchParams.get("type") === "request") setForm(current => ({ ...current, correspondenceType: "request" }));
    const templateId = searchParams.get("template");
    const template = templateId ? [...traineeCorrespondenceTemplates, ...departmentCorrespondenceTemplates].find(item => item.id === templateId) : undefined;
    if (template) setForm(current => ({ ...current, correspondenceType: "letter", subject: template.title, body: template.body }));
  }, [location]);

  const toggleManager = (profileId: number) => setForm(current => ({
    ...current,
    managerProfileIds: current.managerProfileIds.includes(profileId)
      ? current.managerProfileIds.filter(id => id !== profileId)
      : [...current.managerProfileIds, profileId],
  }));
  const selectUnit = (unitId: string) => setForm(current => ({ ...current, unitId, departmentManagerProfileId: "", recipientProfileId: "", copyUnitId: "", copyProfileIds: [], managerProfileIds: [] }));
  const toggleCopyProfile = (profileId: number) => setForm(current => ({ ...current, copyProfileIds: current.copyProfileIds.includes(profileId) ? current.copyProfileIds.filter(id => id !== profileId) : [...current.copyProfileIds, profileId] }));
  const toggleAllCopyCandidates = () => setForm(current => {
    const candidateIds = copyCandidates.map(person => person.id);
    const shouldRemove = candidateIds.length > 0 && candidateIds.every(id => current.copyProfileIds.includes(id));
    return { ...current, copyProfileIds: shouldRemove ? current.copyProfileIds.filter(id => !candidateIds.includes(id)) : Array.from(new Set([...current.copyProfileIds, ...candidateIds])) };
  });
  const selectDepartmentManager = (profileId: string) => setForm(current => ({
    ...current,
    departmentManagerProfileId: profileId,
    managerProfileIds: profileId ? Array.from(new Set([...current.managerProfileIds, Number(profileId)])) : current.managerProfileIds,
  }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate({
      correspondenceType: form.correspondenceType,
      senderProfileId: Number(form.senderProfileId),
      unitId: Number(form.unitId),
      departmentManagerProfileId: Number(form.departmentManagerProfileId),
      recipientProfileId: Number(form.recipientProfileId),
      copyProfileIds: form.copyProfileIds,
      managerProfileIds: form.managerProfileIds,
      subject: form.subject,
      body: form.body,
      attachments,
    });
  };
  const statusLabel = (status: string) => ({ draft: "مسودة", in_review: "قيد المسار", approved: "معتمدة", returned: "معادة", rejected: "مرفوضة" }[status] || status);
  const routingReady = !capabilities.canChooseRouting || Boolean(form.unitId && form.departmentManagerProfileId && form.recipientProfileId);

  return <section className="mx-auto max-w-6xl">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold tracking-[0.14em] text-[#b18448]">مراسلات وطلبات محكومة</p><h1 className="mt-2 text-3xl font-bold text-[#12352f]">{capabilities.isTrainee ? "طلباتي ومراسلاتي" : "المراسلات والطلبات"}</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-[#65766d]">{capabilities.isTrainee ? "أنشئ طلباً مرتبطاً بملفك فقط؛ يحيله النظام تلقائياً إلى أول مستوى إداري معتمد دون كشف بيانات الأقسام الأخرى." : "اختر القسم أولاً، ثم الموظف ومدير القسم الإلزامي؛ تُنشأ مهمة متابعة ومسار اعتماد قابل للتدقيق."}</p></div><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e9f0ea] text-[#1f5a47]"><Mail className="h-6 w-6" /></div></header>
    <div className={`mt-7 grid gap-5 ${capabilities.canCreate ? "xl:grid-cols-[23rem_minmax(0,1fr)]" : ""}`}>
      {capabilities.canCreate && <form onSubmit={submit} className="rounded-[1.5rem] border border-[#e7e0d4] bg-white p-5 shadow-[0_10px_30px_rgba(30,51,42,0.05)]">
        <div className="flex items-center gap-2 text-[#12352f]"><Mail className="h-5 w-5 text-[#b18448]" /><h2 className="font-bold">{capabilities.isTrainee ? "إرسال طلب" : "إنشاء طلب أو مراسلة"}</h2></div>
        <p className="mt-2 text-xs leading-6 text-[#718078]">{capabilities.isTrainee ? "يُوجه طلبك تلقائياً عبر التسلسل المعتمد." : "لا يمكن إرسال الطلب قبل تحديد القسم ومدير القسم."}</p>
        <div className="mt-5 space-y-3">
          {capabilities.canRoute && <label className="block text-xs font-bold text-[#53675d]">قالب مدير القسم <span className="font-normal text-[#7a887f]">(اختياري)</span><select value="" onChange={event => { const selected = departmentCorrespondenceTemplates.find(item => item.id === event.target.value); if (selected) setForm(current => ({ ...current, correspondenceType: "letter", subject: selected.title, body: selected.body })); }} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="">اختر قالباً جاهزاً للنسخ والتعبئة</option>{departmentCorrespondenceTemplates.map(template => <option value={template.id} key={template.id}>{template.title}</option>)}</select></label>}
          {!capabilities.isTrainee && <select value={form.correspondenceType} onChange={event => setForm({ ...form, correspondenceType: event.target.value as typeof form.correspondenceType })} className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="request">طلب</option><option value="letter">مراسلة</option></select>}
          <select required value={form.senderProfileId} disabled={capabilities.isEmployee || capabilities.isTrainee} onChange={event => setForm({ ...form, senderProfileId: event.target.value })} className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm disabled:opacity-70"><option value="">{capabilities.isTrainee ? "جارٍ تحميل ملفك" : "من: اختر الموظف مرسل الطلب"}</option>{senderUnitIds.map(unitId => <optgroup key={unitId} label={units.data?.find(unit => unit.id === unitId)?.name || "دون قسم"}>{activePeople.filter(person => (person.unitId ?? 0) === unitId).map(person => <option value={person.id} key={person.id}>{person.fullName}</option>)}</optgroup>)}</select>
          {capabilities.canChooseRouting && <>
            <label className="block text-xs font-bold text-[#53675d]">القسم المستهدف<select required value={form.unitId} onChange={event => selectUnit(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="">اختر القسم أولاً</option>{(units.data ?? []).map(unit => <option value={unit.id} key={unit.id}>{unit.name}</option>)}</select></label>
            <label className="block text-xs font-bold text-[#53675d]">موظف القسم<select required disabled={!form.unitId} value={form.recipientProfileId} onChange={event => setForm({ ...form, recipientProfileId: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm disabled:opacity-60"><option value="">{form.unitId ? "اختر موظفاً من القسم" : "اختر القسم أولاً"}</option>{sectionPeople.filter(person => person.personType !== "trainee").map(person => <option value={person.id} key={person.id}>{person.fullName}</option>)}</select></label>
            <label className="block text-xs font-bold text-[#53675d]">مدير القسم <span className="text-[#a04a35]">(إلزامي)</span><select required disabled={!form.unitId} value={form.departmentManagerProfileId} onChange={event => selectDepartmentManager(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm disabled:opacity-60"><option value="">{form.unitId ? "اختر مدير القسم" : "اختر القسم أولاً"}</option>{sectionManagers.map(person => <option value={person.id} key={person.id}>{person.fullName}</option>)}</select>{form.unitId && !sectionManagers.length && <span className="mt-1 block text-[11px] font-normal text-[#a04a35]">لا يوجد مدير مثبت لهذا القسم بعد؛ يحتاج المالك إلى تثبيت مدير من إدارة الصلاحيات.</span>}{recipientIsJudge && <span className="mt-1 block text-[11px] font-normal text-[#1f7a4d]">سيُضاف رئيس المحكمة كنسخة تلقائية لأن المستلم قاضٍ.</span>}</label>
            <div className="rounded-xl border border-[#d8e6dc] bg-[#f9fcf8] p-3"><p className="text-xs font-bold text-[#53675d]">إضافة نسخة <span className="font-normal text-[#7a887f]">(اختياري)</span></p><p className="mt-1 text-[11px] leading-5 text-[#7a887f]">اختر القسم أولاً، ثم اضغط على أسماء الموظفين لتحديدهم بعلامة صح.</p><div className="mt-2 flex gap-2"><select aria-label="قسم النسخ" value={form.copyUnitId} onChange={event => { setCopySearch(""); setForm(current => ({ ...current, copyUnitId: event.target.value, copyProfileIds: [] })); }} className="h-10 min-w-0 flex-1 rounded-md border border-input bg-white px-3 text-sm"><option value="">اختر قسم النسخ</option>{(units.data ?? []).map(unit => <option value={unit.id} key={unit.id}>{unit.name}</option>)}</select><button type="button" disabled={!selectedCopyUnitId || !copyCandidates.length} onClick={toggleAllCopyCandidates} className="shrink-0 rounded-md border border-[#b6d1bc] px-3 text-xs font-bold text-[#28623f] disabled:opacity-50">{allCopyCandidatesSelected ? "إلغاء قسم" : "تحديد الكل"}</button></div><label className="mt-2 block text-[11px] font-bold text-[#53675d]">بحث مباشر عن موظف<input value={copySearch} onChange={event => setCopySearch(event.target.value)} placeholder="اكتب الاسم للبحث دون تصفح الأقسام" className="mt-1 h-9 w-full rounded-md border border-input bg-white px-3 text-xs font-normal" /></label>{(selectedCopyUnitId || copySearch.trim()) && <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">{copySearchResults.length ? copySearchResults.map(person => <button type="button" key={person.id} onClick={() => toggleCopyProfile(person.id)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-right text-xs ${form.copyProfileIds.includes(person.id) ? "bg-[#dcefe0] font-bold text-[#174b3c]" : "bg-white hover:bg-[#eef6ee]"}`}><span>{person.fullName} · {person.email || "دون بريد"}</span><span aria-hidden="true" className={`grid h-5 w-5 place-items-center rounded border ${form.copyProfileIds.includes(person.id) ? "border-[#26704d] bg-[#26704d] text-white" : "border-[#b7c8bb] text-transparent"}`}>✓</span></button>) : <p className="text-[11px] text-[#8a6731]">لا توجد نتائج مطابقة ضمن الحسابات النشطة المسموح بها.</p>}</div>}{ownProfile && <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-[#53675d]"><input type="checkbox" checked={form.copyProfileIds.includes(ownProfile.id)} onChange={() => toggleCopyProfile(ownProfile.id)} />إضافة نفسي إلى النسخ ({ownProfile.fullName})</label>}{copySelectedPeople.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{copySelectedPeople.map(person => <button type="button" key={person.id} onClick={() => toggleCopyProfile(person.id)} className="rounded-full bg-[#e5f1e5] px-2.5 py-1 text-[11px] font-bold text-[#28623f]">{person.fullName} ×</button>)}</div>}</div>
          </>}
          <Input required value={form.subject} onChange={event => setForm({ ...form, subject: event.target.value })} placeholder="موضوع الطلب أو المراسلة" />
          <textarea required value={form.body} onChange={event => setForm({ ...form, body: event.target.value })} className="min-h-28 w-full rounded-md border border-input bg-transparent p-3 text-sm" placeholder="نص العرض أو الطلب" />
          <CorrespondenceAttachmentPicker attachments={attachments} onChange={setAttachments} disabled={create.isPending} />
        </div>
        {capabilities.canChooseRouting && <fieldset className="mt-4 rounded-xl bg-[#f8f7f2] p-3"><legend className="px-1 text-xs font-bold text-[#53675d]">النسخ الإدارية والتسلسل</legend><p className="mb-2 text-[11px] leading-5 text-[#7a887f]">يبدأ النسخ من الرئيس والرئيس المساعد وأمين المحكمة والموارد البشرية بحسب التسلسل والصلاحية. عند اختيار قاضٍ كمستلم، تُضاف نسخة الرئيس تلقائياً.</p>{levels.data?.length ? <div className="mt-2 space-y-2">{levels.data.map(item => <label key={item.level.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 text-sm text-[#405a4e]"><input type="checkbox" checked={form.managerProfileIds.includes(item.level.managerProfileId)} onChange={() => toggleManager(item.level.managerProfileId)} /> <span>{item.level.sequenceOrder}. {item.level.title} — {item.managerName}{item.level.managerProfileId === Number(form.departmentManagerProfileId) ? " · مدير القسم" : ""}</span></label>)}</div> : <p className="mt-2 text-xs leading-5 text-[#8a6731]">لا يوجد تسلسل إداري مفعّل حالياً.</p>}</fieldset>}
        <Button disabled={create.isPending || people.isLoading || units.isLoading || !form.senderProfileId || !routingReady} className="mt-5 w-full bg-[#12352f] hover:bg-[#1d5245]">{create.isPending ? "جارٍ إنشاء المهمة…" : capabilities.isTrainee ? "إرسال الطلب" : "إرسال وإنشاء مهمة متابعة"}</Button>
        {(create.error || people.error || units.error || levels.error) && <p className="mt-3 flex gap-2 text-xs leading-6 text-[#a04a35]"><AlertCircle className="h-4 w-4 shrink-0" />{create.error?.message || people.error?.message || units.error?.message || levels.error?.message}</p>}
      </form>}
      <section className="rounded-[1.5rem] border border-[#e7e0d4] bg-white p-5 shadow-[0_10px_30px_rgba(30,51,42,0.05)]"><div className="flex items-center gap-2 text-[#12352f]"><ClipboardCheck className="h-5 w-5 text-[#b18448]" /><h2 className="font-bold">{capabilities.isTrainee ? "سجل طلباتي" : "سجل المراسلات والطلبات"}</h2></div>{correspondences.isLoading ? <p className="mt-5 text-sm text-[#738179]">جارٍ تحميل السجل…</p> : correspondences.data?.length ? <div className="mt-4 divide-y divide-[#eee8de]">{correspondences.data.map(item => <article key={item.correspondence.id} className="py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-[#29463b]">{item.correspondence.subject}</p><p className="mt-1 text-xs text-[#75837c]">المرسل: {item.senderName} · {item.correspondence.correspondenceType === "request" ? "طلب" : "مراسلة"} · المهمة المرتبطة: {item.correspondence.linkedTaskId || "—"}</p><p className="mt-2 text-sm leading-6 text-[#566a60]">{item.correspondence.body}</p></div><span className="rounded-full bg-[#edf3eb] px-3 py-1 text-xs font-bold text-[#386048]">{statusLabel(item.correspondence.status)}</span></div>{capabilities.canRoute && item.correspondence.status === "in_review" && <div className="mt-3 flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={route.isPending} onClick={() => route.mutate({ correspondenceId: item.correspondence.id, action: "forwarded" })}>تحويل للمستوى التالي</Button><Button type="button" size="sm" disabled={route.isPending} className="bg-[#12352f] hover:bg-[#1d5245]" onClick={() => route.mutate({ correspondenceId: item.correspondence.id, action: "approved" })}>اعتماد</Button><Button type="button" size="sm" variant="outline" disabled={route.isPending} onClick={() => route.mutate({ correspondenceId: item.correspondence.id, action: "returned" })}>إعادة</Button></div>}</article>)}</div> : <p className="mt-5 rounded-2xl border border-dashed border-[#d8d1c5] bg-[#fbfaf6] px-5 py-10 text-center text-sm leading-7 text-[#738179]">لا توجد مراسلات أو طلبات ظاهرة ضمن نطاقك.</p>}{(correspondences.error || route.error) && <p className="mt-4 flex gap-2 text-xs leading-6 text-[#a04a35]"><AlertCircle className="h-4 w-4 shrink-0" />{correspondences.error?.message || route.error?.message}</p>}</section>
    </div>
  </section>;
}
