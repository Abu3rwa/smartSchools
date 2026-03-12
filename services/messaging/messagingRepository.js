/* eslint-disable max-lines-per-function */
import Class from '../../models/Class.js';
import ParentMessageThread from '../../models/ParentMessageThread.js';
import Student from '../../models/Student.js';
import User from '../../models/User.js';

export const createMessagingRepository = ({
    ClassModel = Class,
    ParentMessageThreadModel = ParentMessageThread,
    StudentModel = Student,
    UserModel = User
} = {}) => {
    const findManualRecipientUsers = ({ schoolId, recipientIds }) => (
        UserModel.find({
            _id: { $in: recipientIds },
            role: { $in: ['parent', 'student'] }
        })
            .select('_id role firstName lastName email')
            .setOptions({ schoolId })
    );

    const findClassIdsByQuery = async ({ schoolId, departmentId = null, classIds = null }) => {
        const query = {
            school: schoolId,
            isActive: true,
            ...(departmentId ? { department: departmentId } : {}),
            ...(Array.isArray(classIds) && classIds.length > 0 ? { _id: { $in: classIds } } : {})
        };

        const classes = await ClassModel.find(query).select('_id');
        return classes.map((item) => String(item._id));
    };

    const findStudentsForClassRecipients = ({ schoolId, classIds }) => (
        StudentModel.find({
            school: schoolId,
            currentClass: { $in: classIds },
            status: 'active'
        }).select('currentClass user email studentEmail parentInfo')
    );

    const findParentScopeStudents = ({ schoolId, classIds }) => (
        StudentModel.find({
            school: schoolId,
            currentClass: { $in: classIds },
            status: 'active'
        }).select('parentInfo')
    );

    const findStudentsForParentSearch = ({ schoolId, classIds = [], searchRegex }) => (
        StudentModel.find({
            school: schoolId,
            ...(classIds.length > 0 ? { currentClass: { $in: classIds } } : {}),
            $or: [
                { firstName: searchRegex },
                { lastName: searchRegex },
                { studentId: searchRegex }
            ]
        }).select('parentInfo')
    );

    const findStudentsByParentEmails = ({ schoolId, parentEmails }) => (
        StudentModel.find({
            school: schoolId,
            $or: [
                { 'parentInfo.fatherEmail': { $in: parentEmails } },
                { 'parentInfo.motherEmail': { $in: parentEmails } },
                { 'parentInfo.guardianEmail': { $in: parentEmails } }
            ]
        }).select('firstName lastName parentInfo')
    );

    const findUsersByRoleAndIds = ({ schoolId, role, ids }) => (
        ids.length === 0
            ? []
            : UserModel.find({
                school: schoolId,
                role,
                _id: { $in: ids }
            }).select('_id role firstName lastName email')
    );

    const findUsersByRoleAndEmails = ({ schoolId, role, emails }) => (
        emails.length === 0
            ? []
            : UserModel.find({
                school: schoolId,
                role,
                email: { $in: emails }
            }).select('_id role firstName lastName email')
    );

    const insertThreads = (payloads) => ParentMessageThreadModel.insertMany(payloads);

    const findThreadsForUser = ({ schoolId, userId, page, limit, unreadOnly }) => {
        const filter = {
            school: schoolId,
            ...(unreadOnly
                ? { participants: { $elemMatch: { user: userId, unreadCount: { $gt: 0 } } } }
                : { 'participants.user': userId })
        };

        return Promise.all([
            ParentMessageThreadModel.find(filter)
                .sort({ lastMessageAt: -1, updatedAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit),
            ParentMessageThreadModel.countDocuments(filter)
        ]);
    };

    const findThreadForUser = ({ threadId, schoolId, userId }) => (
        ParentMessageThreadModel.findOne({
            _id: threadId,
            school: schoolId,
            'participants.user': userId
        })
    );

    const findMessagingClasses = ({ schoolId, departmentId = null, classIds, searchRegex, numericGrade, limit }) => {
        const query = {
            school: schoolId,
            isActive: true,
            _id: { $in: classIds },
            ...(departmentId ? { department: departmentId } : {})
        };

        if (searchRegex) {
            query.$or = [
                { name: searchRegex },
                { section: searchRegex },
                ...(Number.isFinite(numericGrade) ? [{ grade: numericGrade }] : [])
            ];
        }

        return ClassModel.find(query)
            .select('_id name grade section academicYear')
            .sort({ grade: 1, section: 1, name: 1 })
            .limit(limit)
            .lean();
    };

    const findParents = ({ filter, page, limit }) => Promise.all([
        UserModel.find(filter)
            .sort({ firstName: 1, lastName: 1, email: 1 })
            .skip((page - 1) * limit)
            .limit(limit),
        UserModel.countDocuments(filter)
    ]);

    const findParentsByEmails = ({ schoolId, emails }) => (
        emails.length === 0
            ? []
            : UserModel.find({
                school: schoolId,
                role: 'parent',
                email: { $in: emails }
            })
    );

    return {
        findClassIdsByQuery,
        findManualRecipientUsers,
        findMessagingClasses,
        findParentScopeStudents,
        findParents,
        findParentsByEmails,
        findStudentsByParentEmails,
        findStudentsForClassRecipients,
        findStudentsForParentSearch,
        findThreadForUser,
        findThreadsForUser,
        findUsersByRoleAndEmails,
        findUsersByRoleAndIds,
        insertThreads
    };
};

export const messagingRepository = createMessagingRepository();
