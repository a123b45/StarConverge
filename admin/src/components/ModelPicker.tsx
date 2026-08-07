import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  options: string[];
  value: string[]; // empty => 全部模型
  onChange: (next: string[]) => void;
};

/**
 * 允许模型选择器：
 * - 空数组 = 全部模型
 * - 可搜索过滤下拉项，支持多选与自定义输入
 */
export default function ModelPicker({ options, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const allMode = value.length === 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = options.filter((m) => m !== "*");
    if (!q) return list;
    return list.filter((m) => m.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function selectAll() {
    onChange([]);
    setQuery("");
    setOpen(false);
  }

  function toggleModel(m: string) {
    if (allMode) {
      onChange([m]);
      return;
    }
    if (value.includes(m)) {
      const next = value.filter((x) => x !== m);
      onChange(next);
    } else {
      onChange([...value, m]);
    }
  }

  function addCustom() {
    const m = query.trim();
    if (!m || m === "*") return;
    if (allMode) {
      onChange([m]);
    } else if (!value.includes(m)) {
      onChange([...value, m]);
    }
    setQuery("");
  }

  function removeChip(m: string) {
    onChange(value.filter((x) => x !== m));
  }

  return (
    <div className="model-picker" ref={rootRef}>
      <div className="model-picker-box" onClick={() => setOpen(true)}>
        {allMode ? (
          <span className="badge blue">全部模型</span>
        ) : (
          value.map((m) => (
            <span className="badge blue model-chip" key={m}>
              {m}
              <button
                type="button"
                className="chip-x"
                onClick={(e) => {
                  e.stopPropagation();
                  removeChip(m);
                }}
              >
                ×
              </button>
            </span>
          ))
        )}
        <input
          className="model-picker-input"
          value={query}
          placeholder={allMode ? "搜索或输入模型名…" : "继续搜索添加…"}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (filtered.length === 1) toggleModel(filtered[0]!);
              else addCustom();
            }
          }}
        />
      </div>

      {open ? (
        <div className="model-picker-menu">
          <button
            type="button"
            className={`model-picker-item ${allMode ? "active" : ""}`}
            onClick={selectAll}
          >
            <span>全部模型</span>
            <span className="mono" style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
              不限制
            </span>
          </button>
          {filtered.map((m) => {
            const checked = !allMode && value.includes(m);
            return (
              <button
                type="button"
                key={m}
                className={`model-picker-item ${checked ? "active" : ""}`}
                onClick={() => toggleModel(m)}
              >
                <span className="mono">{m}</span>
                {checked ? <span>✓</span> : null}
              </button>
            );
          })}
          {query.trim() &&
          !filtered.some((m) => m.toLowerCase() === query.trim().toLowerCase()) ? (
            <button type="button" className="model-picker-item" onClick={addCustom}>
              添加自定义「{query.trim()}」
            </button>
          ) : null}
          {!filtered.length && !query.trim() ? (
            <div className="empty" style={{ padding: 12 }}>
              暂无渠道模型，可直接输入模型名
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
