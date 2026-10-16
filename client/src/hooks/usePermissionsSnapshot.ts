import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import type { Capability } from "@shared/role-capabilities";

/**
 * لقطة مستقرة لصلاحية المستخدم وأدواره وقدراته، تُحدَّث فقط عند نجاح الاستعلامات معًا،
 * فتمنع تذبذب الأزرار أثناء التحميل أو إعادة الجلب (بدل قراءة permission.data/roles.data مباشرة).
 */
export function usePermissionsSnapshot(enabled = true) {
  const permission = trpc.court.registration.myPermission.useQuery(undefined, { enabled });
  const roles = trpc.court.myRoles.useQuery(undefined, { enabled });
  const capabilities = trpc.court.myCapabilities.useQuery(undefined, { enabled });

  const [permissionSnapshot, setPermissionSnapshot] = useState<string | null>(null);
  const [rolesSnapshot, setRolesSnapshot] = useState<string[]>([]);
  const [capabilitiesSnapshot, setCapabilitiesSnapshot] = useState<Capability[]>([]);

  useEffect(() => {
    if (permission.isSuccess && roles.isSuccess) {
      setPermissionSnapshot(permission.data ?? null);
      setRolesSnapshot(roles.data ?? []);
    }
  }, [permission.isSuccess, roles.isSuccess, permission.data, roles.data]);

  useEffect(() => {
    if (capabilities.isSuccess) {
      setCapabilitiesSnapshot(capabilities.data ?? []);
    }
  }, [capabilities.isSuccess, capabilities.data]);

  const can = useCallback(
    (capability: Capability) => capabilitiesSnapshot.includes(capability),
    [capabilitiesSnapshot],
  );

  return {
    permission: permissionSnapshot,
    roles: rolesSnapshot,
    isReady: permission.isSuccess && roles.isSuccess,
    capabilities: capabilitiesSnapshot,
    can,
  };
}
