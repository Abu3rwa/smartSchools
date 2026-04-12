import React, { useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchEditImpact, patchAssessment, createRevision, publishRevision,
  fetchRevisions, clearEditImpact,
} from '../../../store/slices/standardAssessmentSlice';
import './AssessmentLiveEditPage.css';

const AssessmentLiveEditPage = () => {
  const dispatch = useDispatch();
  const editImpact = useSelector((state) => state.standardAssessment.editImpact);
  const revisions = useSelector((state) => state.standardAssessment.revisions);

  const [assignmentId, setAssignmentId] = useState('');
  const [loaded, setLoaded] = useState(false);

  // Metadata edit
  const [metaForm, setMetaForm] = useState({ title: '', instructions: '', dueDate: '' });
  const [savingMeta, setSavingMeta] = useState(false);

  // Revision creation
  const [revForm, setRevForm] = useState({
    changeSummary: '', changeType: 'question_edit', revisionPolicy: 'keep_progress',
  });
  const [creatingRevision, setCreatingRevision] = useState(false);

  // Publish modal
  const [publishTarget, setPublishTarget] = useState(null);
  const [publishing, setPublishing] = useState(false);

  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const loadAssignment = async () => {
    if (!assignmentId) return;
    setErrorMsg('');
    try {
      await dispatch(fetchEditImpact(assignmentId)).unwrap();
      await dispatch(fetchRevisions(assignmentId)).unwrap();
      setLoaded(true);
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to load assignment');
    }
  };

  const handleMetaSave = async () => {
    setSavingMeta(true);
    try {
      const updates = {};
      if (metaForm.title) updates.title = metaForm.title;
      if (metaForm.instructions) updates.instructions = metaForm.instructions;
      if (metaForm.dueDate) updates.dueDate = metaForm.dueDate;
      await dispatch(patchAssessment({ id: assignmentId, updates })).unwrap();
      setSuccessMsg('Metadata saved');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to save');
    }
    setSavingMeta(false);
  };

  const handleCreateRevision = async () => {
    if (!revForm.changeSummary) return;
    setCreatingRevision(true);
    try {
      await dispatch(createRevision({
        id: assignmentId,
        data: {
          changeSummary: revForm.changeSummary,
          changeType: revForm.changeType,
          revisionPolicy: revForm.revisionPolicy,
        },
      })).unwrap();
      setRevForm({ changeSummary: '', changeType: 'question_edit', revisionPolicy: 'keep_progress' });
      dispatch(fetchRevisions(assignmentId));
      dispatch(fetchEditImpact(assignmentId));
      setSuccessMsg('Revision created');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to create revision');
    }
    setCreatingRevision(false);
  };

  const handlePublish = async () => {
    if (!publishTarget) return;
    setPublishing(true);
    try {
      await dispatch(publishRevision({
        id: assignmentId,
        version: publishTarget.versionNumber,
      })).unwrap();
      setPublishTarget(null);
      dispatch(fetchRevisions(assignmentId));
      dispatch(fetchEditImpact(assignmentId));
      setSuccessMsg('Revision published');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setErrorMsg(err?.message || 'Publish failed');
    }
    setPublishing(false);
  };

  const impact = editImpact.data;

  return (
    <div className="live-edit-page">
      <div className="live-edit-header">
        <h1>Live Assessment Editing</h1>
      </div>

      {successMsg && <div className="success-banner">{successMsg}</div>}
      {errorMsg && <div className="error-banner">{errorMsg}</div>}

      {/* Assignment Lookup */}
      <div className="assignment-lookup">
        <input
          type="text"
          placeholder="Enter Assessment ID"
          value={assignmentId}
          onChange={(e) => { setAssignmentId(e.target.value); setLoaded(false); }}
        />
        <button className="btn-primary" onClick={loadAssignment} disabled={!assignmentId || editImpact.loading}>
          {editImpact.loading ? 'Loading...' : 'Load'}
        </button>
      </div>

      {!loaded ? (
        <div className="empty-state">
          <h3>Enter an assessment ID to begin editing</h3>
          <p>You'll see the impact preview before making any changes.</p>
        </div>
      ) : (
        <>
          {/* Impact Panel */}
          {impact && (
            <div className="impact-panel">
              <h3>Student Impact Preview</h3>
              <div className="impact-stats">
                <div className="impact-stat completed">
                  <div className="value">{impact.completed || 0}</div>
                  <div className="label">Completed</div>
                </div>
                <div className="impact-stat in-progress">
                  <div className="value">{impact.inProgress || 0}</div>
                  <div className="label">In Progress</div>
                </div>
                <div className="impact-stat not-started">
                  <div className="value">{impact.notStarted || 0}</div>
                  <div className="label">Not Started</div>
                </div>
              </div>
              {impact.completed > 0 && (
                <div className="impact-warnings">
                  <div className="impact-warning">
                    {impact.completed} student(s) have already completed this assessment. Content changes may require a revision.
                  </div>
                </div>
              )}
              {impact.lockedUntil && (
                <div className="impact-warnings">
                  <div className="impact-warning">
                    Editing locked until {new Date(impact.lockedUntil).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="live-edit-layout">
            {/* Edit Form */}
            <div>
              <div className="edit-form">
                <h3>Metadata Edit (No Revision Required)</h3>
                <div className="form-group">
                  <label>Title</label>
                  <input type="text" placeholder="New title" value={metaForm.title} onChange={(e) => setMetaForm((p) => ({ ...p, title: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Instructions</label>
                  <textarea placeholder="Updated instructions..." value={metaForm.instructions} onChange={(e) => setMetaForm((p) => ({ ...p, instructions: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Due Date</label>
                  <input type="date" value={metaForm.dueDate} onChange={(e) => setMetaForm((p) => ({ ...p, dueDate: e.target.value }))} />
                </div>
                <div className="form-actions">
                  <button className="btn-primary" disabled={savingMeta} onClick={handleMetaSave}>
                    {savingMeta ? 'Saving...' : 'Save Metadata'}
                  </button>
                </div>
              </div>

              {/* Revision Creation */}
              <div className="revision-section" style={{ marginTop: 24 }}>
                <h3>Create Content Revision</h3>
                <div className="revision-form">
                  <div className="form-group">
                    <label>Change Summary *</label>
                    <textarea
                      placeholder="Describe what changed..."
                      value={revForm.changeSummary}
                      onChange={(e) => setRevForm((p) => ({ ...p, changeSummary: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Change Type</label>
                    <select value={revForm.changeType} onChange={(e) => setRevForm((p) => ({ ...p, changeType: e.target.value }))}>
                      <option value="question_edit">Question Edit</option>
                      <option value="question_add">Question Added</option>
                      <option value="question_remove">Question Removed</option>
                      <option value="rubric_change">Rubric Change</option>
                      <option value="standard_realignment">Standard Realignment</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Revision Policy</label>
                    <select value={revForm.revisionPolicy} onChange={(e) => setRevForm((p) => ({ ...p, revisionPolicy: e.target.value }))}>
                      <option value="keep_progress">Keep Student Progress</option>
                      <option value="reset_affected">Reset Affected Questions</option>
                      <option value="full_reset">Full Reset</option>
                    </select>
                  </div>
                  <div className="form-actions">
                    <button
                      className="btn-primary"
                      disabled={!revForm.changeSummary || creatingRevision}
                      onClick={handleCreateRevision}
                    >
                      {creatingRevision ? 'Creating...' : 'Create Revision'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Revision History Sidebar */}
            <div className="revision-section">
              <h3>Revision History</h3>
              <div className="revision-history">
                {revisions.loading ? (
                  <div className="loading-state">Loading...</div>
                ) : revisions.list.length === 0 ? (
                  <p style={{ color: '#94a3b8', textAlign: 'center', padding: 24 }}>No revisions yet</p>
                ) : (
                  revisions.list.map((rev) => (
                    <div key={rev._id} className={`revision-item ${rev.publishStatus}`}>
                      <div className="version-label">
                        v{rev.versionNumber}
                        <span className={`status-badge ${rev.publishStatus}`} style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 12, fontSize: '0.7rem' }}>
                          {rev.publishStatus}
                        </span>
                      </div>
                      <div className="revision-meta">
                        {rev.changeType?.replace(/_/g, ' ')} · {new Date(rev.createdAt).toLocaleDateString()}
                      </div>
                      <div className="change-summary">{rev.changeSummary}</div>
                      {rev.publishStatus === 'draft' && (
                        <div className="revision-actions">
                          <button className="btn-success" onClick={() => setPublishTarget(rev)} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                            Publish
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Publish Modal */}
      {publishTarget && (
        <div className="publish-modal" onClick={() => setPublishTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Publish Revision v{publishTarget.versionNumber}</h2>
            <p style={{ color: '#64748b', margin: '12px 0' }}>
              This will apply the revision to the live assessment. Students will see the updated content.
            </p>
            {publishTarget.revisionPolicy && (
              <p style={{ fontWeight: 600, margin: '8px 0' }}>
                Policy: {publishTarget.revisionPolicy?.replace(/_/g, ' ')}
              </p>
            )}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setPublishTarget(null)}>Cancel</button>
              <button className="btn-success" disabled={publishing} onClick={handlePublish}>
                {publishing ? 'Publishing...' : 'Confirm Publish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssessmentLiveEditPage;
