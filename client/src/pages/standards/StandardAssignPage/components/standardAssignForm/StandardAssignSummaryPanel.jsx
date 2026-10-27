const StandardAssignSummaryPanel = ({ t, summaryItems }) => (
    <aside
        className="assign-summary-rail"
        aria-label={t('standardAssign:form.summary.title')}
    >
        <h4>{t('standardAssign:form.summary.title')}</h4>
        <dl className="assign-summary-list">
            {summaryItems.map((item) => (
                <div className="assign-summary-row" key={item.key}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                </div>
            ))}
        </dl>
    </aside>
);

export default StandardAssignSummaryPanel;
