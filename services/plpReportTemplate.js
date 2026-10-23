const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
}[character]));

const MAX_OBSERVATION_ROWS = 40;

const multiline = (value) => (value ? String(value).split('\n').map((line) => `<p>${escapeHtml(line)}</p>`).join('') : '');

const chip = (text, tone = '') => `<span class="chip${tone ? ` ${tone}` : ''}">${escapeHtml(text)}</span>`;

const bar = (label, value, maxValue, color = '#2f9e6f') => {
    const width = maxValue > 0 ? Math.max(2, Math.round((value / maxValue) * 300)) : 0;
    return `<div class="bar-row"><span class="bar-label">${escapeHtml(label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${width}px;background:${color}"></span></span>
      <span class="bar-value">${escapeHtml(value)}</span></div>`;
};

const renderHeader = (model) => {
    const { student, period } = model;
    return `<header>
      <p class="eyebrow">${escapeHtml(model.schoolName)} · ${escapeHtml(model.reportTitle)}</p>
      <h1>${escapeHtml(student.name)}</h1>
      <p class="meta">${escapeHtml(student.studentId)}${student.classLabel ? ` · ${escapeHtml(student.classLabel)}` : ''} · Form teacher: ${escapeHtml(student.teacher)}</p>
      <p class="meta">${escapeHtml(period.round)} · Academic year ${escapeHtml(period.academicYear)} · Theme: ${escapeHtml(period.theme)} · Generated ${escapeHtml(new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(model.generatedAt))}</p>
      <div class="chips">
        ${chip(period.level, 'is-level')}${chip(period.status)}${chip(period.award, period.awardDecision === 'selected' ? 'is-award' : '')}
      </div>
      ${period.awardReason ? `<p class="kv"><strong>Award decision note:</strong> ${escapeHtml(period.awardReason)}</p>` : ''}
    </header>`;
};

const renderMetrics = (model) => `<section><h2>At a glance</h2><div class="metrics">
    ${model.metrics.map((metric) => `<div class="metric"><span>${escapeHtml(metric.label)}</span><strong>${escapeHtml(metric.value)}</strong></div>`).join('')}
  </div>${model.counters.overdueTasks ? `<p class="note">${model.counters.overdueTasks} task${model.counters.overdueTasks === 1 ? ' is' : 's are'} past the due date.</p>` : ''}</section>`;

const renderTraits = (model) => {
    if (!model.traitTally.length) {
        return '<section><h2>Character strengths noticed</h2><p class="empty">No positive observations have been recorded for this round yet.</p></section>';
    }
    const maxValue = Math.max(...model.traitTally.map((row) => row.count));
    return `<section><h2>Character strengths noticed</h2>
    <p class="note">Each entry is a positive observation saved by a teacher during this round.</p>
    ${model.traitTally.map((row) => bar(row.trait, row.count, maxValue)).join('')}</section>`;
};

const renderScores = (model) => {
    if (!model.scores.length) {
        return '<section><h2>Trait scores</h2><p class="empty">No trait scores have been saved for this round.</p></section>';
    }
    return `<section><h2>Trait scores</h2><p class="note">Scored from 0 to 5 by the PLP teacher after reviewing the round's evidence.</p>
    ${model.scores.map((row) => bar(row.trait, row.score, 5, '#4a7bd0')).join('')}</section>`;
};

const renderPractice = (goal) => {
    if (!goal.practice.length) return '';
    return `<div class="practice"><strong>Linked practice</strong><ul>${goal.practice.map((item) => `<li>${escapeHtml(item.label)}${item.detail ? ` <em>· ${escapeHtml(item.detail)}</em>` : ''} <span class="tag">${escapeHtml(item.kind)}</span></li>`).join('')}</ul></div>`;
};

