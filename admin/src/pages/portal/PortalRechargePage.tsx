import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { portalApi } from "../../lib/api";
import SoftToast from "../../components/SoftToast";

type PayType = "alipay" | "wxpay" | "qqpay";

type EpayConfig = {
  enabled: boolean;
  cnyPerUsd: number;
  methods: PayType[];
  presets: number[];
};

const METHOD_LABEL: Record<PayType, string> = {
  alipay: "支付宝",
  wxpay: "微信支付",
  qqpay: "QQ 钱包",
};

function isNativePayUrl(url: string) {
  return /^(weixin|alipays|alipay):\/\//i.test(url);
}

function isScanQr(qrcode: string) {
  return /^https?:\/\//i.test(qrcode) || qrcode.startsWith("data:");
}

export default function PortalRechargePage() {
  const [params] = useSearchParams();
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [epay, setEpay] = useState<EpayConfig | null>(null);
  const [amountUsd, setAmountUsd] = useState(10);
  const [payType, setPayType] = useState<PayType>("alipay");
  const [pending, setPending] = useState<{
    outTradeNo: string;
    payUrl: string;
    qrcode: string;
    moneyCny: string;
    amountUsd: number;
  } | null>(null);

  const returningOrder = params.get("order") || "";

  useEffect(() => {
    portalApi<{ balance?: number }>("/me")
      .then((me) => setBalance(me.balance ?? 0))
      .catch(() => setBalance(null));
    portalApi<{ data: EpayConfig }>("/recharge/epay/config")
      .then((r) => {
        setEpay(r.data);
        if (r.data.methods[0]) setPayType(r.data.methods[0]);
        if (r.data.presets[1]) setAmountUsd(r.data.presets[1]);
        else if (r.data.presets[0]) setAmountUsd(r.data.presets[0]);
      })
      .catch(() => setEpay({ enabled: false, cnyPerUsd: 7.2, methods: [], presets: [] }));
  }, []);

  useEffect(() => {
    if (!returningOrder) return;
    let stop = false;
    async function poll() {
      try {
        const res = await portalApi<{
          data: { status: string; amount: number };
        }>(`/recharge/epay/order/${encodeURIComponent(returningOrder)}`);
        if (stop) return;
        if (res.data.status === "paid") {
          setToast(`充值成功，余额 +$${res.data.amount.toFixed(2)}`);
          const me = await portalApi<{ balance?: number; totalRecharged?: number }>("/me");
          setBalance(me.balance ?? 0);
          window.dispatchEvent(
            new CustomEvent("sc:balance-updated", {
              detail: { balance: me.balance, totalRecharged: me.totalRecharged },
            }),
          );
          setPending(null);
          return;
        }
      } catch {
        /* keep polling */
      }
      if (!stop) window.setTimeout(() => void poll(), 2000);
    }
    void poll();
    return () => {
      stop = true;
    };
  }, [returningOrder]);

  const cnyHint = useMemo(() => {
    const rate = epay?.cnyPerUsd ?? 7.2;
    return (amountUsd * rate).toFixed(2);
  }, [amountUsd, epay]);

  async function startEpay() {
    setBusy(true);
    setError("");
    try {
      const res = await portalApi<{
        data: {
          outTradeNo: string;
          payUrl: string;
          qrcode: string;
          moneyCny: string;
          amountUsd: number;
        };
      }>("/recharge/epay", {
        method: "POST",
        body: JSON.stringify({ amountUsd, type: payType }),
      });
      setPending(res.data);
      if (res.data.payUrl && isNativePayUrl(res.data.payUrl)) {
        window.location.href = res.data.payUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "下单失败");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!pending?.outTradeNo) return;
    let stop = false;
    async function poll() {
      try {
        const res = await portalApi<{
          data: { status: string; amount: number };
        }>(`/recharge/epay/order/${encodeURIComponent(pending!.outTradeNo)}`);
        if (stop) return;
        if (res.data.status === "paid") {
          setToast(`充值成功，余额 +$${res.data.amount.toFixed(2)}`);
          const me = await portalApi<{ balance?: number; totalRecharged?: number }>("/me");
          setBalance(me.balance ?? 0);
          window.dispatchEvent(
            new CustomEvent("sc:balance-updated", {
              detail: { balance: me.balance, totalRecharged: me.totalRecharged },
            }),
          );
          setPending(null);
          return;
        }
      } catch {
        /* keep polling */
      }
      if (!stop) window.setTimeout(() => void poll(), 2500);
    }
    void poll();
    return () => {
      stop = true;
    };
  }, [pending?.outTradeNo]);

  const showQr = pending?.qrcode ? isScanQr(pending.qrcode) : false;
  const nativePay = pending?.payUrl ? isNativePayUrl(pending.payUrl) : false;
  const cashierLink =
    pending?.payUrl && !showQr && !nativePay ? pending.payUrl : "";

  return (
    <div className="portal-page">
      <SoftToast message={toast} tone="ok" onDone={() => setToast(null)} />
      <div className="portal-hero">
        <div>
          <h1>充值</h1>
          <p>使用支付宝或微信支付为账户增加美元余额</p>
        </div>
      </div>

      <div className="portal-panel">
        <div className="portal-panel-head">
          <h3>在线充值</h3>
          <span className="muted">
            当前余额 {balance == null ? "—" : `$${balance.toFixed(2)}`}
          </span>
        </div>
        {error ? <div className="alert">{error}</div> : null}
        {epay && !epay.enabled ? (
          <p className="muted recharge-rate-hint" style={{ padding: "4px 16px 18px" }}>
            在线支付尚未开通，请使用下方人工充值。
          </p>
        ) : null}
        {epay?.enabled ? (
          <div className="recharge-online">
            <div className="recharge-presets">
              {epay.presets.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`recharge-preset${amountUsd === n ? " is-on" : ""}`}
                  onClick={() => setAmountUsd(n)}
                >
                  ${n}
                </button>
              ))}
            </div>
            <p className="muted recharge-rate-hint">
              将支付约 ¥{cnyHint}（汇率 {epay.cnyPerUsd} 人民币 / 1 美元）
            </p>
            <div className="recharge-methods">
              {epay.methods.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`recharge-preset${payType === m ? " is-on" : ""}`}
                  onClick={() => setPayType(m)}
                >
                  {METHOD_LABEL[m]}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="portal-btn"
              disabled={busy}
              onClick={() => void startEpay()}
            >
              {busy ? "下单中…" : `去支付 $${amountUsd.toFixed(0)}`}
            </button>
            {pending ? (
              <div className="recharge-pending">
                <p>
                  {showQr
                    ? "请使用手机扫码支付。到账后本页会自动刷新。"
                    : "请完成支付。到账后本页会自动刷新。"}
                </p>
                {showQr ? (
                  <img className="recharge-qr" src={pending.qrcode} alt="支付二维码" />
                ) : null}
                {cashierLink ? (
                  <a className="portal-btn" href={cashierLink} target="_blank" rel="noreferrer">
                    打开支付
                  </a>
                ) : null}
                <span className="muted">
                  订单 {pending.outTradeNo} · ¥{pending.moneyCny} · 等待到账
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="portal-panel recharge-contact">
        <div className="portal-panel-head">
          <h3>人工充值</h3>
        </div>
        <p className="recharge-contact-text">
          如需对公转账或大额充值，请联系管理员，微信号：<strong>yanxueliangmax</strong>
        </p>
      </div>
    </div>
  );
}
