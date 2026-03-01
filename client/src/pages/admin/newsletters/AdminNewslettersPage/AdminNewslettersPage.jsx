import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { format, startOfWeek } from 'date-fns';
import toast from 'react-hot-toast';

import { fetchClasses, selectClasses } from '../../../../store/slices/classSlice';
import { selectCurrentAcademicYear } from '../../../../store/slices/uiSlice';
import {
  fetchAdminIssues,
  fetchAdminIssueDetails,
  approveAdminSection,
  rejectAdminSection,
  updateAdminExclusions,
  sendAdminIssue,
  selectAdminNewsletter
} from '../../../../store/slices/newsletterSlice';

import './AdminNewslettersPage.css';

const AdminNewslettersPage = () => {
  const dispatch = useDispatch();
  const academicYear = useSelector(selectCurrentAcademicYear);
  const classes = useSelector(selectClasses);
  const admin = useSelector(selectAdminNewsletter);

  const [weekDate, setWeekDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [classId, setClassId] = useState('');
  const [selectedIssueId, setSelectedIssueId] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');

  const weekStartStr = useMemo(() => format(startOfWeek(new Date(weekDate), { weekStartsOn: 1 }), 'yyyy-MM-dd'), [weekDate]);

  useEffect(() => {
    dispatch(fetchClasses({ academicYear }));
  }, [dispatch, academicYear]);

  useEffect(() => {
    dispatch(fetchAdminIssues({ classId: classId || undefined, academicYear, weekStart: weekStartStr }));
  }, [dispatch, classId, academicYear, weekStartStr]);

  useEffect(() => {
    if (!selectedIssueId) return;
    dispatch(fetchAdminIssueDetails({ issueId: selectedIssueId }));
  }, [dispatch, selectedIssueId]);

  const details = admin.issueDetails;
  const issue = details?.issue;
  const sections = details?.sections || [];
  const readiness = details?.readiness;
  const expectedSubjects = details?.expectedSubjects || [];

  const excludedSet = useMemo(() => new Set((issue?.excludedSubjectIds || []).map((x) => x.toString())), [issue?.excludedSubjectIds]);

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

  return (
    <div className="admin-newsletters-page">
      <div className="an-header">
        <h2>Newsletter Review & Send</h2>
        <p>Review teacher subject sections, exclude subjects if needed, and send one combined email to each student family.</p>
      </div>

      <div className="an-filters">
        <div className="an-field">
          <label>Week (pick any date in week)</label>
          <input type="date" value={weekDate} onChange={(e) => setWeekDate(e.target.value)} />
        </div>
        <div className="an-field">
          <label>Class</label>
          <select value={classId} onChange={(e) => { setClassId(e.target.value); setSelectedIssueId(''); }}>
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="an-grid">
        <div className="an-card">
          <h3>Issues</h3>
          {admin.loading ? (
            <div className="an-muted">Loading...</div>
          ) : (
            <div className="an-issues">
              {(admin.issues || []).map((i) => (
                <button
                  key={i._id}
                  className={`an-issue ${selectedIssueId === i._id ? 'active' : ''}`}
                  onClick={() => setSelectedIssueId(i._id)}
                >
                  <div className="an-issue-title">{i.class?.name || 'Class'}</div>
                  <div className="an-issue-sub">
                    {format(new Date(i.weekStart), 'MMM d')} → {format(new Date(i.weekEnd), 'MMM d')} • {i.status}
                  </div>
                </button>
              ))}
              {(admin.issues || []).length === 0 && <div className="an-muted">No issues for this week.</div>}
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

              <div className="an-notes">
                <label>Review notes (optional)</label>
                <textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder="Notes to teacher (optional)" />
              </div>

              <div className="an-sections">
                <h4>Sections</h4>
                {sections.length === 0 ? (
                  <div className="an-muted">No sections submitted yet.</div>
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
                        <div className="an-section-actions">
                          <button className="an-btn" onClick={() => onApprove(s._id)} disabled={s.status === 'approved'}>Approve</button>
                          <button className="an-btn danger" onClick={() => onReject(s._id)} disabled={s.status === 'rejected'}>Reject</button>
                        </div>
                      </div>
                      {s.content ? <div className="an-section-body">{s.content}</div> : <div className="an-muted">No content.</div>}
                      {s.adminReview?.notes ? <div className="an-review-note"><strong>Notes:</strong> {s.adminReview.notes}</div> : null}
                    </div>
                  ))
                )}
              </div>

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
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminNewslettersPage;
