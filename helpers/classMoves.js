import mongoose from 'mongoose';
import Class from '../models/Class.js';
import Student from '../models/Student.js';

const asClassId = (value) => {
    if (!value) return null;
    const id = value._id ?? value;
    return mongoose.isValidObjectId(id) ? String(id) : null;
};

const classLabel = (row) => `${row.name || 'Class'}${row.section ? ` · ${row.section}` : ''} · Grade ${row.grade}`;

/**
 * A move between two classes at the same grade (a re-section, or a repeated year) replaces the
 * class the student leaves. Otherwise the old class stays in their list and keeps showing up in
 * everything built from it, including live lesson invitations for a class they are no longer in.
 */
export const isSameGradeClassMove = async (schoolId, fromClass, toClass) => {
    const from = asClassId(fromClass);
    const to = asClassId(toClass);
    if (!from || !to || from === to) return false;

    const rows = await Class.find({ school: schoolId, _id: { $in: [from, to] } })
        .select('grade')
        .lean();
    const gradeOf = new Map(rows.map((row) => [String(row._id), row.grade]));
    const fromGrade = gradeOf.get(from);

    return fromGrade !== undefined && fromGrade === gradeOf.get(to);
};

/**
 * The class list to store after a move, or null when the old classes should simply be kept.
 */
export const enrolledClassesAfterMove = async ({ schoolId, student, toClass }) => {
    const to = asClassId(toClass);
    if (!to) return null;
    if (!(await isSameGradeClassMove(schoolId, student.currentClass, to))) return null;

    const from = asClassId(student.currentClass);
    const kept = (student.enrolledClasses || []).map(asClassId).filter((id) => id && id !== from);
    return [...new Set([...kept, to])];
};

/**
 * Students whose class list still carries another class at their own grade. Moves made before
 * this rule existed leave those behind. Read only: nothing is changed here.
 */
export const findStaleSameGradeEnrollments = async ({ schoolId, limit = 500 }) => {
    const students = await Student.find({ school: schoolId, status: 'active' })
        .select('firstName lastName studentId currentClass enrolledClasses')
        .limit(limit)
        .lean();

    const wanted = new Set();
    students.forEach((student) => {
        [asClassId(student.currentClass), ...(student.enrolledClasses || []).map(asClassId)]
            .filter(Boolean)
            .forEach((id) => wanted.add(id));
    });
    if (!wanted.size) return [];

    const classes = await Class.find({ school: schoolId, _id: { $in: [...wanted] } })
        .select('name grade section')
        .lean();
    const byId = new Map(classes.map((row) => [String(row._id), row]));

    return students.reduce((rows, student) => {
        const currentId = asClassId(student.currentClass);
        const current = byId.get(currentId);
        if (!current) return rows;

        const staleIds = (student.enrolledClasses || [])
            .map(asClassId)
            .filter((id) => id && id !== currentId)
            .filter((id) => byId.get(id)?.grade === current.grade);
        if (!staleIds.length) return rows;

        rows.push({
            studentId: String(student._id),
            name: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
            studentCode: student.studentId || '',
            currentClass: classLabel(current),
            stale: staleIds.map((id) => ({ id, label: classLabel(byId.get(id)) }))
        });
        return rows;
    }, []);
};

export const removeStaleSameGradeEnrollments = async ({ schoolId, studentId, classIds }) => {
    const ids = (classIds || []).map(asClassId).map((id) => id && new mongoose.Types.ObjectId(id)).filter(Boolean);
    if (!ids.length) return false;
    const result = await Student.updateOne(
        { school: schoolId, _id: studentId },
        { $pull: { enrolledClasses: { $in: ids } } }
    );
    return result.modifiedCount > 0;
};
