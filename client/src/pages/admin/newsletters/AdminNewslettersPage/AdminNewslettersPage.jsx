import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { format, startOfWeek } from 'date-fns';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

import { selectClasses } from '../../../../store/slices/classSlice';
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
  const { t } = useTranslation(['newsletters']);
  const dispatch = useDispatch();
  const navigate = useNavigate();
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
      toast.success(t('newsletters:admin.toasts.exclusionsUpdated'));
      dispatch(fetchAdminIssueDetails({ issueId: issue._id }));
    } catch (e) {
      toast.error(e || t('newsletters:admin.toasts.exclusionsFailed'));
    }
  };

  const onApprove = async (sectionId) => {
    try {
      await dispatch(approveAdminSection({ sectionId, notes: reviewNotes })).unwrap();
      toast.success(t('newsletters:admin.toasts.approved'));
      setReviewNotes('');
      dispatch(fetchAdminIssueDetails({ issueId: issue._id }));
    } catch (e) {
      toast.error(e || t('newsletters:admin.toasts.approveFailed'));
    }
  };

  const onReject = async (sectionId) => {
    try {
      await dispatch(rejectAdminSection({ sectionId, notes: reviewNotes })).unwrap();
      toast.success(t('newsletters:admin.toasts.rejected'));
      setReviewNotes('');
      dispatch(fetchAdminIssueDetails({ issueId: issue._id }));
    } catch (e) {
      toast.error(e || t('newsletters:admin.toasts.rejectFailed'));
    }
  };

  const onSend = async () => {
    if (!issue?._id) return;
    try {
      await dispatch(sendAdminIssue({ issueId: issue._id })).unwrap();
      toast.success(t('newsletters:admin.toasts.sendStarted'));
      dispatch(fetchAdminIssueDetails({ issueId: issue._id }));
    } catch (e) {
      toast.error(e || t('newsletters:admin.toasts.sendFailed'));
    }
  };

  const onPreview = async () => {
    if (!issue?._id) return;
    try {
      await dispatch(previewAdminIssue({ issueId: issue._id })).unwrap();
    } catch (e) {
      toast.error(e || t('newsletters:admin.toasts.previewFailed'));
    }
  };

  const onBulkApproveIssue = async () => {
    if (!issue?._id) return;
    try {
      await dispatch(approveAllSubmittedForIssue({ issueId: issue._id, notes: reviewNotes })).unwrap();
      toast.success(t('newsletters:admin.toasts.submittedApproved'));
      dispatch(fetchAdminIssueDetails({ issueId: issue._id }));
      dispatch(fetchAdminIssues({ classId: classId || undefined, academicYear, weekStart: weekStartStr }));
    } catch (e) {
      toast.error(e || t('newsletters:admin.toasts.bulkApproveFailed'));
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
      toast.success(t('newsletters:admin.toasts.weekApproved'));
      dispatch(fetchAdminIssues({ classId: classId || undefined, academicYear, weekStart: weekStartStr }));
      if (issue?._id) {
        dispatch(fetchAdminIssueDetails({ issueId: issue._id }));
      }
    } catch (e) {
      toast.error(e || t('newsletters:admin.toasts.weekApproveFailed'));
    }
  };

  const onSaveSectionEdit = async (sectionId) => {
    const nextContent = (sectionEdits[sectionId] || '').trim();
    if (!nextContent) {
      toast.error(t('newsletters:admin.toasts.sectionContentRequired'));
      return;
    }
    try {
      setSavingSectionId(sectionId);
      await dispatch(updateSectionContent({ sectionId, content: nextContent })).unwrap();
      toast.success(t('newsletters:admin.toasts.sectionUpdated'));
      dispatch(fetchAdminIssueDetails({ issueId: issue._id }));
    } catch (e) {
      toast.error(e || t('newsletters:admin.toasts.saveFailed'));
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2>{t('newsletters:admin.header.title')}</h2>
            <p>{t('newsletters:admin.header.subtitle')}</p>
          </div>
          <button
            className="an-approve-btn"
            onClick={() => navigate('/portal/newsletters/admin/templates')}
            style={{ whiteSpace: 'nowrap' }}
          >
            🎨 {t('newsletters:admin.actions.templateDesign', 'Template Design')}
          </button>
        </div>
      </div>

      <div className="an-tabs">
        <button
          className={`an-tab ${activeTab === 'review' ? 'active' : ''}`}
          onClick={() => { setActiveTab('review'); setSelectedIssueId(''); dispatch(clearAdminIssueDetails()); }}
        >
          {t('newsletters:admin.tabs.review')}
        </button>
        <button
          className={`an-tab ${activeTab === 'sent' ? 'active' : ''}`}
          onClick={() => { setActiveTab('sent'); setSelectedIssueId(''); dispatch(clearAdminIssueDetails()); }}
        >
          {t('newsletters:admin.tabs.sent')}
        </button>
      </div>

      <div className="an-filters">
        {activeTab === 'review' ? (
          <div className="an-field">
            <label>{t('newsletters:admin.filters.week')}</label>
            <input type="date" value={weekDate} onChange={(e) => setWeekDate(e.target.value)} />
          </div>
        ) : null}
        <div className="an-field">
          <label>{t('newsletters:admin.filters.class')}</label>
          <select value={classId} onChange={(e) => { setClassId(e.target.value); setSelectedIssueId(''); dispatch(clearAdminIssueDetails()); }}>
            <option value="">{t('newsletters:admin.filters.allClasses')}</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
        </div>
        {activeTab === 'review' ? (
          <div className="an-field">
            <label>{t('newsletters:admin.filters.quickActions')}</label>
            <button className="an-btn" onClick={onBulkApproveWeek} disabled={admin.loading}>
              {t('newsletters:admin.actions.approveAllWeek')}
            </button>
          </div>
        ) : null}
      </div>

      {activeTab === 'review' && summary ? (
        <div className="an-summary">
          {t('newsletters:admin.summary', {
            readyIssues: summary.readyIssues,
            totalIssues: summary.totalIssues,
            approvedSections: summary.approvedSections,
            totalExpectedSections: summary.totalExpectedSections
          })}
        </div>
      ) : null}

      <div className="an-grid">
        <div className="an-card">
          <h3>{activeTab === 'review' ? t('newsletters:admin.list.issues') : t('newsletters:admin.list.sentIssues')}</h3>
          {admin.loading ? (
            <div className="an-muted">{t('newsletters:admin.common.loading')}</div>
          ) : (
            <div className="an-issues">
              {(activeTab === 'review' ? (admin.issues || []) : sentIssues).map((i) => (
                <button
                  key={i._id}
                  className={`an-issue ${selectedIssueId === i._id ? 'active' : ''}`}
                  onClick={() => onSelectIssue(i._id)}
                >
                  <div className="an-issue-title">{i.class?.name || t('newsletters:admin.common.classFallback')}</div>
                  <div className="an-issue-sub">
                    {format(new Date(i.weekStart), 'MMM d')} → {format(new Date(i.weekEnd), 'MMM d')} • {i.status}
                    {i.sentAt ? ` • ${t('newsletters:admin.list.sentAt')} ${format(new Date(i.sentAt), 'MMM d, yyyy')}` : ''}
                  </div>
                </button>
              ))}
              {(activeTab === 'review' ? (admin.issues || []) : sentIssues).length === 0 && (
                <div className="an-muted">
                  {activeTab === 'review' ? t('newsletters:admin.list.noIssues') : t('newsletters:admin.list.noSent')}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="an-card">
          <h3>{t('newsletters:admin.details.title')}</h3>
          {!details ? (
            <div className="an-muted">{t('newsletters:admin.details.selectIssue')}</div>
          ) : (
            <>
              <div className="an-details">
                <div><strong>{t('newsletters:admin.details.class')}:</strong> {issue?.class?.name}</div>
                <div><strong>{t('newsletters:admin.details.status')}:</strong> {issue?.status}</div>
                {readiness ? (
                  <div className={`an-ready ${readiness.isSendEnabled ? 'ok' : 'bad'}`}>
                    {t('newsletters:admin.details.sendEnabled')}: <strong>{readiness.isSendEnabled ? t('newsletters:admin.common.yes') : t('newsletters:admin.common.no')}</strong>
                    {!readiness.isSendEnabled ? <span> • {t('newsletters:admin.details.missing', { count: readiness.missingSubjectIds.length })}</span> : null}
                  </div>
                ) : null}
              </div>

              {activeTab === 'review' ? (
                <div className="an-exclusions">
                  <h4>{t('newsletters:admin.details.excludeSubjects')}</h4>
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
                    {expectedSubjects.length === 0 && <div className="an-muted">{t('newsletters:admin.details.noExpectedSubjects')}</div>}
                  </div>
                </div>
              ) : null}

              {activeTab === 'review' ? (
                <div className="an-notes">
                  <label>{t('newsletters:admin.details.reviewNotes')}</label>
                  <textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder={t('newsletters:admin.details.reviewNotesPlaceholder')} />
                </div>
              ) : null}

              {activeTab === 'review' ? (
                <div className="an-inline-actions">
                  <button className="an-btn" onClick={onBulkApproveIssue} disabled={admin.loading}>
                    {t('newsletters:admin.actions.approveAllIssue')}
                  </button>
                  <button className="an-btn" onClick={onPreview}>
                    {t('newsletters:admin.actions.previewEmail')}
                  </button>
                </div>
              ) : null}

              {activeTab === 'review' && admin.preview ? (
                <div className="an-preview">
                  <div className="an-preview-head">
                    <strong>{admin.preview.subjectLine}</strong>
                    <span>{t('newsletters:admin.preview.sectionsCount', { count: admin.preview.sectionsCount })}</span>
                  </div>
                  <iframe
                    title={t('newsletters:admin.preview.title')}
                    className="an-preview-frame"
                    srcDoc={admin.preview.htmlContent || `<p>${t('newsletters:admin.preview.noPreview')}</p>`}
                  />
                </div>
              ) : null}

              <div className="an-sections">
                <h4>{t('newsletters:admin.sections.title')}</h4>
                {sections.length === 0 ? (
                  <div className="an-muted">{activeTab === 'review' ? t('newsletters:admin.sections.noneSubmitted') : t('newsletters:admin.sections.noneForIssue')}</div>
                ) : (
                  sections.map((s) => (
                    <div key={s._id} className="an-section">
                      <div className="an-section-head">
                        <div>
                          <div className="an-section-title">{s.subject?.name || t('newsletters:admin.sections.subjectFallback')}</div>
                          <div className="an-section-meta">
                            {s.teacherUser?.firstName} {s.teacherUser?.lastName} • {s.status} • {t('newsletters:admin.sections.words', { count: s.wordCount || 0 })}
                          </div>
                        </div>
                        {activeTab === 'review' ? (
                          <div className="an-section-actions">
                            <button className="an-btn" onClick={() => onApprove(s._id)} disabled={s.status === 'approved'}>{t('newsletters:admin.actions.approve')}</button>
                            <button className="an-btn danger" onClick={() => onReject(s._id)} disabled={s.status === 'rejected'}>{t('newsletters:admin.actions.reject')}</button>
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
                                  {savingSectionId === s._id ? t('newsletters:admin.common.saving') : t('newsletters:admin.actions.saveEdit')}
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="an-section-body">{s.content}</div>
                          )}
                        </>
                      ) : <div className="an-muted">{t('newsletters:admin.sections.noContent')}</div>}
                      {s.adminReview?.notes ? <div className="an-review-note"><strong>{t('newsletters:admin.sections.notes')}:</strong> {s.adminReview.notes}</div> : null}
                    </div>
                  ))
                )}
              </div>

              {activeTab === 'review' ? (
                <div className="an-send">
                  <button className="an-btn primary" onClick={onSend} disabled={!readiness?.isSendEnabled || admin.sending}>
                    {admin.sending ? t('newsletters:admin.common.sending') : t('newsletters:admin.actions.sendToParents')}
                  </button>
                  {admin.lastSendResult?.stats ? (
                    <div className="an-subtext">
                      {t('newsletters:admin.send.lastSend', {
                        success: admin.lastSendResult.stats.successCount,
                        failed: admin.lastSendResult.stats.failureCount
                      })}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="an-send-meta">
                  <div><strong>{t('newsletters:admin.send.sentAt')}:</strong> {issue?.sentAt ? format(new Date(issue.sentAt), 'MMM d, yyyy h:mm a') : t('newsletters:admin.common.notAvailable')}</div>
                  <div><strong>{t('newsletters:admin.send.delivery')}:</strong> {t('newsletters:admin.send.deliveryValue', {
                    success: issue?.emailStats?.successCount || 0,
                    failed: issue?.emailStats?.failureCount || 0
                  })}</div>
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
