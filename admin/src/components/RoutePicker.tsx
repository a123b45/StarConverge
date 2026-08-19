import { useEffect, useMemo, useRef, useState } from "react";

export type RouteOption = {
  id: string;
  model: string;
  enabled: boolean;
};

type Props = {
  options: RouteOption[];
  value: string;
  onChange: (routeId: string) => void;
};

/** Single-select route binding with search and scrollable menu. */
export default function RoutePicker({ options, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((r) => r.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...options].sort((a, b) => a.model.localeCompare(b.model));
    if (!q) return list;
    return list.filter((r) => r.model.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(routeId: string) {
    onChange(routeId);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="model-picker route-picker" ref={rootRef}>
      <div className="model-picker-box" onClick={() => setOpen(true)}>
        {selected ? (
          <span className={`badge blue${selected.enabled ? "" : " warn"}`}>
            {selected.model}
            {!selected.enabled ? " (停用)" : ""}
            <button
              type="button"
              className="chip-x"
              onClick={(e) => {
                e.stopPropagation();
                pick("");
              }}
            >
              ×
            </button>
          </span>
        ) : (
          <span className="tk-tag-empty">不绑定路由</span>
        )}
        <input
          className="model-picker-input"
          value={query}
          placeholder={selected ? "搜索切换路由…" : "搜索并选择路由…"}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
            if (e.key === "Enter" && filtered.length === 1) {
              e.preventDefault();
              pick(filtered[0]!.id);
            }
          }}
        />
      </div>

      {open ? (
        <div className="model-picker-menu route-picker-menu">
          <button
            type="button"
            className={`model-picker-item ${!value ? "active" : ""}`}
            onClick={() => pick("")}
          >
            <span>不绑定路由</span>
            <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>按请求模型解析</span>
          </button>
          {filtered.map((r) => {
            const on = value === r.id;
            return (
              <button
                type="button"
                key={r.id}
                className={`model-picker-item ${on ? "active" : ""}`}
                onClick={() => pick(r.id)}
              >
                <span className="mono">{r.model}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {!r.enabled ? (
                    <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>停用</span>
                  ) : null}
                  {on ? <span>✓</span> : null}
                </span>
              </button>
            );
          })}
          {!filtered.length ? (
            <div className="empty" style={{ padding: 12 }}>
              没有匹配的路由
            </div>
          ) : null}
          {options.length > 12 ? (
            <div className="route-picker-hint">共 {options.length} 条路由，可继续输入搜索</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
