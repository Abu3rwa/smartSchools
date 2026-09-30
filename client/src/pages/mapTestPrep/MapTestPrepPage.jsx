import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../config/api';
import './MapTestPrepPage.css';

const tabs = ['overview', 'review', 'students', 'import', 'settings'];

const MapTestPrepPage = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [students, setStudents] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [studentSearchText, setStudentSearchText] = useState({});
  const [pendingStudentSelection, setPendingStudentSelection] = useState({});
  const [previewFiles, setPreviewFiles] = useState([]);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [selectedReviewAttempt, setSelectedReviewAttempt] = useState(null);
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
      const response = await api.get('/map-test-prep/classes');
      setClasses(response.data?.data?.classes || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load MAP Practice classes.');
    } finally {
      setLoading(false);
    }
  };

  const loadStudents = async (classId) => {
    try {
      const response = await api.get(`/map-test-prep/classes/${classId}/students`);
      setStudents(response.data?.data?.students || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load students.');
    }
  };

  const loadAllStudents = useCallback(async () => {
    try {
      if (!classes.length) {
        setAllStudents([]);
        return;
      }

      const results = await Promise.all(
        classes.map(async (classItem) => {
          try {
            const response = await api.get(`/map-test-prep/classes/${classItem._id}/students`);
            return response.data?.data?.students || [];
          } catch {
            return [];
          }
        })
      );

      const merged = results.flat();
      const unique = merged.filter((student, index, arr) => arr.findIndex((item) => item._id === student._id) === index);
      setAllStudents(unique);
    } catch {
      setAllStudents([]);
    }
  }, [classes]);

  const assignMatchedStudent = (fileName, student) => {
    setPendingStudentSelection((current) => ({ ...current, [fileName]: student }));
    setStudentSearchText((current) => ({ ...current, [fileName]: `${student?.firstName || ''} ${student?.lastName || ''}`.trim() || student?.studentId || '' }));
  };

  const confirmMatchedStudent = (fileName) => {
    const selectedStudent = pendingStudentSelection[fileName];
    if (!selectedStudent) return;

    setPreviewFiles((current) => current.map((file) => {
      if (file.fileName !== fileName) return file;

      return {
        ...file,
        studentId: selectedStudent.studentId || file.studentId,
        matchedStudent: selectedStudent,
        decisions: {
          ...file.decisions,
          action: 'create',
          matchedStudentId: selectedStudent.studentId || file.decisions?.matchedStudentId,
          errors: [],
          warnings: file.decisions?.warnings || []
        }
      };
    }));

    setPendingStudentSelection((current) => ({ ...current, [fileName]: null }));
    setStudentSearchText((current) => ({ ...current, [fileName]: '' }));
  };

  const loadReviewQueue = async () => {
    try {
      const response = await api.get('/map-test-prep/practice/reviews/queue');
      setReviewQueue(response.data?.data?.items || []);
    } catch {
      setReviewQueue([]);
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

  const handlePreviewFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    try {
      const response = await api.post('/map-test-prep/practice/preview-files', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreviewFiles(response.data?.data?.previews || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to preview files.');
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

  const reviewAttempt = async (attemptId, nextValue) => {
    try {
      await api.post(`/map-test-prep/practice/attempts/${attemptId}/review`, {
        teacherComment: nextValue,
        answers: [],
        reviewed: true,
      });
      setSelectedReviewAttempt(null);
      await loadReviewQueue();
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to review this attempt.');
    }
  };

  const selectedClassMetrics = useMemo(() => {
    const members = students.length || 0;
    return {
      members,
      ready: Math.max(0, members - 1),
      review: reviewQueue.length || 0,
    };
  }, [students.length, reviewQueue.length]);

  useEffect(() => {
    loadClasses();
    loadReviewQueue();
    loadSettings();
  }, []);

  useEffect(() => {
    if (classes.length) {
      loadAllStudents();
    }
  }, [classes, loadAllStudents]);

  useEffect(() => {
    if (selectedClass?._id) {
      loadStudents(selectedClass._id);
    }
  }, [selectedClass?._id]);

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
            key={tab}
            type="button"
            className={activeTab === tab ? 'map-topic-card selected' : 'map-topic-card'}
            onClick={() => setActiveTab(tab)}
            style={{ cursor: 'pointer', minWidth: 130 }}
          >
            <strong>{tab}</strong>
          </button>
        ))}
      </nav>

      {error && <div className="map-prep-error">{error}</div>}

      {activeTab === 'overview' && (
        <section className="map-prep-section">
          <div className="map-section-heading">
            <div>
              <p className="map-section-kicker">Class overview</p>
              <h2>Classes</h2>
            </div>
            <span className="map-section-count">{classes.length} classes</span>
          </div>

          <div className="map-metric-grid">
            <div className="map-metric-card">
              <span>Total students</span>
              <strong>{selectedClassMetrics.members}</strong>
            </div>
            <div className="map-metric-card">
              <span>Ready to review</span>
              <strong>{selectedClassMetrics.ready}</strong>
            </div>
            <div className="map-metric-card">
              <span>Review queue</span>
              <strong>{selectedClassMetrics.review}</strong>
            </div>
          </div>

          <div className="map-class-grid">
            {classes.map((classItem) => (
              <button
                type="button"
                key={classItem._id}
                className="map-class-card"
                onClick={() => {
                  setSelectedClass(classItem);
                  setActiveTab('students');
                }}
              >
                <strong>{classItem.name}</strong>
                <span>Grade {classItem.grade}{classItem.section ? ` / ${classItem.section}` : ''}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'students' && (
        <section className="map-prep-section">
          <div className="map-section-heading">
            <div>
              <p className="map-section-kicker">Students</p>
              <h2>{selectedClass ? selectedClass.name : 'Students'}</h2>
            </div>
          </div>
          {selectedClass ? (
            <>
              <div className="map-metric-grid compact">
                <div className="map-metric-card">
                  <span>Members</span>
                  <strong>{selectedClassMetrics.members}</strong>
                </div>
                <div className="map-metric-card">
                  <span>Needs follow-up</span>
                  <strong>{Math.max(0, selectedClassMetrics.review - 1)}</strong>
                </div>
              </div>
              <div className="map-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Student ID</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => (
                      <tr key={student._id}>
                        <td>{student.firstName} {student.lastName}</td>
                        <td>{student.studentId || '-'}</td>
                        <td>On track</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="map-prep-empty"><strong>Select a class</strong><span>Choose a class above to view the student roster.</span></div>
          )}
        </section>
      )}

      {activeTab === 'review' && (
        <section className="map-prep-section">
          <div className="map-section-heading">
            <div>
              <p className="map-section-kicker">Review queue</p>
              <h2>Short text review</h2>
            </div>
            <span className="map-section-count">{reviewQueue.length} waiting</span>
          </div>

          {reviewQueue.length === 0 ? (
            <div className="map-prep-empty"><strong>No answers waiting</strong><span>Short-text answers will appear here for teacher review.</span></div>
          ) : (
            <div className="map-record-list">
              {reviewQueue.map((item) => (
                <article key={item._id} className="map-record-card">
                  <div className="map-record-header">
                    <strong>{item.student?.firstName || 'Student'} {item.student?.lastName || ''}</strong>
                    <span className="map-status">Pending</span>
                  </div>
                  <div className="map-record-meta">
                    <span><small>Set</small>{item.set?.title || 'Set'}</span>
                    <span><small>Student ID</small>{item.student?.studentId || '-'}</span>
                  </div>
                  <div className="map-record-actions">
                    <button type="button" className="btn btn-primary" onClick={() => setSelectedReviewAttempt(item)}>
                      Review
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {selectedReviewAttempt && (
            <div className="map-review-detail-panel">
              <div className="map-section-heading">
                <div>
                  <p className="map-section-kicker">Teacher review</p>
                  <h2>{selectedReviewAttempt.student?.firstName || 'Student'} {selectedReviewAttempt.student?.lastName || ''}</h2>
                </div>
                <button type="button" className="btn btn-ghost" onClick={() => setSelectedReviewAttempt(null)}>Close</button>
              </div>

              <div className="map-review-answer-list">
                {(selectedReviewAttempt.answers || []).map((answer, index) => (
                  <div key={`${selectedReviewAttempt._id}-${answer.questionId || index}`} className="map-review-answer-item">
                    <div className="map-review-answer-header">
                      <strong>Question {index + 1}</strong>
                      <span>{answer.questionId || 'Short answer'}</span>
                    </div>
                    <p><strong>Student answer:</strong> {String(answer.response ?? '—')}</p>
                    <p><strong>Auto grade:</strong> {answer.isCorrect === null ? 'Needs review' : answer.isCorrect ? 'Correct' : 'Not correct'}</p>
                    <textarea
                      value={answer.teacherComment || ''}
                      onChange={(event) => {
                        const nextAnswers = (selectedReviewAttempt.answers || []).map((item, answerIndex) => (
                          answerIndex === index ? { ...item, teacherComment: event.target.value } : item
                        ));
                        setSelectedReviewAttempt({ ...selectedReviewAttempt, answers: nextAnswers });
                      }}
                      placeholder="Add guidance or accept the answer"
                    />
                  </div>
                ))}
              </div>

              <div className="map-review-actions">
                <button type="button" className="btn btn-secondary" onClick={() => reviewAttempt(selectedReviewAttempt._id, 'Reviewed by teacher.')}>
                  Mark reviewed
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {activeTab === 'import' && (
        <section className="map-prep-section">
          <div className="map-section-heading">
            <div>
              <p className="map-section-kicker">Import</p>
              <h2>Import student practice files</h2>
            </div>
          </div>

          <div className="map-upload-form">
            <div className="map-upload-copy">
              <strong>Drop student files here or choose files</strong>
              <span>One or many CSV files; preview happens before commit.</span>
            </div>
            <label htmlFor="map-practice-import">Choose CSV files</label>
            <input id="map-practice-import" type="file" accept=".csv,text/csv" multiple onChange={handlePreviewFiles} />
          </div>

          {previewFiles.length === 0 ? (
            <div className="map-prep-empty"><strong>No previews yet</strong><span>Upload files to preview detected students and validation status.</span></div>
          ) : (
            <div className="map-record-list">
              {previewFiles.map((file) => {
                const searchValue = studentSearchText[file.fileName] || '';
                const pendingStudent = pendingStudentSelection[file.fileName] || null;
                const filteredStudents = allStudents.filter((student) => {
                  const query = searchValue.trim().toLowerCase();
                  if (!query) return true;

                  return [student.firstName, student.lastName, student.email, student.studentId]
                    .filter(Boolean)
                    .some((value) => String(value).toLowerCase().includes(query));
                }).slice(0, 8);

                return (
                  <article key={file.fileName} className="map-record-card">
                    <div className="map-record-header">
                      <strong>{file.fileName}</strong>
                      <span className="map-status">{file.decisions?.matchedStudentId ? 'Ready' : 'Needs attention'}</span>
                    </div>
                    <div className="map-record-meta">
                      <span><small>Student</small>{file.decisions?.matchedStudentId || file.studentId || 'Unmatched'}</span>
                      <span><small>Rows</small>{file.rows?.length || 0}</span>
                    </div>

                    {!file.decisions?.matchedStudentId && (
                      <div className="map-student-match-panel">
                        <label htmlFor={`student-search-${file.fileName}`}>Choose a student</label>
                        <input
                          id={`student-search-${file.fileName}`}
                          type="text"
                          value={searchValue}
                          placeholder="Search by name, email, or student ID"
                          onChange={(event) => setStudentSearchText((current) => ({ ...current, [file.fileName]: event.target.value }))}
                        />

                        <div className="map-student-match-list">
                          {filteredStudents.length > 0 ? (
                            filteredStudents.map((student) => (
                              <button
                                key={`${file.fileName}-${student._id}`}
                                type="button"
                                className={`map-student-match-item ${pendingStudent && pendingStudent._id === student._id ? 'selected' : ''}`}
                                onClick={() => assignMatchedStudent(file.fileName, student)}
                              >
                                <span>{student.firstName || ''} {student.lastName || ''}</span>
                                <small>{student.studentId || 'No student ID'} · {student.email || 'No email'}</small>
                              </button>
                            ))
                          ) : (
                            <span className="map-student-match-empty">No matching students found.</span>
                          )}
                        </div>

                        {pendingStudent && (
                          <button type="button" className="btn btn-primary" onClick={() => confirmMatchedStudent(file.fileName)}>
                            Confirm student
                          </button>
                        )}
                      </div>
                    )}

                    {file.decisions?.errors?.length > 0 && (
                      <ul>
                        {file.decisions.errors.map((item, index) => <li key={`${file.fileName}-${index}`}>{item}</li>)}
                      </ul>
                    )}
                  </article>
                );
              })}
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
