import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { portalApi } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import SoftToast from "../../components/SoftToast";
import { IconArrowUpRight } from "../../components/icons";

const CARD_SHOP_URL = "https://9.plus/shop/JJRZ0I7J";

export default function PortalRechargePage() {
  const { t } = useI18n();
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [cardCode, setCardCode] = useState("");

  useEffect(() => {
    portalApi<{ balance?: number }>("/me")
      .then((me) => setBalance(me.balance ?? 0))
      .catch(() => setBalance(null));
  }, []);

  async function redeemCard() {
    const code = cardCode.trim();
    if (!code) {
      setError(t("recharge.enterCode"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await portalApi<{
        data: { amount: number; balance: number; totalRecharged: number };
      }>("/recharge/card", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setCardCode("");
      setBalance(res.data.balance);
      setToast(t("recharge.success", { amount: res.data.amount.toFixed(2) }));
      window.dispatchEvent(
        new CustomEvent("sc:balance-updated", {
          detail: {
            balance: res.data.balance,
            totalRecharged: res.data.totalRecharged,
          },
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.redeemFail"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="portal-page">
      <SoftToast message={toast} tone="ok" onDone={() => setToast(null)} />
      <div className="portal-hero">
        <div>
          <h1>{t("recharge.title")}</h1>
          <p>{t("recharge.lead")}</p>
        </div>
      </div>

      {error ? <div className="alert">{error}</div> : null}

      <div className="portal-panel">
        <div className="portal-panel-head">
          <h3>{t("recharge.redeemTitle")}</h3>
          <span className="muted">
            {t("recharge.currentBalance")}{" "}
            {balance == null ? "—" : `$${balance.toFixed(2)}`}
          </span>
        </div>
        <p className="muted recharge-rate-hint" style={{ padding: "0 16px 8px" }}>
          {t("recharge.hint")}{" "}
          <Link to="/app/bills" className="portal-jump-link">
            {t("bills.title")}
            <IconArrowUpRight size={12} />
          </Link>{" "}
          {t("recharge.hintSuffix")}
        </p>
        <form
          className="portal-toolbar recharge-redeem-bar"
          style={{ padding: "4px 16px 18px" }}
          onSubmit={(e) => {
            e.preventDefault();
            void redeemCard();
          }}
        >
          <input
            className="portal-search"
            placeholder={t("recharge.cardPh")}
            value={cardCode}
            onChange={(e) => setCardCode(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <a
            className="portal-btn ghost"
            href={CARD_SHOP_URL}
            target="_blank"
            rel="noreferrer"
          >
            {t("recharge.getCard")}
          </a>
          <button className="portal-btn" type="submit" disabled={busy}>
            {busy ? t("recharge.redeeming") : t("recharge.redeemBtn")}
          </button>
        </form>
      </div>
    </div>
  );
}
