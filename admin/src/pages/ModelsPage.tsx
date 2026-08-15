import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import SoftSelect from "../components/SoftSelect";
import { softConfirm } from "../components/SoftDialog";
import { IconPencil, IconTrash } from "../components/icons";

type RouteStrategy = "full" | "random" | "ratio" | "smart";

type RouteTarget = {
  channelId: string;
  upstreamModel: string;
  weight?: number;
};

type ModelRoute = {
  id: string;
  model: string;
  channelIds: string[];
  rewriteModel: string | null;
  strategy?: RouteStrategy;
  targets?: RouteTarget[];
  smartSimpleModel?: string | null;
  smartComplexModel?: string | null;
  enabled: boolean;
  published?: boolean;
};

type Channel = {
  id: string;
  name: string;
  enabled?: boolean;
  models?: string[];
};

const STRATEGY_OPTIONS: { value: RouteStrategy; label: string; hint: string }[] = [
  {
    value: "full",
    label: "全量路由",
    hint: "全部流量走第一个上游真实模型",
  },
  {
    value: "random",
    label: "随机路由",
    hint: "在已选上游模型间随机分配",
  },
  {
    value: "ratio",
    label: "比例路由",
    hint: "按权重比例分配到多个上游模型",
  },
  {
    value: "smart",
    label: "智能路由",
    hint: "≤50 字走简单模型，超过则走智能模型（按用户问题字数，不含请求 JSON）",
  },
];

type FormState = {
  model: string;
  channelIds: string[];
  targets: RouteTarget[];
  strategy: RouteStrategy;
  smartSimpleModel: string;
  smartComplexModel: string;
  enabled: boolean;
};

const emptyForm = (): FormState => ({
  model: "",
  channelIds: [],
  targets: [],
  strategy: "full",
  smartSimpleModel: "",
  smartComplexModel: "",
  enabled: true,
});

function targetKey(t: RouteTarget) {
  return `${t.channelId}::${t.upstreamModel}`;
}

