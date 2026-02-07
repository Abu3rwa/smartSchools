import { useState } from 'react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { HiOutlineX, HiOutlineCalendar, HiOutlineClock, HiOutlineDocumentText } from 'react-icons/hi';
import './AIReportModal.css';

const AIReportModal = ({ isOpen, onClose, onGenerate, studentName }) => {
    const [periodType, setPeriodType] = useState('predefined'); // 'predefined' or 'custom'
    const [predefinedPeriod, setPredefinedPeriod] = useState('this-week');
    const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [isLoading, setIsLoading] = useState(false);

    const predefinedOptions = [
        { value: 'this-week', label: 'This Week', icon: <HiOutlineClock /> },
        { value: 'last-week', label: 'Last Week', icon: <HiOutlineClock /> },
        { value: 'this-month', label: 'This Month', icon: <HiOutlineCalendar /> },
        { value: 'last-month', label: 'Last Month', icon: <HiOutlineCalendar /> }
    ];

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            let payload;
            
            if (periodType === 'predefined') {
                payload = {
                    periodType: predefinedPeriod
                };
            } else {
                // Validate dates
                const start = new Date(startDate);
                const end = new Date(endDate);
                
                if (start > end) {
                    alert('Start date must be before end date');
                    return;
                }
                
                payload = {
                    startDate,
                    endDate
                };
            }

            await onGenerate(payload, periodType);
        } catch (error) {
            console.error('Error generating report:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content ai-report-modal">
                <div className="modal-header">
                    <h2>
                        <HiOutlineDocumentText className="icon" />
                        Generate AI Report for {studentName}
                    </h2>
                    <button className="close-button" onClick={onClose}>
                        <HiOutlineX />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="modal-body">
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
                                />
                                <span className="radio-label">Predefined Periods</span>
                            </label>
                            <label className="radio-option">
                                <input
                                    type="radio"
                                    name="periodType"
                                    value="custom"
                                    checked={periodType === 'custom'}
                                    onChange={(e) => setPeriodType(e.target.value)}
                                />
                                <span className="radio-label">Custom Date Range</span>
                            </label>
                        </div>
                    </div>

                    {periodType === 'predefined' ? (
                        <div className="form-group">
                            <label className="form-label">Select Period</label>
                            <div className="period-options">
                                {predefinedOptions.map(option => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        className={`period-option ${predefinedPeriod === option.value ? 'selected' : ''}`}
                                        onClick={() => setPredefinedPeriod(option.value)}
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
                                <label className="form-label">Start Date</label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">End Date</label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                    )}

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            className="btn btn-primary"
                            disabled={isLoading}
                        >
                            {isLoading ? 'Generating...' : 'Generate & Send Report'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AIReportModal;