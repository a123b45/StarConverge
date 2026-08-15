import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import ModelPicker from "../components/ModelPicker";
import SoftSelect from "../components/SoftSelect";
import SoftToast from "../components/SoftToast";
import { IconPencil, IconTrash } from "../components/icons";
import {
  type IpRule,
  normalizeIpRules,
  parseIpRulesImport,
  rulesToImportJson,
  summarizeIpRules,
} from "../lib/ip-rules";

type Token = {
  id: string;
  name: string;
  quota: number;
  usedQuota: number;
  remainingQuota: number;
  rateLimit: number;
  concurrency: number;
  enabled: boolean;
  allowedModels: string[];
  groupName: string;
  ipRules?: IpRule[];
  ipAllowlist: string[];
  routeIds: string[];
  lastUsedAt: string | Date | null;
  expiresAt: string | Date | null;
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
  concurrencyUnlimited: boolean;
  concurrency: number;
  allowedModels: string[];
  routeIds: string[];
  ipRules: IpRule[];
  enabled: boolean;
};

type IpSkin = "a" | "b" | "c";
const IP_SKIN_KEY = "sc-ip-editor-skin";

const emptyForm = (): FormState => ({
  name: "",
  groupName: "",
  quotaUnlimited: true,
  quota: 1_000_000,
  rateUnlimited: false,
  rateLimit: 60,
  concurrencyUnlimited: true,
  concurrency: 50,
  allowedModels: [],
  routeIds: [],
  ipRules: [],
  enabled: true,
});

function loadIpSkin(): IpSkin {
  const v = localStorage.getItem(IP_SKIN_KEY);
  return v === "b" || v === "c" ? v : "a";
}

function tokenRules(t: Token): IpRule[] {
  if (t.ipRules?.length) return normalizeIpRules(t.ipRules);
  return normalizeIpRules(t.ipAllowlist ?? []);
}

