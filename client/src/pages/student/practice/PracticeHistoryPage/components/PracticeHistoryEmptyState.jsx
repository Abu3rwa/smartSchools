import { useTranslation } from 'react-i18next';

/**
 * Empty state when no history. Uses CSS class: history-empty.
 */
export default function PracticeHistoryEmptyState({ assignmentId, onStartPracticing }) {
    const { t } = useTranslation('studentPractice');

    return (
        <div className="history-empty">
            <p>{t('history.empty')}</p>
            <button
                type="button"
                className="btn btn-primary"
                onClick={() => onStartPracticing(assignmentId)}
                style={{ marginTop: 'var(--spacing-md)' }}
            >
                {t('history.startPracticing')}
            </button>
        </div>
    );
}
