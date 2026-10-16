import type { Capability } from "@shared/role-capabilities";

export type CorrespondencePermission = "full_control" | "general_view" | "employee" | "trainee" | null | undefined;

export function correspondenceRoleCapabilities(permission: CorrespondencePermission, capabilities: Capability[]) {
  const isTrainee = permission === "trainee";
  const isEmployee = permission === "employee";
  const canCreate = permission === "full_control" || isEmployee || isTrainee;
  const canChooseRouting = permission === "full_control" || capabilities.includes("manage_correspondence");
  const canRoute = permission === "full_control" || capabilities.includes("manage_correspondence");
  return { isTrainee, isEmployee, canCreate, canChooseRouting, canRoute };
}
