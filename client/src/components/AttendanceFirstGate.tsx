import { Clock3, LogIn, LogOut } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type AttendanceRecord = { attendance: { checkInAt?: Date | string | null; checkOutAt?: Date | string | null; recordDate: Date | string } };
type AttendanceWindow = { kind: "none" | "check_in" | "check_out"; shiftName: string | null };
type GateBlockingState = { isBlocking: boolean };

function isToday(recordDate: Date | string) {
  return new Date(recordDate).toDateString() === new Date().toDateString();
}

export default function AttendanceFirstGate({ onComplete, onBlockingChange }: { onComplete: () => void; onBlockingChange?: (state: GateBlockingState) => void }) {
  const utils = trpc.useUtils();
  const attendanceApi = (trpc.court as any).attendance;
  const self = attendanceApi?.self?.useQuery ? attendanceApi.self.useQuery() : { data: null };
  const attendance = attendanceApi?.list?.useQuery ? attendanceApi.list.useQuery() : { data: [] as AttendanceRecord[], isLoading: false };
  const currentWindow = attendanceApi?.currentWindow?.useQuery ? attendanceApi.currentWindow.useQuery() : { data: { kind: "none", shiftName: null } as AttendanceWindow };
  const holidayInfo = (trpc.court as any).holidays?.today?.useQuery ? (trpc.court as any).holidays.today.useQuery() : { data: null as { workHours?: { start: string; end: string }; isRamadan?: boolean } | null };
  const [open, setOpen] = useState(false);

  const action = useMemo(() => {
    const windowState = currentWindow.data as AttendanceWindow | undefined;
    const todayRecord = (attendance.data as AttendanceRecord[] | undefined)?.find(item => isToday(item.attendance.recordDate));
    if (!self.data || attendance.isLoading || !windowState || windowState.kind === "none") return null;
    if (windowState.kind === "check_in" && !todayRecord?.attendance.checkInAt) return { kind: "check_in" as const, shiftName: windowState.shiftName };
    if (windowState.kind === "check_out" && todayRecord?.attendance.checkInAt && !todayRecord.attendance.checkOutAt) return { kind: "check_out" as const, shiftName: windowState.shiftName };
    return null;
  }, [attendance.data, attendance.isLoading, currentWindow.data, self.data]);

  const promptKey = action && typeof window !== "undefined" ? `rakiza:attendance:${new Date().toLocaleDateString("en-CA")}:${action.kind}` : null;
  const complete = () => {
    if (promptKey && typeof window !== "undefined") window.sessionStorage.setItem(promptKey, "dismissed");
    setOpen(false);
    void (utils.court as any).attendance?.list.invalidate();
    void (utils.court as any).attendance?.currentWindow.invalidate();
    onComplete();
  };
  const showError = (error: { message: string }) => toast.error(error.message || "تعذر حفظ الحضور. حاول مرة أخرى.");
  const record = attendanceApi?.record?.useMutation ? attendanceApi.record.useMutation({ onSuccess: complete, onError: showError }) : { mutate: () => undefined, isPending: false };
  const checkout = attendanceApi?.checkout?.useMutation ? attendanceApi.checkout.useMutation({ onSuccess: complete, onError: showError }) : { mutate: () => undefined, isPending: false };
  useEffect(() => {
    if (!promptKey || typeof window === "undefined") { setOpen(false); return; }
    setOpen(window.sessionStorage.getItem(promptKey) !== "dismissed");
  }, [promptKey]);

  const isResolving = Boolean(self.isLoading || attendance.isLoading || currentWindow.isLoading);
  const isBlocking = isResolving || Boolean(open && action && self.data);
  useEffect(() => {
    onBlockingChange?.({ isBlocking });
  }, [isBlocking, onBlockingChange]);

  if (!open || !action || !self.data) return null;
  const isCheckIn = action.kind === "check_in";
  const pending = isCheckIn ? record.isPending : checkout.isPending;
  const dismiss = () => { if (promptKey) window.sessionStorage.setItem(promptKey, "dismissed"); setOpen(false); };
  const submit = () => {
    if (isCheckIn) record.mutate({ profileId: self.data.id, recordDate: new Date(), status: "present", note: "تأكيد حضور ضمن نافذة الوردية عبر ركيزة" });
    else checkout.mutate();
  };
  const Icon = isCheckIn ? LogIn : LogOut;
  return <div role="dialog" aria-modal="true" aria-labelledby="attendance-gate-title" className="fixed inset-0 z-[60] grid place-items-center bg-[#14251c]/40 p-4"><section dir="rtl" className="w-full max-w-md rounded-[1.6rem] bg-[#f8f8f3] p-6 shadow-2xl"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#2d6b4f] text-white"><Clock3 className="h-5 w-5" /></span><div><p className="text-xs font-black text-[#4a785a]">{isCheckIn ? "بداية الوردية" : "نهاية الوردية"}</p><h2 id="attendance-gate-title" className="text-xl font-black text-[#183d2d]">{isCheckIn ? "سجّل حضورك" : "سجّل انصرافك"}</h2></div></div><p className="mt-4 text-sm leading-7 text-[#5f7266]">{action.shiftName ? `نافذة ${action.shiftName} متاحة الآن.` : "نافذة الوردية متاحة الآن."} يُحفظ الوقت من ساعة المنصة، ولن تظهر هذه النافذة خارج وقت الحضور أو الانصراف.</p>{holidayInfo.data?.workHours ? <p className="mt-2 text-xs font-bold text-[#8a6731]">ساعات العمل اليوم: {holidayInfo.data.workHours.start} - {holidayInfo.data.workHours.end}{holidayInfo.data.isRamadan ? " (رمضان)" : ""}</p> : null}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={dismiss} className="rounded-lg border border-[#c5d4c5] px-3 py-2 text-sm font-bold text-[#315f49]">لاحقاً</button><button type="button" disabled={pending} onClick={submit} className="inline-flex items-center gap-2 rounded-lg bg-[#2d6b4f] px-3 py-2 text-sm font-black text-white"><Icon className="h-4 w-4" />{pending ? "جارٍ الحفظ…" : isCheckIn ? "تسجيل الحضور" : "تسجيل الانصراف"}</button></div></section></div>;
}
