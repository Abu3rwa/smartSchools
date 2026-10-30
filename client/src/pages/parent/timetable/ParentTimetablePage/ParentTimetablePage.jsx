import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    HiOutlineArrowLeft,
    HiOutlineArrowPath,
    HiOutlineCalendarDays,
    HiOutlineChevronLeft,
    HiOutlineChevronRight,
    HiOutlineClock,
    HiOutlineMapPin,
    HiOutlineUserGroup,
    HiOutlineUser,
} from 'react-icons/hi2';
import api from '../../../../config/api';
import parentGradebookService from '../../../../services/parentGradebookService';
import './ParentTimetablePage.css';

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const startOfWeek = (value) => {
    const date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
    const day = date.getDay();
    date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
    return date;
};

const addDays = (date, amount) => {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
};

const toDateParam = (date) => {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
};

const isSameDay = (left, right) => left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();

const formatWeekRange = (monday, locale) => {
    const sunday = addDays(monday, 6);
    try {
        return new Intl.DateTimeFormat(locale, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        }).formatRange(monday, sunday);
    } catch {
        const format = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
        return `${format.format(monday)} – ${format.format(sunday)}`;
    }
};

const ParentTimetablePage = () => {
    const { t, i18n } = useTranslation('parentPortal');
    const language = i18n.language?.startsWith('ar') ? 'ar' : 'en';
    const locale = language === 'ar' ? 'ar-EG' : 'en-GB';

    const [children, setChildren] = useState([]);
    const [childrenLoading, setChildrenLoading] = useState(true);
    const [childrenError, setChildrenError] = useState('');
    const [childId, setChildId] = useState('');

    const [anchor, setAnchor] = useState(() => new Date());
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const loadChildren = useCallback(async () => {
        setChildrenLoading(true);
        setChildrenError('');
        try {
            const response = await parentGradebookService.getChildren();
            setChildren(response?.data || []);
        } catch (requestError) {
            setChildrenError(requestError.response?.data?.message || t('timetable.loadFailed'));
        } finally {
            setChildrenLoading(false);
        }
    }, [t]);

    useEffect(() => {
        loadChildren();
    }, [loadChildren]);

    const activeChild = children.length === 0
        ? null
        : children.find((child) => String(child.id) === String(childId)) || children[0];

    const loadTimetable = useCallback(async () => {
        if (!activeChild) return;
        setLoading(true);
        setError('');
        try {
            const response = await api.get(`/parent/children/${activeChild.id}/timetable`, {
                params: { date: toDateParam(anchor) },
            });
            setData(response.data?.data || null);
        } catch (requestError) {
            setData(null);
            setError(requestError.response?.data?.message || t('timetable.loadFailed'));
        } finally {
            setLoading(false);
        }
    }, [activeChild, anchor, t]);

    useEffect(() => {
        loadTimetable();
    }, [loadTimetable]);

    const monday = startOfWeek(anchor);
    const today = new Date();
    const isCurrentWeek = isSameDay(monday, startOfWeek(today));

    const byDay = new Map();
    (data?.entries || []).forEach((entry) => {
        if (!byDay.has(entry.dayOfWeek)) byDay.set(entry.dayOfWeek, []);
        byDay.get(entry.dayOfWeek).push(entry);
    });
    const days = DAY_ORDER.map((dayOfWeek, index) => ({
        dayOfWeek,
        date: addDays(monday, index),
        entries: byDay.get(dayOfWeek) || [],
    })).filter((day) => day.entries.length > 0);

    const classLabel = data?.class
        ? [data.class.name, data.class.section].filter(Boolean).join(' · ')
        : '';

    if (childrenLoading) {
        return (
            <div className="parent-timetable">
                <div className="pt-state"><div className="spinner" /><p>{t('timetable.loading')}</p></div>
            </div>
        );
    }

    if (childrenError) {
        return (
            <div className="parent-timetable">
                <div className="pt-state pt-state-error">
                    <HiOutlineArrowPath size={30} />
                    <p>{childrenError}</p>
                    <button type="button" className="pt-retry" onClick={loadChildren}>{t('states.retry')}</button>
                </div>
            </div>
        );
    }

    if (children.length === 0) {
        return (
            <div className="parent-timetable" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                <div className="pt-empty">
                    <HiOutlineUserGroup size={40} />
                    <h2>{t('children.emptyTitle')}</h2>
                    <p>{t('children.emptyBody')}</p>
                    <Link className="pt-back" to="/portal/dashboard">
                        <HiOutlineArrowLeft size={16} />
                        {t('timetable.back')}
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="parent-timetable" dir={language === 'ar' ? 'rtl' : 'ltr'}>
            <header className="pt-header">
                <div className="pt-heading">
                    <Link className="pt-back" to="/portal/dashboard">
                        <HiOutlineArrowLeft size={16} />
                        {t('timetable.back')}
                    </Link>
                    <p className="pt-eyebrow">{t('header.eyebrow')}</p>
                    <h1>{t('timetable.title')}</h1>
                    <p className="pt-subtitle">{t('timetable.subtitle', { name: activeChild.name })}</p>
                </div>
                <div className="pt-header-meta">
                    {classLabel && <span className="pt-class-chip">{classLabel}</span>}
                    <span className="pt-view-only">{t('children.viewOnly')}</span>
                </div>
            </header>

            {children.length > 1 && (
                <div className="pt-filters" role="group" aria-label={t('timetable.title')}>
                    {children.map((child) => (
                        <button
                            key={child.id}
                            type="button"
                            className={`pt-chip ${String(child.id) === String(activeChild.id) ? 'is-active' : ''}`}
                            onClick={() => setChildId(String(child.id))}
                            aria-pressed={String(child.id) === String(activeChild.id)}
                        >
                            {child.name}
                        </button>
                    ))}
                </div>
            )}

            <div className="pt-weekbar">
                <button
                    type="button"
                    className="pt-week-nav"
                    onClick={() => setAnchor(addDays(monday, -7))}
                    aria-label={t('timetable.previousWeek')}
                >
                    <HiOutlineChevronLeft size={18} aria-hidden="true" />
                </button>
                <div className="pt-week-label">
                    <HiOutlineCalendarDays size={16} aria-hidden="true" />
                    <strong>{formatWeekRange(monday, locale)}</strong>
                    {isCurrentWeek && <span className="pt-today-chip">{t('timetable.thisWeek')}</span>}
                </div>
                <button
                    type="button"
                    className="pt-week-nav"
                    onClick={() => setAnchor(addDays(monday, 7))}
                    aria-label={t('timetable.nextWeek')}
                >
                    <HiOutlineChevronRight size={18} aria-hidden="true" />
                </button>
            </div>

            {loading ? (
                <div className="pt-state"><div className="spinner" /><p>{t('timetable.loading')}</p></div>
            ) : error ? (
                <div className="pt-state pt-state-error">
                    <HiOutlineArrowPath size={30} />
                    <p>{error}</p>
                    <button type="button" className="pt-retry" onClick={loadTimetable}>{t('states.retry')}</button>
                </div>
            ) : !data?.class ? (
                <div className="pt-empty">
                    <HiOutlineCalendarDays size={38} />
                    <h2>{t('timetable.noClass')}</h2>
                    <p>{t('timetable.noClassBody')}</p>
                </div>
            ) : days.length === 0 ? (
                <div className="pt-empty">
                    <HiOutlineCalendarDays size={38} />
                    <h2>{t('timetable.empty')}</h2>
                    <p>{t('timetable.emptyBody')}</p>
                    {!isCurrentWeek && (
                        <button type="button" className="pt-retry" onClick={() => setAnchor(new Date())}>
                            {t('timetable.thisWeek')}
                        </button>
                    )}
                </div>
            ) : (
                <div className="pt-days">
                    {days.map((day) => {
                        const isToday = isSameDay(day.date, today);
                        return (
                            <section key={day.dayOfWeek} className={`pt-day ${isToday ? 'is-today' : ''}`}>
                                <header className="pt-day-head">
                                    <div>
                                        <h2>{new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(day.date)}</h2>
                                        <span>
                                            {new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(day.date)}
                                        </span>
                                    </div>
                                    {isToday && <span className="pt-today-chip">{t('timetable.today')}</span>}
                                </header>
                                <ul className="pt-lessons">
                                    {day.entries.map((entry) => (
                                        <li key={entry.id} className="pt-lesson">
                                            <div className="pt-time">
                                                {entry.period?.startTime ? (
                                                    <>
                                                        <HiOutlineClock size={13} aria-hidden="true" />
                                                        <span>
                                                            {entry.period.startTime}
                                                            {entry.period.endTime ? ` – ${entry.period.endTime}` : ''}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span>{entry.period?.name || '—'}</span>
                                                )}
                                            </div>
                                            <strong className="pt-subject">
                                                {entry.subject?.name || entry.period?.name || '—'}
                                            </strong>
                                            <div className="pt-meta">
                                                {entry.teacher?.name && (
                                                    <span className="pt-teacher">
                                                        <HiOutlineUser size={13} aria-hidden="true" />
                                                        {entry.teacher.name}
                                                    </span>
                                                )}
                                                {entry.room?.name && (
                                                    <span className="pt-room">
                                                        <HiOutlineMapPin size={13} aria-hidden="true" />
                                                        {entry.room.name}
                                                    </span>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ParentTimetablePage;
