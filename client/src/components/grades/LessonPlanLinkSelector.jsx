import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineChevronDown } from 'react-icons/hi';
import { useLessonPlanSearch } from './lessonPlanSearch';
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
    const [search, setSearch] = useState('');
    const [open, setOpen] = useState(false);
    const bodyId = useId();
    const rootRef = useRef(null);
    const toggleRef = useRef(null);

    const selectedIds = useMemo(() => {
        const ids = Array.isArray(selectedLessonPlanIds) ? selectedLessonPlanIds : [];
        return ids
            .map((id) => normalizeLessonId(id?._id || id))
            .filter(Boolean);
    }, [selectedLessonPlanIds]);

    const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const canFetch = Boolean(classId && subjectId);
    // Fetch lessons only while the picker is expanded: it is optional chrome
    // sitting above the grade table.
    const {
        lessons,
        loading,
        error,
        debouncedSearch
    } = useLessonPlanSearch({ classId, subjectId, active: open, search, t });

    // The picker floats over the roster on the grade-entry page, so a click
    // elsewhere must dismiss it instead of leaving it pinned above the table.
    useEffect(() => {
        if (!open) return undefined;
        const handlePointerDown = (event) => {
            if (!rootRef.current?.contains(event.target)) setOpen(false);
        };
        const handleKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            setOpen(false);
            toggleRef.current?.focus();
        };
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open]);

    const handleToggleLesson = useCallback((lessonId, checked) => {
        if (disabled) return;
        const normalizedId = normalizeLessonId(lessonId);
        if (!normalizedId) return;

        if (checked) {
            if (selectedIdSet.has(normalizedId)) return;
            onChange([...selectedIds, normalizedId]);
            return;
        }
        onChange(selectedIds.filter((currentId) => currentId !== normalizedId));
    }, [disabled, onChange, selectedIdSet, selectedIds]);

    const handleClearSelection = () => {
        if (disabled) return;
        onChange([]);
    };

    const disabledSelector = disabled || !classId || !subjectId;

    return (
        <div ref={rootRef} className={`lesson-plan-link-selector${open ? ' is-open' : ''}`}>
            <div className="lesson-plan-link-selector__header">
                <button
                    ref={toggleRef}
                    type="button"
                    className="lesson-plan-link-selector__toggle"
                    aria-expanded={open}
                    aria-controls={bodyId}
                    onClick={() => setOpen((value) => !value)}
                >
                    <span className="lesson-plan-link-selector__heading">
                        <span className="lesson-plan-link-selector__label">
                            {t('grades:lessonLinks.title', { defaultValue: 'Linked lesson plans (optional)' })}
                        </span>
                        {(selectedIds.length > 0 || open) && (
                            <span className="lesson-plan-link-selector__count">
                                {t('grades:lessonLinks.selectedCount', { defaultValue: '{{count}} selected', count: selectedIds.length })}
                            </span>
                        )}
                    </span>
                    <HiOutlineChevronDown className="lesson-plan-link-selector__chevron" aria-hidden="true" />
                </button>
                {selectedIds.length > 0 && (
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleClearSelection}
                        disabled={disabledSelector}
                    >
                        {t('grades:lessonLinks.clear', { defaultValue: 'Clear selection' })}
                    </button>
                )}
            </div>

            {open && (
                <div id={bodyId} className="lesson-plan-link-selector__body">
                    {!disabledSelector && (
                        <div className="lesson-plan-link-selector__search">
                            <input
                                type="text"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder={t('grades:lessonLinks.searchPlaceholder', { defaultValue: 'Search by title...' })}
                                disabled={disabledSelector}
                            />
                        </div>
                    )}

                    {disabledSelector && (
                        <p className="lesson-plan-link-selector__helper">
                            {t('grades:lessonLinks.selectClassSubjectFirst', {
                                defaultValue: 'Select class and subject first to load lesson plans.'
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

                    {!disabledSelector && !loading && !error && lessons.length === 0 && canFetch && (
                        <p className="lesson-plan-link-selector__helper">
                            {debouncedSearch
                                ? t('grades:lessonLinks.noSearchResults', { defaultValue: 'No lesson plans match your search.' })
                                : t('grades:lessonLinks.noLessons', { defaultValue: 'No lesson plans found for this filter.' })}
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
                                                {standards.length > 0 ? ` · ${standards.join(', ')}` : ''}
                                            </span>
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default LessonPlanLinkSelector;