const renderTaskTable = (tasks, emptyText) => {
    if (!tasks.length) return `<p class="empty small">${escapeHtml(emptyText)}</p>`;
    return `<table><thead><tr><th>Task</th><th>Status</th><th>Due</th><th>Teacher feedback</th></tr></thead><tbody>
      ${tasks.map((task) => `<tr class="task-row"><td>${escapeHtml(task.title)}${task.instructions ? `<small>${escapeHtml(task.instructions)}</small>` : ''}${task.studentNote ? `<small>Student note: ${escapeHtml(task.studentNote)}</small>` : ''}</td>
        <td>${escapeHtml(task.status)}${task.isOverdue ? '<small class="overdue">Past due</small>' : ''}</td>
        <td>${escapeHtml(task.dueDate || 'No due date')}</td>
        <td>${task.feedback ? multiline(task.feedback) : '<span class="muted">No feedback yet</span>'}</td></tr>`).join('')}
    </tbody></table>`;
};

const renderGoals = (model) => {
    if (!model.goals.length && !model.unassignedTasks.length) {
        return '<section><h2>Goals and tasks</h2><p class="empty">No goals or tasks have been recorded for this round.</p></section>';
    }
    const cards = model.goals.map((goal) => `<article class="goal">
      <div class="goal-head"><h3>${escapeHtml(goal.title)}</h3><div class="chips">${chip(goal.type)}${chip(goal.status, 'is-level')}</div></div>
      ${goal.description ? `<p>${escapeHtml(goal.description)}</p>` : ''}
      ${goal.baseline ? `<p class="kv"><strong>Where the student started:</strong> ${escapeHtml(goal.baseline)}</p>` : ''}
      ${goal.successCriteria ? `<p class="kv"><strong>What success looks like:</strong> ${escapeHtml(goal.successCriteria)}</p>` : ''}
      <p class="kv"><strong>Target:</strong> ${escapeHtml(goal.targetDate || 'Not set')} · <strong>Check-in:</strong> ${escapeHtml(goal.checkInDate || 'Not set')}</p>
      ${goal.milestones.length ? `<ul class="milestones">${goal.milestones.map((milestone) => `<li>${escapeHtml(milestone.title)} ${chip(milestone.status)}${milestone.targetDate ? `<span class="muted"> · due ${escapeHtml(milestone.targetDate)}</span>` : ''}</li>`).join('')}</ul>` : ''}
      ${goal.teacherNote ? `<p class="teacher-note"><strong>Teacher progress note:</strong> ${escapeHtml(goal.teacherNote)}</p>` : ''}
      ${goal.review ? `<p class="kv"><strong>Last review:</strong> ${escapeHtml(goal.review)}${goal.reviewNote ? ` — ${escapeHtml(goal.reviewNote)}` : ''}</p>` : ''}
      ${renderPractice(goal)}
      ${renderTaskTable(goal.tasks, 'No tasks linked to this goal yet.')}
    </article>`).join('');
    const unassigned = model.unassignedTasks.length
        ? `<article class="goal"><div class="goal-head"><h3>Tasks without a goal</h3></div>${renderTaskTable(model.unassignedTasks, '')}</article>`
        : '';
    return `<section><h2>Goals and tasks</h2>${cards}${unassigned}</section>`;
};

const renderObservations = (model) => {
    if (!model.observations.length) {
        return '<section><h2>Observation log</h2><p class="empty">Nothing has been recorded for this student yet.</p></section>';
    }
    const shown = model.observations.slice(0, MAX_OBSERVATION_ROWS);
    const omitted = model.observations.length - shown.length;
    return `<section><h2>Observation log</h2>
    <table class="log"><thead><tr><th>Date</th><th>Trait</th><th>Type</th><th>What was seen</th><th>Recorded by</th></tr></thead><tbody>
      ${shown.map((row) => `<tr><td>${escapeHtml(row.date)}</td><td>${escapeHtml(row.trait)}</td>
        <td>${escapeHtml(row.type)}${row.needsReview ? '<small class="overdue">Needs review</small>' : ''}</td>
        <td>${escapeHtml(row.note)}</td><td>${escapeHtml(row.teacher)}</td></tr>`).join('')}
    </tbody></table>
    ${omitted > 0 ? `<p class="note">${omitted} earlier entr${omitted === 1 ? 'y is' : 'ies are'} not printed here; the full log stays in the PLP record.</p>` : ''}</section>`;
};

