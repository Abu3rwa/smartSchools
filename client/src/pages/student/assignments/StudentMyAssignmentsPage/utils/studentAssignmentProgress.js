// One source of truth for what a student assignment card says and where its
// action goes. The server supplies `studentProgress`; this module only maps that
// state onto a label key, an action and a destination.

const PRACTICE_STATES = new Set([
  'not_started',
  'in_progress',
  'mastered',
  'needs_review',
  'completed',
]);

const ASSESSMENT_STATES = new Set(['awaiting_release', 'released']);

export const getAssignmentFeedType = (assignment = {}) => {
  const explicit = String(assignment.feedType || '').toLowerCase();
  if (explicit) return explicit;
  if (assignment.googleForm) return 'google_form';
  const key = String(assignment.assignmentType?.key || '').toLowerCase();
  if (key === 'grammar_test') return 'grammar_test';
  if (['quiz', 'test', 'exam'].includes(key)) return 'assessment';
  return key || 'assignment';
};

const practiceSessionType = (assignment = {}) =>
  String(assignment.practiceConfig?.sessionType || '').toLowerCase();

export const isAssessmentAssignment = (assignment = {}) => {
  const feedType = getAssignmentFeedType(assignment);
  if (feedType === 'assessment') return true;
  if (practiceSessionType(assignment) === 'assessment') return true;
  const state = String(assignment.studentProgress?.state || '');
  return feedType === 'grammar_test' && ASSESSMENT_STATES.has(state);
};

const fallbackState = (assignment = {}) => {
  const status = String(assignment.status || '').toLowerCase();
  if (status === 'closed' || status === 'archived') return 'closed';
  return null;
};

export const deriveStudentAssignmentCard = (assignment = {}) => {
  const progress = assignment.studentProgress || null;
  const state = String(progress?.state || fallbackState(assignment) || '');
  const id = assignment.id || assignment._id;
  const practiceId = assignment.practiceAssignmentId;
  const feedType = getAssignmentFeedType(assignment);
  const assessment = isAssessmentAssignment(assignment);

  const detailDestination = id ? `/portal/my-assignments/${id}` : '/portal/my-assignments';
  const practiceDestination = practiceId ? `/portal/practice/${practiceId}` : detailDestination;
  const historyDestination = practiceId
    ? `/portal/practice/${practiceId}/history`
    : detailDestination;
  const resultsDestination = practiceId
    ? `/portal/my-assignments/${practiceId}/results`
    : detailDestination;

  const withProgress = (result) => ({
    state,
    statusKey: state ? `student.status.${state}` : null,
    progressPercent: resolveProgressPercent(assignment, progress),
    sync: resolveSyncMeta(progress),
    ...result,
  });

  if (state === 'excused') {
    return withProgress({ actionKey: null, actionType: 'none', destination: detailDestination });
  }
  if (state === 'closed') {
    return withProgress({ actionKey: 'student.actions.view', actionType: 'detail', destination: detailDestination });
  }

  if (feedType === 'google_form') {
    if (!state || state === 'not_started') {
      const responderUri = assignment.googleForm?.responderUri;
      return withProgress({
        actionKey: responderUri ? 'student.actions.open_form' : 'student.actions.view',
        actionType: responderUri ? 'external' : 'detail',
        destination: responderUri || detailDestination,
      });
    }
    if (state === 'graded') {
      return withProgress({
        actionKey: 'student.actions.view_results',
        actionType: 'detail',
        destination: detailDestination,
      });
    }
    return withProgress({
      actionKey: 'student.actions.view_submission',
      actionType: 'detail',
      destination: detailDestination,
    });
  }

  if (assessment) {
    if (state === 'released') {
      return withProgress({
        actionKey: 'student.actions.view_results',
        actionType: 'results',
        destination: resultsDestination,
      });
    }
    if (state === 'awaiting_release') {
      return withProgress({
        actionKey: 'student.actions.view',
        actionType: 'detail',
        destination: detailDestination,
      });
    }
    if (state === 'in_progress') {
      return withProgress({
        actionKey: 'student.actions.continue',
        actionType: 'practice',
        destination: practiceDestination,
      });
    }
    return withProgress({
      actionKey: 'student.actions.start_assessment',
      actionType: 'practice',
      destination: practiceDestination,
    });
  }

  if (PRACTICE_STATES.has(state) || (practiceId && !state)) {
    if (state === 'mastered' || state === 'completed') {
      return withProgress({
        actionKey: 'student.actions.view_result',
        actionType: 'history',
        destination: historyDestination,
      });
    }
    if (state === 'needs_review') {
      return withProgress({
        actionKey: 'student.actions.review',
        actionType: 'practice',
        destination: practiceDestination,
      });
    }
    if (state === 'in_progress') {
      return withProgress({
        actionKey: 'student.actions.continue',
        actionType: 'practice',
        destination: practiceDestination,
      });
    }
    return withProgress({
      actionKey: 'student.actions.start',
      actionType: 'practice',
      destination: practiceDestination,
    });
  }

  if (state === 'completed' || state === 'graded') {
    return withProgress({
      actionKey: 'student.actions.view_results',
      actionType: 'detail',
      destination: detailDestination,
    });
  }

  return withProgress({
    actionKey: practiceId ? 'student.actions.start' : 'student.actions.view',
    actionType: practiceId ? 'practice' : 'detail',
    destination: practiceId ? practiceDestination : detailDestination,
  });
};

export const resolveProgressPercent = (assignment = {}, progress = null) => {
  const p = progress || assignment.studentProgress;
  if (!p) return null;
  if (Number.isFinite(p.masteryPercent)) return Math.max(0, Math.min(100, p.masteryPercent));
  if (Number.isFinite(p.score) && Number.isFinite(p.maxScore) && p.maxScore > 0) {
    return Math.max(0, Math.min(100, Math.round((p.score / p.maxScore) * 100)));
  }
  const answered = Number(p.answeredCount || 0);
  const limit = Number(p.questionLimit || 0);
  if (limit > 0) return Math.max(0, Math.min(100, Math.round((answered / limit) * 100)));
  return null;
};

const resolveSyncMeta = (progress) => {
  if (!progress?.syncStatus) return null;
  if (progress.syncStatus === 'failed') return { key: 'student.sync.sync_failed' };
  if (progress.syncStatus === 'awaiting') return { key: 'student.sync.awaiting_sync' };
  if (progress.syncStatus === 'synced' && progress.lastSyncedAt) {
    return { key: 'student.sync.last_synced', time: progress.lastSyncedAt };
  }
  return null;
};

