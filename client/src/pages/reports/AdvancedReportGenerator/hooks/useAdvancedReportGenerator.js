import { useCallback, useEffect, useMemo, useState } from 'react';
import DOMPurify from 'isomorphic-dompurify';
import toast from 'react-hot-toast';
import { useDispatch, useSelector } from 'react-redux';
import { fetchStudents, selectStudents } from '@/store/slices/studentSlice';
import { fetchClasses, selectClasses } from '@/store/slices/classSlice';
import api from '../../../../config/api';
import { createDefaultFormData } from '../constants';
import { buildRequestedLanguages, toLegacyLanguageValue } from '../../../../constants/aiLanguages';

const useAdvancedReportGenerator = () => {
  const dispatch = useDispatch();
  const students = useSelector(selectStudents);
  const classes = useSelector(selectClasses);

  const [formData, setFormData] = useState(createDefaultFormData());
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    dispatch(fetchStudents());
    dispatch(fetchClasses());
  }, [dispatch]);

  // Filter students by selected class
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

  const handleInputChange = useCallback((event) => {
    const { name, value, type, checked } = event.target;

    if (type === 'checkbox') {
      if (name.includes('recipients.')) {
        const recipientField = name.split('.')[1];
        setFormData((prev) => ({
          ...prev,
          recipients: {
            ...prev.recipients,
            [recipientField]: checked
          }
        }));
      } else {
        setFormData((prev) => ({
          ...prev,
          [name]: checked
        }));
      }
      return;
    }

    if (name.includes('dateRange.')) {
      const dateField = name.split('.')[1];
      setFormData((prev) => ({
        ...prev,
        dateRange: {
          ...prev.dateRange,
          [dateField]: value
        }
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'classId' ? { studentId: '' } : {})
    }));
  }, []);

  const handleGeneratePreview = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setReport(null);

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
        setReport(response.data.data);
        toast.success('Report generated successfully!');
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
  }, [formData]);

  const handleGenerateAndSend = useCallback(async () => {
    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const requestedLanguages = buildRequestedLanguages(
        formData.primaryLanguage,
        formData.secondaryLanguage
      );
      const response = await api.post('/reports/generate-advanced', {
        ...formData,
        language: toLegacyLanguageValue(requestedLanguages),
        requestedLanguages,
        sendEmail: true
      });

      if (response.data.success && response.data.data.emailResults) {
        const { primaryRecipients, ccRecipients } = response.data.data.emailResults;

        toast.success(
          `Report sent! ${primaryRecipients} student contact(s), ${ccRecipients} teacher CC`,
          { duration: 5000 }
        );

        setSuccess({
          message: 'Report generated and sent successfully!',
          details: response.data.data.emailResults
        });
        setReport(response.data.data);
      } else {
        setError(response.data.message || 'Failed to generate and send report');
        toast.error(response.data.message || 'Failed to send report');
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setSending(false);
    }
  }, [formData]);

  const sanitizedReportHtml = useMemo(() => {
    if (!report?.report) return '';
    return DOMPurify.sanitize(report.report, {
      FORBID_TAGS: ['table', 'thead', 'tbody', 'tr', 'th', 'td'],
      FORBID_ATTR: ['style']
    });
  }, [report]);

  return {
    students: filteredStudents,
    classes,
    formData,
    setFormData,
    generating,
    sending,
    report,
    error,
    success,
    handleInputChange,
    handleGeneratePreview,
    handleGenerateAndSend,
    sanitizedReportHtml
  };
};

export default useAdvancedReportGenerator;
