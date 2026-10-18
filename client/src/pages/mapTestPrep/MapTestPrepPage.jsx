import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '../../config/api';
import { getMapPracticeImportAction } from './mapPracticeImportState';
import './MapTestPrepPage.css';

const initialImportState = { phase: 'idle', uploads: [], files: [], token: null, tokenExpiresAt: null, pendingOverrides: {}, error: '', retryAction: null, errorMode: 'stop', assignFirstSet: false, dueDate: '', result: null };

const mapImportReducer = (state, action) => {
  switch (action.type) {
    case 'FILES_SELECTED':
      return { ...state, phase: action.files.length ? 'filesSelected' : 'idle', uploads: action.files, error: '', result: null };
    case 'PREVIEW_START':
      return { ...state, phase: 'previewing', pendingOverrides: action.overrides || {}, error: '', retryAction: null };
    case 'PREVIEW_SUCCESS': {
      const seenHashes = new Set();
      const files = action.previews.flatMap((preview, index) => {
        if (seenHashes.has(preview.fileHash)) return [];
        seenHashes.add(preview.fileHash);
        return [{ ...preview, uploadFile: action.uploads[index] }];
      });
      return { ...state, phase: 'previewReady', files, uploads: action.uploads, token: action.token, tokenExpiresAt: action.tokenExpiresAt, pendingOverrides: {}, error: '', retryAction: null };
    }
    case 'PREVIEW_FAIL':
      return { ...state, phase: 'error', error: action.message, retryAction: action.retryAction || 'preview' };
    case 'IMPORT_START':
      return { ...state, phase: 'importing', error: '' };
    case 'IMPORT_DONE':
      return { ...state, phase: 'done', result: action.result };
    case 'SET_ERROR_MODE':
      return { ...state, errorMode: action.value };
    case 'SET_ASSIGNMENT':
      return { ...state, assignFirstSet: action.enabled, dueDate: action.dueDate ?? state.dueDate };
    case 'RESET':
      return initialImportState;
    default:
      return state;
  }
};

const getFileHash = async (file) => {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return `${file.name}:${file.size}:${file.lastModified}`;
};

