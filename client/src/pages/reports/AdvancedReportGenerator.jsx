import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { fetchStudents, selectStudents } from '../../store/slices/studentSlice';
import toast from 'react-hot-toast';
import './AdvancedReportGenerator.css';

const AdvancedReportGenerator = () => {
  const dispatch = useDispatch();
  const { token } = useSelector((state) => state.auth);
  const students = useSelector(selectStudents);
  
  const [formData, setFormData] = useState({
    studentId: '',
    reportType: 'monthly',
    language: 'english',
    dateRange: {
      startDate: '',
      endDate: ''
    },
    customPrompt: '',
    sendEmail: true,
    recipients: {
      student: false,
      mother: true,
      father: true,
      teacher: true
    }
  });
  
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Fetch students on component mount using Redux
  useEffect(() => {
    dispatch(fetchStudents());
  }, [dispatch]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (type === 'checkbox') {
      if (name.includes('recipients.')) {
        const recipientField = name.split('.')[1];
        setFormData(prev => ({
          ...prev,
          recipients: {
            ...prev.recipients,
            [recipientField]: checked
          }
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          [name]: checked
        }));
      }
    } else if (name.includes('dateRange.')) {
      const dateField = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        dateRange: {
          ...prev.dateRange,
          [dateField]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleGeneratePreview = async () => {
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
  };

  const handleGenerateAndSend = async () => {
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

      // Show toast notification for success
      if (data.success && data.data.emailResults) {
        const { primaryRecipients, ccRecipients } = data.data.emailResults;
        
        // Show toast
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
  };

  const reportTypes = [
    { value: 'weekly', label: 'Weekly Report' },
    { value: 'monthly', label: 'Monthly Report' },
    { value: 'quarterly', label: 'Quarterly Report' },
    { value: 'yearly', label: 'Yearly Report' },
    { value: 'custom', label: 'Custom Date Range' }
  ];

  const languages = [
    { value: 'english', label: 'English Only' },
    { value: 'arabic', label: 'Arabic Only' },
    { value: 'bilingual', label: 'Bilingual (English & Arabic)' }
  ];

  return (
    <div className="report-generator-container">
      <div className="report-generator-header">
        <h1>Advanced Report Generator</h1>
        <p>Generate comprehensive AI-powered student progress reports with multi-language support</p>
      </div>

      <div className="report-generator-form">
        {/* Student Selection */}
        <div className="form-section">
          <h3>Select Student</h3>
          <div className="form-group">
            <label htmlFor="studentId">Student</label>
            <select
              id="studentId"
              name="studentId"
              value={formData.studentId}
              onChange={handleInputChange}
              required
            >
              <option value="">Select a student...</option>
              {students.map((student) => (
                <option key={student._id} value={student._id}>
                  {student.firstName} {student.lastName} - {student.studentId}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Report Configuration */}
        <div className="form-section">
          <h3>Report Configuration</h3>
          <div className="form-group">
            <label htmlFor="reportType">Report Type</label>
            <select
              id="reportType"
              name="reportType"
              value={formData.reportType}
              onChange={handleInputChange}
            >
              {reportTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="language">Language</label>
            <select
              id="language"
              name="language"
              value={formData.language}
              onChange={handleInputChange}
            >
              {languages.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>

          {formData.reportType === 'custom' && (
            <div className="date-range-inputs">
              <div className="form-group">
                <label htmlFor="dateRange.startDate">Start Date</label>
                <input
                  type="date"
                  id="dateRange.startDate"
                  name="dateRange.startDate"
                  value={formData.dateRange.startDate}
                  onChange={handleInputChange}
                />
              </div>
              <div className="form-group">
                <label htmlFor="dateRange.endDate">End Date</label>
                <input
                  type="date"
                  id="dateRange.endDate"
                  name="dateRange.endDate"
                  value={formData.dateRange.endDate}
                  onChange={handleInputChange}
                />
              </div>
            </div>
          )}
        </div>

        {/* Email Recipients */}
        <div className="form-section">
          <h3>Email Recipients</h3>
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                name="sendEmail"
                checked={formData.sendEmail}
                onChange={handleInputChange}
                style={{ marginRight: '8px' }}
              />
              Send report via email
            </label>
          </div>

          {formData.sendEmail && (
            <div className="recipient-checkboxes">
              <div className="recipient-checkbox">
                <input
                  type="checkbox"
                  id="recipients.mother"
                  name="recipients.mother"
                  checked={formData.recipients.mother}
                  onChange={handleInputChange}
                />
                <label htmlFor="recipients.mother">Mother</label>
              </div>
              <div className="recipient-checkbox">
                <input
                  type="checkbox"
                  id="recipients.father"
                  name="recipients.father"
                  checked={formData.recipients.father}
                  onChange={handleInputChange}
                />
                <label htmlFor="recipients.father">Father</label>
              </div>
              <div className="recipient-checkbox">
                <input
                  type="checkbox"
                  id="recipients.student"
                  name="recipients.student"
                  checked={formData.recipients.student}
                  onChange={handleInputChange}
                />
                <label htmlFor="recipients.student">Student</label>
              </div>
              <div className="recipient-checkbox">
                <input
                  type="checkbox"
                  id="recipients.teacher"
                  name="recipients.teacher"
                  checked={formData.recipients.teacher}
                  onChange={handleInputChange}
                />
                <label htmlFor="recipients.teacher">Teacher (CC)</label>
              </div>
            </div>
          )}
        </div>

        {/* Custom Prompt */}
        <div className="form-section">
          <h3>Custom Prompt (Optional)</h3>
          <div className="form-group">
            <label htmlFor="customPrompt">
              Customize the AI prompt for this report
            </label>
            <textarea
              id="customPrompt"
              name="customPrompt"
              className="custom-prompt-editor"
              value={formData.customPrompt}
              onChange={handleInputChange}
              placeholder="Leave empty to use default prompt..."
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="action-buttons">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleGeneratePreview}
            disabled={generating || !formData.studentId}
          >
            {generating ? 'Generating...' : 'Generate Preview'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleGenerateAndSend}
            disabled={sending || !formData.studentId}
          >
            {sending ? 'Sending...' : 'Generate & Send'}
          </button>
        </div>
      </div>

      {/* Success Message */}
      {success && (
        <div className="success-message">
          <h4>✅ {success.message}</h4>
          {success.details && (
            <div style={{ marginTop: '12px' }}>
              <p><strong>Sent to:</strong></p>
              <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                {success.details.primaryRecipients > 0 && (
                  <li>{success.details.primaryRecipients} parent(s)</li>
                )}
                {success.details.ccRecipients > 0 && (
                  <li>{success.details.ccRecipients} CC recipient(s)</li>
                )}
              </ul>
              <p style={{ marginTop: '12px', fontSize: '13px', color: '#065f46' }}>
                📧 Email sent successfully! Recipients will receive the report shortly.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="error-message">
          <h4>❌ Error</h4>
          <p>{error}</p>
        </div>
      )}

      {/* Report Preview */}
      {report && (
        <div className="preview-section">
          <h3>Report Preview</h3>
          <div className="report-preview">
            {generating ? (
              <div className="loading">
                <div className="spinner"></div>
                <span style={{ marginLeft: '12px' }}>Generating report...</span>
              </div>
            ) : (
              <div dangerouslySetInnerHTML={{ __html: report.report }} />
            )}
          </div>
          
          {report.tokenUsage && (
            <div style={{ marginTop: '16px', padding: '12px', background: '#f1f5f9', borderRadius: '8px', fontSize: '13px' }}>
              <strong>Token Usage:</strong> {report.tokenUsage.totalTokens} tokens |
              <strong> Est. Cost:</strong> ${report.tokenUsage.estimatedCost?.toFixed(4) || '0.0000'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdvancedReportGenerator;
