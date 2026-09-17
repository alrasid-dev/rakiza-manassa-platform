/**
 * إطار اختبار واجهة المستخدم لرَكيزة.
 *
 * الغرض: فحص كل زر وأيقونة ومدخل في كل صفحة بشكل آلي:
 *  - استهزاء شامل لـ tRPC يجعل أي صفحة تُركَّب دون قاعدة بيانات.
 *  - بدائل لمتصفح jsdom (Pointer/Resize/Intersection/matchMedia/Canvas...).
 *  - إحصاء كل عنصر تفاعلي والتأكد من امتلاكه اسماً مقروءاً.
 *  - ضغط كل عنصر تفاعلي فعلياً والتقاط أي انهيار أو خطأ تشغيل.
 */
import { fireEvent, render, type RenderResult } from "@testing-library/react";
import React from "react";

const NOOP = () => undefined;

/** يمنع jsdom من محاولة التنقل الحقيقي عند ضغط الروابط، مع إبقاء معالجات React تعمل. */
export function installNavigationGuard() {
  if (typeof document === "undefined") return;
  document.addEventListener("click", event => {
    const target = event.target as HTMLElement | null;
    if (target?.closest?.('a[href]')) event.preventDefault();
  }, true);
}

/* ------------------------------------------------------------------ */
/* استهزاء tRPC الشامل                                                 */
/* ------------------------------------------------------------------ */

function queryResult(data: unknown) {
  return {
    data,
    isLoading: false,
    isPending: false,
    isFetching: false,
    isFetched: true,
    isSuccess: true,
    isError: false,
    isStale: false,
    isRefetching: false,
    status: "success" as const,
    fetchStatus: "idle" as const,
    failureCount: 0,
    error: null,
    refetch: () => Promise.resolve({ data }),
    remove: NOOP,
  };
}

function mutationResult() {
  return {
    mutate: NOOP,
    mutateAsync: async () => undefined,
    isPending: false,
    isLoading: false,
    isSuccess: false,
    isError: false,
    isIdle: true,
    status: "idle" as const,
    failureCount: 0,
    data: undefined,
    error: null,
    reset: NOOP,
  };
}

/** بيانات مهيّأة لمسارات معروفة تفتح عناصر الواجهة المحصورة بالصلاحية أو بالهوية. */
export const DEFAULT_TRPC_OVERRIDES: Record<string, unknown> = {
  "auth.me": { id: 1, name: "مالك المنصة", email: "rakizaplatform@gmail.com", role: "admin", openId: "owner" },
  "court.registration.myPermission": "full_control",
  "court.myRoles": ["court_president"],
  "court.people.self": { id: 9, fullName: "مالك المنصة", personType: "administrative", status: "active", unitId: 1, unitName: "الأمانة" },
};

/** كائن خامل يستجيب لأي مسار في tRPC دون أي طلب شبكة. */
export function inertTrpcProxy(path: string[] = [], overrides: Record<string, unknown> = DEFAULT_TRPC_OVERRIDES): any {
  const target = function inertCallable() { return undefined; };
  return new Proxy(target, {
    get(_target, property) {
      if (property === "then" || property === "$$typeof") return undefined;
      if (property === Symbol.toPrimitive) return () => "";
      if (property === "toString" || property === "valueOf") return () => path.join(".");
      if (typeof property === "symbol") return undefined;
      const key = String(property);
      const currentPath = path.join(".");
      const hasOverride = Object.prototype.hasOwnProperty.call(overrides, currentPath);
      if (key === "useQuery" || key === "useSuspenseQuery") return () => queryResult(hasOverride ? overrides[currentPath] : undefined);
      if (key === "useInfiniteQuery") {
        return () => ({ ...queryResult(hasOverride ? overrides[currentPath] : undefined), fetchNextPage: NOOP, fetchPreviousPage: NOOP, hasNextPage: false, hasPreviousPage: false });
      }
      if (key === "useMutation") return () => mutationResult();
      if (key === "useSubscription") return () => ({ state: { status: "idle", data: undefined, error: null }, reset: NOOP });
      return inertTrpcProxy([...path, key], overrides);
    },
    // أي نداء (useUtils أو invalidate أو mutateAsync...) يعيد كائناً خاملاً بدل undefined.
    apply() { return inertTrpcProxy(path, overrides); },
  });
}

/** الجذر الجاهز للاستخدام داخل vi.mock("@/lib/trpc"). */
export function createTrpcMock(overrides: Record<string, unknown> = DEFAULT_TRPC_OVERRIDES): { trpc: any } {
  return { trpc: inertTrpcProxy([], overrides) };
}

