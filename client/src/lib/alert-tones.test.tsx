// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

class MockParam {
  setValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
}
class MockOscillator {
  type = "sine";
  frequency = new MockParam();
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class MockGain {
  gain = new MockParam();
  connect = vi.fn();
}
class MockAudioContext {
  state: AudioContextState = "running";
  currentTime = 0;
  destination = {} as AudioDestinationNode;
  createOscillator = vi.fn(() => new MockOscillator());
  createGain = vi.fn(() => new MockGain());
  resume = vi.fn(async () => { this.state = "running"; });
}

let instances: MockAudioContext[] = [];

beforeEach(() => {
  instances = [];
  const Ctor = vi.fn(() => { const c = new MockAudioContext(); instances.push(c); return c; });
  (window as unknown as { AudioContext: unknown }).AudioContext = Ctor;
  vi.resetModules();
});

describe("alert-tones", () => {
  it("AudioContext is created once and reused", async () => {
    const { getAudioContext } = await import("./alert-tones");
    const a = getAudioContext();
    const b = getAudioContext();
    expect(a).toBeTruthy();
    expect(a).toBe(b);
  });

  it("volume is clamped between 0 and 1", async () => {
    const { clampVolume } = await import("./alert-tones");
    expect(clampVolume(1.5)).toBe(1);
    expect(clampVolume(-0.5)).toBe(0);
    expect(clampVolume(0.5)).toBe(0.5);
  });

  it("playTone generates different waveforms per tone id", async () => {
    const { playTone } = await import("./alert-tones");
    await playTone("beep", 0.7);
    expect(instances[0].createOscillator).toHaveBeenCalledTimes(1);
    await playTone("urgent", 0.7);
    expect(instances[0].createOscillator).toHaveBeenCalledTimes(6); // 1 + 5 صفيرات
  });
});