const downloadTextFile = (fileName, contents) => {
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

const MapTestPrepPage = () => {
  const { t } = useTranslation(['mapTestPrep']);
  const tabs = useMemo(() => [
    { key: 'students', label: t('mapTestPrep:tabs.students') },
    { key: 'import', label: t('mapTestPrep:tabs.import') },
    { key: 'settings', label: t('mapTestPrep:tabs.settings') }
  ], [t]);
  const [activeTab, setActiveTab] = useState('students');
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [students, setStudents] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [importState, dispatchImport] = useReducer(mapImportReducer, initialImportState);
  const [expandedFiles, setExpandedFiles] = useState({});
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [importStudentSearch, setImportStudentSearch] = useState({});
  const [skillOptions, setSkillOptions] = useState({ createNewSkills: {}, useExistingSkill: {} });
  const [archivedCounts, setArchivedCounts] = useState({});
  const [assignedSetIds, setAssignedSetIds] = useState({});
  const [importStudents, setImportStudents] = useState([]);
  const [overviewData, setOverviewData] = useState(null);
  const [selectedRosterStudent, setSelectedRosterStudent] = useState(null);
  const [selectedRosterStudentId, setSelectedRosterStudentId] = useState('');
  const [rosterStudentDetails, setRosterStudentDetails] = useState(null);
  const [rosterStudentDetailsLoading, setRosterStudentDetailsLoading] = useState(false);
  const [rosterStudentDetailsError, setRosterStudentDetailsError] = useState('');
  const [rosterAssigningSetId, setRosterAssigningSetId] = useState(null);
  const [rosterDeletingSetId, setRosterDeletingSetId] = useState(null);
  const [rosterAssignmentDueDates, setRosterAssignmentDueDates] = useState({});
  const fileInputRef = useRef(null);
  const [settings, setSettings] = useState({
    feedbackMode: 'after_submit',
    selfPracticeEnabled: true,
    showTimer: false,
    lowAccuracyThreshold: 60,
    minAnswersForAccuracy: 3,
    noActivityDays: 7,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadClasses = async () => {
    setLoading(true);
    try {
      const response = await api.get('/map-test-prep/practice/overview');
      const data = response.data?.data || {};
      setOverviewData(data);
      setClasses(data.classes || []);
      setAllStudents(data.students || []);
      setImportStudents(data.students || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load MAP Practice classes.');
    } finally {
      setLoading(false);
    }
  };

  const loadStudents = useCallback(async (classId) => {
    if (overviewData?.students) {
      const roster = overviewData.students.filter((student) => String(student.currentClass?._id || student.currentClass) === String(classId) || (student.enrolledClasses || []).some((item) => String(item?._id || item) === String(classId)));
      setStudents(roster);
      return;
    }
    try {
      const response = await api.get(`/map-test-prep/classes/${classId}/students`);
      setStudents(response.data?.data?.students || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load students.');
    }
  }, [overviewData]);

  const openRosterStudent = async (student) => {
    setSelectedRosterStudent(student);
    setRosterStudentDetails(null);
    setRosterStudentDetailsError('');
    setRosterStudentDetailsLoading(true);
    try {
      const response = await api.get(`/map-test-prep/practice/students/${student._id}/plans`);
      setRosterStudentDetails(response.data?.data || {});
    } catch (requestError) {
      setRosterStudentDetailsError(requestError.response?.data?.message || t('mapTestPrep:overview.details.loadFailed'));
    } finally {
      setRosterStudentDetailsLoading(false);
    }
  };

  const assignRosterSet = async (plan, set) => {
    const setId = String(set._id);
    setRosterAssigningSetId(setId);
    setRosterStudentDetailsError('');
    try {
      const response = await api.post('/map-test-prep/practice/assignments', {
        studentId: selectedRosterStudent._id,
        planId: plan._id,
        setId: set._id,
        dueDate: rosterAssignmentDueDates[setId] || null
      });
      const assignment = response.data?.data?.assignment;
      if (assignment) {
        setRosterStudentDetails((current) => ({
          ...current,
          assignments: [...(current?.assignments || []).filter((item) => String(item.set?._id || item.set) !== setId), assignment]
        }));
      }
    } catch (requestError) {
      setRosterStudentDetailsError(requestError.response?.data?.message || t('mapTestPrep:overview.details.assignFailed'));
    } finally {
      setRosterAssigningSetId(null);
    }
  };

  const deleteRosterSet = async (set) => {
    if (!window.confirm(t('mapTestPrep:overview.details.deleteSetConfirm', { title: set.title }))) return;
    const setId = String(set._id);
    setRosterDeletingSetId(setId);
    setRosterStudentDetailsError('');
    try {
      const response = await api.delete(`/map-test-prep/practice/sets/${setId}`);
      const removedSkillIds = new Set((response.data?.data?.removedSkillIds || []).map(String));
      setRosterStudentDetails((current) => ({
        ...current,
        sets: (current?.sets || []).filter((item) => String(item._id) !== setId),
        assignments: (current?.assignments || []).filter((item) => String(item.set?._id || item.set) !== setId),
        attempts: (current?.attempts || []).filter((item) => String(item.set) !== setId),
        skills: (current?.skills || []).filter((item) => !removedSkillIds.has(String(item.skill?._id || item.skill))),
      }));
    } catch (requestError) {
      setRosterStudentDetailsError(requestError.response?.data?.message || t('mapTestPrep:overview.details.deleteSetFailed'));
    } finally {
      setRosterDeletingSetId(null);
    }
  };

  const loadSettings = async () => {
    try {
      const response = await api.get('/map-test-prep/practice/settings');
      const nextSettings = response.data?.data?.settings || {};
      setSettings((current) => ({ ...current, ...nextSettings }));
    } catch {
      // keep defaults if unavailable
    }
  };

  const previewUploads = async (uploads, overrides = {}) => {
    if (!uploads.length) {
      dispatchImport({ type: 'RESET' });
      return;
    }
    dispatchImport({ type: 'FILES_SELECTED', files: uploads });
    dispatchImport({ type: 'PREVIEW_START', overrides });
    const formData = new FormData();
    uploads.forEach((file) => formData.append('files', file));
    if (Object.keys(overrides).length) formData.append('overrides', JSON.stringify(overrides));
    try {
      const response = await api.post('/map-test-prep/practice/import/preview', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const data = response.data?.data || {};
      if (!Array.isArray(data.files)) throw new Error(t('mapTestPrep:import.invalidPreview'));
      dispatchImport({ type: 'PREVIEW_SUCCESS', previews: data.files, uploads, token: data.token, tokenExpiresAt: data.tokenExpiresAt });
    } catch (requestError) {
      dispatchImport({ type: 'PREVIEW_FAIL', message: requestError.response?.data?.message || requestError.message || t('mapTestPrep:import.previewFailed') });
    }
  };

  const addImportFiles = async (fileList) => {
    if (importState.phase === 'importing') return;
    const incoming = Array.from(fileList || []);
    const rejected = incoming.filter((file) => !file.name.toLowerCase().endsWith('.csv') || file.size > 2 * 1024 * 1024);
    const allowed = incoming.filter((file) => file.name.toLowerCase().endsWith('.csv') && file.size <= 2 * 1024 * 1024);
    let uploads = [...importState.uploads];
    const knownHashes = new Set();
    for (const file of uploads) knownHashes.add(await getFileHash(file));
    for (const file of allowed) {
      const hash = await getFileHash(file);
      if (!knownHashes.has(hash)) {
        knownHashes.add(hash);
        uploads.push(file);
      }
    }
    if (rejected.length) dispatchImport({ type: 'PREVIEW_FAIL', message: t('mapTestPrep:import.rejectedFiles', { count: rejected.length }) });
    if (uploads.length > 30) {
      dispatchImport({ type: 'PREVIEW_FAIL', message: t('mapTestPrep:import.fileLimit') });
      return;
    }
    if (uploads.length) {
      const overrides = {};
      importState.files.forEach((preview, index) => {
        if (preview.matchedBy === 'manual' && preview.student?.id) overrides[index] = preview.student.id;
      });
      await previewUploads(uploads, overrides);
    }
  };

  const handlePreviewFiles = (event) => {
    void addImportFiles(event.target.files);
    event.target.value = '';
  };

  const resolveImportStudent = async (fileHash, studentId) => {
    const overrides = {};
    const nextUploads = importState.files.map((preview, index) => {
      if (preview.fileHash === fileHash) overrides[index] = studentId;
      else if (preview.matchedBy === 'manual' && preview.student?.id) overrides[index] = preview.student.id;
      return preview.uploadFile;
    });
    await previewUploads(nextUploads, overrides);
  };

  const removeImportFile = async (fileHash) => {
    const remaining = importState.files.filter((file) => file.fileHash !== fileHash);
    const overrides = {};
    remaining.forEach((file, index) => {
      if (file.matchedBy === 'manual' && file.student?.id) overrides[index] = file.student.id;
    });
    await previewUploads(remaining.map((file) => file.uploadFile), overrides);
  };

  const archiveQuestionsNotInFile = async (file) => {
    try {
      const response = await api.post('/map-test-prep/practice/import/archive-not-in-file', { token: importState.token, fileHash: file.fileHash });
      setArchivedCounts((current) => ({ ...current, [file.fileHash]: response.data?.data?.archived || 0 }));
    } catch (requestError) {
      setError(requestError.response?.data?.message || t('mapTestPrep:import.archiveFailed'));
    }
  };

  const assignImportedSet = async (item) => {
    try {
      await api.post('/map-test-prep/practice/assignments', { studentId: item.studentMongoId, planId: item.planId, setId: item.firstSetId });
      setAssignedSetIds((current) => ({ ...current, [item.name]: true }));
    } catch (requestError) {
      setError(requestError.response?.data?.message || t('mapTestPrep:import.assignFailed'));
    }
  };

  const importFiles = async () => {
    dispatchImport({ type: 'IMPORT_START' });
    const overrides = {};
    importState.files.forEach((file, index) => {
      if (file.matchedBy === 'manual' && file.student?.id) overrides[index] = file.student.id;
    });
    try {
      const response = await api.post('/map-test-prep/practice/import/commit', {
        token: importState.token,
        files: importState.files.map(({ fileName, fileHash }) => ({ fileName, fileHash })),
        errorMode: importState.errorMode,
        previews: importState.files.map(({ fileHash, errors }) => ({ fileHash, errors })),
        options: { ...skillOptions, overrides, assignFirstSet: { enabled: importState.assignFirstSet, dueDate: importState.dueDate } }
      }, { timeout: 120000 });
      dispatchImport({ type: 'IMPORT_DONE', result: response.data?.data || {} });
      await loadClasses();
    } catch (requestError) {
      if (importState.token) {
        try {
          let statusResponse;
          for (let attempt = 0; attempt < 4; attempt += 1) {
            statusResponse = await api.get(`/map-test-prep/practice/import/status/${encodeURIComponent(importState.token)}`);
            if (statusResponse.data?.data?.committed) break;
            if (attempt < 3) await new Promise((resolve) => window.setTimeout(resolve, 1000));
          }
          const committedImport = statusResponse?.data?.data;
          if (committedImport?.committed) {
            dispatchImport({ type: 'IMPORT_DONE', result: committedImport });
            await loadClasses();
            return;
          }
        } catch {
          // Keep the original commit error visible if the status check also fails.
        }
      }

      const serverMessage = requestError.response?.data?.message;
      const requestId = requestError.response?.data?.requestId;
      const message = serverMessage
        ? (requestId ? `${serverMessage} (${t('mapTestPrep:import.requestId', { id: requestId })})` : serverMessage)
        : t('mapTestPrep:import.commitNetworkFailed');
      dispatchImport({ type: 'PREVIEW_FAIL', message, retryAction: 'commit' });
    }
  };

  const saveSettings = async () => {
    try {
      await api.put('/map-test-prep/practice/settings', settings);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save settings.');
    }
  };

  useEffect(() => {
    loadClasses();
    loadSettings();
  }, []);

  useEffect(() => {
    if (selectedClass?._id) {
      loadStudents(selectedClass._id);
    } else if (activeTab === 'students') {
      setStudents(allStudents);
    }
  }, [selectedClass?._id, overviewData, activeTab, allStudents, loadStudents]);

  const rosterStudents = selectedClass ? students : allStudents;
  const filteredRosterStudents = selectedRosterStudentId
    ? rosterStudents.filter((student) => String(student._id) === selectedRosterStudentId)
    : rosterStudents;

  const practiceScoreHistory = useMemo(() => (rosterStudentDetails?.attempts || [])
    .filter((attempt) => attempt.submittedAt && Number(attempt.maxScore) > 0)
    .map((attempt) => ({
      date: new Date(attempt.submittedAt).toLocaleDateString(),
      score: Math.round((Number(attempt.score) / Number(attempt.maxScore)) * 100),
      set: rosterStudentDetails.sets?.find((item) => String(item._id) === String(attempt.set))?.title || ''
    }))
    .reverse(), [rosterStudentDetails]);

  const practiceSkillPerformance = useMemo(() => {
    const bySkill = new Map();
    (rosterStudentDetails?.attempts || []).forEach((attempt) => {
      (attempt.answers || []).forEach((answer) => {
        const skill = answer.question?.skill;
        if (answer.isCorrect === null || answer.isCorrect === undefined || !skill) return;
        const key = String(skill._id || skill.code);
        const stat = bySkill.get(key) || { key, name: skill.name || skill.code, total: 0, correct: 0 };
        stat.total += 1;
        if (answer.isCorrect) stat.correct += 1;
        bySkill.set(key, stat);
      });
    });
    return [...bySkill.values()]
      .map((skill) => ({ ...skill, accuracy: Math.round((skill.correct / skill.total) * 100) }))
      .sort((first, second) => first.accuracy - second.accuracy);
  }, [rosterStudentDetails]);

  if (loading) {
    return <div className="map-prep-page"><div className="map-prep-state">Loading MAP Practice...</div></div>;
  }

  return (
    <div className="map-prep-page">
      <header className="map-prep-header">
        <div>
          <p className="map-prep-eyebrow">MAP practice</p>
          <h1>MAP Practice</h1>
          <p className="map-prep-subtitle">Import student practice files, review short-text answers, and keep individual practice private.</p>
        </div>
      </header>

      <nav className="map-prep-progress" aria-label="MAP practice tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={activeTab === tab.key ? 'map-topic-card selected' : 'map-topic-card'}
            onClick={() => setActiveTab(tab.key)}
            style={{ cursor: 'pointer', minWidth: 130 }}
          >
            <strong>{tab.label}</strong>
          </button>
        ))}
      </nav>

      {error && <div className="map-prep-error">{error}</div>}

      {activeTab === 'students' && (
        <section className="map-prep-section">
          <div className="map-section-heading">
            <div>
              <p className="map-section-kicker">{t('mapTestPrep:tabs.students')}</p>
              <h2>{selectedClass ? selectedClass.name : t('mapTestPrep:tabs.students')}</h2>
            </div>
          </div>
          <div className="map-roster-filters">
            <label>
              <span>{t('mapTestPrep:overview.classFilter')}</span>
              <select
                value={selectedClass?._id || ''}
                onChange={(event) => {
                  const nextClass = classes.find((item) => String(item._id) === event.target.value) || null;
                  setSelectedClass(nextClass);
                  setSelectedRosterStudent(null);
                  setSelectedRosterStudentId('');
                  setRosterStudentDetails(null);
                }}
              >
                <option value="">{t('mapTestPrep:overview.allClasses')}</option>
                {classes.map((classItem) => <option key={classItem._id} value={classItem._id}>{classItem.name}</option>)}
              </select>
            </label>
            <label>
              <span>{t('mapTestPrep:overview.studentFilter')}</span>
              <select
                value={selectedRosterStudentId}
                onChange={(event) => {
                  const nextStudent = rosterStudents.find((item) => String(item._id) === event.target.value);
                  setSelectedRosterStudentId(event.target.value);
                  if (nextStudent) void openRosterStudent(nextStudent);
                  else {
                    setSelectedRosterStudent(null);
                    setRosterStudentDetails(null);
                    setRosterStudentDetailsError('');
                  }
                }}
              >
                <option value="">{t('mapTestPrep:overview.allStudents')}</option>
                {rosterStudents.map((student) => <option key={student._id} value={student._id}>{student.firstName} {student.lastName} · {student.studentId}</option>)}
              </select>
            </label>
          </div>
          {rosterStudents.length > 0 ? (
            <>
              <div className="map-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t('mapTestPrep:overview.studentColumn')}</th>
                      <th>{t('mapTestPrep:overview.planColumn')}</th>
                      <th>{t('mapTestPrep:overview.focusSkills')}</th>
                      <th>{t('mapTestPrep:overview.thisWeek')}</th>
                      <th>{t('mapTestPrep:overview.accuracy')}</th>
                      <th>{t('mapTestPrep:overview.lastPractice')}</th>
                      <th>{t('mapTestPrep:overview.statusColumn')}</th>
                      <th>{t('mapTestPrep:overview.actionColumn')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRosterStudents.map((student) => {
                      const plan = overviewData?.plans?.find((item) => String(item.student) === String(student._id));
                      const metrics = student.practiceMetrics || {};
                      const status = metrics.status || (plan ? 'notStarted' : 'noPracticeFile');
                      return (
                      <tr key={student._id}>
                        <td>{student.firstName} {student.lastName}<small>{student.studentId}</small></td>
                        <td>{plan?.title || t('mapTestPrep:overview.noPracticeFile')}</td>
                        <td><div className="map-focus-skills">{(metrics.focusSkills || []).slice(0, 3).map((skill) => <span key={skill.code} title={`${skill.accuracy}%`}>{skill.name}</span>)}{(metrics.focusSkills || []).length > 3 && <small>+{metrics.focusSkills.length - 3}</small>}{!metrics.focusSkills?.length && '—'}</div></td>
                        <td>{metrics.finishedThisWeek || 0} / {metrics.assigned || 0}</td>
                        <td>{metrics.accuracy === null || metrics.accuracy === undefined ? '—' : `${metrics.accuracy}%`}</td>
                        <td>{metrics.lastPractice ? new Date(metrics.lastPractice).toLocaleDateString() : '—'}</td>
                        <td><span className={`map-status map-roster-status ${status}`}>{t(`mapTestPrep:overview.status.${status}`)}</span></td>
                        <td><button type="button" className="btn btn-secondary" onClick={() => { setSelectedRosterStudentId(String(student._id)); if (plan) void openRosterStudent(student); else setActiveTab('import'); }}>{plan ? t('mapTestPrep:overview.open') : t('mapTestPrep:overview.importFile')}</button></td>
                      </tr>
                    ); })}
                  </tbody>
                </table>
              </div>
              {selectedRosterStudent && (
                <aside className="map-roster-student-detail" aria-live="polite">
                  <div className="map-roster-detail-header">
                    <div>
                      <h3>{selectedRosterStudent.firstName} {selectedRosterStudent.lastName}</h3>
                      <span>{selectedRosterStudent.studentId} · {selectedRosterStudent.currentClass?.name || selectedClass?.name || ''}</span>
                    </div>
                    <button type="button" className="btn btn-secondary" onClick={() => { setSelectedRosterStudent(null); setSelectedRosterStudentId(''); setRosterStudentDetails(null); }}>{t('mapTestPrep:overview.close')}</button>
                  </div>
                  {rosterStudentDetailsLoading && <p role="status">{t('mapTestPrep:overview.details.loading')}</p>}
                  {rosterStudentDetailsError && <p className="map-prep-error" role="alert">{rosterStudentDetailsError}</p>}
                  {!rosterStudentDetailsLoading && rosterStudentDetails && (
                    <>
                      <div className="map-roster-chart-grid">
                        <section className="map-roster-chart-card">
                          <h4>{t('mapTestPrep:overview.details.practiceTrend')}</h4>
                          {practiceScoreHistory.length ? (
                            <ResponsiveContainer width="100%" height={280}>
                              <LineChart data={practiceScoreHistory}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis domain={[0, 100]} unit="%" />
                                <Tooltip formatter={(value) => [`${value}%`, t('mapTestPrep:overview.accuracy')]} />
                                <Line type="monotone" dataKey="score" name={t('mapTestPrep:overview.accuracy')} stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
                              </LineChart>
                            </ResponsiveContainer>
                          ) : <p>{t('mapTestPrep:overview.details.noPracticeTrend')}</p>}
                        </section>
                      </div>
                      <section className="map-roster-chart-card map-roster-skill-chart">
                        <h4>{t('mapTestPrep:overview.details.skillAccuracy')}</h4>
                                        <div className="map-skill-accuracy-legend" aria-label={t('mapTestPrep:overview.details.accuracyLevels')}>
                                          <span><i className="low" />{t('mapTestPrep:overview.details.needsSupport')}</span>
                          <span><i className="medium" />{t('mapTestPrep:overview.details.developingAccuracy')}</span>
                          <span><i className="high" />{t('mapTestPrep:overview.details.strongAccuracy')}</span>
                        </div>
                        {practiceSkillPerformance.length ? (
                          <ResponsiveContainer width="100%" height={Math.max(260, practiceSkillPerformance.length * 38)}>
                            <BarChart data={practiceSkillPerformance} layout="vertical" margin={{ left: 12, right: 24 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis type="number" domain={[0, 100]} unit="%" />
                              <YAxis type="category" dataKey="name" width={150} />
                              <Tooltip formatter={(value, _name, item) => [`${value}% (${item.payload.correct}/${item.payload.total})`, t('mapTestPrep:overview.details.skillAccuracy')]} />
                              <Bar dataKey="accuracy" name={t('mapTestPrep:overview.details.skillAccuracy')} radius={[0, 5, 5, 0]}>
                                {practiceSkillPerformance.map((skill) => (
                                  <Cell
                                    key={skill.key}
                                    fill={skill.accuracy < 60 ? '#dc2626' : skill.accuracy < 80 ? '#f59e0b' : '#16a34a'}
                                  />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        ) : <p>{t('mapTestPrep:overview.details.noSkillResults')}</p>}
                      </section>
                      {(rosterStudentDetails.mapRecords || []).length > 0 && (
                        <section className="map-roster-map-records">
                          <h4>{t('mapTestPrep:overview.details.mapDetails')}</h4>
                          {rosterStudentDetails.mapRecords.map((record) => {
                          const subject = record.importedSubject || record.mapEvidence?.[0]?.subject || '—';
                          const rit = record.ritScore ?? record.mapEvidence?.find((item) => item.ritScore !== null && item.ritScore !== undefined)?.ritScore;
                          const areas = record.domainScores || [];
                          const skills = record.skillResults || [];
                          return (
                            <article className="map-roster-map-record" key={String(record._id)}>
                              <div className="map-roster-plan-heading">
                                <div><h5>{subject}</h5><span>{record.testDate ? new Date(record.testDate).toLocaleDateString() : t('mapTestPrep:overview.details.dateNotRecorded')} · {record.academicYear || ''}</span></div>
                                <span>{record.extractionStatus ? t(`mapTestPrep:overview.details.recordStatus.${record.extractionStatus}`) : ''}</span>
                              </div>
                              <div className="map-metric-grid compact">
                                <div className="map-metric-card"><span>{t('mapTestPrep:overview.details.ritScore')}</span><strong>{rit ?? '—'}</strong></div>
                                <div className="map-metric-card"><span>{t('mapTestPrep:overview.details.percentile')}</span><strong>{record.percentile ?? '—'}</strong></div>
                                <div className="map-metric-card"><span>{t('mapTestPrep:overview.details.growthPercentile')}</span><strong>{record.growthPercentile ?? '—'}</strong></div>
                              </div>
                              {(areas.length > 0 || skills.length > 0) && (
                                <div className="map-roster-map-skills">
                                  {[...areas.map((area) => ({ name: area.name || area.instructionalArea || area.domain, score: area.score ?? area.instructionalAreaScore, status: area.instructionalAreaStatus, skills: area.skills || [] })), ...skills.map((skill) => ({ name: skill.name || skill.code, score: skill.score, status: '', skills: [] }))].map((item, index) => (
                                    <div key={`${record._id}-${item.name}-${index}`}>
                                      <strong>{item.name || '—'}</strong>
                                      <span>{item.score ?? '—'}{item.status ? ` · ${t(`mapTestPrep:overview.details.areaStatus.${item.status}`)}` : ''}</span>
                                      {item.skills.length > 0 && <small>{item.skills.join(' · ')}</small>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </article>
                          );
                          })}
                        </section>
                      )}
                      {rosterStudentDetails.plans?.length ? rosterStudentDetails.plans.map((plan) => {
                      const planId = String(plan._id);
                      const planSets = (rosterStudentDetails.sets || []).filter((set) => String(set.plan) === planId);
                      const planSkills = (rosterStudentDetails.skills || []).filter((item) => String(item.plan) === planId);
                      const planAssignments = (rosterStudentDetails.assignments || []).filter((item) => String(item.plan) === planId);
                      const planAttempts = (rosterStudentDetails.attempts || []).filter((attempt) => String(attempt.plan) === planId);
                      return (
                        <section className="map-roster-plan-detail" key={planId}>
                          <div className="map-roster-plan-heading">
                            <div><h4>{plan.title}</h4><span>{plan.academicYear} · {t(`mapTestPrep:overview.details.planStatus.${plan.status}`)}</span></div>
                            {plan.sourceStudentId && <small>{t('mapTestPrep:overview.details.sourceId', { id: plan.sourceStudentId })}</small>}
                          </div>
                          <p className="map-roster-generation-note">{t('mapTestPrep:overview.details.generationInfo')}</p>
                          <section>
                            <h5>{t('mapTestPrep:overview.details.sets')}</h5>
                            {planSets.length ? planSets.map((set) => {
                              const setId = String(set._id);
                              const assignment = planAssignments.find((item) => String(item.set?._id || item.set) === setId && !['closed', 'draft'].includes(item.status));
                              const attempt = planAttempts.find((item) => String(item.set) === setId);
                              return (
                                <article className="map-roster-detail-row" key={setId}>
                                  <div><strong>{set.title}</strong><span>{t('mapTestPrep:overview.details.setQuestions', { count: set.questionCount || 0 })} · {t(`mapTestPrep:overview.details.setStatus.${set.status}`)}</span></div>
                                  <div className="map-roster-assignment-control">
                                    {assignment ? <span>{t('mapTestPrep:overview.details.assigned')}{assignment.dueDate ? ` · ${new Date(assignment.dueDate).toLocaleDateString()}` : ''}</span> : <><span>{t('mapTestPrep:overview.details.notAssigned')}</span><label><span>{t('mapTestPrep:overview.details.dueDate')}</span><input type="date" value={rosterAssignmentDueDates[setId] || ''} onChange={(event) => setRosterAssignmentDueDates((current) => ({ ...current, [setId]: event.target.value }))} /></label><button type="button" className="btn btn-primary" disabled={rosterAssigningSetId === setId} onClick={() => void assignRosterSet(plan, set)}>{rosterAssigningSetId === setId ? t('mapTestPrep:overview.details.assigning') : t('mapTestPrep:overview.details.assign')}</button></>}
                                    <button type="button" className="btn btn-secondary map-set-delete-button" disabled={rosterDeletingSetId === setId} onClick={() => void deleteRosterSet(set)}>{rosterDeletingSetId === setId ? t('mapTestPrep:overview.details.deletingSet') : t('mapTestPrep:overview.details.deleteSet')}</button>
                                    {attempt && <small>{t('mapTestPrep:overview.details.attemptStatus', { status: t(`mapTestPrep:overview.details.attempt.${attempt.status}`), score: attempt.maxScore ? `${attempt.score}/${attempt.maxScore}` : '—' })}</small>}
                                  </div>
                                </article>
                              );
                            }) : <p>{t('mapTestPrep:overview.details.noSets')}</p>}
                          </section>
                          <section>
                            <h5>{t('mapTestPrep:overview.details.skills')}</h5>
                            {planSkills.length ? <div className="map-roster-skill-list">{planSkills.map((item) => <span key={String(item._id)}>{item.skill?.name || item.skill?.code || '—'} · {t(`mapTestPrep:overview.details.skillStatus.${item.status}`)}</span>)}</div> : <p>{t('mapTestPrep:overview.details.noSkills')}</p>}
                          </section>
                          <section>
                            <h5>{t('mapTestPrep:overview.details.recentAttempts')}</h5>
                            {planAttempts.length ? <ul className="map-roster-attempt-list">{planAttempts.slice(0, 5).map((attempt) => <li key={String(attempt._id)}><span>{rosterStudentDetails.sets?.find((set) => String(set._id) === String(attempt.set))?.title || '—'}</span><span>{attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleDateString() : '—'}</span><span>{t(`mapTestPrep:overview.details.attempt.${attempt.status}`)}</span><span>{attempt.maxScore ? `${attempt.score}/${attempt.maxScore}` : '—'}</span></li>)}</ul> : <p>{t('mapTestPrep:overview.details.noAttempts')}</p>}
                          </section>
                        </section>
                      );
                      }) : <p>{t('mapTestPrep:overview.details.noPlans')}</p>}
                    </>
                  )}
                </aside>
              )}
            </>
          ) : <div className="map-prep-empty"><strong>{t('mapTestPrep:overview.noStudents')}</strong></div>}
        </section>
      )}

      {activeTab === 'import' && (
        <section className="map-prep-section">
          <div className="map-section-heading">
            <div>
              <p className="map-section-kicker">{t('mapTestPrep:tabs.import')}</p>
              <h2>{t('mapTestPrep:import.title')}</h2>
            </div>
          </div>

          {importState.phase !== 'done' && (
            <>
              <div
                className={`map-import-dropzone ${draggingFiles ? 'dragging' : ''}`}
                onDragOver={(event) => { event.preventDefault(); setDraggingFiles(true); }}
                onDragLeave={() => setDraggingFiles(false)}
                onDrop={(event) => { event.preventDefault(); setDraggingFiles(false); void addImportFiles(event.dataTransfer.files); }}
              >
                <strong>{t('mapTestPrep:import.dropzone')}</strong>
                <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={importState.phase === 'importing'}>
                  {t('mapTestPrep:import.chooseFiles')}
                </button>
                <input ref={fileInputRef} type="file" accept=".csv,text/csv" multiple onChange={handlePreviewFiles} hidden />
              </div>
              <div className="map-import-downloads">
                <button type="button" className="map-text-button" onClick={() => downloadTextFile('map-practice-template.csv', 'student_id,plan_title,set_id,set_title,set_order,question_id,order,subject,strand,skill_code,skill_name,rit_band,passage_id,passage_title,passage_text,question_type,stem,option_a,option_b,option_c,option_d,correct_answer,explanation,distractor_note,points\n')}>{t('mapTestPrep:import.blankTemplate')}</button>
                <button type="button" className="map-text-button" onClick={() => downloadTextFile('map-practice-example.csv', 'student_id,plan_title,set_id,set_title,set_order,question_id,order,subject,strand,skill_code,skill_name,rit_band,passage_id,passage_title,passage_text,question_type,stem,option_a,option_b,option_c,option_d,correct_answer,explanation,distractor_note,points\nEXAMPLE-001,Example plan,SET-1,Sample set,1,Q-1,1,Reading,Vocabulary,VOC-1,Context clues,201-210,,, ,mcq,What does sample mean?,example,practice,question,word,A,Sample explanation,,1\n')}>{t('mapTestPrep:import.exampleFile')}</button>
              </div>
              {importState.error && (
                <div className="map-prep-error" role="alert">
                  <span>{importState.error}</span>
                  {importState.phase === 'error' && importState.uploads.length > 0 && <button type="button" className="btn btn-secondary" onClick={() => importState.retryAction === 'commit' ? void importFiles() : void previewUploads(importState.uploads, importState.pendingOverrides)}>{t('mapTestPrep:import.tryAgain')}</button>}
                </div>
              )}
              {importState.phase === 'previewing' && <div className="map-import-checking" role="status"><span className="map-import-spinner" />{t('mapTestPrep:import.checking')}</div>}
              {importState.files.map((file) => {
                const searchValue = importStudentSearch[file.fileHash] || '';
                const query = searchValue.trim().toLocaleLowerCase();
                const filteredStudents = importStudents.filter((student) => [student.firstName, student.lastName, student.email, student.studentId].filter(Boolean).some((value) => String(value).toLocaleLowerCase().includes(query))).slice(0, 8);
                const isMatched = Boolean(file.student?.id);
                const statusLabel = file.status === 'ready' ? t('mapTestPrep:import.status.ready') : file.status === 'ready_with_warnings' ? t('mapTestPrep:import.status.readyWarnings') : file.status === 'needs_student' ? t('mapTestPrep:import.status.needsStudent') : t('mapTestPrep:import.status.errors');
                const typeSummary = t('mapTestPrep:import.questionTypesSummary', { mcq: file.questionTypes?.mcq || 0, multi: file.questionTypes?.multi_select || 0, short: file.questionTypes?.short_text || 0 });
                return (
                  <article key={file.fileHash} className="map-import-file-card">
                    <div className="map-record-header">
                      <div className="map-import-file-title"><strong>{file.fileName}</strong><small>{(file.uploadFile?.size / 1024).toFixed(0)} KB</small></div>
                      <span className={`map-status map-import-status ${file.status}`}>{statusLabel}</span>
                      <button type="button" className="map-remove-button" aria-label={t('mapTestPrep:import.removeFile', { name: file.fileName })} title={t('mapTestPrep:import.remove')} onClick={() => void removeImportFile(file.fileHash)} disabled={importState.phase === 'importing'}>×</button>
                    </div>
                    <dl className="map-import-summary">
                      <div><dt>{t('mapTestPrep:import.student')}</dt><dd>{isMatched ? <><strong>{file.student.name}</strong><span>{file.student.className || t('mapTestPrep:import.noClass')} · {file.student.studentId}</span><small>{t(`mapTestPrep:import.matchedBy.${file.matchedBy}`)}</small></> : <><strong>{file.csvStudentId || t('mapTestPrep:import.unknownId')}</strong><span className="map-not-found">{t('mapTestPrep:import.notFound')}</span></>}</dd></div>
                      <div><dt>{t('mapTestPrep:import.plan')}</dt><dd>{file.planTitle || '—'}</dd></div>
                      <div><dt>{t('mapTestPrep:import.rows')}</dt><dd>{file.rows}</dd></div>
                      <div><dt>{t('mapTestPrep:import.sets')}</dt><dd>{file.sets?.length || 0}</dd></div>
                      <div><dt>{t('mapTestPrep:import.skills')}</dt><dd>{file.skills?.length || 0}</dd></div>
                      <div><dt>{t('mapTestPrep:import.questionTypes')}</dt><dd>{typeSummary}</dd></div>
                      <div><dt>{t('mapTestPrep:import.passages')}</dt><dd>{file.passages || 0}</dd></div>
                      <div><dt>{t('mapTestPrep:import.changeSummary')}</dt><dd>{t('mapTestPrep:import.changeCounts', { create: file.willCreate || 0, update: file.willUpdate || 0 })}</dd></div>
                    </dl>
                    {!isMatched && file.status === 'needs_student' && (
                      <div className="map-student-match-panel">
                        <p>{t('mapTestPrep:import.unmatchedMessage', { studentId: file.csvStudentId || file.filenameStudentId || '—' })}</p>
                        <label htmlFor={`student-search-${file.fileHash}`}>{t('mapTestPrep:import.chooseStudent')}</label>
                        <input id={`student-search-${file.fileHash}`} type="search" value={searchValue} placeholder={t('mapTestPrep:import.searchStudents')} onChange={(event) => setImportStudentSearch((current) => ({ ...current, [file.fileHash]: event.target.value }))} />
                        <div className="map-student-match-list">
                          {filteredStudents.map((student) => <button key={student._id} type="button" className="map-student-match-item" onClick={() => void resolveImportStudent(file.fileHash, student._id)}><span>{student.firstName} {student.lastName}</span><small>{student.currentClass?.name || t('mapTestPrep:import.noClass')} · {student.studentId}</small></button>)}
                          {!filteredStudents.length && <span className="map-student-match-empty">{t('mapTestPrep:import.noStudents')}</span>}
                        </div>
                      </div>
                    )}
                    <details className="map-import-details" open={Boolean(expandedFiles[file.fileHash])} onToggle={(event) => setExpandedFiles((current) => ({ ...current, [file.fileHash]: event.currentTarget.open }))}>
                      <summary>{t('mapTestPrep:import.showDetails')}</summary>
                      <div className="map-import-detail-grid">
                        <section><h3>{t('mapTestPrep:import.sets')}</h3><table><thead><tr><th>{t('mapTestPrep:import.titleColumn')}</th><th>{t('mapTestPrep:import.questionCount')}</th></tr></thead><tbody>{(file.sets || []).map((set) => <tr key={set.setId}><td>{set.title}</td><td>{set.questionCount}</td></tr>)}</tbody></table></section>
                        <section>
                          <h3>{t('mapTestPrep:import.skills')}</h3>
                          <div className="map-import-skill-list">
                            {(file.skills || []).map((skill) => (
                              <label key={skill.code} className="map-import-skill">
                                <span>{skill.code} · {skill.name} ({skill.questionCount})</span>
                                {skill.isNew && <span><input type="checkbox" checked={skillOptions.createNewSkills[skill.code] !== false} aria-label={t('mapTestPrep:import.createSkill', { name: skill.name })} onChange={(event) => setSkillOptions((current) => ({ ...current, createNewSkills: { ...current.createNewSkills, [skill.code]: event.target.checked } }))} />{t('mapTestPrep:import.createSkill', { name: skill.name })}</span>}
                                {skill.similarTo && <><small>{t('mapTestPrep:import.similarSkill', { name: skill.similarTo.name })}</small><select aria-label={t('mapTestPrep:import.useExistingSkill', { name: skill.name })} value={skillOptions.useExistingSkill[skill.code] || ''} onChange={(event) => setSkillOptions((current) => ({ ...current, useExistingSkill: { ...current.useExistingSkill, [skill.code]: event.target.value } }))}><option value="">{t('mapTestPrep:import.createNewSkill')}</option><option value={skill.similarTo.code}>{t('mapTestPrep:import.useExistingSkillOption', { name: skill.similarTo.name })}</option></select></>}
                              </label>
                            ))}
                          </div>
                        </section>
                        {file.errors?.length > 0 && <section><h3>{t('mapTestPrep:import.errorsTitle', { count: file.errors.length })}</h3><table><thead><tr><th>{t('mapTestPrep:import.row')}</th><th>{t('mapTestPrep:import.column')}</th><th>{t('mapTestPrep:import.problem')}</th><th>{t('mapTestPrep:import.fix')}</th></tr></thead><tbody>{file.errors.map((item, index) => <tr key={`${file.fileHash}-error-${index}`}><td>{item.row}</td><td>{item.column}</td><td>{item.problem}</td><td>{item.fix}</td></tr>)}</tbody></table><button type="button" className="btn btn-secondary" onClick={() => downloadTextFile(`${file.fileName}-errors.csv`, `row,column,problem,fix\n${file.errors.map((item) => [item.row, item.column, item.problem, item.fix].map((value) => `"${String(value || '').replaceAll('"', '""')}"`).join(',')).join('\n')}\n`)}>{t('mapTestPrep:import.downloadErrors')}</button></section>}
                        {file.warnings?.length > 0 && <section><h3>{t('mapTestPrep:import.warnings')}</h3><ul>{file.warnings.map((warning, index) => <li key={`${file.fileHash}-warning-${index}`}>{warning.message || warning}</li>)}</ul></section>}
                        <section><h3>{t('mapTestPrep:import.notInNewFile')}</h3><p>{file.notInNewFile || 0}</p></section>
                      </div>
                    </details>
                  </article>
                );
              })}
            </>
          )}

          {importState.phase === 'done' && (
            <div className="map-import-done" role="status">
              <h3>{t('mapTestPrep:import.complete')}</h3>
              {(importState.result?.imported || []).map((item, index) => {
                const preview = importState.files.find((file) => file.fileName === item.name);
                const student = allStudents.find((record) => String(record._id) === String(item.studentMongoId));
                return <article key={`${item.name}-${index}`}><div><strong>{item.studentName || item.studentId}</strong><span>{t('mapTestPrep:import.resultCounts', { created: item.created || 0, updated: item.updated || 0, skipped: item.skipped || 0 })}</span></div><div className="map-import-result-actions"><button type="button" className="btn btn-secondary" onClick={() => { setSelectedClass(null); setActiveTab('students'); if (student) void openRosterStudent(student); }}>{t('mapTestPrep:import.openStudent')}</button><button type="button" className="btn btn-secondary" disabled={!item.firstSetId || assignedSetIds[item.name]} onClick={() => void assignImportedSet(item)}>{assignedSetIds[item.name] ? t('mapTestPrep:import.assigned') : t('mapTestPrep:import.assignSet')}</button>{item.skipped > 0 && preview?.errors?.length > 0 && <button type="button" className="btn btn-secondary" onClick={() => downloadTextFile(`${item.name}-errors.csv`, `row,column,problem,fix\n${preview.errors.map((errorItem) => [errorItem.row, errorItem.column, errorItem.problem, errorItem.fix].map((value) => `"${String(value || '').replaceAll('"', '""')}"`).join(',')).join('\n')}\n`)}>{t('mapTestPrep:import.downloadErrors')}</button>}{(preview?.notInNewFile || 0) > 0 && <button type="button" className="btn btn-secondary" disabled={archivedCounts[preview.fileHash] !== undefined} onClick={() => void archiveQuestionsNotInFile(preview)}>{archivedCounts[preview.fileHash] !== undefined ? t('mapTestPrep:import.archivedQuestions', { count: archivedCounts[preview.fileHash] }) : t('mapTestPrep:import.archiveQuestions', { count: preview.notInNewFile })}</button>}</div></article>;
              })}
              <div className="map-import-done-actions"><button type="button" className="btn btn-secondary" onClick={() => { dispatchImport({ type: 'RESET' }); setActiveTab('students'); }}>{t('mapTestPrep:import.openStudents')}</button><button type="button" className="btn btn-primary" onClick={() => dispatchImport({ type: 'RESET' })}>{t('mapTestPrep:import.importMore')}</button></div>
            </div>
          )}

          {importState.uploads.length === 0 && importState.phase !== 'done' && <div className="map-prep-empty"><strong>{t('mapTestPrep:import.emptyTitle')}</strong><span>{t('mapTestPrep:import.emptyDescription')}</span></div>}

          {importState.files.length > 0 && importState.phase !== 'done' && (
            <div className="map-import-sticky-bar">
              <span>{t('mapTestPrep:import.totals', { files: importState.files.length, ready: importState.files.filter((file) => ['ready', 'ready_with_warnings'].includes(file.status)).length, needsStudent: importState.files.filter((file) => file.status === 'needs_student').length, errors: importState.files.filter((file) => file.status === 'has_errors').length })}</span>
              <div className="map-import-options">
                <label><span>{t('mapTestPrep:import.errorMode')}</span><select value={importState.errorMode} disabled={importState.phase === 'importing'} onChange={(event) => dispatchImport({ type: 'SET_ERROR_MODE', value: event.target.value })}><option value="stop">{t('mapTestPrep:import.stopOnError')}</option><option value="skip">{t('mapTestPrep:import.skipErrors')}</option></select></label>
                <label className="map-import-assignment"><input type="checkbox" checked={importState.assignFirstSet} disabled={importState.phase === 'importing'} onChange={(event) => dispatchImport({ type: 'SET_ASSIGNMENT', enabled: event.target.checked })} />{t('mapTestPrep:import.assignFirstSet')}{importState.assignFirstSet && <input type="date" value={importState.dueDate} onChange={(event) => dispatchImport({ type: 'SET_ASSIGNMENT', enabled: true, dueDate: event.target.value })} />}</label>
              </div>
              <div className="map-import-primary-actions">
                {(() => {
                  const action = getMapPracticeImportAction(importState);
                  return <><button type="button" className="btn btn-primary" disabled={action.disabled || importState.phase === 'importing'} onClick={() => void importFiles()}>{importState.phase === 'importing' ? t('mapTestPrep:import.importing') : t('mapTestPrep:import.importFiles', { count: importState.files.length })}</button><small>{action.reasonKey ? t(`mapTestPrep:import.${action.reasonKey}`, action.values) : ''}</small></>;
                })()}
                <button type="button" className="btn btn-secondary" disabled={importState.phase === 'importing'} onClick={() => dispatchImport({ type: 'RESET' })}>{t('mapTestPrep:import.clearAll')}</button>
              </div>
            </div>
          )}
        </section>
      )}

      {activeTab === 'settings' && (
        <section className="map-prep-section">
          <div className="map-section-heading">
            <div>
              <p className="map-section-kicker">Settings</p>
              <h2>MAP Practice defaults</h2>
            </div>
          </div>

          <div className="map-settings-panel">
            <label>
              <span>Feedback mode</span>
              <select value={settings.feedbackMode} onChange={(event) => setSettings((current) => ({ ...current, feedbackMode: event.target.value }))}>
                <option value="instant">Instant</option>
                <option value="after_submit">After submit</option>
                <option value="after_review">After teacher review</option>
              </select>
            </label>
            <label><input type="checkbox" checked={settings.selfPracticeEnabled} onChange={(event) => setSettings((current) => ({ ...current, selfPracticeEnabled: event.target.checked }))} /> Self-practice enabled</label>
            <label><input type="checkbox" checked={settings.showTimer} onChange={(event) => setSettings((current) => ({ ...current, showTimer: event.target.checked }))} /> Show timers</label>
            <label>
              <span>Low-accuracy threshold (%)</span>
              <input type="number" min="0" max="100" value={settings.lowAccuracyThreshold} onChange={(event) => setSettings((current) => ({ ...current, lowAccuracyThreshold: Number(event.target.value) }))} />
            </label>
            <label>
              <span>Minimum answers before showing skill accuracy</span>
              <input type="number" min="1" max="20" value={settings.minAnswersForAccuracy} onChange={(event) => setSettings((current) => ({ ...current, minAnswersForAccuracy: Number(event.target.value) }))} />
            </label>
            <label>
              <span>No activity days</span>
              <input type="number" min="1" max="30" value={settings.noActivityDays} onChange={(event) => setSettings((current) => ({ ...current, noActivityDays: Number(event.target.value) }))} />
            </label>
            <button type="button" className="btn btn-primary" onClick={saveSettings}>Save settings</button>
          </div>
        </section>
      )}
    </div>
  );
};

export default MapTestPrepPage;
