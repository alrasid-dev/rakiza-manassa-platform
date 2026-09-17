import { Maximize2, Minus, Minimize2, Send, X } from "lucide-react";
import { createPortal } from "react-dom";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ComposeSize = { width: number; height: number };
export type ComposeDelta = { dx: number; dy: number };

export const COMPOSE_MIN_SIZE: ComposeSize = { width: 460, height: 380 };
export const COMPOSE_MAX_MARGIN = 24;
export const COMPOSE_STORAGE_KEY = "rakiza-mail-compose-size";
const COLLAPSED_HEIGHT = 52;

function viewportSize(viewport?: ComposeSize): ComposeSize {
  if (viewport) return viewport;
  if (typeof window === "undefined") return { width: 1280, height: 800 };
  return {
    width: window.innerWidth || 1280,
    height: window.innerHeight || 800,
  };
}

/** يقصّ أبعاد نافذة الكتابة داخل حدود الشاشة مع حدّ أدنى مقروء. */
export function clampComposeSize(
  requested: Partial<ComposeSize>,
  viewport?: ComposeSize
): ComposeSize {
  const bounds = viewportSize(viewport);
  const maxWidth = Math.max(
    COMPOSE_MIN_SIZE.width,
    bounds.width - COMPOSE_MAX_MARGIN * 2
  );
  const maxHeight = Math.max(
    COMPOSE_MIN_SIZE.height,
    bounds.height - COMPOSE_MAX_MARGIN * 2
  );
  const width = Math.min(
    maxWidth,
    Math.max(
      COMPOSE_MIN_SIZE.width,
      Math.round(Number(requested.width) || COMPOSE_MIN_SIZE.width)
    )
  );
  const height = Math.min(
    maxHeight,
    Math.max(
      COMPOSE_MIN_SIZE.height,
      Math.round(Number(requested.height) || COMPOSE_MIN_SIZE.height)
    )
  );
  return { width, height };
}

/**
 * يحسب الأبعاد الجديدة من حركة المقبض (RTL): السحب نحو اليسار يوسّع النافذة،
 * والسحب للأسفل يزيد ارتفاعها.
 */
export function nextComposeSizeFromDrag(
  start: ComposeSize,
  delta: ComposeDelta,
  viewport?: ComposeSize
): ComposeSize {
  return clampComposeSize(
    { width: start.width - delta.dx, height: start.height + delta.dy },
    viewport
  );
}

export function readStoredComposeSize(
  storage?: Pick<Storage, "getItem"> | null,
  viewport?: ComposeSize
): ComposeSize {
  try {
    const raw = storage?.getItem(COMPOSE_STORAGE_KEY);
    if (!raw) return clampComposeSize({}, viewport);
    const parsed = JSON.parse(raw) as Partial<ComposeSize>;
    return clampComposeSize(
      { width: parsed.width, height: parsed.height },
      viewport
    );
  } catch {
    return clampComposeSize({}, viewport);
  }
}

export function storeComposeSize(
  storage: Pick<Storage, "setItem"> | null | undefined,
  size: ComposeSize
) {
  try {
    storage?.setItem(
      COMPOSE_STORAGE_KEY,
      JSON.stringify({
        width: Math.round(size.width),
        height: Math.round(size.height),
      })
    );
  } catch {
    // التخزين غير متاح (وضع خاص) — نتجاهل بهدوء.
  }
}

type ShortcutEvent = {
  key?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
};

/** Ctrl/Cmd + Enter = إرسال، Ctrl/Cmd + S = حفظ مسودة. */
export function isComposeSubmitShortcut(event: ShortcutEvent) {
  return Boolean(
    event && event.key === "Enter" && (event.ctrlKey || event.metaKey)
  );
}

export function isComposeSaveShortcut(event: ShortcutEvent) {
  return Boolean(
    event &&
      (event.key === "s" || event.key === "S") &&
      (event.ctrlKey || event.metaKey)
  );
}

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

type MailComposeWindowProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  onSend: () => void;
  onSaveDraft: () => void;
  onSaveTemplate?: () => void;
  isSending?: boolean;
  isSaving?: boolean;
  canSend?: boolean;
  sendHint?: string;
  headerExtras?: React.ReactNode;
  footerNote?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * نافذة كتابة البريد بأسلوب Outlook: قابلة للتحجيم من المقبض أو بالأسهم، مع تصغير (Collapse)
 * وتكبير (Maximize)، واختصارات Ctrl+Enter للإرسال وCtrl+S لحفظ المسودة، والجوال = شاشة كاملة.
 */