export default function TokensPage() {
  const [rows, setRows] = useState<Token[]>([]);
  const [routes, setRoutes] = useState<RouteOpt[]>([]);
  const [modelOptions, setModelOptions] = useState<string[]>(["*"]);
  const [kw, setKw] = useState("");
  const [kwDraft, setKwDraft] = useState("");
  /** 标签 = 列名；状态 = 该列的值 */
  const [tagCol, setTagCol] = useState<
    "" | "group" | "route" | "model" | "enabled" | "ip"
  >("");
  const [tagVal, setTagVal] = useState("");
  const [sort, setSort] = useState<"created_desc" | "created_asc" | "used_desc" | "name">(
    "created_desc",
  );
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Token | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [ipSkin, setIpSkin] = useState<IpSkin>(loadIpSkin);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [jsonDraft, setJsonDraft] = useState("");

  function mapToken(t: Token): Token {
    return {
      ...t,
      groupName: t.groupName ?? "",
      ipRules: tokenRules(t),
      ipAllowlist: t.ipAllowlist ?? [],
      routeIds: t.routeIds ?? [],
      concurrency: t.concurrency ?? 0,
      remainingQuota:
        t.remainingQuota ??
        (t.quota < 0 ? -1 : Math.max(0, t.quota - t.usedQuota)),
    };
  }

  /** List first so table paints quickly; meta loads in background for edit form. */
  async function loadList() {
    setListLoading(true);
    try {
      const tok = await api<{ data: Token[] }>("/tokens");
      setRows(tok.data.map(mapToken));
    } finally {
      setListLoading(false);
    }
  }

  async function loadMeta() {
    const [models, mrs] = await Promise.all([
      api<{ data: string[] }>("/available-models"),
      api<{ data: RouteOpt[] }>("/models"),
    ]);
    setModelOptions(models.data.length ? models.data : ["*"]);
    setRoutes(mrs.data ?? []);
  }

  async function load() {
    await Promise.all([loadList(), loadMeta()]);
  }

  useEffect(() => {
    loadList().catch((e) => setError(e.message));
    loadMeta().catch(() => {
      /* meta is only needed when editing */
    });
  }, []);

  function pickIpSkin(s: IpSkin) {
    setIpSkin(s);
    localStorage.setItem(IP_SKIN_KEY, s);
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

  const tagValOptions = useMemo(() => {
    const all = [{ value: "", label: "状态: 全部" }];
    if (!tagCol) return all;
    if (tagCol === "group") {
      return [
        ...all,
        ...groups.map((g) => ({ value: g, label: g })),
        { value: "__empty__", label: "（未分组）" },
      ];
    }
    if (tagCol === "route") {
      const set = new Set<string>();
      for (const r of rows) {
        for (const id of r.routeIds ?? []) {
          set.add(routeMap.get(id) ?? id);
        }
      }
      return [
        ...all,
        { value: "__empty__", label: "（未绑定）" },
        ...[...set].sort().map((m) => ({ value: m, label: m })),
      ];
    }
    if (tagCol === "model") {
      const set = new Set<string>();
      for (const r of rows) {
        if (!r.allowedModels.length) set.add("*");
        else r.allowedModels.forEach((m) => set.add(m));
      }
      return [
        ...all,
        ...[...set].sort().map((m) => ({
          value: m,
          label: m === "*" ? "全部模型" : m,
        })),
      ];
    }
    if (tagCol === "enabled") {
      return [
        ...all,
        { value: "on", label: "启用" },
        { value: "off", label: "禁用" },
      ];
    }
    if (tagCol === "ip") {
      return [
        ...all,
        { value: "none", label: "不限" },
        { value: "has", label: "有限制" },
      ];
    }
    return all;
  }, [tagCol, groups, rows, routeMap]);

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
    return { total: rows.length, enabled, disabled, unbound, expiring };
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
          r.allowedModels.some((m) => m.toLowerCase().includes(q)) ||
          routeNames.toLowerCase().includes(q) ||
          String(r.enabled ? "启用" : "禁用").includes(q);
        if (!hit) return false;
      }
      if (tagCol && tagVal) {
        if (tagCol === "group") {
          const g = (r.groupName || "").trim();
          if (tagVal === "__empty__") {
            if (g) return false;
          } else if (g !== tagVal) return false;
        } else if (tagCol === "route") {
          const names = (r.routeIds ?? []).map((id) => routeMap.get(id) ?? id);
          if (tagVal === "__empty__") {
            if (names.length) return false;
          } else if (!names.includes(tagVal)) return false;
        } else if (tagCol === "model") {
          if (tagVal === "*") {
            if (r.allowedModels.length) return false;
          } else if (!r.allowedModels.includes(tagVal)) return false;
        } else if (tagCol === "enabled") {
          if (tagVal === "on" && !r.enabled) return false;
          if (tagVal === "off" && r.enabled) return false;
        } else if (tagCol === "ip") {
          const rules = tokenRules(r);
          if (tagVal === "none" && rules.length) return false;
          if (tagVal === "has" && !rules.length) return false;
        }
      }
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
  }, [rows, kw, tagCol, tagVal, sort, routeMap]);

  function applySearch() {
    setKw(kwDraft.trim());
  }

  function resetSearch() {
    setKwDraft("");
    setKw("");
    setTagCol("");
    setTagVal("");
    setSort("created_desc");
  }

  function startEdit(row: Token) {
    const rules = tokenRules(row);
    setEditing(row);
    setForm({
      name: row.name,
      groupName: row.groupName || "",
      quotaUnlimited: row.quota < 0,
      quota: row.quota < 0 ? 1_000_000 : row.quota,
      rateUnlimited: row.rateLimit <= 0,
      rateLimit: row.rateLimit <= 0 ? 60 : row.rateLimit,
      concurrencyUnlimited: !row.concurrency,
      concurrency: row.concurrency || 50,
      allowedModels: [...row.allowedModels],
      routeIds: [...(row.routeIds ?? [])],
      ipRules: rules,
      enabled: row.enabled,
    });
    setJsonDraft(rulesToImportJson(rules));
    setImportError("");
    setOpen(true);
  }

  function setRules(next: IpRule[]) {
    setForm((f) => ({ ...f, ipRules: next }));
    setJsonDraft(rulesToImportJson(next));
  }

  function addEmptyRule() {
    setRules([...form.ipRules, { name: "", ip: "", action: "ALLOW" }]);
  }

  function updateRule(i: number, patch: Partial<IpRule>) {
    setRules(form.ipRules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function removeRule(i: number) {
    setRules(form.ipRules.filter((_, idx) => idx !== i));
  }

  function applyImport(replace: boolean) {
    setImportError("");
    try {
      const imported = parseIpRulesImport(importText);
      if (!imported.length) throw new Error("未解析到有效规则");
      const next = replace ? imported : [...form.ipRules, ...imported];
      setRules(next);
      setImportOpen(false);
      setImportText("");
      setToast("规则已导入");
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "导入失败");
    }
  }

  function syncJsonDraft() {
    setImportError("");
    try {
      setRules(parseIpRulesImport(jsonDraft));
      setToast("JSON 已同步到规则");
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "JSON 无效");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError("");
    const cleaned = form.ipRules
      .map((r) => ({
        name: (r.name ?? "").trim(),
        ip: r.ip.trim(),
        action: r.action === "DENY" ? ("DENY" as const) : ("ALLOW" as const),
      }))
      .filter((r) => r.ip);
    const payload = {
      name: form.name,
      groupName: form.groupName,
      quota: form.quotaUnlimited ? -1 : Number(form.quota),
      rateLimit: form.rateUnlimited ? 0 : Number(form.rateLimit),
      concurrency: form.concurrencyUnlimited ? 0 : Number(form.concurrency) || 0,
      allowedModels: form.allowedModels,
      routeIds: form.routeIds,
      ipRules: cleaned,
      enabled: form.enabled,
    };
    try {
      await api(`/tokens/${editing.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setToast("策略已更新");
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

  function quotaLabel(r: Token) {
    const remaining = r.quota < 0 ? "∞" : (r.remainingQuota ?? 0).toLocaleString();
    const total = r.quota < 0 ? "∞" : r.quota.toLocaleString();
    return `${remaining} / ${total}`;
  }

  const sampleJson = `{
  "rules": [
    {
      "name": "允许公司内部办公网段",
      "ip": "192.168.1.0/24",
      "action": "ALLOW"
    },
    {
      "name": "允许特定的VPN出口IP",
      "ip": "203.0.113.25",
      "action": "ALLOW"
    },
    {
      "name": "阻止来自恶意IP的访问",
      "ip": "198.51.100.0/24",
      "action": "DENY"
    }
  ]
}`;

  const ruleEditor = (
    <div className="ip-editor">
      <div className="km-skin-picker ip-skin-picker">
        <span>IP 编辑版本</span>
        <button
          type="button"
          className={`km-skin-btn${ipSkin === "a" ? " on" : ""}`}
          onClick={() => pickIpSkin("a")}
        >
          A · 规则卡片
        </button>
        <button
          type="button"
          className={`km-skin-btn${ipSkin === "b" ? " on" : ""}`}
          onClick={() => pickIpSkin("b")}
        >
          B · 双栏 JSON
        </button>
        <button
          type="button"
          className={`km-skin-btn${ipSkin === "c" ? " on" : ""}`}
          onClick={() => pickIpSkin("c")}
        >
          C · 紧凑行表
        </button>
      </div>
      <p className="km-skin-hint">
        {ipSkin === "a" && "方案 A：卡片列表 + 导入 JSON 弹窗（推荐）"}
        {ipSkin === "b" && "方案 B：左侧规则、右侧 JSON 实时对照，适合批量改"}
        {ipSkin === "c" && "方案 C：紧凑表格行，适合规则很多时快速扫"}
      </p>

      <div className="ip-toolbar">
        <button type="button" className="btn ghost" onClick={addEmptyRule}>
          添加规则
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            setImportText(sampleJson);
            setImportError("");
            setImportOpen(true);
          }}
        >
          导入 JSON
        </button>
        <span className="ip-hint">支持单 IP 与 CIDR 网段；空规则 = 不限制</span>
      </div>

      {ipSkin === "a" ? (
        <div className="ip-cards">
          {form.ipRules.map((r, i) => (
            <div key={i} className={`ip-card ${r.action === "DENY" ? "deny" : "allow"}`}>
              <input
                className="ip-card-name"
                placeholder="规则名称（可选）"
                value={r.name ?? ""}
                onChange={(e) => updateRule(i, { name: e.target.value })}
              />
              <input
                className="ip-card-ip mono"
                placeholder="IP 或 CIDR，如 192.168.1.0/24"
                value={r.ip}
                onChange={(e) => updateRule(i, { ip: e.target.value })}
              />
              <SoftSelect
                value={r.action}
                onChange={(action) =>
                  updateRule(i, { action: action === "DENY" ? "DENY" : "ALLOW" })
                }
                options={[
                  { value: "ALLOW", label: "允许 ALLOW" },
                  { value: "DENY", label: "拒绝 DENY" },
                ]}
              />
              <button type="button" className="icon-btn danger" onClick={() => removeRule(i)}>
                <IconTrash />
              </button>
            </div>
          ))}
          {!form.ipRules.length ? (
            <div className="ip-empty">暂无 IP 规则，点击「添加规则」或「导入 JSON」</div>
          ) : null}
        </div>
      ) : null}

      {ipSkin === "b" ? (
        <div className="ip-split">
          <div className="ip-cards">
            {form.ipRules.map((r, i) => (
              <div key={i} className={`ip-card ${r.action === "DENY" ? "deny" : "allow"}`}>
                <input
                  placeholder="名称"
                  value={r.name ?? ""}
                  onChange={(e) => updateRule(i, { name: e.target.value })}
                />
                <input
                  className="mono"
                  placeholder="IP/CIDR"
                  value={r.ip}
                  onChange={(e) => updateRule(i, { ip: e.target.value })}
                />
                <SoftSelect
                  value={r.action}
                  onChange={(action) =>
                    updateRule(i, { action: action === "DENY" ? "DENY" : "ALLOW" })
                  }
                  options={[
                    { value: "ALLOW", label: "ALLOW" },
                    { value: "DENY", label: "DENY" },
                  ]}
                />
                <button type="button" className="icon-btn danger" onClick={() => removeRule(i)}>
                  <IconTrash />
                </button>
              </div>
            ))}
          </div>
          <div className="ip-json-pane">
            <textarea
              className="tk-ip-area mono"
              rows={12}
              value={jsonDraft}
              onChange={(e) => setJsonDraft(e.target.value)}
            />
            <button type="button" className="btn" onClick={syncJsonDraft}>
              同步 JSON → 规则
            </button>
            {importError ? <div className="alert">{importError}</div> : null}
          </div>
        </div>
      ) : null}

      {ipSkin === "c" ? (
        <div className="ip-table-wrap">
          <table className="table ip-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>IP / 网段</th>
                <th>动作</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {form.ipRules.map((r, i) => (
                <tr key={i}>
                  <td>
                    <input
                      value={r.name ?? ""}
                      onChange={(e) => updateRule(i, { name: e.target.value })}
                      placeholder="可选"
                    />
                  </td>
                  <td>
                    <input
                      className="mono"
                      value={r.ip}
                      onChange={(e) => updateRule(i, { ip: e.target.value })}
                      placeholder="1.2.3.4 或 10.0.0.0/8"
                    />
                  </td>
                  <td>
                    <SoftSelect
                      value={r.action}
                      onChange={(action) =>
                        updateRule(i, { action: action === "DENY" ? "DENY" : "ALLOW" })
                      }
                      options={[
                        { value: "ALLOW", label: "ALLOW" },
                        { value: "DENY", label: "DENY" },
                      ]}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="icon-btn danger"
                      onClick={() => removeRule(i)}
                    >
                      <IconTrash />
                    </button>
                  </td>
                </tr>
              ))}
              {!form.ipRules.length ? (
                <tr>
                  <td colSpan={4} className="empty">
                    暂无规则
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      <SoftToast message={toast} onDone={() => setToast(null)} />

      <div className="topbar">
        <div className="page-head">
          <h2>密钥管理</h2>
          <p>对已有 API Key 做路由、模型、IP、QPS 与额度限制（列表不展示密钥明文）</p>
        </div>
      </div>

      {error && !open ? <div className="alert">{error}</div> : null}

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

      <div className="km-filters">
        <input
          className="search"
          placeholder="按名称、分组、路由、状态或模型搜索"
          value={kwDraft}
          onChange={(e) => setKwDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applySearch();
          }}
        />
        <SoftSelect
          className="soft-select-filter"
          ariaLabel="标签列"
          value={tagCol}
          onChange={(v) => {
            setTagCol(v as typeof tagCol);
            setTagVal("");
          }}
          options={[
            { value: "", label: "标签: 全部" },
            { value: "group", label: "所属分组" },
            { value: "route", label: "路由" },
            { value: "model", label: "可用模型" },
            { value: "enabled", label: "启用状态" },
            { value: "ip", label: "IP 限制" },
          ]}
        />
        <SoftSelect
          className="soft-select-filter"
          ariaLabel="状态值"
          value={tagVal}
          onChange={setTagVal}
          disabled={!tagCol}
          options={tagValOptions}
        />
        <SoftSelect
          className="soft-select-filter"
          ariaLabel="排序"
          value={sort}
          onChange={(v) => setSort(v as typeof sort)}
          options={[
            { value: "created_desc", label: "排序: 创建时间 (新→旧)" },
            { value: "created_asc", label: "排序: 创建时间 (旧→新)" },
            { value: "used_desc", label: "排序: 最近使用" },
            { value: "name", label: "排序: 名称" },
          ]}
        />
        <button type="button" className="btn" onClick={applySearch}>
          查询
        </button>
        <button type="button" className="btn ghost" onClick={resetSearch}>
          重置
        </button>
      </div>

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
                    </div>
                  </td>
                  <td>{r.groupName?.trim() || "—"}</td>
                  <td title={(r.routeIds ?? []).map((id) => routeMap.get(id) ?? id).join(", ")}>
                    {routeLabel(r.routeIds ?? [])}
                  </td>
                  <td title={r.allowedModels.join(", ") || "全部模型"}>
                    <span className="tk-models">{modelsLabel(r.allowedModels)}</span>
                  </td>
                  <td title={summarizeIpRules(tokenRules(r))}>
                    {summarizeIpRules(tokenRules(r))}
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
                    {listLoading ? "加载中…" : "没有匹配的密钥策略"}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

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
              <div className="stack-field">
                <span>状态</span>
                <SoftSelect
                  value={form.enabled ? "1" : "0"}
                  onChange={(v) => setForm({ ...form, enabled: v === "1" })}
                  options={[
                    { value: "1", label: "启用" },
                    { value: "0", label: "禁用" },
                  ]}
                />
              </div>
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
                <div className="rate-row">
                  <label className="check-inline">
                    <input
                      type="checkbox"
                      checked={form.concurrencyUnlimited}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          concurrencyUnlimited: e.target.checked,
                        })
                      }
                    />
                    不限
                  </label>
                  <input
                    type="number"
                    min={1}
                    disabled={form.concurrencyUnlimited}
                    value={form.concurrency}
                    onChange={(e) =>
                      setForm({ ...form, concurrency: Number(e.target.value) })
                    }
                  />
                </div>
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

            <div className="stack-field" style={{ marginTop: 12 }}>
              <span>绑定路由</span>
              <div className="km-route-picks">
                {routes.map((rt) => {
                  const on = form.routeIds.includes(rt.id);
                  return (
                    <button
                      key={rt.id}
                      type="button"
                      className={`km-route-chip${on ? " on" : ""}`}
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
            </div>

            <div className="stack-field" style={{ marginTop: 12 }}>
              <span>可用模型</span>
              <ModelPicker
                options={modelOptions}
                value={form.allowedModels}
                onChange={(allowedModels) => setForm({ ...form, allowedModels })}
              />
            </div>

            <div className="stack-field" style={{ marginTop: 12 }}>
              <span>IP 限制</span>
              {ruleEditor}
            </div>

            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                取消
              </button>
              <button className="btn">保存</button>
            </div>
          </form>
        </div>
      ) : null}

      {importOpen ? (
        <div className="modal-backdrop" onClick={() => setImportOpen(false)}>
          <div className="modal modal-token" onClick={(e) => e.stopPropagation()}>
            <div className="modal-user-head">
              <h3>导入 IP 规则 JSON</h3>
              <p>格式：{`{ "rules": [ { "name", "ip", "action": "ALLOW"|"DENY" } ] }`}</p>
            </div>
            {importError ? <div className="alert">{importError}</div> : null}
            <textarea
              className="tk-ip-area mono"
              rows={14}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setImportOpen(false)}>
                取消
              </button>
              <button type="button" className="btn ghost" onClick={() => applyImport(false)}>
                追加导入
              </button>
              <button type="button" className="btn" onClick={() => applyImport(true)}>
                覆盖导入
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
