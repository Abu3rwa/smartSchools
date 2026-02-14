import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectUser } from '../store/slices/authSlice';
import api from '../config/api';
import { HiOutlineClipboardList } from 'react-icons/hi';
import toast from 'react-hot-toast';
import './AttendanceRequestFormPage.css';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.pdf'];

const AttendanceRequestFormPage = () => {
    const navigate = useNavigate();
    const user = useSelector(selectUser);
    const [requestTypes, setRequestTypes] = useState([]);
    const [eligibleStudents, setEligibleStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const today = new Date().toISOString().slice(0, 10);
    const [formData, setFormData] = useState({
        departmentOrSupervisor: '',
        requestType: '',
        requestDate: today,
        startDate: today,
        endDate: today,
        fromTime: '',
        toTime: '',
        notes: '',
        student: '',
    });
    const [file, setFile] = useState(null);
    const [fileError, setFileError] = useState('');
    const [errors, setErrors] = useState({});

    const isParentOrStudent = user?.role === 'parent' || user?.role === 'student';
    const showStudentSelect = isParentOrStudent && eligibleStudents.length > 0;
    const showDepartmentField = user?.role === 'teacher' || user?.role === 'admin' || user?.role === 'department_principal';

    useEffect(() => {
        const fetchTypes = () =>
            api.get('/attendance-request-types').then((res) => {
                if (res.data.success) setRequestTypes(res.data.data || []);
            });
        fetchTypes().catch(() => toast.error('Failed to load request types')).finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!isParentOrStudent) return;
        api.get('/attendance-requests/eligible-students')
            .then((res) => {
                if (res.data.success) setEligibleStudents(res.data.data || []);
            })
            .catch(() => {});
    }, [isParentOrStudent]);

    // Auto-fill department + direct supervisor for teachers (from Teacher.department and department principal)
    useEffect(() => {
        if (user?.role !== 'teacher') return;
        api.get('/attendance-requests/requester-context')
            .then((res) => {
                if (res.data.success && res.data.data?.departmentOrSupervisor) {
                    setFormData((prev) => ({ ...prev, departmentOrSupervisor: res.data.data.departmentOrSupervisor }));
                }
            })
            .catch(() => {});
    }, [user?.role]);

    const selectedType = requestTypes.find((t) => t._id === formData.requestType);
    const requiresProof = selectedType?.requiresProof === true;
    const useDateRange = selectedType?.useDateRange === true;

    const validate = () => {
        const next = {};
        if (!formData.requestType) next.requestType = 'Type of request is required';
        if (showDepartmentField && !formData.departmentOrSupervisor?.trim()) next.departmentOrSupervisor = 'Department / Direct supervisor is required';
        if (useDateRange) {
            if (!formData.startDate) next.startDate = 'Start date is required';
            if (!formData.endDate) next.endDate = 'End date is required';
            if (formData.startDate && formData.endDate && formData.endDate < formData.startDate) next.endDate = 'End date must be on or after start date';
        } else {
            if (!formData.requestDate) next.requestDate = 'Date is required';
            if (!formData.fromTime) next.fromTime = 'From time is required';
            if (!formData.toTime) next.toTime = 'To time is required';
        }
        if (requiresProof && !file) next.attachment = 'Supporting proof document is required for this request type';
        if (file) {
            const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
            if (!ALLOWED_EXT.includes(ext)) next.attachment = 'Allowed types: jpg, png, pdf';
            else if (file.size > MAX_FILE_SIZE) next.attachment = 'Max file size 10 MB';
        }
        setFileError(next.attachment || '');
        setErrors(next);
        return Object.keys(next).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;
        setSubmitting(true);
        const fd = new FormData();
        fd.append('requestType', formData.requestType);
        fd.append('departmentOrSupervisor', formData.departmentOrSupervisor);
        if (useDateRange) {
            fd.append('startDate', formData.startDate);
            fd.append('endDate', formData.endDate);
        } else {
            fd.append('requestDate', formData.requestDate);
            fd.append('fromTime', formData.fromTime);
            fd.append('toTime', formData.toTime);
        }
        fd.append('notes', formData.notes);
        if (formData.student) fd.append('student', formData.student);
        if (file) fd.append('attachment', file);
        try {
            const res = await api.post('/attendance-requests', fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            if (res.data.success) {
                toast.success(res.data.message || 'Request submitted. You will be notified when it is reviewed.');
                navigate('/portal/attendance-requests');
            } else {
                toast.error(res.data.message || 'Failed to submit');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to submit request');
        } finally {
            setSubmitting(false);
        }
    };

    const requesterName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : '';
    const requesterEmail = user?.email || '';

    if (loading) {
        return (
            <div className="attendance-request-form-page">
                <div className="loading-state">
                    <div className="spinner" />
                    <p>Loading form...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="attendance-request-form-page">
            <header className="page-header">
                <h1><HiOutlineClipboardList className="header-icon" /> Attendance Request</h1>
                <p className="page-subtitle">Submit an attendance or leave request. You will be notified when it is reviewed.</p>
            </header>

            <form className="attendance-request-form" onSubmit={handleSubmit}>
                <div className="form-section">
                    <h2 className="section-title">Requester details</h2>
                    <div className="form-row">
                        <label className="field-label">
                            Name of Requester <span className="ar">اسم مقدم الطلب</span> <span className="required">*</span>
                        </label>
                        <input type="text" className="form-input" value={requesterName} readOnly disabled />
                    </div>
                    <div className="form-row">
                        <label className="field-label">
                            Requester&apos;s Email <span className="ar">البريد الإلكتروني لمقدم الطلب</span> <span className="required">*</span>
                        </label>
                        <input type="email" className="form-input" value={requesterEmail} readOnly disabled />
                    </div>
                    {showDepartmentField && (
                        <div className="form-row">
                            <label className="field-label">Department / Direct supervisor <span className="ar">القسم والمدير المباشر</span> <span className="required">*</span></label>
                            <input
                                type="text"
                                className="form-input"
                                value={formData.departmentOrSupervisor}
                                onChange={(e) => setFormData({ ...formData, departmentOrSupervisor: e.target.value })}
                                placeholder="e.g. Department name or supervisor"
                            />
                            {errors.departmentOrSupervisor && <span className="field-error">{errors.departmentOrSupervisor}</span>}
                        </div>
                    )}
                </div>

                {showStudentSelect && (
                    <div className="form-section">
                        <h2 className="section-title">Student</h2>
                        <div className="form-row">
                            <label className="field-label">Select student (optional)</label>
                            <select
                                className="form-select"
                                value={formData.student}
                                onChange={(e) => setFormData({ ...formData, student: e.target.value })}
                            >
                                <option value="">— Select —</option>
                                {eligibleStudents.map((s) => (
                                    <option key={s._id} value={s._id}>
                                        {s.firstName} {s.lastName} {s.studentId ? `(${s.studentId})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}

                <div className="form-section">
                    <h2 className="section-title">Request details</h2>
                    <div className="form-row">
                        <label className="field-label">
                            Type of Request <span className="ar">نوع الطلب</span> <span className="required">*</span>
                        </label>
                        <select
                            className="form-select"
                            value={formData.requestType}
                            onChange={(e) => setFormData({ ...formData, requestType: e.target.value })}
                            required
                            aria-required="true"
                        >
                            <option value="">— Select type —</option>
                            {requestTypes.map((t) => (
                                <option key={t._id} value={t._id}>
                                    {t.labelEn || t.labelAr || t.code || t._id}
                                </option>
                            ))}
                        </select>
                        {errors.requestType && <span className="field-error">{errors.requestType}</span>}
                    </div>
                    {formData.requestType && (
                        useDateRange ? (
                            <>
                                <div className="form-row form-row-inline">
                                    <div className="form-field-half">
                                        <label className="field-label">
                                            Start Date <span className="ar">التاريخ من</span> <span className="required">*</span>
                                        </label>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={formData.startDate}
                                            onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                        />
                                        {errors.startDate && <span className="field-error">{errors.startDate}</span>}
                                    </div>
                                    <div className="form-field-half">
                                        <label className="field-label">
                                            End Date <span className="ar">التاريخ إلى</span> <span className="required">*</span>
                                        </label>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={formData.endDate}
                                            onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                                        />
                                        {errors.endDate && <span className="field-error">{errors.endDate}</span>}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="form-row">
                                    <label className="field-label">
                                        Date <span className="ar">التاريخ</span> <span className="required">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={formData.requestDate}
                                        onChange={(e) => setFormData({ ...formData, requestDate: e.target.value })}
                                    />
                                    {errors.requestDate && <span className="field-error">{errors.requestDate}</span>}
                                </div>
                                <div className="form-row form-row-inline">
                                    <div className="form-field-half">
                                        <label className="field-label">
                                            From Time <span className="ar">التوقيت من</span> <span className="required">*</span>
                                        </label>
                                        <input
                                            type="time"
                                            className="form-input"
                                            value={formData.fromTime}
                                            onChange={(e) => setFormData({ ...formData, fromTime: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-field-half">
                                        <label className="field-label">
                                            To Time <span className="ar">التوقيت إلى</span> <span className="required">*</span>
                                        </label>
                                        <input
                                            type="time"
                                            className="form-input"
                                            value={formData.toTime}
                                            onChange={(e) => setFormData({ ...formData, toTime: e.target.value })}
                                        />
                                    </div>
                                </div>
                                {(errors.fromTime || errors.toTime) && <span className="field-error">{errors.fromTime || errors.toTime}</span>}
                            </>
                        )
                    )}
                    <div className="form-row">
                        <label className="field-label">Notes / Comments <span className="ar">الملاحظة أو تعليق</span> (optional)</label>
                        <textarea
                            className="form-textarea"
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            rows={4}
                            placeholder="Add any notes or comments..."
                        />
                    </div>
                    <div className="form-row">
                        <label className="field-label">
                            Supporting Proof Document <span className="ar">وثيقة إثبات (إذا لزم الأمر)</span>
                            {requiresProof && <span className="required"> *</span>}
                        </label>
                        <p className="field-hint">Accepted: jpg, png, pdf. Max 10 MB.</p>
                        <div className="file-input-wrap">
                            <input
                                type="file"
                                accept=".jpg,.jpeg,.png,.pdf"
                                className="file-input"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    setFile(f || null);
                                    setFileError('');
                                }}
                            />
                            <span className="file-name">{file ? file.name : 'No file chosen'}</span>
                        </div>
                        {(fileError || errors.attachment) && (
                            <span className="field-error">{fileError || errors.attachment}</span>
                        )}
                    </div>
                </div>

                <div className="form-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => navigate('/portal/attendance-requests')} disabled={submitting}>
                        Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={submitting}>
                        {submitting ? 'Submitting...' : 'Submit request'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default AttendanceRequestFormPage;
