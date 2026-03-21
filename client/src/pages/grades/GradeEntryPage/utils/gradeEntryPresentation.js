export const buildInitialGrades = (students = []) => {
    const initialGrades = {};
    students.forEach((student) => {
        initialGrades[student._id] = { marks: '', remarks: '' };
    });
    return initialGrades;
};

export const getAvailableClasses = ({ isTeacher, myClasses = [], classes = [] }) => {
    if (isTeacher && myClasses.length > 0) {
        const classMap = new Map();
        myClasses.forEach((item) => {
            if (item.class?._id) {
                classMap.set(item.class._id.toString(), item.class);
            } else if (item.class && typeof item.class === 'string') {
                // Handle case where it might just be an ID (though unlikely with current population)
                const fullClass = classes.find(c => c._id === item.class);
                if (fullClass) classMap.set(fullClass._id.toString(), fullClass);
            }
        });
        return Array.from(classMap.values());
    }

    return classes;
};

export const getAvailableSubjects = ({ selectedClass, classes = [], subjects = [], isTeacher, myClasses = [] }) => {
    if (!selectedClass) {
        return subjects;
    }

    if (isTeacher && myClasses.length > 0) {
        return myClasses
            .filter((item) => {
                const classId = item.class?._id || item.class;
                return classId?.toString() === selectedClass.toString();
            })
            .map((item) => item.subject)
            .filter(Boolean);
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