export const buildPlpReportHtml = (model) => `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{font:10pt Arial,sans-serif;color:#22333b;margin:0}
    header{padding:0 0 14px;border-bottom:3px solid #2f9e6f;margin-bottom:16px}
    .eyebrow{font-size:8pt;letter-spacing:1.6px;font-weight:bold;color:#2f9e6f;margin:0}
    h1{font-size:24pt;margin:6px 0 4px;color:#173b2e}
    h2{font-size:13.5pt;margin:20px 0 8px;color:#173b2e}
    h3{font-size:11pt;margin:0;color:#173b2e}
    .meta{margin:3px 0;color:#5c6f78;font-size:9pt}p{margin:5px 0;line-height:1.45}
    .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
    .chip{display:inline-block;font-size:8pt;font-weight:bold;color:#3d5560;background:#eef3f1;border:1px solid #d8e4de;border-radius:999px;padding:3px 9px}
    .chip.is-level{background:#e7f4ec;border-color:#bfe0cc;color:#1f6b45}
    .chip.is-award{background:#fdf1dc;border-color:#f0dcb4;color:#8a5b12}
    .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:10px 0 4px}
    .metric{border:1px solid #dce8e1;border-radius:8px;padding:9px;break-inside:avoid}
    .metric span{display:block;font-size:8pt;color:#5c6f78;margin-bottom:5px}.metric strong{font-size:12pt;color:#1f6b45}
    .bar-row{display:flex;align-items:center;gap:10px;margin:5px 0;break-inside:avoid}
    .bar-label{flex:0 0 190px;font-size:9pt}.bar-track{flex:1;height:14px;background:#eef2f1;border-radius:7px;overflow:hidden}
    .bar-fill{display:block;height:100%;border-radius:7px}.bar-value{flex:0 0 46px;font-size:9pt;font-weight:bold;color:#3d5560}
    .goal{border:1px solid #dbe6e0;border-left:4px solid #2f9e6f;border-radius:8px;padding:11px 14px;margin:10px 0;break-inside:avoid}
    .goal-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:5px}
    .kv{font-size:9pt;color:#445761;margin:4px 0}
    .milestones{margin:6px 0 6px 18px;padding:0;font-size:9pt}.milestones li{margin:3px 0}
    .teacher-note{background:#f6f9f7;border-radius:6px;padding:7px 9px;font-size:9pt}
    .practice{margin:8px 0;padding:8px 10px;background:#f2f7fb;border-radius:6px;font-size:9pt}
    .practice ul{margin:4px 0 0 18px;padding:0}.practice li{margin:3px 0}
    .practice .tag{color:#5c6f78;font-size:8pt;border:1px solid #d3e0ea;border-radius:999px;padding:1px 7px;margin-left:4px}
    table{width:100%;border-collapse:collapse;margin:8px 0 4px;table-layout:fixed}
    th,td{border:1px solid #d8e0e1;padding:6px;text-align:left;vertical-align:top;overflow-wrap:anywhere}
    th{background:#eff5f1;color:#3d5560;font-size:8pt}td{font-size:8.5pt}
    td small{display:block;color:#5c6f78;margin-top:3px}td small.overdue{color:#b3261e;font-weight:bold}
    .muted{color:#8796a0}.note{font-size:8.5pt;color:#5c6f7a;margin:6px 0}
    .empty{color:#5c6f7a;background:#f6f9f7;border-radius:6px;padding:9px;font-size:9pt}
    .empty.small{padding:6px;margin:4px 0}
    section{margin:14px 0;break-inside:avoid}
    footer{border-top:1px solid #d8e0e1;padding-top:9px;margin-top:20px;font-size:8pt;color:#5c6f7a}
    @page{size:A4;margin:14mm}
  </style></head><body>
    ${renderHeader(model)}
    ${renderMetrics(model)}
    ${renderTraits(model)}
    ${renderScores(model)}
    ${renderGoals(model)}
    ${renderObservations(model)}
    <footer>${escapeHtml(model.period.award)} for ${escapeHtml(model.period.round)}. This report contains teacher notes and observation records for staff use; share it with families only when the school's PLP process calls for it.</footer>
  </body></html>`;
