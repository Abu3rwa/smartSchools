import Teacher from '../models/Teacher.js';
import Subject from '../models/Subject.js';
import Class from '../models/Class.js';
import PlpSupervisorAssignment from '../models/PlpSupervisorAssignment.js';
import Student from '../models/Student.js';

const HOMEROOM_SUBJECT_MATCHERS = ['homeroom', 'home room', 'advisory', 'advisor', 'hmrm'];

export const isHomeroomSubject = (subject) => {
    const name = String(subject?.name || '').toLowerCase();
    const code = String(subject?.code || '').toLowerCase();
    return HOMEROOM_SUBJECT_MATCHERS.some((term) => name.includes(term) || code.includes(term));
};

export const createPlpAccessService = ({
    TeacherModel,
    SubjectModel,
    ClassModel,
    SupervisorAssignmentModel,
    StudentModel,
}) => {
    const getTeacherHomeroomClassIds = async (schoolId, teacherUserId, academicYear = null) => {
        const teacherProfile = await TeacherModel.findOne({ school: schoolId, user: teacherUserId, isActive: true })
            .select('_id')
            .lean();
        if (!teacherProfile) return [];

        const subjects = await SubjectModel.find({ school: schoolId, isActive: true })
            .select('_id name code')
            .lean();
        const homeroomSubjectIds = subjects.filter(isHomeroomSubject).map((subject) => subject._id.toString());
        if (!homeroomSubjectIds.length) return [];

        const classQuery = {
            school: schoolId,
            isActive: true,
            $or: [
                { classTeacher: teacherProfile._id },
                { subjects: { $elemMatch: { teacher: teacherProfile._id, subject: { $in: homeroomSubjectIds } } } },
            ],
        };
        if (academicYear) classQuery.academicYear = academicYear;
        const classes = await ClassModel.find(classQuery).select('_id').lean();
        return classes.map((row) => row._id.toString());
    };

    const assertRecordAccess = async (user, record) => {
        if (user.role === 'admin') return;

        if (user.role === 'teacher') {
            const classId = String(record?.class?._id || record?.class || '');
            if (!classId) throw Object.assign(new Error('PLP class context is missing'), { statusCode: 400 });
            const allowedClassIds = await getTeacherHomeroomClassIds(user.school, user._id, record.academicYear || null);
            if (!allowedClassIds.includes(classId)) {
                throw Object.assign(new Error('PLP access is limited to your homeroom students'), { statusCode: 403 });
            }
            return;
        }

        if (user.role === 'department_principal') {
            const assignment = await SupervisorAssignmentModel.findOne({
                school: user.school,
                supervisor: user._id,
                teacher: record.teacher,
                active: true,
            }).lean();
            if (assignment) return;
        }

        if (user.role === 'student') {
            const studentProfile = await StudentModel.findOne({
                school: user.school,
                user: user._id,
                _id: record.student,
                status: 'active',
            }).select('_id').lean();
            if (studentProfile) return;
        }

        throw Object.assign(new Error('Not authorized'), { statusCode: 403 });
    };

    const assertTeacherRecordWriteAccess = async (user, record) => {
        if (user.role !== 'teacher' && user.role !== 'admin') {
            throw Object.assign(new Error('Only teacher/admin can edit goals and tasks'), { statusCode: 403 });
        }
        if (user.role === 'admin') return;

        const classId = String(record?.class?._id || record?.class || '');
        const allowedClassIds = await getTeacherHomeroomClassIds(user.school, user._id, record.academicYear || null);
        if (!classId || !allowedClassIds.includes(classId)) {
            throw Object.assign(new Error('PLP write access is limited to your homeroom students'), { statusCode: 403 });
        }
    };

    const getStudentProfileFromUser = async (user) => StudentModel.findOne({
        school: user.school,
        user: user._id,
        status: 'active',
    }).select('_id firstName lastName currentClass academicYear').lean();

    return {
        getTeacherHomeroomClassIds,
        assertRecordAccess,
        assertTeacherRecordWriteAccess,
        getStudentProfileFromUser,
    };
};

export const {
    getTeacherHomeroomClassIds,
    assertRecordAccess,
    assertTeacherRecordWriteAccess,
    getStudentProfileFromUser,
} = createPlpAccessService({
    TeacherModel: Teacher,
    SubjectModel: Subject,
    ClassModel: Class,
    SupervisorAssignmentModel: PlpSupervisorAssignment,
    StudentModel: Student,
});
