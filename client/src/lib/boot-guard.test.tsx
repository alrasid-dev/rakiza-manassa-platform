// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bootGuardSource = readFileSync(path.resolve(process.cwd(), "client/public/boot-guard.js"), "utf8");

type GuardWindow = Window & typeof globalThis & {
  __RAKIZA_BOOT_GUARD__?: { failed?: boolean; reason?: string; show?: (reason?: string) => void; heal?: () => void };
  rakizaSelfHeal?: () => void;
  RAKIZA_BOOT_TIMEOUT_MS?: number;
  caches?: { keys: () => Promise<string[]>; delete: (key: string) => Promise<boolean> };
};

function installGuard() {
  (window as GuardWindow).eval(bootGuardSource);
}

function overlay() {
  return document.querySelector("[data-rakiza-boot-guard]");
}

function resetWindow() {
  delete (window as GuardWindow).__RAKIZA_BOOT_GUARD__;
  delete (window as GuardWindow).rakizaSelfHeal;
  delete (window as GuardWindow).RAKIZA_BOOT_TIMEOUT_MS;
  delete (window as GuardWindow & { __RAKIZA_APP_MOUNTED__?: boolean }).__RAKIZA_APP_MOUNTED__;
  document.querySelectorAll("[data-rakiza-boot-guard]").forEach(node => node.remove());
  window.sessionStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
}

beforeEach(() => {
  resetWindow();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetWindow();
});

describe("حارس الإقلاع: يمنع الشاشة البيضاء الصامتة", () => {
  it("يُثبّت نفسه ويكشف إجراء الإصلاح الذاتي", () => {
    installGuard();
    expect((window as GuardWindow).__RAKIZA_BOOT_GUARD__).toBeTruthy();
    expect(typeof (window as GuardWindow).rakizaSelfHeal).toBe("function");
    expect(overlay()).toBeNull();
  });

  it("يعرض بطاقة عربية واضحة إن لم تُرسم الواجهة خلال المهلة", () => {
    vi.useFakeTimers();
    (window as GuardWindow).RAKIZA_BOOT_TIMEOUT_MS = 3000;
    installGuard();
    expect(overlay()).toBeNull();
    vi.advanceTimersByTime(3100);
    const box = overlay();
    expect(box).not.toBeNull();
    expect(box!.textContent).toContain("تعذّر تحميل المنصة على هذا الجهاز");
    expect(box!.textContent).toContain("إصلاح تلقائي");
    expect(box!.textContent).toContain("لم تُرسم واجهة المنصة خلال 3 ثانية");
  });

  it("لا يعرض أي بطاقة عندما تُرسم الواجهة بنجاح", () => {
    vi.useFakeTimers();
    (window as GuardWindow).RAKIZA_BOOT_TIMEOUT_MS = 3000;
    document.getElementById("root")!.innerHTML = "<main>لوحة القيادة</main>";
    installGuard();
    vi.advanceTimersByTime(4000);
    expect(overlay()).toBeNull();
    expect((window as GuardWindow).__RAKIZA_BOOT_GUARD__?.failed).toBeUndefined();
  });

  it("يعتمد إشارة الإقلاع من التطبيق حتى لو كان الجذر فارغاً لحظياً", () => {
    vi.useFakeTimers();
    (window as GuardWindow).RAKIZA_BOOT_TIMEOUT_MS = 3000;
    (window as GuardWindow & { __RAKIZA_APP_MOUNTED__?: boolean }).__RAKIZA_APP_MOUNTED__ = true;
    installGuard();
    vi.advanceTimersByTime(4000);
    expect(overlay()).toBeNull();
  });

  it("يفسّر خطأ MIME (استلام HTML مكان JavaScript) ويعالج نفسه مرة واحدة", async () => {
    const deleted: string[] = [];
    (window as GuardWindow).caches = {
      keys: async () => ["rakiza-shell-v1", "old-assets"],
      delete: async (key: string) => {
        deleted.push(key);
        return true;
      },
    };
    installGuard();
    const failure = new Error("Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of \"text/html\".");
    window.dispatchEvent(new ErrorEvent("error", { error: failure, message: failure.message }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const box = overlay();
    expect(box).not.toBeNull();
    expect(box!.textContent).toContain("استلم المتصفح صفحة HTML");
    expect(deleted).toEqual(["rakiza-shell-v1", "old-assets"]);

    deleted.length = 0;
    window.dispatchEvent(new ErrorEvent("error", { error: failure, message: failure.message }));
    await Promise.resolve();
    expect(deleted).toEqual([]);
  });

  it("يرصد أخطاء الوحدات غير المعالَجة (unhandledrejection)", () => {
    installGuard();
    const event = new Event("unhandledrejection") as Event & { reason?: unknown };
    event.reason = new Error("Failed to fetch dynamically imported module: /assets/chunk-old.js");
    window.dispatchEvent(event);
    const box = overlay();
    expect(box).not.toBeNull();
    expect(box!.textContent).toContain("استلم المتصفح صفحة HTML");
  });

  it("لا يعرض بطاقة لأخطاء عادية عندما تكون الواجهة مرسومة", () => {
    document.getElementById("root")!.innerHTML = "<main>لوحة القيادة</main>";
    installGuard();
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("ResizeObserver loop limit exceeded"), message: "ResizeObserver loop limit exceeded" }));
    expect(overlay()).toBeNull();
    expect((window as GuardWindow).__RAKIZA_BOOT_GUARD__?.failed).toBeUndefined();
  });

  it("يعرض بطاقة بتفصيل تقني إذا فشلت الواجهة لسبب غير معروف وجذرها فارغ", () => {
    installGuard();
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("Cannot read properties of undefined (reading 'id')"), message: "Cannot read properties of undefined (reading 'id')" }));
    const box = overlay();
    expect(box).not.toBeNull();
    expect(box!.textContent).toContain("تفصيل تقني");
  });
});
