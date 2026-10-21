import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    HiOutlineChevronDown,
    HiOutlineClipboardCheck,
    HiOutlineInformationCircle,
    HiOutlineRefresh,
    HiOutlineSearch,
    HiOutlineX
} from 'react-icons/hi';

const formatSubmittedAt = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
};

const getInitials = (name = '') => {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return parts.slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase();
};

const sortAnswersByQuestionOrder = (answers, orderById) => {
    if (!orderById.size) return answers;
    return answers
        .map((answer, index) => ({ answer, index }))
        .sort((left, right) => {
            const leftOrder = orderById.get(String(left.answer.questionId || ''));
            const rightOrder = orderById.get(String(right.answer.questionId || ''));
            if (leftOrder === undefined && rightOrder === undefined) return left.index - right.index;
            if (leftOrder === undefined) return 1;
            if (rightOrder === undefined) return -1;
            return leftOrder - rightOrder;
        })
        .map((entry) => entry.answer);
};

const GoogleFormResultsPanel = ({ results, loading, onClose, onSync }) => {
    const { t } = useTranslation(['assignments']);
    const panelRef = useRef(null);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [syncing, setSyncing] = useState(false);
    const [expandedIds, setExpandedIds] = useState(() => new Set());

    const assignmentId = results?.assignment?.id;
    const items = useMemo(() => results?.items || [], [results]);
    const questions = useMemo(
        () => results?.assignment?.googleForm?.questions || [],
        [results]
    );

    useEffect(() => {
        if (!assignmentId) return undefined;
        const timer = window.setTimeout(() => panelRef.current?.focus(), 60);
        return () => window.clearTimeout(timer);
    }, [assignmentId]);

    useEffect(() => {
        if (!results) return undefined;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [results, onClose]);

    const questionTypes = useMemo(
        () => new Map(questions.map((question) => [String(question.questionId || ''), question.type])),
        [questions]
    );

    const questionOrderById = useMemo(
        () => new Map(questions.map((question, index) => [String(question.questionId || ''), index])),
        [questions]
    );

    const stats = useMemo(() => {
        const late = items.filter((item) => item.status === 'late').length;
        const needsReview = items.filter((item) => item.score === null).length;
        const scored = items.filter((item) => item.score !== null && Number(item.possibleScore) > 0);
        const average = scored.length > 0
            ? Math.round(scored.reduce(
                (total, item) => total + (Number(item.score) / Number(item.possibleScore)) * 100,
                0
            ) / scored.length)
            : null;
        return { late, needsReview, average };
    }, [items]);

    const visibleItems = useMemo(() => {
        const term = search.trim().toLowerCase();
        return items.filter((item) => {
            if (filter === 'late' && item.status !== 'late') return false;
            if (filter === 'review' && item.score !== null) return false;
            if (!term) return true;
            return [item.student?.name, item.student?.studentId]
                .some((value) => String(value || '').toLowerCase().includes(term));
        });
    }, [items, search, filter]);

    if (!results) return null;

    const assignment = results.assignment || {};
    const filters = [
        { key: 'all', label: t('assignments:googleForms.filterAll'), count: items.length },
        { key: 'review', label: t('assignments:googleForms.filterNeedsReview'), count: stats.needsReview },
        { key: 'late', label: t('assignments:googleForms.filterLate'), count: stats.late }
    ];

    const toggleExpanded = (id) => {
        setExpandedIds((previous) => {
            const next = new Set(previous);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSync = async () => {
        if (syncing) return;
        setSyncing(true);
        try {
            await onSync(assignment);
        } finally {
            setSyncing(false);
        }
    };

    return (
        <>
            <div
                className="google-form-results-overlay"
                onMouseDown={(event) => {
                    if (event.target === event.currentTarget) onClose();
                }}
                aria-hidden="true"
            />
            <section
                ref={panelRef}
                className="google-form-results"
                role="dialog"
                aria-modal="true"
                aria-labelledby="google-form-results-title"
                tabIndex={-1}
            >
                <header className="gfr-head">
                    <div className="gfr-head__intro">
                        <span className="gfr-head__icon" aria-hidden="true">
                            <HiOutlineClipboardCheck />
                        </span>
                        <div className="gfr-head__copy">
                            <span className="gfr-head__eyebrow">{t('assignments:googleForms.responsesEyebrow')}</span>
                            <h3 id="google-form-results-title">{assignment.title}</h3>
                            <div className="gfr-head__meta">
                                {assignment.class?.name && <span>{assignment.class.name}</span>}
                                {assignment.subject?.name && <span>{assignment.subject.name}</span>}
                                <span>{t('assignments:googleForms.questionsMeta', { count: questions.length })}</span>
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="assignments-icon-btn"
                        onClick={onClose}
                        aria-label={t('assignments:common.close')}
                    >
                        <HiOutlineX />
                    </button>
                </header>

                <div className="gfr-toolbar">
                    <div className="gfr-stats">
                        <div className="gfr-stat">
                            <span>{t('assignments:googleForms.responsesStat')}</span>
                            <strong>{items.length}</strong>
                        </div>
                        <div className="gfr-stat">
                            <span>{t('assignments:googleForms.filterLate')}</span>
                            <strong>{stats.late}</strong>
                        </div>
                        <div className="gfr-stat">
                            <span>{t('assignments:googleForms.needsReviewStat')}</span>
                            <strong>{stats.needsReview}</strong>
                        </div>
                        <div className="gfr-stat">
                            <span>{t('assignments:googleForms.averageScore')}</span>
                            <strong>{stats.average === null ? '—' : `${stats.average}%`}</strong>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={loading || syncing}
                        onClick={handleSync}
                    >
                        <HiOutlineRefresh aria-hidden="true" />
                        {syncing ? t('assignments:googleForms.syncing') : t('assignments:googleForms.sync')}
                    </button>
                </div>

                {items.length > 0 && (
                    <div className="gfr-controls">
                        <label className="gfr-search">
                            <HiOutlineSearch aria-hidden="true" />
                            <input
                                type="search"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder={t('assignments:googleForms.searchPlaceholder')}
                                aria-label={t('assignments:googleForms.searchPlaceholder')}
                            />
                        </label>
                        <div className="gfr-filters" role="group" aria-label={t('assignments:googleForms.responses')}>
                            {filters.map((item) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    className={`gfr-filter${filter === item.key ? ' is-active' : ''}`}
                                    aria-pressed={filter === item.key}
                                    onClick={() => setFilter(item.key)}
                                >
                                    {item.label}
                                    <span>{item.count}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="gfr-body">
                    {loading && items.length === 0 ? (
                        <div className="gfr-loading">
                            <span className="gfr-spinner" aria-hidden="true" />
                            <p>{t('assignments:googleForms.loadingResults')}</p>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="gfr-empty">
                            <span className="gfr-empty__icon" aria-hidden="true">
                                <HiOutlineClipboardCheck />
                            </span>
                            <strong>{t('assignments:googleForms.noResponses')}</strong>
                            <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={loading || syncing}
                                onClick={handleSync}
                            >
                                <HiOutlineRefresh aria-hidden="true" />
                                {syncing ? t('assignments:googleForms.syncing') : t('assignments:googleForms.sync')}
                            </button>
                        </div>
                    ) : visibleItems.length === 0 ? (
                        <div className="gfr-empty gfr-empty--compact">
                            <HiOutlineSearch aria-hidden="true" />
                            <p>{t('assignments:googleForms.noMatchingResponses')}</p>
                        </div>
                    ) : (
                        <div className="gfr-responses">
                            {visibleItems.map((item) => {
                                const expanded = expandedIds.has(item.id);
                                const submittedAt = formatSubmittedAt(item.submittedAt);
                                const orderedAnswers = sortAnswersByQuestionOrder(
                                    item.answers || [],
                                    questionOrderById
                                );
                                return (
                                    <article
                                        className={`gfr-response${expanded ? ' is-open' : ''}`}
                                        key={item.id}
                                    >
                                        <button
                                            type="button"
                                            className="gfr-response__summary"
                                            aria-expanded={expanded}
                                            onClick={() => toggleExpanded(item.id)}
                                        >
                                            <span className="gfr-response__avatar" aria-hidden="true">
                                                {getInitials(item.student?.name)}
                                            </span>
                                            <span className="gfr-response__who">
                                                <strong>{item.student?.name || item.student?.studentId || '?'}</strong>
                                                {item.student?.studentId && (
                                                    <span>{item.student.studentId}</span>
                                                )}
                                            </span>
                                            <span className="gfr-response__tags">
                                                {item.status === 'late' && (
                                                    <span className="gfr-tag gfr-tag--late">
                                                        {t('assignments:googleForms.lateBadge')}
                                                    </span>
                                                )}
                                                {item.score === null ? (
                                                    <span className="gfr-tag gfr-tag--review">
                                                        {t('assignments:googleForms.manualReview')}
                                                    </span>
                                                ) : (
                                                    <span className="gfr-tag gfr-tag--score" title={t('assignments:googleForms.score')}>
                                                        {`${item.score} / ${item.possibleScore ?? '?'}`}
                                                    </span>
                                                )}
                                            </span>
                                            {submittedAt && (
                                                <time
                                                    className="gfr-response__time"
                                                    dateTime={item.submittedAt}
                                                    title={t('assignments:googleForms.submittedAt')}
                                                >
                                                    {submittedAt}
                                                </time>
                                            )}
                                            <span className="gfr-response__expand">
                                                <span className="gfr-response__expand-label">
                                                    {expanded
                                                        ? t('assignments:googleForms.hideAnswers')
                                                        : t('assignments:googleForms.viewAnswers')}
                                                </span>
                                                <span className={`gfr-response__chevron${expanded ? ' is-open' : ''}`} aria-hidden="true">
                                                    <HiOutlineChevronDown />
                                                </span>
                                            </span>
                                        </button>

                                        {expanded && (
                                            <div className="gfr-response__details">
                                                <div className="gfr-response__details-head">
                                                    <span>{t('assignments:googleForms.answers')}</span>
                                                    <span>{orderedAnswers.length}</span>
                                                </div>
                                                {orderedAnswers.length ? (
                                                    <ol className="gfr-answers">
                                                        {orderedAnswers.map((answer, index) => {
                                                            const type = questionTypes.get(String(answer.questionId || ''));
                                                            const values = (answer.values || [])
                                                                .filter((value) => String(value || '').trim());
                                                            return (
                                                                <li className="gfr-answer" key={answer.questionId || `answer-${index}`}>
                                                                    <div className="gfr-answer__question">
                                                                        <span className="gfr-answer__index">{index + 1}</span>
                                                                        <p>{answer.question || t('assignments:googleForms.prompt')}</p>
                                                                        {type === 'short_answer' && (
                                                                            <span className="gfr-tag gfr-tag--review">
                                                                                {t('assignments:googleForms.manualReview')}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <p className={`gfr-answer__value${values.length === 0 ? ' is-empty' : ''}`}>
                                                                        {values.length > 0
                                                                            ? values.join(', ')
                                                                            : t('assignments:googleForms.notAnswered')}
                                                                    </p>
                                                                </li>
                                                            );
                                                        })}
                                                    </ol>
                                                ) : (
                                                    <p className="gfr-answer__value is-empty">
                                                        {t('assignments:googleForms.notAnswered')}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </div>

                <footer className="gfr-foot">
                    <p>
                        <HiOutlineInformationCircle aria-hidden="true" />
                        {t('assignments:googleForms.syncHint')}
                    </p>
                    <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
                        {t('assignments:common.close')}
                    </button>
                </footer>
            </section>
        </>
    );
};

export default GoogleFormResultsPanel;
