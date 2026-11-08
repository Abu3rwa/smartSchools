import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useDispatch, useSelector } from 'react-redux';
import { fetchStudents, selectStudents } from '@/store/slices/studentSlice';
import { fetchClasses, selectClasses } from '@/store/slices/classSlice';
import { fetchSubjects, selectSubjects } from '@/store/slices/subjectSlice';
import api from '../../../../config/api';
import { createDefaultFormData, DRAFT_STATUSES } from '../constants';
import { buildRequestedLanguages, toLegacyLanguageValue } from '../../../../constants/aiLanguages';

const useAdvancedReportGenerator = () => {
  const dispatch = useDispatch();
  const students = useSelector(selectStudents);
  const classes = useSelector(selectClasses);
  const subjects = useSelector(selectSubjects);

  const [formData, setFormData] = useState(createDefaultFormData());
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(null);
  const [draftStatus, setDraftStatus] = useState(null);
  const [dataExpanded, setDataExpanded] = useState(true);
  const [profiles, setProfiles] = useState([]);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [emailPreview, setEmailPreview] = useState(null);
  const [sendError, setSendError] = useState(null);
  const [deliveryInfo, setDeliveryInfo] = useState(null);
  // Tracks the server revision so a stale tab cannot overwrite newer edits.
  const revisionRef = useRef(0);

  useEffect(() => {
    dispatch(fetchStudents({ limit: 'all' }));
    dispatch(fetchClasses());
    dispatch(fetchSubjects({ limit: 'all' }));
  }, [dispatch]);

  useEffect(() => {
    api.get('/reports/profiles', {
      params: formData.classId ? { classId: formData.classId } : {}
    }).then((res) => {
      if (res.data?.success) setProfiles(res.data.data || []);
    }).catch(() => {});
  }, [formData.classId]);

  const filteredStudents = useMemo(() => {
    if (!formData.classId) return students;
    return students.filter((s) => {
      const classId = formData.classId;
      if (s.currentClass === classId || s.currentClass?._id === classId) return true;
      if (Array.isArray(s.enrolledClasses)) {
        return s.enrolledClasses.some((c) => c === classId || c?._id === classId);
      }
      return false;
    });
  }, [students, formData.classId]);

  // Everything that shapes a generated report. When any of it changes, the
  // draft on screen no longer describes the report the teacher is asking for,
  // so it has to be cleared — otherwise a sent report keeps saying "✓ Report
  // sent successfully" after the teacher switches to another student.
  // Recipients and the teacher remark are excluded: they are edited in place
  // on an existing draft instead of requiring a new generation.
  const generationKey = useMemo(() => JSON.stringify({
    classId: formData.classId,
    studentId: formData.studentId,
    subjectId: formData.subjectId,
    reportType: formData.reportType,
    dateRange: formData.dateRange,
    primaryLanguage: formData.primaryLanguage,
    secondaryLanguage: formData.secondaryLanguage,
    customPrompt: formData.customPrompt,
    profileId: formData.profileId,
    sources: [...formData.sources].sort(),
    sections: formData.sections.map((s) => [s.key, s.enabled, s.maxWords])
  }), [formData]);

  const lastGenerationKey = useRef(generationKey);

  const resetGeneratedReport = useCallback(() => {
    setReport(null);
    setDraft(null);
    setDraftStatus(null);
    setEmailPreview(null);
    setSendError(null);
    setDeliveryInfo(null);
    setError(null);
    revisionRef.current = 0;
  }, []);

  useEffect(() => {
    if (lastGenerationKey.current === generationKey) return;
    lastGenerationKey.current = generationKey;
    resetGeneratedReport();
  }, [generationKey, resetGeneratedReport]);

  const handleInputChange = useCallback((event) => {
    const { name, value, type, checked } = event.target;

    if (type === 'checkbox') {
      if (name.includes('recipients.')) {
        const recipientField = name.split('.')[1];
        setFormData((prev) => ({
          ...prev,
          recipients: { ...prev.recipients, [recipientField]: checked }
        }));
      } else if (name === 'sources') {
        setFormData((prev) => {
          const sources = checked
            ? [...prev.sources, value]
            : prev.sources.filter((s) => s !== value);
          return { ...prev, sources };
        });
      } else if (name.startsWith('sections.')) {
        const parts = name.split('.');
        const idx = parseInt(parts[1], 10);
        const field = parts[2];
        setFormData((prev) => {
          const sections = [...prev.sections];
          sections[idx] = { ...sections[idx], [field]: checked };
          return { ...prev, sections };
        });
      } else {
        setFormData((prev) => ({ ...prev, [name]: checked }));
      }
      return;
    }

    if (name.includes('dateRange.')) {
      const dateField = name.split('.')[1];
      setFormData((prev) => ({
        ...prev,
        dateRange: { ...prev.dateRange, [dateField]: value }
      }));
      return;
    }

    if (name.startsWith('sections.')) {
      const parts = name.split('.');
      const idx = parseInt(parts[1], 10);
      const field = parts[2];
      setFormData((prev) => {
        const sections = [...prev.sections];
        sections[idx] = { ...sections[idx], [field]: field === 'enabled' ? checked : value };
        return { ...prev, sections };
      });
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'classId' ? { studentId: '' } : {})
    }));
  }, []);

  const handleProfileSelect = useCallback((profileId) => {
    if (!profileId) {
      setFormData((prev) => ({ ...prev, profileId: '' }));
      return;
    }
    const profile = profiles.find((p) => p._id === profileId);
    if (!profile) return;
    setFormData((prev) => ({
      ...prev,
      profileId,
      // An explicitly empty source list on the template is intentional.
      sources: profile.sources ?? prev.sources,
      sections: profile.sections?.length ? profile.sections : prev.sections,
      primaryLanguage: profile.defaultLanguage || prev.primaryLanguage,
      secondaryLanguage: profile.secondaryLanguage || ''
    }));
  }, [profiles]);

  // The server renders this with the same code path the send uses, so what the
  // teacher reviews is byte-for-byte what the family receives.
  const loadEmailPreview = useCallback(async (draftId) => {
    if (!draftId) {
      setEmailPreview(null);
      return;
    }
    try {
      const response = await api.get(`/reports/drafts/${draftId}/email-preview`);
      setEmailPreview(response.data?.success ? response.data.data : null);
    } catch {
      setEmailPreview(null);
    }
  }, []);

  const handleGenerateDraft = useCallback(async () => {
    if (generating) return;
    if (!formData.sources.length) {
      const message = 'Select at least one data source before generating.';
      setError(message);
      toast.error(message);
      return;
    }
    setGenerating(true);
    setError(null);
    setReport(null);
    setDraft(null);
    setDraftStatus(null);
    setEmailPreview(null);
    setSendError(null);
    setDeliveryInfo(null);
    revisionRef.current = 0;

    const requestedLanguages = buildRequestedLanguages(
      formData.primaryLanguage,
      formData.secondaryLanguage
    );
    const payload = {
      ...formData,
      language: toLegacyLanguageValue(requestedLanguages),
      requestedLanguages
    };

    const applyResult = (data) => {
      setReport(data);
      setDraft(data.draft);
      setDraftStatus(DRAFT_STATUSES.DRAFT);
      setDataExpanded(true);
      toast.success('Draft generated. Review and approve to send.');
      loadEmailPreview(data.draft?._id);
    };

    try {
      let response;
      try {
        response = await api.post('/reports/generate-advanced', payload);
      } catch (err) {
        // Missing evidence is a decision for the teacher, not a silent gap.
        if (err.response?.status === 409 && err.response?.data?.code === 'EVIDENCE_PARTIAL') {
          const proceed = window.confirm(
            `${err.response.data.message}\n\nGenerate the report without the missing sources?`
          );
          if (!proceed) {
            setError(err.response.data.message);
            return;
          }
          response = await api.post('/reports/generate-advanced', {
            ...payload,
            acknowledgeFailedSources: true
          });
        } else {
          throw err;
        }
      }

      if (response.data.success) {
        applyResult(response.data.data);
      } else {
        setError(response.data.message || 'Failed to generate report');
        toast.error(response.data.message || 'Failed to generate report');
      }
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to connect to server';
      setError(message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  }, [formData, generating, loadEmailPreview]);

  const handleApproveDraft = useCallback(async () => {
    if (!draft?._id || generating) return;
    setGenerating(true);

    try {
      // Approval is the moment the draft freezes, so the recipient checkboxes
      // travel with it.
      const response = await api.post(`/reports/drafts/${draft._id}/approve`, {
        recipients: formData.recipients
      });
      if (response.data.success) {
        setDraft(response.data.data);
        revisionRef.current = response.data.data?.revision || 0;
        setDraftStatus(DRAFT_STATUSES.APPROVED);
        setSendError(null);
        toast.success('Draft approved. Ready to send.');
        loadEmailPreview(draft._id);
      } else {
        toast.error(response.data.message || 'Failed to approve draft');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to connect to server');
    } finally {
      setGenerating(false);
    }
  }, [draft, generating, formData.recipients, loadEmailPreview]);

  const handleSendDraft = useCallback(async () => {
    if (!draft?._id || generating) return;
    setGenerating(true);
    setSendError(null);
    setDeliveryInfo(null);

    // The server tells us which of three very different outcomes happened:
    // everyone got it, some addresses failed, or acceptance is unconfirmed.
    // Only the first two are ours to retry.
    const applySendResult = (data) => {
      setDraftStatus(data?.draft?.status || DRAFT_STATUSES.FAILED);
      if (data?.emailResults) setDeliveryInfo(data.emailResults);
    };

    const offline = 'Could not reach the server. The report was not sent.';

    try {
      const response = await api.post(`/reports/drafts/${draft._id}/send`);
      if (response.data.success) {
        setDraftStatus(DRAFT_STATUSES.SENT);
        toast.success('Report sent to recipients!');
      } else {
        const message = response.data.message || 'Failed to send report';
        applySendResult(response.data.data);
        setSendError(message);
        toast.error(message);
      }
    } catch (err) {
      // A rejected send still carries the server's reason; saying "could not
      // connect" would hide whether the family got the email or not.
      const message = err.response?.data?.message || offline;
      if (err.response?.status === 409) {
        // Someone else already claimed this send.
        setDraftStatus(DRAFT_STATUSES.SENDING);
      } else if (err.response) {
        applySendResult(err.response.data?.data);
      }
      // With no response there is no delivery answer at all, so the status
      // stays where it was instead of guessing sent or failed.
      setSendError(message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  }, [draft, generating]);

  // Reload the server's copy of the draft: used after a conflict, a retry, or
  // any action whose response we cannot trust to be the latest state.
  const refreshDraft = useCallback(async (draftId) => {
    const id = draftId || draft?._id;
    if (!id) return null;
    try {
      const response = await api.get(`/reports/drafts/${id}`);
      if (!response.data?.success) return null;
      const fresh = response.data.data;
      setDraft(fresh);
      setDraftStatus(fresh?.status || null);
      revisionRef.current = fresh?.revision || 0;
      setReport((prev) => (prev ? { ...prev, report: fresh?.content ?? prev.report } : prev));
      setSendError(fresh?.sendError || null);
      return fresh;
    } catch {
      return null;
    }
  }, [draft]);

  // Returns true only when the server accepted the edit, so the preview pane
  // can decide whether to leave edit mode.
  const handleUpdateDraftContent = useCallback(async (content) => {
    if (!draft?._id) return false;

    try {
      const response = await api.patch(`/reports/drafts/${draft._id}`, {
        content,
        revision: revisionRef.current
      });
      if (response.data.success) {
        revisionRef.current = response.data.data?.revision ?? revisionRef.current;
        setReport((prev) => ({ ...prev, report: content }));
        toast.success('Draft updated.');
        loadEmailPreview(draft._id);
        return true;
      }
      toast.error(response.data.message || 'Failed to update draft');
      return false;
    } catch (err) {
      // Someone else changed this draft: our copy is stale, so pull theirs
      // rather than letting the teacher keep typing into the old version.
      if (err.response?.data?.code === 'REVISION_CONFLICT') {
        toast.error(err.response.data.message || 'This draft changed elsewhere. Reloading it.');
        await refreshDraft(draft._id);
        loadEmailPreview(draft._id);
        return false;
      }
      toast.error(err.response?.data?.message || 'Failed to connect to server');
      return false;
    }
  }, [draft, loadEmailPreview, refreshDraft]);

  // The remark belongs to the draft once it exists: sync on blur rather than
  // requesting on every keystroke, and only while the draft is still editable.
  const handleTeacherRemarkBlur = useCallback(async () => {
    if (!draft?._id || draftStatus !== DRAFT_STATUSES.DRAFT) return;
    try {
      const response = await api.patch(`/reports/drafts/${draft._id}`, {
        teacherRemark: formData.teacherRemark,
        revision: revisionRef.current
      });
      if (response.data.success) {
        revisionRef.current = response.data.data?.revision ?? revisionRef.current;
        loadEmailPreview(draft._id);
      }
    } catch (err) {
      if (err.response?.data?.code === 'REVISION_CONFLICT') {
        await refreshDraft(draft._id);
        toast.error(err.response.data.message || 'This draft changed elsewhere. Reloading it.');
        return;
      }
      toast.error(err.response?.data?.message || 'Could not save the teacher note.');
    }
  }, [draft, draftStatus, formData.teacherRemark, loadEmailPreview, refreshDraft]);

  // Reopen puts the draft back into editing so a typo found after approval can
  // be fixed without regenerating (regenerating would spend AI credits again).
  const handleReopenDraft = useCallback(async () => {
    if (!draft?._id || generating) return;
    setGenerating(true);
    try {
      const response = await api.post(`/reports/drafts/${draft._id}/reopen`);
      if (response.data.success) {
        setDraft(response.data.data);
        setDraftStatus(DRAFT_STATUSES.DRAFT);
        revisionRef.current = response.data.data?.revision || 0;
        setSendError(null);
        setDeliveryInfo(null);
        toast.success('Draft reopened. Edit, then approve again.');
        loadEmailPreview(draft._id);
      } else {
        toast.error(response.data.message || 'Could not reopen this draft');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to connect to server');
    } finally {
      setGenerating(false);
    }
  }, [draft, generating, loadEmailPreview]);

  // 'unknown' means the provider may already have delivered: the teacher reads
  // the recorded status instead of us guessing (and possibly double-sending).
  const handleCheckDelivery = useCallback(async (draftId) => {
    const id = draftId || draft?._id;
    if (!id) return;
    try {
      const response = await api.get(`/reports/email-status/${id}`);
      const status = response.data?.data;
      if (response.data?.success) {
        setDeliveryInfo(status);
        toast(`Delivery records: ${status.sent} delivered, ` +
          `${status.unknown} unconfirmed, ${status.failed} failed, ` +
          `${status.pending} pending.`);
      } else {
        toast.error(response.data.message || 'Could not load delivery status');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to connect to server');
    }
  }, [draft]);

  // Only definitely-failed addresses are resent; the server never re-sends an
  // address whose acceptance is unconfirmed.
  const handleRetryFailedEmails = useCallback(async () => {
    if (!draft?._id || generating) return;
    setGenerating(true);
    try {
      const response = await api.post(`/reports/retry-emails/${draft._id}`);
      const r = response.data?.data || {};
      if (response.data?.success) {
        if (!r.retried) {
          toast('No failed deliveries left to retry. Check the delivery status.');
        } else {
          toast.success(
            `Retried ${r.retried} recipient(s): ${r.successful} delivered` +
            `${r.failed ? `, ${r.failed} failed` : ''}${r.unknown ? `, ${r.unknown} unconfirmed` : ''}.`
          );
        }
        await refreshDraft(draft._id);
        handleCheckDelivery(draft._id);
      } else {
        toast.error(response.data.message || 'Could not retry delivery');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to connect to server');
    } finally {
      setGenerating(false);
    }
  }, [draft, generating, refreshDraft, handleCheckDelivery]);

  const handleRegenerate = useCallback(async () => {
    setRegenerateOpen(false);
    await handleGenerateDraft();
  }, [handleGenerateDraft]);

  const retryEmailPreview = useCallback(() => {
    loadEmailPreview(draft?._id);
  }, [loadEmailPreview, draft]);

  return {
    students: filteredStudents,
    classes,
    subjects,
    formData,
    setFormData,
    generating,
    report,
    error,
    draft,
    draftStatus,
    dataExpanded,
    setDataExpanded,
    profiles,
    setProfiles,
    regenerateOpen,
    setRegenerateOpen,
    settingsOpen,
    setSettingsOpen,
    handleInputChange,
    handleProfileSelect,
    handleGenerateDraft,
    handleApproveDraft,
    handleSendDraft,
    handleUpdateDraftContent,
    handleTeacherRemarkBlur,
    handleReopenDraft,
    handleRetryFailedEmails,
    handleCheckDelivery,
    handleRegenerate,
    resetGeneratedReport,
    emailPreview,
    retryEmailPreview,
    sendError,
    deliveryInfo
  };
};

export default useAdvancedReportGenerator;
