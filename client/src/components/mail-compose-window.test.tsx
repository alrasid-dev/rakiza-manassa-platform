// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MailComposeWindow, {
  COMPOSE_MIN_SIZE,
  COMPOSE_STORAGE_KEY,
  clampComposeSize,
  isComposeSaveShortcut,
  isComposeSubmitShortcut,
  nextComposeSizeFromDrag,
  readStoredComposeSize,
  storeComposeSize,
} from "./MailComposeWindow";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderWindow(
  overrides: Partial<React.ComponentProps<typeof MailComposeWindow>> = {}
) {
  const handlers = {
    onSend: vi.fn(),
    onSaveDraft: vi.fn(),
    onOpenChange: vi.fn(),
  };
  render(
    <MailComposeWindow
      open
      title="رسالة بريد ركيزة جديدة"
      subtitle="مسودة داخلية"
      {...handlers}
      {...overrides}
    >
      <input aria-label="الموضوع" placeholder="الموضوع" />
    </MailComposeWindow>
  );
  return handlers;
}

const hasPointerEvent = () =>
  typeof window !== "undefined" && "PointerEvent" in window;
const fireDown = (element: Element, init: Record<string, number>) =>
  hasPointerEvent()
    ? fireEvent.pointerDown(element, init)
    : fireEvent.mouseDown(element, init);
const fireMove = (init: Record<string, number>) =>
  hasPointerEvent()
    ? fireEvent.pointerMove(window, init)
    : fireEvent.mouseMove(window, init);
const fireUp = () =>
  hasPointerEvent()
    ? fireEvent.pointerUp(window, {})
    : fireEvent.mouseUp(window, {});

describe("حسابات نافذة الكتابة", () => {
  it("يقصّ الحجم داخل حدود الشاشة مع حدّ أدنى مقروء", () => {
    const viewport = { width: 1000, height: 700 };
    expect(clampComposeSize({ width: 200, height: 100 }, viewport)).toEqual({
      width: COMPOSE_MIN_SIZE.width,
      height: COMPOSE_MIN_SIZE.height,
    });
    expect(clampComposeSize({ width: 5000, height: 5000 }, viewport)).toEqual({
      width: 1000 - 48,
      height: 700 - 48,
    });
    expect(clampComposeSize({}, viewport).width).toBe(COMPOSE_MIN_SIZE.width);
  });

  it("يحسب التوسيع RTL: السحب لليسار يزيد العرض والسحب للأسفل يزيد الارتفاع", () => {
    const start = { width: 700, height: 500 };
    expect(
      nextComposeSizeFromDrag(
        start,
        { dx: -120, dy: 0 },
        { width: 1600, height: 900 }
      )
    ).toEqual({ width: 820, height: 500 });
    expect(
      nextComposeSizeFromDrag(
        start,
        { dx: 0, dy: 90 },
        { width: 1600, height: 900 }
      )
    ).toEqual({ width: 700, height: 590 });
    expect(
      nextComposeSizeFromDrag(
        start,
        { dx: 1000, dy: -1000 },
        { width: 1600, height: 900 }
      ).width
    ).toBe(COMPOSE_MIN_SIZE.width);
  });

  it("يميّز اختصارات الإرسال والحفظ", () => {
    expect(isComposeSubmitShortcut({ key: "Enter", ctrlKey: true })).toBe(true);
    expect(isComposeSubmitShortcut({ key: "Enter", metaKey: true })).toBe(true);
    expect(isComposeSubmitShortcut({ key: "Enter" })).toBe(false);
    expect(isComposeSaveShortcut({ key: "s", ctrlKey: true })).toBe(true);
    expect(isComposeSaveShortcut({ key: "S", metaKey: true })).toBe(true);
    expect(isComposeSaveShortcut({ key: "a", ctrlKey: true })).toBe(false);
  });

  it("يقرأ الحجم المحفوظ ويتجاهل القيم المعطوبة", () => {
    const viewport = { width: 1200, height: 800 };
    storeComposeSize(window.localStorage, { width: 640, height: 480 });
    expect(window.localStorage.getItem(COMPOSE_STORAGE_KEY)).toContain("640");
    expect(readStoredComposeSize(window.localStorage, viewport)).toEqual({
      width: 640,
      height: 480,
    });
    window.localStorage.setItem(COMPOSE_STORAGE_KEY, "not-json");
    expect(readStoredComposeSize(window.localStorage, viewport)).toEqual(
      clampComposeSize({}, viewport)
    );
    window.localStorage.setItem(
      COMPOSE_STORAGE_KEY,
      JSON.stringify({ width: 9000, height: 9000 })
    );
    expect(readStoredComposeSize(window.localStorage, viewport)).toEqual({
      width: 1152,
      height: 752,
    });
  });
});

