import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { portalApi } from "../../lib/api";
import SoftToast from "../../components/SoftToast";
import { IconArrowUpRight } from "../../components/icons";

const CARD_SHOP_URL = "https://9.plus/shop/JJRZ0I7J";

export default function PortalRechargePage() {
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
      setError("请输入卡密");
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
      setToast(`兑换成功，余额 +$${res.data.amount.toFixed(2)}`);
      window.dispatchEvent(
        new CustomEvent("sc:balance-updated", {
          detail: {
            balance: res.data.balance,
            totalRecharged: res.data.totalRecharged,
          },
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "兑换失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="portal-page">
      <SoftToast message={toast} tone="ok" onDone={() => setToast(null)} />
      <div className="portal-hero">
        <div>
          <h1>买额度</h1>
          <p>先买卡密额度包，再在本页兑换。余额按 token 扣费，用完再买。</p>
        </div>
      </div>

      {error ? <div className="alert">{error}</div> : null}

      <div className="portal-panel">
        <div className="portal-panel-head">
          <h3>兑换卡密</h3>
          <span className="muted">
            当前余额 {balance == null ? "—" : `$${balance.toFixed(2)}`}
          </span>
        </div>
        <p className="muted recharge-rate-hint" style={{ padding: "0 16px 8px" }}>
          没有卡密可先点击获取卡密，充值后把卡密粘贴到下方兑换。兑换完成后可在
          <Link to="/app/bills" className="portal-jump-link">
            账单
            <IconArrowUpRight size={12} />
          </Link>
          内查询。
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
            placeholder="输入卡密，例如 SC-XXXXX-XXXXX-XXXXX-XXXXX"
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
            获取卡密
          </a>
          <button className="portal-btn" type="submit" disabled={busy}>
            {busy ? "兑换中…" : "兑换卡密"}
          </button>
        </form>
      </div>
    </div>
  );
}
