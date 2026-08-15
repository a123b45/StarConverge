import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import ModelPicker from "../components/ModelPicker";
import { IconPencil, IconTrash } from "../components/icons";

type Token = {
  id: string;
  name: string;
  keyPrefix: string;
  key: string | null;
  quota: number;
  usedQuota: number;
  remainingQuota: number;
  rateLimit: number;
  concurrency: number;
  enabled: boolean;
  allowedModels: string[];
  groupName: string;
  ipAllowlist: string[];
  routeIds: string[];
  lastUsedAt: string | Date | null;
  expiresAt: string | Date | null;
  remark: string | null;
  createdAt: string | Date;
};

type RouteOpt = { id: string; model: string; enabled: boolean };

type FormState = {
  name: string;
  groupName: string;
  quotaUnlimited: boolean;
  quota: number;
  rateUnlimited: boolean;
  rateLimit: number;
  concurrency: number;
  allowedModels: string[];
  routeIds: string[];
  ipAllowlistText: string;
  remark: string;
  enabled: boolean;
};

type Skin = "a" | "b" | "c";

const SKIN_KEY = "sc-key-mgmt-skin";

const emptyForm = (): FormState => ({
  name: "",
  groupName: "",
  quotaUnlimited: true,
  quota: 1_000_000,
  rateUnlimited: false,
  rateLimit: 60,
  concurrency: 0,
  allowedModels: [],
  routeIds: [],
  ipAllowlistText: "",
  remark: "",
  enabled: true,
});

