import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { UserPlus, UserX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/** هل يملك هذا الدور صلاحية إدارة تكليف المدراء (المالك / رئيس المحكمة / الأمين العام). */
export function canManageDepartmentDelegations(permission: string | null | undefined, roles: string[] | undefined) {
  return permission === "full_control" || (roles ?? []).some(role => role === "court_president" || role === "court_secretary");
}

/**
 * أيقونتان تفاعليتان لتكليف/إنهاء مدير قسم، تظهران فقط للمالك ورئيس المحكمة والأمين العام.
 * مربوطتان بمساري court.management.assign و court.management.end لتحديث الأدوار في قاعدة البيانات مباشرة.
 */
export default function DepartmentManagementActions({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const utils = trpc.useUtils();
  const permission = trpc.court.registration.myPermission.useQuery();
  const roles = trpc.court.myRoles.useQuery();
  const allowed = canManageDepartmentDelegations(permission.data, roles.data);

  const managers = trpc.court.management.list.useQuery(undefined, { enabled: allowed });
  const people = trpc.court.people.list.useQuery({ personType: "administrative" }, { enabled: allowed });
  const units = trpc.court.units.list.useQuery(undefined, { enabled: allowed });

  const assign = trpc.court.management.assign.useMutation({
    onSuccess: async () => { await utils.court.management.list.invalidate(); setAssignOpen(false); setAssignForm({ userId: "", unitId: "" }); toast.success("تم تكليف مدير القسم."); },
    onError: (error: { message?: string }) => toast.error(error.message || "تعذر حفظ التكليف."),
  });
  const end = trpc.court.management.end.useMutation({
    onSuccess: async () => { await utils.court.management.list.invalidate(); setEndOpen(false); setEndAssignmentId(""); toast.success("تم إنهاء تكليف إدارة القسم."); },
    onError: (error: { message?: string }) => toast.error(error.message || "تعذر إنهاء التكليف."),
  });

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ userId: "", unitId: "" });
  const [endOpen, setEndOpen] = useState(false);
  const [endAssignmentId, setEndAssignmentId] = useState("");

  if (!allowed) return null;

  const submitAssign = () => {
    if (!assignForm.userId || !assignForm.unitId) { toast.error("اختر الحساب والقسم معاً."); return; }
    assign.mutate({ userId: Number(assignForm.userId), unitId: Number(assignForm.unitId) });
  };
  const submitEnd = () => {
    if (!endAssignmentId) { toast.error("اختر التكليف النشط أولاً."); return; }
    end.mutate({ assignmentId: Number(endAssignmentId) });
  };

  const buttonClass = variant === "dark"
    ? "border-white/10 text-[#cfe3c6] hover:bg-white/10"
    : "border-[#d9e4d7] text-[#2d6b4f] hover:bg-[#dce9da]";


  return (
    <div className="mt-4">
      <p className="text-[11px] font-black tracking-[0.12em] text-[#b18448]">إدارة التكليفات</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setAssignOpen(true)} title="تكليف بإدارة إدارة" aria-label="تكليف بإدارة إدارة" className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-3 text-[11px] font-bold leading-4 ${buttonClass}`}>
          <UserPlus className="h-5 w-5" />
          تكليف بإدارة إدارة
        </button>
        <button type="button" onClick={() => setEndOpen(true)} title="إنهاء تكليف بإدارة إدارة" aria-label="إنهاء تكليف بإدارة إدارة" className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-3 text-[11px] font-bold leading-4 ${buttonClass}`}>
          <UserX className="h-5 w-5" />
          إنهاء تكليف بإدارة إدارة
        </button>
      </div>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent dir="rtl" className="border-[#cfd7ca] bg-[#fbfaf6]">
          <DialogHeader>
            <DialogTitle>تكليف بإدارة إدارة</DialogTitle>
            <DialogDescription>اختر الحساب والقسم لتكليف مدير قسم جديد. يُنهى تلقائياً أي تكليف نشط سابق على القسم نفسه.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-xs font-bold text-[#6a786f]">
              الحساب
              <select value={assignForm.userId} onChange={event => setAssignForm({ ...assignForm, userId: event.target.value })} className={inputClass}>
                <option value="">اختر الحساب</option>
                {people.data?.filter(person => person.userId).map(person => <option key={person.id} value={person.userId as number}>{person.fullName}{person.email ? ` · ${person.email}` : ""}</option>)}
              </select>
            </label>
            <label className="block text-xs font-bold text-[#6a786f]">
              القسم
              <select value={assignForm.unitId} onChange={event => setAssignForm({ ...assignForm, unitId: event.target.value })} className={inputClass}>
                <option value="">اختر القسم</option>
                {units.data?.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
            </label>
          </div>
          <DialogFooter className="gap-2">
            <button type="button" onClick={() => setAssignOpen(false)} className="rounded-lg border border-[#c6d4c7] px-3 py-2 text-xs font-black text-[#355d4b]">إلغاء</button>
            <button type="button" disabled={assign.isPending} onClick={submitAssign} className="rounded-lg bg-[#12352f] px-3 py-2 text-xs font-black text-white disabled:opacity-60">حفظ التكليف</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={endOpen} onOpenChange={setEndOpen}>
        <DialogContent dir="rtl" className="border-[#cfd7ca] bg-[#fbfaf6]">
          <DialogHeader>
            <DialogTitle>إنهاء تكليف بإدارة إدارة</DialogTitle>
            <DialogDescription>اختر تكليف مدير القسم النشط لإنهائه وإقالته من إدارة القسم.</DialogDescription>
          </DialogHeader>
          <select value={endAssignmentId} onChange={event => setEndAssignmentId(event.target.value)} className={inputClass}>
            <option value="">اختر التكليف النشط</option>
            {managers.data?.map(item => <option key={item.assignment.id} value={item.assignment.id}>{item.unitName ?? "قسم غير مسكن"} — {item.userName ?? item.userEmail ?? `حساب ${item.assignment.userId}`}</option>)}
          </select>
          {managers.data?.length === 0 && <p className="text-xs leading-6 text-[#8a6e32]">لا توجد تكليفات إدارة أقسام نشطة حالياً.</p>}
          <DialogFooter className="gap-2">
            <button type="button" onClick={() => setEndOpen(false)} className="rounded-lg border border-[#c6d4c7] px-3 py-2 text-xs font-black text-[#355d4b]">إلغاء</button>
            <button type="button" disabled={end.isPending} onClick={submitEnd} className="rounded-lg bg-[#8f2a22] px-3 py-2 text-xs font-black text-white disabled:opacity-60">إنهاء التكليف</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

  const inputClass = "mt-1 h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground";
