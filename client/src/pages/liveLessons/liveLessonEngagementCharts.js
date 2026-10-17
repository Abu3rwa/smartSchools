const percentage = (numerator, denominator) => (
  denominator ? Math.round((numerator / denominator) * 100) : 0
);

const getPeriod = (dateValue, granularity, uniqueId) => {
  const date = new Date(dateValue);
  if (granularity === "lesson") {
    return {
      key: String(uniqueId || date.toISOString()),
      date,
    };
  }

  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (granularity === "week") {
    const daysSinceMonday = (start.getUTCDay() + 6) % 7;
    start.setUTCDate(start.getUTCDate() - daysSinceMonday);
    return { key: start.toISOString().slice(0, 10), date: start };
  }
  start.setUTCDate(1);
  return { key: start.toISOString().slice(0, 7), date: start };
};

const periodLabel = (date, granularity, title) => {
  if (granularity === "lesson") {
    return `${title} · ${date.toLocaleDateString()}`;
  }
  if (granularity === "week") {
    return `Week of ${date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}`;
  }
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
};

export const buildClassEngagementChartData = (sessions, granularity) => {
  const buckets = new Map();
  for (const session of sessions) {
    if (!session.date) continue;
    const period = getPeriod(session.date, granularity, session.sessionId);
    if (!buckets.has(period.key)) {
      buckets.set(period.key, {
        ...period,
        title: session.title,
        lessonCount: 0,
        rosterCount: 0,
        joinedCount: 0,
        participatingCount: 0,
        questionOpportunities: 0,
        submittedAnswers: 0,
      });
    }
    const bucket = buckets.get(period.key);
    bucket.lessonCount += 1;
    bucket.rosterCount += session.rosterCount || 0;
    bucket.joinedCount += session.joinedCount || 0;
    bucket.participatingCount += session.participatingCount || 0;
    bucket.questionOpportunities += session.questionOpportunities || 0;
    bucket.submittedAnswers += session.submittedAnswers || 0;
  }

  return [...buckets.values()]
    .sort((a, b) => a.date - b.date)
    .map((bucket) => ({
      ...bucket,
      label: periodLabel(bucket.date, granularity, bucket.title),
      attendanceRate: percentage(bucket.joinedCount, bucket.rosterCount),
      participationRate: percentage(bucket.participatingCount, bucket.rosterCount),
      answerCompletionRate: percentage(bucket.submittedAnswers, bucket.questionOpportunities),
      attendanceNumerator: bucket.joinedCount,
      attendanceDenominator: bucket.rosterCount,
      participationNumerator: bucket.participatingCount,
      participationDenominator: bucket.rosterCount,
      answerCompletionNumerator: bucket.submittedAnswers,
      answerCompletionDenominator: bucket.questionOpportunities,
    }));
};

export const buildStudentEngagementChartData = (studentSessions, granularity) => {
  const buckets = new Map();
  for (const session of studentSessions) {
    if (!session.date) continue;
    const period = getPeriod(session.date, granularity, session.sessionId);
    if (!buckets.has(period.key)) {
      buckets.set(period.key, {
        ...period,
        title: session.title,
        lessonCount: 0,
        joinedCount: 0,
        participationCount: 0,
        questionOpportunities: 0,
        submittedAnswers: 0,
      });
    }
    const bucket = buckets.get(period.key);
    bucket.lessonCount += 1;
    bucket.joinedCount += session.joined ? 1 : 0;
    bucket.participationCount += session.participated ? 1 : 0;
    bucket.questionOpportunities += session.questions || 0;
    bucket.submittedAnswers += session.answers || 0;
  }

  return [...buckets.values()]
    .sort((a, b) => a.date - b.date)
    .map((bucket) => ({
      ...bucket,
      label: periodLabel(bucket.date, granularity, bucket.title),
      attendanceRate: percentage(bucket.joinedCount, bucket.lessonCount),
      participationRate: percentage(bucket.participationCount, bucket.lessonCount),
      answerCompletionRate: percentage(bucket.submittedAnswers, bucket.questionOpportunities),
      attendanceNumerator: bucket.joinedCount,
      attendanceDenominator: bucket.lessonCount,
      participationNumerator: bucket.participationCount,
      participationDenominator: bucket.lessonCount,
      answerCompletionNumerator: bucket.submittedAnswers,
      answerCompletionDenominator: bucket.questionOpportunities,
    }));
};
