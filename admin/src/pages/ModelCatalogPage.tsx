import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import SoftSelect from "../components/SoftSelect";
import { softConfirm } from "../components/SoftDialog";

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
  const [bulkBusy, setBulkBusy] = useState(false);

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

  async function publishMany(list: ModelRow[], label: string) {
    const targets = list.filter((r) => !r.published);
    if (!targets.length) {
      setMsg(`${label}：当前没有需要同步的模型（均已同步给用户）`);
      return;
    }
    setBulkBusy(true);
    setError("");
    setMsg("");
    let ok = 0;
    let fail = 0;
    try {
      for (const row of targets) {
        try {
          await api(`/models/${row.id}`, {
            method: "PUT",
            body: JSON.stringify({ published: true }),
          });
          ok += 1;
        } catch {
          fail += 1;
        }
      }
      setMsg(
        fail
          ? `${label}：成功 ${ok} 个，失败 ${fail} 个`
          : `${label}：已将 ${ok} 个模型同步给用户`,
      );
      await load();
    } finally {
      setBulkBusy(false);
    }
  }

  async function remove(row: ModelRow) {
    const ok = await softConfirm({
      title: "删除模型",
      message: `从模型管理删除「${row.model}」？`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
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

  const filterDraftCount = filtered.filter((r) => !r.published).length;
  const allDraftCount = rows.filter((r) => !r.published).length;

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
        <div className={`alert ${msg.includes("取消") || msg.includes("失败") ? "" : "ok"}`}>
          {msg}
        </div>
      ) : null}

      <div className="toolbar mc-toolbar">
        <input
          className="search"
          placeholder="搜索模型 / 供应商…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <SoftSelect
          className="soft-select-filter"
          ariaLabel="可见性筛选"
          value={filter}
          onChange={(v) => setFilter(v as typeof filter)}
          options={[
            { value: "all", label: "全部" },
            { value: "published", label: "已同步给用户" },
            { value: "draft", label: "未同步给用户" },
          ]}
        />
        <button
          type="button"
          className="btn ghost"
          disabled={bulkBusy || filterDraftCount === 0}
          title="将当前筛选结果中未同步的模型同步给用户"
          onClick={() => void publishMany(filtered, "筛选同步")}
        >
          {bulkBusy ? "同步中…" : `筛选同步${filterDraftCount ? ` (${filterDraftCount})` : ""}`}
        </button>
        <button
          type="button"
          className="btn"
          disabled={bulkBusy || allDraftCount === 0}
          title="将全部未同步模型同步给用户"
          onClick={() => void publishMany(rows, "全部同步")}
        >
          {bulkBusy ? "同步中…" : `全部同步${allDraftCount ? ` (${allDraftCount})` : ""}`}
        </button>
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
                        disabled={busyId === r.id || bulkBusy}
                        onClick={() => void setPublished(r, false)}
                      >
                        取消用户同步
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn sm"
                        disabled={busyId === r.id || bulkBusy}
                        onClick={() => void setPublished(r, true)}
                      >
                        同步给用户
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn danger sm"
                      disabled={busyId === r.id || bulkBusy}
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
