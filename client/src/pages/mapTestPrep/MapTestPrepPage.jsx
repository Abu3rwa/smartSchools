import { useEffect, useState } from 'react';
import { HiOutlineDocumentArrowUp, HiOutlineEye, HiOutlineArrowLeft } from 'react-icons/hi2';
import api from '../../config/api';
import { useSelector } from 'react-redux';
import { selectUser } from '../../store/slices/authSlice';
import { selectCurrentAcademicYear } from '../../store/slices/uiSlice';
import './MapTestPrepPage.css';

const MapTestPrepPage = () => {
    const academicYear = useSelector(selectCurrentAcademicYear);
    const user = useSelector(selectUser);
    const isAdmin = user?.role === 'admin';
    const [classes, setClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState(null);
    const [students, setStudents] = useState([]);
    const [records, setRecords] = useState(null);
    const [roundCounts, setRoundCounts] = useState({});
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [roundLoading, setRoundLoading] = useState(null);
    const [settings, setSettings] = useState(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [report, setReport] = useState(null);
    const [reviewQuestionSet, setReviewQuestionSet] = useState(null);
    const [reviewPlanId, setReviewPlanId] = useState(null);
    const [reviewSaving, setReviewSaving] = useState(false);
    const [analysisReview, setAnalysisReview] = useState(null);
    const [analysisRound, setAnalysisRound] = useState(null);
    const [analysisPlanId, setAnalysisPlanId] = useState(null);
    const [selectedTopicIds, setSelectedTopicIds] = useState([]);
    const [analysisSaving, setAnalysisSaving] = useState(false);

    const loadClasses = async () => {
        setLoading(true);
        try {
            const response = await api.get('/map-test-prep/classes');
            setClasses(response.data?.data?.classes || []);
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Unable to load classes.');
        } finally {
            setLoading(false);
        }
    };

    const openClass = async (classItem) => {
        setSelectedClass(classItem);
        setSelectedStudent(null);
        setRecords(null);
        setError('');
        try {
            const response = await api.get(`/map-test-prep/classes/${classItem._id}/students`);
            setStudents(response.data?.data?.students || []);
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Unable to load students.');
        }
    };

    const openStudentDetails = async (student) => {
        setSelectedStudent(student);
        setDetailsLoading(true);
        setError('');
        try {
            const response = await api.get(`/map-test-prep/students/${student._id}/map-records`);
            const loadedRecords = response.data?.data?.records || [];
            loadedRecords.forEach((record) => {
                console.log('[MAP] Extracted text', {
                    recordId: record._id,
                    fileName: record.sourceFileName,
                    extractedText: record.extractedText || ''
                });
            });
            const roundEntries = await Promise.all(loadedRecords.map(async (record) => {
                const planId = record.preparationPlan?._id || record.preparationPlan;
                if (!planId) return null;
                try {
                    const roundsResponse = await api.get(`/map-test-prep/plans/${planId}/rounds`);
                    return [String(planId), roundsResponse.data?.data?.rounds?.length || 0];
                } catch {
                    return [String(planId), 0];
                }
            }));
            setRoundCounts(Object.fromEntries(roundEntries.filter(Boolean)));
            setRecords(loadedRecords);
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Unable to load MAP details.');
        } finally {
            setDetailsLoading(false);
        }
    };

    const uploadMapData = async (event) => {
        event.preventDefault();
        if (!file || !selectedStudent) return;
        setUploading(true);
        setError('');
        try {
            const body = new FormData();
            body.append('file', file);
            const response = await api.post(`/map-test-prep/students/${selectedStudent._id}/map-records/upload`, body, {
                headers: { 'Content-Type': undefined }
            });
            console.log('[MAP] Extracted text', {
                recordId: response.data?.data?.record?._id,
                fileName: response.data?.data?.record?.sourceFileName,
                extractedText: response.data?.data?.record?.extractedText || ''
            });
            setRecords((previous) => [response.data.data.record, ...(previous || [])]);
            setFile(null);
            event.target.reset();
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Unable to upload MAP CSV.');
        } finally {
            setUploading(false);
        }
    };

    const confirmRecord = async (record) => {
        try {
            const response = await api.patch(`/map-test-prep/map-records/${record._id}/confirm`, {});
            setRecords((previous) => (previous || []).map((item) => (
                item._id === record._id
                    ? { ...response.data.data.record, preparationPlan: response.data.data.plan }
                    : item
            )));
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Unable to confirm MAP data.');
        }
    };

    const createNextRound = async (record) => {
        const planId = record.preparationPlan?._id || record.preparationPlan;
        if (!planId) return;
        setRoundLoading(record._id);
        setError('');
        try {
            const analysisResponse = await api.post(`/map-test-prep/plans/${planId}/rounds/next/analyze`, {});
            const analysis = analysisResponse.data.data.analysis || {};
            setAnalysisReview({
                ...analysis,
                topicGroups: Array.isArray(analysis.topicGroups) ? analysis.topicGroups : [],
                limitations: Array.isArray(analysis.limitations) ? analysis.limitations : []
            });
            setAnalysisRound(analysisResponse.data.data.round);
            setAnalysisPlanId(planId);
            setRoundCounts((previous) => ({ ...previous, [String(planId)]: Math.max(previous[String(planId)] || 0, analysisResponse.data.data.round.roundNumber) }));
            setSelectedTopicIds(Array.isArray(analysis.topicGroups) ? analysis.topicGroups.map((topic) => topic._id) : []);
            setRecords((previous) => (previous || []).map((item) => (
                item._id === record._id
                    ? { ...item, preparationPlan: { ...item.preparationPlan, currentRoundNumber: analysisResponse.data.data.round.roundNumber, analysisStatus: 'teacher_review' } }
                    : item
            )));
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Unable to create the next practice round.');
        } finally {
            setRoundLoading(null);
        }
    };

    const approveAnalysisAndGenerate = async () => {
        if (!analysisReview || !analysisRound || !analysisPlanId) return;
        setAnalysisSaving(true);
        setError('');
        try {
            await api.post(`/map-test-prep/plans/${analysisPlanId}/analyses/${analysisReview._id}/approve`);
            const response = await api.post(`/map-test-prep/plans/${analysisPlanId}/rounds/${analysisRound._id}/questions/generate`, {
                questionCount: 10,
                topicGroupIds: selectedTopicIds
            });
            setReviewPlanId(analysisPlanId);
            setReviewQuestionSet(response.data.data.questionSet);
            setAnalysisReview(null);
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Unable to approve the analysis and generate questions.');
        } finally {
            setAnalysisSaving(false);
        }
    };

    const deleteLatestRound = async (record) => {
        const planId = record.preparationPlan?._id || record.preparationPlan;
        if (!planId || !window.confirm('Delete this practice round and its draft questions?')) return;
        try {
            const roundsResponse = await api.get(`/map-test-prep/plans/${planId}/rounds`);
            const latestRound = roundsResponse.data?.data?.rounds?.[0];
            if (!latestRound?._id) throw new Error('No practice round was found.');
            const roundId = latestRound._id;
            await api.delete(`/map-test-prep/plans/${planId}/rounds/${roundId}`);
            setAnalysisReview(null);
            setAnalysisRound(null);
            setAnalysisPlanId(null);
            const remainingRounds = await api.get(`/map-test-prep/plans/${planId}/rounds`);
            setRoundCounts((previous) => ({ ...previous, [String(planId)]: remainingRounds.data?.data?.rounds?.length || 0 }));
            setRecords((previous) => (previous || []).map((item) => (
                item._id === record._id
                    ? { ...item, preparationPlan: { ...item.preparationPlan, currentRoundNumber: remainingRounds.data?.data?.rounds?.[0]?.roundNumber || 0, analysisStatus: 'not_started' } }
                    : item
            )));
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Unable to delete the practice round.');
        }
    };

    const deleteMapImport = async (record) => {
        if (!window.confirm('Delete this MAP import, its plan, rounds, drafts, and quiz data?')) return;
        try {
            await api.delete(`/map-test-prep/map-records/${record._id}`);
            setRecords((previous) => (previous || []).filter((item) => item._id !== record._id));
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Unable to delete the MAP import.');
        }
    };

    const openQuestionReview = async (record) => {
        const planId = record.preparationPlan?._id || record.preparationPlan;
        if (!planId) return;
        try {
            const response = await api.get(`/map-test-prep/plans/${planId}/question-sets`);
            setReviewPlanId(planId);
            setReviewQuestionSet(response.data?.data?.questionSets?.[0] || null);
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Unable to load question drafts.');
        }
    };

    const saveQuestionReview = async () => {
        if (!reviewQuestionSet || !reviewPlanId) return;
        setReviewSaving(true);
        try {
            const response = await api.patch(`/map-test-prep/plans/${reviewPlanId}/question-sets/${reviewQuestionSet._id}`, { questions: reviewQuestionSet.questions });
            setReviewQuestionSet(response.data.data.questionSet);
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Unable to save question edits.');
        } finally {
            setReviewSaving(false);
        }
    };

    const approveQuestionReview = async () => {
        if (!reviewQuestionSet || !reviewPlanId) return;
        try {
            const response = await api.post(`/map-test-prep/plans/${reviewPlanId}/question-sets/${reviewQuestionSet._id}/approve`);
            setReviewQuestionSet(response.data.data.questionSet);
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Unable to approve question set.');
        }
    };

    useEffect(() => { loadClasses(); }, [academicYear]);

    useEffect(() => {
        if (!isAdmin) return;
        api.get('/schools/me/map-test-prep-settings').then((response) => {
            setSettings(response.data?.data?.settings || {});
        }).catch(() => setError('Unable to load MAP settings.'));
    }, [isAdmin]);

    const saveSettings = async () => {
        try {
            const response = await api.put('/schools/me/map-test-prep-settings', settings);
            setSettings(response.data?.data?.settings || settings);
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Unable to save MAP settings.');
        }
    };

    const loadPlanReport = async (planId) => {
        try {
            const response = await api.get(`/map-test-prep/reports/plan/${planId}`);
            setReport(response.data?.data || null);
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Unable to load report.');
        }
    };

    const exportPlanReport = async (planId) => {
        try {
            const response = await api.get(`/map-test-prep/reports/plan/${planId}/export`, { responseType: 'blob' });
            const url = URL.createObjectURL(response.data);
            const link = document.createElement('a');
            link.href = url;
            link.download = `map-prep-${planId}.csv`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Unable to export report.');
        }
    };

    if (loading) return <div className="map-prep-page"><div className="map-prep-state">Loading MAP Test Prep...</div></div>;

    return (
        <div className="map-prep-page">
            <header className="map-prep-header">
                <div>
                    <p className="map-prep-eyebrow">Academic year {academicYear || 'Current year'}</p>
                    <h1>MAP Test Prep</h1>
                    <p className="map-prep-subtitle">Turn MAP evidence into focused, teacher-reviewed practice.</p>
                </div>
                {isAdmin && <button type="button" className="btn btn-outline" onClick={() => setSettingsOpen(true)}>MAP Settings</button>}
            </header>
            <nav className="map-prep-progress" aria-label="MAP test prep workflow">
                <span className={!selectedClass ? 'active' : 'complete'}><b>1</b> Choose a class</span>
                <span className={selectedClass && !selectedStudent ? 'active' : selectedStudent ? 'complete' : ''}><b>2</b> Select a student</span>
                <span className={selectedStudent ? 'active' : ''}><b>3</b> Upload and review</span>
            </nav>
            {error && <div className="map-prep-error">{error}</div>}
            {isAdmin && settingsOpen && settings && <div className="map-settings-overlay" role="dialog" aria-modal="true"><section className="map-settings-modal map-prep-section"><div className="map-settings-modal-header"><h2>MAP Settings</h2><button type="button" className="map-back-button" onClick={() => setSettingsOpen(false)}>Close</button></div><label><input type="checkbox" checked={settings.enabled !== false} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} /> Enable MAP Test Prep</label><label><input type="checkbox" checked={settings.requireExtractionReview !== false} onChange={(event) => setSettings({ ...settings, requireExtractionReview: event.target.checked })} /> Require PDF extraction review</label><label><input type="checkbox" checked={settings.requireQuestionApproval !== false} onChange={(event) => setSettings({ ...settings, requireQuestionApproval: event.target.checked })} /> Require question approval</label><label><input type="checkbox" checked={settings.allowTeacherAiGrading !== false} onChange={(event) => setSettings({ ...settings, allowTeacherAiGrading: event.target.checked })} /> Allow post-quiz AI grading suggestions</label><button type="button" className="btn btn-primary" onClick={async () => { await saveSettings(); setSettingsOpen(false); }}>Save MAP Settings</button></section></div>}
            {!selectedClass ? (
                <section className="map-prep-section">
                    <div className="map-section-heading"><div><p className="map-section-kicker">Start here</p><h2>Choose a class</h2><p className="text-muted">Open a class to view students and their MAP history.</p></div><span className="map-section-count">{classes.length} {classes.length === 1 ? 'class' : 'classes'}</span></div>
                    <div className="map-class-grid">
                        {classes.map((classItem) => (
                            <button type="button" className="map-class-card" key={classItem._id} onClick={() => openClass(classItem)}>
                                <strong>{classItem.name}</strong>
                                <span>Grade {classItem.grade} {classItem.section || ''}</span>
                            </button>
                        ))}
                    </div>
                    {classes.length === 0 && <div className="map-prep-empty"><strong>No classes available</strong><span>No classes are available for the active academic year.</span></div>}
                </section>
            ) : !selectedStudent ? (
                <section className="map-prep-section">
                    <button type="button" className="map-back-button" onClick={() => setSelectedClass(null)}><HiOutlineArrowLeft /> My Classes</button>
                    <div className="map-section-heading"><div><p className="map-section-kicker">Class roster</p><h2>{selectedClass.name} students</h2><p className="text-muted">Select a student to upload results or continue an existing prep plan.</p></div><span className="map-section-count">{students.length} {students.length === 1 ? 'student' : 'students'}</span></div>
                    <div className="map-table-wrap">
                        <table>
                            <thead><tr><th>Student</th><th>Student ID</th><th>Actions</th></tr></thead>
                            <tbody>{students.map((student) => <tr key={student._id}>
                                <td>{student.firstName} {student.lastName}</td>
                                <td>{student.studentId || '-'}</td>
                                <td className="map-actions">
                                    <button type="button" className="btn btn-outline" onClick={() => openStudentDetails(student)}><HiOutlineEye /> View MAP Details</button>
                                    <button type="button" className="btn btn-primary" onClick={() => openStudentDetails(student)}><HiOutlineDocumentArrowUp /> Upload MAP Data</button>
                                </td>
                            </tr>)}</tbody>
                        </table>
                    </div>
                    {students.length === 0 && <div className="map-prep-empty"><strong>No students found</strong><span>This class has no students for the active academic year.</span></div>}
                </section>
            ) : (
                <section className="map-prep-section">
                    <button type="button" className="map-back-button" onClick={() => setSelectedStudent(null)}><HiOutlineArrowLeft /> {selectedClass.name} Students</button>
                    <div className="map-section-heading"><div><p className="map-section-kicker">Student workspace</p><h2>{selectedStudent.firstName} {selectedStudent.lastName}</h2><p className="text-muted">Upload the latest MAP CSV, confirm the evidence, then build the next practice round.</p></div></div>
                    <form className="map-upload-form" onSubmit={uploadMapData}>
                        <div className="map-upload-copy"><strong>Import MAP results</strong><span>Use the CSV exported from your MAP assessment system.</span></div>
                        <label htmlFor="map-pdf">Choose CSV file</label>
                        <input id="map-pdf" type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] || null)} required />
                        <button className="btn btn-primary" type="submit" disabled={!file || uploading}>{uploading ? 'Uploading...' : 'Upload MAP Data'}</button>
                    </form>
                    <div className="map-section-heading map-history-heading"><div><p className="map-section-kicker">Evidence and practice plans</p><h3>MAP test history</h3></div></div>
                    {detailsLoading ? <div className="map-prep-state">Loading MAP history...</div> : records?.length ? <div className="map-record-list">{records.map((record) => <article className="map-record-card" key={record._id}>
                        <div className="map-record-header">
                            <strong>{record.testWindow || 'MAP Test'} {record.academicYear}</strong>
                            <span className={`map-status map-status-${record.extractionStatus}`}>{record.extractionStatus}</span>
                        </div>
                        <div className="map-record-meta">
                            <span><small>RIT</small>{record.ritScore ?? 'Needs review'}</span>
                            <span><small>Subject / Grade</small>{record.importedSubject || 'Needs review'} · {record.importedGrade ?? '—'}</span>
                            <span><small>Evidence rows</small>{record.mapEvidence?.length ?? 0}</span>
                            <span><small>Plan</small>{record.preparationPlan?.title || 'Created after confirmation'}</span>
                        </div>
                        {record.extractionStatus !== 'confirmed' && record.mapEvidence?.length > 0 && <details className="map-evidence-preview">
                            <summary>Review imported MAP standards ({record.mapEvidence.length})</summary>
                            <div className="map-evidence-list">{record.mapEvidence.map((evidence) => <div className="map-evidence-row" key={evidence.mapEvidenceId}>
                                <strong>{evidence.instructionalArea}</strong>
                                <span>{evidence.standardCode || 'No standard code'}</span>
                                <span>{evidence.performanceLevel || 'No performance level'}</span>
                                <p>{evidence.standardDescription || 'No standard description provided.'}</p>
                            </div>)}</div>
                        </details>}
                        <div className="map-record-actions">
                            {record.extractionStatus !== 'confirmed' && <button type="button" className="btn btn-primary" onClick={() => confirmRecord(record)}>Confirm MAP Data and Create Plan</button>}
                            {record.extractionStatus === 'confirmed' && record.preparationPlan && <><button type="button" className="btn btn-outline" disabled={roundLoading === record._id} onClick={() => createNextRound(record)}>{roundLoading === record._id ? 'Creating Round...' : `Create Next Practice Round ${record.preparationPlan.currentRoundNumber ? `(after ${record.preparationPlan.currentRoundNumber})` : ''}`}</button><button type="button" className="btn btn-outline" onClick={() => openQuestionReview(record)}>Review Questions</button><button type="button" className="btn btn-outline" onClick={() => loadPlanReport(record.preparationPlan._id)}>View Report</button><button type="button" className="btn btn-outline" onClick={() => exportPlanReport(record.preparationPlan._id)}>Export CSV</button>{roundCounts[String(record.preparationPlan?._id || record.preparationPlan)] > 0 && <button type="button" className="btn btn-danger-outline" onClick={() => deleteLatestRound(record)}>Delete Round</button>}</>}
                            <button type="button" className="btn btn-danger-outline" onClick={() => deleteMapImport(record)}>Delete MAP Import</button>
                        </div>
                    </article>)}</div> : <div className="map-prep-empty"><strong>No MAP uploads yet</strong><span>Upload a CSV above to begin this student’s preparation plan.</span></div>}
                    {analysisReview && <div className="map-question-review">
                        <div className="map-question-review-header">
                            <div>
                                <h3>MAP Analysis Review</h3>
                                <p className="text-muted">Select the topic groups to use for this practice round, then approve the evidence review.</p>
                            </div>
                            <span className="map-review-count">{analysisReview.topicGroups.length} topics</span>
                        </div>
                        <div className="map-topic-list">
                            {analysisReview.topicGroups.length === 0 && <p className="map-analysis-empty">No topic groups were returned. Review the evidence extraction and run the analysis again.</p>}
                            {analysisReview.topicGroups.map((topic) => {
                                const topicId = String(topic._id);
                                const selected = selectedTopicIds.includes(topicId);
                                return <button type="button" className={`map-topic-card${selected ? ' selected' : ''}`} key={topicId} onClick={() => setSelectedTopicIds((current) => selected ? current.filter((id) => id !== topicId) : [...current, topicId])}>
                                    <strong>{topic.name}</strong>
                                    <span>{topic.status} · {topic.skillCount} skills · {topic.confidence} confidence</span>
                                    <small>{topic.evidenceSummary}</small>
                                </button>;
                            })}
                        </div>
                        {analysisReview.limitations.map((limitation) => <p className="map-analysis-limitation" key={limitation}>{limitation}</p>)}
                        <div className="map-actions"><button type="button" className="btn btn-primary" disabled={analysisSaving || !selectedTopicIds.length} onClick={approveAnalysisAndGenerate}>{analysisSaving ? 'Generating Questions...' : 'Approve Analysis and Generate Questions'}</button></div>
                    </div>}
                    {reviewQuestionSet && <div className="map-question-review">
                        <div className="map-question-review-header">
                            <div>
                                <h3>Question Set Review</h3>
                                <p className="text-muted">Review every item before publishing. Status: <strong>{reviewQuestionSet.status}</strong></p>
                            </div>
                            <span className="map-review-count">{reviewQuestionSet.questions.length} questions</span>
                        </div>
                        <div className="map-question-review-list">
                            {reviewQuestionSet.questions.map((question, index) => <article className="map-question-card" key={question._id || index}>
                                <div className="map-question-card-header">
                                    <strong>Question {index + 1}</strong>
                                    <span>{String(question.questionType || 'question').replace(/_/g, ' ')}</span>
                                    <span>{question.difficulty || 'medium'}</span>
                                </div>
                                <label>Question text<textarea placeholder="(missing - enter question text)" value={question.questionText || ''} onChange={(event) => setReviewQuestionSet((current) => ({ ...current, questions: current.questions.map((item, itemIndex) => itemIndex === index ? { ...item, questionText: event.target.value } : item) }))} /></label>
                                {!question.questionText?.trim() && <p className="map-question-warning">Question text is missing - please write it before publishing.</p>}
                                {Array.isArray(question.options) && question.options.length > 0 && <div className="map-question-options"><strong>Answer options</strong>{question.options.map((option, optionIndex) => { const safeOption = option || {}; const label = safeOption.label || String.fromCharCode(65 + optionIndex); return <input key={`${label}-${optionIndex}`} value={`${label}. ${safeOption.text || ''}`} readOnly aria-label={`Option ${optionIndex + 1}`} placeholder="(missing option text)" />; })}</div>}
                                <label>Correct answer<input placeholder="(missing - enter correct answer)" value={question.correctAnswer || ''} onChange={(event) => setReviewQuestionSet((current) => ({ ...current, questions: current.questions.map((item, itemIndex) => itemIndex === index ? { ...item, correctAnswer: event.target.value } : item) }))} /></label>
                                <label>Explanation<textarea placeholder="(missing - enter explanation)" value={question.explanation || ''} onChange={(event) => setReviewQuestionSet((current) => ({ ...current, questions: current.questions.map((item, itemIndex) => itemIndex === index ? { ...item, explanation: event.target.value } : item) }))} /></label>
                                <div className="map-question-tags"><span>Skill: {question.skillName || question.skillCode || 'Not assigned'}</span><span>Domain: {question.domain || 'Not assigned'}</span></div>
                            </article>)}
                        </div>
                        <div className="map-actions"><button type="button" className="btn btn-outline" disabled={reviewSaving} onClick={saveQuestionReview}>Save Edits</button>{reviewQuestionSet.status === 'teacher_review' && <button type="button" className="btn btn-primary" onClick={approveQuestionReview}>Approve Question Set</button>}</div>
                    </div>}
                    {report && <div className="map-question-review"><h3>Plan Report</h3>{report.rows?.map((row) => <p key={row.attemptId}>{row.student?.firstName} {row.student?.lastName}: {row.percentage === null ? 'Pending review' : `${row.percentage}%`} ({row.answeredCount}/{row.questionCount} answered)</p>)}</div>}
                </section>
            )}
        </div>
    );
};

export default MapTestPrepPage;
