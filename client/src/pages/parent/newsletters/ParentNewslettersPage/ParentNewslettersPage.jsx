import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';

import api from '../../../../config/api';
import { selectCurrentAcademicYear } from '../../../../store/slices/uiSlice';
import {
  fetchParentNewsletterHistory,
  selectParentNewsletter
} from '../../../../store/slices/newsletterSlice';

import './ParentNewslettersPage.css';

const safeFormat = (value, pattern) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, pattern);
};

const ParentNewslettersPage = () => {
  const dispatch = useDispatch();
  const academicYear = useSelector(selectCurrentAcademicYear);
  const parentNewsletter = useSelector(selectParentNewsletter);

  const [tab, setTab] = useState('class');
  const [childId, setChildId] = useState('');
  const [selectedIssueId, setSelectedIssueId] = useState('');

  const [letters, setLetters] = useState([]);
  const [letterChildren, setLetterChildren] = useState([]);
  const [lettersLoading, setLettersLoading] = useState(false);
  const [letterChildId, setLetterChildId] = useState('');
  const [selectedLetterId, setSelectedLetterId] = useState('');
  const [letterHtml, setLetterHtml] = useState('');
  const [letterLoading, setLetterLoading] = useState(false);

  useEffect(() => {
    dispatch(fetchParentNewsletterHistory({
      childId: childId || undefined,
      academicYear,
      page: 1,
      limit: 50
    }));
  }, [dispatch, childId, academicYear]);

  const issues = useMemo(() => parentNewsletter.historyIssues || [], [parentNewsletter.historyIssues]);
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

  const loadLetters = useCallback(async () => {
    try {
      setLettersLoading(true);
      const res = await api.get('/newsletters/parent/child-letters', {
        params: { childId: letterChildId || undefined }
      });
      setLetters(res.data.data.letters || []);
      setLetterChildren(res.data.data.children || []);
    } catch {
      setLetters([]);
      setLetterChildren([]);
    } finally {
      setLettersLoading(false);
    }
  }, [letterChildId]);

  useEffect(() => {
    if (tab !== 'letters') return;
    loadLetters();
  }, [tab, loadLetters]);

  useEffect(() => {
    if (!letters.length) {
      setSelectedLetterId('');
      return;
    }
    if (!selectedLetterId || !letters.some((letter) => letter._id === selectedLetterId)) {
      setSelectedLetterId(letters[0]._id);
    }
  }, [letters, selectedLetterId]);

  useEffect(() => {
    if (!selectedLetterId) {
      setLetterHtml('');
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        setLetterLoading(true);
        const res = await api.get(`/newsletters/parent/child-letters/${selectedLetterId}`);
        if (!cancelled) setLetterHtml(res.data.data.htmlContent || '');
      } catch {
        if (!cancelled) setLetterHtml('');
      } finally {
        if (!cancelled) setLetterLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedLetterId]);

  const selectedLetter = useMemo(
    () => letters.find((letter) => letter._id === selectedLetterId) || null,
    [letters, selectedLetterId]
  );

  const downloadLetterPdf = async () => {
    if (!selectedLetter) return;
    const res = await api.get(`/newsletters/parent/child-letters/${selectedLetter._id}/pdf`, {
      responseType: 'blob'
    });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `weekly-letter-${(selectedLetter.studentName || 'student').replace(/\s+/g, '-')}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="parent-newsletters-page">
      <div className="pn-header">
        <Link className="pn-back" to="/portal/dashboard">Back to dashboard</Link>
        <h2>Newsletter Archive</h2>
        <p>Read the newsletters and letters sent to your family.</p>
      </div>

      <div className="pn-tabs" role="tablist" aria-label="Newsletter type">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'class'}
          className={`pn-tab${tab === 'class' ? ' active' : ''}`}
          onClick={() => setTab('class')}
        >
          Class newsletters
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'letters'}
          className={`pn-tab${tab === 'letters' ? ' active' : ''}`}
          onClick={() => setTab('letters')}
        >
          Letters about my child
        </button>
      </div>

      {tab === 'class' ? (
        <>
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
                        {safeFormat(issue.weekStart, 'MMM d')} → {safeFormat(issue.weekEnd, 'MMM d')} • Sent {safeFormat(issue.sentAt, 'MMM d, yyyy')}
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
                    <div><strong>Week:</strong> {safeFormat(selectedIssue.weekStart, 'MMM d, yyyy')} → {safeFormat(selectedIssue.weekEnd, 'MMM d, yyyy')}</div>
                    <div><strong>Sent:</strong> {safeFormat(selectedIssue.sentAt, 'MMM d, yyyy h:mm a')}</div>
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
        </>
      ) : (
        <>
          <div className="pn-filters">
            <div className="pn-field">
              <label>Child</label>
              <select value={letterChildId} onChange={(event) => setLetterChildId(event.target.value)}>
                <option value="">All children</option>
                {letterChildren.map((child) => (
                  <option key={child.id} value={child.id}>{child.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="pn-grid">
            <div className="pn-card">
              <h3>Letters</h3>
              {lettersLoading ? (
                <div className="pn-muted">Loading...</div>
              ) : letters.length === 0 ? (
                <div className="pn-muted">No letters have been sent yet.</div>
              ) : (
                <div className="pn-list">
                  {letters.map((letter) => (
                    <button
                      key={letter._id}
                      className={`pn-item ${selectedLetter?._id === letter._id ? 'active' : ''}`}
                      onClick={() => setSelectedLetterId(letter._id)}
                    >
                      <div className="pn-item-title">{letter.studentName || 'Student'}</div>
                      <div className="pn-item-sub">
                        {letter.classLabel} • {safeFormat(letter.periodStart, 'MMM d')} → {safeFormat(letter.periodEnd, 'MMM d')} • Sent {safeFormat(letter.sentAt, 'MMM d, yyyy')}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="pn-card">
              <div className="pn-letter-head">
                <h3>{selectedLetter ? `${selectedLetter.studentName}'s letter` : 'Letter'}</h3>
                {selectedLetter ? (
                  <button type="button" className="pn-btn" onClick={downloadLetterPdf}>
                    Download PDF
                  </button>
                ) : null}
              </div>
              {!selectedLetter ? (
                <div className="pn-muted">Select a letter to read it.</div>
              ) : letterLoading ? (
                <div className="pn-muted">Loading...</div>
              ) : letterHtml ? (
                <iframe className="pn-letter-frame" title="Weekly letter" srcDoc={letterHtml} />
              ) : (
                <div className="pn-muted">Could not load this letter.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ParentNewslettersPage;
