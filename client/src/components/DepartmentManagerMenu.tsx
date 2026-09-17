import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { LayoutDashboard, PlusCircle, UsersRound, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export function canOpenDepartmentMenu(permission: string | null | undefined, roles: string[] | undefined) {
  return permission === "full_control" || (roles ?? []).some(role => ["department_manager", "court_president", "court_secretary", "human_resources_manager"].includes(role));
}

export default function DepartmentManagerMenu({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const permission = trpc.court.registration.myPermission.useQuery();
  const roles = trpc.court.myRoles.useQuery();
  const allowed = canOpenDepartmentMenu(permission.data, roles.data);
  const isSecretary = permission.data === "full_control" || Boolean(roles.data?.includes("court_secretary"));
  const units = trpc.court.units.list.useQuery(undefined, { enabled: allowed });
  const people = trpc.court.people.list.useQuery({ personType: "administrative" }, { enabled: allowed });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", taskType: "permanent" as "permanent" | "urgent", priority: "normal" as "normal" | "high" | "critical", unitId: "", assigneeProfileIds: [] as number[], scheduledFor: "", dueAt: "" });
  const createDepartmentProcedure = (trpc.court as any).tasks?.createDepartment;
  const createDepartment = createDepartmentProcedure?.useMutation
    ? createDepartmentProcedure.useMutation({
        onSuccess: (result: { count: number }) => { utils.court.tasks.list.invalidate(); setOpen(false); setForm({ title: "", taskType: "permanent", priority: "normal", unitId: "", assigneeProfileIds: [], scheduledFor: "", dueAt: "" }); toast.success(`تم إنشاء ${result.count} مهمة وإسنادها للموظفين.`); },
        onError: (error: { message?: string }) => toast.error(error.message || "تعذر إنشاء مهام القسم."),
      })
    : { isPending: false, mutate: () => undefined };
  if (!allowed) return null;
  const toggleAssignee = (id: number) => setForm(current => ({ ...current, assigneeProfileIds: current.assigneeProfileIds.includes(id) ? current.assigneeProfileIds.filter(item => item !== id) : [...current.assigneeProfileIds, id] }));
  const submit = () => {
    if (!form.title.trim()) return toast.error("اكتب عنوان المهمة.");
    if (!form.unitId) return toast.error("اختر القسم.");
    if (!form.assigneeProfileIds.length) return toast.error("اختر موظفاً واحداً على الأقل.");
    if (!form.scheduledFor || !form.dueAt) return toast.error("حدد وقت البدء والتسليم.");
    createDepartment.mutate({ title: form.title.trim(), unitId: Number(form.unitId), assigneeProfileIds: form.assigneeProfileIds, taskType: form.taskType, priority: form.priority, scheduledFor: new Date(form.scheduledFor), dueAt: new Date(form.dueAt) });
  };
  const buttonClass = variant === "dark" ? "border-white/10 text-[#cfe3c6] hover:bg-white/10" : "border-[#d9e4d7] text-[#2d6b4f] hover:bg-[#dce9da]";
  return (
    <div className="mt-4">
      <p className="text-[11px] font-black tracking-[0.12em] text-[#b18448]">إدارة القسم</p>
      <div className="mt-2 grid gap-2">
        <button type="button" onClick={() => setLocation("/")} title="لوحة تحكم القسم" aria-label="لوحة تحكم القسم" className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold ${buttonClass}`}><LayoutDashboard className="h-4 w-4" />لوحة تحكم القسم</button>
        <button type="button" onClick={() => setOpen(true)} title="إضافة مهام القسم" aria-label="إضافة مهام القسم" className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold ${buttonClass}`}><PlusCircle className="h-4 w-4" />إضافة مهام القسم</button>
        <button type="button" onClick={() => setLocation("/tasks")} title="إسناد وسحب المهام" aria-label="إسناد وسحب المهام" className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold ${buttonClass}`}><UsersRound className="h-4 w-4" />إسناد وسحب المهام</button>
        {isSecretary && <button type="button" onClick={() => toast.info("إدارة التكاليف قيد التطوير.")} title="إدارة التكاليف" aria-label="إدارة التكاليف" className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold ${buttonClass}`}><Wallet className="h-4 w-4" />إدارة التكاليف</button>}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-lg border-[#cfd7ca] bg-[#fbfaf6]">
          <DialogHeader>
            <DialogTitle>إضافة مهام القسم</DialogTitle>
            <DialogDescription>أنشئ مهام دائمة أو طارئة وأسندها لموظف واحد أو أكثر داخل القسم، مع تحديد وقت البدء والتسليم بدقة.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-xs font-bold text-[#6a786f]">عنوان المهمة<input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm" placeholder="مثال: إعداد تقرير شهري" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-bold text-[#6a786f]">نوع المهمة<select value={form.taskType} onChange={event => setForm({ ...form, taskType: event.target.value as "permanent" | "urgent" })} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="permanent">دائمة</option><option value="urgent">طارئة</option></select></label>
              <label className="block text-xs font-bold text-[#6a786f]">الأولوية<select value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value as "normal" | "high" | "critical" })} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="normal">عادية</option><option value="high">عالية</option><option value="critical">حرجة</option></select></label>
            </div>
            <label className="block text-xs font-bold text-[#6a786f]">القسم<select value={form.unitId} onChange={event => setForm({ ...form, unitId: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="">اختر القسم</option>{units.data?.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-bold text-[#6a786f]">وقت البدء<input type="datetime-local" value={form.scheduledFor} onChange={event => setForm({ ...form, scheduledFor: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm" /></label>
              <label className="block text-xs font-bold text-[#6a786f]">وقت التسليم<input type="datetime-local" value={form.dueAt} onChange={event => setForm({ ...form, dueAt: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm" /></label>
            </div>
            <div>
              <p className="text-xs font-bold text-[#6a786f]">الموظفون المسندة إليهم</p>
              <div className="mt-1 flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-md border border-input bg-white p-2">{people.data?.filter(person => person.userId).map(person => { const selected = form.assigneeProfileIds.includes(person.id); return <button key={person.id} type="button" onClick={() => toggleAssignee(person.id)} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${selected ? "bg-[#12352f] text-white" : "bg-[#eef2ec] text-[#486455]"}`}>{person.fullName}</button>; })}</div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-[#c6d4c7] px-3 py-2 text-xs font-black text-[#355d4b]">إلغاء</button>
            <button type="button" disabled={createDepartment.isPending} onClick={submit} className="rounded-lg bg-[#12352f] px-3 py-2 text-xs font-black text-white disabled:opacity-60">{createDepartment.isPending ? "جارٍ الإنشاء…" : "إنشاء وإسناد"}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
