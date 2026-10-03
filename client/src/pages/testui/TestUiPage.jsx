import "./TestUiPage.css";

const positiveRemarks = [
  { label: "Active participation & focus", points: "+2" },
  { label: "Completed classwork on time", points: "+4" },
];

const negativeRemarks = [
  { label: "Off-task / Not working", points: "-1" },
  { label: "Incomplete classwork", points: "-2" },
  { label: "Unprepared / Missing materials", points: "-1" },
  { label: "Disrespectful / Refusal to follow rules", points: "-2" },
];

const RemarkGroup = ({ title, tone, remarks }) => (
  <section className={`preview-remark-group ${tone}`} aria-label={title}>
    <h5>{title}</h5>
    <ul>
      {remarks.map(({ label, points }) => (
        <li key={label} className="preview-remark-chip">
          <span>{label}</span>
          <strong>{points}</strong>
        </li>
      ))}
    </ul>
  </section>
);

const TestUiPage = () => (
  <main className="testui-page">
    <header className="testui-toolbar">
      <div>
        <p className="testui-eyebrow">EMAIL DESIGN PREVIEW</p>
        <h1>Monthly Gradebook Summary</h1>
      </div>
      <span className="testui-preview-badge">Preview only</span>
    </header>

    <article className="testui-email">
      <header className="testui-email-header">
        <div>
          <p className="testui-school-name">AMLY - School</p>
          <h2>Monthly Gradebook Summary</h2>
          <p className="testui-date">Thursday, October 1, 2026</p>
        </div>
        <span className="testui-report-tag">Gradebook Summary</span>
      </header>

      <section className="testui-subject">
        <h3>English Language Arts 5</h3>
        <p className="testui-instructor">Instructor: Abdulhafeez</p>

        <section className="testui-category">
          <h4>Classwork</h4>
          <div className="testui-grade-row">
            <span>Date: Thu, Oct 1</span>
            <strong>7 / 10</strong>
          </div>

          <div className="testui-remarks">
            <p className="testui-remarks-label">Teacher's remarks</p>
            <RemarkGroup title="Positive" tone="positive" remarks={positiveRemarks} />
            <RemarkGroup title="Needs improvement" tone="negative" remarks={negativeRemarks} />
          </div>

          <div className="testui-average">
            <span>Average</span>
            <strong>7.0 / 10</strong>
          </div>
        </section>
      </section>

      <footer className="testui-footer">AMLY - School</footer>
    </article>
  </main>
);

export default TestUiPage;