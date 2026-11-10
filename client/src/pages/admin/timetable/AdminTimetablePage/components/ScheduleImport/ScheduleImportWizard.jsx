import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    HiOutlineX,
    HiOutlineUpload,
    HiOutlineSearch,
    HiOutlineDocumentText,
    HiOutlineCheckCircle,
    HiOutlineExclamationCircle
} from 'react-icons/hi';
import timetableService from '../../../../../../services/timetableService';
import teacherService from '../../../../../../services/teacherService';
import ScheduleReviewGrid from './ScheduleReviewGrid';
import ScheduleImportSummary from './ScheduleImportSummary';
import './ScheduleImport.css';

const resolveCellState = (cell, decision, draft) => {
    if (cell.kind === 'empty') return { kind: 'empty', status: 'empty' };
    if (cell.kind === 'meeting' || cell.kind === 'duty') return { kind: 'skip', status: 'skipped' };

    const classDoc = draft.school.classes.find((item) => item.id === decision.classId) || null;
    const subject = draft.school.subjects.find((item) => item.id === decision.subjectId) || null;
    const proposal = decision.createSubject ? decision.proposal : null;

    if (!cell.day || !cell.periodIndex) return { kind: 'blocked', status: 'needs_decision' };
    if (!cell.period) return { kind: 'blocked', status: 'needs_period' };
    if (!classDoc) return { kind: 'blocked', status: 'needs_class' };
    if (!subject && !(proposal?.name?.trim() && proposal?.code?.trim())) {
        return { kind: 'blocked', status: 'needs_decision' };
    }
    if (!decision.confirmed) return { kind: 'blocked', status: 'needs_decision' };

    return {
        kind: 'ready',
        status: subject ? 'ready' : 'will_create_subject',
        classDoc,
        subject,
        proposal
    };
};

const buildInitialDecisions = (draft) => Object.fromEntries(draft.cells.map((cell) => [
    cell.id,
    {
        classId: cell.class?.id || '',
        subjectId: cell.subject?.id || '',
        createSubject: cell.status === 'will_create_subject',
        proposal: cell.proposedSubject ? { ...cell.proposedSubject } : null,
        confirmed: cell.confidence >= 0.5
    }
]));

const teacherUserId = (teacher) => teacher?.user?._id || teacher?.user || teacher?._id || '';