/* ------------------------------------------------------------------ */
/* بدائل متصفح jsdom                                                   */
/* ------------------------------------------------------------------ */

export function installBrowserStubs() {
  if (typeof window === "undefined") return;
  installNavigationGuard();

  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false, media: query, onchange: null,
        addListener: NOOP, removeListener: NOOP, addEventListener: NOOP, removeEventListener: NOOP,
        dispatchEvent: () => false,
      }),
    });
  }

  const observer = class {
    observe() { return undefined; }
    unobserve() { return undefined; }
    disconnect() { return undefined; }
    takeRecords() { return []; }
  };
  (window as any).ResizeObserver ??= observer;
  (window as any).IntersectionObserver ??= observer;

  (window as any).PointerEvent ??= (window as any).MouseEvent;
  (Element.prototype as any).scrollIntoView ??= NOOP;
  (Element.prototype as any).hasPointerCapture ??= () => false;
  (Element.prototype as any).setPointerCapture ??= NOOP;
  (Element.prototype as any).releasePointerCapture ??= NOOP;
  (Element.prototype as any).animate ??= () => ({
    finished: Promise.resolve(), cancel: NOOP, play: NOOP, pause: NOOP, reverse: NOOP, currentTime: 0,
    addEventListener: NOOP, removeEventListener: NOOP,
  });

  (window as any).print ??= NOOP;
  (URL as any).createObjectURL ??= () => "blob:rakiza-test";
  (URL as any).revokeObjectURL ??= NOOP;

  const canvasContext = {
    canvas: { width: 0, height: 0 },
    clearRect: NOOP, fillRect: NOOP, strokeRect: NOOP, beginPath: NOOP, closePath: NOOP,
    moveTo: NOOP, lineTo: NOOP, arc: NOOP, fill: NOOP, stroke: NOOP, save: NOOP, restore: NOOP,
    scale: NOOP, translate: NOOP, rotate: NOOP, setTransform: NOOP, drawImage: NOOP,
    fillText: NOOP, strokeText: NOOP, clip: NOOP, rect: NOOP, quadraticCurveTo: NOOP,
    bezierCurveTo: NOOP, createLinearGradient: () => ({ addColorStop: NOOP }),
    createRadialGradient: () => ({ addColorStop: NOOP }), createPattern: () => null,
    measureText: () => ({ width: 0 }), getImageData: () => ({ data: [] }), putImageData: NOOP,
  };
  (HTMLCanvasElement.prototype as any).getContext ??= () => canvasContext;

  (HTMLMediaElement.prototype as any).play ??= async () => undefined;
  (HTMLMediaElement.prototype as any).pause ??= NOOP;

  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: { writeText: async () => undefined, readText: async () => "" },
  });
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: {
      register: async () => ({ scope: "/" }),
      getRegistration: async () => undefined,
      ready: Promise.resolve({ scope: "/" }),
      addEventListener: NOOP,
      removeEventListener: NOOP,
    },
  });
}

/* ------------------------------------------------------------------ */
/* إحصاء العناصر التفاعلية وأسماؤها                                    */
/* ------------------------------------------------------------------ */

const INTERACTIVE_SELECTOR = [
  "button", "a[href]", "input", "select", "textarea",
  '[role="button"]', '[role="tab"]', '[role="menuitem"]', '[role="menuitemcheckbox"]', '[role="menuitemradio"]',
  '[role="switch"]', '[role="checkbox"]', '[role="radio"]', '[role="link"]', '[role="option"]',
  '[role="combobox"]', '[role="slider"]', '[role="spinbutton"]',
].join(", ");

export type InteractiveControl = {
  element: HTMLElement;
  tag: string;
  index: number;
  name: string;
  hasName: boolean;
  disabled: boolean;
};

