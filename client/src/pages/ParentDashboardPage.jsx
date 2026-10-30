import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
    HiOutlineAcademicCap,
    HiOutlineArrowPath,
    HiOutlineCalendarDays,
    HiOutlineChatBubbleLeftRight,
    HiOutlineChevronRight,
    HiOutlineClipboardDocumentCheck,
    HiOutlineFaceSmile,
    HiOutlineInboxArrowDown,
    HiOutlineNewspaper,
    HiOutlineUserGroup,
} from 'react-icons/hi2';
import api from '../config/api';
import { selectUser } from '../store/slices/authSlice';
import './ParentDashboardPage.css';

const greetingKey = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
};

const initials = (name = '') =>
    String(name)
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase();

const formatDate = (value, locale) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date);
};

const classLabelFor = (child) => {
    const className = String(child.class || '').trim();
    const grade = String(child.grade || '').trim();
    if (!className) return grade;
    if (!grade || className.toLowerCase().includes(grade.toLowerCase())) return className;
    return `${className} · ${grade}`;
};

const averageOf = (values) => {
    const numbers = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
    if (!numbers.length) return null;
    return Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
};

const ChildCard = ({ child, locale, t }) => {
    const attendance = typeof child.attendanceRate === 'number' ? Math.round(child.attendanceRate) : null;
    const alerts = child.recentAlerts || [];
    const alert = alerts[0] || null;
    const classLabel = classLabelFor(child);
    const pending = child.pendingRequestsCount || 0;

    return (
        <article className="pd-child-card">
            <header className="pd-child-head">
                <span className="pd-avatar" aria-hidden="true">{initials(child.name)}</span>
                <div className="pd-child-identity">
                    <h3>{child.name}</h3>
                    <p>{classLabel || t('child.noClass')}</p>
                </div>
            </header>

            <div className="pd-child-stats">
                <div className="pd-stat">
                    <span className="pd-stat-label">{t('child.attendance')}</span>
                    <span className={`pd-stat-value ${attendance === null ? 'is-empty' : ''}`}>
                        {attendance === null ? '—' : `${attendance}%`}
                    </span>
                    {attendance === null ? (
                        <span className="pd-stat-note">{t('child.noAttendance')}</span>
                    ) : (
                        <span className="pd-meter" aria-hidden="true">
                            <span style={{ width: `${attendance}%` }} />
                        </span>
                    )}
                </div>
                <div className="pd-stat">
                    <span className="pd-stat-label">{t('child.pending')}</span>
                    <span className={`pd-stat-value ${pending ? 'is-warn' : ''}`}>{pending}</span>
                    <span className="pd-stat-note">
                        {pending ? t('child.pendingOpen') : t('child.pendingNone')}
                    </span>
                </div>
            </div>

            <div className="pd-child-update">
                <div className="pd-update-head">
                    <span className="pd-update-label">{t('child.latestUpdate')}</span>
                    {alert && !alert.readAt && (
                        <span className="pd-badge">{t('updates.unread')}</span>
                    )}
                </div>
                {alert ? (
                    <>
                        <strong>{alert.title || t('updates.schoolUpdate')}</strong>
                        <p>{alert.message}</p>
                        <time dateTime={alert.createdAt}>{formatDate(alert.createdAt, locale)}</time>
                    </>
                ) : (
                    <p className="pd-muted">{t('child.noUpdates')}</p>
                )}
            </div>

            <nav className="pd-child-actions" aria-label={t('child.actionsLabel', { name: child.name })}>
                <Link className="pd-action" to={`/portal/parent-gradebook?child=${child.id}`}>
                    <HiOutlineAcademicCap size={17} />
                    <span>{t('actions.grades')}</span>
                </Link>
                <Link className="pd-action" to="/portal/parent/support">
                    <HiOutlineClipboardDocumentCheck size={17} />
                    <span>{t('actions.support')}</span>
                </Link>
                <Link className="pd-action" to={`/portal/parent-plp-report/${child.id}`}>
                    <HiOutlineFaceSmile size={17} />
                    <span>{t('actions.report')}</span>
                </Link>
                <Link className="pd-action" to="/portal/newsletters/history">
                    <HiOutlineNewspaper size={17} />
                    <span>{t('actions.letters')}</span>
                </Link>
            </nav>
        </article>
    );
};

