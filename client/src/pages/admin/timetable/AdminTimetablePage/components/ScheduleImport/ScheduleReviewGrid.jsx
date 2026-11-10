import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineExclamationCircle } from 'react-icons/hi';

const STATUS_LABEL_KEYS = {
    ready: 'scheduleImport:status.ready',
    will_create_subject: 'scheduleImport:status.willCreate',
    needs_decision: 'scheduleImport:status.needsDecision',
    needs_class: 'scheduleImport:status.needsClass',
    needs_period: 'scheduleImport:status.needsPeriod',
    skipped: 'scheduleImport:status.skipped',
    empty: 'scheduleImport:status.empty'
};

const STATUS_TONES = {
    ready: 'success',
    will_create_subject: 'create',
    needs_decision: 'warning',
    needs_class: 'warning',
    needs_period: 'danger',
    skipped: 'muted',
    empty: 'muted'
};

const ScheduleReviewGrid = ({ rows, classes, subjects, onChange }) => {
    const { t } = useTranslation();

    const classesByGrade = useMemo(() => {
        const groups = new Map();
        for (const classDoc of classes) {
            const key = String(classDoc.grade);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(classDoc);
        }
        return [...groups.entries()].sort(([left], [right]) => Number(left) - Number(right));
    }, [classes]);

    const activeSubjects = useMemo(
        () => subjects.filter((subject) => subject.isActive !== false),
        [subjects]
    );

    return (
        <div className="schedule-review-table-wrap">
            <table className="schedule-review-table">
                <thead>
                    <tr>
                        <th>{t('adminTimetable:scheduleImport.table.day')}</th>
                        <th>{t('adminTimetable:scheduleImport.table.time')}</th>
                        <th>{t('adminTimetable:scheduleImport.table.block')}</th>
                        <th>{t('adminTimetable:scheduleImport.table.class')}</th>
                        <th>{t('adminTimetable:scheduleImport.table.subject')}</th>
                        <th>{t('adminTimetable:scheduleImport.table.status')}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(({ cell, decision, state }) => {
                        const isClass = cell.kind === 'class';
                        const subjectValue = decision.createSubject ? '__create__' : (decision.subjectId || '');
                        const status = state.kind === 'skip'
                            ? 'skipped'
                            : (state.kind === 'empty' ? 'empty' : state.status);

                        return (
                            <tr key={cell.id} className={`schedule-review-row status-${STATUS_TONES[status] || 'muted'}`}>
                                <td className="schedule-review-day">{cell.day || '—'}</td>
                                <td className="schedule-review-time">
                                    {cell.documentPeriod
                                        ? `${cell.documentPeriod.startTime}–${cell.documentPeriod.endTime}`
                                        : '—'}
                                </td>
                                <td className="schedule-review-block">
                                    <strong>{cell.title || '—'}</strong>
                                    {cell.code ? <span className="schedule-review-code">{cell.code}</span> : null}
                                    {cell.confidence < 0.5 && isClass ? (
                                        <span className="schedule-review-hint">
                                            <HiOutlineExclamationCircle size={14} />
                                            {t('adminTimetable:scheduleImport.lowConfidence')}
                                        </span>
                                    ) : null}
                                    {!cell.period && isClass ? (
                                        <span className="schedule-review-hint danger">
                                            <HiOutlineExclamationCircle size={14} />
                                            {t('adminTimetable:scheduleImport.periodMissing')}
                                        </span>
                                    ) : null}
                                </td>
                                <td>
                                    {isClass ? (
                                        <select
                                            value={decision.classId || ''}
                                            onChange={(event) => onChange(cell.id, { classId: event.target.value })}
                                            aria-label={t('adminTimetable:scheduleImport.table.class')}
                                        >
                                            <option value="">{t('adminTimetable:scheduleImport.classPlaceholder')}</option>
                                            {classesByGrade.map(([grade, group]) => (
                                                <optgroup key={grade} label={t('adminTimetable:scheduleImport.gradeLabel', { value: grade })}>
                                                    {group.map((classDoc) => (
                                                        <option key={classDoc.id} value={classDoc.id}>
                                                            {classDoc.name || `${classDoc.grade}-${classDoc.section}`}
                                                        </option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                        </select>
                                    ) : '—'}
                                </td>
                                <td>
                                    {isClass ? (
                                        <div className="schedule-review-subject">
                                            <select
                                                value={subjectValue}
                                                onChange={(event) => {
                                                    const value = event.target.value;
                                                    if (value === '__create__') {
                                                        onChange(cell.id, {
                                                            createSubject: true,
                                                            subjectId: '',
                                                            proposal: decision.proposal || cell.proposedSubject || { name: '', code: '' }
                                                        });
                                                        return;
                                                    }
                                                    onChange(cell.id, { createSubject: false, subjectId: value });
                                                }}
                                                aria-label={t('adminTimetable:scheduleImport.table.subject')}
                                            >
                                                <option value="">{t('adminTimetable:scheduleImport.subjectPlaceholder')}</option>
                                                {activeSubjects.map((subject) => (
                                                    <option key={subject.id} value={subject.id}>
                                                        {subject.name} ({subject.code})
                                                    </option>
                                                ))}
                                                <option value="__create__">{t('adminTimetable:scheduleImport.createSubject')}</option>
                                            </select>
                                            {decision.createSubject ? (
                                                <div className="schedule-review-new-subject">
                                                    <input
                                                        type="text"
                                                        value={decision.proposal?.name || ''}
                                                        placeholder={t('adminTimetable:scheduleImport.newSubjectName')}
                                                        onChange={(event) => onChange(cell.id, {
                                                            proposal: { ...(decision.proposal || {}), name: event.target.value }
                                                        })}
                                                        aria-label={t('adminTimetable:scheduleImport.newSubjectName')}
                                                    />
                                                    <input
                                                        type="text"
                                                        value={decision.proposal?.code || ''}
                                                        placeholder={t('adminTimetable:scheduleImport.newSubjectCode')}
                                                        onChange={(event) => onChange(cell.id, {
                                                            proposal: { ...(decision.proposal || {}), code: event.target.value }
                                                        })}
                                                        aria-label={t('adminTimetable:scheduleImport.newSubjectCode')}
                                                    />
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : '—'}
                                </td>
                                <td>
                                    <span className={`schedule-status-chip ${STATUS_TONES[status] || 'muted'}`}>
                                        {t(STATUS_LABEL_KEYS[status] || STATUS_LABEL_KEYS.needs_decision)}
                                    </span>
                                    {isClass && cell.confidence < 0.5 ? (
                                        <label className="schedule-review-confirm">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(decision.confirmed)}
                                                onChange={(event) => onChange(cell.id, { confirmed: event.target.checked })}
                                            />
                                            {t('adminTimetable:scheduleImport.confirm')}
                                        </label>
                                    ) : null}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default ScheduleReviewGrid;
