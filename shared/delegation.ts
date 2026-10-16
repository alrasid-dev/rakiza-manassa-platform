// shared/delegation.ts
// نموذج التفويض الموحّد المرن: قدرات (واحدة/عدة/الكل) × نطاق (عام/قسم/موظف) × مدة.
import { hasRoleCapability, isOwner, UNIVERSAL_CAPABILITIES, type Capability, type CourtRole } from "./role-capabilities";

export type DelegationScope =
  | { kind: "global" }                             // عام
  | { kind: "unit"; unitId: number }               // قسم محدد
  | { kind: "employee"; targetUserId: number };    // موظف محدد

export type DelegationCapabilities =
  | { mode: "specific"; capabilities: Capability[] } // قدرة | عدة
  | { mode: "all" };                                  // كل قدرات الدور المصدر

export type DelegationGrant = {
  grantorUserId: number;
  delegateUserId: number;
  sourceRole: CourtRole | null; // الدور المصدر (للتدقيق + التحقق)
  capabilities: DelegationCapabilities;
  scope: DelegationScope;
  startsAt: Date;
  endsAt: Date;
  title: string;
  notes?: string;
};

/** هل التفويض نشط الآن؟ (startsAt <= now < endsAt). */
export function isDelegationActive(d: { startsAt: Date; endsAt: Date }, now = new Date()): boolean {
  return d.startsAt <= now && d.endsAt > now;
}

/** هل يغطي نطاق التفويض السياق المطلوب؟ */
export function withinScope(scope: DelegationScope, context: { unitId?: number; targetUserId?: number }): boolean {
  if (scope.kind === "global") return true;
  if (scope.kind === "unit") return context.unitId === scope.unitId;
  if (scope.kind === "employee") return context.targetUserId === scope.targetUserId;
  return false;
}

/** الفحص الكامل: المالك → true، ثم الأدوار الذاتية، ثم التفويضات النشطة (ضمن النطاق). */
export function hasCapability(
  email: string | null | undefined,
  roles: CourtRole[],
  activeDelegations: DelegationGrant[],
  capability: Capability,
  context?: { unitId?: number; targetUserId?: number },
): boolean {
  if (isOwner(email)) return true;
  if (UNIVERSAL_CAPABILITIES.includes(capability)) return true;
  if (hasRoleCapability(roles, capability)) return true;
  return activeDelegations.some(
    (d) =>
      isDelegationActive(d) &&
      withinScope(d.scope, context ?? {}) &&
      (d.capabilities.mode === "all" || d.capabilities.capabilities.includes(capability)),
  );
}
