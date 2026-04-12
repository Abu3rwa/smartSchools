import React, { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  generateNarrative, fetchNarrative, updateNarrative, sendNarrative,
  fetchNarratives, clearNarrativeGeneration, resetCurrentNarrative,
} from '../../../store/slices/standardAssessmentSlice';
import './AssessmentNarrativePage.css';

const TABS = { GENERATE: 'generate', REVIEW: 'review', LIST: 'list' };

const AssessmentNarrativePage = () => {
  const dispatch = useDispatch();
  const {
    narratives, currentNarrative, narrativeGeneration,
  } = useSelector((state) => state.standardAssessment);

  const [activeTab, setActiveTab] = useState(TABS.GENERATE);

  // Generate form
  const [genForm, setGenForm] = useState({
    studentId: '', classId: '', subjectId: '', gradeLevel: '',
    selectedStandardIds: [], language: 'en', toneProfile: 'formal',
  });
  const [standardInput, setStandardInput] = useState('');

  // Review editor
  const [editedText, setEditedText] = useState('');
  const [approveConfirm, setApproveConfirm] = useState(false);

  // Send modal
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendToStudent, setSendToStudent] = useState(true);
  const [sendToParent, setSendToParent] = useState(true);
  const [sending, setSending] = useState(false);

  // List
  const [listFilters, setListFilters] = useState({ status: '', page: 1 });
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (activeTab === TABS.LIST) {
      dispatch(fetchNarratives(listFilters));
    }
  }, [activeTab, listFilters, dispatch]);

  useEffect(() => {
    if (currentNarrative.data) {
      setEditedText(currentNarrative.data.teacherEditedText || currentNarrative.data.aiDraftText || '');
    }
  }, [currentNarrative.data]);

  const addStandardId = () => {
    const id = standardInput.trim();
    if (id && !genForm.selectedStandardIds.includes(id)) {
      setGenForm((p) => ({ ...p, selectedStandardIds: [...p.selectedStandardIds, id] }));
      setStandardInput('');
    }
  };

  const removeStandardId = (id) => {
    setGenForm((p) => ({
      ...p,
      selectedStandardIds: p.selectedStandardIds.filter((s) => s !== id),
    }));
  };

  const handleGenerate = async () => {
    if (!genForm.studentId || genForm.selectedStandardIds.length === 0) return;
    try {
      const result = await dispatch(generateNarrative(genForm)).unwrap();
      if (result._id) {
        dispatch(fetchNarrative(result._id));
        setActiveTab(TABS.REVIEW);
      }
    } catch {
      // Error in Redux
    }
  };

  const handleSaveEdit = async () => {
    if (!currentNarrative.data?._id) return;
    await dispatch(updateNarrative({
      id: currentNarrative.data._id,
      updates: { teacherEditedText: editedText },
    }));
  };

  const handleApprove = async () => {
    if (!currentNarrative.data?._id || !approveConfirm) return;
    await dispatch(updateNarrative({
      id: currentNarrative.data._id,
      updates: { status: 'approved', approvalConfirmed: true },
    }));
    setApproveConfirm(false);
  };

  const handleSend = async () => {
    if (!currentNarrative.data?._id) return;
    setSending(true);
    try {
      await dispatch(sendNarrative({
        id: currentNarrative.data._id,
        sendToStudent,
        sendToParent,
      })).unwrap();
      setShowSendModal(false);
      setSuccessMsg('Narrative report sent successfully!');
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch {
      // Error in Redux
    }
    setSending(false);
  };

  const openNarrative = (id) => {
    dispatch(fetchNarrative(id));
    setActiveTab(TABS.REVIEW);
  };

  const driftPercent = currentNarrative.data?.editDriftPercent || 0;
  const driftClass = driftPercent > 60 ? 'danger' : driftPercent > 30 ? 'warning' : '';

  return (
    <div className="narrative-page">
      <div className="narrative-header">
        <h1>AI Narrative Reports</h1>
      </div>

      {successMsg && <div className="success-banner">{successMsg}</div>}
      {narrativeGeneration.error && (
        <div className="error-banner">
          {narrativeGeneration.error}
          <button onClick={() => dispatch(clearNarrativeGeneration())} style={{ marginLeft: 8, cursor: 'pointer', background: 'none', border: 'none', fontWeight: 700 }}>×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="narrative-tabs">
        <button className={activeTab === TABS.GENERATE ? 'active' : ''} onClick={() => setActiveTab(TABS.GENERATE)}>Generate</button>
        <button className={activeTab === TABS.REVIEW ? 'active' : ''} onClick={() => setActiveTab(TABS.REVIEW)}>Review & Edit</button>
        <button className={activeTab === TABS.LIST ? 'active' : ''} onClick={() => setActiveTab(TABS.LIST)}>All Narratives</button>
      </div>

      {/* Generate Tab */}
      {activeTab === TABS.GENERATE && (
        <div className="generate-panel">
          <div className="standard-picker">
            <h3>Select Standards</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                placeholder="Enter Standard ID"
                value={standardInput}
                onChange={(e) => setStandardInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addStandardId()}
                style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6 }}
              />
              <button className="btn-secondary" onClick={addStandardId}>Add</button>
            </div>
            <div className="standard-list">
              {genForm.selectedStandardIds.length === 0 ? (
                <p style={{ color: '#94a3b8', textAlign: 'center', padding: 24 }}>No standards selected yet</p>
              ) : (
                genForm.selectedStandardIds.map((id) => (
                  <div key={id} className="standard-item selected">
                    <span className="code">{id}</span>
                    <button onClick={() => removeStandardId(id)} style={{ marginLeft: 'auto', cursor: 'pointer', background: 'none', border: 'none', color: '#ef4444', fontWeight: 700 }}>×</button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="generate-options">
            <h3>Report Options</h3>
            <div className="option-group">
              <label>Student ID *</label>
              <input type="text" value={genForm.studentId} onChange={(e) => setGenForm((p) => ({ ...p, studentId: e.target.value }))} />
            </div>
            <div className="option-group">
              <label>Class ID</label>
              <input type="text" value={genForm.classId} onChange={(e) => setGenForm((p) => ({ ...p, classId: e.target.value }))} />
            </div>
            <div className="option-group">
              <label>Subject ID</label>
              <input type="text" value={genForm.subjectId} onChange={(e) => setGenForm((p) => ({ ...p, subjectId: e.target.value }))} />
            </div>
            <div className="option-group">
              <label>Language</label>
              <select value={genForm.language} onChange={(e) => setGenForm((p) => ({ ...p, language: e.target.value }))}>
                <option value="en">English</option>
                <option value="ar">Arabic</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
              </select>
            </div>
            <div className="option-group">
              <label>Tone Profile</label>
              <select value={genForm.toneProfile} onChange={(e) => setGenForm((p) => ({ ...p, toneProfile: e.target.value }))}>
                <option value="formal">Formal</option>
                <option value="supportive">Supportive</option>
                <option value="concise">Concise</option>
              </select>
            </div>
            <button
              className="btn-primary generate-btn"
              disabled={narrativeGeneration.loading || !genForm.studentId || genForm.selectedStandardIds.length === 0}
              onClick={handleGenerate}
            >
              {narrativeGeneration.loading ? 'Generating...' : 'Generate Narrative'}
            </button>
          </div>
        </div>
      )}

      {/* Review Tab */}
      {activeTab === TABS.REVIEW && (
        currentNarrative.loading ? (
          <div className="loading-state">Loading narrative...</div>
        ) : !currentNarrative.data ? (
          <div className="empty-state">
            <h3>No narrative selected</h3>
            <p>Generate a new narrative or select one from the list.</p>
          </div>
        ) : (
          <div className="review-panel">
            <div className="evidence-panel">
              <h3>Evidence Summary</h3>
              {currentNarrative.data.evidenceSummary?.standards?.map((s, i) => (
                <div key={i} className="evidence-standard">
                  <span className="standard-code">{s.code || s.standardId}</span>
                  {s.masteryBand && (
                    <span className={`mastery-band ${s.masteryBand}`}>{s.masteryBand}</span>
                  )}
                  <div className="evidence-detail">
                    Attempts: {s.totalAttempts || 0} | Avg: {Math.round(s.averageScore || 0)}%
                    {s.trend && ` | Trend: ${s.trend}`}
                  </div>
                </div>
              )) || <p style={{ color: '#94a3b8' }}>No evidence data available</p>}
            </div>

            <div className="narrative-editor-panel">
              <h3>
                Narrative Text
                <span className={`status-badge ${currentNarrative.data.status}`} style={{ marginLeft: 12 }}>
                  {currentNarrative.data.status}
                </span>
              </h3>
              <textarea
                className="narrative-textarea"
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                disabled={currentNarrative.data.status === 'sent'}
              />

              <div className="edit-drift-bar">
                <span>Edit drift:</span>
                <div className="drift-meter">
                  <div className={`drift-fill ${driftClass}`} style={{ width: `${Math.min(driftPercent, 100)}%` }} />
                </div>
                <span>{Math.round(driftPercent)}%</span>
              </div>

              <div className="narrative-actions">
                {currentNarrative.data.status === 'draft' && (
                  <>
                    <button className="btn-secondary" onClick={handleSaveEdit}>Save Edit</button>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={approveConfirm}
                        onChange={(e) => setApproveConfirm(e.target.checked)}
                      />
                      I confirm this narrative is accurate
                    </label>
                    <button className="btn-success" disabled={!approveConfirm} onClick={handleApprove}>Approve</button>
                  </>
                )}
                {currentNarrative.data.status === 'approved' && (
                  <button className="btn-primary" onClick={() => setShowSendModal(true)}>Send to Recipients</button>
                )}
              </div>
            </div>
          </div>
        )
      )}

      {/* List Tab */}
      {activeTab === TABS.LIST && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <select
              value={listFilters.status}
              onChange={(e) => setListFilters((p) => ({ ...p, status: e.target.value, page: 1 }))}
              style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6 }}
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="sent">Sent</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          {narratives.loading ? (
            <div className="loading-state">Loading narratives...</div>
          ) : narratives.list.length === 0 ? (
            <div className="empty-state">
              <h3>No narratives found</h3>
              <p>Generate your first narrative from the Generate tab.</p>
            </div>
          ) : (
            <table className="narrative-list-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Status</th>
                  <th>Language</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {narratives.list.map((n) => (
                  <tr key={n._id}>
                    <td>{n.student?.name || n.student || n.studentId}</td>
                    <td><span className={`status-badge ${n.status}`}>{n.status}</span></td>
                    <td>{n.language}</td>
                    <td>{new Date(n.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button className="btn-secondary" onClick={() => openNarrative(n._id)}>View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* Send Modal */}
      {showSendModal && (
        <div className="send-modal" onClick={() => setShowSendModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Send Narrative Report</h2>
            <p style={{ color: '#64748b', marginBottom: 16 }}>
              Send this approved narrative to the student and/or parent.
            </p>
            <div style={{ display: 'flex', gap: 16, margin: '16px 0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 500 }}>
                <input type="checkbox" checked={sendToStudent} onChange={(e) => setSendToStudent(e.target.checked)} />
                Student
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 500 }}>
                <input type="checkbox" checked={sendToParent} onChange={(e) => setSendToParent(e.target.checked)} />
                Parent
              </label>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowSendModal(false)}>Cancel</button>
              <button className="btn-primary" disabled={sending} onClick={handleSend}>
                {sending ? 'Sending...' : 'Send Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssessmentNarrativePage;
