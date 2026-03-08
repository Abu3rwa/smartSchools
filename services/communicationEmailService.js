import xss from 'xss';
import User from '../models/User.js';
import Teacher from '../models/Teacher.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import Department from '../models/Department.js';
import School from '../models/School.js';
import { AITokenUsage } from '../models/AITokenUsage.js';
import gmailOAuthService from './gmailOAuthService.js';
import { downloadFile } from './firebaseStorageService.js';
import { connectAi } from '../utils/connectAi.js';
import {
    buildCommunicationAccess,
    hasAnyCommunicationAudience,
    serializeCommunicationAccess
} from './communicationScopeService.js';
import { getTeacherAssignments, getTeacherClassIds, resolveTeacherProfile } from '../helpers/teacherScoping.js';
import { resolveSchoolFeatureContext } from '../middleware/featureGate.js';
import { getDatePartsInTimeZone, isValidTimeZone, zonedDateTimeToUtc } from '../utils/schoolTimezone.js';

const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOCAL_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const MAX_SEND_RECIPIENTS = 1500;
const MAX_AI_DRAFT_PROMPT_LENGTH = 2000;

const toId = (value) => (value == null ? '' : String(value));
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const isValidEmail = (value) => EMAIL_PATTERN.test(normalizeEmail(value));

