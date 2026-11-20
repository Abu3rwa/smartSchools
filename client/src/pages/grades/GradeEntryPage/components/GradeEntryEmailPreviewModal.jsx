import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineX } from 'react-icons/hi';
import api from '../../../../config/api';

const isValidMark = (value, maxMarks) => {
    if (value === '' || value === null || value === undefined) return false;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 && numeric <= maxMarks;
};

const GradeEntryEmailPreviewModal = ({
    classStudents,
    grades,
    maxMarks,
    classId,
    subjectId,
    date,
    lessonTitle,
    lessonSummary,
    initialStudentId,
    defaultLanguage = 'en',
    onClose
}) => {
    const { t } = useTranslation(['grades']);

    const previewableStudents = useMemo(() => (
        classStudents.filter((student) => isValidMark(grades[student._id]?.marks, maxMarks))
    ), [classStudents, grades, maxMarks]);

    const [studentId, setStudentId] = useState(() => {
        const initialValid = previewableStudents.some((student) => String(student._id) === String(initialStudentId));
        return initialValid ? String(initialStudentId) : String(previewableStudents[0]?._id || '');
    });
    const [language, setLanguage] = useState(defaultLanguage);
    const [html, setHtml] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const student = previewableStudents.find((item) => String(item._id) === String(studentId));

    useEffect(() => {
        if (!student) return undefined;
        let mounted = true;
        setLoading(true);
        setError('');
        api.post('/grades/lesson/email-preview', {
            classId,
            subjectId,
            studentId: student._id,
            title: lessonTitle,
            lessonSummary,
            remarks: grades[student._id]?.remarks || '',
            marks: Number(grades[student._id]?.marks),
            maxMarks,
            date,
            language
        })
            .then((response) => {
                if (mounted) setHtml(response.data?.data?.html || '');
            })
            .catch((requestError) => {
                if (!mounted) return;
                setHtml('');
                setError(requestError.response?.data?.message || t('grades:entry.preview.loadFailed'));
            })
            .finally(() => {
                if (mounted) setLoading(false);
            });
        return () => { mounted = false; };
    }, [student, classId, subjectId, lessonTitle, lessonSummary, grades, maxMarks, date, language, t]);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal lesson-preview-modal"
                role="dialog"
                aria-modal="true"
                aria-label={t('grades:entry.preview.title')}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="modal-header">
                    <h3>{t('grades:entry.preview.title')}</h3>
                    <button type="button" className="modal-close" onClick={onClose} aria-label={t('grades:entry.preview.close')}>
                        <HiOutlineX />
                    </button>
                </div>
                <div className="lesson-preview-controls">
                    <label>
                        {t('grades:entry.preview.student')}
                        <select value={studentId} onChange={(event) => setStudentId(event.target.value)}>
                            {previewableStudents.map((item) => (
                                <option key={item._id} value={item._id}>
                                    {item.firstName} {item.lastName}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        {t('grades:entry.preview.language')}
                        <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                            <option value="en">English</option>
                            <option value="ar">العربية</option>
                        </select>
                    </label>
                </div>
                <div className="modal-body lesson-preview-body">
                    {previewableStudents.length === 0 && (
                        <p className="lesson-notice warning" role="status">{t('grades:entry.preview.noGrades')}</p>
                    )}
                    {loading && (
                        <p className="lesson-source-hint" role="status">{t('grades:entry.preview.loading')}</p>
                    )}
                    {error && <p className="lesson-notice error" role="alert">{error}</p>}
                    {!loading && !error && html && (
                        <iframe
                            className="lesson-preview-frame"
                            title={t('grades:entry.preview.title')}
                            sandbox=""
                            srcDoc={html}
                        />
                    )}
                    <p className="lesson-source-hint">{t('grades:entry.preview.hint')}</p>
                </div>
            </div>
        </div>
    );
};

export default GradeEntryEmailPreviewModal;