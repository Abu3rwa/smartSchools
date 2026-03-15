import { useCallback, useState } from 'react';
import { format } from 'date-fns';
import { DEFAULT_CATEGORY, DEFAULT_MAX_MARKS } from '../constants';
import { buildInitialGrades } from '../utils/gradeEntryPresentation';

const useGradeEntryPageState = ({ initialClassId = '' }) => {
    const [selectedClass, setSelectedClass] = useState(initialClassId);
    const [selectedSubject, setSelectedSubject] = useState('');
    const [selectedCategory, setSelectedCategory] = useState(DEFAULT_CATEGORY);
    const [customCategory, setCustomCategory] = useState('');
    const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [maxMarks, setMaxMarks] = useState(DEFAULT_MAX_MARKS);
    const [grades, setGrades] = useState({});
    const [sendNotifications, setSendNotifications] = useState(false);
    const [selectedLessonPlanIds, setSelectedLessonPlanIds] = useState([]);

    const handleGradeChange = useCallback((studentId, field, value) => {
        setGrades((prev) => ({
            ...prev,
            [studentId]: {
                ...prev[studentId],
                [field]: value
            }
        }));
    }, []);

    const resetGradesForStudents = useCallback((students) => {
        setGrades(buildInitialGrades(students));
    }, []);

    return {
        selectedClass,
        setSelectedClass,
        selectedSubject,
        setSelectedSubject,
        selectedCategory,
        setSelectedCategory,
        customCategory,
        setCustomCategory,
        selectedDate,
        setSelectedDate,
        maxMarks,
        setMaxMarks,
        grades,
        setGrades,
        sendNotifications,
        setSendNotifications,
        selectedLessonPlanIds,
        setSelectedLessonPlanIds,
        handleGradeChange,
        resetGradesForStudents
    };
};

export default useGradeEntryPageState;
