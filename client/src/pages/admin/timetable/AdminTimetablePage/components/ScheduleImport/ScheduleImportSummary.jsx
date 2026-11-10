import { useTranslation } from 'react-i18next';
import { HiOutlineCheckCircle, HiOutlineExclamationCircle } from 'react-icons/hi';

const Stat = ({ label, value, tone = '' }) => (
    <div className={`schedule-import-stat ${tone}`}>
        <span>{label}</span>
        <strong>{value}</strong>
    </div>
);

const ScheduleImportSummary = ({
    summary,
    proposals,
    canApprove,
    needsPeriod,
    committing,
    onApprove,
    onAlignPeriods
}) => {
    const { t } = useTranslation();

    return (
        <div className="schedule-import-summary">
            <div className="schedule-import-stats">
                <Stat
                    label={t('adminTimetable:scheduleImport.summary.ready')}
                    value={summary.ready}
                    tone="success"
                />
                <Stat
                    label={t('adminTimetable:scheduleImport.summary.create')}
                    value={summary.willCreateSubject}
                    tone="create"
                />
                <Stat
                    label={t('adminTimetable:scheduleImport.summary.needs')}
                    value={summary.needsDecision}
                    tone={summary.needsDecision > 0 ? 'warning' : ''}
                />
                <Stat
                    label={t('adminTimetable:scheduleImport.summary.skipped')}
                    value={summary.skipped}
                    tone="muted"
                />
            </div>

            {proposals.length > 0 ? (
                <div className="schedule-import-proposals">
                    <span>{t('adminTimetable:scheduleImport.subjectsToCreate')}</span>
                    <ul>
                        {proposals.map((proposal) => (
                            <li key={proposal.code}>
                                <strong>{proposal.name}</strong>
                                <code>{proposal.code}</code>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {needsPeriod ? (
                <div className="schedule-import-warning">
                    <HiOutlineExclamationCircle size={18} />
                    <span>{t('adminTimetable:scheduleImport.periodMissing')}</span>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={onAlignPeriods}>
                        {t('adminTimetable:scheduleImport.alignPeriods')}
                    </button>
                </div>
            ) : null}

            <div className="schedule-import-approve">
                {!canApprove ? (
                    <span className="schedule-import-blocked">
                        <HiOutlineExclamationCircle size={16} />
                        {t('adminTimetable:scheduleImport.blocked')}
                    </span>
                ) : (
                    <span className="schedule-import-ready">
                        <HiOutlineCheckCircle size={16} />
                        {t('adminTimetable:scheduleImport.readyToApprove')}
                    </span>
                )}
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={onApprove}
                    disabled={!canApprove || committing}
                >
                    {committing
                        ? t('adminTimetable:scheduleImport.approving')
                        : t('adminTimetable:scheduleImport.approve')}
                </button>
            </div>
        </div>
    );
};

export default ScheduleImportSummary;
