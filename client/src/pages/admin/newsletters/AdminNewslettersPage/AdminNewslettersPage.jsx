import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { format, startOfWeek } from 'date-fns';
import toast from 'react-hot-toast';

import { fetchClasses, selectClasses } from '../../../../store/slices/classSlice';
import { selectCurrentAcademicYear } from '../../../../store/slices/uiSlice';
import {
  fetchAdminIssues,
  fetchAdminSentIssues,
  fetchAdminIssueDetails,
  previewAdminIssue,
  approveAdminSection,
  approveAllSubmittedForIssue,
  approveAllSubmittedForWeek,
  rejectAdminSection,
  updateSectionContent,
  updateAdminExclusions,
  sendAdminIssue,
  selectAdminNewsletter,
  clearAdminIssueDetails
} from '../../../../store/slices/newsletterSlice';

import './AdminNewslettersPage.css';

const EMPTY_SECTIONS = [];

const AdminNewslettersPage = () => {
  const dispatch = useDispatch();
  const academicYear = useSelector(selectCurrentAcademicYear);
  const classes = useSelector(selectClasses);
  const admin = useSelector(selectAdminNewsletter);

  const [weekDate, setWeekDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [classId, setClassId] = useState('');
  const [selectedIssueId, setSelectedIssueId] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [sectionEdits, setSectionEdits] = useState({});
  const [savingSectionId, setSavingSectionId] = useState('');
  const [activeTab, setActiveTab] = useState('review');

  const weekStartStr = useMemo(() => format(startOfWeek(new Date(weekDate), { weekStartsOn: 1 }), 'yyyy-MM-dd'), [weekDate]);

  useEffect(() => {
    dispatch(fetchClasses({ academicYear }));
  }, [dispatch, academicYear]);

  useEffect(() => {
    if (activeTab === 'review') {
      dispatch(fetchAdminIssues({ classId: classId || undefined, academicYear, weekStart: weekStartStr }));
      return;
    }
    dispatch(fetchAdminSentIssues({ classId: classId || undefined, academicYear, page: 1, limit: 50 }));
  }, [dispatch, classId, academicYear, weekStartStr, activeTab]);

  useEffect(() => {
    if (!selectedIssueId) return;
    dispatch(fetchAdminIssueDetails({ issueId: selectedIssueId }));
  }, [dispatch, selectedIssueId]);

  const details = admin.issueDetails;
  const issue = details?.issue;
  const sections = details?.sections || EMPTY_SECTIONS;
  const readiness = details?.readiness;
  const expectedSubjects = details?.expectedSubjects || [];
  const summary = admin.summary;
  const sentIssues = admin.sentIssues || [];

  const excludedSet = useMemo(() => new Set((issue?.excludedSubjectIds || []).map((x) => x.toString())), [issue?.excludedSubjectIds]);

  useEffect(() => {
    if (!sections.length) {
      setSectionEdits((previous) => (Object.keys(previous).length ? {} : previous));
      return;
    }

    const next = {};
    sections.forEach((section) => {
      next[section._id] = section.content || '';
    });
                                                                                                                                                          
    setSectionEdits((previous) => {
      const prevKeys = Object.keys(previous);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) return next;

      for (const key of nextKeys) {
        if (previous[key] !== next[key]) {
          return next;
        }
      }

      return previous;
    });
  }, [sections]);

  const toggleExclude = async (subjectId) => {
    if (!issue?._id) return;
    const id = subjectId.toString();
    const next = new Set(excludedSet);
    if (next.has(id)) next.delete(id); else next.add(id);
    try {
      await dispatch(updateAdminExclusions({ issueId: issue._id, excludedSubjectIds: Array.from(next) })).unwrap();
      toast.success('Exclusions updated');
      dispatch(fetchAdminIssueDetails({ issueId: issue._id }));
    } catch (e) {
      toast.error(e || 'Failed to update exclusions');
    }
  };

  const onApprove = async (sectionId) => {
    try {
      await dispatch(approveAdminSection({ sectionId, notes: reviewNotes })).unwrap();
      toast.success('Approved');
      setReviewNotes('');
      dispatch(fetchAdminIssueDetails({ issueId: issue._id }));
    } catch (e) {
      toast.error(e || 'Approve failed');
    }
  };

  const onReject = async (sectionId) => {
    try {
      await dispatch(rejectAdminSection({ sectionId, notes: reviewNotes })).unwrap();
      toast.success('Rejected');
      setReviewNotes('');
      dispatch(fetchAdminIssueDetails({ issueId: issue._id }));
    } catch (e) {
      toast.error(e || 'Reject failed');
    }
  };

  const onSend = async () => {
    if (!issue?._id) return;
    try {
      await dispatch(sendAdminIssue({ issueId: issue._id })).unwrap();
      toast.success('Send started');
      dispatch(fetchAdminIssueDetails({ issueId: issue._id }));
    } catch (e) {
      toast.error(e || 'Send failed');
    }
  };

  const onPreview = async () => {
    if (!issue?._id) return;
    try {
      await dispatch(previewAdminIssue({ issueId: issue._id })).unwrap();
    } catch (e) {
      toast.error(e || 'Preview failed');
    }
  };

  const onBulkApproveIssue = async () => {
    if (!issue?._id) return;
    try {
      await dispatch(approveAllSubmittedForIssue({ issueId: issue._id, notes: reviewNotes })).unwrap();
      toast.success('Submitted sections approved');
      dispatch(fetchAdminIssueDetails({ issueId: issue._id }));
      dispatch(fetchAdminIssues({ classId: classId || undefined, academicYear, weekStart: weekStartStr }));
    } catch (e) {
      toast.error(e || 'Bulk approve failed');
    }
  };

  const onBulkApproveWeek = async () => {
    try {
      await dispatch(approveAllSubmittedForWeek({
        classId: classId || undefined,
        academicYear,
        weekStart: weekStartStr,
        notes: reviewNotes
      })).unwrap();
      toast.success('Submitted sections approved for selected week');
      dispatch(fetchAdminIssues({ classId: classId || undefined, academicYear, weekStart: weekStartStr }));
      if (issue?._id) {
        dispatch(fetchAdminIssueDetails({ issueId: issue._id }));
      }
    } catch (e) {
      toast.error(e || 'Bulk approve week failed');
    }
  };

  const onSaveSectionEdit = async (sectionId) => {
    const nextContent = (sectionEdits[sectionId] || '').trim();
    if (!nextContent) {
      toast.error('Section content cannot be empty');
      return;
    }
    try {
      setSavingSectionId(sectionId);
      await dispatch(updateSectionContent({ sectionId, content: nextContent })).unwrap();
      toast.success('Section updated');
      dispatch(fetchAdminIssueDetails({ issueId: issue._id }));
    } catch (e) {
      toast.error(e || 'Save failed');
    } finally {
      setSavingSectionId('');
    }
  };

  const onSelectIssue = (issueId) => {
    setSelectedIssueId(issueId);
    dispatch(fetchAdminIssueDetails({ issueId }));
  };

  return (
    <div className="admin-newsletters-page">
      <div className="an-header">
        <h2>Newsletter Review & Send</h2>
        <p>Review teacher subject sections, exclude subjects if needed, and send one combined email to each student family.</p>
      </div>

      <div className="an-tabs">
        <button
          className={`an-tab ${activeTab === 'review' ? 'active' : ''}`}
          onClick={() => { setActiveTab('review'); setSelectedIssueId(''); dispatch(clearAdminIssueDetails()); }}
        >
          Review
        </button>
        <button
          className={`an-tab ${activeTab === 'sent' ? 'active' : ''}`}
          onClick={() => { setActiveTab('sent'); setSelectedIssueId(''); dispatch(clearAdminIssueDetails()); }}
        >
          Sent
        </button>
      </div>

      <div className="an-filters">
        {activeTab === 'review' ? (
          <div className="an-field">
            <label>Week (pick any date in week)</label>
            <input type="date" value={weekDate} onChange={(e) => setWeekDate(e.target.value)} />
          </div>
        ) : null}
        <div className="an-field">
          <label>Class</label>
          <select value={classId} onChange={(e) => { setClassId(e.target.value); setSelectedIssueId(''); dispatch(clearAdminIssueDetails()); }}>
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
        </div>
        {activeTab === 'review' ? (
          <div className="an-field">
            <label>Quick actions</label>
            <button className="an-btn" onClick={onBulkApproveWeek} disabled={admin.loading}>
              Approve All Submitted (Week)
            </button>
          </div>
        ) : null}
      </div>

      {activeTab === 'review' && summary ? (
        <div className="an-summary">
          {summary.readyIssues}/{summary.totalIssues} classes complete • {summary.approvedSections}/{summary.totalExpectedSections} sections approved
        </div>
      ) : null}

      <div className="an-grid">
        <div className="an-card">
          <h3>{activeTab === 'review' ? 'Issues' : 'Sent issues'}</h3>
          {admin.loading ? (
            <div className="an-muted">Loading...</div>
          ) : (
            <div className="an-issues">
              {(activeTab === 'review' ? (admin.issues || []) : sentIssues).map((i) => (
                <button
                  key={i._id}
                  className={`an-issue ${selectedIssueId === i._id ? 'active' : ''}`}
                  onClick={() => onSelectIssue(i._id)}
                >
                  <div className="an-issue-title">{i.class?.name || 'Class'}</div>
                  <div className="an-issue-sub">
                    {format(new Date(i.weekStart), 'MMM d')} → {format(new Date(i.weekEnd), 'MMM d')} • {i.status}
                    {i.sentAt ? ` • Sent ${format(new Date(i.sentAt), 'MMM d, yyyy')}` : ''}
                  </div>
                </button>
              ))}
              {(activeTab === 'review' ? (admin.issues || []) : sentIssues).length === 0 && (
                <div className="an-muted">
                  {activeTab === 'review' ? 'No issues for this week.' : 'No sent newsletters found.'}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="an-card">
          <h3>Issue details</h3>
          {!details ? (
            <div className="an-muted">Select an issue to review.</div>
          ) : (
            <>
              <div className="an-details">
                <div><strong>Class:</strong> {issue?.class?.name}</div>
                <div><strong>Status:</strong> {issue?.status}</div>
                {readiness ? (
                  <div className={`an-ready ${readiness.isSendEnabled ? 'ok' : 'bad'}`}>
                    Send enabled: <strong>{readiness.isSendEnabled ? 'Yes' : 'No'}</strong>
                    {!readiness.isSendEnabled ? <span> • Missing: {readiness.missingSubjectIds.length}</span> : null}
                  </div>
                ) : null}
              </div>

              {activeTab === 'review' ? (
                <div className="an-exclusions">
                  <h4>Exclude subjects (optional)</h4>
                  <div className="an-subjects">
                    {expectedSubjects.map((s) => (
                      <label key={s._id} className="an-subject">
                        <input
                          type="checkbox"
                          checked={excludedSet.has(s._id.toString())}
                          onChange={() => toggleExclude(s._id)}
                        />
                        <span>{s.name}</span>
                      </label>
                    ))}
                    {expectedSubjects.length === 0 && <div className="an-muted">No expected subjects found for this class.</div>}
                  </div>
                </div>
              ) : null}

              {activeTab === 'review' ? (
                <div className="an-notes">
                  <label>Review notes (optional)</label>
                  <textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder="Notes to teacher (optional)" />
                </div>
              ) : null}

              {activeTab === 'review' ? (
                <div className="an-inline-actions">
                  <button className="an-btn" onClick={onBulkApproveIssue} disabled={admin.loading}>
                    Approve All Submitted (Issue)
                  </button>
                  <button className="an-btn" onClick={onPreview}>
                    Preview Email
                  </button>
                </div>
              ) : null}

              {activeTab === 'review' && admin.preview ? (
                <div className="an-preview">
                  <div className="an-preview-head">
                    <strong>{admin.preview.subjectLine}</strong>
                    <span>{admin.preview.sectionsCount} sections</span>
                  </div>
                  <iframe
                    title="Newsletter preview"
                    className="an-preview-frame"
                    srcDoc={admin.preview.htmlContent || '<p>No preview available.</p>'}
                  />
                </div>
              ) : null}

              <div className="an-sections">
                <h4>Sections</h4>
                {sections.length === 0 ? (
                  <div className="an-muted">{activeTab === 'review' ? 'No sections submitted yet.' : 'No sections found for this newsletter.'}</div>
                ) : (
                  sections.map((s) => (
                    <div key={s._id} className="an-section">
                      <div className="an-section-head">
                        <div>
                          <div className="an-section-title">{s.subject?.name || 'Subject'}</div>
                          <div className="an-section-meta">
                            {s.teacherUser?.firstName} {s.teacherUser?.lastName} • {s.status} • {s.wordCount || 0} words
                          </div>
                        </div>
                        {activeTab === 'review' ? (
                          <div className="an-section-actions">
                            <button className="an-btn" onClick={() => onApprove(s._id)} disabled={s.status === 'approved'}>Approve</button>
                            <button className="an-btn danger" onClick={() => onReject(s._id)} disabled={s.status === 'rejected'}>Reject</button>
                          </div>
                        ) : null}
                      </div>
                      {s.content ? (
                        <>
                          {activeTab === 'review' ? (
                            <>
                              <textarea
                                className="an-section-editor"
                                value={sectionEdits[s._id] ?? ''}
                                onChange={(e) => setSectionEdits((prev) => ({ ...prev, [s._id]: e.target.value }))}
                              />
                              <div className="an-section-body">{sectionEdits[s._id] ?? ''}</div>
                              <div className="an-section-edit-actions">
                                <button
                                  className="an-btn"
                                  onClick={() => onSaveSectionEdit(s._id)}
                                  disabled={savingSectionId === s._id || !(sectionEdits[s._id] || '').trim()}
                                >
                                  {savingSectionId === s._id ? 'Saving...' : 'Save Edit'}
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="an-section-body">{s.content}</div>
                          )}
                        </>
                      ) : <div className="an-muted">No content.</div>}
                      {s.adminReview?.notes ? <div className="an-review-note"><strong>Notes:</strong> {s.adminReview.notes}</div> : null}
                    </div>
                  ))
                )}
              </div>

              {activeTab === 'review' ? (
                <div className="an-send">
                  <button className="an-btn primary" onClick={onSend} disabled={!readiness?.isSendEnabled || admin.sending}>
                    {admin.sending ? 'Sending...' : 'Send to Parents'}
                  </button>
                  {admin.lastSendResult?.stats ? (
                    <div className="an-subtext">
                      Last send: {admin.lastSendResult.stats.successCount} success / {admin.lastSendResult.stats.failureCount} failed
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="an-send-meta">
                  <div><strong>Sent at:</strong> {issue?.sentAt ? format(new Date(issue.sentAt), 'MMM d, yyyy h:mm a') : 'N/A'}</div>
                  <div><strong>Delivery:</strong> {issue?.emailStats?.successCount || 0} success / {issue?.emailStats?.failureCount || 0} failed</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminNewslettersPage;
