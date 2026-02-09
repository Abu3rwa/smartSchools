import Teacher from '../models/Teacher.js';
import Class from '../models/Class.js';

/**
 * Get the Teacher document for a given User ID.
 * Returns null if user is not a teacher.
 */
export const getTeacherProfile = async (userId) => {
    return Teacher.findOne({ user: userId });
};

/**
 * Get all class IDs where this teacher is assigned (as subject teacher or class teacher).
 * @param {ObjectId} teacherId - The Teacher model _id (NOT User _id)
 * @returns {ObjectId[]} Array of Class _ids
 */
export const getTeacherClassIds = async (teacherId) => {
    const classIds = await Class.find({
        $or: [
            { classTeacher: teacherId },
            { 'subjects.teacher': teacherId }
        ]
    }).distinct('_id');
    return classIds;
};

/**
 * Get all subject IDs this teacher is assigned to teach.
 * Uses Teacher.assignedClasses and Class.subjects (fallback) so assignments
 * made via either path are included.
 * @param {ObjectId} teacherId - The Teacher model _id
 * @returns {ObjectId[]} Array of Subject _ids
 */
export const getTeacherSubjectIds = async (teacherId) => {
    const fromTeacher = await Teacher.findById(teacherId).select('assignedClasses.subject');
    const subjectIdsFromTeacher = (fromTeacher?.assignedClasses || []).map(ac => ac.subject);

    const classesWithTeacher = await Class.find({ 'subjects.teacher': teacherId }).select('subjects');
    const subjectIdsFromClass = new Set();
    for (const cls of classesWithTeacher) {
        for (const s of cls.subjects || []) {
            if (s.teacher?.toString() === teacherId.toString() && s.subject) {
                subjectIdsFromClass.add(s.subject.toString());
            }
        }
    }

    const merged = new Set([
        ...subjectIdsFromTeacher.map(id => id?.toString()).filter(Boolean),
        ...subjectIdsFromClass
    ]);
    return Array.from(merged);
};

/**
 * Get the teacher's assignments as { classId, subjectId } pairs.
 * Uses Teacher.assignedClasses and Class.subjects (fallback) so assignments
 * made via either path are included.
 * @param {ObjectId} teacherId - The Teacher model _id
 * @returns {{ classId: ObjectId, subjectId: ObjectId }[]}
 */
export const getTeacherAssignments = async (teacherId) => {
    const fromTeacher = await Teacher.findById(teacherId).select('assignedClasses');
    const fromTeacherList = (fromTeacher?.assignedClasses || []).map(ac => ({
        classId: ac.class,
        subjectId: ac.subject
    }));

    const classesWithTeacher = await Class.find({ 'subjects.teacher': teacherId }).select('_id subjects');
    const fromClassList = [];
    for (const cls of classesWithTeacher) {
        for (const s of cls.subjects || []) {
            if (s.teacher?.toString() === teacherId.toString() && s.subject) {
                fromClassList.push({ classId: cls._id, subjectId: s.subject });
            }
        }
    }

    const seen = new Set();
    const merged = [];
    for (const a of [...fromTeacherList, ...fromClassList]) {
        const classId = a.classId?.toString();
        const subjectId = a.subjectId?.toString();
        if (!classId || !subjectId) continue;
        const key = `${classId}_${subjectId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push({ classId: a.classId, subjectId: a.subjectId });
    }
    return merged;
};

/**
 * Check if a teacher is authorized for a specific class+subject combo.
 * @param {ObjectId} teacherId - The Teacher model _id
 * @param {string} classId - The Class _id
 * @param {string} subjectId - The Subject _id
 * @returns {boolean}
 */
export const isTeacherAuthorizedForClassSubject = async (teacherId, classId, subjectId) => {
    const classDoc = await Class.findById(classId);
    if (!classDoc) return false;

    // Check if teacher is assigned to this subject in this class
    const isSubjectTeacher = classDoc.subjects.some(s =>
        s.subject.toString() === subjectId && s.teacher.toString() === teacherId.toString()
    );

    // Also allow if teacher is the class teacher
    const isClassTeacher = classDoc.classTeacher?.toString() === teacherId.toString();

    return isSubjectTeacher || isClassTeacher;
};

/**
 * Middleware-style: resolve Teacher profile from req.user and attach to req.
 * Call early in teacher-scoped routes.
 */
export const resolveTeacherProfile = async (req) => {
    if (req.user.role !== 'teacher') return null;
    if (req.teacherProfile) return req.teacherProfile;

    const teacher = await Teacher.findOne({ user: req.user._id });
    if (teacher) {
        req.teacherProfile = teacher;
        req.teacherId = teacher._id;
    }
    return teacher;
};
