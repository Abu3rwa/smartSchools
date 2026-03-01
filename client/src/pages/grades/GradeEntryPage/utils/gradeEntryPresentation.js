export const buildInitialGrades = (students = []) => {
    const initialGrades = {};
    students.forEach((student) => {
        initialGrades[student._id] = { marks: '', remarks: '' };
    });
    return initialGrades;
};

export const getAvailableClasses = ({ isTeacher, myClasses = [], classes = [] }) => {
    if (isTeacher && myClasses.length > 0) {
        return myClasses.map((item) => item.class).filter(Boolean);
    }

    return classes;
};

export const getAvailableSubjects = ({ selectedClass, classes = [], subjects = [] }) => {
    if (!selectedClass) {
        return subjects;
    }

    const selectedClassData = classes.find((item) => item._id === selectedClass);
    if (selectedClassData?.subjects) {
        return selectedClassData.subjects.map((item) => item.subject).filter(Boolean);
    }

    return subjects;
};

export const countEnteredGrades = (grades = {}) => {
    return Object.values(grades).filter((item) => item.marks !== '' && item.marks !== null).length;
};

export const mapGradesForSubmission = (grades = {}) => {
    return Object.entries(grades)
        .filter(([, data]) => data.marks !== '' && data.marks !== null)
        .map(([studentId, data]) => ({
            student: studentId,
            marks: Number.parseFloat(data.marks),
            remarks: data.remarks
        }));
};
