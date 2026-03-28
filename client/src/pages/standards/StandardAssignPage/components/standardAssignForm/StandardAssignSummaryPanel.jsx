const StandardAssignSummaryPanel = ({
    t,
    showSummaryModal,
    setShowSummaryModal,
    summaryItems
}) => {
    const openSummary = () => setShowSummaryModal(true);
    const closeSummary = () => setShowSummaryModal(false);

    return (
        <>
            <div
                className="assign-summary-card"
                role="button"
                tabIndex={0}
                onClick={openSummary}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openSummary();
                    }
                }}
            >
                <div className="assign-summary-card-header">
                    <h4>{t('standardAssign:form.summary.title')}</h4>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={(event) => {
                            event.stopPropagation();
                            openSummary();
                        }}
                    >
                        {t('standardAssign:actions.openSummary', { defaultValue: 'Open Summary' })}
                    </button>
                </div>
                <div className="assign-summary-grid">
                    {summaryItems.map((item) => (
                        <>
                            <span key={`${item.key}-label`}>{item.label}</span>
                            <strong key={`${item.key}-value`}>{item.value}</strong>
                        </>
                    ))}
                </div>
            </div>

            {showSummaryModal && (
                <div className="assign-summary-modal-overlay" onClick={closeSummary}>
                    <div
                        className="assign-summary-modal"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="assign-summary-modal-header">
                            <h4>{t('standardAssign:form.summary.title')}</h4>
                            <button
                                type="button"
                                className="modal-close"
                                onClick={closeSummary}
                            >
                                &times;
                            </button>
                        </div>
                        <div className="assign-summary-modal-body">
                            <div className="assign-summary-grid">
                                {summaryItems.map((item) => (
                                    <>
                                        <span key={`${item.key}-modal-label`}>{item.label}</span>
                                        <strong key={`${item.key}-modal-value`}>{item.value}</strong>
                                    </>
                                ))}
                            </div>
                        </div>
                        <div className="assign-summary-modal-actions">
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={closeSummary}
                            >
                                {t('standardAssign:actions.close', { defaultValue: 'Close' })}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default StandardAssignSummaryPanel;
