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

    // Edit mode state
    const [editMode, setEditMode] = useState(false);
    const [editAssessmentGroupId, setEditAssessmentGroupId] = useState(null);
    const [editGradeMap, setEditGradeMap] = useState({});

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

    const enterEditMode = useCallback(({ gradesData, metadata }) => {
        const gradeMap = {};
        const studentGradeIdMap = {};
        for (const grade of gradesData) {
            const studentId = grade.student?._id || grade.student;
            gradeMap[studentId] = {
                marks: grade.marks ?? '',
                remarks: grade.remarks ?? ''
            };
            studentGradeIdMap[studentId] = grade._id;
        }
        setGrades(gradeMap);
        setEditGradeMap(studentGradeIdMap);
        setEditMode(true);
        setEditAssessmentGroupId(metadata.assessmentGroupId);
        setSelectedClass(String(metadata.classId || ''));
        setSelectedSubject(String(metadata.subject || ''));
        setMaxMarks(metadata.maxMarks || DEFAULT_MAX_MARKS);
        if (metadata.date) {
            try {
                setSelectedDate(format(new Date(metadata.date), 'yyyy-MM-dd'));
            } catch { /* keep current */ }
        }
        const cat = (metadata.category || '').charAt(0).toUpperCase() + (metadata.category || '').slice(1);
        setSelectedCategory(cat || DEFAULT_CATEGORY);
    }, []);

    const exitEditMode = useCallback(() => {
        setEditMode(false);
        setEditAssessmentGroupId(null);
        setEditGradeMap({});
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
        resetGradesForStudents,
        editMode,
        editAssessmentGroupId,
        editGradeMap,
        enterEditMode,
        exitEditMode
    };
};

export default useGradeEntryPageState;
