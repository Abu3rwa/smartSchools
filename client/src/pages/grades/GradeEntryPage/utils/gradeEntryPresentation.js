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

export const normalizeCustomCategory = (value) =>
    String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

export const getGradeMarkState = (value, maxMarks) => {
    const rawValue = String(value ?? '').trim();
    if (!rawValue) return { status: 'empty' };

    const numericMark = Number(rawValue);
    const numericMaxMarks = Number(maxMarks);
    if (
        !Number.isFinite(numericMark)
        || !Number.isFinite(numericMaxMarks)
        || numericMaxMarks <= 0
        || numericMark < 0
        || numericMark > numericMaxMarks
    ) {
        return { status: 'invalid' };
    }

    return { status: 'valid', value: numericMark };
};

export const countEnteredGrades = (grades = {}, maxMarks) => {
    return Object.values(grades).filter(
        (item) => getGradeMarkState(item?.marks, maxMarks).status === 'valid'
    ).length;
};

export const countInvalidGrades = (grades = {}, maxMarks) => {
    return Object.values(grades).filter(
        (item) => getGradeMarkState(item?.marks, maxMarks).status === 'invalid'
    ).length;
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
