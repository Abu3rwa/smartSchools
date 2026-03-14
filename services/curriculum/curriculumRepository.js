import Class from '../../models/Class.js';
import CurriculumImportJob from '../../models/CurriculumImportJob.js';
import CurriculumMap from '../../models/CurriculumMap.js';
import CurriculumSourceDocument from '../../models/CurriculumSourceDocument.js';
import School from '../../models/School.js';
import Subject from '../../models/Subject.js';
import Teacher from '../../models/Teacher.js';
import User from '../../models/User.js';

// eslint-disable-next-line complexity
const extractTeacherScope = (teacher) => {
    const classIds = new Set();
    const subjectIds = new Set();
    const classSubjectKeys = new Set();

    for (const assignment of teacher?.assignedClasses || []) {
        const classId = assignment?.class?._id || assignment?.class;
        const subjectId = assignment?.subject;
        if (classId) classIds.add(String(classId));
        if (subjectId) subjectIds.add(String(subjectId));
        if (classId && subjectId) classSubjectKeys.add(`${String(classId)}:${String(subjectId)}`);
    }

    return {
        departmentId: teacher?.department ? String(teacher.department) : null,
        classIds: [...classIds],
        subjectIds: [...subjectIds],
        classSubjectKeys: [...classSubjectKeys]
    };
};

const getTeacherScope = async ({ schoolId, userId }) => {
    const teacher = await Teacher.findOne({ school: schoolId, user: userId })
        .select('department assignedClasses')
        .populate('assignedClasses.class', 'grade department')
        .lean();
    return extractTeacherScope(teacher);
};

const listCurriculumMaps = async (query, options) => CurriculumMap.find(query)
    .sort({ updatedAt: -1 })
    .skip(options.skip)
    .limit(options.limit)
    .populate('classId', 'name grade section department')
    .populate('subject', 'name code')
    .populate('createdBy', 'firstName lastName role')
    .populate('updatedBy', 'firstName lastName role')
    .lean();

const countCurriculumMaps = async (query) => CurriculumMap.countDocuments(query);

const findCurriculumMapById = async (mapId) => CurriculumMap.findById(mapId)
    .populate('classId', 'name grade section department')
    .populate('subject', 'name code')
    .populate('createdBy', 'firstName lastName role')
    .populate('updatedBy', 'firstName lastName role')
    .populate('workflow.submittedBy', 'firstName lastName role')
    .populate('workflow.reviewedBy', 'firstName lastName role')
    .populate('workflow.approvedBy', 'firstName lastName role')
    .populate('workflow.rejectedBy', 'firstName lastName role')
    .populate('workflow.publishedBy', 'firstName lastName role')
    .populate('reviewComments.createdBy', 'firstName lastName role')
    .populate('workflowHistory.actor', 'firstName lastName role')
    .populate('auditTrail.actor', 'firstName lastName role');

const findCurrentCurriculumMapByScope = async ({ schoolId, academicYear, classId, subjectId }) => CurriculumMap.findOne({
    school: schoolId,
    academicYear,
    classId,
    subject: subjectId,
    isCurrent: true
});

const createCurriculumMap = async (payload) => CurriculumMap.create(payload);
const saveCurriculumMap = async (map) => map.save();
const deleteCurriculumMapById = async (mapId) => CurriculumMap.findByIdAndDelete(mapId);

const clearCurrentMap = async ({ schoolId, academicYear, classId, subjectId }) => CurriculumMap.updateMany(
    { school: schoolId, academicYear, classId, subject: subjectId, isCurrent: true },
    { $set: { isCurrent: false } }
);

const findClassById = async (classId) => Class.findById(classId).select('grade department name section').lean();
const listCurriculumOptionClasses = async ({ schoolId, departmentId = null, classIds = null }) => {
    const query = {
        school: schoolId,
        isActive: true
    };

    if (departmentId) query.department = departmentId;
    if (Array.isArray(classIds)) {
        query._id = { $in: classIds.length > 0 ? classIds : [] };
    }

    return Class.find(query)
        .select('_id name grade section department')
        .sort({ grade: 1, section: 1, name: 1 })
        .lean();
};