function parseIpText(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function loadSkin(): Skin {
  const v = localStorage.getItem(SKIN_KEY);
  return v === "b" || v === "c" ? v : "a";
}

export default function TokensPage() {
  const [rows, setRows] = useState<Token[]>([]);
  const [routes, setRoutes] = useState<RouteOpt[]>([]);
  const [modelOptions, setModelOptions] = useState<string[]>(["*"]);
  const [kw, setKw] = useState("");
  const [kwDraft, setKwDraft] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "on" | "off">("all");
  const [sort, setSort] = useState<"created_desc" | "created_asc" | "used_desc" | "name">("created_desc");
  const [skin, setSkin] = useState<Skin>(loadSkin);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Token | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  async function load() {
    const [tok, models, mrs] = await Promise.all([
      api<{ data: Token[] }>("/tokens"),
      api<{ data: string[] }>("/available-models"),
      api<{ data: RouteOpt[] }>("/models"),
    ]);
    setRows(
      tok.data.map((t) => ({
        ...t,
        groupName: t.groupName ?? "",
        ipAllowlist: t.ipAllowlist ?? [],
        routeIds: t.routeIds ?? [],
        concurrency: t.concurrency ?? 0,
        remainingQuota:
          t.remainingQuota ??
          (t.quota < 0 ? -1 : Math.max(0, t.quota - t.usedQuota)),
      })),
    );
    setModelOptions(models.data.length ? models.data : ["*"]);
    setRoutes(mrs.data ?? []);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  function pickSkin(s: Skin) {
    setSkin(s);
    localStorage.setItem(SKIN_KEY, s);
  }

  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const g = (r.groupName || "").trim();
      if (g) set.add(g);
    }
    return [...set].sort();
  }, [rows]);

  const routeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of routes) m.set(r.id, r.model);
    return m;
  }, [routes]);

  const stats = useMemo(() => {
    const now = Date.now();
    const soon = now + 7 * 24 * 3600 * 1000;
    let enabled = 0;
    let disabled = 0;
    let unbound = 0;
    let expiring = 0;
    for (const r of rows) {
      if (r.enabled) enabled += 1;
      else disabled += 1;
      if (!(r.routeIds ?? []).length) unbound += 1;
      if (r.expiresAt) {
        const t = new Date(r.expiresAt).getTime();
        if (!Number.isNaN(t) && t >= now && t <= soon) expiring += 1;
      }
    }
    return {
      total: rows.length,
      enabled,
      disabled,
      unbound,
      expiring,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows.filter((r) => {
      if (kw) {
        const q = kw.toLowerCase();
        const routeNames = (r.routeIds ?? [])
          .map((id) => routeMap.get(id) ?? "")
          .join(" ");
        const hit =
          r.name.toLowerCase().includes(q) ||
          (r.groupName ?? "").toLowerCase().includes(q) ||
          (r.remark ?? "").toLowerCase().includes(q) ||
          r.allowedModels.some((m) => m.toLowerCase().includes(q)) ||
          routeNames.toLowerCase().includes(q) ||
          String(r.enabled ? "启用" : "禁用").includes(q);
        if (!hit) return false;
      }
      if (groupFilter && (r.groupName || "").trim() !== groupFilter) return false;
      if (statusFilter === "on" && !r.enabled) return false;
      if (statusFilter === "off" && r.enabled) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "zh");
      if (sort === "created_asc")
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sort === "used_desc") {
        const ta = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
        const tb = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
        return tb - ta;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return list;
  }, [rows, kw, groupFilter, statusFilter, sort, routeMap]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  }

  function applySearch() {
    setKw(kwDraft.trim());
  }

  function resetSearch() {
    setKwDraft("");
    setKw("");
    setGroupFilter("");
    setStatusFilter("all");
    setSort("created_desc");
  }

  function startEdit(row: Token) {
    setEditing(row);
    setForm({
      name: row.name,
      groupName: row.groupName || "",
      quotaUnlimited: row.quota < 0,
      quota: row.quota < 0 ? 1_000_000 : row.quota,
      rateUnlimited: row.rateLimit <= 0,
      rateLimit: row.rateLimit <= 0 ? 60 : row.rateLimit,
      concurrency: row.concurrency ?? 0,
      allowedModels: [...row.allowedModels],
      routeIds: [...(row.routeIds ?? [])],
      ipAllowlistText: (row.ipAllowlist ?? []).join("\n"),
      remark: row.remark || "",
      enabled: row.enabled,
    });
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError("");
    const payload = {
      name: form.name,
      groupName: form.groupName,
      quota: form.quotaUnlimited ? -1 : Number(form.quota),
      rateLimit: form.rateUnlimited ? 0 : Number(form.rateLimit),
      concurrency: Number(form.concurrency) || 0,
      allowedModels: form.allowedModels,
      routeIds: form.routeIds,
      ipAllowlist: parseIpText(form.ipAllowlistText),
      remark: form.remark,
      enabled: form.enabled,
    };
    try {
      await api(`/tokens/${editing.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      flash("策略已更新");
      setOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  async function remove(row: Token) {
    if (!confirm(`删除密钥「${row.name}」？`)) return;
    await api(`/tokens/${row.id}`, { method: "DELETE" });
    await load();
  }

  function routeLabel(ids: string[]) {
    if (!ids.length) return "未绑定";
    const names = ids.map((id) => routeMap.get(id) ?? id);
    if (names.length <= 2) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  }

  function modelsLabel(models: string[]) {
    if (!models.length) return "全部模型";
    if (models.length <= 2) return models.join(", ");
    return `${models.slice(0, 2).join(", ")} +${models.length - 2}`;
  }

  function ipLabel(list: string[]) {
    if (!list.length) return "不限";
    if (list.length <= 2) return list.join(", ");
    return `${list[0]} 等${list.length}条`;
  }

  function quotaLabel(r: Token) {
    const remaining = r.quota < 0 ? "∞" : (r.remainingQuota ?? 0).toLocaleString();
    const total = r.quota < 0 ? "∞" : r.quota.toLocaleString();
    return `${remaining} / ${total}`;
  }

  const table = (
    <div className="panel">
      <div className="table-wrap">
        <table className="table km-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>所属分组</th>
              <th>路由</th>
              <th>可用模型</th>
              <th>IP 限制</th>
              <th>QPS</th>
              <th>并发限制</th>
              <th>剩余额度 / 总额度</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.name}</strong>
                  <div className="tk-sub">
                    <span className={`badge ${r.enabled ? "on" : "off"}`}>
                      {r.enabled ? "启用" : "禁用"}
                    </span>
                    {r.remark ? ` · ${r.remark}` : ""}
                  </div>
                </td>
                <td>{r.groupName?.trim() || "—"}</td>
                <td title={(r.routeIds ?? []).map((id) => routeMap.get(id) ?? id).join(", ")}>
                  {routeLabel(r.routeIds ?? [])}
                </td>
                <td title={r.allowedModels.join(", ") || "全部模型"}>
                  <span className="tk-models">{modelsLabel(r.allowedModels)}</span>
                </td>
                <td className="mono" title={(r.ipAllowlist ?? []).join("\n")}>
                  {ipLabel(r.ipAllowlist ?? [])}
                </td>
                <td className="mono">{r.rateLimit <= 0 ? "不限" : r.rateLimit}</td>
                <td className="mono">{!r.concurrency ? "不限" : r.concurrency}</td>
                <td className="mono">{quotaLabel(r)}</td>
                <td>
                  <div className="tk-ops">
                    <button
                      type="button"
                      className="icon-btn"
                      title="修改策略"
                      onClick={() => startEdit(r)}
                    >
                      <IconPencil />
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      title="删除"
                      onClick={() => void remove(r)}
                    >
                      <IconTrash />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length ? (
              <tr>
                <td colSpan={9} className="empty">
                  没有匹配的密钥策略
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );

  const searchFields = (
    <>
      <input
        className="search"
        placeholder="按名称、分组、路由、状态或模型搜索"
        value={kwDraft}
        onChange={(e) => setKwDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") applySearch();
        }}
      />
      <select
        value={groupFilter}
        onChange={(e) => setGroupFilter(e.target.value)}
        aria-label="按标签/分组"
      >
        <option value="">标签: 全部</option>
        {groups.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value as "all" | "on" | "off")}
      >
        <option value="all">状态: 全部</option>
        <option value="on">启用</option>
        <option value="off">禁用</option>
      </select>
      <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
        <option value="created_desc">排序: 创建时间 (新→旧)</option>
        <option value="created_asc">排序: 创建时间 (旧→新)</option>
        <option value="used_desc">排序: 最近使用</option>
        <option value="name">排序: 名称</option>
      </select>
      <button type="button" className="btn" onClick={applySearch}>
        查询
      </button>
      <button type="button" className="btn ghost" onClick={resetSearch}>
        重置
      </button>
    </>
  );

  return (
    <>
      <div className="topbar">
        <div className="page-head">
          <h2>密钥管理</h2>
          <p>对已有 API Key 做路由、模型、IP、QPS 与额度限制（列表不展示密钥明文）</p>
        </div>
      </div>

      <div className="km-skin-picker">
        <span>布局版本（选定后会记住）</span>
        <button
          type="button"
          className={`km-skin-btn${skin === "a" ? " on" : ""}`}
          onClick={() => pickSkin("a")}
        >
          A · 统计卡片
        </button>
        <button
          type="button"
          className={`km-skin-btn${skin === "b" ? " on" : ""}`}
          onClick={() => pickSkin("b")}
        >
          B · 紧凑数字条
        </button>
        <button
          type="button"
          className={`km-skin-btn${skin === "c" ? " on" : ""}`}
          onClick={() => pickSkin("c")}
        >
          C · 左侧标签栏
        </button>
      </div>
      <p className="km-skin-hint">
        {skin === "a" && "方案 A：顶部五块统计卡 + 工具式筛选条（最接近你给的参考图）"}
        {skin === "b" && "方案 B：统计收成一行数字，筛选更紧凑，适合小屏"}
        {skin === "c" && "方案 C：左侧常驻分组标签，右侧表格；适合分组很多时快速切换"}
      </p>

      {error && !open ? <div className="alert">{error}</div> : null}
      {toast ? <div className="alert ok">{toast}</div> : null}

      {skin === "a" ? (
        <>
          <div className="km-stats">
            <div className="km-stat">
              <span>全部</span>
              <strong>{stats.total}</strong>
            </div>
            <div className="km-stat">
              <span>启用</span>
              <strong>{stats.enabled}</strong>
            </div>
            <div className="km-stat">
              <span>禁用</span>
              <strong>{stats.disabled}</strong>
            </div>
            <div className="km-stat">
              <span>未绑定路由</span>
              <strong>{stats.unbound}</strong>
            </div>
            <div className="km-stat">
              <span>即将过期</span>
              <strong>{stats.expiring}</strong>
            </div>
          </div>
          <div className="km-filters">{searchFields}</div>
          {table}
        </>
      ) : null}

      {skin === "b" ? (
        <>
          <div className="km-strip">
            <span>
              全部 <b>{stats.total}</b>
            </span>
            <span>
              启用 <b>{stats.enabled}</b>
            </span>
            <span>
              禁用 <b>{stats.disabled}</b>
            </span>
            <span>
              未绑定 <b>{stats.unbound}</b>
            </span>
            <span>
              即将过期 <b>{stats.expiring}</b>
            </span>
          </div>
          <div className="km-filters km-filters-tight">{searchFields}</div>
          {table}
        </>
      ) : null}

      {skin === "c" ? (
        <div className="km-split">
          <aside className="km-side">
            <div className="km-side-title">分组标签</div>
            <button
              type="button"
              className={`km-side-item${!groupFilter ? " on" : ""}`}
              onClick={() => setGroupFilter("")}
            >
              全部 <em>{stats.total}</em>
            </button>
            {groups.map((g) => {
              const n = rows.filter((r) => (r.groupName || "").trim() === g).length;
              return (
                <button
                  key={g}
                  type="button"
                  className={`km-side-item${groupFilter === g ? " on" : ""}`}
                  onClick={() => setGroupFilter(groupFilter === g ? "" : g)}
                >
                  {g} <em>{n}</em>
                </button>
              );
            })}
            {!groups.length ? <div className="km-side-empty">暂无分组</div> : null}
            <div className="km-side-stats">
              <div>
                启用 <b>{stats.enabled}</b>
              </div>
              <div>
                禁用 <b>{stats.disabled}</b>
              </div>
              <div>
                未绑定 <b>{stats.unbound}</b>
              </div>
            </div>
          </aside>
          <div className="km-main">
            <div className="km-filters">{searchFields}</div>
            {table}
          </div>
        </div>
      ) : null}

      {open && editing ? (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <form
            className="modal modal-token"
            onClick={(e) => e.stopPropagation()}
            onSubmit={onSubmit}
          >
            <div className="modal-user-head">
              <h3>修改密钥策略</h3>
              <p>配置分组、路由、模型、IP、QPS 与额度（不展示/不改密钥串）</p>
            </div>
            {error ? <div className="alert">{error}</div> : null}
            <div className="modal-user-grid">
              <label className="stack-field">
                <span>
                  名称 <em>*</em>
                </span>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="stack-field">
                <span>所属分组</span>
                <input
                  value={form.groupName}
                  onChange={(e) => setForm({ ...form, groupName: e.target.value })}
                  placeholder="如：内部 / 客户A"
                  list="km-group-list"
                />
                <datalist id="km-group-list">
                  {groups.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </label>
              <label className="stack-field">
                <span>状态</span>
                <select
                  value={form.enabled ? "1" : "0"}
                  onChange={(e) =>
                    setForm({ ...form, enabled: e.target.value === "1" })
                  }
                >
                  <option value="1">启用</option>
                  <option value="0">禁用</option>
                </select>
              </label>
              <label className="stack-field">
                <span>备注</span>
                <input
                  value={form.remark}
                  onChange={(e) => setForm({ ...form, remark: e.target.value })}
                />
              </label>
              <label className="stack-field">
                <span>QPS（每分钟）</span>
                <div className="rate-row">
                  <label className="check-inline">
                    <input
                      type="checkbox"
                      checked={form.rateUnlimited}
                      onChange={(e) =>
                        setForm({ ...form, rateUnlimited: e.target.checked })
                      }
                    />
                    不限
                  </label>
                  <input
                    type="number"
                    min={1}
                    disabled={form.rateUnlimited}
                    value={form.rateLimit}
                    onChange={(e) =>
                      setForm({ ...form, rateLimit: Number(e.target.value) })
                    }
                  />
                </div>
              </label>
              <label className="stack-field">
                <span>并发限制</span>
                <input
                  type="number"
                  min={0}
                  value={form.concurrency}
                  onChange={(e) =>
                    setForm({ ...form, concurrency: Number(e.target.value) })
                  }
                  placeholder="0 = 不限"
                />
              </label>
              <label className="stack-field">
                <span>配额（Token）</span>
                <div className="rate-row">
                  <label className="check-inline">
                    <input
                      type="checkbox"
                      checked={form.quotaUnlimited}
                      onChange={(e) =>
                        setForm({ ...form, quotaUnlimited: e.target.checked })
                      }
                    />
                    不限额
                  </label>
                  <input
                    type="number"
                    min={1}
                    disabled={form.quotaUnlimited}
                    value={form.quota}
                    onChange={(e) =>
                      setForm({ ...form, quota: Number(e.target.value) })
                    }
                  />
                </div>
              </label>
            </div>
            <label className="stack-field" style={{ marginTop: 12 }}>
              <span>绑定路由</span>
              <div className="km-route-picks">
                {routes.map((rt) => {
                  const on = form.routeIds.includes(rt.id);
                  return (
                    <button
                      key={rt.id}
                      type="button"
                      className={`tk-tag${on ? " on" : ""}`}
                      onClick={() =>
                        setForm({
                          ...form,
                          routeIds: on
                            ? form.routeIds.filter((x) => x !== rt.id)
                            : [...form.routeIds, rt.id],
                        })
                      }
                    >
                      {rt.model}
                      {!rt.enabled ? " (停用)" : ""}
                    </button>
                  );
                })}
                {!routes.length ? (
                  <span className="tk-tag-empty">暂无路由，请先在路由管理中创建</span>
                ) : null}
              </div>
            </label>
            <label className="stack-field" style={{ marginTop: 12 }}>
              <span>可用模型</span>
              <ModelPicker
                options={modelOptions}
                value={form.allowedModels}
                onChange={(allowedModels) => setForm({ ...form, allowedModels })}
              />
            </label>
            <label className="stack-field" style={{ marginTop: 12 }}>
              <span>IP 限制</span>
              <textarea
                className="tk-ip-area"
                rows={3}
                value={form.ipAllowlistText}
                onChange={(e) =>
                  setForm({ ...form, ipAllowlistText: e.target.value })
                }
                placeholder={"留空不限制\n每行一个 IP 或 CIDR"}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                取消
              </button>
              <button className="btn">保存</button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
