import InterventionCase from '../models/InterventionCase.js';
import PracticeAttempt from '../models/PracticeAttempt.js';
import MasteryRecord from '../models/MasteryRecord.js';
import { computeInterventionRisk } from './reviewScoringService.js';

const INTERVENTION_QUEUE_ENABLED = () => process.env.INTERVENTION_QUEUE_ENABLED !== 'false';

const uniqueStrings = (items = [], limit = 6) => {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const value = String(item || '').trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
};

const buildRecommendedActions = ({ riskLevel, signals }) => {
  const actions = [];
  if (signals.incorrectStreak >= 2) {
    actions.push('Assign a short targeted review task for this standard.');
  }
  if (signals.recentAccuracy < 60) {
    actions.push('Schedule 1:1 reteach on the specific missed concept.');
  }
  if (signals.confidenceTrend === 'down') {
    actions.push('Use confidence-building scaffolded questions before harder items.');
  }
  if (signals.timeSinceLastSuccessDays >= 7) {
    actions.push('Revisit this standard in the next class warm-up.');
  }
  if (riskLevel === 'high') {
    actions.push('Open intervention plan and monitor daily for one week.');
  }
  return uniqueStrings(actions, 5);
};

export async function upsertInterventionCase({ schoolId, studentId, standardId, assignmentId = null, classId = null, subjectId = null, sessionContext = {} }) {
  if (!INTERVENTION_QUEUE_ENABLED()) return null;

  const attempts = await PracticeAttempt.find({
    school: schoolId,
    student: studentId,
    standard: standardId,
    status: 'answered',
  })
    .select('isCorrect answeredAt feedbackParts questionText')
    .sort({ createdAt: -1 })
    .limit(15)
    .lean();

  const masteryRecord = await MasteryRecord.findOne({
    school: schoolId,
    student: studentId,
    standard: standardId,
  })
    .select('isMastered needsReview lastPracticedAt')
    .lean();

  const risk = computeInterventionRisk({ attempts, sessionContext, masteryRecord });

  const recentMistakes = uniqueStrings([
    ...(sessionContext?.recentMistakes || []),
    ...attempts
      .filter((a) => !a.isCorrect)
      .flatMap((a) => a?.feedbackParts?.conceptChecks?.missing || []),
  ], 6);

  const recentTopics = uniqueStrings([
    ...(sessionContext?.recentTopics || []),
    ...attempts.map((a) => a?.feedbackParts?.reviewTag).filter(Boolean),
  ], 6);

  const recommendedActions = buildRecommendedActions({
    riskLevel: risk.riskLevel,
    signals: risk.signals,
  });

  const openStatuses = ['open', 'acknowledged', 'in_progress'];
  const existing = await InterventionCase.findOne({
    school: schoolId,
    student: studentId,
    standard: standardId,
    status: { $in: openStatuses },
  });

  if (existing) {
    existing.riskScore = risk.riskScore;
    existing.riskLevel = risk.riskLevel;
    existing.signals = risk.signals;
    existing.recentMistakes = recentMistakes;
    existing.recentTopics = recentTopics;
    existing.recommendedActions = recommendedActions;
    if (!existing.assignment && assignmentId) existing.assignment = assignmentId;
    if (!existing.class && classId) existing.class = classId;
    if (!existing.subject && subjectId) existing.subject = subjectId;
    existing.timeline.push({
      type: 'upserted',
      at: new Date(),
      by: null,
      note: `Risk refreshed (${risk.riskLevel}, ${risk.riskScore})`,
    });
    await existing.save();
    return existing;
  }

  if (risk.riskScore < 45) {
    return null;
  }

  return InterventionCase.create({
    school: schoolId,
    student: studentId,
    standard: standardId,
    assignment: assignmentId,
    class: classId,
    subject: subjectId,
    status: 'open',
    riskLevel: risk.riskLevel,
    riskScore: risk.riskScore,
    signals: risk.signals,
    recommendedActions,
    recentMistakes,
    recentTopics,
    timeline: [{ type: 'created', at: new Date(), by: null, note: 'Intervention case created from risk signals' }],
  });
}

export async function getTeacherInterventionQueue({ schoolId, classId, subjectId, riskLevel, status = 'open', page = 1, limit = 20 }) {
  if (!INTERVENTION_QUEUE_ENABLED()) return { items: [], pagination: { page: 1, limit: 0, total: 0, pages: 0 } };

  const query = { school: schoolId };

  if (status) {
    if (status === 'open') {
      query.status = { $in: ['open', 'acknowledged', 'in_progress'] };
    } else {
      query.status = status;
    }
  }
  if (riskLevel) query.riskLevel = riskLevel;
  if (classId) query.class = classId;
  if (subjectId) query.subject = subjectId;

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    InterventionCase.find(query)
      .populate('student', 'firstName lastName studentId currentClass')
      .populate('standard', 'code name description')
      .populate('assignment', 'class subject')
      .populate('class', 'name grade section')
      .populate('subject', 'name code')
      .populate('owner', 'firstName lastName')
      .sort({ riskScore: -1, updatedAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    InterventionCase.countDocuments(query),
  ]);

  return {
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit),
    },
  };
}

export async function acknowledgeCase({ caseId, userId }) {
  if (!INTERVENTION_QUEUE_ENABLED()) return null;
  const item = await InterventionCase.findById(caseId);
  if (!item) return null;

  if (['resolved', 'dismissed'].includes(item.status)) return item;

  item.status = 'acknowledged';
  item.owner = userId;
  item.timeline.push({ type: 'acknowledged', at: new Date(), by: userId, note: 'Case acknowledged by teacher/admin' });
  await item.save();
  return item;
}

export async function resolveCase({ caseId, userId, resolutionNote }) {
  if (!INTERVENTION_QUEUE_ENABLED()) return null;
  const item = await InterventionCase.findById(caseId);
  if (!item) return null;

  item.status = 'resolved';
  item.owner = userId;
  item.timeline.push({ type: 'resolved', at: new Date(), by: userId, note: resolutionNote || 'Case resolved' });
  await item.save();
  return item;
}

export async function dismissCase({ caseId, userId, note }) {
  if (!INTERVENTION_QUEUE_ENABLED()) return null;
  const item = await InterventionCase.findById(caseId);
  if (!item) return null;

  item.status = 'dismissed';
  item.owner = userId;
  item.timeline.push({ type: 'dismissed', at: new Date(), by: userId, note: note || 'Case dismissed' });
  await item.save();
  return item;
}
