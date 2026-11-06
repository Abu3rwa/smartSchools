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

  useEffect(() => {
    dispatch(fetchStudents({ limit: 'all' }));
    dispatch(fetchClasses());
    dispatch(fetchSubjects({ limit: 'all' }));
  }, [dispatch]);

  useEffect(() => {
    api.get('/reports/profiles').then((res) => {
      if (res.data?.success) setProfiles(res.data.data || []);
    }).catch(() => {});
  }, []);

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
    setError(null);
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
    const profile = profiles.find((p) => p._id === profileId);
    if (!profile) return;
    setFormData((prev) => ({
      ...prev,
      profileId,
      sources: profile.sources || prev.sources,
      sections: profile.sections || prev.sections
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
    setGenerating(true);
    setError(null);
    setReport(null);
    setDraft(null);
    setDraftStatus(null);
    setEmailPreview(null);
    setSendError(null);

    try {
      const requestedLanguages = buildRequestedLanguages(
        formData.primaryLanguage,
        formData.secondaryLanguage
      );
      const response = await api.post('/reports/generate-advanced', {
        ...formData,
        language: toLegacyLanguageValue(requestedLanguages),
        requestedLanguages,
        sendEmail: false
      });

      if (response.data.success) {
        const data = response.data.data;
        setReport(data);
        setDraft(data.draft);
        setDraftStatus(DRAFT_STATUSES.DRAFT);
        setDataExpanded(true);
        toast.success('Draft generated. Review and approve to send.');
        loadEmailPreview(data.draft?._id);
      } else {
        setError(response.data.message || 'Failed to generate report');
        toast.error(response.data.message || 'Failed to generate report');
      }
    } catch {
      setError('Failed to connect to server');
      toast.error('Failed to connect to server');
    } finally {
      setGenerating(false);
    }
  }, [formData, loadEmailPreview]);

  const handleApproveDraft = useCallback(async () => {
    if (!draft?._id) return;
    setGenerating(true);

    try {
      // Approval is the moment the draft freezes, so the recipient checkboxes
      // travel with it.
      const response = await api.post(`/reports/drafts/${draft._id}/approve`, {
        recipients: formData.recipients
      });
      if (response.data.success) {
        setDraftStatus(DRAFT_STATUSES.APPROVED);
        toast.success('Draft approved. Ready to send.');
        loadEmailPreview(draft._id);
      } else {
        toast.error(response.data.message || 'Failed to approve draft');
      }
    } catch {
      toast.error('Failed to connect to server');
    } finally {
      setGenerating(false);
    }
  }, [draft, formData.recipients, loadEmailPreview]);

  const handleSendDraft = useCallback(async () => {
    if (!draft?._id) return;
    setGenerating(true);
    setSendError(null);

    try {
      const response = await api.post(`/reports/drafts/${draft._id}/send`);
      if (response.data.success) {
        setDraftStatus(DRAFT_STATUSES.SENT);
        toast.success('Report sent to recipients!');
      } else {
        const message = response.data.message || 'Failed to send report';
        setDraftStatus(response.data.data?.draft?.status || DRAFT_STATUSES.FAILED);
        setSendError(message);
        toast.error(message);
      }
    } catch (err) {
      // A rejected send still carries the server's reason; saying "could not
      // connect" would hide whether the family got the email or not.
      const message = err.response?.data?.message || 'Failed to connect to server';
      const status = err.response?.data?.data?.draft?.status;
      if (err.response?.status === 409) {
        // Someone else already claimed this send.
        setDraftStatus(DRAFT_STATUSES.SENDING);
      } else {
        setDraftStatus(status || (err.response ? DRAFT_STATUSES.FAILED : draftStatus));
      }
      setSendError(message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  }, [draft, draftStatus]);

  const handleUpdateDraftContent = useCallback(async (content) => {
    if (!draft?._id) return;

    try {
      const response = await api.patch(`/reports/drafts/${draft._id}`, { content });
      if (response.data.success) {
        setReport((prev) => ({ ...prev, report: content }));
        toast.success('Draft updated.');
        loadEmailPreview(draft._id);
      }
    } catch {
      toast.error('Failed to update draft');
    }
  }, [draft, loadEmailPreview]);

  // The remark belongs to the draft once it exists: sync on blur rather than
  // requesting on every keystroke, and only while the draft is still editable.
  const handleTeacherRemarkBlur = useCallback(async () => {
    if (!draft?._id || draftStatus !== DRAFT_STATUSES.DRAFT) return;
    try {
      const response = await api.patch(`/reports/drafts/${draft._id}`, {
        teacherRemark: formData.teacherRemark
      });
      if (response.data.success) loadEmailPreview(draft._id);
    } catch {
      toast.error('Could not save the teacher note.');
    }
  }, [draft, draftStatus, formData.teacherRemark, loadEmailPreview]);

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
    handleRegenerate,
    resetGeneratedReport,
    emailPreview,
    retryEmailPreview,
    sendError
  };
};

export default useAdvancedReportGenerator;