export default function MailComposeWindow({
  open,
  onOpenChange,
  title,
  subtitle,
  onSend,
  onSaveDraft,
  onSaveTemplate,
  isSending = false,
  isSaving = false,
  canSend = true,
  sendHint,
  headerExtras,
  footerNote,
  children,
}: MailComposeWindowProps) {
  const storage = useMemo(() => browserStorage(), []);
  const [size, setSize] = useState<ComposeSize>(() =>
    readStoredComposeSize(storage)
  );
  const [maximized, setMaximized] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && (window.innerWidth || 1280) < 640
  );
  const sizeRef = useRef(size);
  sizeRef.current = size;

  useEffect(() => {
    if (!open) return;
    const syncViewport = () => {
      setMobile((window.innerWidth || 1280) < 640);
      setSize(current => clampComposeSize(current));
    };
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, [open]);

  const startResize = useCallback(
    (event: React.MouseEvent | React.PointerEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startY = event.clientY;
      const start = sizeRef.current;
      const target = event.currentTarget as HTMLElement;
      target.setAttribute("data-resizing", "true");
      const move = (moveEvent: MouseEvent | PointerEvent) => {
        setSize(
          nextComposeSizeFromDrag(start, {
            dx: moveEvent.clientX - startX,
            dy: moveEvent.clientY - startY,
          })
        );
      };
      const finish = () => {
        target.removeAttribute("data-resizing");
        window.removeEventListener("pointermove", move as EventListener);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("mousemove", move as EventListener);
        window.removeEventListener("mouseup", finish);
        storeComposeSize(storage, sizeRef.current);
      };
      const supportsPointer =
        typeof window !== "undefined" && "PointerEvent" in window;
      if (supportsPointer) {
        window.addEventListener("pointermove", move as EventListener);
        window.addEventListener("pointerup", finish);
      } else {
        window.addEventListener("mousemove", move as EventListener);
        window.addEventListener("mouseup", finish);
      }
    },
    [storage]
  );

  const nudgeSize = (delta: ComposeDelta) => {
    setSize(current => {
      const next = nextComposeSizeFromDrag(current, delta);
      sizeRef.current = next;
      storeComposeSize(storage, next);
      return next;
    });
  };

  const toggleMaximize = () => {
    setMaximized(current => !current);
    setCollapsed(false);
  };

  const viewportWidth =
    typeof window === "undefined" ? 1280 : window.innerWidth || 1280;
  const viewportHeight =
    typeof window === "undefined" ? 800 : window.innerHeight || 800;
  const effective =
    maximized && !mobile
      ? clampComposeSize({
          width: viewportWidth - COMPOSE_MAX_MARGIN * 2,
          height: viewportHeight - COMPOSE_MAX_MARGIN * 2,
        })
      : size;
  const frameStyle: React.CSSProperties = mobile
    ? { inset: 0, width: "100%", height: "100%" }
    : {
        width: effective.width,
        height: collapsed ? COLLAPSED_HEIGHT : effective.height,
        bottom: COMPOSE_MAX_MARGIN,
        left: COMPOSE_MAX_MARGIN,
      };

  if (!open) return null;

  const node = (
    <div
      role="dialog"
      aria-label={title}
      aria-modal="false"
      data-testid="mail-compose-window"
      data-resizable={mobile ? "false" : "true"}
      data-maximized={maximized ? "true" : "false"}
      data-collapsed={collapsed ? "true" : "false"}
      data-mobile={mobile ? "true" : "false"}
      tabIndex={-1}
      onKeyDown={event => {
        if (isComposeSubmitShortcut(event)) {
          event.preventDefault();
          onSend();
          return;
        }
        if (isComposeSaveShortcut(event)) {
          event.preventDefault();
          onSaveDraft();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          onOpenChange(false);
        }
      }}
      dir="rtl"
      style={frameStyle}
      className={`fixed z-50 flex flex-col overflow-hidden border border-[#c9d6c8] bg-white shadow-[0_24px_60px_rgba(18,53,47,0.28)] max-w-5xl ${mobile ? "rounded-none" : "rounded-t-2xl rounded-b-xl"}`}
    >
      <header
        data-testid="mail-compose-header"
        onDoubleClick={() => {
          if (!mobile) toggleMaximize();
        }}
        className="flex shrink-0 cursor-move select-none items-center gap-2 rounded-t-2xl bg-[#12352f] px-4 py-2.5 text-white"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black">{title}</p>
          {subtitle ? (
            <p className="truncate text-[11px] text-white/70">{subtitle}</p>
          ) : null}
        </div>
        {headerExtras}
        <button
          type="button"
          title={collapsed ? "توسيع النافذة" : "تصغير النافذة"}
          aria-label={collapsed ? "توسيع نافذة الكتابة" : "تصغير نافذة الكتابة"}
          onClick={() => setCollapsed(current => !current)}
          className="grid h-8 w-8 place-items-center rounded-lg text-white/85 hover:bg-white/10"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          title={maximized ? "استعادة الحجم" : "تكبير النافذة"}
          aria-label={
            maximized ? "استعادة حجم نافذة الكتابة" : "تكبير نافذة الكتابة"
          }
          onClick={toggleMaximize}
          className="grid h-8 w-8 place-items-center rounded-lg text-white/85 hover:bg-white/10"
        >
          {maximized ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          title="إغلاق"
          aria-label="إغلاق نافذة الكتابة"
          onClick={() => onOpenChange(false)}
          className="grid h-8 w-8 place-items-center rounded-lg text-white/85 hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      {collapsed ? null : (
        <>
          <div
            data-testid="mail-compose-body"
            className="flex-1 overflow-y-auto p-4"
          >
            {children}
          </div>
          <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[#dce5da] bg-[#f6f9f6] px-4 py-3">
            <button
              type="button"
              onClick={onSend}
              disabled={isSending || !canSend}
              title={
                !canSend && sendHint ? sendHint : "إرسال الرسالة (Ctrl+Enter)"
              }
              className="inline-flex items-center gap-2 rounded-xl bg-[#0e6a40] px-4 py-2.5 text-sm font-black text-white disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {isSending ? "جارٍ الإرسال…" : "إرسال"}
            </button>
            {!canSend && sendHint ? (
              <span className="text-[11px] font-bold text-[#8a5a2b]">
                {sendHint}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-xl border border-[#cfdccd] bg-white px-3 py-2.5 text-xs font-black text-[#315c4a] disabled:opacity-60"
            >
              {isSaving ? "جارٍ الحفظ…" : "حفظ المسودة"}
            </button>
            {onSaveTemplate ? (
              <button
                type="button"
                aria-label="حفظ قالب"
                onClick={onSaveTemplate}
                className="inline-flex items-center gap-2 rounded-xl border border-[#cfdccd] bg-white px-3 py-2.5 text-xs font-black text-[#315c4a]"
              >
                حفظ قالب
              </button>
            ) : null}
            {footerNote ? (
              <span className="mr-auto text-[11px] text-[#6d7f75]">
                {footerNote}
              </span>
            ) : null}
          </footer>
          {mobile ? null : (
            <span
              role="separator"
              aria-label="تحجيم نافذة الكتابة"
              aria-orientation="vertical"
              aria-valuenow={Math.round(effective.width)}
              aria-valuemin={COMPOSE_MIN_SIZE.width}
              data-testid="mail-compose-resize"
              tabIndex={0}
              title="اسحب لتغيير حجم النافذة، أو استخدم الأسهم"
              onPointerDown={startResize}
              onMouseDown={event => {
                if (!("PointerEvent" in window)) startResize(event);
              }}
              onKeyDown={event => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  nudgeSize({ dx: -40, dy: 0 });
                } else if (event.key === "ArrowRight") {
                  event.preventDefault();
                  nudgeSize({ dx: 40, dy: 0 });
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  nudgeSize({ dx: 0, dy: -40 });
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  nudgeSize({ dx: 0, dy: 40 });
                }
              }}
              className="absolute bottom-0 left-0 h-4 w-4 cursor-nesw-resize"
            />
          )}
        </>
      )}
    </div>
  );

  // نافذة عائمة في جذر الصفحة: لا تتأثر بقصّ الحاويات ولا بطبقات الحوار الأخرى.
  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}
