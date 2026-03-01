import { useMemo } from 'react';

const useTimetableAssignmentOptions = ({
    teachers,
    classes,
    subjects,
    assignments,
    newAssignment,
    filterTeacher,
    filterClass,
    editingAssignmentId
}) => {
    const filteredAssignments = useMemo(() => {
        return assignments.filter((assignment) => {
            const matchTeacher = filterTeacher
                ? (assignment.teacher?._id === filterTeacher || assignment.teacher === filterTeacher)
                : true;
            const matchClass = filterClass
                ? (assignment.class?._id === filterClass || assignment.class === filterClass)
                : true;
            return matchTeacher && matchClass;
        });
    }, [assignments, filterTeacher, filterClass]);

    const selectedTeacherId = useMemo(() => {
        if (!newAssignment.teacher) return null;
        const teacherDoc = teachers.find((teacher) => (teacher.user?._id || teacher.user) === newAssignment.teacher);
        return teacherDoc?._id || null;
    }, [teachers, newAssignment.teacher]);

    const availableClasses = useMemo(() => {
        if (!selectedTeacherId) return [];
        return classes.filter((classDoc) =>
            classDoc.subjects?.some((classSubject) => {
                const teacherId = typeof classSubject.teacher === 'string'
                    ? classSubject.teacher
                    : classSubject.teacher?._id;
                return teacherId === selectedTeacherId;
            })
        ).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [selectedTeacherId, classes]);

    const availableSubjects = useMemo(() => {
        if (!selectedTeacherId) return [];
        const uniqueSubjects = new Map();

        const classesToSearch = newAssignment.class
            ? classes.filter((classDoc) => classDoc._id === newAssignment.class)
            : availableClasses;

        for (const classDoc of classesToSearch) {
            for (const classSubject of (classDoc.subjects || [])) {
                const teacherId = typeof classSubject.teacher === 'string'
                    ? classSubject.teacher
                    : classSubject.teacher?._id;
                if (teacherId !== selectedTeacherId) continue;

                const subjectRef = classSubject.subject;
                const subjectId = typeof subjectRef === 'string' ? subjectRef : subjectRef?._id;
                if (!subjectId || uniqueSubjects.has(subjectId)) continue;

                const subjectDoc = typeof subjectRef === 'object' && subjectRef?._id
                    ? subjectRef
                    : subjects.find((subject) => subject._id === subjectId);
                uniqueSubjects.set(subjectId, subjectDoc || { _id: subjectId, name: 'Unknown subject' });
            }
        }

        return Array.from(uniqueSubjects.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [selectedTeacherId, newAssignment.class, availableClasses, classes, subjects]);

    const occupiedRoomIds = useMemo(() => {
        if (!newAssignment.daysOfWeek?.length) return new Set();

        const selectedDays = newAssignment.daysOfWeek;
        const candidateStart = new Date(newAssignment.startDate);
        const candidateEnd = new Date(newAssignment.endDate);
        const occupied = new Set();

        for (const assignment of assignments) {
            if (editingAssignmentId && assignment._id === editingAssignmentId) continue;

            const roomId = typeof assignment.room === 'string' ? assignment.room : assignment.room?._id;
            if (!roomId) continue;

            const assignClassId = typeof assignment.class === 'string' ? assignment.class : assignment.class?._id;

            if (newAssignment.class && assignClassId && assignClassId.toString() !== newAssignment.class.toString()) {
                const assignStart = new Date(assignment.startDate);
                const assignEnd = new Date(assignment.endDate);
                if (candidateStart <= assignEnd && candidateEnd >= assignStart) {
                    occupied.add(roomId);
                }
                continue;
            }

            const assignPeriodId = typeof assignment.period === 'string' ? assignment.period : assignment.period?._id;
            const newPeriodId = typeof newAssignment.period === 'string' ? newAssignment.period : newAssignment.period?._id;

            if (newPeriodId && assignPeriodId === newPeriodId) {
                const assignStart = new Date(assignment.startDate);
                const assignEnd = new Date(assignment.endDate);
                if (candidateStart <= assignEnd && candidateEnd >= assignStart) {
                    const sharedDay = (assignment.daysOfWeek || []).some((day) => selectedDays.includes(day));
                    if (sharedDay) occupied.add(roomId);
                }
            }
        }

        return occupied;
    }, [
        assignments,
        newAssignment.startDate,
        newAssignment.endDate,
        newAssignment.daysOfWeek,
        newAssignment.class,
        newAssignment.period,
        editingAssignmentId
    ]);

    return {
        filteredAssignments,
        availableClasses,
        availableSubjects,
        occupiedRoomIds
    };
};

export default useTimetableAssignmentOptions;
