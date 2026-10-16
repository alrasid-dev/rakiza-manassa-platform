import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

/**
 * لقطة مستقرة لصلاحية المستخدم وأدواره، تُحدَّث فقط عند نجاح الاستعلامَين معًا،
 * فتمنع تذبذب الأزرار أثناء التحميل أو إعادة الجلب (بدل قراءة permission.data/roles.data مباشرة).
 */
export function usePermissionsSnapshot(enabled = true) {
  const permission = trpc.court.registration.myPermission.useQuery(undefined, { enabled });
  const roles = trpc.court.myRoles.useQuery(undefined, { enabled });

  const [permissionSnapshot, setPermissionSnapshot] = useState<string | null>(null);
  const [rolesSnapshot, setRolesSnapshot] = useState<string[]>([]);

  useEffect(() => {
    if (permission.isSuccess && roles.isSuccess) {
      setPermissionSnapshot(permission.data ?? null);
      setRolesSnapshot(roles.data ?? []);
    }
  }, [permission.isSuccess, roles.isSuccess, permission.data, roles.data]);

  return {
    permission: permissionSnapshot,
    roles: rolesSnapshot,
    isReady: permission.isSuccess && roles.isSuccess,
  };
}
