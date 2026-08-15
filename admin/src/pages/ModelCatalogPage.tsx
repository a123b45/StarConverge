import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

type ModelRow = {
  id: string;
  model: string;
  channelIds: string[];
  rewriteModel: string | null;
  enabled: boolean;
  published: boolean;
};

type Channel = { id: string; name: string; enabled: boolean };

export default function ModelCatalogPage() {
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const [m, c] = await Promise.all([
      api<{ data: ModelRow[] }>("/models"),
      api<{ data: Channel[] }>("/channels"),
    ]);
    setRows(m.data);
    setChannels(c.data);
  }

  useEffect(() => {
    load().catch((e: unknown) =>
      setError(e instanceof Error ? e.message : "加载失败"),
    );
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "published" && !r.published) return false;
      if (filter === "draft" && r.published) return false;
      if (!s) return true;
      const chNames = r.channelIds
        .map((id) => channels.find((c) => c.id === id)?.name || id)
        .join(" ");
      return (
        r.model.toLowerCase().includes(s) ||
        chNames.toLowerCase().includes(s) ||
        (r.rewriteModel || "").toLowerCase().includes(s)
      );
    });
  }, [rows, q, filter, channels]);

  function channelLabel(ids: string[]) {
    if (!ids.length) return "—";
    return ids
      .map((id) => {
        const ch = channels.find((c) => c.id === id);
        if (!ch) return id;
        return ch.enabled ? ch.name : `${ch.name}(禁用)`;
      })
      .join(" / ");
  }

  async function setPublished(row: ModelRow, published: boolean) {
    setBusyId(row.id);
    setError("");
    setMsg("");
    try {
      await api(`/models/${row.id}`, {
        method: "PUT",
        body: JSON.stringify({ published }),
      });
      setMsg(
        published
          ? `「${row.model}」已同步给用户使用`
          : `「${row.model}」已取消用户可见`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(row: ModelRow) {
    if (!confirm(`从模型管理删除「${row.model}」？`)) return;
    setBusyId(row.id);
    try {
      await api(`/models/${row.id}`, { method: "DELETE" });
      setMsg(`已删除「${row.model}」`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="page-head">
          <h2>模型管理</h2>
          <p>
            供应商「同步模型」写入此列表；在此选择是否同步给用户门户与 /v1/models
          </p>
        </div>
      </div>

      {error ? <div className="alert">{error}</div> : null}
      {msg ? (
        <div className={`alert ${msg.includes("取消") ? "" : "ok"}`}>{msg}</div>
      ) : null}

      <div className="toolbar">
        <input
          className="search"
          placeholder="搜索模型 / 供应商…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          aria-label="可见性筛选"
        >
          <option value="all">全部</option>
          <option value="published">已同步给用户</option>
          <option value="draft">未同步给用户</option>
        </select>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>模型</th>
                <th>供应商</th>
                <th>改写</th>
                <th>用户可见</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.model}</td>
                  <td>{channelLabel(r.channelIds)}</td>
                  <td className="mono">{r.rewriteModel || "—"}</td>
                  <td>
                    <span className={`badge ${r.published ? "on" : "off"}`}>
                      {r.published ? "已同步" : "未同步"}
                    </span>
                  </td>
                  <td className="row-actions">
                    {r.published ? (
                      <button
                        type="button"
                        className="btn ghost sm"
                        disabled={busyId === r.id}
                        onClick={() => void setPublished(r, false)}
                      >
                        取消用户同步
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn sm"
                        disabled={busyId === r.id}
                        onClick={() => void setPublished(r, true)}
                      >
                        同步给用户
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn danger sm"
                      disabled={busyId === r.id}
                      onClick={() => void remove(r)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr>
                  <td colSpan={5} className="empty">
                    暂无模型。请先在「供应商管理」启用供应商并点击「同步模型」。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
