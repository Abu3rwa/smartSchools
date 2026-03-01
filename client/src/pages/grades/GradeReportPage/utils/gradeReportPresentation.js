import {
    FALLBACK_GRADE_CLASS,
    FALLBACK_GRADE_LETTER,
    GRADE_BANDS
} from '../constants';

const parsePercentage = (value) => Number.parseFloat(value || 0);

export const getGradeClass = (percentage) => {
    const parsed = parsePercentage(percentage);
    const match = GRADE_BANDS.find((band) => parsed >= band.min);
    return match?.className || FALLBACK_GRADE_CLASS;
};

export const getLetterGrade = (percentage) => {
    const parsed = parsePercentage(percentage);
    const match = GRADE_BANDS.find((band) => parsed >= band.min);
    return match?.label || FALLBACK_GRADE_LETTER;
};

export const getMonthShortName = (month) => {
    return new Date(2000, Number.parseInt(month, 10) - 1, 1).toLocaleString('default', { month: 'short' });
};