describe("نافذة الكتابة المرنة (Outlook Clone)", () => {
  it("لا تُرسم شيئاً عندما تكون مغلقة", () => {
    render(
      <MailComposeWindow
        open={false}
        title="رسالة"
        onOpenChange={vi.fn()}
        onSend={vi.fn()}
        onSaveDraft={vi.fn()}
      >
        محتوى
      </MailComposeWindow>
    );
    expect(screen.queryByTestId("mail-compose-window")).toBeNull();
  });

  it("تفتح كنافذة حوار مرنة قابلة للتحجيم مع حقول المحتوى", () => {
    renderWindow();
    const frame = screen.getByTestId("mail-compose-window");
    expect(frame.getAttribute("role")).toBe("dialog");
    expect(frame.getAttribute("data-resizable")).toBe("true");
    expect(frame.getAttribute("data-maximized")).toBe("false");
    expect(frame.getAttribute("data-collapsed")).toBe("false");
    expect(frame.className).toContain("max-w-5xl");
    expect(screen.getByLabelText("تحجيم نافذة الكتابة")).toBeTruthy();
    expect(screen.getByPlaceholderText("الموضوع")).toBeTruthy();
    expect(screen.getByLabelText("تصغير نافذة الكتابة")).toBeTruthy();
    expect(screen.getByLabelText("تكبير نافذة الكتابة")).toBeTruthy();
    expect(screen.getByLabelText("إغلاق نافذة الكتابة")).toBeTruthy();
  });

  it("توسّع وتضيّق بالأسهم من مقبض التحجيم وتُخزّن الحجم", () => {
    renderWindow();
    const frame = screen.getByTestId("mail-compose-window") as HTMLElement;
    const handle = screen.getByLabelText("تحجيم نافذة الكتابة");
    const startWidth = Number(frame.style.width.replace("px", ""));
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(Number(frame.style.width.replace("px", ""))).toBe(startWidth + 40);
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(Number(frame.style.width.replace("px", ""))).toBe(startWidth);
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(window.localStorage.getItem(COMPOSE_STORAGE_KEY)).not.toBeNull();
  });

  it("تكبر وتصغر وتستعيد الحجم، وتُخفي المحتوى عند التصغير", () => {
    renderWindow();
    const frame = screen.getByTestId("mail-compose-window");
    fireEvent.click(screen.getByLabelText("تكبير نافذة الكتابة"));
    expect(frame.getAttribute("data-maximized")).toBe("true");
    fireEvent.click(screen.getByLabelText("استعادة حجم نافذة الكتابة"));
    expect(frame.getAttribute("data-maximized")).toBe("false");
    fireEvent.click(screen.getByLabelText("تصغير نافذة الكتابة"));
    expect(frame.getAttribute("data-collapsed")).toBe("true");
    expect(screen.queryByTestId("mail-compose-body")).toBeNull();
    expect(screen.getByTestId("mail-compose-header")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("توسيع نافذة الكتابة"));
    expect(screen.getByTestId("mail-compose-body")).toBeTruthy();
  });

  it("يغيّر الحجم بالسحب من المقبض ويحفظه عند الانتهاء", () => {
    renderWindow();
    const frame = screen.getByTestId("mail-compose-window") as HTMLElement;
    const handle = screen.getByLabelText("تحجيم نافذة الكتابة");
    const startWidth = Number(frame.style.width.replace("px", ""));
    fireDown(handle, { clientX: 900, clientY: 500 });
    expect(handle.getAttribute("data-resizing")).toBe("true");
    fireMove({ clientX: 780, clientY: 560 });
    expect(Number(frame.style.width.replace("px", ""))).toBe(startWidth + 120);
    fireUp();
    expect(handle.getAttribute("data-resizing")).toBeNull();
    expect(window.localStorage.getItem(COMPOSE_STORAGE_KEY)).toContain(
      String(startWidth + 120)
    );
  });

  it("يرسل ويحفظ ويغلق بالاختصارات وزر الإغلاق", () => {
    const handlers = renderWindow();
    const frame = screen.getByTestId("mail-compose-window");
    fireEvent.keyDown(frame, { key: "Enter", ctrlKey: true });
    expect(handlers.onSend).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(frame, { key: "s", ctrlKey: true });
    expect(handlers.onSaveDraft).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(frame, { key: "Escape" });
    expect(handlers.onOpenChange).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "إرسال" }));
    expect(handlers.onSend).toHaveBeenCalledTimes(2);
  });

  it("يعرض شارات الحالة وأزرار الأطراف الإضافية", () => {
    renderWindow({
      isSending: true,
      isSaving: true,
      onSaveTemplate: vi.fn(),
      footerNote: "تُحفظ المسودة تلقائياً",
      headerExtras: <span data-testid="extra-slot" />,
    });
    expect(screen.getByText("جارٍ الإرسال…")).toBeTruthy();
    expect(screen.getByText("جارٍ الحفظ…")).toBeTruthy();
    expect(screen.getByText("تُحفظ المسودة تلقائياً")).toBeTruthy();
    expect(screen.getByTestId("extra-slot")).toBeTruthy();
    expect(screen.getByRole("button", { name: "حفظ قالب" })).toBeTruthy();
  });
});
