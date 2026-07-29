import { useSignal } from "@preact/signals-react";
import type { ReactNode } from "react";
import { Children, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface OverflowBarProps {
  children: ReactNode;
  className?: string;
  menuLabel?: string;
  menuClassName?: string;
  testId?: string;
}

function BurgerIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path d="M2 4h12v1.6H2zm0 3.2h12v1.6H2zm0 3.2h12v1.6H2z" />
    </svg>
  );
}

const BURGER_RESERVE_PX = 40;

export function OverflowBar({
  children,
  className = "",
  menuLabel = "More",
  menuClassName = "",
  testId,
}: OverflowBarProps) {
  const items = Children.toArray(children);
  const visibleCount = useSignal(items.length);
  const menuOpen = useSignal(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const widthCache = useRef<WeakMap<HTMLElement, number>>(new WeakMap());
  const burgerRef = useRef<HTMLButtonElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the child set changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function recompute() {
      const c = containerRef.current;
      if (!c) return;
      const available = c.clientWidth;
      const gap = Number.parseFloat(getComputedStyle(c).columnGap) || 0;
      const measured = itemRefs.current.map((el) => {
        if (!el) return 0;
        const live = el.offsetWidth;
        if (live > 0) {
          widthCache.current.set(el, live);
          return live;
        }
        return widthCache.current.get(el) ?? 0;
      });

      let used = 0;
      let fit = 0;
      for (const [index, w] of measured.entries()) {
        used += w + (index > 0 ? gap : 0);
        if (used <= available) fit += 1;
        else break;
      }

      if (fit < measured.length) {
        let usedWithBurger = BURGER_RESERVE_PX;
        fit = 0;
        for (const [index, w] of measured.entries()) {
          usedWithBurger += w + (index > 0 ? gap : 0);
          if (usedWithBurger <= available) fit += 1;
          else break;
        }
      }

      visibleCount.value = Math.max(0, fit);
    }

    const obs = new ResizeObserver(recompute);
    obs.observe(container);
    recompute();
    return () => obs.disconnect();
  }, [items.length, visibleCount]);

  useEffect(() => {
    if (!menuOpen.value) return;
    function handleDown(e: MouseEvent) {
      if (burgerRef.current?.contains(e.target as Node)) return;
      menuOpen.value = false;
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") menuOpen.value = false;
    }
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen.value, menuOpen]);

  const shown = Math.min(visibleCount.value, items.length);
  const overflowing = items.length - shown;

  function menuStyle(): React.CSSProperties {
    if (!burgerRef.current) return { top: 0, right: 0 };
    const r = burgerRef.current.getBoundingClientRect();
    return {
      position: "fixed",
      top: r.bottom + 4,
      right: globalThis.innerWidth - r.right,
      zIndex: 9999,
    };
  }

  return (
    <div
      ref={containerRef}
      data-testid={testId}
      data-managed-overflow="true"
      className={`flex items-center min-w-0 overflow-hidden ${className}`}
    >
      {items.map((child, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: stable child order driven by parent
          key={i}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          data-ov-item={i}
          className={`flex items-center shrink-0 ${i >= shown ? "hidden" : ""}`}
        >
          {child}
        </div>
      ))}

      {overflowing > 0 && (
        <>
          <button
            ref={burgerRef}
            type="button"
            data-testid={testId ? `${testId}-burger` : "overflow-burger"}
            aria-haspopup="menu"
            aria-expanded={menuOpen.value}
            aria-label={menuLabel}
            title={menuLabel}
            onClick={() => {
              menuOpen.value = !menuOpen.value;
            }}
            className="flex items-center justify-center shrink-0 ml-1 px-1.5 py-1 rounded border border-divider bg-panel/60 text-label hover:bg-divider/60 hover:border-muted hover:text-default transition-all"
          >
            <BurgerIcon />
          </button>

          {menuOpen.value &&
            createPortal(
              <div
                role="menu"
                aria-label={menuLabel}
                style={menuStyle()}
                onClickCapture={() => {
                  menuOpen.value = false;
                }}
                className={`flex flex-col items-stretch gap-1 bg-surface border border-divider rounded shadow-xl p-2 min-w-[180px] ${menuClassName}`}
              >
                {items.slice(shown)}
              </div>,
              document.body
            )}
        </>
      )}
    </div>
  );
}
