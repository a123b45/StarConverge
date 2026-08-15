import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { API_GROUPS, MENU_GROUPS, type PermGroup } from "../lib/permissions";
import { IconKey, IconList } from "../components/icons";

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

function PermColumn({
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
    <div className="rbac-col">
      <div className="rbac-col-head">
        {icon}
        <strong>{title}</strong>
      </div>
      <div className="rbac-groups">
        {groups.map((g) => {
          const keys = groupKeys(g);
          const allOn = keys.every((k) => selected.includes(k));
          const someOn = !allOn && keys.some((k) => selected.includes(k));
          return (
            <div className="rbac-group" key={g.id}>
              <label className="rbac-group-title">
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
              <div className="rbac-items">
                {g.items.map((item) => (
                  <label key={item.key} className="rbac-item">
                    <input
                      type="checkbox"
                      checked={selected.includes(item.key)}
                      onChange={() => onChange(toggleKey(selected, item.key))}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
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
    <>
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

      <div className="role-grid">
        {filtered.map((r) => (
          <article key={r.id} className="role-card">
            <div className="role-card-top">
              <div>
                <h3>{r.name}</h3>
                <p>{r.description || "暂无描述"}</p>
              </div>
              {r.isSystem ? <span className="badge on">系统</span> : null}
            </div>
            <div className="role-meta">
              <span>菜单 {r.menuPerms.length}</span>
              <span>接口 {r.apiPerms.length}</span>
            </div>
            <div className="row-actions">
              <button className="btn ghost sm" onClick={() => startEdit(r)}>
                编辑权限
              </button>
              {!r.isSystem ? (
                <button className="btn danger sm" onClick={() => void remove(r)}>
                  删除
                </button>
              ) : null}
            </div>
          </article>
        ))}
        {!filtered.length ? <div className="empty">暂无角色</div> : null}
      </div>

      {open ? (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <form
            className="modal modal-rbac"
            onClick={(e) => e.stopPropagation()}
            onSubmit={save}
          >
            <div className="modal-rbac-head">
              <div>
                <h3>{editing ? "编辑角色" : "新建角色"}</h3>
                <p className="muted">勾选菜单可见性与接口操作权限</p>
              </div>
              <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>
                关闭
              </button>
            </div>

            {error ? <div className="alert">{error}</div> : null}

            <div className="rbac-fields">
              <label>
                角色名称 <em>*</em>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="请输入角色名称"
                  required
                />
              </label>
              <label>
                描述
                <input
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="一句话说明职责范围"
                />
              </label>
            </div>

            <div className="rbac-split">
              <PermColumn
                title="菜单权限"
                icon={<IconList size={16} />}
                groups={MENU_GROUPS}
                selected={draft.menuPerms}
                onChange={(menuPerms) => setDraft({ ...draft, menuPerms })}
              />
              <PermColumn
                title="接口权限"
                icon={<IconKey size={16} />}
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
                {busy ? "保存中…" : "确定"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
