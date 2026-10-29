import { useTranslation } from 'react-i18next';
import { HiOutlineRefresh } from 'react-icons/hi';

export default function AnalysisToolbar({
    allTime,
    grade,
    grades,
    loading,
    month,
    onAllTimeChange,
    onGradeChange,
    onMonthChange,
    onRefresh
}) {
    const { t } = useTranslation(['spellingAnalysis']);

    return (
        <div className="sa-toolbar">
            <div className="sa-toolbar-group">
                <label className="sa-field">
                    <span>{t('spellingAnalysis:period.label')}</span>
                    <input
                        type="month"
                        value={allTime ? '' : month}
                        disabled={allTime}
                        onChange={(event) => event.target.value && onMonthChange(event.target.value)}
                    />
                </label>
                <button
                    type="button"
                    className={`sa-toggle${allTime ? ' is-active' : ''}`}
                    onClick={() => onAllTimeChange(!allTime)}
                >
                    {t('spellingAnalysis:period.allTime')}
                </button>
            </div>

            <div className="sa-toolbar-group">
                <label className="sa-field">
                    <span>{t('spellingAnalysis:grade.label')}</span>
                    <select value={grade} onChange={(event) => onGradeChange(event.target.value)}>
                        {grades.length === 0 && <option value="">{t('spellingAnalysis:grade.empty')}</option>}
                        {grades.map((row) => <option key={row} value={row}>{row}</option>)}
                    </select>
                </label>
                <button type="button" className="btn btn-ghost btn-sm" disabled={loading} onClick={onRefresh}>
                    <HiOutlineRefresh size={15} aria-hidden="true" />
                    {t('spellingAnalysis:actions.refresh')}
                </button>
            </div>
        </div>
    );
}