export default function ModelsPage() {
  const [rows, setRows] = useState<ModelRoute[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [modelsByChannel, setModelsByChannel] = useState<Record<string, string[]>>({});
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

  const enabledChannels = useMemo(
    () => channels.filter((c) => c.enabled !== false),
    [channels],
  );

  const modelOptions = useMemo(() => {
    const opts: { value: string; label: string; channelId: string; model: string }[] =
      [];
    for (const cid of form.channelIds) {
      const ch = channels.find((c) => c.id === cid);
      const list = modelsByChannel[cid] ?? ch?.models ?? [];
      for (const m of list) {
        if (!m || m === "*") continue;
        opts.push({
          value: `${cid}::${m}`,
          label: `${ch?.name ?? cid} · ${m}`,
          channelId: cid,
          model: m,
        });
      }
    }
    return opts;
  }, [form.channelIds, modelsByChannel, channels]);

  const smartModelOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [];
    for (const t of form.targets) {
      if (seen.has(t.upstreamModel)) continue;
      seen.add(t.upstreamModel);
      const ch = channels.find((c) => c.id === t.channelId);
      opts.push({
        value: t.upstreamModel,
        label: `${ch?.name ?? t.channelId} · ${t.upstreamModel}`,
      });
    }
    return opts;
  }, [form.targets, channels]);

  async function ensureProviderModels(channelIds: string[]) {
    setModelsLoading(true);
    try {
      const next = { ...modelsByChannel };
      for (const channelId of channelIds) {
        if (next[channelId]?.length) continue;
        const ch = channels.find((c) => c.id === channelId);
        const local = (ch?.models ?? []).filter((m) => m && m !== "*");
        if (local.length) {
          next[channelId] = local;
          continue;
        }
        try {
          const res = await api<{ models?: string[] }>(`/channels/${channelId}/test`, {
            method: "POST",
          });
          next[channelId] = (res.models ?? []).filter((m) => m && m !== "*");
        } catch {
          next[channelId] = [];
        }
      }
      setModelsByChannel(next);
    } finally {
      setModelsLoading(false);
    }
  }

  function toggleChannel(id: string) {
    setForm((prev) => {
      const on = prev.channelIds.includes(id);
      const channelIds = on
        ? prev.channelIds.filter((x) => x !== id)
        : [...prev.channelIds, id];
      const targets = prev.targets.filter((t) => channelIds.includes(t.channelId));
      return { ...prev, channelIds, targets };
    });
    if (!form.channelIds.includes(id)) {
      void ensureProviderModels([id]);
    }
  }

  function toggleTarget(channelId: string, upstreamModel: string) {
    setForm((prev) => {
      const key = `${channelId}::${upstreamModel}`;
      const exists = prev.targets.some((t) => targetKey(t) === key);
      const targets = exists
        ? prev.targets.filter((t) => targetKey(t) !== key)
        : [...prev.targets, { channelId, upstreamModel, weight: 1 }];
      return { ...prev, targets };
    });
  }

  function setTargetWeight(key: string, weight: number) {
    setForm((prev) => ({
      ...prev,
      targets: prev.targets.map((t) =>
        targetKey(t) === key ? { ...t, weight: Math.max(0.01, weight) } : t,
      ),
    }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.channelIds.length) {
      setError("请至少选择一个服务商");
      return;
    }
    if (!form.targets.length) {
      setError("请至少选择一个上游真实模型");
      return;
    }
    if (form.strategy === "smart") {
      if (!form.smartSimpleModel || !form.smartComplexModel) {
        setError("智能路由需指定简单模型与智能模型");
        return;
      }
    }
    try {
      setError("");
      const payload = {
        model: form.model.trim(),
        channelIds: form.channelIds,
        rewriteModel: form.targets[0]?.upstreamModel ?? null,
        strategy: form.strategy,
        targets: form.targets.map((t) => ({
          channelId: t.channelId,
          upstreamModel: t.upstreamModel,
          weight: t.weight && t.weight > 0 ? t.weight : 1,
        })),
        smartSimpleModel:
          form.strategy === "smart" ? form.smartSimpleModel || null : null,
        smartComplexModel:
          form.strategy === "smart" ? form.smartComplexModel || null : null,
        enabled: form.enabled,
      };
      if (editingId) {
        await api(`/models/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/models", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setOpen(false);
      setEditingId(null);
      setForm(emptyForm());
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

  function strategyLabel(s?: string) {
    return STRATEGY_OPTIONS.find((o) => o.value === s)?.label ?? "全量路由";
  }

  function openCreate() {
    setError("");
    setEditingId(null);
    setForm(emptyForm());
    setOpen(true);
  }

  function openEdit(row: ModelRoute) {
    setError("");
    setEditingId(row.id);
    const targets =
      row.targets?.length
        ? row.targets.map((t) => ({
            channelId: t.channelId,
            upstreamModel: t.upstreamModel,
            weight: t.weight && t.weight > 0 ? t.weight : 1,
          }))
        : row.channelIds.map((channelId) => ({
            channelId,
            upstreamModel: row.rewriteModel || row.model,
            weight: 1,
          }));
    const channelIds = [
      ...new Set([
        ...row.channelIds,
        ...targets.map((t) => t.channelId),
      ]),
    ];
    setForm({
      model: row.model,
      channelIds,
      targets,
      strategy: row.strategy || "full",
      smartSimpleModel: row.smartSimpleModel || "",
      smartComplexModel: row.smartComplexModel || "",
      enabled: row.enabled,
    });
    setOpen(true);
    void ensureProviderModels(channelIds);
  }

  function displayTargets(row: ModelRoute) {
    if (row.targets?.length) {
      return row.targets.map((t) => t.upstreamModel).join(" / ");
    }
    return row.rewriteModel || row.model;
  }

  function displayProviders(row: ModelRoute) {
    const ids = row.targets?.length
      ? [...new Set(row.targets.map((t) => t.channelId))]
      : row.channelIds;
    return ids.length ? ids.map(channelName).join(" / ") : "—";
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
                <th>策略</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.model}</td>
                  <td>{displayProviders(r)}</td>
                  <td className="mono" title={displayTargets(r)}>
                    {displayTargets(r)}
                  </td>
                  <td>{strategyLabel(r.strategy)}</td>
                  <td>
                    <span className={`badge ${r.enabled ? "on" : "off"}`}>
                      {r.enabled ? "启用" : "禁用"}
                    </span>
                  </td>
                  <td>
                    <div className="tk-ops">
                      <button
                        type="button"
                        className="icon-btn"
                        title="编辑"
                        onClick={() => openEdit(r)}
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
              {!rows.length ? (
                <tr>
                  <td colSpan={6} className="empty">
                    暂无路由。新建后可在「模型管理」同步给用户，用户按对外模型名调用。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {open ? (
        <div
          className="modal-backdrop"
          onClick={() => {
            setOpen(false);
            setEditingId(null);
          }}
        >
          <form
            className="modal modal-wide"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void onSubmit(e)}
          >
            <h3>{editingId ? "编辑路由" : "新建路由"}</h3>
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

              <div className="stack-field">
                <span>服务商（可多选）</span>
                <div className="rp-chips">
                  {enabledChannels.map((c) => {
                    const on = form.channelIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`km-route-chip${on ? " on" : ""}`}
                        onClick={() => toggleChannel(c.id)}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                  {!enabledChannels.length ? (
                    <span className="muted">暂无可用服务商</span>
                  ) : null}
                </div>
              </div>

              <div className="stack-field">
                <span>上游真实模型名（可多选）</span>
                <div className="rp-chips">
                  {!form.channelIds.length ? (
                    <span className="muted">请先选择服务商</span>
                  ) : modelsLoading && !modelOptions.length ? (
                    <span className="muted">加载模型中…</span>
                  ) : modelOptions.length ? (
                    modelOptions.map((o) => {
                      const on = form.targets.some((t) => targetKey(t) === o.value);
                      return (
                        <button
                          key={o.value}
                          type="button"
                          className={`km-route-chip${on ? " on" : ""}`}
                          onClick={() => toggleTarget(o.channelId, o.model)}
                        >
                          {o.label}
                        </button>
                      );
                    })
                  ) : (
                    <span className="muted">暂无模型，请先同步服务商模型</span>
                  )}
                </div>
              </div>

              <div className="stack-field">
                <span>路由策略</span>
                <div className="rp-chips">
                  {STRATEGY_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className={`km-route-chip${form.strategy === o.value ? " on" : ""}`}
                      title={o.hint}
                      onClick={() => setForm({ ...form, strategy: o.value })}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <p className="muted" style={{ margin: "6px 0 0", fontSize: 12, lineHeight: 1.45 }}>
                  {STRATEGY_OPTIONS.find((o) => o.value === form.strategy)?.hint}
                </p>
              </div>

              {form.strategy === "ratio" && form.targets.length > 0 ? (
                <div className="stack-field">
                  <span>流量比例</span>
                  <div className="route-ratio-list">
                    {form.targets.map((t) => (
                      <label key={targetKey(t)} className="route-ratio-row">
                        <span className="mono">
                          {channelName(t.channelId)} · {t.upstreamModel}
                        </span>
                        <input
                          type="number"
                          min={0.01}
                          step={1}
                          value={t.weight ?? 1}
                          onChange={(e) =>
                            setTargetWeight(
                              targetKey(t),
                              Number(e.target.value) || 1,
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              {form.strategy === "smart" ? (
                <>
                  <label>
                    简单模型（≤50 字）
                    <SoftSelect
                      className="soft-select-filter"
                      ariaLabel="简单模型"
                      value={form.smartSimpleModel}
                      placeholder="选择简单模型"
                      disabled={!form.targets.length}
                      options={
                        smartModelOptions.length
                          ? smartModelOptions
                          : [{ value: "", label: "请先选择上游模型" }]
                      }
                      onChange={(m) => setForm({ ...form, smartSimpleModel: m })}
                    />
                  </label>
                  <label>
                    智能模型（&gt;50 字）
                    <SoftSelect
                      className="soft-select-filter"
                      ariaLabel="智能模型"
                      value={form.smartComplexModel}
                      placeholder="选择智能模型"
                      disabled={!form.targets.length}
                      options={
                        smartModelOptions.length
                          ? smartModelOptions
                          : [{ value: "", label: "请先选择上游模型" }]
                      }
                      onChange={(m) => setForm({ ...form, smartComplexModel: m })}
                    />
                  </label>
                </>
              ) : null}

              <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>
                例如对外名 GPT-5.6 映射多个上游：用户选择 GPT-5.6 后按策略转发。在「模型管理」同步后，用户门户
                /v1/models 会按对外名称展示。
              </p>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setOpen(false);
                  setEditingId(null);
                }}
              >
                取消
              </button>
              <button
                className="btn"
                type="submit"
                disabled={!form.channelIds.length || !form.targets.length}
              >
                保存
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