const parsePositiveInt = (value, fallback, max = 200) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, max);
};

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const stripHtmlToText = (value = '') => (
    String(value || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
);

const sanitizeSubject = (value = '') => (
    String(value || '')
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .trim()
        .slice(0, 220)
);

const sanitizeComposerHtml = (html = '') => {
    const normalized = String(html || '').trim();
    const base = normalized || '<p></p>';
    return xss(base, {
        whiteList: {
            p: [],
            br: [],
            b: [],
            strong: [],
            i: [],
            em: [],
            u: [],
            ul: [],
            ol: [],
            li: [],
            a: ['href', 'target', 'rel'],
            blockquote: [],
            div: [],
            span: []
        },
        stripIgnoreTag: true,
        stripIgnoreTagBody: ['script']
    });
};

const toDraftTone = (value = '') => {
    const normalized = String(value || '').trim().toLowerCase();
    if (['formal', 'warm', 'concise', 'friendly', 'professional'].includes(normalized)) {
        return normalized;
    }
    return 'professional';
};

export const parseScheduledDeliveryInput = ({
    scheduledForLocal,
    clientTimeZone,
    now = new Date()
}) => {
    const localValue = String(scheduledForLocal || '').trim();
    if (!localValue) return null;

    const timeZone = String(clientTimeZone || '').trim();
    if (!isValidTimeZone(timeZone)) {
        throw new Error('A valid client time zone is required for scheduled email');
    }

    const match = localValue.match(LOCAL_DATETIME_PATTERN);
    if (!match) {
        throw new Error('scheduledForLocal must be in YYYY-MM-DDTHH:mm format');
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);

    if (
        !Number.isFinite(year)
        || !Number.isFinite(month)
        || !Number.isFinite(day)
        || !Number.isFinite(hour)
        || !Number.isFinite(minute)
        || month < 1
        || month > 12
        || day < 1
        || day > 31
        || hour < 0
        || hour > 23
        || minute < 0
        || minute > 59
    ) {
        throw new Error('Invalid scheduled local date/time');
    }

    const scheduledFor = zonedDateTimeToUtc(
        { year, month, day, hour, minute, second: 0, millisecond: 0 },
        timeZone
    );
    if (!(scheduledFor instanceof Date) || Number.isNaN(scheduledFor.getTime())) {
        throw new Error('Invalid scheduled local date/time');
    }

    // Validate that local input maps to a real wall-clock time in the provided zone.
    const roundTrip = getDatePartsInTimeZone(scheduledFor, timeZone);
    if (
        roundTrip.year !== year
        || roundTrip.month !== month
        || roundTrip.day !== day
        || roundTrip.hour !== hour
        || roundTrip.minute !== minute
    ) {
        throw new Error('The selected local time is invalid for the provided timezone');
    }

    const minScheduleTime = new Date(now).getTime() + 60 * 1000;
    if (scheduledFor.getTime() <= minScheduleTime) {
        throw new Error('Scheduled time must be at least 1 minute in the future');
    }

    return {
        scheduledFor,
        scheduledForLocal: localValue,
        clientTimeZone: timeZone
    };
};

const plainTextToHtml = (text = '') => {
    const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
    if (!normalized) return '<p></p>';
    return normalized
        .split(/\n{2,}/)
        .map((block) => `<p>${block.replace(/\n/g, '<br />')}</p>`)
        .join('\n');
};

const buildClassLabel = (classDoc) => {
    const grade = Number.isFinite(Number(classDoc?.grade)) ? `Grade ${classDoc.grade}` : '';
    const section = String(classDoc?.section || '').trim();
    const name = String(classDoc?.name || '').trim();
    const parts = [grade, section, name].filter(Boolean);
    return parts.length ? parts.join(' ') : 'Class';
};

const fullName = (firstName = '', lastName = '') => (
    `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim()
);

export const resolveSenderIdentity = async ({
    senderUserId,
    fallbackUser = null,
    userLoader = (userId) => User.findById(userId)
        .select('firstName lastName email gmailTokens')
        .lean()
}) => {
    const senderId = toId(senderUserId).trim();
    const loadedUser = senderId ? await userLoader(senderId) : null;
    const sourceUser = loadedUser || fallbackUser || {};
    const senderEmail = normalizeEmail(sourceUser?.gmailTokens?.email || sourceUser?.email || '');
    const senderDisplayName = fullName(sourceUser?.firstName, sourceUser?.lastName) || senderEmail || 'Sender';
    return {
        senderEmail,
        senderDisplayName
    };
};

const mapDepartmentsById = (departments = []) => {
    const map = new Map();
    for (const department of departments) {
        map.set(toId(department._id), department);
    }
    return map;
};

const ensureObjectIdArray = (values = []) => {
    const ids = [];
    const seen = new Set();
    for (const value of values) {
        const normalized = toId(value).trim();
        if (!OBJECT_ID_PATTERN.test(normalized)) continue;
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        ids.push(normalized);
    }
    return ids;
};

const toSuggestion = ({
    key,
    label,
    subtitle = '',
    tokenType = 'group',
    audience = 'students',
    priority = 0
}) => ({
    key,
    label,
    subtitle,
    tokenType,
    audience,
    priority
});

const uniqueSuggestions = (items = []) => {
    const seen = new Set();
    const result = [];
    for (const item of items) {
        const key = String(item?.key || '').trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        result.push(item);
    }
    return result;
};

const normalizeTokenInput = (items = [], fallbackAudience = 'students') => {
    const normalized = [];
    const seen = new Set();
    for (const item of Array.isArray(items) ? items : []) {
        const key = typeof item === 'string'
            ? item
            : String(item?.key || '').trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        normalized.push({
            key,
            label: typeof item === 'object' && item?.label ? String(item.label) : key,
            tokenType: typeof item === 'object' && item?.tokenType ? String(item.tokenType) : 'group',
            audience: typeof item === 'object' && item?.audience ? String(item.audience) : fallbackAudience
        });
    }
    return normalized;
};

const extractTokenLabels = (items = [], max = 8) => (
    normalizeTokenInput(items)
        .map((item) => String(item.label || '').trim())
        .filter(Boolean)
        .slice(0, max)
);

const parseTokenKey = (rawKey) => {
    const key = String(rawKey || '').trim();
    if (!key) return null;

    const parts = key.split(':');
    if (parts[0] === 'grp') {
        const audience = parts[1];
        if (parts[2] === 'school') {
            return { key, kind: 'group', audience, scope: 'school' };
        }
        if (parts[2] === 'class' && parts[3]) {
            return { key, kind: 'group', audience, scope: 'class', classId: parts[3] };
        }
        if (parts[2] === 'class-subject' && parts[3] && parts[4]) {
            return {
                key,
                kind: 'group',
                audience,
                scope: 'class-subject',
                classId: parts[3],
                subjectId: parts[4]
            };
        }
        if (parts[2] === 'department' && parts[3]) {
            return {
                key,
                kind: 'group',
                audience,
                scope: 'department',
                departmentId: parts[3]
            };
        }
        return null;
    }

    if (parts[0] === 'ind') {
        if (parts[1] === 'student' && parts[2]) {
            return { key, kind: 'individual', audience: 'students', scope: 'student', studentId: parts[2] };
        }
        if (parts[1] === 'parent-student' && parts[2]) {
            return { key, kind: 'individual', audience: 'parents', scope: 'parent-student', studentId: parts[2] };
        }
        if (parts[1] === 'teacher' && parts[2]) {
            return { key, kind: 'individual', audience: 'teachers', scope: 'teacher', teacherUserId: parts[2] };
        }
    }
    return null;
};

const chunkArray = (items = [], size = 50) => {
    const chunked = [];
    for (let index = 0; index < items.length; index += size) {
        chunked.push(items.slice(index, index + size));
    }
    return chunked;
};

const buildAudienceSummary = (recipientEntries = []) => {
    const summary = {
        students: 0,
        parents: 0,
        teachers: 0
    };
    for (const entry of recipientEntries) {
        if (entry.category === 'students') summary.students += 1;
        if (entry.category === 'parents') summary.parents += 1;
        if (entry.category === 'teachers') summary.teachers += 1;
    }
    return summary;
};

const createBaseClassFilter = (context) => {
    const query = {
        school: context.schoolId,
        isActive: true
    };
    if (context.academicYear) {
        query.academicYear = context.academicYear;
    }
    return query;
};

const createBaseStudentFilter = (context) => {
    const query = {
        school: context.schoolId,
        status: 'active'
    };
    if (context.academicYear) {
        query.academicYear = context.academicYear;
    }
    return query;
};

const resolveContext = async (req) => {
    const teacherProfile = req.user.role === 'teacher'
        ? await resolveTeacherProfile(req)
        : null;

    const teacherAssignments = teacherProfile
        ? await getTeacherAssignments(teacherProfile._id)
        : [];
    const teacherClassIds = teacherProfile
        ? await getTeacherClassIds(teacherProfile._id)
        : [];

    const departments = await Department.find({ school: req.schoolId, isActive: true })
        .select('_id name')
        .sort({ name: 1 })
        .lean();

    const access = buildCommunicationAccess({
        user: req.user,
        teacherClassIds: teacherClassIds.map(toId),
        teacherDepartmentId: teacherProfile?.department || null,
        requestDepartmentId: req.departmentId || null,
        allDepartmentIds: departments.map((department) => toId(department._id))
    });

    return {
        req,
        user: req.user,
        schoolId: req.schoolId,
        academicYear: req.academicYear || null,
        teacherProfile,
        teacherAssignments: teacherAssignments.map((assignment) => ({
            classId: toId(assignment.classId),
            subjectId: toId(assignment.subjectId)
        })),
        access,
        departments,
        departmentsById: mapDepartmentsById(departments),
        cache: {
            classIdsByDepartment: new Map(),
            allClassIds: null
        }
    };
};

const getDepartmentIdsForAudience = (context, audience) => {
    const departments = new Set();
    if (audience === 'students') {
        for (const id of context.access.studentDepartmentIds) departments.add(id);
    } else if (audience === 'parents') {
        for (const id of context.access.parentDepartmentIds) departments.add(id);
    } else if (audience === 'teachers') {
        for (const id of context.access.teacherDepartmentIds) departments.add(id);
    } else if (audience === 'everyone') {
        for (const id of context.access.everyoneDepartmentIds) departments.add(id);
    }

    if (audience !== 'everyone') {
        for (const id of context.access.everyoneDepartmentIds) departments.add(id);
    }

    return departments;
};

const getClassIdsByDepartmentIds = async (context, departmentIds = []) => {
    const normalizedDepartmentIds = ensureObjectIdArray(departmentIds);
    const missing = normalizedDepartmentIds.filter((departmentId) => !context.cache.classIdsByDepartment.has(departmentId));

    if (missing.length > 0) {
        const classDocs = await Class.find({
            ...createBaseClassFilter(context),
            department: { $in: missing }
        }).select('_id department').lean();

        for (const departmentId of missing) {
            context.cache.classIdsByDepartment.set(departmentId, new Set());
        }

        for (const classDoc of classDocs) {
            const departmentId = toId(classDoc.department);
            if (!context.cache.classIdsByDepartment.has(departmentId)) {
                context.cache.classIdsByDepartment.set(departmentId, new Set());
            }
            context.cache.classIdsByDepartment.get(departmentId).add(toId(classDoc._id));
        }
    }

    const ids = new Set();
    for (const departmentId of normalizedDepartmentIds) {
        const values = context.cache.classIdsByDepartment.get(departmentId);
        if (!values) continue;
        for (const classId of values) ids.add(classId);
    }
    return ids;
};

const getAllClassIds = async (context) => {
    if (context.cache.allClassIds) return context.cache.allClassIds;
    const classDocs = await Class.find(createBaseClassFilter(context)).select('_id').lean();
    context.cache.allClassIds = new Set(classDocs.map((classDoc) => toId(classDoc._id)));
    return context.cache.allClassIds;
};

const getAllowedClassIdsForAudience = async (context, audience) => {
    const ids = new Set();
    if (audience === 'students') {
        for (const classId of context.access.studentClassIds) ids.add(classId);
    }
    if (audience === 'parents') {
        for (const classId of context.access.parentClassIds) ids.add(classId);
    }

    const departmentIds = [...getDepartmentIdsForAudience(context, audience)];
    if (departmentIds.length > 0) {
        const fromDepartments = await getClassIdsByDepartmentIds(context, departmentIds);
        for (const classId of fromDepartments) ids.add(classId);
    }

    const schoolWideStudents = audience === 'students' && (context.access.schoolStudents || context.access.schoolEveryone);
    const schoolWideParents = audience === 'parents' && (context.access.schoolParents || context.access.schoolEveryone);
    if (schoolWideStudents || schoolWideParents) {
        const allClassIds = await getAllClassIds(context);
        for (const classId of allClassIds) ids.add(classId);
    }

    return ids;
};

const getAllowedDepartmentIdsForTeacherAudience = (context) => {
    const ids = new Set(context.access.teacherDepartmentIds || []);
    for (const departmentId of context.access.everyoneDepartmentIds || []) {
        ids.add(departmentId);
    }
    return ids;
};

const canUseSchoolAudience = (context, audience) => {
    if (audience === 'students') return context.access.schoolStudents || context.access.schoolEveryone;
    if (audience === 'parents') return context.access.schoolParents || context.access.schoolEveryone;
    if (audience === 'teachers') return context.access.schoolTeachers || context.access.schoolEveryone;
    if (audience === 'everyone') return context.access.schoolEveryone;
    return false;
};

const buildTeacherAssignmentSuggestions = async (context, audience, search = '') => {
    if (!['students', 'parents'].includes(audience)) return [];
    if (context.teacherAssignments.length === 0) return [];

    const allowedClassIds = await getAllowedClassIdsForAudience(context, audience);
    const assignmentCandidates = context.teacherAssignments
        .filter((assignment) => allowedClassIds.has(assignment.classId));
    if (assignmentCandidates.length === 0) return [];

    const classIds = ensureObjectIdArray(assignmentCandidates.map((assignment) => assignment.classId));
    const subjectIds = ensureObjectIdArray(assignmentCandidates.map((assignment) => assignment.subjectId));

    const [classes, subjects] = await Promise.all([
        Class.find({ ...createBaseClassFilter(context), _id: { $in: classIds } })
            .select('_id name grade section')
            .lean(),
        Subject.find({ school: context.schoolId, _id: { $in: subjectIds } })
            .select('_id name code')
            .lean()
    ]);

    const classById = new Map(classes.map((classDoc) => [toId(classDoc._id), classDoc]));
    const subjectById = new Map(subjects.map((subjectDoc) => [toId(subjectDoc._id), subjectDoc]));

    const suggestions = [];
    for (const assignment of assignmentCandidates) {
        const classDoc = classById.get(assignment.classId);
        const subjectDoc = subjectById.get(assignment.subjectId);
        if (!classDoc || !subjectDoc) continue;

        const classLabel = buildClassLabel(classDoc);
        const subjectLabel = String(subjectDoc.name || subjectDoc.code || '').trim() || 'Subject';
        const label = audience === 'students'
            ? `All students in ${classLabel} - ${subjectLabel}`
            : `Parents of ${classLabel} - ${subjectLabel}`;
        const key = `grp:${audience}:class-subject:${assignment.classId}:${assignment.subjectId}`;
        suggestions.push(toSuggestion({
            key,
            label,
            subtitle: `Class + subject group`,
            tokenType: 'group',
            audience,
            priority: 0
        }));
    }

    if (!search) return uniqueSuggestions(suggestions);
    const regex = new RegExp(escapeRegex(search), 'i');
    return uniqueSuggestions(suggestions.filter((suggestion) => regex.test(suggestion.label)));
};

const buildClassGroupSuggestions = async (context, audience, search = '', limit = 25) => {
    if (!['students', 'parents'].includes(audience)) return [];
    const allowedClassIds = await getAllowedClassIdsForAudience(context, audience);
    const allowedClassIdList = ensureObjectIdArray([...allowedClassIds]);
    if (allowedClassIdList.length === 0) return [];

    const query = {
        ...createBaseClassFilter(context),
        _id: { $in: allowedClassIdList }
    };
    if (search) {
        const regex = new RegExp(escapeRegex(search), 'i');
        const grade = Number.parseInt(search, 10);
        query.$or = [
            { name: regex },
            { section: regex },
            ...(Number.isFinite(grade) ? [{ grade }] : [])
        ];
    }

    const classDocs = await Class.find(query)
        .select('_id name grade section')
        .sort({ grade: 1, section: 1, name: 1 })
        .limit(limit)
        .lean();

    return classDocs.map((classDoc) => {
        const classLabel = buildClassLabel(classDoc);
        const label = audience === 'students'
            ? `Students in ${classLabel}`
            : `Parents of ${classLabel}`;
        return toSuggestion({
            key: `grp:${audience}:class:${toId(classDoc._id)}`,
            label,
            subtitle: 'Class group',
            tokenType: 'group',
            audience,
            priority: 0
        });
    });
};

const buildDepartmentAndSchoolSuggestions = (context, audience, search = '') => {
    const groups = [];
    const regex = search ? new RegExp(escapeRegex(search), 'i') : null;

    const pushIfMatch = (item) => {
        if (!regex || regex.test(item.label) || regex.test(item.subtitle || '')) {
            groups.push(item);
        }
    };

    if (audience === 'students' || audience === 'parents' || audience === 'teachers') {
        const departmentIds = audience === 'teachers'
            ? getAllowedDepartmentIdsForTeacherAudience(context)
            : getDepartmentIdsForAudience(context, audience);
        for (const departmentId of departmentIds) {
            const department = context.departmentsById.get(departmentId);
            if (!department) continue;
            const scopeLabel = String(department.name || 'Department').trim();
            const label = audience === 'students'
                ? `All students in ${scopeLabel}`
                : audience === 'parents'
                    ? `All parents in ${scopeLabel}`
                    : `Teachers in ${scopeLabel}`;
            pushIfMatch(toSuggestion({
                key: `grp:${audience}:department:${departmentId}`,
                label,
                subtitle: 'Department group',
                tokenType: 'group',
                audience,
                priority: 0
            }));
        }

        if (canUseSchoolAudience(context, audience)) {
            const label = audience === 'students'
                ? 'All students in school'
                : audience === 'parents'
                    ? 'All parents in school'
                    : 'All teachers in school';
            pushIfMatch(toSuggestion({
                key: `grp:${audience}:school`,
                label,
                subtitle: 'School-wide group',
                tokenType: 'group',
                audience,
                priority: 0
            }));
        }
    }

    // "Everyone" groups are available from any recipient field when allowed.
    for (const departmentId of context.access.everyoneDepartmentIds || []) {
        const department = context.departmentsById.get(departmentId);
        if (!department) continue;
        pushIfMatch(toSuggestion({
            key: `grp:everyone:department:${departmentId}`,
            label: `Everyone in ${department.name}`,
            subtitle: 'Department-wide everyone group',
            tokenType: 'group',
            audience: 'everyone',
            priority: 0
        }));
    }
    if (context.access.schoolEveryone) {
        pushIfMatch(toSuggestion({
            key: 'grp:everyone:school',
            label: 'Everyone in school',
            subtitle: 'School-wide everyone group',
            tokenType: 'group',
            audience: 'everyone',
            priority: 0
        }));
    }

    return groups;
};

const buildStudentIndividualSuggestions = async (context, search = '', limit = 20) => {
    const allowedClassIds = await getAllowedClassIdsForAudience(context, 'students');
    const allowedClassIdList = ensureObjectIdArray([...allowedClassIds]);
    if (allowedClassIdList.length === 0 && !canUseSchoolAudience(context, 'students')) {
        return [];
    }

    const query = createBaseStudentFilter(context);
    if (!canUseSchoolAudience(context, 'students')) {
        query.currentClass = { $in: allowedClassIdList };
    }
    if (search) {
        const regex = new RegExp(escapeRegex(search), 'i');
        query.$or = [
            { firstName: regex },
            { lastName: regex },
            { studentId: regex },
            { email: regex },
            { studentEmail: regex }
        ];
    }

    const students = await Student.find(query)
        .select('_id firstName lastName studentId email studentEmail')
        .sort({ firstName: 1, lastName: 1 })
        .limit(limit)
        .lean();

    return students.map((student) => {
        const studentName = fullName(student.firstName, student.lastName) || student.studentId || 'Student';
        const studentEmail = normalizeEmail(student.studentEmail || student.email);
        return toSuggestion({
            key: `ind:student:${toId(student._id)}`,
            label: `Student: ${studentName}`,
            subtitle: studentEmail || 'Individual student',
            tokenType: 'individual',
            audience: 'students',
            priority: 1
        });
    });
};

const buildParentIndividualSuggestions = async (context, search = '', limit = 20) => {
    const allowedClassIds = await getAllowedClassIdsForAudience(context, 'parents');
    const allowedClassIdList = ensureObjectIdArray([...allowedClassIds]);
    if (allowedClassIdList.length === 0 && !canUseSchoolAudience(context, 'parents')) {
        return [];
    }

    const query = createBaseStudentFilter(context);
    if (!canUseSchoolAudience(context, 'parents')) {
        query.currentClass = { $in: allowedClassIdList };
    }
    if (search) {
        const regex = new RegExp(escapeRegex(search), 'i');
        query.$or = [
            { firstName: regex },
            { lastName: regex },
            { studentId: regex },
            { 'parentInfo.fatherEmail': regex },
            { 'parentInfo.motherEmail': regex },
            { 'parentInfo.guardianEmail': regex }
        ];
    }

    const students = await Student.find(query)
        .select('_id firstName lastName studentId parentInfo')
        .sort({ firstName: 1, lastName: 1 })
        .limit(limit)
        .lean();

    const suggestions = [];
    for (const student of students) {
        const parentInfo = student.parentInfo || {};
        const emails = [
            normalizeEmail(parentInfo.fatherEmail),
            normalizeEmail(parentInfo.motherEmail),
            normalizeEmail(parentInfo.guardianEmail)
        ].filter(Boolean);
        if (emails.length === 0) continue;

        const studentName = fullName(student.firstName, student.lastName) || student.studentId || 'Student';
        suggestions.push(toSuggestion({
            key: `ind:parent-student:${toId(student._id)}`,
            label: `Parents of Student: ${studentName}`,
            subtitle: emails.slice(0, 2).join(', '),
            tokenType: 'individual',
            audience: 'parents',
            priority: 1
        }));
    }
    return suggestions;
};

const buildTeacherIndividualSuggestions = async (context, search = '', limit = 20) => {
    const isSchoolWide = canUseSchoolAudience(context, 'teachers');
    const allowedDepartmentIds = ensureObjectIdArray([...getAllowedDepartmentIdsForTeacherAudience(context)]);
    if (!isSchoolWide && allowedDepartmentIds.length === 0) {
        return [];
    }

    const teacherQuery = {
        school: context.schoolId,
        isActive: true
    };
    if (!isSchoolWide) {
        teacherQuery.department = { $in: allowedDepartmentIds };
    }

    let userMatch = {};
    if (search) {
        const regex = new RegExp(escapeRegex(search), 'i');
        const userCandidates = await User.find({
            school: context.schoolId,
            role: { $in: ['teacher', 'department_principal', 'staff'] },
            $or: [
                { firstName: regex },
                { lastName: regex },
                { email: regex }
            ]
        }).select('_id');
        const candidateIds = userCandidates.map((user) => user._id);
        if (candidateIds.length === 0) return [];
        userMatch = { user: { $in: candidateIds } };
    }

    const teachers = await Teacher.find({ ...teacherQuery, ...userMatch })
        .select('_id user department')
        .populate('user', 'firstName lastName email role')
        .limit(limit)
        .lean();

    return teachers
        .filter((teacher) => teacher?.user?.email)
        .map((teacher) => {
            const departmentName = context.departmentsById.get(toId(teacher.department))?.name || 'Teacher';
            const teacherName = fullName(teacher.user.firstName, teacher.user.lastName) || teacher.user.email;
            return toSuggestion({
                key: `ind:teacher:${toId(teacher.user._id)}`,
                label: `Teacher: ${teacherName}`,
                subtitle: `${departmentName} · ${teacher.user.email}`,
                tokenType: 'individual',
                audience: 'teachers',
                priority: 1
            });
        });
};

const canUseToken = async (context, parsedToken) => {
    if (!parsedToken) return { allowed: false, reason: 'Invalid token format' };
    if (parsedToken.kind === 'group') {
        if (parsedToken.scope === 'school') {
            if (!canUseSchoolAudience(context, parsedToken.audience)) {
                return { allowed: false, reason: 'Not allowed to use school-wide recipient token' };
            }
            return { allowed: true };
        }

        if (parsedToken.scope === 'department') {
            const departmentId = toId(parsedToken.departmentId);
            if (!OBJECT_ID_PATTERN.test(departmentId)) {
                return { allowed: false, reason: 'Invalid department token' };
            }
            if (parsedToken.audience === 'everyone') {
                if (context.access.schoolEveryone || context.access.everyoneDepartmentIds.has(departmentId)) {
                    return { allowed: true };
                }
                return { allowed: false, reason: 'Department everyone token is not allowed' };
            }
            const allowedDepartments = parsedToken.audience === 'teachers'
                ? getAllowedDepartmentIdsForTeacherAudience(context)
                : getDepartmentIdsForAudience(context, parsedToken.audience);
            if (allowedDepartments.has(departmentId)) {
                return { allowed: true };
            }
            return { allowed: false, reason: 'Department token outside allowed scope' };
        }

        if (parsedToken.scope === 'class' || parsedToken.scope === 'class-subject') {
            const classId = toId(parsedToken.classId);
            if (!OBJECT_ID_PATTERN.test(classId)) {
                return { allowed: false, reason: 'Invalid class token' };
            }
            const audience = parsedToken.audience;
            if (!['students', 'parents'].includes(audience)) {
                return { allowed: false, reason: 'Class tokens can only target students/parents' };
            }
            const allowedClassIds = await getAllowedClassIdsForAudience(context, audience);
            if (!allowedClassIds.has(classId)) {
                return { allowed: false, reason: 'Class token outside allowed scope' };
            }
            if (
                parsedToken.scope === 'class-subject'
                && context.teacherAssignments.length > 0
                && context.user.role === 'teacher'
            ) {
                const assignmentKey = `${classId}:${toId(parsedToken.subjectId)}`;
                const assignmentSet = new Set(
                    context.teacherAssignments.map((assignment) => `${assignment.classId}:${assignment.subjectId}`)
                );
                if (!assignmentSet.has(assignmentKey)) {
                    return { allowed: false, reason: 'Class-subject token outside teacher assignments' };
                }
            }
            return { allowed: true };
        }

        return { allowed: false, reason: 'Unsupported group token' };
    }

    if (parsedToken.kind === 'individual') {
        if (parsedToken.scope === 'student' || parsedToken.scope === 'parent-student') {
            const studentId = toId(parsedToken.studentId);
            if (!OBJECT_ID_PATTERN.test(studentId)) {
                return { allowed: false, reason: 'Invalid student token' };
            }
            const audience = parsedToken.scope === 'student' ? 'students' : 'parents';
            const allowedClassIds = await getAllowedClassIdsForAudience(context, audience);
            const student = await Student.findOne({
                _id: studentId,
                ...createBaseStudentFilter(context)
            }).select('_id currentClass');
            if (!student) {
                return { allowed: false, reason: 'Student not found' };
            }
            if (canUseSchoolAudience(context, audience)) {
                return { allowed: true };
            }
            if (!allowedClassIds.has(toId(student.currentClass))) {
                return { allowed: false, reason: 'Student token outside allowed scope' };
            }
            return { allowed: true };
        }

        if (parsedToken.scope === 'teacher') {
            const teacherUserId = toId(parsedToken.teacherUserId);
            if (!OBJECT_ID_PATTERN.test(teacherUserId)) {
                return { allowed: false, reason: 'Invalid teacher token' };
            }
            const isSchoolWide = canUseSchoolAudience(context, 'teachers');
            const query = {
                school: context.schoolId,
                user: teacherUserId,
                isActive: true
            };
            if (!isSchoolWide) {
                const departmentIds = ensureObjectIdArray([...getAllowedDepartmentIdsForTeacherAudience(context)]);
                if (departmentIds.length === 0) {
                    return { allowed: false, reason: 'No allowed teacher scope' };
                }
                query.department = { $in: departmentIds };
            }
            const teacher = await Teacher.findOne(query).select('_id');
            if (!teacher) {
                return { allowed: false, reason: 'Teacher token outside allowed scope' };
            }
            return { allowed: true };
        }
    }

    return { allowed: false, reason: 'Unsupported token' };
};

const collectStudentEmails = (student) => {
    const values = [student?.email, student?.studentEmail]
        .map(normalizeEmail)
        .filter(Boolean);
    return [...new Set(values)];
};

const collectParentEmails = (student) => {
    const parentInfo = student?.parentInfo || {};
    const values = [
        parentInfo.fatherEmail,
        parentInfo.motherEmail,
        parentInfo.guardianEmail
    ]
        .map(normalizeEmail)
        .filter(Boolean);
    return [...new Set(values)];
};

const addRecipients = (bucket, entries = []) => {
    for (const entry of entries) {
        bucket.push(entry);
    }
};

const sanitizeAttachmentFilename = (value = '') => (
    String(value || 'attachment')
        .replace(/[^\w.\-() ]+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120)
        || 'attachment'
);

const prepareTransportAttachments = async (attachments = [], attachmentLoader = downloadFile) => {
    const files = [];
    for (const item of Array.isArray(attachments) ? attachments : []) {
        const storageRef = String(item?.storagePath || item?.fileUrl || '').trim();
        if (!storageRef) continue;
        const { buffer, contentType } = await attachmentLoader(storageRef);
        if (!buffer || buffer.length === 0) continue;
        files.push({
            filename: sanitizeAttachmentFilename(item.originalName || item.filename),
            contentType: item.mimeType || contentType || 'application/octet-stream',
            content: buffer
        });
    }
    return files;
};

const fetchStudentsForScope = async ({
    context,
    classIds = [],
    departmentIds = [],
    schoolWide = false
}) => {
    const query = createBaseStudentFilter(context);
    if (!schoolWide) {
        const classIdList = ensureObjectIdArray(classIds);
        const departmentIdList = ensureObjectIdArray(departmentIds);
        const or = [];
        if (classIdList.length > 0) {
            or.push({ currentClass: { $in: classIdList } });
        }
        if (departmentIdList.length > 0) {
            or.push({ department: { $in: departmentIdList } });
        }
        if (or.length === 0) return [];
        query.$or = or;
    }
    return Student.find(query)
        .select('_id firstName lastName studentId email studentEmail parentInfo currentClass department')
        .lean();
};

const fetchTeachersForScope = async ({
    context,
    departmentIds = [],
    schoolWide = false,
    userIds = null
}) => {
    const query = {
        school: context.schoolId,
        isActive: true
    };
    if (!schoolWide) {
        const departmentIdList = ensureObjectIdArray(departmentIds);
        if (departmentIdList.length === 0) return [];
        query.department = { $in: departmentIdList };
    }
    if (Array.isArray(userIds)) {
        const normalizedUserIds = ensureObjectIdArray(userIds);
        if (normalizedUserIds.length === 0) return [];
        query.user = { $in: normalizedUserIds };
    }
    return Teacher.find(query)
        .select('_id user department')
        .populate('user', 'firstName lastName email role')
        .lean();
};

export const resolveAiDraftCapability = async ({
    schoolId,
    featureContextResolver = resolveSchoolFeatureContext,
    schoolLoader = (targetSchoolId) => School.findById(targetSchoolId).select('settings.communication').lean()
}) => {
    if (!schoolId) {
        return {
            featureAvailable: false,
            schoolEnabled: true,
            canUse: false,
            reason: 'plan_locked'
        };
    }

    const [featureContext, school] = await Promise.all([
        featureContextResolver(schoolId),
        schoolLoader(schoolId)
    ]);

    const featureAvailable = Boolean(featureContext?.features?.aiEmailDrafts);
    const schoolEnabled = school?.settings?.communication?.aiEmailDraftEnabled !== false;

    if (!featureAvailable) {
        return {
            featureAvailable,
            schoolEnabled,
            canUse: false,
            reason: 'plan_locked'
        };
    }
    if (!schoolEnabled) {
        return {
            featureAvailable,
            schoolEnabled,
            canUse: false,
            reason: 'disabled_by_school_admin'
        };
    }

    return {
        featureAvailable,
        schoolEnabled,
        canUse: true,
        reason: 'enabled'
    };
};

export const generateCommunicationEmailDraft = async ({
    schoolId,
    userId,
    prompt,
    tone = 'professional',
    selection = {},
    senderDisplayName = '',
    aiConnector = connectAi,
    tokenUsageModel = AITokenUsage
}) => {
    const promptText = String(prompt || '').trim();
    if (!promptText) {
        throw new Error('Prompt is required');
    }
    if (promptText.length > MAX_AI_DRAFT_PROMPT_LENGTH) {
        throw new Error(`Prompt must be at most ${MAX_AI_DRAFT_PROMPT_LENGTH} characters`);
    }

    const resolvedTone = toDraftTone(tone);
    const parentLabels = extractTokenLabels(selection?.toParents || [], 6);
    const teacherLabels = extractTokenLabels(selection?.toTeachers || [], 6);
    const studentLabels = extractTokenLabels(selection?.toStudents || [], 6);

    const toneInstruction = {
        professional: 'professional, clear, and respectful',
        formal: 'formal and policy-aware',
        warm: 'warm, supportive, and friendly',
        concise: 'concise and direct',
        friendly: 'friendly and approachable'
    }[resolvedTone] || 'professional, clear, and respectful';

    const aiPrompt = `
You are assisting school staff to draft an internal school communication email body.

Write ONLY the email body in clean HTML. Do not include <html> or <body> tags.
Allowed structure: paragraphs, bullet lists, numbered lists, links where appropriate.
Keep content practical and parent/school appropriate.
Tone: ${toneInstruction}.

Audience context:
- Parents tokens: ${parentLabels.length ? parentLabels.join(' | ') : 'none'}
- Teachers tokens: ${teacherLabels.length ? teacherLabels.join(' | ') : 'none'}
- Students tokens: ${studentLabels.length ? studentLabels.join(' | ') : 'none'}

Sender context:
- Sender display name: ${String(senderDisplayName || 'School Staff').trim()}
- Never sign as a recipient or any audience member.
- If you include a closing signature, use exactly the sender display name above.

User request:
${promptText}
    `.trim();

    const aiResult = await aiConnector(aiPrompt, { modelName: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite' });
    const rawHtml = String(aiResult?.text || '').trim();
    const fallbackHtml = plainTextToHtml(rawHtml || promptText);
    const bodyHtml = sanitizeComposerHtml(fallbackHtml);
    const bodyText = stripHtmlToText(bodyHtml);

    let usage = {
        model: aiResult?.modelName || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
        inputTokens: Number(aiResult?.inputtokenCount || 0),
        outputTokens: Number(aiResult?.outputtokenCount || 0),
        totalTokens: Number(aiResult?.totalTokenCount || 0),
        logged: false
    };

    try {
        const usageRecord = await tokenUsageModel.create({
            model: usage.model,
            feature: 'communication_email_draft',
            school: schoolId,
            user: userId,
            reportType: 'custom',
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            schoolId: String(schoolId),
            metadata: {
                tone: resolvedTone,
                promptLength: promptText.length,
                selectionCounts: {
                    parents: parentLabels.length,
                    teachers: teacherLabels.length,
                    students: studentLabels.length
                }
            }
        });
        usage = {
            ...usage,
            logged: true,
            usageId: toId(usageRecord?._id)
        };
    } catch {
        usage = {
            ...usage,
            logged: false
        };
    }

    return {
        bodyHtml,
        bodyText,
        usage
    };
};

export const getComposerConfig = async (req) => {
    const context = await resolveContext(req);
    const canUseComposer = hasAnyCommunicationAudience(context.access);
    const aiDraft = await resolveAiDraftCapability({
        schoolId: req.schoolId
    });
    const senderIdentity = await resolveSenderIdentity({
        senderUserId: req.user?._id,
        fallbackUser: req.user
    });

    return {
        canUseComposer,
        sender: {
            displayName: senderIdentity.senderDisplayName,
            email: senderIdentity.senderEmail,
            canChange: false,
            options: senderIdentity.senderEmail
                ? [{
                    value: senderIdentity.senderEmail,
                    label: `${senderIdentity.senderDisplayName} <${senderIdentity.senderEmail}>`
                }]
                : []
        },
        capabilities: {
            attachmentsSupported: true,
            templatesSupported: false,
            richTextSupported: true,
            aiDraft
        },
        access: serializeCommunicationAccess(context.access)
    };
};

export const getRecipientSuggestions = async (req, { field, query, limit, page }) => {
    const context = await resolveContext(req);
    if (!hasAnyCommunicationAudience(context.access)) {
        return {
            suggestions: [],
            pagination: {
                page,
                limit,
                hasMore: false
            }
        };
    }

    const search = String(query || '').trim();
    const audienceField = String(field || '').trim().toLowerCase();

    let groupSuggestions = [];
    let individualSuggestions = [];

    if (audienceField === 'students') {
        const [assignmentGroups, classGroups] = await Promise.all([
            buildTeacherAssignmentSuggestions(context, 'students', search),
            buildClassGroupSuggestions(context, 'students', search, Math.max(limit, 25))
        ]);
        groupSuggestions = [
            ...assignmentGroups,
            ...classGroups,
            ...buildDepartmentAndSchoolSuggestions(context, 'students', search)
        ];
        individualSuggestions = await buildStudentIndividualSuggestions(context, search, Math.max(limit, 20));
    } else if (audienceField === 'parents') {
        const [assignmentGroups, classGroups] = await Promise.all([
            buildTeacherAssignmentSuggestions(context, 'parents', search),
            buildClassGroupSuggestions(context, 'parents', search, Math.max(limit, 25))
        ]);
        groupSuggestions = [
            ...assignmentGroups,
            ...classGroups,
            ...buildDepartmentAndSchoolSuggestions(context, 'parents', search)
        ];
        individualSuggestions = await buildParentIndividualSuggestions(context, search, Math.max(limit, 20));
    } else if (audienceField === 'teachers') {
        groupSuggestions = buildDepartmentAndSchoolSuggestions(context, 'teachers', search);
        individualSuggestions = await buildTeacherIndividualSuggestions(context, search, Math.max(limit, 20));
    } else {
        return {
            suggestions: [],
            pagination: { page, limit, hasMore: false }
        };
    }

    const merged = uniqueSuggestions([
        ...groupSuggestions.sort((left, right) => left.label.localeCompare(right.label)),
        ...individualSuggestions.sort((left, right) => left.label.localeCompare(right.label))
    ]);

    const start = Math.max(0, (page - 1) * limit);
    const end = start + limit;

    return {
        suggestions: merged.slice(start, end),
        pagination: {
            page,
            limit,
            hasMore: merged.length > end,
            total: merged.length
        }
    };
};

export const previewRecipients = async (req, selection = {}) => {
    const context = await resolveContext(req);
    if (!hasAnyCommunicationAudience(context.access)) {
        return {
            selectedTokens: { parents: [], teachers: [], students: [] },
            blockedTokens: [{ key: 'access', reason: 'No communication audience in your scope' }],
            recipientSummary: {
                students: 0,
                parents: 0,
                teachers: 0,
                duplicatesRemoved: 0,
                invalidExcluded: 0,
                totalResolved: 0
            },
            recipients: [],
            recipientSample: [],
            accessSnapshot: serializeCommunicationAccess(context.access)
        };
    }

    const selectedTokens = {
        parents: normalizeTokenInput(selection.toParents, 'parents'),
        teachers: normalizeTokenInput(selection.toTeachers, 'teachers'),
        students: normalizeTokenInput(selection.toStudents, 'students')
    };

    const allSelected = [
        ...selectedTokens.parents,
        ...selectedTokens.teachers,
        ...selectedTokens.students
    ];

    const parsed = allSelected.map((token) => ({
        ...token,
        parsed: parseTokenKey(token.key)
    }));

    const allowedTokens = [];
    const blockedTokens = [];
    for (const token of parsed) {
        const permission = await canUseToken(context, token.parsed);
        if (!permission.allowed) {
            blockedTokens.push({ key: token.key, reason: permission.reason || 'Token is not allowed' });
            continue;
        }
        allowedTokens.push(token);
    }

    const tokenBuckets = {
        studentClassIds: new Set(),
        studentDepartmentIds: new Set(),
        studentSchoolWide: false,
        studentIds: new Set(),

        parentClassIds: new Set(),
        parentDepartmentIds: new Set(),
        parentSchoolWide: false,
        parentStudentIds: new Set(),

        teacherDepartmentIds: new Set(),
        teacherSchoolWide: false,
        teacherUserIds: new Set(),

        everyoneDepartmentIds: new Set(),
        everyoneSchoolWide: false
    };

    for (const token of allowedTokens) {
        const parsedToken = token.parsed;
        if (!parsedToken) continue;

        if (parsedToken.kind === 'group') {
            if (parsedToken.audience === 'students') {
                if (parsedToken.scope === 'class' || parsedToken.scope === 'class-subject') {
                    tokenBuckets.studentClassIds.add(parsedToken.classId);
                } else if (parsedToken.scope === 'department') {
                    tokenBuckets.studentDepartmentIds.add(parsedToken.departmentId);
                } else if (parsedToken.scope === 'school') {
                    tokenBuckets.studentSchoolWide = true;
                }
            } else if (parsedToken.audience === 'parents') {
                if (parsedToken.scope === 'class' || parsedToken.scope === 'class-subject') {
                    tokenBuckets.parentClassIds.add(parsedToken.classId);
                } else if (parsedToken.scope === 'department') {
                    tokenBuckets.parentDepartmentIds.add(parsedToken.departmentId);
                } else if (parsedToken.scope === 'school') {
                    tokenBuckets.parentSchoolWide = true;
                }
            } else if (parsedToken.audience === 'teachers') {
                if (parsedToken.scope === 'department') {
                    tokenBuckets.teacherDepartmentIds.add(parsedToken.departmentId);
                } else if (parsedToken.scope === 'school') {
                    tokenBuckets.teacherSchoolWide = true;
                }
            } else if (parsedToken.audience === 'everyone') {
                if (parsedToken.scope === 'department') {
                    tokenBuckets.everyoneDepartmentIds.add(parsedToken.departmentId);
                } else if (parsedToken.scope === 'school') {
                    tokenBuckets.everyoneSchoolWide = true;
                }
            }
        } else if (parsedToken.kind === 'individual') {
            if (parsedToken.scope === 'student') {
                tokenBuckets.studentIds.add(parsedToken.studentId);
            } else if (parsedToken.scope === 'parent-student') {
                tokenBuckets.parentStudentIds.add(parsedToken.studentId);
            } else if (parsedToken.scope === 'teacher') {
                tokenBuckets.teacherUserIds.add(parsedToken.teacherUserId);
            }
        }
    }

    for (const departmentId of tokenBuckets.everyoneDepartmentIds) {
        tokenBuckets.studentDepartmentIds.add(departmentId);
        tokenBuckets.parentDepartmentIds.add(departmentId);
        tokenBuckets.teacherDepartmentIds.add(departmentId);
    }
    if (tokenBuckets.everyoneSchoolWide) {
        tokenBuckets.studentSchoolWide = true;
        tokenBuckets.parentSchoolWide = true;
        tokenBuckets.teacherSchoolWide = true;
    }

    const [scopedStudentsForStudents, scopedStudentsForParents, individualStudents, parentStudents, scopedTeachers, individualTeachers] = await Promise.all([
        fetchStudentsForScope({
            context,
            classIds: [...tokenBuckets.studentClassIds],
            departmentIds: [...tokenBuckets.studentDepartmentIds],
            schoolWide: tokenBuckets.studentSchoolWide
        }),
        fetchStudentsForScope({
            context,
            classIds: [...tokenBuckets.parentClassIds],
            departmentIds: [...tokenBuckets.parentDepartmentIds],
            schoolWide: tokenBuckets.parentSchoolWide
        }),
        tokenBuckets.studentIds.size > 0
            ? Student.find({
                _id: { $in: ensureObjectIdArray([...tokenBuckets.studentIds]) },
                ...createBaseStudentFilter(context)
            }).select('_id firstName lastName studentId email studentEmail').lean()
            : [],
        tokenBuckets.parentStudentIds.size > 0
            ? Student.find({
                _id: { $in: ensureObjectIdArray([...tokenBuckets.parentStudentIds]) },
                ...createBaseStudentFilter(context)
            }).select('_id firstName lastName studentId parentInfo').lean()
            : [],
        fetchTeachersForScope({
            context,
            departmentIds: [...tokenBuckets.teacherDepartmentIds],
            schoolWide: tokenBuckets.teacherSchoolWide
        }),
        tokenBuckets.teacherUserIds.size > 0
            ? fetchTeachersForScope({
                context,
                schoolWide: tokenBuckets.teacherSchoolWide,
                departmentIds: [...tokenBuckets.teacherDepartmentIds],
                userIds: [...tokenBuckets.teacherUserIds]
            })
            : []
    ]);

    const rawRecipients = [];

    const studentMap = new Map();
    for (const student of [...scopedStudentsForStudents, ...individualStudents]) {
        studentMap.set(toId(student._id), student);
    }
    for (const student of studentMap.values()) {
        const emails = collectStudentEmails(student);
        const name = fullName(student.firstName, student.lastName) || student.studentId || 'Student';
        addRecipients(rawRecipients, emails.map((email) => ({
            email,
            category: 'students',
            displayName: name
        })));
    }

    const parentStudentMap = new Map();
    for (const student of [...scopedStudentsForParents, ...parentStudents]) {
        parentStudentMap.set(toId(student._id), student);
    }
    for (const student of parentStudentMap.values()) {
        const emails = collectParentEmails(student);
        const studentName = fullName(student.firstName, student.lastName) || student.studentId || 'Student';
        addRecipients(rawRecipients, emails.map((email) => ({
            email,
            category: 'parents',
            displayName: `Parent of ${studentName}`
        })));
    }

    const teacherMap = new Map();
    for (const teacher of [...scopedTeachers, ...individualTeachers]) {
        const teacherUserId = toId(teacher?.user?._id);
        if (!teacherUserId) continue;
        teacherMap.set(teacherUserId, teacher);
    }
    for (const teacher of teacherMap.values()) {
        const email = normalizeEmail(teacher?.user?.email);
        if (!email) continue;
        const name = fullName(teacher.user.firstName, teacher.user.lastName) || email;
        rawRecipients.push({
            email,
            category: 'teachers',
            displayName: name
        });
    }

    const dedupedRecipients = [];
    const seenEmails = new Set();
    let duplicatesRemoved = 0;
    let invalidExcluded = 0;

    for (const recipient of rawRecipients) {
        const normalized = normalizeEmail(recipient.email);
        if (!normalized || !isValidEmail(normalized)) {
            invalidExcluded += 1;
            continue;
        }
        if (seenEmails.has(normalized)) {
            duplicatesRemoved += 1;
            continue;
        }
        seenEmails.add(normalized);
        dedupedRecipients.push({
            ...recipient,
            email: normalized
        });
    }

    const audienceSummary = buildAudienceSummary(dedupedRecipients);

    return {
        selectedTokens,
        blockedTokens,
        recipientSummary: {
            students: audienceSummary.students,
            parents: audienceSummary.parents,
            teachers: audienceSummary.teachers,
            duplicatesRemoved,
            invalidExcluded,
            totalResolved: dedupedRecipients.length
        },
        recipients: dedupedRecipients,
        recipientSample: dedupedRecipients.slice(0, 100),
        accessSnapshot: serializeCommunicationAccess(context.access)
    };
};

export const sendComposedEmail = async ({
    senderUserId,
    senderDisplayName,
    senderEmail,
    subject,
    htmlBody,
    recipients,
    attachments = [],
    attachmentLoader = downloadFile
}) => {
    const normalizedSenderEmail = normalizeEmail(senderEmail);
    if (!isValidEmail(normalizedSenderEmail)) {
        throw new Error('Sender email is not configured for outgoing communication');
    }

    const sanitizedSubject = sanitizeSubject(subject);
    const sanitizedHtml = sanitizeComposerHtml(htmlBody);
    const transportAttachments = await prepareTransportAttachments(attachments, attachmentLoader);
    const safeDisplayName = String(senderDisplayName || '').trim() || normalizedSenderEmail;
    const from = safeDisplayName
        ? `"${safeDisplayName}" <${normalizedSenderEmail}>`
        : normalizedSenderEmail;

    const normalizedRecipients = [...new Set(
        recipients
            .map((recipient) => normalizeEmail(recipient.email))
            .filter((email) => isValidEmail(email))
    )];
    if (normalizedRecipients.length === 0) {
        return {
            status: 'failed',
            totalSent: 0,
            totalFailed: 0,
            batchResults: [],
            subject: sanitizedSubject,
            htmlBody: sanitizedHtml
        };
    }

    if (normalizedRecipients.length > MAX_SEND_RECIPIENTS) {
        throw new Error(`Maximum ${MAX_SEND_RECIPIENTS} recipients allowed per send`);
    }

    const batches = chunkArray(normalizedRecipients, 40);
    const batchResults = [];
    let totalSent = 0;
    let totalFailed = 0;

    for (const batch of batches) {
        try {
            const result = await gmailOAuthService.sendEmail(senderUserId, {
                from,
                to: batch.join(', '),
                subject: sanitizedSubject,
                html: sanitizedHtml,
                attachments: transportAttachments
            });
            batchResults.push({
                success: true,
                count: batch.length,
                recipientSample: batch.slice(0, 5),
                providerMessageId: result?.messageId || null,
                providerThreadId: result?.threadId || null
            });
            totalSent += batch.length;
        } catch (error) {
            // Retry per-recipient to maximize partial delivery in mixed-quality lists.
            for (const recipientEmail of batch) {
                try {
                    const result = await gmailOAuthService.sendEmail(senderUserId, {
                        from,
                        to: recipientEmail,
                        subject: sanitizedSubject,
                        html: sanitizedHtml,
                        attachments: transportAttachments
                    });
                    batchResults.push({
                        success: true,
                        count: 1,
                        recipientSample: [recipientEmail],
                        providerMessageId: result?.messageId || null,
                        providerThreadId: result?.threadId || null
                    });
                    totalSent += 1;
                } catch (recipientError) {
                    batchResults.push({
                        success: false,
                        count: 1,
                        recipientSample: [recipientEmail],
                        error: recipientError?.message || 'Failed to send recipient email'
                    });
                    totalFailed += 1;
                }
            }
        }
    }

    let status = 'sent';
    if (totalSent === 0 && totalFailed > 0) status = 'failed';
    else if (totalSent > 0 && totalFailed > 0) status = 'partial';

    return {
        status,
        totalSent,
        totalFailed,
        batchResults,
        subject: sanitizedSubject,
        htmlBody: sanitizedHtml,
        textBody: stripHtmlToText(sanitizedHtml)
    };
};

export const readSuggestionParams = (req) => ({
    field: String(req.query.field || '').trim().toLowerCase(),
    query: String(req.query.query || req.query.q || '').trim(),
    page: parsePositiveInt(req.query.page, 1, 1000),
    limit: parsePositiveInt(req.query.limit, 20, 100)
});

export const hasValidEmailConnection = (user) => (
    Boolean(user?.gmailTokens?.isActive && normalizeEmail(user?.gmailTokens?.email))
);

export const recipientLimits = {
    MAX_SEND_RECIPIENTS
};
