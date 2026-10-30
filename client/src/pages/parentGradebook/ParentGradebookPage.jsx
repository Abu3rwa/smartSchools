import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    HiOutlineAcademicCap,
    HiOutlineArrowLeft,
    HiOutlineArrowPath,
    HiOutlineChartBar,
    HiOutlineChevronDown,
    HiOutlineChevronUp,
    HiOutlineDocumentText,
    HiOutlineFaceSmile,
    HiOutlineUserGroup
} from 'react-icons/hi2';
import parentGradebookService from '../../services/parentGradebookService';
import './ParentGradebookPage.css';

const TABS = [
    { key: 'grades', icon: HiOutlineAcademicCap },
    { key: 'progress', icon: HiOutlineChartBar },
    { key: 'reports', icon: HiOutlineDocumentText }
];

const formatPercent = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return `${Number.isInteger(number) ? number : number.toFixed(1)}%`;
};

const formatDate = (value, locale) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
};

const gradeColor = (percentage) => {
    const value = Number(percentage);
    if (!Number.isFinite(value)) return 'var(--pg-muted)';
    if (value >= 90) return '#15803d';
    if (value >= 80) return '#1d4ed8';
    if (value >= 70) return '#b45309';
    if (value >= 60) return '#c2410c';
    return '#b91c1c';
};

const periodLabel = (card, t) => {
    if (card?.period?.label) return card.period.label;
    const labels = {
        semester_1: t('gradebook.term1'),
        semester_2: t('gradebook.term2'),
        full_year: t('gradebook.fullYear')
    };
    return labels[card?.period?.type] || t('gradebook.reportCard');
};

