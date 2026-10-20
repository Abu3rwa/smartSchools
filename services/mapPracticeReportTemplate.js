const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

const formatPeriod = (period) => `${formatDate(period.startDate)} – ${formatDate(period.endDate)}`;
const percent = (value) => value === null || value === undefined ? '—' : `${value}%`;
const metric = (label, value) => `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
const emptyRow = (colspan, text) => `<tr><td colspan="${colspan}" class="empty">${escapeHtml(text)}</td></tr>`;

const wrapSkillName = (value, maxCharacters = 32) => {
  const words = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && `${line} ${word}`.length > maxCharacters) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
};

const renderTrendChart = (attempts) => {
  const scored = attempts.filter((attempt) => attempt.accuracy !== null);
  if (!scored.length) return '<p class="empty">No graded practice results are available for this period.</p>';

  const width = 760;
  const height = 260;
  const left = 48;
  const right = 18;
  const top = 18;
  const bottom = 48;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const points = scored.map((attempt, index) => ({
    x: left + (scored.length === 1 ? plotWidth / 2 : (index / (scored.length - 1)) * plotWidth),
    y: top + ((100 - attempt.accuracy) / 100) * plotHeight,
    attempt
  }));
  const grid = [0, 25, 50, 75, 100].map((value) => {
    const y = top + ((100 - value) / 100) * plotHeight;
    return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="#e2e8f0"/><text x="${left - 8}" y="${y + 4}" text-anchor="end" class="axis">${value}%</text>`;
  }).join('');
  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ');
  const circles = points.map(({ x, y, attempt }) => `<circle cx="${x}" cy="${y}" r="4" fill="#4f46e5"><title>${escapeHtml(formatDate(attempt.submittedAt))}: ${escapeHtml(attempt.accuracy)}% · ${escapeHtml(attempt.setTitle)}</title></circle>`).join('');
  const labelStep = Math.max(1, Math.ceil(points.length / 8));
  const labels = points.map(({ x, attempt }, index) => index % labelStep === 0 || index === points.length - 1
    ? `<text x="${x}" y="${height - 14}" text-anchor="middle" class="axis">${escapeHtml(formatDate(attempt.submittedAt))}</text>`
    : '').join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Practice accuracy by submission date">
    ${grid}<polyline points="${polyline}" fill="none" stroke="#4f46e5" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${circles}${labels}
  </svg><p class="chart-note">${scored.length} graded submission${scored.length === 1 ? '' : 's'}. Percentages compare practice sets and are not a standardized MAP Growth or RIT scale.</p>`;
};

const renderSkillChart = (skills) => {
  if (!skills.length) return '<p class="empty">No skill results are available yet.</p>';
  const width = 760;
  const left = 230;
  let y = 8;
  const rows = skills.map((skill) => {
    const lines = wrapSkillName(skill.name);
    const rowHeight = Math.max(36, lines.length * 13 + 12);
    const barY = y + (rowHeight - 22) / 2;
    const barWidth = Math.max(0, Math.min(100, skill.accuracy)) * 3.2;
    const color = skill.evidence === 'limited' ? '#94a3b8' : skill.accuracy < 60 ? '#dc2626' : skill.accuracy < 80 ? '#f59e0b' : '#16a34a';
    const label = `<text x="${left - 10}" y="${y + (rowHeight - (lines.length - 1) * 13) / 2 + 4}" text-anchor="end" class="skill-label">${lines
      .map((line, index) => `<tspan x="${left - 10}"${index ? ' dy="13"' : ''}>${escapeHtml(line)}</tspan>`)
      .join('')}</text>`;
    const row = `${label}
      <rect x="${left}" y="${barY}" width="320" height="22" rx="5" fill="#eef2f7"/>
      <rect x="${left}" y="${barY}" width="${barWidth}" height="22" rx="5" fill="${color}"/>
      <text x="${left + 330}" y="${y + rowHeight / 2 + 4}" class="axis">${skill.accuracy}% · ${skill.correct}/${skill.graded}${skill.evidence === 'limited' ? ' · limited evidence' : ''}</text>`;
    y += rowHeight;
    return row;
  }).join('');
  const chartHeight = Math.max(72, y + 8);
  return `<svg viewBox="0 0 ${width} ${chartHeight}" role="img" aria-label="Practice accuracy by skill">${rows}</svg>
    <p class="chart-note">At least 3 graded responses are required to interpret a skill band. Counts show correct/graded responses.</p>`;
};

const renderStudentReport = (report) => {
  const { student, metrics, attempts, recentAttempts, skills, interpretations } = report;
  const trend = renderTrendChart(attempts);
  const skillChart = renderSkillChart(skills);
  const rows = recentAttempts.map((attempt) => `<tr>
    <td>${escapeHtml(attempt.setTitle)}</td><td>${escapeHtml(formatDate(attempt.submittedAt))}</td>
    <td>${attempt.graded ? `${attempt.correct}/${attempt.graded}` : '—'}</td><td>${escapeHtml(percent(attempt.accuracy))}</td>
    <td>${escapeHtml(String(attempt.reviewStatus).replace(/_/g, ' '))}</td>
  </tr>`).join('') || emptyRow(5, 'No submitted practice in this reporting period.');
  const notes = interpretations.length ? `<ul>${interpretations.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>` : '<p>There is not enough graded practice data to identify a skill follow-up area.</p>';
  const classLabel = [student.className, student.grade ? `Grade ${student.grade}` : ''].filter(Boolean).join(' · ');
  return `<header><p class="eyebrow">MAP PRACTICE REPORT</p><h1>${escapeHtml(student.name || 'Student')}</h1>
    <p>${escapeHtml(student.studentId)}${classLabel ? ` · ${escapeHtml(classLabel)}` : ''}</p>
    <p>Academic year ${escapeHtml(report.academicYear)} · ${escapeHtml(formatPeriod(report.period))}</p>
    <p>Generated ${escapeHtml(formatDate(report.generatedAt))}</p></header>
    <section><h2>At a glance</h2><div class="metrics">
      ${metric('Submitted practice sets', metrics.submittedSets)}
      ${metric('Accuracy (graded responses)', `${percent(metrics.accuracy)} · ${metrics.correct}/${metrics.graded}`)}
      ${metric('Questions answered', `${metrics.answered} · ${metrics.graded} graded`)}
      ${metric('Responses awaiting review', metrics.pendingReviews)}
      ${metric('Most recent practice', formatDate(metrics.lastPractice))}
    </div></section>
    <section><h2>Practice accuracy over time</h2>${trend}</section>
    <section><h2>Practice accuracy by skill</h2>${skillChart}</section>
    <section><h2>Recent practice</h2><table><thead><tr><th>Set</th><th>Submitted</th><th>Correct / graded</th><th>Accuracy</th><th>Review status</th></tr></thead><tbody>${rows}</tbody></table></section>
    <section class="interpretation"><h2>Teacher follow-up notes</h2>${notes}</section>
    <footer>Practice accuracy describes performance on these practice questions only. It is not a MAP Growth assessment result, RIT score, or measure of academic growth. Ungraded responses are excluded from accuracy.</footer>`;
};

const renderClassReport = (report) => {
  const { class: classInfo, metrics, students, skills } = report;
  const skillChart = renderSkillChart(skills);
  const studentRows = students.map((student) => `<tr>
    <td>${escapeHtml(student.name)}<small>${escapeHtml(student.studentId)}</small></td>
    <td>${student.submittedSets}</td><td>${escapeHtml(percent(student.accuracy))}${student.accuracy === null ? '' : ` · ${student.graded} graded`}</td>
    <td>${escapeHtml(formatDate(student.lastPractice))}</td><td>${student.pendingReviews}</td>
    <td>${escapeHtml(student.status.replace(/([A-Z])/g, ' $1').toLowerCase())}</td>
  </tr>`).join('') || emptyRow(6, 'No students are enrolled in this class for this academic year.');
  const heading = `${classInfo.name || 'Class'}${classInfo.section ? ` · ${classInfo.section}` : ''}`;
  return `<header><p class="eyebrow">MAP PRACTICE CLASS SUMMARY</p><h1>${escapeHtml(heading)}</h1>
    <p>${classInfo.grade ? `Grade ${escapeHtml(classInfo.grade)} · ` : ''}Academic year ${escapeHtml(report.academicYear)}</p>
    <p>${escapeHtml(formatPeriod(report.period))} · Generated ${escapeHtml(formatDate(report.generatedAt))}</p></header>
    <section><h2>Class overview</h2><div class="metrics">
      ${metric('Students', metrics.roster)}
      ${metric('With assigned practice', metrics.withAssignments)}
      ${metric('Submitted practice', `${metrics.submittedStudents}/${metrics.roster} students · ${metrics.submittedSets} sets`)}
      ${metric('Average student accuracy', metrics.averageAccuracy === null ? '—' : `${metrics.averageAccuracy}% · ${metrics.studentsWithAccuracy} students`)}
      ${metric('Responses awaiting review', metrics.pendingReviews)}
    </div><p class="chart-note">Average accuracy is the mean of individual student accuracy percentages; students without graded answers are excluded.</p></section>
    <section><h2>Class skill summary</h2>${skillChart}<p class="chart-note">Only skills with at least 3 graded responses across the class are shown. This is a combined descriptive summary, not a ranking.</p></section>
    <section><h2>Student follow-up</h2><table><thead><tr><th>Student</th><th>Sets submitted</th><th>Accuracy / evidence</th><th>Last practice</th><th>Pending review</th><th>Status</th></tr></thead><tbody>${studentRows}</tbody></table></section>
    <footer>Practice accuracy describes performance on these practice questions only. It is not a MAP Growth assessment result, RIT score, or measure of academic growth. Ungraded responses are excluded from accuracy. Students are listed alphabetically, not ranked.</footer>`;
};

export const buildMapPracticeReportHtml = (report) => {
  const content = report.type === 'class' ? renderClassReport(report) : renderStudentReport(report);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{font:10pt Arial,sans-serif;color:#203746;margin:0}
    header{padding:0 0 15px;border-bottom:2px solid #0d9488;margin-bottom:16px}
    h1{font-size:23pt;margin:5px 0;color:#173b49}h2{font-size:14pt;margin:18px 0 9px;color:#173b49}
    p{margin:5px 0;color:#61727a}.eyebrow{font-size:8pt;letter-spacing:2px;font-weight:bold;color:#0d9488}
    .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px;margin:10px 0 18px}
    .metric{border:1px solid #dce8e5;border-radius:7px;padding:9px;break-inside:avoid}
    .metric span{display:block;font-size:8pt;color:#63757d;margin-bottom:5px}.metric strong{font-size:12pt;color:#176c68}
    section{margin:15px 0;break-inside:avoid}svg{display:block;width:100%;height:auto}
    .axis{font:10px Arial,sans-serif;fill:#52636d}.skill-label{font:11px Arial,sans-serif;fill:#203746}
    .chart-note{font-size:8.5pt;color:#61727a;margin:6px 0 12px}
    table{width:100%;border-collapse:collapse;margin:8px 0 14px;table-layout:fixed}
    th,td{border:1px solid #d8e0e1;padding:6px;text-align:left;vertical-align:top;overflow-wrap:anywhere}
    th{background:#eff5f3;color:#405b63;font-size:8pt}td{font-size:8.5pt}td small{display:block;color:#61727a}
    .empty{padding:12px;color:#61727a;text-align:center}footer{border-top:1px solid #d8e0e1;padding-top:9px;margin-top:20px;font-size:8pt;color:#61727a}
    .interpretation{background:#f4f8f7;padding:10px 14px;border-radius:7px}
    @page{size:A4;margin:14mm}
  </style></head><body>${content}</body></html>`;
};