const DashboardSkeleton = ({ label, dir }) => (
    <div className="parent-dashboard pd-skeleton" aria-busy="true" aria-live="polite" dir={dir}>
        <span className="pd-sr-only">{label}</span>
        <div className="pd-skel pd-skel-hero" />
        <div className="pd-skel-summary">
            {Array.from({ length: 4 }, (_, index) => (
                <div className="pd-skel pd-skel-tile" key={index} />
            ))}
        </div>
        <div className="pd-skel-layout">
            <div className="pd-skel-child-grid">
                <div className="pd-skel pd-skel-card" />
                <div className="pd-skel pd-skel-card" />
            </div>
            <div className="pd-skel pd-skel-rail" />
        </div>
    </div>
);

const ParentDashboardPage = () => {
    const { t, i18n } = useTranslation('parentPortal');
    const user = useSelector(selectUser);
    const language = i18n.language?.startsWith('ar') ? 'ar' : 'en';
    const locale = language === 'ar' ? 'ar-EG' : 'en-GB';

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await api.get('/parent/dashboard');
            setData(response.data?.data || null);
        } catch (requestError) {
            setError(requestError.response?.data?.message || t('states.error'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        load();
    }, [load]);

    const children = useMemo(() => data?.children || [], [data]);
    const attendanceAverage = useMemo(
        () => averageOf(children.map((child) => child.attendanceRate)),
        [children]
    );
    const updates = useMemo(
        () =>
            children
                .flatMap((child) =>
                    (child.recentAlerts || []).map((alert) => ({ ...alert, childName: child.name }))
                )
                .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
                .slice(0, 5),
        [children]
    );

    const firstName = user?.firstName || t('greeting.parent');

    if (loading) {
        return <DashboardSkeleton label={t('states.loading')} dir={language === 'ar' ? 'rtl' : 'ltr'} />;
    }

    if (error) {
        return (
            <div className="parent-dashboard" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                <div className="pd-state pd-state-error">
                    <HiOutlineArrowPath size={30} />
                    <p>{error}</p>
                    <button type="button" className="pd-retry" onClick={load}>{t('states.retry')}</button>
                </div>
            </div>
        );
    }

    return (
        <div className="parent-dashboard" dir={language === 'ar' ? 'rtl' : 'ltr'}>
            <header className="pd-hero">
                <div className="pd-hero-main">
                    <p className="pd-eyebrow">{t('header.eyebrow')}</p>
                    <h1>{t(`greeting.${greetingKey()}`)}, {firstName}</h1>
                    <p className="pd-subtitle">{t('header.subtitle')}</p>
                </div>
                <div className="pd-hero-side">
                    <span className="pd-hero-chip">
                        <HiOutlineCalendarDays size={15} />
                        {data?.academicYear || '—'}
                    </span>
                    <button
                        type="button"
                        className="pd-refresh"
                        onClick={load}
                        aria-label={t('states.refresh')}
                    >
                        <HiOutlineArrowPath size={16} />
                    </button>
                </div>
            </header>

            <section className="pd-summary" aria-label={t('summary.label')}>
                <div className="pd-summary-item">
                    <span className="pd-summary-icon"><HiOutlineUserGroup size={19} /></span>
                    <div><strong>{children.length}</strong><span>{t('summary.children')}</span></div>
                </div>
                <div className="pd-summary-item">
                    <span className="pd-summary-icon"><HiOutlineAcademicCap size={19} /></span>
                    <div>
                        <strong title={attendanceAverage === null ? t('child.noAttendance') : undefined}>
                            {attendanceAverage === null ? '—' : `${attendanceAverage}%`}
                        </strong>
                        <span>{t('summary.attendance')}</span>
                    </div>
                </div>
                <div className="pd-summary-item">
                    <span className="pd-summary-icon"><HiOutlineInboxArrowDown size={19} /></span>
                    <div><strong>{data?.pendingRequestsCount || 0}</strong><span>{t('summary.pending')}</span></div>
                </div>
                <Link className="pd-summary-item pd-summary-link" to="/portal/parent/updates">
                    <span className="pd-summary-icon"><HiOutlineChatBubbleLeftRight size={19} /></span>
                    <div><strong>{data?.unreadNotificationsCount || 0}</strong><span>{t('summary.unread')}</span></div>
                </Link>
            </section>

            {children.length === 0 ? (
                <section className="pd-empty">
                    <HiOutlineUserGroup size={40} />
                    <h2>{t('children.emptyTitle')}</h2>
                    <p>{t('children.emptyBody')}</p>
                </section>
            ) : (
                <div className="pd-layout">
                    <section className="pd-children">
                        <div className="pd-section-head">
                            <h2>{t('children.title')}</h2>
                            <span className="pd-view-only">{t('children.viewOnly')}</span>
                        </div>
                        <div className="pd-child-grid">
                            {children.map((child) => (
                                <ChildCard key={child.id} child={child} locale={locale} t={t} />
                            ))}
                        </div>
                    </section>

                    <aside className="pd-rail">
                        <section className="pd-rail-card">
                            <div className="pd-rail-head">
                                <h2>{t('updates.title')}</h2>
                                <Link className="pd-rail-link" to="/portal/parent/updates">
                                    {t('updates.viewAll')}
                                    <HiOutlineChevronRight size={14} aria-hidden="true" />
                                </Link>
                            </div>
                            {updates.length === 0 ? (
                                <p className="pd-muted">{t('updates.empty')}</p>
                            ) : (
                                <ul className="pd-update-list">
                                    {updates.map((update) => {
                                        const dateLabel = formatDate(update.createdAt, locale);
                                        return (
                                            <li key={update.id} className={update.readAt ? '' : 'is-unread'}>
                                                <span className="pd-timeline-dot" aria-hidden="true" />
                                                <div className="pd-update-body">
                                                    <strong>{update.title || t('updates.schoolUpdate')}</strong>
                                                    <p>{update.message}</p>
                                                    <span className="pd-update-meta">
                                                        <span>{update.childName}</span>
                                                        {dateLabel && <span>{dateLabel}</span>}
                                                        {!update.readAt && (
                                                            <span className="pd-badge">{t('updates.unread')}</span>
                                                        )}
                                                    </span>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </section>

                        <section className="pd-rail-card">
                            <h2>{t('links.title')}</h2>
                            <nav className="pd-links">
                                <Link to="/portal/parent-gradebook">
                                    <span className="pd-link-icon"><HiOutlineAcademicCap size={18} /></span>
                                    <span className="pd-link-label">{t('links.grades')}</span>
                                    <HiOutlineChevronRight className="pd-link-arrow" size={16} />
                                </Link>
                                <Link to="/portal/parent/support">
                                    <span className="pd-link-icon"><HiOutlineClipboardDocumentCheck size={18} /></span>
                                    <span className="pd-link-label">{t('links.support')}</span>
                                    <HiOutlineChevronRight className="pd-link-arrow" size={16} />
                                </Link>
                                <Link to="/portal/newsletters/history">
                                    <span className="pd-link-icon"><HiOutlineNewspaper size={18} /></span>
                                    <span className="pd-link-label">{t('links.newsletters')}</span>
                                    <HiOutlineChevronRight className="pd-link-arrow" size={16} />
                                </Link>
                                <Link to="/portal/attendance-requests">
                                    <span className="pd-link-icon"><HiOutlineInboxArrowDown size={18} /></span>
                                    <span className="pd-link-label">{t('links.requests')}</span>
                                    <HiOutlineChevronRight className="pd-link-arrow" size={16} />
                                </Link>
                                <Link to="/portal/parent/timetable">
                                    <span className="pd-link-icon"><HiOutlineCalendarDays size={18} /></span>
                                    <span className="pd-link-label">{t('links.timetable')}</span>
                                    <HiOutlineChevronRight className="pd-link-arrow" size={16} />
                                </Link>
                            </nav>
                        </section>
                    </aside>
                </div>
            )}
        </div>
    );
};

export default ParentDashboardPage;
