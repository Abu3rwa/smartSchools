/* eslint-disable complexity, max-lines-per-function */
import { getTeacherClassIds, resolveTeacherProfile } from '../../helpers/teacherScoping.js';
import { messagingRepository } from './messagingRepository.js';
import {
    normalizeEmail,
    normalizeObjectIdArray,
    OBJECT_ID_PATTERN,
    toId
} from './messagingUtils.js';

const mapClassStats = (classIds = []) => new Map(
    classIds.map((classId) => [classId, {
        studentCount: 0,
        parentCount: 0,
        studentRecipientCount: 0
    }])
);

const addEmails = (targetSet, values = []) => {
    for (const value of values) {
        const email = normalizeEmail(value);
        if (email) {
            targetSet.add(email);
        }
    }
};

const collectStudentSignals = ({ students, classStats, includeParents, includeStudents }) => {
    const classParentEmails = new Map([...classStats.keys()].map((id) => [id, new Set()]));
    const classStudentUserIds = new Map([...classStats.keys()].map((id) => [id, new Set()]));
    const classStudentEmails = new Map([...classStats.keys()].map((id) => [id, new Set()]));
    const allParentEmails = new Set();
    const allStudentUserIds = new Set();
    const allStudentEmails = new Set();

    for (const student of students) {
        const classId = toId(student.currentClass);
        if (!classStats.has(classId)) {
            continue;
        }

        classStats.get(classId).studentCount += 1;

        if (includeParents) {
            const parentInfo = student.parentInfo || {};
            const parentEmails = [parentInfo.fatherEmail, parentInfo.motherEmail, parentInfo.guardianEmail];
            addEmails(classParentEmails.get(classId), parentEmails);
            addEmails(allParentEmails, parentEmails);
        }

        if (includeStudents) {
            const userId = toId(student.user);
            if (OBJECT_ID_PATTERN.test(userId)) {
                classStudentUserIds.get(classId).add(userId);
                allStudentUserIds.add(userId);
            }
            const studentEmails = [student.email, student.studentEmail];
            addEmails(classStudentEmails.get(classId), studentEmails);
            addEmails(allStudentEmails, studentEmails);
        }
    }

    return {
        allParentEmails,
        allStudentEmails,
        allStudentUserIds,
        classParentEmails,
        classStudentEmails,
        classStudentUserIds
    };
};

const mergeRecipientUsers = ({ recipientUserMap, users }) => {
    for (const user of users) {
        recipientUserMap.set(toId(user._id), user);
    }
};

const updateStudentRecipientCounts = ({
    classIds,
    classStats,
    classStudentUserIds,
    classStudentEmails,
    validUserIds,
    studentUserIdsByEmail
}) => {
    for (const classId of classIds) {
        const recipientIds = new Set();

        for (const userId of classStudentUserIds.get(classId)) {
            if (validUserIds.has(userId)) {
                recipientIds.add(userId);
            }
        }

        for (const email of classStudentEmails.get(classId)) {
            const emailMatches = studentUserIdsByEmail.get(email);
            if (!emailMatches) {
                continue;
            }
            for (const userId of emailMatches) {
                recipientIds.add(userId);
            }
        }

        classStats.get(classId).studentRecipientCount = recipientIds.size;
    }
};

const updateParentRecipientCounts = ({ classIds, classStats, classParentEmails, parentUserIdsByEmail }) => {
    for (const classId of classIds) {
        const recipientIds = new Set();

        for (const email of classParentEmails.get(classId)) {
            const emailMatches = parentUserIdsByEmail.get(email);
            if (!emailMatches) {
                continue;
            }
            for (const userId of emailMatches) {
                recipientIds.add(userId);
            }
        }

        classStats.get(classId).parentCount = recipientIds.size;
    }
};

