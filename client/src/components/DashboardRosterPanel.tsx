import { trpc } from "@/lib/trpc";
import { Building2, CircleDashed, UsersRound } from "lucide-react";
import { useLocation } from "wouter";

type Person = { id: number; fullName: string; unitName?: string | null; jobTitle?: string | null; personType?: string; status?: string };
type Unit = { id: number; name: string; isActive?: boolean };

/** قائمة منفصلة للموظفين والأقسام؛ البيانات من people.list / units.list وفق صلاحية الخادم. */
export default function DashboardRosterPanel() {
  const [, setLocation] = useLocation();
  const permission = trpc.court.registration.myPermission.useQuery();
  const roles = trpc.court.myRoles.useQuery();

  const isPrivileged = permission.data === "full_control" || permission.data === "general_view";
  const leadershipRoles = ["court_president", "assistant_president", "court_secretary"] as const;
  const managerRoles = ["human_resources_manager", "department_manager", "trainee_affairs_manager", "performance_monitor"] as const;

  // بطاقة «الموظفون»: للقيادة والموارد البشرية ومديري الأقسام.
  const canSeeEmployees = isPrivileged || (roles.data ?? []).some(role => [...leadershipRoles, ...managerRoles].includes(role as (typeof leadershipRoles)[number] | (typeof managerRoles)[number]));

  // بطاقة «الأقسام»: للمسؤولين والمدراء فقط (RBAC صارم — لا تظهر للموظف العادي).
  const canSeeDepartments = isPrivileged || (roles.data ?? []).some(role => [...leadershipRoles, ...managerRoles].includes(role as (typeof leadershipRoles)[number] | (typeof managerRoles)[number]));

  const peopleQuery = trpc.court.people.list.useQuery(undefined, { enabled: canSeeEmployees });
  const unitsQuery = trpc.court.units.list.useQuery(undefined, { enabled: canSeeDepartments });

  if (!canSeeEmployees && !canSeeDepartments) return null;

  const people = ((peopleQuery.data ?? []) as Person[]).filter(person => person.status !== "inactive").slice(0, 12);
  const units = ((unitsQuery.data ?? []) as Unit[]).filter(unit => unit.isActive !== false).slice(0, 12);

  return (
    <section aria-label="الموظفون والأقسام" className="mt-6 grid gap-4 lg:grid-cols-2">
      {canSeeEmployees && (
        <article className="rounded-2xl border border-[#cfd7ca] bg-white p-4 shadow-[0_8px_22px_rgba(36,67,51,0.04)]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#dce9da] text-[#2d6b4f]"><UsersRound className="h-4 w-4" /></span><div><h2 className="text-sm font-black text-[#25463a]">الموظفون</h2><p className="text-[10px] text-[#718078]">ضمن نطاق صلاحيتك فقط</p></div></div>
            <button type="button" onClick={() => setLocation("/people")} className="text-[11px] font-black text-[#2d6b4f]">الكل</button>
          </div>
          {peopleQuery.isLoading ? <p className="mt-4 flex items-center gap-2 text-xs text-[#718078]"><CircleDashed className="h-3.5 w-3.5 animate-spin" /> جارٍ التحميل…</p> : people.length ? (
            <ul className="mt-3 divide-y divide-[#ebe6dc]">
              {people.map(person => (
                <li key={person.id} className="flex items-center justify-between gap-2 py-2.5">
                  <span className="min-w-0"><span className="block truncate text-xs font-black text-[#29463b]">{person.fullName}</span><span className="mt-0.5 block truncate text-[10px] text-[#7a8980]">{person.jobTitle || person.personType || "موظف"} · {person.unitName || "بدون قسم"}</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-4 text-xs text-[#718078]">لا تظهر ملفات ضمن نطاقك حالياً.</p>}
        </article>
      )}
      {canSeeDepartments && (
        <article className="rounded-2xl border border-[#cfd7ca] bg-white p-4 shadow-[0_8px_22px_rgba(36,67,51,0.04)]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#efe4c0] text-[#80642b]"><Building2 className="h-4 w-4" /></span><div><h2 className="text-sm font-black text-[#25463a]">الأقسام</h2><p className="text-[10px] text-[#718078]">وحدات مسجّلة في النظام</p></div></div>
            <button type="button" onClick={() => setLocation("/hierarchy")} className="text-[11px] font-black text-[#2d6b4f]">الهيكل</button>
          </div>
          {unitsQuery.isLoading ? <p className="mt-4 flex items-center gap-2 text-xs text-[#718078]"><CircleDashed className="h-3.5 w-3.5 animate-spin" /> جارٍ التحميل…</p> : units.length ? (
            <ul className="mt-3 divide-y divide-[#ebe6dc]">
              {units.map(unit => (
                <li key={unit.id} className="flex items-center justify-between gap-2 py-2.5">
                  <button type="button" onClick={() => setLocation(`/hierarchy?unitId=${unit.id}`)} className="truncate text-xs font-black text-[#29463b] hover:text-[#2d6b4f]">{unit.name}</button>
                </li>
              ))}
            </ul>
          ) : <p className="mt-4 text-xs text-[#718078]">لا توجد أقسام ظاهرة ضمن نطاقك.</p>}
        </article>
      )}
    </section>
  );
}
