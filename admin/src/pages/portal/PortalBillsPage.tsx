import { useEffect, useState } from "react";
import { portalApi } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

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

export default function PortalBillsPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<BillRow[]>([]);
  const [error, setError] = useState("");

  function statusLabel(row: BillRow) {
    if (row.kind === "card") return t("bills.statusRedeemed");
    if (row.status === "paid") return t("bills.statusPaid");
    if (row.status === "pending") return t("bills.statusPending");
    return row.status;
  }

  useEffect(() => {
    portalApi<{ data: BillRow[] }>("/bills")
      .then((r) => setRows(r.data ?? []))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : t("common.loadFail")),
      );
  }, [t]);

  return (
    <div className="portal-page">
      <div className="portal-hero">
        <div>
          <h1>{t("bills.title")}</h1>
          <p>{t("bills.lead")}</p>
        </div>
      </div>

      {error ? <div className="alert">{error}</div> : null}

      <div className="portal-panel">
        <div className="portal-panel-head">
          <h3>{t("bills.recordsTitle")}</h3>
          <span className="muted">{t("common.totalRecords", { n: rows.length })}</span>
        </div>
        <div className="portal-table-wrap">
          <table className="portal-table">
            <thead>
              <tr>
                <th>{t("common.method")}</th>
                <th>{t("common.amount")}</th>
                <th>{t("common.status")}</th>
                <th>{t("common.time")}</th>
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
                    {t("bills.empty")}
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
