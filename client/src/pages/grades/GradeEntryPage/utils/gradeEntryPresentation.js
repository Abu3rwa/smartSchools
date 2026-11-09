export const buildInitialGrades = (students = []) => {
    const initialGrades = {};
    students.forEach((student) => {
        initialGrades[student._id] = { marks: '', remarks: '' };
    });
    return initialGrades;
};

const filterByAcademicYear = (classList, academicYear) => {
    if (!academicYear) return classList;
    const sameYearClasses = classList.filter(
        (item) => !item.academicYear || item.academicYear === academicYear
    );
    return sameYearClasses.length > 0 ? sameYearClasses : classList;
};

export const getAvailableClasses = ({ isTeacher, myClasses = [], classes = [], academicYear = '' }) => {
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
        // Teacher assignments carry over at year rollover, so the same class name can
        // point at last year's document. Keep only the active year.
        return filterByAcademicYear(Array.from(classMap.values()), academicYear);
    }

    return filterByAcademicYear(classes, academicYear);
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
