const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const DIFFICULTY_WEIGHT = {
  easy: 0.6,
  medium: 0.8,
  hard: 1,
};

const recencyScore = (date) => {
  if (!date) return 30;
  const days = (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 1) return 100;
  if (days <= 3) return 80;
  if (days <= 7) return 60;
  if (days <= 14) return 40;
  return 20;
};

const confidencePenalty = (confidenceLevel) => {
  if (!confidenceLevel) return 40;
  if (confidenceLevel === 'low') return 100;
  if (confidenceLevel === 'medium') return 60;
  return 20;
};

const masteryDecayPenalty = (masteryRecord) => {
  if (!masteryRecord?.lastPracticedAt) return 30;
  const days = (Date.now() - new Date(masteryRecord.lastPracticedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (days >= 21) return 100;
  if (days >= 14) return 75;
  if (days >= 7) return 50;
  if (days >= 3) return 30;
  return 10;
};

export function computeReviewPriority({ attempt, masteryRecord, confidenceSignals = {} }) {
  const recency = recencyScore(attempt?.answeredAt || attempt?.createdAt);
  const diff = (DIFFICULTY_WEIGHT[attempt?.difficulty] || 0.7) * 100;
  const confidence = confidencePenalty(
    confidenceSignals?.confidenceLevel || attempt?.feedbackParts?.confidenceLevel
  );
  const decay = masteryDecayPenalty(masteryRecord);

  const weighted =
    recency * 0.35 +
    diff * 0.2 +
    confidence * 0.2 +
    decay * 0.25;

  return Math.round(clamp(weighted, 0, 100));
}

export function computeInterventionRisk({ attempts = [], sessionContext = {}, masteryRecord }) {
  const recent = attempts.slice(0, 5);
  const incorrectStreak = Number(sessionContext?.incorrectStreak || 0);
  const recentAccuracy =
    recent.length > 0
      ? Math.round((recent.filter((a) => a.isCorrect).length / recent.length) * 100)
      : Number(sessionContext?.recentAccuracy || 0);
  const lowConfidenceCount = recent.filter(
    (a) => (a?.feedbackParts?.confidenceLevel || '').toLowerCase() === 'low'
  ).length;
  const repeatedTopicMisses = Array.isArray(sessionContext?.recentMistakes)
    ? sessionContext.recentMistakes.length
    : 0;

  let timeSinceLastSuccessDays = 0;
  const latestCorrect = attempts.find((a) => a.isCorrect && a.answeredAt);
  if (latestCorrect?.answeredAt) {
    timeSinceLastSuccessDays = Math.floor(
      (Date.now() - new Date(latestCorrect.answeredAt).getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  const decayPenalty = masteryDecayPenalty(masteryRecord);

  const riskScore = clamp(
    incorrectStreak * 12 +
      (100 - recentAccuracy) * 0.35 +
      lowConfidenceCount * 8 +
      repeatedTopicMisses * 6 +
      decayPenalty * 0.15 +
      Math.min(timeSinceLastSuccessDays, 30) * 0.8,
    0,
    100
  );

  const riskLevel = riskScore >= 75 ? 'high' : riskScore >= 45 ? 'medium' : 'low';

  const confidenceTrend =
    lowConfidenceCount >= 3 ? 'down' :
      lowConfidenceCount === 0 && recentAccuracy >= 70 ? 'up' : 'flat';

  return {
    riskScore: Math.round(riskScore),
    riskLevel,
    signals: {
      incorrectStreak,
      recentAccuracy,
      confidenceTrend,
      timeSinceLastSuccessDays,
    },
  };
}
