import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import ModelPicker from "../components/ModelPicker";

type Token = {
  id: string;
  name: string;
  keyPrefix: string;
  key: string | null;
  quota: number;
  usedQuota: number;
  rateLimit: number;
  enabled: boolean;
  allowedModels: string[];
  remark: string | null;
};

export default function TokensPage() {
  const [rows, setRows] = useState<Token[]>([]);
  const [modelOptions, setModelOptions] = useState<string[]>(["*"]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [revealId, setRevealId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    quota: -1,
    rateLimit: 60,
    allowedModels: [] as string[],
    remark: "",
  });
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  async function load() {
    const [tok, models] = await Promise.all([
      api<{ data: Token[] }>("/tokens"),
      api<{ data: string[] }>("/available-models"),
    ]);
    setRows(tok.data);
    setModelOptions(models.data.length ? models.data : ["*"]);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const s = q.toLowerCase();
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        r.keyPrefix.toLowerCase().includes(s) ||
        (r.key ?? "").toLowerCase().includes(s) ||
        (r.remark ?? "").toLowerCase().includes(s),
    );
  }, [rows, q]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api<{ data: Token; key: string }>("/tokens", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          quota: Number(form.quota),
          rateLimit: Number(form.rateLimit),
          allowedModels: form.allowedModels,
          remark: form.remark,
        }),
      });
      setOpen(false);
      setForm({ name: "", quota: -1, rateLimit: 60, allowedModels: [], remark: "" });
      flash("令牌已创建，可在列表中查看/复制");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    }
  }

  async function toggle(row: Token) {
    await api(`/tokens/${row.id}`, {
      method: "PUT",
      body: JSON.stringify({ enabled: !row.enabled }),
    });
    await load();
  }

  async function resetQuota(row: Token) {
    if (
      !confirm(
        `将「${row.name}」的已用配额从 ${row.usedQuota} 清零？\n（不影响总额度上限，只重置已消耗量）`,
      )
    ) {
      return;
    }
    await api(`/tokens/${row.id}`, {
      method: "PUT",
      body: JSON.stringify({ usedQuota: 0 }),
    });
    flash("已用配额已清零");
    await load();
  }

  async function remove(row: Token) {
    if (!confirm(`删除令牌「${row.name}」？`)) return;
    await api(`/tokens/${row.id}`, { method: "DELETE" });
    await load();
  }

  async function copyKey(key: string) {
    await navigator.clipboard.writeText(key);
    flash("已复制密钥");
  }

  return (
    <>
      <div className="topbar">
        <div className="page-head">
          <h2>令牌管理</h2>
          <p>密钥可随时查看复制；「重置用量」只清零已消耗配额，不改总额度</p>
        </div>
        <button className="btn" onClick={() => setOpen(true)}>
          创建令牌
        </button>
      </div>

      {error ? <div className="alert">{error}</div> : null}
      {toast ? <div className="alert ok">{toast}</div> : null}

      <div className="toolbar">
        <input
          className="search"
          placeholder="搜索名称 / 密钥 / 备注"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>名称</th>
                <th>密钥</th>
                <th>配额用量</th>
                <th>限流</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const pct =
                  r.quota < 0
                    ? 0
                    : Math.min(100, Math.round((r.usedQuota / Math.max(1, r.quota)) * 100));
                const fillClass =
                  r.quota < 0 ? "" : pct >= 90 ? "danger" : pct >= 70 ? "warn" : "";
                const shown =
                  revealId === r.id && r.key
                    ? r.key
                    : r.key
                      ? `${r.keyPrefix}••••••••`
                      : `${r.keyPrefix}…（旧令牌不可回看）`;
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                      {r.allowedModels.length ? (
                        <div style={{ color: "var(--muted)", fontSize: "0.78rem", marginTop: 4 }}>
                          模型: {r.allowedModels.join(", ")}
                        </div>
                      ) : (
                        <div style={{ color: "var(--muted)", fontSize: "0.78rem", marginTop: 4 }}>
                          全部模型
                        </div>
                      )}
                    </td>
                    <td style={{ maxWidth: 280 }}>
                      <div className="mono" style={{ fontSize: "0.78rem", wordBreak: "break-all" }}>
                        {shown}
                      </div>
                      <div className="row-actions" style={{ marginTop: 6 }}>
                        {r.key ? (
                          <>
                            <button
                              className="btn ghost sm"
                              onClick={() =>
                                setRevealId((id) => (id === r.id ? null : r.id))
                              }
                            >
                              {revealId === r.id ? "隐藏" : "查看"}
                            </button>
                            <button className="btn ghost sm" onClick={() => copyKey(r.key!)}>
                              复制
                            </button>
                          </>
                        ) : (
                          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                            创建于明文存储上线前
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="quota">
                        <span className="mono" style={{ fontSize: "0.82rem" }}>
                          {r.usedQuota.toLocaleString()} /{" "}
                          {r.quota < 0 ? "∞" : r.quota.toLocaleString()}
                        </span>
                        {r.quota >= 0 ? (
                          <div className="quota-track">
                            <div
                              className={`quota-fill ${fillClass}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="mono">{r.rateLimit}/min</td>
                    <td>
                      <span className={`badge ${r.enabled ? "on" : "off"}`}>
                        {r.enabled ? "启用" : "禁用"}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="btn ghost sm" onClick={() => toggle(r)}>
                          {r.enabled ? "禁用" : "启用"}
                        </button>
                        <button
                          className="btn ghost sm"
                          title="将已用配额重置为 0，总额度上限不变"
                          onClick={() => resetQuota(r)}
                        >
                          重置用量
                        </button>
                        <button className="btn danger sm" onClick={() => remove(r)}>
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length ? (
                <tr>
                  <td colSpan={6} className="empty">
                    暂无令牌
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {open ? (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
            <h3>创建令牌</h3>
            <div className="form-grid">
              <label>
                名称
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例如：张三 / 内部测试"
                />
              </label>
              <label>
                配额（Token 数，-1 无限）
                <input
                  type="number"
                  value={form.quota}
                  onChange={(e) => setForm({ ...form, quota: Number(e.target.value) })}
                />
              </label>
              <label>
                每分钟限流
                <input
                  type="number"
                  value={form.rateLimit}
                  onChange={(e) => setForm({ ...form, rateLimit: Number(e.target.value) })}
                />
              </label>
              <label>
                允许模型
                <ModelPicker
                  options={modelOptions}
                  value={form.allowedModels}
                  onChange={(allowedModels) => setForm({ ...form, allowedModels })}
                />
              </label>
              <label>
                备注
                <input
                  value={form.remark}
                  onChange={(e) => setForm({ ...form, remark: e.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                取消
              </button>
              <button className="btn">创建</button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