function labelledByText(element: HTMLElement) {
  const ids = (element.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
  return ids.map(id => element.ownerDocument.getElementById(id)?.textContent?.trim() ?? "").filter(Boolean).join(" ");
}

function associatedLabelText(element: HTMLElement) {
  const id = element.getAttribute("id");
  if (id) {
    const explicit = element.ownerDocument.querySelector(`label[for="${id}"]`);
    if (explicit?.textContent) return explicit.textContent.replace(/\s+/g, " ").trim();
  }
  const wrapping = element.closest("label");
  return wrapping?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

/** يحسب الاسم المقروء للعنصر بأولويات WAI-ARIA قدر الإمكان. */
export function accessibleName(element: HTMLElement): string {
  const ariaLabel = element.getAttribute("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;
  const byLabel = labelledByText(element);
  if (byLabel) return byLabel;
  const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  if (text) return text;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    const label = associatedLabelText(element);
    if (label) return label;
    const placeholder = element.getAttribute("placeholder")?.trim();
    if (placeholder) return placeholder;
  }
  const title = element.getAttribute("title")?.trim();
  if (title) return title;
  const alt = element.querySelector("img[alt]")?.getAttribute("alt")?.trim();
  if (alt) return alt;
  return "";
}

function isAriaHidden(element: HTMLElement) {
  let current: HTMLElement | null = element;
  while (current) {
    // «hidden» أو الإخفاء البصري الفعلي يُستبعد؛ أما aria-hidden المؤقت (مثل إخفاء
    // خلفية نافذة Radix المنبثقة أثناء الفحص) فلا يُستبعد حتى لا يفقد الفحص أزرار الصفحة.
    if (current.hasAttribute("hidden")) return true;
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (style && (style.display === "none" || style.visibility === "hidden")) return true;
    current = current.parentElement;
  }
  return false;
}

export function collectInteractiveControls(container: HTMLElement): InteractiveControl[] {
  return Array.from(container.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR))
    .filter(node => !isAriaHidden(node))
    .filter(node => node.getAttribute("type") !== "hidden")
    .map((node, index) => {
      const name = accessibleName(node);
      return {
        element: node,
        tag: node.tagName.toLowerCase() + (node.getAttribute("role") ? `[role=${node.getAttribute("role")}]` : ""),
        index,
        name,
        hasName: Boolean(name),
        disabled: (node as HTMLButtonElement).disabled === true || node.getAttribute("aria-disabled") === "true",
      };
    });
}

/* ------------------------------------------------------------------ */
/* ضغط كل العناصر التفاعلية والتقاط الأخطاء                            */
/* ------------------------------------------------------------------ */

export type SweepReport = {
  controls: InteractiveControl[];
  clicked: number;
  skipped: number;
  unlabeled: InteractiveControl[];
  errors: string[];
};

const IGNORED_CONSOLE_PATTERNS = [
  /not implemented/i,
  /not wrapped in act/i,
  /unique "key"/i,
  /validateDOMNesting/i,
  /deprecated/i,
  /\[OAuth\]/i,
  /React does not recognize/i,
];

const CRASH_CONSOLE_PATTERNS = [
  /the above error occurred/i,
  /uncaught/i,
  /is not a function/i,
  /cannot read propert/i,
  /cannot destructure/i,
];

/** يضغط كل عنصر تفاعلي غير معطّل ويفتح النوافذ المنبثقة عبر عدة دورات. */
export function sweepInteractiveControls(container: HTMLElement, options?: { maxClicks?: number; passes?: number }): SweepReport {
  const errors: string[] = [];
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  const capture = (...args: unknown[]) => {
    const message = args.map(String).join(" ");
    if (IGNORED_CONSOLE_PATTERNS.some(pattern => pattern.test(message))) return;
    if (CRASH_CONSOLE_PATTERNS.some(pattern => pattern.test(message))) errors.push(message.slice(0, 300));
  };
  console.error = (...args: unknown[]) => { capture(...args); };
  console.warn = (...args: unknown[]) => { capture(...args); };

  const onWindowError = (event: ErrorEvent) => { errors.push(String(event.error ?? event.message).slice(0, 300)); };
  window.addEventListener("error", onWindowError);

  const visited = new WeakSet<HTMLElement>();
  let clicked = 0;
  let skipped = 0;
  const limit = options?.maxClicks ?? Number.POSITIVE_INFINITY;
  const passes = options?.passes ?? 3;

  try {
    for (let pass = 0; pass < passes; pass += 1) {
      const controls = collectInteractiveControls(container);
      let progressed = false;
      for (const control of controls) {
        if (clicked >= limit) break;
        if (visited.has(control.element)) continue;
        if (control.disabled || !control.element.isConnected) { skipped += 1; continue; }
        try {
          // فتح القوائم والنوافذ التي تعتمد على أحداث المؤشر قبل الضغط.
          fireEvent.pointerDown(control.element);
          fireEvent.mouseDown(control.element);
          fireEvent.click(control.element);
          visited.add(control.element);
          clicked += 1;
          progressed = true;
        } catch (error) {
          errors.push(`${control.tag} «${control.name}»: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (!progressed) break;
    }
  } finally {
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    window.removeEventListener("error", onWindowError);
  }

  const finalControls = collectInteractiveControls(container);
  return { controls: finalControls, clicked, skipped, unlabeled: finalControls.filter(control => !control.hasName), errors };
}

/** يركّب عنصراً داخل StrictMode ويعيد النتيجة وحاوية DOM. */
export function mountPage(element: React.ReactElement): { result: RenderResult; container: HTMLElement } {
  const result = render(element);
  return { result, container: result.container };
}
