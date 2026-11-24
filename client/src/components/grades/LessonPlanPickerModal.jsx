import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineX } from 'react-icons/hi';
import { useLessonPlanSearch } from './lessonPlanSearch';
import './LessonPlanPickerModal.css';

const normalizeLessonId = (lessonId) => String(lessonId || '').trim();

const getLessonDateLabel = (value) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString();
};

const LessonPlanPickerModal = ({
    classId,
    subjectId,
    selectedLessonPlanIds = [],
    onChange,
    onClose
}) => {
    const { t } = useTranslation(['grades']);
    const titleId = useId();
    const [search, setSearch] = useState('');
    const dialogRef = useRef(null);
    const searchRef = useRef(null);
    const { lessons, loading, error } = useLessonPlanSearch({
        classId, subjectId, active: true, search, t
    });

    const selectedIds = useMemo(
        () => (Array.isArray(selectedLessonPlanIds) ? selectedLessonPlanIds : [])
            .map((id) => normalizeLessonId(id?._id || id))
            .filter(Boolean),
        [selectedLessonPlanIds]
    );
    const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

    useEffect(() => {
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        searchRef.current?.focus();

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab' || !dialogRef.current) return;
            const focusable = dialogRef.current.querySelectorAll(
                'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
            if (previousFocus instanceof HTMLElement) previousFocus.focus();
        };
    }, [onClose]);

    const toggleLesson = (lessonId, checked) => {
        if (checked) {
            if (selectedIdSet.has(lessonId)) return;
            onChange([...selectedIds, lessonId]);
            return;
        }
        onChange(selectedIds.filter((id) => id !== lessonId));
    };

    return (
        <div className="modal-overlay lesson-picker-overlay" onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
        }}>
            <div
                ref={dialogRef}
                className="modal lesson-plan-picker"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
            >
                <div className="lesson-plan-picker__head">
                    <h2 id={titleId}>{t('grades:lessonLinks.title')}</h2>
                    <button type="button" className="lesson-plan-picker__close" onClick={onClose}
                        aria-label={t('grades:lessonLinks.close')}>
                        <HiOutlineX aria-hidden="true" />
                    </button>
                </div>

                <div className="lesson-plan-picker__search">
                    <input
                        ref={searchRef}
                        type="text"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={t('grades:lessonLinks.searchPlaceholder')}
                    />
                </div>

                <div className="lesson-plan-picker__body">
                    {loading && <p className="lesson-plan-link-selector__helper">{t('grades:lessonLinks.loading')}</p>}
                    {!loading && error && <p className="lesson-plan-link-selector__error" role="alert">{error}</p>}
                    {!loading && !error && lessons.length === 0 && (
                        <p className="lesson-plan-link-selector__helper">
                            {search.trim() ? t('grades:lessonLinks.noSearchResults') : t('grades:lessonLinks.noLessons')}
                        </p>
                    )}
                    {!loading && !error && lessons.length > 0 && (
                        <div className="lesson-plan-link-selector__list">
                            {lessons.map((lesson) => {
                                const lessonId = normalizeLessonId(lesson?._id);
                                if (!lessonId) return null;
                                const standards = Array.isArray(lesson.standardIds)
                                    ? lesson.standardIds.map((standard) => standard?.code).filter(Boolean)
                                    : [];
                                return (
                                    <label key={lessonId} className="lesson-plan-link-selector__item">
                                        <input
                                            type="checkbox"
                                            checked={selectedIdSet.has(lessonId)}
                                            onChange={(event) => toggleLesson(lessonId, event.target.checked)}
                                        />
                                        <span className="lesson-plan-link-selector__content">
                                            <span className="lesson-plan-link-selector__title">
                                                {lesson.title || lesson.topic || t('grades:lessonLinks.untitledLesson')}
                                            </span>
                                            <span className="lesson-plan-link-selector__meta">
                                                {getLessonDateLabel(lesson.date) || t('grades:common.notSet', { defaultValue: 'Date not set' })}
                                                {standards.length > 0 ? ` · ${standards.join(', ')}` : ''}
                                            </span>
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="lesson-plan-picker__foot">
                    <span className="lesson-plan-picker__count">
                        {t('grades:lessonLinks.selectedCount', { count: selectedIds.length })}
                    </span>
                    <div className="lesson-plan-picker__actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange([])}
                            disabled={selectedIds.length === 0}>
                            {t('grades:lessonLinks.clear')}
                        </button>
                        <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
                            {t('grades:lessonLinks.done')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LessonPlanPickerModal;
