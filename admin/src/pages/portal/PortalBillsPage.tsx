import { useEffect, useState } from "react";
import { portalApi } from "../../lib/api";

type BillRow = {
  id: string;
  kind: "card" | "epay";
  label: string;
  amount: number;
  at: string | Date | null;
  status: string;
};

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

function statusLabel(row: BillRow) {
  if (row.kind === "card") return "已兑换";
  if (row.status === "paid") return "已支付";
  if (row.status === "pending") return "待支付";
  return row.status;
}

export default function PortalBillsPage() {
  const [rows, setRows] = useState<BillRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    portalApi<{ data: BillRow[] }>("/bills")
      .then((r) => setRows(r.data ?? []))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "加载失败"),
      );
  }, []);

  return (
    <div className="portal-page">
      <div className="portal-hero">
        <div>
          <h1>账单</h1>
          <p>查看本账户的卡密兑换与在线充值记录</p>
        </div>
      </div>

      {error ? <div className="alert">{error}</div> : null}

      <div className="portal-panel">
        <div className="portal-panel-head">
          <h3>充值记录</h3>
          <span className="muted">共 {rows.length} 条</span>
        </div>
        <div className="portal-table-wrap">
          <table className="portal-table">
            <thead>
              <tr>
                <th>方式</th>
                <th>金额</th>
                <th>状态</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.label}</td>
                  <td>{money(r.amount)}</td>
                  <td>{statusLabel(r)}</td>
                  <td>{fmtDate(r.at)}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={4} className="muted">
                    暂无充值记录
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
