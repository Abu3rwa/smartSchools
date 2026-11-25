import Student from '../models/Student.js';
import { getTeacherClassIds, getTeacherProfile } from '../helpers/teacherScoping.js';
import { SPELLING_CURRICULUM_GRADES, isValidSpellingGrade } from '../utils/spellingProgress.js';
import { domainError } from '../utils/spellingLibraryErrors.js';

const ADMIN_ROLES = new Set(['admin', 'super_admin']);

/**
 * The spelling grades a teacher works at: the grades their students are placed
 * in. Placement is what says "this student is working on G3", so it is the
 * honest source for a teacher's library scope. A class's nominal grade is not
 * used because spelling placement is independent of it.
 */
export const teacherLibraryGrades = async ({ schoolId, userId }) => {
    const teacher = await getTeacherProfile(userId);
    if (!teacher || String(teacher.school) !== String(schoolId)) return [];
    const classIds = await getTeacherClassIds(teacher._id);
    if (classIds.length === 0) return [];
    const students = await Student.find({
        school: schoolId,
        $or: [{ currentClass: { $in: classIds } }, { enrolledClasses: { $in: classIds } }]
    }).select('spelling.currentGrade').lean();
    const grades = new Set();
    for (const student of students) {
        const grade = student.spelling?.currentGrade;
        if (isValidSpellingGrade(grade)) grades.add(grade);
    }
    return SPELLING_CURRICULUM_GRADES.filter((grade) => grades.has(grade));
};

/**
 * Capabilities for the acting role only. `roles[]` powers role switching, so an
 * inactive admin membership must not grant library writes while the account is
 * acting as a teacher.
 */
export const getLibraryCapabilities = async ({ schoolId, user, role }) => {
    const actingRole = role || user?.role;
    if (ADMIN_ROLES.has(actingRole)) {
        return {
            canEdit: true,
            canEditAllGrades: true,
            grades: [...SPELLING_CURRICULUM_GRADES],
            reasonCode: null
        };
    }
    if (actingRole === 'teacher') {
        const grades = await teacherLibraryGrades({ schoolId, userId: user?._id });
        return {
            canEdit: grades.length > 0,
            canEditAllGrades: false,
            grades,
            reasonCode: grades.length > 0 ? null : 'SCOPE_FORBIDDEN'
        };
    }
    return {
        canEdit: false,
        canEditAllGrades: false,
        grades: [],
        reasonCode: 'ROLE_FORBIDDEN'
    };
};

export const assertGradesEditable = async ({ schoolId, user, role, grades }) => {
    const unique = [...new Set((grades || []).filter(Boolean))];
    if (unique.length === 0) throw domainError('INVALID_REQUEST');
    const capabilities = await getLibraryCapabilities({ schoolId, user, role });
    if (capabilities.canEditAllGrades) return capabilities;
    if (!capabilities.canEdit) {
        throw domainError(capabilities.reasonCode === 'ROLE_FORBIDDEN' ? 'ROLE_FORBIDDEN' : 'SCOPE_FORBIDDEN');
    }
    // Requiring every affected grade (not "at least one") prevents a teacher
    // from editing a neighbouring grade through a shared link.
    const forbidden = unique.filter((grade) => !capabilities.grades.includes(grade));
    if (forbidden.length > 0) {
        throw domainError('SCOPE_FORBIDDEN', { details: forbidden.map((grade) => ({ grade })) });
    }
    return capabilities;
};

export const canEditGrade = (capabilities, grade) => (
    Boolean(capabilities?.canEdit)
    && (capabilities.canEditAllGrades || capabilities.grades.includes(grade))
);
