import { useEffect, useMemo, useState } from 'react';
import './DailyClassworkEmailModal.css';
import EmailLanguageControl from '../../../../components/shared/EmailLanguageControl';
import {
    getEmailLanguagePreference,
    saveEmailLanguagePreference
} from '../../../../utils/emailLanguagePreference';

const todayKey = () => new Date().toISOString().slice(0, 10);
const studentIdOf = (student) => String(student?._id || student?.id || '');
const gradeStudentIdOf = (grade) => String(grade?.student?._id || grade?.student || '');
const dateKeyOf = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

const DailyClassworkEmailModal = ({
    open,
    classId,
    students = [],
    grades = [],
    selectedSubject,
    userId,
    sending = false,
    onClose,
    onSend
}) => {
    const [date, setDate] = useState(todayKey);
    const [language, setLanguage] = useState('en');
    const [rememberLanguage, setRememberLanguage] = useState(false);
    const [selectedStudentIds, setSelectedStudentIds] = useState([]);

    useEffect(() => {
        if (!open) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLanguage(getEmailLanguagePreference(userId));
        setRememberLanguage(false);
    }, [open, userId]);

    const dailyGrades = useMemo(() => grades.filter((grade) => (
        dateKeyOf(grade.date) === date
        && String(grade.category || grade.gradeType || '').toLowerCase() === 'classwork'
    )), [date, grades]);

    const gradesByStudent = useMemo(() => new Map(
        dailyGrades.map((grade) => [gradeStudentIdOf(grade), grade])
    ), [dailyGrades]);

    useEffect(() => {
        if (!open) return;
        // Reset the recipient selection when the selected day changes.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedStudentIds(students
            .map(studentIdOf)
            .filter((studentId) => gradesByStudent.has(studentId)));
    }, [date, gradesByStudent, open, students]);

    if (!open) return null;

    const toggleStudent = (studentId) => {
        setSelectedStudentIds((current) => current.includes(studentId)
            ? current.filter((id) => id !== studentId)
            : [...current, studentId]);
    };

    const selectAll = () => {
        setSelectedStudentIds(students.map(studentIdOf));
    };

    const clearAll = () => setSelectedStudentIds([]);

    const handleSend = async () => {
        if (rememberLanguage) {
            saveEmailLanguagePreference(userId, language);
        }
        const sent = await onSend({
            classId,
            date,
            language,
            rememberLanguage,
            subject: selectedSubject,
            studentIds: selectedStudentIds
        });
        if (sent) onClose();
    };

    return (
        <div className="daily-classwork-overlay" role="presentation" onMouseDown={onClose}>
            <div className="daily-classwork-modal" role="dialog" aria-modal="true" aria-labelledby="daily-classwork-title" onMouseDown={(event) => event.stopPropagation()}>
                <div className="daily-classwork-header">
                    <div>
                        <span className="daily-classwork-eyebrow">Gradebook communication</span>
                        <h2 id="daily-classwork-title">Send Daily Classwork</h2>
                    </div>
                    <button type="button" className="daily-classwork-close" onClick={onClose} aria-label="Close">×</button>
                </div>

                <div className="daily-classwork-controls">
                    <label>
                        Date
                        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                    </label>
                    <EmailLanguageControl
                        language={language}
                        onLanguageChange={setLanguage}
                        rememberLanguage={rememberLanguage}
                        onRememberLanguageChange={setRememberLanguage}
                        name="daily-classwork-language"
                    />
                </div>

                <div className="daily-classwork-summary">
                    <strong>{selectedStudentIds.length}</strong> student(s) selected
                    <span>{dailyGrades.length} classwork grade(s) found for this day</span>
                </div>

                <div className="daily-classwork-selection-actions">
                    <button type="button" className="btn btn-outline btn-sm" onClick={selectAll}>Select all</button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={clearAll}>Clear</button>
                </div>

                <div className="daily-classwork-roster">
                    {students.map((student) => {
                        const studentId = studentIdOf(student);
                        const grade = gradesByStudent.get(studentId);
                        return (
                            <label className="daily-classwork-student" key={studentId}>
                                <input type="checkbox" checked={selectedStudentIds.includes(studentId)} onChange={() => toggleStudent(studentId)} />
                                <span className="daily-classwork-student-name">{student.firstName} {student.lastName}</span>
                                {grade ? (
                                    <span className="daily-classwork-grade">{grade.marks}/{grade.maxMarks}{grade.remarks ? ` - ${grade.remarks}` : ''}</span>
                                ) : (
                                    <span className="daily-classwork-no-grade">No classwork recorded</span>
                                )}
                            </label>
                        );
                    })}
                </div>

                <div className="daily-classwork-footer">
                    <span>{language === 'ar' ? 'سيتم إرسال تقرير العمل الصفي باللغة العربية.' : 'Emails will include only classwork for the selected day.'}</span>
                    <div>
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="button" className="btn btn-success" onClick={handleSend} disabled={sending || selectedStudentIds.length === 0}>
                            {sending ? 'Sending...' : 'Confirm & Send'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DailyClassworkEmailModal;