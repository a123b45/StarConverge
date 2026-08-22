import { FormEvent, useEffect, useState } from "react";
import { portalApi } from "../../lib/api";
import SoftToast from "../../components/SoftToast";

export default function PortalRechargePage() {
  const [code, setCode] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    portalApi<{ balance?: number }>("/me")
      .then((me) => setBalance(me.balance ?? 0))
      .catch(() => setBalance(null));
  }, []);

  async function redeem(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await portalApi<{
        data: { amount: number; balance: number; totalRecharged?: number };
      }>("/recharge/card", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setBalance(res.data.balance);
      setCode("");
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
          <h1>充值</h1>
          <p>使用管理员发放的卡密为账户增加余额</p>
        </div>
      </div>

      <div className="portal-panel">
        <div className="portal-panel-head">
          <h3>卡密兑换</h3>
          <span className="muted">
            当前余额 {balance == null ? "—" : `$${balance.toFixed(2)}`}
          </span>
        </div>
        {error ? <div className="alert">{error}</div> : null}
        <form className="portal-toolbar recharge-redeem-bar" onSubmit={redeem}>
          <input
            className="portal-search"
            placeholder="输入卡密，如 SC-XXXXX-XXXXX-XXXXX-XXXXX"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <button className="portal-btn" disabled={busy || !code.trim()}>
            {busy ? "兑换中…" : "兑换卡密"}
          </button>
        </form>
      </div>

      <div className="portal-panel recharge-contact">
        <div className="portal-panel-head">
          <h3>人工充值</h3>
        </div>
        <p className="recharge-contact-text">
          充值请联系管理员，微信号：<strong>yanxueliangmax</strong>
        </p>
      </div>
    </div>
  );
}