const listCurriculumOptionSubjects = async ({ schoolId, subjectIds = null }) => {
    const query = {
        school: schoolId,
        isActive: true
    };

    if (Array.isArray(subjectIds)) {
        query._id = { $in: subjectIds.length > 0 ? subjectIds : [] };
    }

    return Subject.find(query)
        .select('_id name code')
        .sort({ name: 1 })
        .lean();
};
const findSchoolById = async (schoolId) => School.findById(schoolId);

const listApprovers = async ({ schoolId, departmentId, permission }) => {
    const filter = {
        school: schoolId,
        isActive: true,
        $or: [
            { role: 'admin' },
            { role: 'department_principal' },
            { permissions: permission }
        ]
    };
    if (departmentId) {
        filter.$and = [{
            $or: [{ role: 'admin' }, { department: departmentId }, { permissions: permission }]
        }];
    }
    return User.find(filter).select('_id firstName lastName email role').lean();
};

const createCurriculumSourceDocument = async (payload) => CurriculumSourceDocument.create(payload);

const saveCurriculumSourceDocument = async (sourceDoc) => sourceDoc.save();

const findCurriculumSourceDocumentById = async (sourceDocumentId) => CurriculumSourceDocument.findById(sourceDocumentId)
    .populate('uploadedBy', 'firstName lastName role email');

const listCurriculumSourceDocumentsByMap = async ({ schoolId, mapId, limit = 20 }) => CurriculumSourceDocument.find({
    school: schoolId,
    mapId
})
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('uploadedBy', 'firstName lastName role email')
    .lean();

const createCurriculumImportJob = async (payload) => CurriculumImportJob.create(payload);

const saveCurriculumImportJob = async (job) => job.save();

const findCurriculumImportJobById = async (jobId) => CurriculumImportJob.findById(jobId)
    .populate('sourceDocumentId')
    .populate('requestedBy', 'firstName lastName role email')
    .populate('appliedBy', 'firstName lastName role email')
    .populate('tokenUsageRef');

const findCurriculumImportJobByScope = async ({ schoolId, mapId, jobId }) => CurriculumImportJob.findOne({
    _id: jobId,
    school: schoolId,
    mapId
})
    .populate('sourceDocumentId')
    .populate('requestedBy', 'firstName lastName role email')
    .populate('appliedBy', 'firstName lastName role email')
    .populate('tokenUsageRef');

const listCurriculumImportJobsByMap = async ({ schoolId, mapId, limit = 30 }) => CurriculumImportJob.find({
    school: schoolId,
    mapId
})
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('sourceDocumentId')
    .populate('requestedBy', 'firstName lastName role email')
    .populate('appliedBy', 'firstName lastName role email')
    .lean();

const deleteCurriculumImportJobsByMap = async ({ schoolId, mapId }) => CurriculumImportJob.deleteMany({
    school: schoolId,
    mapId
});

const deleteCurriculumSourceDocumentsByMap = async ({ schoolId, mapId }) => CurriculumSourceDocument.deleteMany({
    school: schoolId,
    mapId
});

const claimNextQueuedCurriculumImportJob = async () => CurriculumImportJob.findOneAndUpdate(
    { status: 'queued' },
    {
        $set: {
            status: 'processing',
            stage: 'ingest_source',
            startedAt: new Date(),
            error: ''
        }
    },
    { sort: { createdAt: 1 }, new: true }
);

export const createCurriculumRepository = () => ({
    getTeacherScope,
    listCurriculumMaps,
    countCurriculumMaps,
    findCurriculumMapById,
    findCurrentCurriculumMapByScope,
    createCurriculumMap,
    saveCurriculumMap,
    deleteCurriculumMapById,
    clearCurrentMap,
    findClassById,
    listCurriculumOptionClasses,
    listCurriculumOptionSubjects,
    findSchoolById,
    listApprovers,
    createCurriculumSourceDocument,
    saveCurriculumSourceDocument,
    findCurriculumSourceDocumentById,
    listCurriculumSourceDocumentsByMap,
    createCurriculumImportJob,
    saveCurriculumImportJob,
    findCurriculumImportJobById,
    findCurriculumImportJobByScope,
    listCurriculumImportJobsByMap,
    deleteCurriculumImportJobsByMap,
    deleteCurriculumSourceDocumentsByMap,
    claimNextQueuedCurriculumImportJob
});

export const curriculumRepository = createCurriculumRepository();
