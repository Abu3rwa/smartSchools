import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { format } from 'date-fns';

import { selectCurrentAcademicYear } from '../../../../store/slices/uiSlice';
import {
  fetchParentNewsletterHistory,
  selectParentNewsletter
} from '../../../../store/slices/newsletterSlice';

import './ParentNewslettersPage.css';

const ParentNewslettersPage = () => {
  const dispatch = useDispatch();
  const academicYear = useSelector(selectCurrentAcademicYear);
  const parentNewsletter = useSelector(selectParentNewsletter);

  const [childId, setChildId] = useState('');
  const [selectedIssueId, setSelectedIssueId] = useState('');

  useEffect(() => {
    dispatch(fetchParentNewsletterHistory({
      childId: childId || undefined,
      academicYear,
      page: 1,
      limit: 50
    }));
  }, [dispatch, childId, academicYear]);

  const issues = parentNewsletter.historyIssues || [];
  const selectedIssue = useMemo(() => {
    if (!selectedIssueId) return issues[0] || null;
    return issues.find((issue) => issue._id === selectedIssueId) || null;
  }, [issues, selectedIssueId]);

  useEffect(() => {
    if (!issues.length) {
      setSelectedIssueId('');
      return;
    }
    if (!selectedIssueId || !issues.some((issue) => issue._id === selectedIssueId)) {
      setSelectedIssueId(issues[0]._id);
    }
  }, [issues, selectedIssueId]);

  return (
    <div className="parent-newsletters-page">
      <div className="pn-header">
        <h2>Newsletter Archive</h2>
        <p>Read previously sent class newsletters for your child.</p>
      </div>

      <div className="pn-filters">
        <div className="pn-field">
          <label>Child</label>
          <select value={childId} onChange={(event) => setChildId(event.target.value)}>
            <option value="">All children</option>
            {(parentNewsletter.children || []).map((child) => (
              <option key={child.id} value={child.id}>{child.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="pn-grid">
        <div className="pn-card">
          <h3>Past newsletters</h3>
          {parentNewsletter.loading ? (
            <div className="pn-muted">Loading...</div>
          ) : issues.length === 0 ? (
            <div className="pn-muted">No sent newsletters found yet.</div>
          ) : (
            <div className="pn-list">
              {issues.map((issue) => (
                <button
                  key={issue._id}
                  className={`pn-item ${selectedIssue?._id === issue._id ? 'active' : ''}`}
                  onClick={() => setSelectedIssueId(issue._id)}
                >
                  <div className="pn-item-title">{issue.classLabel}</div>
                  <div className="pn-item-sub">
                    {format(new Date(issue.weekStart), 'MMM d')} → {format(new Date(issue.weekEnd), 'MMM d')} • Sent {issue.sentAt ? format(new Date(issue.sentAt), 'MMM d, yyyy') : 'N/A'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="pn-card">
          <h3>Newsletter details</h3>
          {!selectedIssue ? (
            <div className="pn-muted">Select a newsletter to view details.</div>
          ) : (
            <>
              <div className="pn-meta">
                <div><strong>Class:</strong> {selectedIssue.classLabel}</div>
                <div><strong>Week:</strong> {format(new Date(selectedIssue.weekStart), 'MMM d, yyyy')} → {format(new Date(selectedIssue.weekEnd), 'MMM d, yyyy')}</div>
                <div><strong>Sent:</strong> {selectedIssue.sentAt ? format(new Date(selectedIssue.sentAt), 'MMM d, yyyy h:mm a') : 'N/A'}</div>
              </div>

              {(selectedIssue.sections || []).length === 0 ? (
                <div className="pn-muted">No newsletter sections available.</div>
              ) : (
                <div className="pn-sections">
                  {selectedIssue.sections.map((section) => (
                    <div className="pn-section" key={section._id}>
                      <div className="pn-section-title">{section.subject?.name || 'Subject'}</div>
                      <div className="pn-section-body">{section.content}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ParentNewslettersPage;
