const SummaryCard = ({ title, value, icon, tone }) => (
  <div className="analytics-card">
    <div className={`card-icon ${tone}`}>{icon}</div>
    <div className="card-content">
      <h3>{title}</h3>
      <p className="big-number">{value}</p>
    </div>
  </div>
);

export default SummaryCard;