import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { copyText } from "../lib/copy";
import SoftSelect from "../components/SoftSelect";
import SoftToast from "../components/SoftToast";
import { IconCopy, IconTrash } from "../components/icons";
import { softAlert, softConfirm } from "../components/SoftDialog";
import ModalBackdrop from "../components/ModalBackdrop";

type CardRow = {
  id: string;
  code: string;
  amount: number;
  expiresAt: string | Date | null;
  userId: string | null;
  boundUsername: string | null;
  redeemedAt: string | Date | null;
  redeemedUsername: string | null;
  status: "unused" | "used" | "expired";
  remark: string;
  createdAt: string | Date;
};

type UserOpt = { id: string; username: string; roleKey?: string | null };

const VALID_OPTS = [
  { value: "7", label: "7 天" },
  { value: "30", label: "30 天" },
  { value: "90", label: "90 天" },
  { value: "365", label: "1 年" },
  { value: "0", label: "永久有效" },
];

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

function statusLabel(s: CardRow["status"]) {
  if (s === "used") return "已使用";
  if (s === "expired") return "已过期";
  return "未使用";
}

export default function CardKeysPage() {
  const [rows, setRows] = useState<CardRow[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [createdCodes, setCreatedCodes] = useState<string[]>([]);
  const [amount, setAmount] = useState("10");
  const [validDays, setValidDays] = useState("30");
  const [userId, setUserId] = useState("");
  const [count, setCount] = useState("1");

  async function load() {
    try {
      const [cards, userRes] = await Promise.all([
        api<{ data: CardRow[] }>("/card-keys"),
        api<{ data: UserOpt[] }>("/users"),
      ]);
      setRows(cards.data);
      setUsers(userRes.data);
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
        r.code.toLowerCase().includes(s) ||
        (r.boundUsername ?? "").toLowerCase().includes(s) ||
        (r.redeemedUsername ?? "").toLowerCase().includes(s),
    );
  }, [rows, q]);

  const userOptions = useMemo(
    () => [
      { value: "", label: "不限制（任意用户可兑）" },
      ...users.map((u) => ({
        value: u.id,
        label: u.username,
      })),
    ],
    [users],
  );

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<{ data: CardRow[] }>("/card-keys", {
        method: "POST",
        body: JSON.stringify({
          amount: Number(amount),
          validDays: Number(validDays),
          userId: userId || null,
          count: Number(count) || 1,
        }),
      });
      setCreatedCodes(res.data.map((r) => r.code));
      setOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode(code: string) {
    const ok = await copyText(code);
    setToast(ok ? "卡密已复制" : "复制失败");
  }

  async function copyCreated() {
    const ok = await copyText(createdCodes.join("\n"));
    setToast(ok ? "已复制全部卡密" : "复制失败");
  }

  async function remove(row: CardRow) {
    const ok = await softConfirm({
      title: "删除卡密",
      message: `确定删除卡密 ${row.code} ？`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/card-keys/${row.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      await softAlert({
        title: "无法删除",
        message: e instanceof Error ? e.message : "删除失败",
      });
    }
  }

  return (
    <>
      <SoftToast message={toast} onDone={() => setToast(null)} />
      <div className="topbar">
        <div className="page-head">
          <h2>卡密管理</h2>
          <p>生成充值卡密，可设定余额、有效期与限定用户</p>
        </div>
        <div className="row-actions">
          <input
            className="search"
            placeholder="搜索卡密或用户…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            className="btn"
            onClick={() => {
              setError("");
              setOpen(true);
            }}
          >
            + 创建卡密
          </button>
        </div>
      </div>

      {error && !open ? <div className="alert">{error}</div> : null}

      <div className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>卡密</th>
                <th>激活余额</th>
                <th>激活时效</th>
                <th>限定用户</th>
                <th>状态</th>
                <th>使用者</th>
                <th>创建时间</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.code}</td>
                  <td>{money(r.amount)}</td>
                  <td>{r.expiresAt ? fmtDate(r.expiresAt) : "永久"}</td>
                  <td>{r.boundUsername || "不限制"}</td>
                  <td>
                    <span
                      className={`badge ${
                        r.status === "unused"
                          ? "on"
                          : r.status === "used"
                            ? ""
                            : "danger"
                      }`}
                    >
                      {statusLabel(r.status)}
                    </span>
                  </td>
                  <td>
                    {r.redeemedUsername || "—"}
                    {r.redeemedAt ? (
                      <div className="muted" style={{ fontSize: 12 }}>
                        {fmtDate(r.redeemedAt)}
                      </div>
                    ) : null}
                  </td>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>
                    {fmtDate(r.createdAt)}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        title="复制"
                        onClick={() => void copyCode(r.code)}
                      >
                        <IconCopy />
                      </button>
                      {r.status !== "used" ? (
                        <button
                          type="button"
                          className="icon-btn danger"
                          title="删除"
                          onClick={() => void remove(r)}
                        >
                          <IconTrash />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr>
                  <td colSpan={8} className="empty">
                    暂无卡密
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {open ? (
        <ModalBackdrop onClose={() => setOpen(false)}>
          <form
            className="modal modal-user"
            onClick={(e) => e.stopPropagation()}
            onSubmit={onCreate}
          >
            <div className="modal-user-head">
              <h3>创建卡密</h3>
              <p>生成长字符串密钥，用户可在充值页兑换对应余额</p>
            </div>
            {error ? <div className="alert">{error}</div> : null}
            <div className="modal-user-grid">
              <label className="stack-field">
                <span>
                  激活余额（USD） <em>*</em>
                </span>
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </label>
              <label className="stack-field">
                <span>激活时效</span>
                <SoftSelect
                  ariaLabel="激活时效"
                  value={validDays}
                  onChange={setValidDays}
                  options={VALID_OPTS}
                />
              </label>
              <label className="stack-field">
                <span>限定用户</span>
                <SoftSelect
                  ariaLabel="限定用户"
                  value={userId}
                  onChange={setUserId}
                  options={userOptions}
                />
              </label>
              <label className="stack-field">
                <span>生成数量</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                取消
              </button>
              <button className="btn" disabled={busy}>
                {busy ? "创建中…" : "创建"}
              </button>
            </div>
          </form>
        </ModalBackdrop>
      ) : null}

      {createdCodes.length ? (
        <ModalBackdrop onClose={() => setCreatedCodes([])}>
          <div className="modal modal-user" onClick={(e) => e.stopPropagation()}>
            <div className="modal-user-head">
              <h3>卡密已生成</h3>
              <p>请妥善保存并发送给用户，关闭后仍可在列表中复制</p>
            </div>
            <pre className="card-key-created">{createdCodes.join("\n")}</pre>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setCreatedCodes([])}>
                关闭
              </button>
              <button type="button" className="btn" onClick={() => void copyCreated()}>
                复制全部
              </button>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}
    </>
  );
}
