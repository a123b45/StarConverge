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
}: {
  title: string;
  icon: React.ReactNode;
  groups: PermGroup[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <section className="rp-perm">
      <header className="rp-perm-head">
        <span className="rp-perm-ico">{icon}</span>
        <div>
          <strong>{title}</strong>
          <em>
            已选{" "}
            {
              selected.filter((k) =>
                groups.some((g) => g.items.some((i) => i.key === k)),
              ).length
            }
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

  async function load() {
    try {
      const res = await api<{ data: RoleRow[] }>("/roles");
      setRows(res.data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }

  useEffect(() => {
    void load();
  }, []);

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

  function startCreate() {
    setEditing(null);
    setDraft(emptyDraft());
    setOpen(true);
  }

  function startEdit(row: RoleRow) {
    setEditing(row);
    setDraft({
      name: row.name,
      description: row.description || "",
      menuPerms: [...row.menuPerms],
      apiPerms: [...row.apiPerms],
    });
    setOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
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

  return (
    <div className="rp-page">
      <div className="topbar">
        <div className="page-head">
          <h2>角色管理</h2>
          <p>配置菜单与接口权限，创建用户时可直接绑定</p>
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

      {error && !open ? <div className="alert">{error}</div> : null}

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

      {open ? (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <form
            className="modal rp-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={save}
          >
            <div className="rp-modal-head">
              <div>
                <h3>{editing ? "编辑角色" : "新建角色"}</h3>
                <p>用标签点选权限，勾选分组可全选</p>
              </div>
              <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>
                关闭
              </button>
            </div>
            {error ? <div className="alert">{error}</div> : null}
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
                />
              </label>
            </div>
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
