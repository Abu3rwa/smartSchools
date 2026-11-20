import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    HiOutlineBookOpen,
    HiOutlinePencil,
    HiOutlineEye,
    HiOutlineSparkles,
    HiOutlineUpload,
    HiOutlineLink,
    HiOutlineX
} from 'react-icons/hi';
import api from '../../../../config/api';

const TITLE_MAX = 200;
const SUMMARY_MAX = 5000;
const SOURCE_MAX = 30000;

const METHODS = ['write', 'ai', 'file', 'linked'];

const GradeEntryLessonPanel = ({
    classId,
    subjectId,
    gradeDate,
    lessonTitle,
    lessonSummary,
    onApply,
    onPreviewEmail
}) => {
    const { t } = useTranslation(['grades']);
    const [editorOpen, setEditorOpen] = useState(false);
    const [method, setMethod] = useState('write');
    const [draftTitle, setDraftTitle] = useState('');
    const [draftSummary, setDraftSummary] = useState('');
    const [applyError, setApplyError] = useState('');

    const [aiFacts, setAiFacts] = useState('');
    const [aiPreferences, setAiPreferences] = useState('');
    const [candidate, setCandidate] = useState(null);
    const [busy, setBusy] = useState('');
    const [requestError, setRequestError] = useState('');

    const [fileInfo, setFileInfo] = useState(null);
    const [fileFacts, setFileFacts] = useState('');
    const fileInputRef = useRef(null);

    const [plans, setPlans] = useState([]);
    const [plansLoading, setPlansLoading] = useState(false);
    const [plansError, setPlansError] = useState('');
    const [planId, setPlanId] = useState('');

    const scopeKey = `${classId || ''}|${subjectId || ''}`;
    const scopeRef = useRef(scopeKey);
    useEffect(() => {
        scopeRef.current = scopeKey;
    }, [scopeKey]);

    // A scope change must not leave another class's source material on screen.
    useEffect(() => {
        setFileInfo(null);
        setFileFacts('');
        setCandidate(null);
        setRequestError('');
        setPlans([]);
        setPlanId('');
        setPlansError('');
    }, [scopeKey]);

    const openEditor = () => {
        setDraftTitle(lessonTitle || '');
        setDraftSummary(lessonSummary || '');
        setApplyError('');
        setRequestError('');
        setEditorOpen(true);
    };

    const closeEditor = () => {
        setEditorOpen(false);
        setApplyError('');
        setRequestError('');
    };

    const handleApply = () => {
        const title = draftTitle.trim();
        const summary = draftSummary.trim();
        if (summary && !title) {
            setApplyError(t('grades:entry.lesson.titleRequired'));
            return;
        }
        onApply({ title, summary });
        closeEditor();
    };

    const runRequest = useCallback(async (kind, request) => {
        const startedScope = scopeRef.current;
        setBusy(kind);
        setRequestError('');
        try {
            const response = await request();
            if (scopeRef.current !== startedScope) return null;
            return response.data?.data || null;
        } catch (error) {
            if (scopeRef.current === startedScope) {
                setRequestError(
                    error.response?.data?.message
                    || t('grades:entry.lesson.requestFailed')
                );
            }
            return null;
        } finally {
            if (scopeRef.current === startedScope) setBusy('');
        }
    }, [t]);

    const handleGenerate = async (sourceText) => {
        const text = String(sourceText || '').trim().slice(0, SOURCE_MAX);
        if (!text) {
            setRequestError(t('grades:entry.lesson.factsRequired'));
            return;
        }
        const data = await runRequest('draft', () => api.post('/grades/lesson/draft', {
            classId,
            subjectId,
            sourceText: text
        }));
        if (data) setCandidate({ title: data.title || '', summary: data.summary || '' });
    };

    const handleAiGenerate = () => {
        const parts = [aiFacts.trim()];
        if (aiPreferences.trim()) {
            parts.push(`${t('grades:entry.lesson.preferencesLabel')}: ${aiPreferences.trim()}`);
        }
        handleGenerate(parts.filter(Boolean).join('\n\n'));
    };

    const handleFileChange = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setCandidate(null);
        const formData = new FormData();
        formData.append('materialFile', file);
        formData.append('classId', classId);
        formData.append('subjectId', subjectId);
        // The shared instance defaults to application/json; without this
        // override axios serializes the FormData to JSON and the file never
        // reaches the server.
        const data = await runRequest('upload', () => api.post('/grades/lesson/source', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        }));
        if (data) setFileInfo({ name: file.name, ...data });
    };

    const handleFileGenerate = () => {
        const parts = [fileFacts.trim()];
        if (fileInfo?.text) parts.push(fileInfo.text);
        handleGenerate(parts.filter(Boolean).join('\n\n'));
    };

    useEffect(() => {
        if (!editorOpen || method !== 'linked' || !classId || !subjectId) return undefined;
        let mounted = true;
        const startedScope = scopeRef.current;
        setPlansLoading(true);
        setPlansError('');
        api.get('/lessons', { params: { class: classId, subject: subjectId, page: 1, limit: 20 } })
            .then((response) => {
                if (!mounted || scopeRef.current !== startedScope) return;
                setPlans(response.data?.data?.lessons || []);
            })
            .catch((error) => {
                if (!mounted || scopeRef.current !== startedScope) return;
                setPlans([]);
                setPlansError(error.response?.data?.message || t('grades:entry.lesson.plansLoadFailed'));
            })
            .finally(() => {
                if (mounted && scopeRef.current === startedScope) setPlansLoading(false);
            });
        return () => { mounted = false; };
    }, [editorOpen, method, classId, subjectId, t]);

    const selectedPlan = plans.find((plan) => String(plan._id) === String(planId));
    const planDateMismatch = selectedPlan?.date && gradeDate
        && String(selectedPlan.date).slice(0, 10) !== String(gradeDate).slice(0, 10);

    const handlePlanUse = () => {
        if (!selectedPlan) return;
        setDraftTitle(selectedPlan.title || '');
        setDraftSummary(selectedPlan.summary || '');
        setApplyError('');
    };

    const useCandidate = () => {
        if (!candidate) return;
        setDraftTitle(candidate.title);
        setDraftSummary(candidate.summary);
        setCandidate(null);
        setApplyError('');
    };

    const summaryExcerpt = (lessonSummary || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    const hasLesson = Boolean(lessonTitle || lessonSummary);

    if (!editorOpen) {
        return (
            <section className="lesson-strip" aria-label={t('grades:entry.lesson.stripLabel')}>
                <div className="lesson-strip-text">
                    <span className="lesson-strip-kicker">
                        <HiOutlineBookOpen aria-hidden="true" />
                        {t('grades:entry.lesson.stripLabel')}
                        {!hasLesson && ` · ${t('grades:entry.lesson.optional')}`}
                    </span>
                    {hasLesson ? (
                        <>
                            <h2 className="lesson-strip-title">{lessonTitle}</h2>
                            {summaryExcerpt && (
                                <p className="lesson-strip-excerpt">
                                    {summaryExcerpt}{(lessonSummary || '').length > 140 ? '…' : ''}
                                </p>
                            )}
                        </>
                    ) : (
                        <>
                            <h2 className="lesson-strip-title lesson-strip-empty">{t('grades:entry.lesson.emptyTitle')}</h2>
                            <p className="lesson-strip-excerpt">{t('grades:entry.lesson.emptyHint')}</p>
                        </>
                    )}
                </div>
                <div className="lesson-strip-actions">
                    {hasLesson && (
                        <button type="button" className="btn btn-outline btn-sm" onClick={onPreviewEmail}>
                            <HiOutlineEye aria-hidden="true" />
                            {t('grades:entry.lesson.previewEmail')}
                        </button>
                    )}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={openEditor}>
                        <HiOutlinePencil aria-hidden="true" />
                        {hasLesson ? t('grades:entry.lesson.editLesson') : t('grades:entry.lesson.addLesson')}
                    </button>
                </div>
            </section>
        );
    }

    const methodIcons = {
        write: <HiOutlinePencil aria-hidden="true" />,
        ai: <HiOutlineSparkles aria-hidden="true" />,
        file: <HiOutlineUpload aria-hidden="true" />,
        linked: <HiOutlineLink aria-hidden="true" />
    };

    return (
        <section className="lesson-editor" aria-label={t('grades:entry.lesson.editorTitle')}>
            <div className="lesson-editor-head">
                <div>
                    <h2>{t('grades:entry.lesson.editorTitle')}</h2>
                    <p className="lesson-editor-hint">{t('grades:entry.lesson.editorHint')}</p>
                </div>
            </div>

            <div className="lesson-method-tabs" role="group" aria-label={t('grades:entry.lesson.editorTitle')}>
                {METHODS.map((item) => (
                    <button
                        key={item}
                        type="button"
                        className={`lesson-method-tab${method === item ? ' active' : ''}`}
                        aria-pressed={method === item}
                        onClick={() => { setMethod(item); setRequestError(''); }}
                    >
                        {methodIcons[item]}
                        {t(`grades:entry.lesson.methods.${item}`)}
                    </button>
                ))}
            </div>

            <div className="lesson-editor-cols">
                <div className="lesson-source-panel">
                    {method === 'write' && (
                        <p className="lesson-source-hint">{t('grades:entry.lesson.manualHint')}</p>
                    )}

                    {method === 'ai' && (
                        <>
                            <label className="lesson-field-label" htmlFor="lesson-ai-facts">
                                {t('grades:entry.lesson.factsLabel')}
                            </label>
                            <textarea
                                id="lesson-ai-facts"
                                rows={5}
                                maxLength={SOURCE_MAX}
                                value={aiFacts}
                                onChange={(event) => setAiFacts(event.target.value)}
                                placeholder={t('grades:entry.lesson.factsPlaceholder')}
                            />
                            <label className="lesson-field-label" htmlFor="lesson-ai-preferences">
                                {t('grades:entry.lesson.preferencesLabel')}
                            </label>
                            <textarea
                                id="lesson-ai-preferences"
                                rows={2}
                                maxLength={2000}
                                value={aiPreferences}
                                onChange={(event) => setAiPreferences(event.target.value)}
                                placeholder={t('grades:entry.lesson.preferencesPlaceholder')}
                            />
                            <p className="lesson-source-hint">{t('grades:entry.lesson.aiPrivacy')}</p>
                            <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={handleAiGenerate}
                                disabled={Boolean(busy) || !aiFacts.trim()}
                            >
                                <HiOutlineSparkles aria-hidden="true" />
                                {busy === 'draft' ? t('grades:entry.lesson.drafting') : t('grades:entry.lesson.generate')}
                            </button>
                        </>
                    )}

                    {method === 'file' && (
                        <>
                            <p className="lesson-source-hint">{t('grades:entry.lesson.fileHint')}</p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,application/pdf"
                                className="lesson-file-input"
                                onChange={handleFileChange}
                                disabled={Boolean(busy)}
                                aria-label={t('grades:entry.lesson.chooseFile')}
                            />
                            <div className="lesson-image-gate" role="note">
                                {t('grades:entry.lesson.imageGate')}
                            </div>
                            {busy === 'upload' && (
                                <p className="lesson-source-hint" role="status">{t('grades:entry.lesson.preparing')}</p>
                            )}
                            {fileInfo && (
                                <div className="lesson-file-card">
                                    <span className="lesson-file-name">{fileInfo.name}</span>
                                    <button
                                        type="button"
                                        className="btn btn-outline btn-sm"
                                        onClick={() => { setFileInfo(null); setFileFacts(''); setCandidate(null); }}
                                    >
                                        <HiOutlineX aria-hidden="true" />
                                        {t('grades:entry.lesson.removeFile')}
                                    </button>
                                </div>
                            )}
                            {fileInfo?.sourceType === 'pdf' && (
                                <>
                                    {fileInfo.truncated && (
                                        <p className="lesson-notice warning" role="status">
                                            {t('grades:entry.lesson.truncated')}
                                        </p>
                                    )}
                                    <details className="lesson-extract">
                                        <summary>{t('grades:entry.lesson.extractedText')}</summary>
                                        <pre>{fileInfo.text}</pre>
                                    </details>
                                    <label className="lesson-field-label" htmlFor="lesson-file-facts">
                                        {t('grades:entry.lesson.fileFactsLabel')}
                                    </label>
                                    <textarea
                                        id="lesson-file-facts"
                                        rows={3}
                                        maxLength={4000}
                                        value={fileFacts}
                                        onChange={(event) => setFileFacts(event.target.value)}
                                        placeholder={t('grades:entry.lesson.fileFactsPlaceholder')}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        onClick={handleFileGenerate}
                                        disabled={Boolean(busy)}
                                    >
                                        <HiOutlineSparkles aria-hidden="true" />
                                        {busy === 'draft' ? t('grades:entry.lesson.drafting') : t('grades:entry.lesson.generate')}
                                    </button>
                                </>
                            )}
                        </>
                    )}

                    {method === 'linked' && (
                        <>
                            <p className="lesson-source-hint">{t('grades:entry.lesson.linkedHint')}</p>
                            {plansLoading && (
                                <p className="lesson-source-hint" role="status">{t('grades:entry.lesson.plansLoading')}</p>
                            )}
                            {plansError && <p className="lesson-notice error" role="alert">{plansError}</p>}
                            {!plansLoading && !plansError && plans.length === 0 && (
                                <p className="lesson-source-hint">{t('grades:entry.lesson.noPlans')}</p>
                            )}
                            {plans.length > 0 && (
                                <>
                                    <label className="lesson-field-label" htmlFor="lesson-plan-select">
                                        {t('grades:entry.lesson.linkedLabel')}
                                    </label>
                                    <select
                                        id="lesson-plan-select"
                                        value={planId}
                                        onChange={(event) => setPlanId(event.target.value)}
                                    >
                                        <option value="">{t('grades:entry.lesson.choosePlan')}</option>
                                        {plans.map((plan) => (
                                            <option key={plan._id} value={plan._id}>
                                                {plan.title || plan.topic}
                                                {plan.date ? ` · ${new Date(plan.date).toLocaleDateString()}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    {planDateMismatch && (
                                        <p className="lesson-notice warning" role="status">
                                            {t('grades:entry.lesson.planDateMismatch')}
                                        </p>
                                    )}
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={handlePlanUse}
                                        disabled={!selectedPlan}
                                    >
                                        {t('grades:entry.lesson.usePlan')}
                                    </button>
                                </>
                            )}
                        </>
                    )}

                    {requestError && (
                        <p className="lesson-notice error" role="alert">{requestError}</p>
                    )}

                    {candidate && (
                        <div className="lesson-notice draft">
                            <h4>{t('grades:entry.lesson.candidateLabel')}</h4>
                            {candidate.title && <p className="lesson-candidate-title">{candidate.title}</p>}
                            {candidate.summary && <p className="lesson-candidate-summary">{candidate.summary}</p>}
                            <button type="button" className="btn btn-primary btn-sm" onClick={useCandidate}>
                                {t('grades:entry.lesson.useDraft')}
                            </button>
                        </div>
                    )}
                </div>

                <div className="lesson-final-fields">
                    <label className="lesson-field-label" htmlFor="lesson-title">
                        {t('grades:entry.lesson.titleLabel')}
                    </label>
                    <input
                        id="lesson-title"
                        type="text"
                        maxLength={TITLE_MAX}
                        value={draftTitle}
                        onChange={(event) => { setDraftTitle(event.target.value); setApplyError(''); }}
                    />
                    <span className="lesson-field-count">{draftTitle.length} / {TITLE_MAX}</span>

                    <label className="lesson-field-label" htmlFor="lesson-summary">
                        {t('grades:entry.lesson.summaryLabel')}
                    </label>
                    <textarea
                        id="lesson-summary"
                        rows={8}
                        maxLength={SUMMARY_MAX}
                        value={draftSummary}
                        onChange={(event) => { setDraftSummary(event.target.value); setApplyError(''); }}
                    />
                    <span className="lesson-field-count">{draftSummary.length} / {SUMMARY_MAX}</span>
                    <p className="lesson-source-hint">{t('grades:entry.lesson.summaryHint')}</p>
                    {applyError && <p className="lesson-notice error" role="alert">{applyError}</p>}
                </div>
            </div>

            <div className="lesson-editor-foot">
                <div className="lesson-editor-actions">
                    <button type="button" className="btn btn-secondary" onClick={closeEditor}>
                        {t('grades:entry.lesson.cancel')}
                    </button>
                    <button type="button" className="btn btn-primary" onClick={handleApply}>
                        {t('grades:entry.lesson.apply')}
                    </button>
                </div>
            </div>
        </section>
    );
};

export default GradeEntryLessonPanel;