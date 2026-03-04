import { useCallback, useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import toast from 'react-hot-toast';
import { useDispatch, useSelector } from 'react-redux';
import { fetchStudents, selectStudents } from '@/store/slices/studentSlice';
import { createDefaultFormData } from '../constants';

const useAdvancedReportGenerator = ({ token }) => {
  const dispatch = useDispatch();
  const students = useSelector(selectStudents);

  const [formData, setFormData] = useState(createDefaultFormData());
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    dispatch(fetchStudents());
  }, [dispatch]);

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
      [name]: value
    }));
  }, []);

  const handleGeneratePreview = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setReport(null);

    try {
      const response = await fetch('/api/reports/generate-advanced', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          sendEmail: false
        })
      });

      const data = await response.json();

      if (data.success) {
        setReport(data.data);
        toast.success('Report generated successfully!');
      } else {
        setError(data.message || 'Failed to generate report');
        toast.error(data.message || 'Failed to generate report');
      }
    } catch (err) {
      setError('Failed to connect to server');
      toast.error('Failed to connect to server');
    } finally {
      setGenerating(false);
    }
  }, [formData, token]);

  const handleGenerateAndSend = useCallback(async () => {
    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/reports/generate-advanced', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          sendEmail: true
        })
      });

      const data = await response.json();

      if (data.success && data.data.emailResults) {
        const { primaryRecipients, ccRecipients } = data.data.emailResults;

        toast.success(
          `Report sent! ${primaryRecipients} parent(s), ${ccRecipients} CC`,
          { duration: 5000 }
        );

        setSuccess({
          message: 'Report generated and sent successfully!',
          details: data.data.emailResults
        });
        setReport(data.data);
      } else {
        setError(data.message || 'Failed to generate and send report');
        toast.error(data.message || 'Failed to send report');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setSending(false);
    }
  }, [formData, token]);

  const sanitizedReportHtml = useMemo(() => {
    if (!report?.report) return '';
    return DOMPurify.sanitize(report.report, {
      FORBID_TAGS: ['table', 'thead', 'tbody', 'tr', 'th', 'td'],
      FORBID_ATTR: ['style']
    });
  }, [report]);

  return {
    students,
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
