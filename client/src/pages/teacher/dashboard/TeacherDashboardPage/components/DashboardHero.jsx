import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiOutlineCalendar, HiOutlineMail } from 'react-icons/hi';
import { formatTime, getGreeting } from '../utils/teacherDashboardPresentation';

const NextClassCard = ({ loading, hasClasses, next, locale }) => {
    const { t } = useTranslation(['dashboard']);

    if (loading) {
        return (
            <div className="td-next">
                <div className="td-sk" style={{ height: 11, width: 64 }} />
                <div className="td-sk" style={{ height: 16, width: 130, marginTop: 9 }} />
                <div className="td-sk" style={{ height: 11, width: 96, marginTop: 7 }} />
            </div>
        );
    }

    if (!hasClasses) {
        return (
            <div className="td-next">
                <div className="td-next-label done">
                    <i />
                    {t('dashboard:teacherDashboard.summary.today')}
                </div>
                <div className="td-next-title">{t('dashboard:teacherDashboard.todaySchedule.noneToday')}</div>
                <div className="td-next-meta">{t('dashboard:teacherDashboard.todaySchedule.empty')}</div>
            </div>
        );
    }

    if (!next) {
        return (
            <div className="td-next">
                <div className="td-next-label done">
                    <i />
                    {t('dashboard:teacherDashboard.summary.today')}
                </div>
                <div className="td-next-title">{t('dashboard:teacherDashboard.todaySchedule.dayDone')}</div>
                <div className="td-next-meta">{t('dashboard:teacherDashboard.todaySchedule.dayDoneMeta')}</div>
            </div>
        );
    }

    const { row, live, minutesUntil } = next;
    const roomName = row.room?.name || row.room;

    return (
        <div className="td-next">
            <div className="td-next-label">
                <i />
                {t('dashboard:teacherDashboard.todaySchedule.next')}
            </div>
            <div className="td-next-title">{row.subject?.name || '—'}</div>
            <div className="td-next-meta">
                <span>{row.class?.name || '—'}</span>
                {row.startTime && (
                    <span>
                        <bdi dir="ltr">{`${formatTime(row.startTime, locale)} – ${formatTime(row.endTime, locale)}`}</bdi>
                    </span>
                )}
                {roomName && <span>{`${t('dashboard:teacherDashboard.todaySchedule.room')} ${roomName}`}</span>}
            </div>
            {minutesUntil !== null && (
                <span className="td-next-count">
                    {live
                        ? t('dashboard:teacherDashboard.todaySchedule.running')
                        : t('dashboard:teacherDashboard.todaySchedule.startsIn', { m: minutesUntil })}
                </span>
            )}
        </div>
    );
};

const DashboardHero = ({ firstName, dateLabel, classChips, inboxCount, loading, error, hasClasses, next, locale }) => {
    const { t } = useTranslation(['dashboard']);
    const navigate = useNavigate();

    return (
        <section className="td-hero">
            <div className="td-hero-main">
                <span className="td-eyebrow">
                    <HiOutlineCalendar size={13} />
                    {dateLabel}
                </span>
                <h2>{`${getGreeting(t)}, ${firstName}!`}</h2>
                <p className="td-hero-sub">{t('dashboard:teacherDashboard.header.subtitle')}</p>
                <div className="td-herorow">
                    {classChips.map((chip) => (
                        <span className="td-classchip" key={chip.key}>
                            <i />
                            <b>{chip.className}</b>
                            {chip.subjectName ? ` · ${chip.subjectName}` : ''}
                        </span>
                    ))}
                    {inboxCount > 0 && (
                        <button type="button" className="td-inbox" onClick={() => navigate('/portal/inbox')}>
                            <HiOutlineMail size={14} />
                            <span>{t('dashboard:teacherDashboard.inbox.badge', { n: inboxCount })}</span>
                        </button>
                    )}
                </div>
            </div>
            {!error && (
                <NextClassCard loading={loading} hasClasses={hasClasses} next={next} locale={locale} />
            )}
        </section>
    );
};

export default DashboardHero;