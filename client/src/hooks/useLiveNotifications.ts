// client/src/hooks/useLiveNotifications.ts
// إشعارات فورية: يجرّب SSE (EventSource) محلياً، ويعتمد على polling (refetchInterval) كاحتياطي على Vercel.
import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { playTone } from "@/lib/alert-tones";
import { useNotificationPreferences } from "./useNotificationPreferences";

export function useLiveNotifications() {
  const { prefs } = useNotificationPreferences();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    let failures = 0;
    let es: EventSource | null = null;

    const connect = () => {
      es = new EventSource("/api/sse/notifications");
      es.onmessage = (event) => {
        failures = 0;
        try {
          const payload = JSON.parse(event.data) as { type?: string };
          if (payload.type === "attendance_confirmation") {
            void playTone(prefs.toneId, prefs.volume);
          }
          void (utils.court.attendance as any).pendingAssignment?.invalidate?.();
        } catch { /* تجاهل */ }
      };
      es.onerror = () => {
        failures += 1;
        // بعد 3 فشل متتالٍ نغلق EventSource ونترك polling يعمل.
        if (failures >= 3) { es?.close(); es = null; }
      };
    };

    connect();
    return () => { es?.close(); };
  }, [prefs.toneId, prefs.volume, utils]);
}
