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
  const [deleting, setDeleting] = useState<RoleRow | null>(null);
  const [boundUsers, setBoundUsers] = useState<{ id: string; label: string }[]>([]);
  const [boundLoading, setBoundLoading] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

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

  async function askRemove(row: RoleRow) {
    setError("");
    setDeleting(row);
    setBoundUsers([]);
    setBoundLoading(true);
    try {
      const res = await api<{ data: { id: string; label: string }[] }>(
        `/roles/${row.id}/users`,
      );
      setBoundUsers(res.data);
    } catch (err) {
      setDeleting(null);
      setError(err instanceof Error ? err.message : "无法读取绑定用户");
    } finally {
      setBoundLoading(false);
    }
  }

  async function confirmRemove(mode: "with_users" | "keep_users") {
    if (!deleting) return;
    setDeleteBusy(true);
    setError("");
    try {
      await api(`/roles/${deleting.id}`, {
        method: "DELETE",
        body: JSON.stringify({ mode }),
      });
      setDeleting(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleteBusy(false);
    }
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
                <p>
                  {r.isSystem
                    ? `【内置角色】${r.description?.trim() || "系统预置角色，可修改权限"}`
                    : r.description || "暂无描述"}
                </p>
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
              <button type="button" className="btn danger sm" onClick={() => void askRemove(r)}>
                删除
              </button>
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

      {deleting ? (
        <div className="modal-backdrop" onClick={() => !deleteBusy && setDeleting(null)}>
          <div
            className="modal modal-sm rp-del-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-user-head">
              <h3>删除角色「{deleting.name}」</h3>
              <p>
                {boundLoading
                  ? "正在查询绑定用户…"
                  : boundUsers.length
                    ? `当前角色已被用户：${boundUsers.map((u) => u.label).join("、")} 绑定，是否继续删除？`
                    : "当前角色暂无用户绑定，是否继续删除？"}
              </p>
              {deleting.isSystem ? (
                <p className="rp-del-note">这是内置角色，删除后不会在启动时自动重建。</p>
              ) : null}
            </div>
            {error ? <div className="alert">{error}</div> : null}
            <div className="rp-del-actions">
              <button
                type="button"
                className="btn danger"
                disabled={boundLoading || deleteBusy || !boundUsers.length}
                title={!boundUsers.length ? "无绑定用户，请用选项 2" : undefined}
                onClick={() => void confirmRemove("with_users")}
              >
                1 · 是，删除角色及绑定用户
              </button>
              <button
                type="button"
                className="btn"
                disabled={boundLoading || deleteBusy}
                onClick={() => void confirmRemove("keep_users")}
              >
                2 · 只删除角色，保留用户
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={deleteBusy}
                onClick={() => setDeleting(null)}
              >
                3 · 我再想想
              </button>
            </div>
            {!boundUsers.length && !boundLoading ? (
              <p className="rp-del-hint">无绑定用户时，选项 1 不可用；选 2 即可删除角色。</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
