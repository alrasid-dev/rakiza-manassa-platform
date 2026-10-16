// server/capabilities.ts
// حساب القدرات الفعلية لمستخدم: full_control → الكل، الأدوار → قدراتها، التفويضات → قدراتها.
import { ALL_CAPABILITIES, ROLE_CAPABILITIES, UNIVERSAL_CAPABILITIES, type Capability, type CourtRole } from "@shared/role-capabilities";
import type { AppPermission } from "./access-control";
import type { CapabilityDelegation } from "./platform-completion-service";

export function computeCapabilities(
  permission: AppPermission,
  roles: CourtRole[],
  delegations: CapabilityDelegation[],
): Capability[] {
  // المالك أو أي حامل full_control (عبر access_grants) → كل القدرات.
  if (permission === "full_control") return ALL_CAPABILITIES;
  const capabilities = new Set<Capability>();
  for (const role of roles) {
    for (const c of ROLE_CAPABILITIES[role] ?? []) capabilities.add(c);
  }
  for (const c of UNIVERSAL_CAPABILITIES) capabilities.add(c);
  for (const d of delegations) {
    if (d.capabilities?.mode === "all") {
      const sourceCaps = d.sourceRole ? ROLE_CAPABILITIES[d.sourceRole] ?? [] : [];
      for (const c of sourceCaps) capabilities.add(c);
    } else if (d.capabilities?.mode === "specific") {
      for (const c of d.capabilities.capabilities) capabilities.add(c);
    }
  }
  return Array.from(capabilities);
}