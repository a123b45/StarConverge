export default function PortalRechargePage() {
  return (
    <div className="portal-page">
      <div className="portal-hero">
        <div>
          <h1>充值</h1>
          <p>为账户补充 Token 配额，用于调用模型与服务。</p>
        </div>
      </div>
      <div className="portal-panel">
        <div className="portal-panel-head">
          <h3>充值入口</h3>
        </div>
        <div className="portal-empty" style={{ padding: "36px 20px" }}>
          充值功能即将开放，如需增加配额请联系管理员。
        </div>
      </div>
    </div>
  );
}
