import { FormEvent, useEffect, useState } from "react";
import { formatTokens, portalApi } from "../../lib/api";

type KeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  key: string | null;
  quota: number;
  usedQuota: number;
  createdAt: string | Date;
};

export default function PortalKeysPage() {
  const [rows, setRows] = useState<KeyRow[]>([]);
  const [error, setError] = useState("");
  const [name, setName] = useState("Default Key");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Record<string, string>>({});

  async function load() {
    const res = await portalApi<{ data: KeyRow[] }>("/keys");
    setRows(res.data);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await portalApi<{ key: string }>("/keys", {
        method: "POST",
        body: JSON.stringify({ name, quota: 1_000_000 }),
      });
      setCreatedKey(res.key);
      setName("Default Key");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    }
  }

  async function view(id: string) {
    const res = await portalApi<{ key: string | null }>(`/keys/${id}`);
    if (res.key) setReveal((m) => ({ ...m, [id]: res.key! }));
  }

  async function remove(id: string) {
    if (!window.confirm("确定删除该密钥？")) return;
    await portalApi(`/keys/${id}`, { method: "DELETE" });
    await load();
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
  }

  return (
    <div className="portal-page">
      <div className="portal-hero">
        <div>
          <h1>API 密钥</h1>
          <p>管理您的 API 密钥，保障 StarConverge 接入安全</p>
        </div>
      </div>

      <div className="portal-callout">
        密钥仅在创建时完整展示一次。请勿提交到公开仓库或与他人分享。
      </div>

      {createdKey ? (
        <div className="portal-created-key">
          <strong>请立即复制新密钥：</strong>
          <code>{createdKey}</code>
          <button className="portal-btn ghost" type="button" onClick={() => copy(createdKey)}>
            复制
          </button>
          <button className="portal-btn ghost" type="button" onClick={() => setCreatedKey(null)}>
            关闭
          </button>
        </div>
      ) : null}

      {error ? <div className="alert">{error}</div> : null}

      <form className="portal-panel row-form" onSubmit={create}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="密钥名称"
          required
        />
        <button className="portal-btn" type="submit">
          + 获取 API 密钥
        </button>
      </form>

      <div className="portal-panel">
        <table className="portal-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>密钥</th>
              <th>配额</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const shown = reveal[r.id] ?? r.key ?? `${r.keyPrefix}••••`;
              return (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>
                    <code className="portal-key">{shown}</code>
                  </td>
                  <td className="mono">
                    {formatTokens(r.usedQuota)} / {formatTokens(r.quota)}
                  </td>
                  <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td className="row-actions">
                    <button
                      className="portal-btn ghost sm"
                      type="button"
                      onClick={() => copy(reveal[r.id] || r.key || r.keyPrefix)}
                    >
                      复制
                    </button>
                    <button
                      className="portal-btn ghost sm"
                      type="button"
                      onClick={() => void view(r.id)}
                    >
                      查看
                    </button>
                    <button
                      className="portal-btn ghost sm"
                      type="button"
                      onClick={() => void remove(r.id)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              );
            })}
            {!rows.length ? (
              <tr>
                <td colSpan={5} className="muted">
                  还没有密钥，点击上方创建
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
