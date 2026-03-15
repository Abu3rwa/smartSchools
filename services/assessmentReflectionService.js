import AssessmentReflection from '../models/AssessmentReflection.js';

const normalizeWeakObjectives = (values = []) => Array.isArray(values)
    ? values.map((item) => ({
        objectiveKey: String(item?.objectiveKey || '').trim(),
        objectiveName: String(item?.objectiveName || '').trim(),
        masteryRate: Number(item?.masteryRate || 0),
        studentsBelowMastery: Number(item?.studentsBelowMastery || 0),
        suggestedAction: String(item?.suggestedAction || 'practice').trim() || 'practice'
    })).filter((item) => item.objectiveKey)
    : [];

const buildPayload = (payload = {}) => ({
    weakObjectives: normalizeWeakObjectives(payload.weakObjectives || []),
    whatWorked: String(payload.whatWorked || '').trim(),
    whatDidNotWork: String(payload.whatDidNotWork || '').trim(),
    reteachPlan: String(payload.reteachPlan || '').trim(),
    notes: String(payload.notes || '').trim()
});

export const createAssessmentReflection = async ({ schoolId, assessmentGroupId, teacherId, payload }) => {
    return AssessmentReflection.create({
        school: schoolId,
        assessmentGroupId,
        teacher: teacherId,
        ...buildPayload(payload)
    });
};

export const getAssessmentReflection = async ({ schoolId, assessmentGroupId, teacherId = null }) => {
    const query = {
        school: schoolId,
        assessmentGroupId
    };
    if (teacherId) query.teacher = teacherId;

    return teacherId
        ? AssessmentReflection.findOne(query).lean()
        : AssessmentReflection.find(query).sort({ updatedAt: -1 }).lean();
};

export const updateAssessmentReflection = async ({ schoolId, assessmentGroupId, teacherId, payload }) => AssessmentReflection.findOneAndUpdate(
    {
        school: schoolId,
        assessmentGroupId,
        teacher: teacherId
    },
    { $set: buildPayload(payload) },
    { new: true, runValidators: true }
).lean();