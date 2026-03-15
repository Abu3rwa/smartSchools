import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../config/api';
import './LessonPlanLinkSelector.css';

const getLessonDateLabel = (value) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString();
};

const normalizeLessonId = (lessonId) => String(lessonId || '').trim();

const LessonPlanLinkSelector = ({
    classId,
    subjectId,
    selectedLessonPlanIds = [],
    onChange,
    disabled = false
}) => {
    const { t } = useTranslation(['grades', 'gradebook', 'studentGrades']);
    const [mode, setMode] = useState('direct');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [lessons, setLessons] = useState([]);

    const selectedIds = useMemo(() => {
        const ids = Array.isArray(selectedLessonPlanIds) ? selectedLessonPlanIds : [];
        return ids
            .map((id) => normalizeLessonId(id?._id || id))
            .filter(Boolean);
    }, [selectedLessonPlanIds]);

    const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const canFetchDirect = Boolean(classId && subjectId && mode === 'direct');
    const canFetchDateRange = Boolean(classId && subjectId && mode === 'dateRange' && startDate && endDate);

    useEffect(() => {
        let mounted = true;

        const shouldFetch = canFetchDirect || canFetchDateRange;
        if (!shouldFetch) {
            setLessons([]);
            setError('');
            return () => {
                mounted = false;
            };
        }

        const fetchLessons = async () => {
            setLoading(true);
            setError('');

            try {
                const params = {
                    class: classId,
                    subject: subjectId,
                    page: 1,
                    limit: 100
                };

                if (mode === 'dateRange') {
                    params.startDate = startDate;
                    params.endDate = endDate;
                }

                const response = await api.get('/lessons', { params });
                if (!mounted) return;
                const fetchedLessons = response.data?.data?.lessons || [];
                setLessons(fetchedLessons);
            } catch (fetchError) {
                if (!mounted) return;
                setLessons([]);
                setError(fetchError.response?.data?.message || t('grades:lessonLinks.loadError', { defaultValue: 'Failed to load lesson plans.' }));
            } finally {
                if (mounted) setLoading(false);
            }
        };

        fetchLessons();
        return () => {
            mounted = false;
        };
    }, [canFetchDateRange, canFetchDirect, classId, endDate, mode, startDate, subjectId, t]);

    const handleToggleLesson = (lessonId, checked) => {
        if (disabled) return;
        const normalizedId = normalizeLessonId(lessonId);
        if (!normalizedId) return;

        if (checked) {
            if (selectedIdSet.has(normalizedId)) return;
            onChange([...selectedIds, normalizedId]);
            return;
        }

        onChange(selectedIds.filter((currentId) => currentId !== normalizedId));
    };

    const handleClearSelection = () => {
        if (disabled) return;
        onChange([]);
    };

    const disabledSelector = disabled || !classId || !subjectId;

    return (
        <div className="lesson-plan-link-selector">
            <div className="lesson-plan-link-selector__header">
                <div>
                    <h4>{t('grades:lessonLinks.title', { defaultValue: 'Linked lesson plans (optional)' })}</h4>
                    <p>{t('grades:lessonLinks.selectedCount', { defaultValue: '{{count}} selected', count: selectedIds.length })}</p>
                </div>
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleClearSelection}
                    disabled={disabledSelector || selectedIds.length === 0}
                >
                    {t('grades:lessonLinks.clear', { defaultValue: 'Clear selection' })}
                </button>
            </div>

            <div className="lesson-plan-link-selector__controls">
                <label className="form-group">
                    <span>{t('grades:lessonLinks.modeLabel', { defaultValue: 'Selection mode' })}</span>
                    <select
                        value={mode}
                        onChange={(event) => setMode(event.target.value)}
                        disabled={disabledSelector}
                    >
                        <option value="direct">{t('grades:lessonLinks.mode.direct', { defaultValue: 'Direct list' })}</option>
                        <option value="dateRange">{t('grades:lessonLinks.mode.dateRange', { defaultValue: 'Filter by date range' })}</option>
                    </select>
                </label>

                {mode === 'dateRange' && (
                    <>
                        <label className="form-group">
                            <span>{t('grades:lessonLinks.startDate', { defaultValue: 'Start date' })}</span>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(event) => setStartDate(event.target.value)}
                                disabled={disabledSelector}
                            />
                        </label>
                        <label className="form-group">
                            <span>{t('grades:lessonLinks.endDate', { defaultValue: 'End date' })}</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(event) => setEndDate(event.target.value)}
                                disabled={disabledSelector}
                            />
                        </label>
                    </>
                )}
            </div>

            {disabledSelector && (
                <p className="lesson-plan-link-selector__helper">
                    {t('grades:lessonLinks.selectClassSubjectFirst', {
                        defaultValue: 'Select class and subject first to load lesson plans.'
                    })}
                </p>
            )}

            {!disabledSelector && mode === 'dateRange' && (!startDate || !endDate) && (
                <p className="lesson-plan-link-selector__helper">
                    {t('grades:lessonLinks.chooseDateRange', {
                        defaultValue: 'Choose a start and end date to filter lesson plans.'
                    })}
                </p>
            )}

            {!disabledSelector && loading && (
                <p className="lesson-plan-link-selector__helper">
                    {t('grades:lessonLinks.loading', { defaultValue: 'Loading lesson plans...' })}
                </p>
            )}

            {!disabledSelector && error && (
                <p className="lesson-plan-link-selector__error">{error}</p>
            )}

            {!disabledSelector && !loading && !error && lessons.length === 0 && (canFetchDirect || canFetchDateRange) && (
                <p className="lesson-plan-link-selector__helper">
                    {t('grades:lessonLinks.noLessons', { defaultValue: 'No lesson plans found for this filter.' })}
                </p>
            )}

            {!disabledSelector && lessons.length > 0 && (
                <div className="lesson-plan-link-selector__list">
                    {lessons.map((lesson) => {
                        const lessonId = normalizeLessonId(lesson?._id);
                        if (!lessonId) return null;
                        const standards = Array.isArray(lesson.standardIds)
                            ? lesson.standardIds.map((standard) => standard?.code).filter(Boolean)
                            : [];
                        const lessonDate = getLessonDateLabel(lesson.date);
                        const lessonLabel = lesson.title || lesson.topic || t('grades:lessonLinks.untitledLesson', { defaultValue: 'Untitled lesson' });

                        return (
                            <label key={lessonId} className="lesson-plan-link-selector__item">
                                <input
                                    type="checkbox"
                                    checked={selectedIdSet.has(lessonId)}
                                    onChange={(event) => handleToggleLesson(lessonId, event.target.checked)}
                                    disabled={disabledSelector}
                                />
                                <span className="lesson-plan-link-selector__content">
                                    <span className="lesson-plan-link-selector__title">{lessonLabel}</span>
                                    <span className="lesson-plan-link-selector__meta">
                                        {lessonDate || t('grades:common.notSet', { defaultValue: 'Date not set' })}
                                        {standards.length > 0 ? ` - ${standards.join(', ')}` : ''}
                                    </span>
                                </span>
                            </label>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default LessonPlanLinkSelector;
