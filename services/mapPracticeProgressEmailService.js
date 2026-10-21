import {
  COLORS,
  TONES,
  block,
  button,
  escapeHtml,
  noteBlock,
  paragraph,
  sanitizeSpellingEmailHtml,
  sectionTitle,
  statTiles,
  wordChips,
  wrapSpellingEmail,
} from '../helpers/spellingEmailLayout.js';

const PRODUCTION_APP_URL = 'https://smile3-8c8c5.web.app';

const hasResponse = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasResponse);
  if (typeof value === 'object') return Object.values(value).some(hasResponse);
  return true;
};

const getId = (value) => String(value?._id || value || '');

const STATUS_STYLES = {
  completed: { label: 'Completed', action: 'Review results', tone: TONES.success, bar: TONES.success.strong },
  in_progress: { label: 'In progress', action: 'Continue practice', tone: TONES.warning, bar: TONES.warning.strong },
  not_started: { label: 'Not started', action: 'Start practice', tone: TONES.neutral, bar: COLORS.faint },
};

const percent = (value, total) => (total > 0 ? Math.round((Math.min(value, total) / total) * 100) : 0);

const formatDate = (date) => new Date(date).toLocaleDateString('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

const getStatus = (row) => {
  if (row.completed) return 'completed';
  return row.answered > 0 ? 'in_progress' : 'not_started';
};

const progressBar = (pct, color) => {
  const cell = 'height:8px;font-size:0;line-height:0';
  const filled = pct > 0 ? `<td width="${pct}%" bgcolor="${color}" style="background:${color};${cell}">&nbsp;</td>` : '';
  const empty = pct < 100 ? `<td bgcolor="${COLORS.line}" style="background:${COLORS.line};${cell}">&nbsp;</td>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-radius:999px;overflow:hidden"><tr>${filled}${empty}</tr></table>`;
};

const renderCard = (row) => {
  const status = getStatus(row);
  const style = STATUS_STYLES[status];
  const pct = row.completed ? percent(row.score, row.maxScore) : percent(row.answered, row.total);
  const metric = row.completed
    ? `Score ${row.score} of ${row.maxScore}`
    : `${row.answered} of ${row.total} questions answered`;
  const skills = row.skills.length
    ? `<div style="margin-top:10px">${wordChips(row.skills, TONES.accent)}</div>`
    : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 0 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${COLORS.line};border-radius:12px">
<tr><td style="padding:20px 22px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="font-size:16px;line-height:1.4;font-weight:700;color:${COLORS.ink}">${escapeHtml(row.title)}</td>
    <td align="right" style="padding-left:12px;white-space:nowrap"><span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${style.tone.bg};border:1px solid ${style.tone.border};font-size:12px;font-weight:700;color:${style.tone.text}">${style.label}</span></td>
  </tr></table>
  ${skills}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 8px"><tr>
    <td style="font-size:13px;color:${COLORS.muted}">${escapeHtml(metric)}</td>
    <td align="right" style="font-size:13px;font-weight:700;color:${style.tone.strong}">${pct}%</td>
  </tr></table>
  ${progressBar(pct, style.bar)}
  <div style="margin-top:18px">${button(row.url, style.action)}</div>
</td></tr>
</table>
</td></tr></table>`;
};

export const buildMapPracticeProgressEmail = ({
  student,
  assignments = [],
  attempts = [],
  skillsBySet = new Map(),
  generatedAt = new Date(),
}) => {
  const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Student';
  const attemptBySet = new Map(attempts.map((attempt) => [getId(attempt.set), attempt]));
  const rows = assignments
    .filter((assignment) => assignment.set && typeof assignment.set === 'object')
    .map((assignment) => {
      const set = assignment.set;
      const attempt = attemptBySet.get(getId(set));
      const total = Math.max(0, Number(set.questionCount) || 0);
      const answers = Array.isArray(attempt?.answers) ? attempt.answers : [];
      const answered = Math.min(total, new Set(
        answers
          .filter((answer) => hasResponse(answer.response))
          .map((answer) => getId(answer.question || answer.questionId))
      ).size);
      const completed = Boolean(attempt?.submittedAt)
        && ['submitted', 'reviewed'].includes(attempt.status);
      const destination = completed && attempt?._id
        ? `?attemptId=${encodeURIComponent(String(attempt._id))}`
        : `?assignmentId=${encodeURIComponent(String(assignment._id))}`;
      const setSkills = skillsBySet.get(getId(set)) || [];
      return {
        title: String(set.title || 'MAP Practice set'),
        skills: [...new Set(setSkills.map((skill) => String(skill || '').trim()).filter(Boolean))],
        answered,
        total,
        completed,
        score: Number(attempt?.score) || 0,
        maxScore: Number(attempt?.maxScore) || 0,
        url: `${PRODUCTION_APP_URL}/map-test-prep/student${destination}`,
      };
    });

  const completedCount = rows.filter((row) => row.completed).length;
  const progressCount = rows.length - completedCount;
  const scoredRows = rows.filter((row) => row.completed && row.maxScore > 0);
  const averageScore = scoredRows.length
    ? percent(
      scoredRows.reduce((sum, row) => sum + row.score, 0),
      scoredRows.reduce((sum, row) => sum + row.maxScore, 0)
    )
    : null;
  const reportDate = formatDate(generatedAt);
  const safeName = studentName.replace(/[\r\n]+/g, ' ').slice(0, 100);
  const subject = `MAP Prep progress update: ${safeName} (${completedCount} of ${rows.length} sets completed)`;
  const summaryLine = [
    `${completedCount} of ${rows.length} skill sets completed`,
    `${progressCount} remaining`,
    averageScore === null ? null : `average score ${averageScore}%`,
  ].filter(Boolean).join(' · ');

  const text = [
    `MAP TEST PREP — PROGRESS REPORT`,
    `${safeName} · ${reportDate}`,
    ``,
    `Hello,`,
    ``,
    `Here is a snapshot of ${safeName}'s MAP Test Prep practice.`,
    ``,
    `Summary: ${summaryLine}`,
    ``,
    ...rows.flatMap((row, index) => {
      const status = getStatus(row);
      return [
        `${index + 1}. ${row.title} — ${STATUS_STYLES[status].label}`,
        row.skills.length ? `   Skills: ${row.skills.join(', ')}` : null,
        row.completed
          ? `   Score: ${row.score} of ${row.maxScore} (${percent(row.score, row.maxScore)}%)`
          : `   Progress: ${row.answered} of ${row.total} questions answered`,
        `   ${STATUS_STYLES[status].action}: ${row.url}`,
        ``,
      ].filter((line) => line !== null);
    }),
    `Privacy note: please sign in with ${safeName}'s MAP Prep account before opening a skill set.`,
    ``,
    `Shared by ${safeName}'s teacher via MAP Test Prep.`,
  ].join('\n');

  const name = escapeHtml(studentName);
  const stats = statTiles([
    { value: `${completedCount} / ${rows.length}`, label: 'Sets completed', tone: TONES.accent },
    { value: String(progressCount), label: 'Remaining', tone: TONES.neutral },
    { value: averageScore === null ? '—' : `${averageScore}%`, label: 'Average score', tone: averageScore === null ? TONES.neutral : TONES.success },
  ]);

  const bodyHtml = [
    paragraph(`Hello, here is a snapshot of <strong>${name}</strong>'s MAP Test Prep practice.`),
    sectionTitle('At a glance'),
    stats,
    sectionTitle('Assigned skill sets', 'Completed sets show the final score; sets in progress show how many questions have been answered so far.'),
    rows.length ? block(rows.map(renderCard).join(''), 8) : paragraph('No skill sets are currently assigned.'),
    noteBlock(`<strong style="color:${COLORS.ink}">Privacy note:</strong> please sign in with ${name}'s MAP Prep account before opening a skill set.`, TONES.accent),
  ].join('');

  const html = sanitizeSpellingEmailHtml(wrapSpellingEmail({
    preheader: `${studentName} has completed ${completedCount} of ${rows.length} assigned MAP Prep skill sets.`,
    eyebrow: 'MAP Test Prep · Progress report',
    title: studentName,
    subtitle: `Practice summary as of ${reportDate}`,
    bodyHtml,
    footer: `Shared by ${studentName}'s teacher via MAP Test Prep.`,
  }));

  return { subject, text, html, rows, completedCount, progressCount };
};

export default { buildMapPracticeProgressEmail };
