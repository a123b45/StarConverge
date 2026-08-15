import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { API_GROUPS, MENU_GROUPS } from "../lib/permissions";
import { IconShield } from "../components/icons";

type RoleRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  menuPerms: string[];
  apiPerms: string[];
  isSystem: boolean;
};

function labelsFor(keys: string[], kind: "menu" | "api"): string[] {
  const groups = kind === "menu" ? MENU_GROUPS : API_GROUPS;
  const map = new Map<string, string>();
  for (const g of groups) {
    for (const item of g.items) map.set(item.key, item.label);
  }
  return keys.map((k) => map.get(k) || k);
}

export default function RolesPage() {
  const [rows, setRows] = useState<RoleRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await api<{ data: RoleRow[] }>("/roles");
        setRows(res.data);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败");
      }
    })();
  }, []);

  const ordered = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => (a.key === "admin" ? -1 : b.key === "admin" ? 1 : 0));
    return list;
  }, [rows]);

  return (
    <div className="rp-page">
      <div className="topbar">
        <div className="page-head">
          <h2>角色管理</h2>
          <p>系统固定「管理员」与「用户」两种身份，权限随页面绑定，不可增删改</p>
        </div>
      </div>

      {error ? <div className="alert">{error}</div> : null}

      <div className="rp-b-grid">
        {ordered.map((r) => {
          const menus = labelsFor(r.menuPerms, "menu");
          const apis = labelsFor(r.apiPerms, "api");
          return (
            <article key={r.id} className="rp-b-card rp-b-fixed">
              <div className="rp-b-accent" />
              <header>
                <span className="rp-avatar lg">
                  <IconShield size={18} />
                </span>
                <div>
                  <h3>
                    {r.name}
                    <em className="rp-fixed-tag">固定</em>
                  </h3>
                  <p>{r.description || "系统预置角色"}</p>
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
              <div className="rp-fixed-lists">
                <div>
                  <span>可见页面</span>
                  <ul>
                    {menus.length ? menus.map((m) => <li key={m}>{m}</li>) : <li>无</li>}
                  </ul>
                </div>
                {r.key === "admin" ? (
                  <div>
                    <span>接口能力</span>
                    <ul>
                      {apis.length ? (
                        <li>管理端全部读写接口（{apis.length} 项）</li>
                      ) : (
                        <li>无</li>
                      )}
                    </ul>
                  </div>
                ) : (
                  <div>
                    <span>接口能力</span>
                    <ul>
                      <li>门户自服务接口（密钥/用量/对话，随登录态）</li>
                    </ul>
                  </div>
                )}
              </div>
              <footer>
                <span className="rp-locked">不可编辑 · 不可删除</span>
              </footer>
            </article>
          );
        })}
        {!ordered.length && !error ? <div className="empty">暂无角色</div> : null}
      </div>
    </div>
  );
}
