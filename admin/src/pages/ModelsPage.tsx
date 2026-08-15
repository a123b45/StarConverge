import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import SoftSelect from "../components/SoftSelect";
import { softConfirm } from "../components/SoftDialog";

type ModelRoute = {
  id: string;
  model: string;
  channelIds: string[];
  rewriteModel: string | null;
  enabled: boolean;
  published?: boolean;
};

type Channel = {
  id: string;
  name: string;
  enabled?: boolean;
  models?: string[];
};

export default function ModelsPage() {
  const [rows, setRows] = useState<ModelRoute[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    model: "",
    channelId: "",
    rewriteModel: "",
    enabled: true,
  });
  const [providerModels, setProviderModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const [m, c] = await Promise.all([
      api<{ data: ModelRoute[] }>("/models"),
      api<{ data: Channel[] }>("/channels"),
    ]);
    setRows(m.data);
    setChannels(c.data);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const channelOptions = useMemo(
    () =>
      channels
        .filter((c) => c.enabled !== false)
        .map((c) => ({ value: c.id, label: c.name })),
    [channels],
  );

  const rewriteOptions = useMemo(() => {
    const opts = providerModels
      .filter((m) => m && m !== "*")
      .map((m) => ({ value: m, label: m }));
    if (form.rewriteModel && !opts.some((o) => o.value === form.rewriteModel)) {
      opts.unshift({ value: form.rewriteModel, label: form.rewriteModel });
    }
    return opts;
  }, [providerModels, form.rewriteModel]);

  async function loadProviderModels(channelId: string) {
    if (!channelId) {
      setProviderModels([]);
      return;
    }
    const ch = channels.find((c) => c.id === channelId);
    const local = (ch?.models ?? []).filter((m) => m && m !== "*");
    if (local.length) {
      setProviderModels(local);
      return;
    }
    setModelsLoading(true);
    try {
      const res = await api<{
        ok?: boolean;
        models?: string[];
      }>(`/channels/${channelId}/test`, { method: "POST" });
      setProviderModels((res.models ?? []).filter((m) => m && m !== "*"));
    } catch {
      setProviderModels([]);
    } finally {
      setModelsLoading(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.channelId) {
      setError("请选择服务商");
      return;
    }
    if (!form.rewriteModel) {
      setError("请选择上游真实模型名");
      return;
    }
    try {
      setError("");
      await api("/models", {
        method: "POST",
        body: JSON.stringify({
          model: form.model.trim(),
          channelIds: [form.channelId],
          rewriteModel: form.rewriteModel || null,
          enabled: form.enabled,
        }),
      });
      setOpen(false);
      setForm({ model: "", channelId: "", rewriteModel: "", enabled: true });
      setProviderModels([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  async function remove(row: ModelRoute) {
    const ok = await softConfirm({
      title: "删除路由",
      message: `确定删除路由「${row.model}」？`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    await api(`/models/${row.id}`, { method: "DELETE" });
    await load();
  }

  function channelName(id: string) {
    return channels.find((c) => c.id === id)?.name ?? id;
  }

  function openCreate() {
    setError("");
    setForm({ model: "", channelId: "", rewriteModel: "", enabled: true });
    setProviderModels([]);
    setOpen(true);
  }

  return (
    <>
      <div className="topbar">
        <div className="page-head">
          <h2>路由管理</h2>
          <p>对外模型名可映射到指定服务商的上游真实模型；同步后用户按对外名称选择</p>
        </div>
        <button className="btn" onClick={openCreate}>
          新建路由
        </button>
      </div>
      {error && !open ? <div className="alert">{error}</div> : null}
      <div className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>对外模型</th>
                <th>服务商</th>
                <th>真实模型</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.model}</td>
                  <td>
                    {r.channelIds.length
                      ? r.channelIds.map(channelName).join(" / ")
                      : "—"}
                  </td>
                  <td className="mono">{r.rewriteModel || r.model}</td>
                  <td>
                    <span className={`badge ${r.enabled ? "on" : "off"}`}>
                      {r.enabled ? "启用" : "禁用"}
                    </span>
                  </td>
                  <td>
                    <button className="btn danger sm" onClick={() => void remove(r)}>
                      删除
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={5} className="empty">
                    暂无路由。新建后可在「模型管理」同步给用户，用户按对外模型名调用。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {open ? (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => void onSubmit(e)}>
            <h3>新建路由</h3>
            {error ? <div className="alert">{error}</div> : null}
            <div className="form-grid">
              <label>
                对外模型名
                <input
                  required
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder="用户侧看到的名称，如 GPT-5.6"
                />
              </label>
              <label>
                服务商
                <SoftSelect
                  className="soft-select-filter"
                  ariaLabel="服务商"
                  value={form.channelId}
                  placeholder="选择服务商"
                  options={
                    channelOptions.length
                      ? channelOptions
                      : [{ value: "", label: "暂无可用服务商" }]
                  }
                  onChange={(id) => {
                    setForm({ ...form, channelId: id, rewriteModel: "" });
                    void loadProviderModels(id);
                  }}
                />
              </label>
              <label>
                上游真实模型名
                <SoftSelect
                  className="soft-select-filter"
                  ariaLabel="上游真实模型名"
                  value={form.rewriteModel}
                  placeholder={
                    modelsLoading
                      ? "加载模型中…"
                      : form.channelId
                        ? "选择该服务商的真实模型"
                        : "请先选择服务商"
                  }
                  disabled={!form.channelId || modelsLoading}
                  options={
                    rewriteOptions.length
                      ? rewriteOptions
                      : [{ value: "", label: modelsLoading ? "加载中…" : "暂无模型，请先同步服务商模型" }]
                  }
                  onChange={(m) => setForm({ ...form, rewriteModel: m })}
                />
              </label>
              <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>
                例如对外名 GPT-5.6、真实模型 deepseek-v4-flash：用户选择 GPT-5.6，实际走该服务商的
                deepseek-v4-flash。在「模型管理」同步后，用户门户 /v1/models 会按对外名称展示。
              </p>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                取消
              </button>
              <button className="btn" type="submit" disabled={!form.channelId || !form.rewriteModel}>
                保存
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
