// client/src/lib/audio-unlock.ts
// يفكّ قفل التشغيل التلقائي للصوت بعد أول تفاعل مستخدم (قيود Autoplay في المتصفحات).

import { getAudioContext, resumeAudioContext } from "./alert-tones";

const UNLOCK_FLAG = "rakiza_audio_unlocked";

export function isAudioUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(UNLOCK_FLAG) === "true";
  } catch {
    return false;
  }
}

export async function unlockAudio(): Promise<void> {
  if (typeof window === "undefined") return;
  if (isAudioUnlocked()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    await resumeAudioContext();
    // تشغيل oscillator صامت (gain=0) لتفعيل سياق الصوت.
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(0);
    osc.stop(0.01);
    window.localStorage.setItem(UNLOCK_FLAG, "true");
  } catch {
    // تجاهل: سيُحاول الفتح عند التفاعل التالي.
  }
}
