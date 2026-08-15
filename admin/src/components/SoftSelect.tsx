import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SoftSelectOption = { value: string; label: string };

/** Rounded custom select (avoids native sharp option popup). */
export default function SoftSelect({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
  disabled = false,
  placeholder,
}: {
  value: string;
  options: SoftSelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const current = options.find((o) => o.value === value)?.label ?? placeholder ?? value;

  function updatePos() {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 168);
    let left = r.left;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    const below = r.bottom + 6;
    const spaceBelow = window.innerHeight - below;
    const preferUp = spaceBelow < 180 && r.top > spaceBelow;
    setMenuPos({
      top: preferUp ? Math.max(8, r.top - 6) : below,
      left,
      width,
    });
  }

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updatePos();
    function onScroll() {
      updatePos();
    }
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const menu =
    open && !disabled && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            className="soft-select-menu soft-select-menu-fixed"
            role="listbox"
            id={menuId}
            style={{
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              minWidth: menuPos.width,
            }}
          >
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`soft-select-item${o.value === value ? " on" : ""}`}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      className={`soft-select ${className}${open ? " is-open" : ""}${disabled ? " is-disabled" : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="soft-select-trigger"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <span>{current || placeholder || "请选择"}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M3 4.5 L6 7.5 L9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {menu}
    </div>
  );
}
