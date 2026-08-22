import { useEffect, useState } from "react";
import { portalApi } from "../../lib/api";

type BillRow = {
  id: string;
  code: string;
  amount: number;
  redeemedAt: string | Date | null;
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
          <p>查看本账户已兑换的卡密记录</p>
        </div>
      </div>

      {error ? <div className="alert">{error}</div> : null}

      <div className="portal-panel">
        <div className="portal-panel-head">
          <h3>卡密兑换记录</h3>
          <span className="muted">共 {rows.length} 条</span>
        </div>
        <div className="portal-table-wrap">
          <table className="portal-table">
            <thead>
              <tr>
                <th>卡密</th>
                <th>金额</th>
                <th>使用时间</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.code}</td>
                  <td>{money(r.amount)}</td>
                  <td>{fmtDate(r.redeemedAt)}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={3} className="muted">
                    暂无兑换记录
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
