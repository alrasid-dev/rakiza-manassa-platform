// client/src/hooks/useNotificationPreferences.ts
// تفضيلات التنبيهات (نغمة + درجة صوت): تُقرأ من localStorage فوراً وتُزامن مع قاعدة البيانات عبر tRPC.

import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { type ToneId } from "@/lib/alert-tones";

const STORAGE_KEY = "rakiza:notification-preferences";

export type NotificationPreferences = { toneId: ToneId; volume: number };

const DEFAULT_PREFS: NotificationPreferences = { toneId: "double_beep", volume: 0.7 };

const clampVolume = (v: number) => Math.max(0, Math.min(1, v));

function readLocal(): NotificationPreferences {
  try {
    if (typeof window === "undefined") return DEFAULT_PREFS;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    return {
      toneId: parsed.toneId ?? DEFAULT_PREFS.toneId,
      volume: typeof parsed.volume === "number" ? clampVolume(parsed.volume) : DEFAULT_PREFS.volume,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writeLocal(prefs: NotificationPreferences) {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // تجاهل
  }
}

export function useNotificationPreferences() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(readLocal);
  const utils = trpc.useUtils();
  const remoteQuery = trpc.court.notificationPreferences.get.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const remoteSet = trpc.court.notificationPreferences.set.useMutation();

  useEffect(() => {
    if (remoteQuery.data) {
      const merged: NotificationPreferences = {
        toneId: remoteQuery.data.toneId as ToneId,
        volume: clampVolume(remoteQuery.data.volume),
      };
      setPrefs(merged);
      writeLocal(merged);
    }
  }, [remoteQuery.data]);

  const save = useCallback((next: NotificationPreferences) => {
    const clamped: NotificationPreferences = { toneId: next.toneId, volume: clampVolume(next.volume) };
    setPrefs(clamped);
    writeLocal(clamped);
    remoteSet.mutate(
      { toneId: clamped.toneId, volume: clamped.volume },
      { onSuccess: () => void utils.court.notificationPreferences.get.invalidate() },
    );
  }, [remoteSet, utils]);

  return { prefs, save };
}