export const createMessagingAudienceService = ({
    repository = messagingRepository,
    resolveTeacherProfileFn = resolveTeacherProfile,
    getTeacherClassIdsFn = getTeacherClassIds
} = {}) => {
    const resolveTeacherClassScope = async ({ req, normalizedRequestedClassIds }) => {
        const teacherProfile = await resolveTeacherProfileFn(req);
        if (!teacherProfile) {
            return {
                allowedClassIds: [],
                deniedClassIds: normalizedRequestedClassIds,
                allAccessibleClassIds: []
            };
        }

        const teacherClassIds = await getTeacherClassIdsFn(teacherProfile._id);
        const teacherClassIdStrings = teacherClassIds.map((id) => toId(id));
        const allowedSet = new Set(teacherClassIdStrings);
        const allowedClassIds = normalizedRequestedClassIds.length > 0
            ? normalizedRequestedClassIds.filter((id) => allowedSet.has(id))
            : teacherClassIdStrings;
        const deniedClassIds = normalizedRequestedClassIds.filter((id) => !allowedSet.has(id));

        return {
            allowedClassIds,
            deniedClassIds,
            allAccessibleClassIds: teacherClassIdStrings
        };
    };

    const resolveClassScopeForMessaging = async ({ req, requestedClassIds = [] }) => {
        const normalizedRequestedClassIds = normalizeObjectIdArray(requestedClassIds);

        if (req.user.role === 'teacher') {
            return resolveTeacherClassScope({ req, normalizedRequestedClassIds });
        }

        const allClassIds = await repository.findClassIdsByQuery({
            schoolId: req.schoolId,
            departmentId: req.departmentId,
            classIds: normalizedRequestedClassIds.length > 0 ? normalizedRequestedClassIds : null
        });

        if (normalizedRequestedClassIds.length === 0) {
            return {
                allowedClassIds: allClassIds,
                deniedClassIds: [],
                allAccessibleClassIds: allClassIds
            };
        }

        const allowedSet = new Set(allClassIds);
        return {
            allowedClassIds: allClassIds,
            deniedClassIds: normalizedRequestedClassIds.filter((id) => !allowedSet.has(id)),
            allAccessibleClassIds: allClassIds
        };
    };

    const resolveRecipientUsersForClasses = async ({
        schoolId,
        classIds = [],
        includeParents = true,
        includeStudents = false
    }) => {
        const normalizedClassIds = normalizeObjectIdArray(classIds);
        const classStats = mapClassStats(normalizedClassIds);

        if (normalizedClassIds.length === 0 || (!includeParents && !includeStudents)) {
            return { recipientUsers: [], classStats };
        }

        const students = await repository.findStudentsForClassRecipients({
            schoolId,
            classIds: normalizedClassIds
        });

        const signals = collectStudentSignals({
            students,
            classStats,
            includeParents,
            includeStudents
        });

        const recipientUserMap = new Map();

        if (includeStudents) {
            const studentUsersById = await repository.findUsersByRoleAndIds({
                schoolId,
                role: 'student',
                ids: [...signals.allStudentUserIds]
            });
            mergeRecipientUsers({ recipientUserMap, users: studentUsersById });

            const validStudentUserIdSet = new Set(studentUsersById.map((user) => toId(user._id)));
            const studentUsersByEmail = await repository.findUsersByRoleAndEmails({
                schoolId,
                role: 'student',
                emails: [...signals.allStudentEmails]
            });
            mergeRecipientUsers({ recipientUserMap, users: studentUsersByEmail });

            const studentUserIdsByEmail = new Map();
            for (const user of studentUsersByEmail) {
                const email = normalizeEmail(user.email);
                if (!email) {
                    continue;
                }

                if (!studentUserIdsByEmail.has(email)) {
                    studentUserIdsByEmail.set(email, new Set());
                }
                studentUserIdsByEmail.get(email).add(toId(user._id));
            }

            updateStudentRecipientCounts({
                classIds: normalizedClassIds,
                classStats,
                classStudentUserIds: signals.classStudentUserIds,
                classStudentEmails: signals.classStudentEmails,
                validUserIds: validStudentUserIdSet,
                studentUserIdsByEmail
            });
        }

        if (includeParents) {
            const parentUsers = await repository.findUsersByRoleAndEmails({
                schoolId,
                role: 'parent',
                emails: [...signals.allParentEmails]
            });
            mergeRecipientUsers({ recipientUserMap, users: parentUsers });

            const parentUserIdsByEmail = new Map();
            for (const user of parentUsers) {
                const email = normalizeEmail(user.email);
                if (!email) {
                    continue;
                }

                if (!parentUserIdsByEmail.has(email)) {
                    parentUserIdsByEmail.set(email, new Set());
                }
                parentUserIdsByEmail.get(email).add(toId(user._id));
            }

            updateParentRecipientCounts({
                classIds: normalizedClassIds,
                classStats,
                classParentEmails: signals.classParentEmails,
                parentUserIdsByEmail
            });
        }

        return {
            recipientUsers: [...recipientUserMap.values()],
            classStats
        };
    };

    return {
        resolveClassScopeForMessaging,
        resolveRecipientUsersForClasses
    };
};

export const messagingAudienceService = createMessagingAudienceService();
