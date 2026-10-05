// client/src/lib/alert-tones.ts
// نغمات تنبيه عبر Web Audio API (OscillatorNode) — تعمل في الخلفية بخلاف <audio> HTML5.
// تعتمد AudioContext singleton يُعاد استخدامه، وتُحاط كل العمليات بـ try/catch كي لا تُسقط التطبيق.

let audioContext: AudioContext | null = null;

export type ToneId = "beep" | "double_beep" | "triple_beep" | "ascending" | "descending" | "urgent";

export const TONE_IDS: ToneId[] = ["beep", "double_beep", "triple_beep", "ascending", "descending", "urgent"];

export const TONE_LABELS: Record<ToneId, string> = {
  beep: "صفير واحد",
  double_beep: "صافرتان متتاليتان",
  triple_beep: "ثلاث صفيرات",
  ascending: "تصاعدي",
  descending: "تنازلي",
  urgent: "عاجل (خمس صفيرات)",
};

export function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  return audioContext;
}

export async function resumeAudioContext(): Promise<AudioContext | null> {
  const c = getAudioContext();
  if (c && c.state === "suspended") {
    try { await c.resume(); } catch { /* تجاهل */ }
  }
  return c;
}

export function isAudioSupported(): boolean {
  return getAudioContext() !== null;
}

export function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function scheduleBeep(ctx: AudioContext, volume: number, freq: number, start: number, dur: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function scheduleSweep(ctx: AudioContext, volume: number, from: number, to: number, start: number, dur: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + dur);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

export async function playTone(toneId: ToneId, volume = 0.7): Promise<boolean> {
  try {
    const ctx = await resumeAudioContext();
    if (!ctx) return false;
    const v = clampVolume(volume);
    const t0 = ctx.currentTime + 0.01;
    switch (toneId) {
      case "beep":
        scheduleBeep(ctx, v, 880, t0, 0.2);
        break;
      case "double_beep":
        scheduleBeep(ctx, v, 880, t0, 0.2);
        scheduleBeep(ctx, v, 880, t0 + 0.35, 0.2);
        break;
      case "triple_beep":
        scheduleBeep(ctx, v, 880, t0, 0.2);
        scheduleBeep(ctx, v, 880, t0 + 0.35, 0.2);
        scheduleBeep(ctx, v, 880, t0 + 0.7, 0.2);
        break;
      case "ascending":
        scheduleSweep(ctx, v, 600, 1200, t0, 0.5);
        break;
      case "descending":
        scheduleSweep(ctx, v, 1200, 600, t0, 0.5);
        break;
      case "urgent":
        for (let i = 0; i < 5; i += 1) scheduleBeep(ctx, v, 880, t0 + i * 0.18, 0.1);
        break;
      default:
        return false;
    }
    return true;
  } catch {
    return false;
  }
}
