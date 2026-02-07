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
 * @param {ObjectId} teacherId - The Teacher model _id
 * @returns {ObjectId[]} Array of Subject _ids
 */
export const getTeacherSubjectIds = async (teacherId) => {
    const teacher = await Teacher.findById(teacherId);
    if (!teacher) return [];
    return teacher.assignedClasses.map(ac => ac.subject);
};

/**
 * Get the teacher's assignments as { classId, subjectId } pairs.
 * @param {ObjectId} teacherId - The Teacher model _id
 * @returns {{ classId: ObjectId, subjectId: ObjectId }[]}
 */
export const getTeacherAssignments = async (teacherId) => {
    const teacher = await Teacher.findById(teacherId);
    if (!teacher) return [];
    return teacher.assignedClasses.map(ac => ({
        classId: ac.class,
        subjectId: ac.subject
    }));
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
