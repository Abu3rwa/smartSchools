import { Fragment, useEffect } from 'react';

const StandardAssignSummaryPanel = ({
    t,
    showSummaryModal,
    setShowSummaryModal,
    summaryItems
}) => {
    const openSummary = () => setShowSummaryModal(true);
    const closeSummary = () => setShowSummaryModal(false);

    useEffect(() => {
        if (!showSummaryModal) return undefined;

        // Capture phase so Escape closes the summary instead of the whole wizard.
        const handleKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            setShowSummaryModal(false);
        };

        document.addEventListener('keydown', handleKeyDown, true);
        return () => {
            document.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [showSummaryModal, setShowSummaryModal]);

    return (
        <>
            <div className="assign-summary-card" onClick={openSummary}>
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
                        {t('standardAssign:actions.openSummary')}
                    </button>
                </div>
                <div className="assign-summary-chips">
                    {summaryItems.map((item) => (
                        <div className="assign-summary-chip" key={item.key}>
                            <span className="assign-summary-chip__label">{item.label}</span>
                            <strong className="assign-summary-chip__value">{item.value}</strong>
                        </div>
                    ))}
                </div>
            </div>

            {showSummaryModal && (
                <div className="assign-summary-modal-overlay" onClick={closeSummary}>
                    <div
                        className="assign-summary-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="assign-summary-modal-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="assign-summary-modal-header">
                            <h4 id="assign-summary-modal-title">{t('standardAssign:form.summary.title')}</h4>
                            <button
                                type="button"
                                className="modal-close"
                                onClick={closeSummary}
                                aria-label={t('standardAssign:actions.close')}
                            >
                                &times;
                            </button>
                        </div>
                        <div className="assign-summary-modal-body">
                            <div className="assign-summary-grid">
                                {summaryItems.map((item) => (
                                    <Fragment key={item.key}>
                                        <span>{item.label}</span>
                                        <strong>{item.value}</strong>
                                    </Fragment>
                                ))}
                            </div>
                        </div>
                        <div className="assign-summary-modal-actions">
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={closeSummary}
                            >
                                {t('standardAssign:actions.close')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default StandardAssignSummaryPanel;