const ScheduleImportWizard = ({ open, onClose, onImported, onAlignPeriods }) => {
    const { t } = useTranslation();
    const fileInputRef = useRef(null);

    const [step, setStep] = useState('setup');
    const [query, setQuery] = useState('');
    const [teacherOptions, setTeacherOptions] = useState([]);
    const [teacherLoading, setTeacherLoading] = useState(false);
    const [selectedTeacherId, setSelectedTeacherId] = useState('');
    const [file, setFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [showPreview, setShowPreview] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [committing, setCommitting] = useState(false);
    const [error, setError] = useState('');
    const [draft, setDraft] = useState(null);
    const [decisions, setDecisions] = useState({});
    const [result, setResult] = useState(null);

    useEffect(() => {
        if (!open) return;
        setStep('setup');
        setQuery('');
        setSelectedTeacherId('');
        setFile(null);
        setError('');
        setDraft(null);
        setDecisions({});
        setResult(null);
        setShowPreview(false);
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
        const timer = setTimeout(async () => {
            setTeacherLoading(true);
            try {
                const response = await teacherService.getTeachers({ search: query.trim(), limit: 20 });
                setTeacherOptions(response?.data?.teachers || []);
            } catch (requestError) {
                setError(requestError?.response?.data?.message || requestError.message);
            } finally {
                setTeacherLoading(false);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [open, query]);

    useEffect(() => {
        if (!file) {
            setPreviewUrl('');
            return undefined;
        }
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (event) => {
            if (event.key === 'Escape' && !committing) onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, committing, onClose]);

    const handleAnalyze = async () => {
        if (!selectedTeacherId) {
            setError(t('adminTimetable:scheduleImport.teacherRequired'));
            return;
        }
        if (!file) {
            setError(t('adminTimetable:scheduleImport.fileRequired'));
            return;
        }
        setError('');
        setAnalyzing(true);
        try {
            const response = await timetableService.analyzeScheduleImport(file, selectedTeacherId);
            const data = response?.data;
            setDraft(data);
            setDecisions(buildInitialDecisions(data));
            setStep('review');
        } catch (requestError) {
            setError(requestError?.response?.data?.message || t('adminTimetable:scheduleImport.analyzeFailed'));
        } finally {
            setAnalyzing(false);
        }
    };

    const rows = useMemo(() => {
        if (!draft) return [];
        return draft.cells.map((cell) => {
            const decision = decisions[cell.id] || {};
            return { cell, decision, state: resolveCellState(cell, decision, draft) };
        });
    }, [draft, decisions]);

    const summary = useMemo(() => {
        const counts = { ready: 0, willCreateSubject: 0, needsDecision: 0, skipped: 0 };
        for (const row of rows) {
            if (row.state.kind === 'empty') continue;
            if (row.state.kind === 'skip') {
                counts.skipped += 1;
            } else if (row.state.kind === 'ready') {
                if (row.state.proposal && !row.state.subject) counts.willCreateSubject += 1;
                else counts.ready += 1;
            } else {
                counts.needsDecision += 1;
            }
        }
        return counts;
    }, [rows]);

    const proposals = useMemo(() => {
        const seen = new Map();
        for (const row of rows) {
            if (row.state.kind !== 'ready' || row.state.subject || !row.state.proposal) continue;
            const code = String(row.state.proposal.code || '').trim().toUpperCase();
            if (code && !seen.has(code)) {
                seen.set(code, { name: row.state.proposal.name.trim(), code });
            }
        }
        return [...seen.values()];
    }, [rows]);

    const needsPeriod = rows.some((row) => row.cell.kind === 'class' && !row.cell.period);
    const canApprove = Boolean(draft)
        && draft.sourceType !== 'class'
        && summary.needsDecision === 0
        && summary.ready + summary.willCreateSubject > 0
        && !committing;

    const handleDecisionChange = (cellId, patch) => {
        setDecisions((previous) => ({
            ...previous,
            [cellId]: { ...(previous[cellId] || {}), ...patch }
        }));
    };

    const handleApprove = async () => {
        if (!draft || !canApprove) return;
        const rowsPayload = [];
        const subjectsToCreate = new Map();
        for (const { cell, state } of rows) {
            if (state.kind !== 'ready') continue;
            const subject = state.subject;
            const proposal = state.proposal;
            rowsPayload.push({
                day: cell.day,
                startTime: cell.period.startTime,
                endTime: cell.period.endTime,
                sessionType: 'class',
                courseName: subject ? subject.code : proposal.code.trim().toUpperCase(),
                grade: state.classDoc.grade,
                section: state.classDoc.section
            });
            if (!subject && proposal) {
                const code = proposal.code.trim().toUpperCase();
                if (!subjectsToCreate.has(code)) {
                    subjectsToCreate.set(code, { name: proposal.name.trim(), code });
                }
            }
        }

        setError('');
        setCommitting(true);
        try {
            const response = await timetableService.commitScheduleImport({
                teacherId: selectedTeacherId,
                rows: rowsPayload,
                subjectsToCreate: [...subjectsToCreate.values()],
                duplicatePolicy: 'update',
                fileName: file?.name || 'schedule-import.pdf'
            });
            setResult(response?.data || null);
            setStep('done');
            toast.success(t('adminTimetable:scheduleImport.toastImported'));
            onImported?.();
        } catch (requestError) {
            const message = requestError?.response?.data?.message || t('adminTimetable:scheduleImport.commitFailed');
            setError(message);
            toast.error(message);
        } finally {
            setCommitting(false);
        }
    };

    const handleAlignPeriods = () => {
        onClose();
        onAlignPeriods?.();
    };

    if (!open) return null;

    return (
        <div className="schedule-import-overlay" role="dialog" aria-modal="true" aria-label={t('adminTimetable:scheduleImport.title')}>
            <div className="schedule-import-panel">
                <header className="schedule-import-header">
                    <div>
                        <span className="hero-eyebrow">{t('adminTimetable:scheduleImport.eyebrow')}</span>
                        <h3>{t('adminTimetable:scheduleImport.title')}</h3>
                        <p>{t('adminTimetable:scheduleImport.subtitle')}</p>
                    </div>
                    <button
                        type="button"
                        className="schedule-import-close"
                        onClick={onClose}
                        disabled={committing}
                        aria-label={t('adminTimetable:scheduleImport.close')}
                    >
                        <HiOutlineX size={20} />
                    </button>
                </header>

                {step === 'setup' ? (
                    <div className="schedule-import-setup">
                        <label className="schedule-import-field">
                            <span>{t('adminTimetable:scheduleImport.teacherLabel')}</span>
                            <div className="schedule-import-search">
                                <HiOutlineSearch size={16} />
                                <input
                                    type="search"
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder={t('adminTimetable:scheduleImport.teacherSearch')}
                                />
                            </div>
                            <select
                                value={selectedTeacherId}
                                onChange={(event) => setSelectedTeacherId(event.target.value)}
                                disabled={teacherLoading}
                            >
                                <option value="">
                                    {teacherLoading
                                        ? t('adminTimetable:scheduleImport.teacherLoading')
                                        : t('adminTimetable:scheduleImport.teacherPlaceholder')}
                                </option>
                                {teacherOptions.map((teacher) => {
                                    const id = teacherUserId(teacher);
                                    const name = `${teacher.user?.firstName || ''} ${teacher.user?.lastName || ''}`.trim();
                                    return (
                                        <option key={id} value={id}>
                                            {name || teacher.employeeId || id}
                                        </option>
                                    );
                                })}
                            </select>
                            {!teacherLoading && teacherOptions.length === 0 ? (
                                <small>{t('adminTimetable:scheduleImport.teacherEmpty')}</small>
                            ) : null}
                        </label>

                        <div className="schedule-import-field">
                            <span>{t('adminTimetable:scheduleImport.fileLabel')}</span>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,application/pdf"
                                className="schedule-import-file-input"
                                onChange={(event) => {
                                    setFile(event.target.files?.[0] || null);
                                    event.target.value = '';
                                    setError('');
                                }}
                            />
                            <button
                                type="button"
                                className={`schedule-import-dropzone${file ? ' has-file' : ''}`}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {file ? <HiOutlineDocumentText size={22} /> : <HiOutlineUpload size={22} />}
                                <strong>{file ? file.name : t('adminTimetable:scheduleImport.chooseFile')}</strong>
                                <small>{t('adminTimetable:scheduleImport.fileHint')}</small>
                            </button>
                        </div>

                        {error ? (
                            <div className="schedule-import-error">
                                <HiOutlineExclamationCircle size={18} />
                                {error}
                            </div>
                        ) : null}

                        <div className="schedule-import-actions">
                            <button type="button" className="btn btn-secondary" onClick={onClose}>
                                {t('adminTimetable:scheduleImport.cancel')}
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleAnalyze}
                                disabled={analyzing}
                            >
                                {analyzing
                                    ? t('adminTimetable:scheduleImport.analyzing')
                                    : t('adminTimetable:scheduleImport.analyze')}
                            </button>
                        </div>
                    </div>
                ) : null}

                {step === 'review' && draft ? (
                    <div className="schedule-import-review">
                        {draft.sourceType === 'class' ? (
                            <>
                                <div className="schedule-import-error">
                                    <HiOutlineExclamationCircle size={18} />
                                    {t('adminTimetable:scheduleImport.sourceClassUnsupported')}
                                </div>
                                <div className="schedule-import-actions">
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => {
                                            setStep('setup');
                                            setDraft(null);
                                            setError('');
                                        }}
                                    >
                                        {t('adminTimetable:scheduleImport.retry')}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="schedule-import-review-head">
                                    <div>
                                        <h4>{t('adminTimetable:scheduleImport.reviewTitle')}</h4>
                                        <p>{t('adminTimetable:scheduleImport.reviewSubtitle')}</p>
                                    </div>
                                    <div className="schedule-import-review-meta">
                                        <span>{draft.teacher?.name}</span>
                                        <span>{draft.academicYear}</span>
                                        <span>{t('adminTimetable:scheduleImport.promptVersion', { version: draft.promptVersion })}</span>
                                        {previewUrl ? (
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => setShowPreview((value) => !value)}
                                            >
                                                {showPreview
                                                    ? t('adminTimetable:scheduleImport.pdfPreviewHide')
                                                    : t('adminTimetable:scheduleImport.pdfPreviewShow')}
                                            </button>
                                        ) : null}
                                    </div>
                                </div>

                                {showPreview && previewUrl ? (
                                    <iframe
                                        className="schedule-import-preview"
                                        src={previewUrl}
                                        title={t('adminTimetable:scheduleImport.pdfPreview')}
                                    />
                                ) : null}

                                <ScheduleReviewGrid
                                    rows={rows}
                                    classes={draft.school.classes}
                                    subjects={draft.school.subjects}
                                    onChange={handleDecisionChange}
                                />

                                <ScheduleImportSummary
                                    summary={summary}
                                    proposals={proposals}
                                    canApprove={canApprove}
                                    needsPeriod={needsPeriod}
                                    committing={committing}
                                    onApprove={handleApprove}
                                    onAlignPeriods={handleAlignPeriods}
                                />

                                {error ? (
                                    <div className="schedule-import-error">
                                        <HiOutlineExclamationCircle size={18} />
                                        {error}
                                    </div>
                                ) : null}

                                <div className="schedule-import-actions">
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => {
                                            setStep('setup');
                                            setDraft(null);
                                            setError('');
                                        }}
                                        disabled={committing}
                                    >
                                        {t('adminTimetable:scheduleImport.retry')}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                ) : null}

                {step === 'done' ? (
                    <div className="schedule-import-done">
                        <HiOutlineCheckCircle size={42} />
                        <h4>{t('adminTimetable:scheduleImport.resultTitle')}</h4>
                        <div className="schedule-import-result-grid">
                            <div>
                                <span>{t('adminTimetable:scheduleImport.resultImported', { value: result?.assignments?.imported ?? 0 })}</span>
                            </div>
                            <div>
                                <span>{t('adminTimetable:scheduleImport.resultSkipped', { value: result?.assignments?.skipped ?? 0 })}</span>
                            </div>
                            <div>
                                <span>{t('adminTimetable:scheduleImport.resultSubjects', { value: result?.subjects?.created?.length ?? 0 })}</span>
                            </div>
                            <div>
                                <span>{t('adminTimetable:scheduleImport.resultFailed', { value: result?.assignments?.failed ?? 0 })}</span>
                            </div>
                        </div>
                        {result?.assignments?.errors?.length > 0 ? (
                            <details className="schedule-import-errors">
                                <summary>{t('adminTimetable:scheduleImport.viewErrors')}</summary>
                                <ul>
                                    {result.assignments.errors.slice(0, 20).map((issue, index) => (
                                        <li key={`${issue.row}-${index}`}>
                                            {t('adminTimetable:scheduleImport.rowError', {
                                                row: issue.row,
                                                message: issue.message
                                            })}
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        ) : null}
                        <div className="schedule-import-actions">
                            <button type="button" className="btn btn-primary" onClick={onClose}>
                                {t('adminTimetable:scheduleImport.done')}
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export default ScheduleImportWizard;
