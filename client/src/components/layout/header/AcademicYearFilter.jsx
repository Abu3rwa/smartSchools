import { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { HiOutlineCalendar, HiOutlineLockClosed } from 'react-icons/hi';
import {
    selectCurrentAcademicYear,
    selectAvailableYears,
    selectAvailableYearsLoading,
    selectSchoolCurrentYear,
    selectSelectedSemester,
    setCurrentAcademicYear,
    setSelectedSemester,
    fetchAvailableYears,
} from '../../../store/slices/uiSlice';
import './AcademicYearFilter.css';

const AcademicYearFilter = () => {
    const dispatch = useDispatch();
    const { t } = useTranslation('common');
    const selectedYear = useSelector(selectCurrentAcademicYear);
    const availableYears = useSelector(selectAvailableYears);
    const loading = useSelector(selectAvailableYearsLoading);
    const schoolCurrentYear = useSelector(selectSchoolCurrentYear);
    const selectedSemester = useSelector(selectSelectedSemester);

    const [yearOpen, setYearOpen] = useState(false);
    const [semesterOpen, setSemesterOpen] = useState(false);
    const yearRef = useRef(null);
    const semesterRef = useRef(null);

    const isCurrentYear = !schoolCurrentYear || selectedYear === schoolCurrentYear;
    const hasMultipleYears = availableYears.length > 1;

    useEffect(() => {
        dispatch(fetchAvailableYears());
    }, [dispatch]);

    // Close dropdowns on outside click
    useEffect(() => {
        const handleClick = (e) => {
            if (yearRef.current && !yearRef.current.contains(e.target)) setYearOpen(false);
            if (semesterRef.current && !semesterRef.current.contains(e.target)) setSemesterOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const handleYearSelect = (year) => {
        dispatch(setCurrentAcademicYear(year));
        setYearOpen(false);
    };

    const handleSemesterSelect = (value) => {
        dispatch(setSelectedSemester(value));
        setSemesterOpen(false);
    };

    const semesterLabel = selectedSemester === 1
        ? (t('semester1', 'Semester 1'))
        : selectedSemester === 2
            ? (t('semester2', 'Semester 2'))
            : (t('fullYear', 'Full Year'));

    return (
        <div className="ay-filter">
            {/* Year selector */}
            <div className="ay-filter__group" ref={yearRef}>
                <button
                    className={`ay-filter__btn${!isCurrentYear ? ' ay-filter__btn--past' : ''}`}
                    onClick={() => hasMultipleYears && setYearOpen(!yearOpen)}
                    disabled={!hasMultipleYears || loading}
                    aria-expanded={yearOpen}
                    aria-haspopup="listbox"
                >
                    <HiOutlineCalendar size={14} />
                    <span>{selectedYear}</span>
                    {!isCurrentYear && <HiOutlineLockClosed size={12} className="ay-filter__lock" />}
                    {hasMultipleYears && <span className="ay-filter__chevron">▾</span>}
                </button>
                {yearOpen && (
                    <ul className="ay-filter__dropdown" role="listbox">
                        {availableYears.map((year) => (
                            <li
                                key={year}
                                role="option"
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
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <span className="ay-filter__separator" />

            {/* Semester selector */}
            <div className="ay-filter__group" ref={semesterRef}>
                <button
                    className="ay-filter__btn"
                    onClick={() => setSemesterOpen(!semesterOpen)}
                    aria-expanded={semesterOpen}
                    aria-haspopup="listbox"
                >
                    <span>{semesterLabel}</span>
                    <span className="ay-filter__chevron">▾</span>
                </button>
                {semesterOpen && (
                    <ul className="ay-filter__dropdown" role="listbox">
                        <li
                            role="option"
                            aria-selected={selectedSemester === null}
                            className={`ay-filter__option${selectedSemester === null ? ' ay-filter__option--active' : ''}`}
                            onClick={() => handleSemesterSelect(null)}
                        >
                            {t('fullYear', 'Full Year')}
                        </li>
                        <li
                            role="option"
                            aria-selected={selectedSemester === 1}
                            className={`ay-filter__option${selectedSemester === 1 ? ' ay-filter__option--active' : ''}`}
                            onClick={() => handleSemesterSelect(1)}
                        >
                            {t('semester1', 'Semester 1')}
                        </li>
                        <li
                            role="option"
                            aria-selected={selectedSemester === 2}
                            className={`ay-filter__option${selectedSemester === 2 ? ' ay-filter__option--active' : ''}`}
                            onClick={() => handleSemesterSelect(2)}
                        >
                            {t('semester2', 'Semester 2')}
                        </li>
                    </ul>
                )}
            </div>
        </div>
    );
};

export default AcademicYearFilter;
