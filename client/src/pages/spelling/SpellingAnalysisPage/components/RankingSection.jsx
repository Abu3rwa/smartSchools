import { useTranslation } from 'react-i18next';
import { HiOutlineChevronRight } from 'react-icons/hi';

const RankingList = ({ rows, title, onView, tone }) => {
    const { t } = useTranslation(['spellingAnalysis']);
    return (
        <div className={`sa-rank-card is-${tone}`}>
            <h3>{title}</h3>
            {rows.length === 0 ? (
                <p className="sa-empty">{t('spellingAnalysis:ranking.empty')}</p>
            ) : (
                <ol className="sa-rank-list">
                    {rows.map((row) => (
                        <li key={row.studentId}>
                            <span className="sa-rank-no">{row.rank}</span>
                            <span className="sa-rank-name">{row.studentName}</span>
                            <span className="sa-rank-stat">
                                {t('spellingAnalysis:ranking.accuracy', { value: row.accuracy })}
                            </span>
                            <span className="sa-rank-stat is-muted">
                                {t('spellingAnalysis:ranking.recovery', { value: row.recoveryRate })}
                            </span>
                            <button
                                type="button"
                                className="sa-icon-btn"
                                aria-label={t('spellingAnalysis:actions.view')}
                                onClick={() => onView(row.studentId)}
                            >
                                <HiOutlineChevronRight size={16} aria-hidden="true" />
                            </button>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
};

export default function RankingSection({ minAttempts, onView, ranking }) {
    const { t } = useTranslation(['spellingAnalysis']);
    return (
        <section className="sa-card">
            <header className="sa-card-head">
                <div>
                    <h2>{t('spellingAnalysis:ranking.title')}</h2>
                    <p>{t('spellingAnalysis:ranking.hint', { value: minAttempts || 0 })}</p>
                </div>
                {ranking && ranking.unranked.length > 0 && (
                    <span className="sa-note">
                        {t('spellingAnalysis:ranking.unranked', { value: ranking.unranked.length })}
                    </span>
                )}
            </header>
            <div className="sa-rank-grid">
                <RankingList rows={ranking?.top || []} title={t('spellingAnalysis:ranking.top')} onView={onView} tone="top" />
                <RankingList rows={ranking?.bottom || []} title={t('spellingAnalysis:ranking.bottom')} onView={onView} tone="bottom" />
            </div>
        </section>
    );
}
