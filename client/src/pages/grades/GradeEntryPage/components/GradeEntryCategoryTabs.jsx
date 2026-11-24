import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CUSTOM_CATEGORY_MAX_LENGTH, GRADE_CATEGORY_OPTIONS } from '../constants';

const CUSTOM_CATEGORY = 'Custom';

const GradeEntryCategoryTabs = ({
    value,
    customCategory,
    onCategoryChange,
    onCustomCategoryChange,
    validationAttempt = 0,
    disabled = false
}) => {
    const { t } = useTranslation(['grades']);
    const tabRefs = useRef([]);
    const customInputRef = useRef(null);
    const focusCustomRef = useRef(false);
    const [blurred, setBlurred] = useState(false);
    const customError = value === CUSTOM_CATEGORY && !customCategory.trim() && (validationAttempt > 0 || blurred);
    // Edit mode can carry a saved custom category such as "Participation";
    // keep it as an extra tab instead of showing no selection.
    const options = value && value !== CUSTOM_CATEGORY && !GRADE_CATEGORY_OPTIONS.includes(value)
        ? [value, ...GRADE_CATEGORY_OPTIONS, CUSTOM_CATEGORY]
        : [...GRADE_CATEGORY_OPTIONS, CUSTOM_CATEGORY];

    const focusTab = (index) => {
        const next = options[index];
        if (!next) return;
        onCategoryChange(next);
        tabRefs.current[index]?.focus();
    };

    const handleKeyDown = (event, index) => {
        if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            focusTab(event.key === 'Home' ? 0 : options.length - 1);
            return;
        }
        const rtl = document.documentElement.getAttribute('dir') === 'rtl';
        const step = event.key === 'ArrowRight'
            ? (rtl ? -1 : 1)
            : event.key === 'ArrowLeft'
                ? (rtl ? 1 : -1)
                : 0;
        if (!step) return;
        event.preventDefault();
        focusTab((index + step + options.length) % options.length);
    };

    return (
        <div className="grade-entry-head-tabs">
            <div
                className="grade-category-tabs"
                role="radiogroup"
                aria-label={t('grades:entry.form.categoryGroup')}
            >
                {options.map((category, index) => {
                    const active = value === category;
                    return (
                        <button
                            key={category}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            tabIndex={active ? 0 : -1}
                            className={active ? 'is-active' : ''}
                            disabled={disabled}
                            ref={(node) => {
                                tabRefs.current[index] = node;
                            }}
                            onClick={() => {
                                focusCustomRef.current = category === CUSTOM_CATEGORY;
                                onCategoryChange(category);
                                if (category === CUSTOM_CATEGORY && value === CUSTOM_CATEGORY) {
                                    customInputRef.current?.focus();
                                }
                            }}
                            onKeyDown={(event) => handleKeyDown(event, index)}
                        >
                            {t(`grades:categories.${category}`, { defaultValue: category })}
                        </button>
                    );
                })}
            </div>
            {value === CUSTOM_CATEGORY && (
                <>
                    <input
                        ref={(node) => {
                            customInputRef.current = node;
                            if (node && focusCustomRef.current) {
                                node.focus();
                                focusCustomRef.current = false;
                            }
                        }}
                        type="text"
                        className="grade-category-custom"
                        aria-label={t('grades:entry.form.customCategoryPlaceholder')}
                        placeholder={t('grades:entry.form.customCategoryPlaceholder')}
                        value={customCategory}
                        onChange={(event) => onCustomCategoryChange(event.target.value)}
                        onBlur={() => setBlurred(true)}
                        maxLength={CUSTOM_CATEGORY_MAX_LENGTH}
                        required
                        aria-invalid={customError}
                        aria-describedby={customError ? 'grade-category-custom-error' : undefined}
                        disabled={disabled}
                    />
                    {customError && (
                        <span id="grade-category-custom-error" className="setup-field-error">
                            {t('grades:entry.validation.customCategoryRequired')}
                        </span>
                    )}
                </>
            )}
        </div>
    );
};

export default GradeEntryCategoryTabs;
