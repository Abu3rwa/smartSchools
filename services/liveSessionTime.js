export const resumeLiveSessionPause = (session, at = new Date()) => {
  if (!session.paused) return;
  const pausedAt = session.pausedAt ? new Date(session.pausedAt).getTime() : NaN;
  const resumedAt = new Date(at).getTime();
  if (Number.isFinite(pausedAt) && Number.isFinite(resumedAt)) {
    session.totalPausedMs = Math.max(0, Number(session.totalPausedMs) || 0)
      + Math.max(0, resumedAt - pausedAt);
  }
  session.paused = false;
  session.pausedAt = null;
};

export const getSessionPauseAccounting = (events = []) => {
  let pausedAt = null;
  let totalPausedMs = 0;
  for (const event of events) {
    const eventAt = new Date(event.at).getTime();
    if (!Number.isFinite(eventAt)) continue;
    if (event.type === "session:paused") {
      pausedAt = eventAt;
    } else if (event.type === "session:resumed" || event.type === "session:ended") {
      if (pausedAt !== null) totalPausedMs += Math.max(0, eventAt - pausedAt);
      pausedAt = null;
    }
  }
  return {
    totalPausedMs,
    pausedAt: pausedAt === null ? null : new Date(pausedAt),
  };
};

export const activeLiveSessionDurationMs = (session, now = new Date()) => {
  if (!session.startedAt) return 0;
  const startedAt = new Date(session.startedAt).getTime();
  const endedAt = new Date(session.endedAt || now).getTime();
  const pausedAt = session.paused && session.pausedAt
    ? new Date(session.pausedAt).getTime()
    : NaN;
  const currentPauseMs = Number.isFinite(pausedAt)
    ? Math.max(0, endedAt - pausedAt)
    : 0;
  const totalPausedMs = Math.max(0, Number(session.totalPausedMs) || 0) + currentPauseMs;
  return Math.max(0, endedAt - startedAt - totalPausedMs);
};
