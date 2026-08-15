export default function PortalBillsPage() {
  return (
    <div className="portal-page">
      <div className="portal-hero">
        <div>
          <h1>账单</h1>
          <p>查看充值与消耗记录，核对账户流水。</p>
        </div>
      </div>
      <div className="portal-panel">
        <div className="portal-panel-head">
          <h3>账单明细</h3>
        </div>
        <div className="portal-empty" style={{ padding: "36px 20px" }}>
          暂无账单记录，充值开通后将在此展示。
        </div>
      </div>
    </div>
  );
}
