import { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '@mui/material';
import toast from 'react-hot-toast';
import { HiOutlineCalendar, HiOutlineLockClosed, HiOutlineChevronDown } from 'react-icons/hi';
import {
    selectCurrentAcademicYear,
    selectAvailableYears,
    selectAvailableYearsLoading,
    selectSchoolCurrentYear,
    selectSelectedSemester,
    setCurrentAcademicYear,
    setSelectedSemester,
    fetchAvailableYears,
    updateSchoolAcademicYear,
} from '../../../store/slices/uiSlice';
import { selectUser } from '../../../store/slices/authSlice';
import './AcademicYearFilter.css';

const focusOption = (listEl, index) => {
    const options = Array.from(listEl.querySelectorAll('.ay-filter__option'));
    if (options.length === 0) return;
    const clamped = Math.max(0, Math.min(index, options.length - 1));
    options[clamped].focus();
};

const AcademicYearFilter = () => {
    const dispatch = useDispatch();
    const { t } = useTranslation('common');
    const selectedYear = useSelector(selectCurrentAcademicYear);
    const availableYears = useSelector(selectAvailableYears);
    const loading = useSelector(selectAvailableYearsLoading);
    const schoolCurrentYear = useSelector(selectSchoolCurrentYear);
    const selectedSemester = useSelector(selectSelectedSemester);
    const user = useSelector(selectUser);
    // Below the header's mobile breakpoint the two full-width buttons no longer
    // fit next to the menu and avatar, so they fold into one popover.
    const compact = useMediaQuery('(max-width: 899px)');

    const [yearOpen, setYearOpen] = useState(false);
    const [semesterOpen, setSemesterOpen] = useState(false);
    const [compactOpen, setCompactOpen] = useState(false);
    const [activatingYear, setActivatingYear] = useState('');
    const yearRef = useRef(null);
    const semesterRef = useRef(null);
    const compactRef = useRef(null);
    const yearListRef = useRef(null);
    const semesterListRef = useRef(null);
    const compactListRef = useRef(null);

    const isCurrentYear = !schoolCurrentYear || selectedYear === schoolCurrentYear;
    const hasMultipleYears = availableYears.length > 1;
    const canActivateYearFromTopbar = user?.role === 'admin';

    useEffect(() => {
        dispatch(fetchAvailableYears());
    }, [dispatch]);

    // Close dropdowns on outside click
    useEffect(() => {
        const handleClick = (e) => {
            if (yearRef.current && !yearRef.current.contains(e.target)) setYearOpen(false);
            if (semesterRef.current && !semesterRef.current.contains(e.target)) setSemesterOpen(false);
            if (compactRef.current && !compactRef.current.contains(e.target)) setCompactOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    useEffect(() => {
        if (yearOpen && yearListRef.current) focusOption(yearListRef.current, availableYears.indexOf(selectedYear));
    }, [yearOpen, availableYears, selectedYear]);

    useEffect(() => {
        if (semesterOpen && semesterListRef.current) {
            const values = [null, 1, 2];
            focusOption(semesterListRef.current, values.indexOf(selectedSemester));
        }
    }, [semesterOpen, selectedSemester]);

    useEffect(() => {
        if (compactOpen && compactListRef.current) focusOption(compactListRef.current, availableYears.indexOf(selectedYear));
    }, [compactOpen, availableYears, selectedYear]);

    const handleListKeyDown = (event, close, refocusTrigger) => {
        if (event.key === 'Escape') {
            close();
            refocusTrigger?.();
            return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const options = Array.from(event.currentTarget.querySelectorAll('.ay-filter__option'));
        focusOption(event.currentTarget, options.indexOf(document.activeElement) + (event.key === 'ArrowDown' ? 1 : -1));
    };

    const handleYearSelect = (year) => {
        dispatch(setCurrentAcademicYear(year));
        setYearOpen(false);
        setCompactOpen(false);
    };

    const handleActivateYear = async (year) => {
        if (!year || activatingYear) return;
        setActivatingYear(year);

        try {
            const result = await dispatch(updateSchoolAcademicYear(year));
            if (updateSchoolAcademicYear.fulfilled.match(result)) {
                dispatch(setCurrentAcademicYear(year));
                dispatch(fetchAvailableYears());
                toast.success(t('academicYearActivated', { defaultValue: `Academic year set to ${year}` }));
            } else {
                toast.error(result.payload || t('updateAcademicYearFailed', { defaultValue: 'Failed to update academic year' }));
            }
        } finally {
            setActivatingYear('');
        }
    };

    const handleSemesterSelect = (value) => {
        dispatch(setSelectedSemester(value));
        setSemesterOpen(false);
        setCompactOpen(false);
    };

    const semesterOptions = [
        { value: null, label: t('fullYear', 'Full Year') },
        { value: 1, label: t('semester1', 'Semester 1') },
        { value: 2, label: t('semester2', 'Semester 2') },
    ];

    const semesterLabel = selectedSemester === 1
        ? t('semester1', 'Semester 1')
        : selectedSemester === 2
            ? t('semester2', 'Semester 2')
            : t('fullYear', 'Full Year');

    const yearOptionList = availableYears.map((year) => (
        <li key={year} role="none" className="ay-filter__option-row">
            <button
                type="button"
                role="menuitem"
                aria-selected={year === selectedYear}
                className={`ay-filter__option${year === selectedYear ? ' ay-filter__option--active' : ''}`}
                onClick={() => handleYearSelect(year)}
            >
                <span>{year}</span>
                {year === schoolCurrentYear && (
                    <span className="ay-filter__current-badge">
                        {t('current', 'Current')}
                    </span>
                )}
                {year !== schoolCurrentYear && (
                    <HiOutlineLockClosed size={12} className="ay-filter__lock" />
                )}
            </button>
            {canActivateYearFromTopbar && year !== schoolCurrentYear && (
                <button
                    type="button"
                    className="ay-filter__action-btn"
                    onClick={() => handleActivateYear(year)}
                    disabled={Boolean(activatingYear)}
                >
                    {activatingYear === year
                        ? t('saving', 'Saving...')
                        : t('activate', 'Activate')}
                </button>
            )}
        </li>
    ));

    if (compact) {
        return (
            <div className="ay-filter ay-filter--compact" ref={compactRef}>
                <button
                    type="button"
                    className={`ay-filter__btn ay-filter__btn--compact${!isCurrentYear ? ' ay-filter__btn--past' : ''}`}
                    onClick={() => setCompactOpen(!compactOpen)}
                    aria-expanded={compactOpen}
                    aria-haspopup="menu"
                    aria-controls={compactOpen ? 'ay-filter-compact-list' : undefined}
                    aria-label={`${selectedYear}, ${semesterLabel}`}
                >
                    <HiOutlineCalendar size={15} />
                    <span className="ay-filter__compact-labels">
                        <span className="ay-filter__compact-year">{selectedYear}</span>
                        <span className="ay-filter__compact-semester">{semesterLabel}</span>
                    </span>
                    <HiOutlineChevronDown size={13} className="ay-filter__chevron" />
                </button>
                {compactOpen && (
                    <ul
                        id="ay-filter-compact-list"
                        className="ay-filter__dropdown ay-filter__dropdown--compact"
                        role="menu"
                        ref={compactListRef}
                        onKeyDown={(event) => handleListKeyDown(event, () => setCompactOpen(false), () => compactRef.current?.querySelector('.ay-filter__btn')?.focus())}
                    >
                        <li role="none" className="ay-filter__section-label">{t('academicYear', 'Academic year')}</li>
                        {yearOptionList}
                        <li role="none" className="ay-filter__divider" />
                        <li role="none" className="ay-filter__section-label">{t('semester', 'Semester')}</li>
                        {semesterOptions.map((option) => (
                            <li key={String(option.value)} role="none">
                                <button
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={selectedSemester === option.value}
                                    className={`ay-filter__option${selectedSemester === option.value ? ' ay-filter__option--active' : ''}`}
                                    onClick={() => handleSemesterSelect(option.value)}
                                >
                                    <span>{option.label}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        );
    }

    return (
        <div className="ay-filter">
            {/* Year selector */}
            <div className="ay-filter__group" ref={yearRef}>
                <button
                    className={`ay-filter__btn ay-filter__btn--year${!isCurrentYear ? ' ay-filter__btn--past' : ''}`}
                    onClick={() => hasMultipleYears && setYearOpen(!yearOpen)}
                    disabled={!hasMultipleYears || loading}
                    aria-expanded={yearOpen}
                    aria-haspopup="menu"
                    aria-controls={yearOpen ? 'ay-filter-year-list' : undefined}
                >
                    <HiOutlineCalendar size={14} />
                    <span>{selectedYear}</span>
                    {!isCurrentYear && <HiOutlineLockClosed size={12} className="ay-filter__lock" />}
                    {hasMultipleYears && <HiOutlineChevronDown size={13} className="ay-filter__chevron" />}
                </button>
                {yearOpen && (
                    <ul
                        id="ay-filter-year-list"
                        className="ay-filter__dropdown"
                        role="menu"
                        ref={yearListRef}
                        onKeyDown={(event) => handleListKeyDown(event, () => setYearOpen(false), () => yearRef.current?.querySelector('.ay-filter__btn')?.focus())}
                    >
                        {yearOptionList}
                    </ul>
                )}
            </div>

            <span className="ay-filter__separator" />

            {/* Semester selector */}
            <div className="ay-filter__group" ref={semesterRef}>
                <button
                    className="ay-filter__btn ay-filter__btn--semester"
                    onClick={() => setSemesterOpen(!semesterOpen)}
                    aria-expanded={semesterOpen}
                    aria-haspopup="menu"
                    aria-controls={semesterOpen ? 'ay-filter-semester-list' : undefined}
                >
                    <span>{semesterLabel}</span>
                    <HiOutlineChevronDown size={13} className="ay-filter__chevron" />
                </button>
                {semesterOpen && (
                    <ul
                        id="ay-filter-semester-list"
                        className="ay-filter__dropdown ay-filter__dropdown--semester"
                        role="menu"
                        ref={semesterListRef}
                        onKeyDown={(event) => handleListKeyDown(event, () => setSemesterOpen(false), () => semesterRef.current?.querySelector('.ay-filter__btn')?.focus())}
                    >
                        {semesterOptions.map((option) => (
                            <li key={String(option.value)} role="none">
                                <button
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={selectedSemester === option.value}
                                    className={`ay-filter__option${selectedSemester === option.value ? ' ay-filter__option--active' : ''}`}
                                    onClick={() => handleSemesterSelect(option.value)}
                                >
                                    <span>{option.label}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default AcademicYearFilter;
