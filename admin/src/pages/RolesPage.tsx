import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { API_GROUPS, MENU_GROUPS, type PermGroup } from "../lib/permissions";
import { IconKey, IconList, IconShield } from "../components/icons";

type RoleRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  menuPerms: string[];
  apiPerms: string[];
  isSystem: boolean;
};

type Draft = {
  name: string;
  description: string;
  menuPerms: string[];
  apiPerms: string[];
};

type Skin = "a" | "b" | "c";

const SKIN_KEY = "sc.roles.skin";
const SKINS: { id: Skin; name: string; desc: string }[] = [
  { id: "a", name: "方案 A · 清单", desc: "表格行 + 右侧抽屉" },
  { id: "b", name: "方案 B · 柔和卡片", desc: "留白更大 · 顶部指标条" },
  { id: "c", name: "方案 C · 分栏工作台", desc: "左侧选角色 · 右侧直接编辑" },
];

const emptyDraft = (): Draft => ({
  name: "",
  description: "",
  menuPerms: ["menu.dashboard"],
  apiPerms: ["api.dashboard.read"],
});

function toggleKey(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

function groupKeys(group: PermGroup): string[] {
  return group.items.map((i) => i.key);
}

function PermPanel({
  title,
  icon,
  groups,
  selected,
  onChange,
  compact,
}: {
  title: string;
  icon: React.ReactNode;
  groups: PermGroup[];
  selected: string[];
  onChange: (next: string[]) => void;
  compact?: boolean;
}) {
  return (
    <section className={`rp-perm${compact ? " compact" : ""}`}>
      <header className="rp-perm-head">
        <span className="rp-perm-ico">{icon}</span>
        <div>
          <strong>{title}</strong>
          <em>
            已选 {selected.filter((k) => groups.some((g) => g.items.some((i) => i.key === k))).length}
          </em>
        </div>
      </header>
      <div className="rp-perm-body">
        {groups.map((g) => {
          const keys = groupKeys(g);
          const allOn = keys.every((k) => selected.includes(k));
          const someOn = !allOn && keys.some((k) => selected.includes(k));
          return (
            <div className="rp-block" key={g.id}>
              <label className="rp-block-title">
                <input
                  type="checkbox"
                  checked={allOn}
                  ref={(el) => {
                    if (el) el.indeterminate = someOn;
                  }}
                  onChange={() => {
                    if (allOn) onChange(selected.filter((k) => !keys.includes(k)));
                    else onChange([...new Set([...selected, ...keys])]);
                  }}
                />
                <span>{g.label}</span>
              </label>
              <div className="rp-chips">
                {g.items.map((item) => {
                  const on = selected.includes(item.key);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`rp-chip${on ? " on" : ""}`}
                      onClick={() => onChange(toggleKey(selected, item.key))}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function RolesPage() {
  const [rows, setRows] = useState<RoleRow[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [skin, setSkin] = useState<Skin>(() => {
    const v = localStorage.getItem(SKIN_KEY);
    return v === "a" || v === "b" || v === "c" ? v : "b";
  });
  const [activeId, setActiveId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api<{ data: RoleRow[] }>("/roles");
      setRows(res.data);
      setError("");
      if (!activeId && res.data[0]) setActiveId(res.data[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(SKIN_KEY, skin);
  }, [skin]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        (r.description || "").toLowerCase().includes(s) ||
        r.key.toLowerCase().includes(s),
    );
  }, [rows, q]);

  const active = filtered.find((r) => r.id === activeId) ?? filtered[0] ?? null;

  useEffect(() => {
    if (skin !== "c" || !active || open) return;
    setEditing(active);
    setDraft({
      name: active.name,
      description: active.description || "",
      menuPerms: [...active.menuPerms],
      apiPerms: [...active.apiPerms],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skin, active?.id, open]);

  function startCreate() {
    setEditing(null);
    setDraft(emptyDraft());
    if (skin === "c") {
      setActiveId(null);
      setOpen(true);
    } else {
      setOpen(true);
    }
  }

  function startEdit(row: RoleRow) {
    setEditing(row);
    setDraft({
      name: row.name,
      description: row.description || "",
      menuPerms: [...row.menuPerms],
      apiPerms: [...row.apiPerms],
    });
    setActiveId(row.id);
    if (skin === "c") {
      setOpen(false);
    } else {
      setOpen(true);
    }
  }

  function selectForWorkbench(row: RoleRow) {
    setActiveId(row.id);
    setEditing(row);
    setDraft({
      name: row.name,
      description: row.description || "",
      menuPerms: [...row.menuPerms],
      apiPerms: [...row.apiPerms],
    });
    setOpen(false);
  }

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!draft.name.trim()) {
      setError("请填写角色名称");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (editing) {
        await api(`/roles/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(draft),
        });
      } else {
        await api("/roles", {
          method: "POST",
          body: JSON.stringify(draft),
        });
      }
      setOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: RoleRow) {
    if (row.isSystem) return;
    if (!confirm(`删除角色「${row.name}」？已绑定用户将回退为普通用户。`)) return;
    await api(`/roles/${row.id}`, { method: "DELETE" });
    await load();
  }

  const editorFields = (
    <div className="rp-fields">
      <label>
        <span>
          角色名称 <i>*</i>
        </span>
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="例如：财务只读"
          required
          disabled={!!editing?.isSystem}
        />
      </label>
      <label>
        <span>职责描述</span>
        <input
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder="一句话说明这个角色能做什么"
          disabled={!!editing?.isSystem && false}
        />
      </label>
    </div>
  );

  const editorPerms = (
    <div className="rp-perm-grid">
      <PermPanel
        title="菜单可见"
        icon={<IconList size={15} />}
        groups={MENU_GROUPS}
        selected={draft.menuPerms}
        onChange={(menuPerms) => setDraft({ ...draft, menuPerms })}
      />
      <PermPanel
        title="接口能力"
        icon={<IconKey size={15} />}
        groups={API_GROUPS}
        selected={draft.apiPerms}
        onChange={(apiPerms) => setDraft({ ...draft, apiPerms })}
      />
    </div>
  );

  return (
    <div className={`rp-page skin-${skin}`}>
      <div className="topbar">
        <div className="page-head">
          <h2>角色管理</h2>
          <p>配置菜单与接口权限；下方可选三种版式，挑喜欢的留下</p>
        </div>
        <div className="row-actions">
          <input
            className="search"
            placeholder="搜索角色…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn" onClick={startCreate}>
            + 新建角色
          </button>
        </div>
      </div>

      <div className="rp-skin-picker" role="tablist" aria-label="版式选择">
        {SKINS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={skin === s.id}
            className={skin === s.id ? "on" : ""}
            onClick={() => setSkin(s.id)}
          >
            <strong>{s.name}</strong>
            <span>{s.desc}</span>
          </button>
        ))}
      </div>

      {error && !open ? <div className="alert">{error}</div> : null}

      {/* ── Skin A: list rows ── */}
      {skin === "a" ? (
        <div className="rp-a-panel">
          <table className="rp-a-table">
            <thead>
              <tr>
                <th>角色</th>
                <th>权限概览</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="rp-a-name">
                      <span className="rp-avatar">
                        <IconShield size={16} />
                      </span>
                      <div>
                        <strong>{r.name}</strong>
                        <p>{r.description || "暂无描述"}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="rp-meters">
                      <div>
                        <span>菜单</span>
                        <b>{r.menuPerms.length}</b>
                      </div>
                      <div>
                        <span>接口</span>
                        <b>{r.apiPerms.length}</b>
                      </div>
                    </div>
                  </td>
                  <td className="rp-a-actions">
                    <button type="button" className="btn ghost sm" onClick={() => startEdit(r)}>
                      编辑
                    </button>
                    {!r.isSystem ? (
                      <button type="button" className="btn danger sm" onClick={() => void remove(r)}>
                        删除
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr>
                  <td colSpan={3} className="empty">
                    暂无角色
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* ── Skin B: soft cards ── */}
      {skin === "b" ? (
        <div className="rp-b-grid">
          {filtered.map((r) => (
            <article key={r.id} className="rp-b-card">
              <div className="rp-b-accent" />
              <header>
                <span className="rp-avatar lg">
                  <IconShield size={18} />
                </span>
                <div>
                  <h3>{r.name}</h3>
                  <p>{r.description || "暂无描述"}</p>
                </div>
              </header>
              <div className="rp-b-stats">
                <div>
                  <span>菜单权限</span>
                  <strong>{r.menuPerms.length}</strong>
                </div>
                <div>
                  <span>接口权限</span>
                  <strong>{r.apiPerms.length}</strong>
                </div>
              </div>
              <footer>
                <button type="button" className="btn ghost sm" onClick={() => startEdit(r)}>
                  编辑权限
                </button>
                {!r.isSystem ? (
                  <button type="button" className="btn danger sm" onClick={() => void remove(r)}>
                    删除
                  </button>
                ) : (
                  <span className="rp-locked">内置 · 可改权限</span>
                )}
              </footer>
            </article>
          ))}
          {!filtered.length ? <div className="empty">暂无角色</div> : null}
        </div>
      ) : null}

      {/* ── Skin C: workbench ── */}
      {skin === "c" ? (
        <div className="rp-c-shell">
          <aside className="rp-c-list">
            <div className="rp-c-list-head">全部角色</div>
            {filtered.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`rp-c-item${active?.id === r.id && !open ? " on" : ""}`}
                onClick={() => selectForWorkbench(r)}
              >
                <strong>{r.name}</strong>
                <span>
                  {r.menuPerms.length} 菜单 · {r.apiPerms.length} 接口
                </span>
              </button>
            ))}
            {!filtered.length ? <div className="empty">暂无角色</div> : null}
          </aside>
          <section className="rp-c-editor">
            {open && !editing ? (
              <form
                onSubmit={(e) => {
                  void save(e);
                }}
              >
                <div className="rp-c-editor-head">
                  <div>
                    <h3>新建角色</h3>
                    <p>填写信息并勾选权限后保存</p>
                  </div>
                  <div className="row-actions">
                    <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                      取消
                    </button>
                    <button className="btn" disabled={busy}>
                      {busy ? "保存中…" : "创建"}
                    </button>
                  </div>
                </div>
                {error ? <div className="alert">{error}</div> : null}
                {editorFields}
                {editorPerms}
              </form>
            ) : active ? (
              <form
                onSubmit={(e) => {
                  void save(e);
                }}
              >
                <div className="rp-c-editor-head">
                  <div>
                    <h3>{active.name}</h3>
                    <p>{active.description || "编辑菜单与接口权限"}</p>
                  </div>
                  <div className="row-actions">
                    {!active.isSystem ? (
                      <button
                        type="button"
                        className="btn danger sm"
                        onClick={() => void remove(active)}
                      >
                        删除
                      </button>
                    ) : null}
                    <button className="btn" disabled={busy}>
                      {busy ? "保存中…" : "保存更改"}
                    </button>
                  </div>
                </div>
                {error ? <div className="alert">{error}</div> : null}
                {editorFields}
                {editorPerms}
              </form>
            ) : (
              <div className="empty">选择左侧角色开始编辑</div>
            )}
          </section>
        </div>
      ) : null}

      {/* Modal for A / B */}
      {open && skin !== "c" ? (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <form
            className="modal rp-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              void save(e);
            }}
          >
            <div className="rp-modal-head">
              <div>
                <h3>{editing ? "编辑角色" : "新建角色"}</h3>
                <p>用标签点选权限，比长列表更清晰</p>
              </div>
              <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>
                关闭
              </button>
            </div>
            {error ? <div className="alert">{error}</div> : null}
            {editorFields}
            {editorPerms}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                取消
              </button>
              <button className="btn" disabled={busy}>
                {busy ? "保存中…" : "保存"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
