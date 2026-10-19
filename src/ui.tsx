import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

/* =========================================================
   操作感まわりの共通部品
   - haptic: 対応端末で軽く振動
   - useBackClose: 端末/ブラウザの「戻る」でシートを閉じる
   - Sheet: 下からせり上がるシート（下スワイプ・背景タップ・戻るで閉じる）
   - Toast: 画面下の通知（「取り消す」などのアクション付き）
   ========================================================= */

export function haptic(ms: number | number[] = 10) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* 非対応端末は何もしない */
  }
}

// ---- 戻るボタンで閉じる ----
// シートを開くたびに履歴を1つ積み（state.sheet = 深さ）、戻るで深さが下がったら
// それより深いシートを閉じる。画面上の操作で閉じたときは積んだ履歴を自分で戻す。
interface BackEntry {
  fn: () => void;
  depth: number;
}
const backStack: BackEntry[] = [];
const sheetDepth = () => (history.state?.sheet as number | undefined) ?? 0;
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    const depth = sheetDepth();
    for (const e of [...backStack].reverse()) {
      if (e.depth > depth) {
        backStack.splice(backStack.indexOf(e), 1);
        e.fn();
      }
    }
  });
}

export function useBackClose(onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  const entry = useRef<(BackEntry & { pending?: ReturnType<typeof setTimeout> }) | null>(null);
  useEffect(() => {
    const cleanup = () => {
      const e = entry.current;
      if (!e) return;
      // StrictMode の付け直しで即再マウントされる場合に備え、片付けは1拍遅らせる
      e.pending = setTimeout(() => {
        entry.current = null;
        const i = backStack.indexOf(e);
        if (i >= 0) backStack.splice(i, 1);
        if (sheetDepth() === e.depth) history.back();
      }, 0);
    };
    if (entry.current?.pending != null) {
      clearTimeout(entry.current.pending);
      entry.current.pending = undefined;
      return cleanup;
    }
    const e: BackEntry = { fn: () => ref.current(), depth: sheetDepth() + 1 };
    backStack.push(e);
    history.pushState({ sheet: e.depth }, '');
    entry.current = e;
    return cleanup;
  }, []);
}

// ---- 背面スクロールのロック（シートが重なっても数で管理） ----
let lockCount = 0;
function lockScroll() {
  if (lockCount++ === 0) document.body.style.overflow = 'hidden';
}
function unlockScroll() {
  if (--lockCount === 0) document.body.style.overflow = '';
}

const CLOSE_MS = 200;

export function Sheet({
  onClose,
  title,
  className,
  children,
}: {
  onClose: () => void;
  title?: ReactNode;
  className?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; active: boolean } | null>(null);
  const closingRef = useRef(false);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  }, [onClose]);

  useBackClose(close);

  useEffect(() => {
    lockScroll();
    return unlockScroll;
  }, []);

  // 下スワイプで閉じる：シートが一番上までスクロールされている時だけ反応する
  // シートを重ねたとき、内側の操作が外側のシートに伝わらないよう止める
  const onTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    const el = sheetRef.current;
    if (!el || el.scrollTop > 0) {
      drag.current = null;
      return;
    }
    const target = e.target as HTMLElement;
    if (target.closest('input[type="range"], textarea')) return;
    drag.current = { startY: e.touches[0].clientY, active: false };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    const d = drag.current;
    if (!d) return;
    const dy = e.touches[0].clientY - d.startY;
    if (!d.active && dy > 8) d.active = true;
    if (d.active) setDragY(Math.max(0, dy));
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    if (dragY > 110) {
      haptic(8);
      close();
    } else {
      setDragY(0);
    }
  };

  return createPortal(
    <div className={'modal-backdrop' + (closing ? ' closing' : '')} onClick={close}>
      <div
        ref={sheetRef}
        className={'modal' + (className ? ' ' + className : '') + (dragY ? ' dragging' : '')}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="sheet-grabber" aria-hidden />
        {title && (
          <div className="modal-head">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={close} aria-label="閉じる">
              ✕
            </button>
          </div>
        )}
        {children(close)}
      </div>
    </div>,
    document.body
  );
}

// ---- トースト ----
interface ToastItem {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastApi {
  toast: (message: string, action?: { label: string; onClick: () => void }) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const v = useContext(ToastCtx);
  if (!v) throw new Error('ToastProvider missing');
  return v;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ToastItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const toast = useCallback<ToastApi['toast']>((message, action) => {
    clearTimeout(timer.current);
    const id = Date.now();
    setItem({ id, message, actionLabel: action?.label, onAction: action?.onClick });
    timer.current = setTimeout(() => setItem((t) => (t?.id === id ? null : t)), action ? 5000 : 2600);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      {item && (
        <div className="toast" key={item.id} role="status">
          <span className="toast-msg">{item.message}</span>
          {item.actionLabel && (
            <button
              className="toast-action"
              onClick={() => {
                haptic(8);
                item.onAction?.();
                setItem(null);
              }}
            >
              {item.actionLabel}
            </button>
          )}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
