import { useState, useEffect, useCallback } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import DOMPurify from 'dompurify';
import { 
    HiOutlineX, 
    HiOutlineCalendar, 
    HiOutlineClock, 
    HiOutlineDocumentText,
    HiOutlineSparkles,
    HiOutlineTrendingUp,
    HiOutlineTrendingDown,
    HiOutlineChartBar,
    HiOutlinePencil,
    HiOutlineMail
} from 'react-icons/hi';
import { AI_LANGUAGE_OPTIONS } from '../../constants/aiLanguages';
import './AIReportModal.css';

/**
 * AI Progress Report Modal
 * A sophisticated glassmorphism modal for AI-generated progress reports
 */
const AIReportModal = ({ 
    isOpen, 
    onClose, 
    onGenerate,
    onSendReport,
    studentName,
    aiAnalysis = null,
    reportContent = null,
    timestamp = null,
    primaryLanguage = 'en',
    secondaryLanguage = '',
    onPrimaryLanguageChange = () => {},
    onSecondaryLanguageChange = () => {},
    status = null // optional external status: 'idle' | 'generating' | 'complete' | 'error'
}) => {
    const [periodType, setPeriodType] = useState('predefined');
    const [predefinedPeriod, setPredefinedPeriod] = useState('this-week');
    const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [localStatus, setLocalStatus] = useState(status);
    const [isEditingReport, setIsEditingReport] = useState(false);
    const [editedReportContent, setEditedReportContent] = useState('');
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        if (typeof status === 'string') {
            setLocalStatus(status);
        }
    }, [status]);

    useEffect(() => {
        if (reportContent && !isEditingReport) {
            setEditedReportContent(reportContent);
        }
    }, [reportContent, isEditingReport]);

    // Handle escape key
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Escape' && !isLoading) {
            onClose();
        }
    }, [isLoading, onClose]);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    // Simulate progress during generation
    useEffect(() => {
        if (localStatus === 'generating' && progress < 100) {
            const interval = setInterval(() => {
                setProgress(prev => {
                    const increment = Math.random() * 15 + 5;
                    return Math.min(prev + increment, 100);
                });
            }, 500);
            return () => clearInterval(interval);
        }
    }, [localStatus, progress]);

    const predefinedOptions = [
        { value: 'this-week', label: 'This Week', icon: <HiOutlineClock /> },
        { value: 'last-week', label: 'Last Week', icon: <HiOutlineClock /> },
        { value: 'this-month', label: 'This Month', icon: <HiOutlineCalendar /> },
        { value: 'last-month', label: 'Last Month', icon: <HiOutlineCalendar /> }
    ];

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setLocalStatus('generating');
        setProgress(0);

        try {
            let payload;
            
            if (periodType === 'predefined') {
                payload = { periodType: predefinedPeriod };
            } else {
                const start = new Date(startDate);
                const end = new Date(endDate);
                
                if (start > end) {
                    alert('Start date must be before end date');
                    setLocalStatus('error');
                    setIsLoading(false);
                    return;
                }
                
                payload = { startDate, endDate };
            }

            await onGenerate(payload, periodType);
            setLocalStatus('complete');
        } catch (error) {
            console.error('Error generating report:', error);
            setLocalStatus('error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleClose = () => {
        if (!isLoading) {
            onClose();
            // Reset state after close animation
            setTimeout(() => {
                setLocalStatus('idle');
                setProgress(0);
            }, 300);
        }
    };

    const getStatusConfig = () => {
        switch (localStatus) {
            case 'generating':
                return { 
                    className: 'pending',
                    text: 'Generating AI Report...',
                    icon: <div className="status-indicator pending" />
                };
            case 'complete':
                return { 
                    className: '',
                    text: 'Report Generated Successfully',
                    icon: <div className="status-indicator" />
                };
            case 'error':
                return { 
                    className: 'error',
                    text: 'Generation Failed',
                    icon: <div className="status-indicator error" />
                };
            default:
                return null;
        }
    };

    const statusConfig = getStatusConfig();

    const formatRelativeTime = (date) => {
        if (!date) return null;
        return formatDistanceToNow(new Date(date), { addSuffix: true });
    };

    if (!isOpen) return null;

    return (
        <div 
            className="modal-overlay" 
            onClick={(e) => e.target === e.currentTarget && handleClose()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
        >
            <div className="ai-report-modal" role="document">
                {/* Modal Header */}
                <div className="modal-header">
                    <h2 id="modal-title">
                        <HiOutlineDocumentText className="icon" />
                        Progress Report - {studentName || 'Student'}
                    </h2>
                    <button 
                        className="close-button" 
                        onClick={handleClose}
                        aria-label="Close modal"
                        disabled={isLoading}
                    >
                        <HiOutlineX />
                    </button>
                </div>

                <div className="modal-body">
                    {/* Status Indicator */}
                    {statusConfig && (
                        <div className="status-section" role="status" aria-live="polite">
                            {statusConfig.icon}
                            <span className="status-text">
                                <strong>{statusConfig.text}</strong>
                            </span>
                        </div>
                    )}

                    {/* Loading State */}
                    {localStatus === 'generating' && (
                        <div className="loading-overlay">
                            <div className="loading-spinner" role="status" aria-label="Generating report">
                                <span className="sr-only">Loading...</span>
                            </div>
                            <p className="loading-text">AI is analyzing student performance...</p>
                            
                            {/* Progress Section */}
                            <div className="progress-section">
                                <div className="progress-header">
                                    <span className="progress-title">Analysis Progress</span>
                                    <span className="progress-percentage">{Math.round(progress)}%</span>
                                </div>
                                <div className="progress-bar-container" role="progressbar" 
                                    aria-valuenow={Math.round(progress)} aria-valuemin="0" aria-valuemax="100">
                                    <div 
                                        className="progress-bar" 
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Loading Skeleton */}
                    {localStatus === 'generating' && (
                        <div className="loading-overlay">
                            <div className="skeleton skeleton-title"></div>
                            <div className="skeleton skeleton-text"></div>
                            <div className="skeleton skeleton-text short"></div>
                            <div className="skeleton skeleton-progress"></div>
                            <div className="skeleton-insights">
                                <div className="skeleton skeleton-insight"></div>
                                <div className="skeleton skeleton-insight"></div>
                                <div className="skeleton skeleton-insight"></div>
                                <div className="skeleton skeleton-insight"></div>
                            </div>
                        </div>
                    )}

                    {/* Report Content Preview */}
                    {reportContent && localStatus === 'complete' && (
                        <div className="report-preview-section">
                            <div className="report-preview-header">
                                <h3>Report Preview</h3>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-outline"
                                        onClick={() => {
                                            if (isEditingReport) {
                                                setIsEditingReport(false);
                                            } else {
                                                if (!editedReportContent) {
                                                    setEditedReportContent(reportContent);
                                                }
                                                setIsEditingReport(true);
                                            }
                                        }}
                                    >
                                        <HiOutlinePencil /> {isEditingReport ? 'Save Edits' : 'Edit Report'}
                                    </button>
                                </div>
                            </div>

                            {/* Email Template Preview */}
                            <div style={{
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '8px',
                                maxHeight: '400px',
                                overflowY: 'auto',
                                marginTop: '15px'
                            }}>
                                {/* Email Header */}
                                <div style={{
                                    background: 'var(--brand-gradient)',
                                    padding: '20px',
                                    borderRadius: '8px 8px 0 0',
                                    color: 'white',
                                    textAlign: 'center'
                                }}>
                                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Student Progress Report</h3>
                                </div>

                                {/* Email Body */}
                                <div style={{
                                    padding: '30px',
                                    background: 'var(--bg-secondary)',
                                    fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
                                    lineHeight: '1.6',
                                    color: 'var(--text-primary)'
                                }}>
                                    <div
                                        contentEditable={isEditingReport}
                                        suppressContentEditableWarning={true}
                                        onBlur={(e) => {
                                            if (isEditingReport) {
                                                setEditedReportContent(e.currentTarget.innerHTML);
                                            }
                                        }}
                                        style={{
                                            outline: isEditingReport ? '2px solid var(--primary)' : 'none',
                                            padding: isEditingReport ? '15px' : '0',
                                            borderRadius: isEditingReport ? '8px' : '0',
                                            minHeight: '200px',
                                            cursor: isEditingReport ? 'text' : 'default',
                                            background: isEditingReport ? 'var(--bg-tertiary)' : 'transparent'
                                        }}
                                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(editedReportContent || reportContent) }}
                                    />
                                </div>
                            </div>

                            {/* Editing Instructions */}
                            {isEditingReport && (
                                <div style={{
                                    marginTop: '15px',
                                    padding: '12px 16px',
                                    background: 'var(--status-info-bg)',
                                    border: '1px solid var(--status-info)',
                                    borderRadius: '8px',
                                    fontSize: '13px',
                                    color: 'var(--status-info)'
                                }}>
                                    <strong>✏️ Edit Mode Active:</strong> Click directly in the text above to edit. 
                                    Click "Save Edits" when done to preview your changes.
                                </div>
                            )}

                            {/* Send Button */}
                            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => {
                                        setEditedReportContent('');
                                        setIsEditingReport(false);
                                        setLocalStatus('idle');
                                    }}
                                >
                                    Regenerate
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-success"
                                    onClick={async () => {
                                        if (onSendReport) {
                                            setIsSending(true);
                                            try {
                                                await onSendReport(editedReportContent || reportContent);
                                                handleClose();
                                            } catch (error) {
                                                console.error('Error sending report:', error);
                                            } finally {
                                                setIsSending(false);
                                            }
                                        }
                                    }}
                                    disabled={isEditingReport || isSending}
                                >
                                    <HiOutlineMail /> {isSending ? 'Sending...' : 'Send to Parents'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* AI Analysis Section */}
                    {aiAnalysis && localStatus === 'complete' && (
                        <div className="ai-analysis-section" role="region" aria-label="AI Analysis">
                            <div className="ai-analysis-header">
                                <span className="ai-badge">
                                    <HiOutlineSparkles />
                                    AI Powered
                                </span>
                                <span className="ai-analysis-title">Key Insights</span>
                            </div>
                            <div className="insights-grid">
                                <div className="insight-card">
                                    <div className="insight-label">Overall Average</div>
                                    <div className={`insight-value ${aiAnalysis.average >= 70 ? 'positive' : 'warning'}`}>
                                        {aiAnalysis.average}%
                                    </div>
                                </div>
                                <div className="insight-card">
                                    <div className="insight-label">Performance Trend</div>
                                    <div className="insight-value">
                                        {aiAnalysis.trend === 'up' ? (
                                            <span style={{ color: 'var(--status-success)' }}>
                                                <HiOutlineTrendingUp style={{ marginRight: '4px' }} />
                                                Improving
                                            </span>
                                        ) : aiAnalysis.trend === 'down' ? (
                                            <span style={{ color: 'var(--status-error)' }}>
                                                <HiOutlineTrendingDown style={{ marginRight: '4px' }} />
                                                Declining
                                            </span>
                                        ) : (
                                            <span style={{ color: 'var(--status-warning)' }}>
                                                <HiOutlineChartBar style={{ marginRight: '4px' }} />
                                                Stable
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="insight-card">
                                    <div className="insight-label">Subjects</div>
                                    <div className="insight-value">{aiAnalysis.subjects || 'N/A'}</div>
                                </div>
                                <div className="insight-card">
                                    <div className="insight-label">Strength Area</div>
                                    <div className="insight-value positive">{aiAnalysis.strength || 'N/A'}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Timestamp */}
                    {timestamp && (
                        <div className="timestamp-section">
                            <HiOutlineClock className="timestamp-icon" />
                            <span className="timestamp-text">
                                Generated <strong>{formatRelativeTime(timestamp)}</strong>
                            </span>
                        </div>
                    )}

                    {/* Report Generation Form */}
                    {localStatus !== 'generating' && (
                        <form onSubmit={handleSubmit}>
                            <div className="date-range-fields">
                                <div className="form-group">
                                    <label className="form-label" htmlFor="report-primary-language">Primary Language</label>
                                    <select
                                        id="report-primary-language"
                                        className="form-input"
                                        value={primaryLanguage}
                                        onChange={(event) => {
                                            const nextPrimary = event.target.value;
                                            onPrimaryLanguageChange(nextPrimary);
                                            if (nextPrimary === secondaryLanguage) {
                                                onSecondaryLanguageChange('');
                                            }
                                        }}
                                        disabled={isLoading}
                                    >
                                        {AI_LANGUAGE_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="report-secondary-language">Secondary Language (Optional)</label>
                                    <select
                                        id="report-secondary-language"
                                        className="form-input"
                                        value={secondaryLanguage}
                                        onChange={(event) => onSecondaryLanguageChange(event.target.value)}
                                        disabled={isLoading}
                                    >
                                        <option value="">None</option>
                                        {AI_LANGUAGE_OPTIONS
                                            .filter((option) => option.value !== primaryLanguage)
                                            .map((option) => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                    </select>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Report Period</label>
                                <div className="radio-group">
                                    <label className="radio-option">
                                        <input
                                            type="radio"
                                            name="periodType"
                                            value="predefined"
                                            checked={periodType === 'predefined'}
                                            onChange={(e) => setPeriodType(e.target.value)}
                                            disabled={isLoading}
                                        />
                                        <span>Predefined Periods</span>
                                    </label>
                                    <label className="radio-option">
                                        <input
                                            type="radio"
                                            name="periodType"
                                            value="custom"
                                            checked={periodType === 'custom'}
                                            onChange={(e) => setPeriodType(e.target.value)}
                                            disabled={isLoading}
                                        />
                                        <span>Custom Date Range</span>
                                    </label>
                                </div>
                            </div>

                            {periodType === 'predefined' ? (
                                <div className="form-group">
                                    <label className="form-label">Select Period</label>
                                    <div className="period-options" role="radiogroup" aria-label="Predefined periods">
                                        {predefinedOptions.map(option => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                className={`period-option ${predefinedPeriod === option.value ? 'selected' : ''}`}
                                                onClick={() => setPredefinedPeriod(option.value)}
                                                disabled={isLoading}
                                                role="radio"
                                                aria-checked={predefinedPeriod === option.value}
                                            >
                                                <span className="option-icon">{option.icon}</span>
                                                <span className="option-label">{option.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="date-range-fields">
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="startDate">Start Date</label>
                                        <input
                                            type="date"
                                            id="startDate"
                                            className="form-input"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            required
                                            disabled={isLoading}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="endDate">End Date</label>
                                        <input
                                            type="date"
                                            id="endDate"
                                            className="form-input"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            required
                                            disabled={isLoading}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Modal Footer */}
                            <div className="modal-footer">
                                <button 
                                    type="button" 
                                    className="btn btn-secondary" 
                                    onClick={handleClose}
                                    disabled={isLoading}
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    className="btn btn-primary"
                                    disabled={isLoading}
                                >
                                    {isLoading ? 'Generating...' : 'Generate Report'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AIReportModal;
