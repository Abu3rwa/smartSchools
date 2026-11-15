import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    HiOutlineAcademicCap,
    HiOutlineArrowRight,
    HiOutlineCalendar,
    HiOutlineExclamation,
    HiOutlineOfficeBuilding,
    HiOutlineRefresh
} from 'react-icons/hi';
import SectionCard from './SectionCard';
import CardLink from './CardLink';
import { SLOT_TONES, toneVar } from '../constants';
import { WEEKDAY_KEYS, formatTime, getSlotState } from '../utils/teacherDashboardPresentation';

const ScheduleSkeleton = () => (
    <div>
        {[0, 1, 2, 3].map((row) => (
            <div className="td-skrow" key={row}>
                <div className="td-sk" style={{ width: 56, height: 26 }} />
                <div className="td-sk" style={{ width: 10, height: 10, borderRadius: '50%' }} />
                <div className="td-skrow-body">
                    <div className="td-sk" style={{ height: 13, width: '45%' }} />
                    <div className="td-sk" style={{ height: 10, width: '65%', marginTop: 6 }} />
                </div>
            </div>
        ))}
    </div>
);

const TodaySlots = ({ rows, nowMinutes, locale, t }) => (
    <ul className="td-slots">
        {rows.map((row, index) => {
            const state = getSlotState(row, nowMinutes);
            const tone = toneVar(SLOT_TONES[index % SLOT_TONES.length]);
            const periodName = row._periodObj?.name
                || row.period?.name
                || t('dashboard:teacherDashboard.todaySchedule.periodFallback', { index: index + 1 });
            const roomName = row.room?.name || row.room;

            return (
                <li
                    key={row._id || index}
                    className={`td-slot${state === 'now' ? ' now' : ''}${state === 'past' ? ' past' : ''}`}
                    style={{ '--tone': tone }}
                >
                    <div className="td-time">
                        <bdi dir="ltr">
                            <b>{formatTime(row.startTime, locale)}</b>
                            <span>{formatTime(row.endTime, locale)}</span>
                        </bdi>
                    </div>
                    <div className="td-rail">
                        <i />
                    </div>
                    <div className="td-slotbody">
                        <div className="td-slotline">
                            <span className="td-slotsubject">{row.subject?.name || '—'}</span>
                            <span className="td-chip">{periodName}</span>
                            {state === 'now' && (
                                <span className="td-nowtag">{t('dashboard:teacherDashboard.todaySchedule.now')}</span>
                            )}
                        </div>
                        <div className="td-slotmeta">
                            <HiOutlineAcademicCap size={12} />
                            <b>{row.class?.name || '—'}</b>
                            {roomName && (
                                <>
                                    <HiOutlineOfficeBuilding size={12} />
                                    <span>{`${t('dashboard:teacherDashboard.todaySchedule.room')} ${roomName}`}</span>
                                </>
                            )}
                        </div>
                    </div>
                </li>
            );
        })}
    </ul>
);

const WeekStrip = ({ weekSchedule, today, locale, t }) => (
    <div className="td-week">
        {weekSchedule.map(({ day, rows }) => (
            <div className={`td-day${day === today ? ' today' : ''}`} key={day}>
                <div className="td-dayname">
                    {t(`dashboard:teacherDashboard.analytics.weekdays.${WEEKDAY_KEYS[day]}`)}
                </div>
                <div className="td-daycount">{rows.length}</div>
                <div className="td-daylist">
                    {rows.length === 0 ? (
                        <div className="td-dayempty">{t('dashboard:teacherDashboard.todaySchedule.noClasses')}</div>
                    ) : (
                        rows.map((row, index) => (
                            <div
                                className="td-mini"
                                key={row._id || index}
                                style={{ '--tone': toneVar(SLOT_TONES[index % SLOT_TONES.length]) }}
                                title={`${row.subject?.name || '—'} · ${row.class?.name || '—'} · ${formatTime(row.startTime, locale)}`}
                            >
                                {`${row.subject?.name || '—'} · ${row.class?.name || '—'}`}
                            </div>
                        ))
                    )}
                </div>
            </div>
        ))}
    </div>
);

const TodayScheduleCard = ({ todaySchedule, weekSchedule, timetableLoading, timetableError, nowMinutes, onRetry }) => {
    const { t, i18n } = useTranslation(['dashboard']);
    const [view, setView] = useState('today');
    const locale = i18n.resolvedLanguage || i18n.language;
    const today = new Date().getDay();

    const tabs = (
        <div className="td-tabs" role="group" aria-label={t('dashboard:teacherDashboard.todaySchedule.title')}>
            <button type="button" aria-pressed={view === 'today'} onClick={() => setView('today')}>
                {t('dashboard:teacherDashboard.summary.today')}
            </button>
            <button type="button" aria-pressed={view === 'week'} onClick={() => setView('week')}>
                {t('dashboard:teacherDashboard.todaySchedule.week')}
            </button>
        </div>
    );

    let body;
    if (timetableLoading) {
        body = <ScheduleSkeleton />;
    } else if (timetableError) {
        body = (
            <div className="td-empty err">
                <i><HiOutlineExclamation size={20} /></i>
                <p>{t('dashboard:teacherDashboard.todaySchedule.loadError')}</p>
                <button type="button" className="td-btn" onClick={onRetry}>
                    <HiOutlineRefresh size={14} />
                    {t('dashboard:teacherDashboard.todaySchedule.retry')}
                </button>
            </div>
        );
    } else if (view === 'week') {
        body = <WeekStrip weekSchedule={weekSchedule} today={today} locale={locale} t={t} />;
    } else if (todaySchedule.length === 0) {
        body = (
            <div className="td-empty">
                <i><HiOutlineCalendar size={20} /></i>
                <p>{t('dashboard:teacherDashboard.todaySchedule.empty')}</p>
                <Link to="/portal/my-timetable" className="td-btn">
                    <span className="td-flip"><HiOutlineArrowRight size={14} /></span>
                    {t('dashboard:teacherDashboard.todaySchedule.fullTimetable')}
                </Link>
            </div>
        );
    } else {
        body = <TodaySlots rows={todaySchedule} nowMinutes={nowMinutes} locale={locale} t={t} />;
    }

    const subtitle = timetableLoading || timetableError
        ? undefined
        : todaySchedule.length > 0
            ? t('dashboard:teacherDashboard.todaySchedule.classesCount', { value: todaySchedule.length })
            : t('dashboard:teacherDashboard.todaySchedule.noClasses');

    return (
        <SectionCard
            title={t('dashboard:teacherDashboard.todaySchedule.title')}
            subtitle={subtitle}
            icon={HiOutlineCalendar}
            tone="teal"
            action={(
                <>
                    {tabs}
                    <CardLink to="/portal/my-timetable">
                        {t('dashboard:teacherDashboard.todaySchedule.fullTimetable')}
                    </CardLink>
                </>
            )}
        >
            {body}
        </SectionCard>
    );
};

export default TodayScheduleCard;