export const buildCopiedGoal = ({ sourceGoal, destinationRecordId, copyDueDates, copyOperationId, actorId }) => ({
    school: sourceGoal.school,
    plpRecord: destinationRecordId,
    goalType: sourceGoal.goalType,
    title: sourceGoal.title,
    description: sourceGoal.description || '',
    linkedTraitCodes: [...(sourceGoal.linkedTraitCodes || [])],
    linkedSubjectId: sourceGoal.linkedSubjectId || null,
    linkedStandardIds: [...(sourceGoal.linkedStandardIds || [])],
    baselineNote: sourceGoal.baselineNote || '',
    successCriteria: sourceGoal.successCriteria || '',
    teacherProgressNote: '',
    targetDate: copyDueDates ? sourceGoal.targetDate || null : null,
    checkInDate: copyDueDates ? sourceGoal.checkInDate || null : null,
    milestones: (sourceGoal.milestones || []).map((milestone) => ({
        title: milestone.title,
        targetDate: copyDueDates ? milestone.targetDate || null : null,
        status: 'pending',
        completedAt: null,
    })),
    status: 'active',
    aiSuggested: Boolean(sourceGoal.aiSuggested),
    copyOperationId,
    createdBy: actorId,
    updatedBy: actorId,
});

export const buildCopiedTask = ({ sourceTask, destinationRecord, goalId, actorId, copyDueDates }) => ({
    school: sourceTask.school,
    plpGoal: goalId,
    plpRecord: destinationRecord._id,
    student: destinationRecord.student,
    assignedByTeacher: actorId,
    title: sourceTask.title,
    instructions: sourceTask.instructions || '',
    dueDate: copyDueDates ? sourceTask.dueDate || null : null,
    status: 'assigned',
    studentCompletionNote: '',
    studentComment: '',
    teacherFeedback: '',
    teacherFollowUpAction: '',
    completionEvidenceLinks: [],
    notifiedAt: null,
    notificationStatus: 'pending',
    completedAt: null,
    createdBy: actorId,
    updatedBy: actorId,
});

export const normalizeDestinationRecordIds = (ids = []) =>
    [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];

export const isCompatibleDestinationRecord = (source, destination) => {
    const samePeriod = source.cycle
        ? String(destination.cycle || '') === String(source.cycle)
        : !destination.cycle && Number(destination.month) === Number(source.month);
    return String(destination.school) === String(source.school)
        && String(destination.class) === String(source.class)
        && destination.academicYear === source.academicYear
        && samePeriod
        && String(destination.student) !== String(source.student);
};