const ParentGradebookPage = () => {
    const { t, i18n } = useTranslation('parentPortal');
    const [searchParams, setSearchParams] = useSearchParams();
    const language = i18n.language?.startsWith('ar') ? 'ar' : 'en';
    const locale = language === 'ar' ? 'ar-EG' : 'en-GB';

    const [children, setChildren] = useState([]);
    const [childrenLoading, setChildrenLoading] = useState(true);
    const [childrenError, setChildrenError] = useState('');

    const [grades, setGrades] = useState(null);
    const [progress, setProgress] = useState(null);
    const [reportCards, setReportCards] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState('');

    const [activeTab, setActiveTab] = useState('grades');
    const [semester, setSemester] = useState('');
    const [expanded, setExpanded] = useState({});

    const loadChildren = useCallback(async () => {
        setChildrenLoading(true);
        setChildrenError('');
        try {
            const response = await parentGradebookService.getChildren();
            setChildren(response?.data || []);
        } catch (error) {
            setChildrenError(error.response?.data?.message || t('gradebook.loadFailed'));
        } finally {
            setChildrenLoading(false);
        }
    }, [t]);

    useEffect(() => {
        loadChildren();
    }, [loadChildren]);

    const requestedChildId = searchParams.get('child');
    const activeChild = useMemo(() => {
        if (children.length === 0) return null;
        return children.find((child) => String(child.id) === requestedChildId) || children[0];
    }, [children, requestedChildId]);

    const selectChild = (childId) => {
        setSearchParams((current) => {
            const next = new URLSearchParams(current);
            next.set('child', String(childId));
            return next;
        });
        setExpanded({});
    };

    const loadChildData = useCallback(async () => {
        if (!activeChild) return;
        setLoading(true);
        setLoadError('');
        try {
            const year = activeChild.academicYear;
            const params = { academicYear: year };
            if (semester) params.semester = semester;

            const [gradesResponse, progressResponse, reportsResponse] = await Promise.all([
                parentGradebookService.getGrades(activeChild.id, params),
                parentGradebookService.getProgress(activeChild.id, { academicYear: year }).catch(() => null),
                parentGradebookService.getReportCards(activeChild.id).catch(() => null)
            ]);

            setGrades(gradesResponse?.data || null);
            setProgress(progressResponse?.data || null);
            setReportCards(reportsResponse?.data || []);
        } catch (error) {
            setGrades(null);
            setProgress(null);
            setReportCards([]);
            setLoadError(error.response?.data?.message || t('gradebook.loadFailed'));
        } finally {
            setLoading(false);
        }
    }, [activeChild, semester, t]);

    useEffect(() => {
        loadChildData();
    }, [loadChildData]);

    const toggleSubject = (subject) => {
        setExpanded((current) => ({ ...current, [subject]: !current[subject] }));
    };

    if (childrenLoading) {
        return (
            <div className="parent-gradebook">
                <div className="pg-state"><div className="spinner" /><p>{t('gradebook.loading')}</p></div>
            </div>
        );
    }

    if (childrenError) {
        return (
            <div className="parent-gradebook">
                <div className="pg-state pg-state-error">
                    <HiOutlineArrowPath size={30} />
                    <p>{childrenError}</p>
                    <button type="button" className="pg-retry" onClick={loadChildren}>{t('states.retry')}</button>
                </div>
            </div>
        );
    }

    if (children.length === 0) {
        return (
            <div className="parent-gradebook" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                <div className="pg-empty">
                    <HiOutlineUserGroup size={40} />
                    <h2>{t('children.emptyTitle')}</h2>
                    <p>{t('children.emptyBody')}</p>
                    <Link className="pg-back" to="/portal/dashboard">
                        <HiOutlineArrowLeft size={16} />
                        {t('gradebook.back')}
                    </Link>
                </div>
            </div>
        );
    }

    const subjects = grades?.subjects || [];

    return (
        <div className="parent-gradebook" dir={language === 'ar' ? 'rtl' : 'ltr'}>
            <header className="pg-header">
                <div className="pg-heading">
                    <Link className="pg-back" to="/portal/dashboard">
                        <HiOutlineArrowLeft size={16} />
                        {t('gradebook.back')}
                    </Link>
                    <p className="pg-eyebrow">{t('header.eyebrow')}</p>
                    <h1>{t('gradebook.title')}</h1>
                    <p className="pg-subtitle">{t('gradebook.subtitle', { name: activeChild.name })}</p>
                </div>
                <div className="pg-header-meta">
                    <span className="pg-year">{activeChild.academicYear || '—'}</span>
                    <span className="pg-view-only">{t('children.viewOnly')}</span>
                    <button
                        type="button"
                        className="pg-refresh"
                        onClick={loadChildData}
                        aria-label={t('states.refresh')}
                        disabled={loading}
                    >
                        <HiOutlineArrowPath size={16} />
                    </button>
                </div>
            </header>

            {children.length > 1 && (
                <nav className="pg-children" aria-label={t('children.title')}>
                    {children.map((child) => (
                        <button
                            key={child.id}
                            type="button"
                            className={`pg-child-chip ${child.id === activeChild.id ? 'is-active' : ''}`}
                            onClick={() => selectChild(child.id)}
                            aria-pressed={child.id === activeChild.id}
                        >
                            <strong>{child.name}</strong>
                            <span>{child.class || child.grade || t('child.noClass')}</span>
                        </button>
                    ))}
                </nav>
            )}

            <div className="pg-toolbar">
                <div className="pg-tabs" role="tablist" aria-label={t('gradebook.title')}>
                    {TABS.map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === tab.key}
                            className={`pg-tab ${activeTab === tab.key ? 'is-active' : ''}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            <tab.icon size={17} />
                            {t(`gradebook.tabs.${tab.key}`)}
                        </button>
                    ))}
                </div>

                <div className="pg-toolbar-end">
                    {activeTab === 'grades' && (
                        <label className="pg-select">
                            <span>{t('gradebook.term')}</span>
                            <select value={semester} onChange={(event) => setSemester(event.target.value)}>
                                <option value="">{t('gradebook.allTerms')}</option>
                                <option value="1">{t('gradebook.term1')}</option>
                                <option value="2">{t('gradebook.term2')}</option>
                            </select>
                        </label>
                    )}
                    <Link className="pg-action" to={`/portal/parent-plp-report/${activeChild.id}`}>
                        <HiOutlineFaceSmile size={17} />
                        {t('actions.report')}
                    </Link>
                </div>
            </div>

            {loadError ? (
                <div className="pg-state pg-state-error">
                    <HiOutlineArrowPath size={30} />
                    <p>{loadError}</p>
                    <button type="button" className="pg-retry" onClick={loadChildData}>{t('states.retry')}</button>
                </div>
            ) : loading ? (
                <div className="pg-state"><div className="spinner" /><p>{t('gradebook.loading')}</p></div>
            ) : (
                <>
                    {activeTab === 'grades' && (
                        <section className="pg-tab-panel">
                            <div className="pg-overall">
                                <div>
                                    <span className="pg-label">{t('gradebook.overall')}</span>
                                    <strong className="pg-overall-value" style={{ color: gradeColor(grades?.overallAverage) }}>
                                        {grades?.totalGrades ? formatPercent(grades.overallAverage) : '—'}
                                    </strong>
                                </div>
                                <dl className="pg-overall-meta">
                                    <div>
                                        <dt>{t('gradebook.subjects')}</dt>
                                        <dd>{subjects.length}</dd>
                                    </div>
                                    <div>
                                        <dt>{t('gradebook.assessments')}</dt>
                                        <dd>{grades?.totalGrades || 0}</dd>
                                    </div>
                                </dl>
                            </div>

                            {subjects.length === 0 ? (
                                <div className="pg-empty pg-empty-inline">
                                    <HiOutlineAcademicCap size={34} />
                                    <p>{t('gradebook.noGrades')}</p>
                                </div>
                            ) : (
                                <div className="pg-subjects">
                                    {subjects.map((subject) => {
                                        const isOpen = Boolean(expanded[subject.subject]);
                                        return (
                                            <article key={subject.subject} className={`pg-subject ${isOpen ? 'is-open' : ''}`}>
                                                <button
                                                    type="button"
                                                    className="pg-subject-head"
                                                    onClick={() => toggleSubject(subject.subject)}
                                                    aria-expanded={isOpen}
                                                >
                                                    <span className="pg-subject-title">
                                                        {isOpen ? <HiOutlineChevronUp size={17} /> : <HiOutlineChevronDown size={17} />}
                                                        <strong>{subject.subject}</strong>
                                                    </span>
                                                    <span className="pg-subject-side">
                                                        <span className="pg-count">
                                                            {subject.totalGrades} · {t('gradebook.assessments')}
                                                        </span>
                                                        <strong style={{ color: gradeColor(subject.average) }}>
                                                            {formatPercent(subject.average)}
                                                        </strong>
                                                    </span>
                                                </button>

                                                {isOpen && (
                                                    <div className="pg-table-wrap">
                                                        <table className="pg-table">
                                                            <thead>
                                                                <tr>
                                                                    <th>{t('gradebook.table.date')}</th>
                                                                    <th>{t('gradebook.table.assessment')}</th>
                                                                    <th>{t('gradebook.table.category')}</th>
                                                                    <th className="is-numeric">{t('gradebook.table.score')}</th>
                                                                    <th className="is-numeric">{t('gradebook.table.percent')}</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {(subject.recentGrades || []).map((grade, index) => (
                                                                    <tr key={`${subject.subject}-${index}`}>
                                                                        <td>{formatDate(grade.date, locale)}</td>
                                                                        <td>
                                                                            <strong>{grade.title || grade.category || '—'}</strong>
                                                                            {grade.comment && <span className="pg-comment">{grade.comment}</span>}
                                                                        </td>
                                                                        <td>
                                                                            <span className="pg-tag">{grade.category || '—'}</span>
                                                                        </td>
                                                                        <td className="is-numeric">{grade.marks}/{grade.maxMarks}</td>
                                                                        <td className="is-numeric" style={{ color: gradeColor(grade.percentage) }}>
                                                                            {formatPercent(grade.percentage)}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </article>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    )}

                    {activeTab === 'progress' && (
                        <section className="pg-tab-panel">
                            <div className="pg-split">
                                <div className="pg-stat-card">
                                    <span className="pg-label">{t('gradebook.term1')}</span>
                                    <strong style={{ color: gradeColor(progress?.semester1Average) }}>
                                        {progress?.semester1Average == null ? '—' : formatPercent(progress.semester1Average)}
                                    </strong>
                                </div>
                                <div className="pg-stat-card">
                                    <span className="pg-label">{t('gradebook.term2')}</span>
                                    <strong style={{ color: gradeColor(progress?.semester2Average) }}>
                                        {progress?.semester2Average == null ? '—' : formatPercent(progress.semester2Average)}
                                    </strong>
                                </div>
                            </div>

                            {(progress?.subjectComparison || []).length === 0 ? (
                                <div className="pg-empty pg-empty-inline">
                                    <HiOutlineChartBar size={34} />
                                    <p>{t('gradebook.noProgress')}</p>
                                </div>
                            ) : (
                                <div className="pg-card">
                                    <h2>{t('gradebook.comparison')}</h2>
                                    <div className="pg-table-wrap">
                                        <table className="pg-table">
                                            <thead>
                                                <tr>
                                                    <th>{t('gradebook.table.subject')}</th>
                                                    <th className="is-numeric">{t('gradebook.term1')}</th>
                                                    <th className="is-numeric">{t('gradebook.term2')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {progress.subjectComparison.map((row) => (
                                                    <tr key={row.subject}>
                                                        <td><strong>{row.subject}</strong></td>
                                                        <td className="is-numeric" style={{ color: gradeColor(row.semester1Avg) }}>
                                                            {row.semester1Avg == null ? '—' : formatPercent(row.semester1Avg)}
                                                        </td>
                                                        <td className="is-numeric" style={{ color: gradeColor(row.semester2Avg) }}>
                                                            {row.semester2Avg == null ? '—' : formatPercent(row.semester2Avg)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {(progress?.recentGrades || []).length > 0 && (
                                <div className="pg-card">
                                    <h2>{t('gradebook.recent')}</h2>
                                    <ul className="pg-recent">
                                        {progress.recentGrades.map((grade, index) => (
                                            <li key={`${grade.subject}-${index}`}>
                                                <div>
                                                    <strong>{grade.title || grade.category || grade.subject}</strong>
                                                    <span>{grade.subject} · {formatDate(grade.date, locale)}</span>
                                                </div>
                                                <span
                                                    className="pg-recent-score"
                                                    style={{ color: gradeColor(grade.percentage) }}
                                                >
                                                    {formatPercent(grade.percentage)}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </section>
                    )}

                    {activeTab === 'reports' && (
                        <section className="pg-tab-panel">
                            {reportCards.length === 0 ? (
                                <div className="pg-empty pg-empty-inline">
                                    <HiOutlineDocumentText size={34} />
                                    <p>{t('gradebook.noReports')}</p>
                                </div>
                            ) : (
                                <div className="pg-reports">
                                    {reportCards.map((card) => (
                                        <article key={card._id} className="pg-report">
                                            <div>
                                                <h2>{periodLabel(card, t)}</h2>
                                                <p>
                                                    {card.academicYear || activeChild.academicYear}
                                                    {' · '}
                                                    {t('gradebook.published')} {formatDate(card.publishedAt || card.generatedAt, locale)}
                                                </p>
                                            </div>
                                            <div className="pg-report-score">
                                                <strong style={{ color: gradeColor(card.overallAverage) }}>
                                                    {card.overallAverage == null ? '—' : formatPercent(card.overallAverage)}
                                                </strong>
                                                {card.overallGrade && <span>{card.overallGrade}</span>}
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </section>
                    )}
                </>
            )}
        </div>
    );
};

export default ParentGradebookPage;
