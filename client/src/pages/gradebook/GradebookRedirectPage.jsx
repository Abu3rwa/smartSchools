import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchClasses, selectClasses } from '../../store/slices/classSlice';
import { fetchMyClasses, selectMyClasses } from '../../store/slices/teacherSlice';
import { selectCurrentAcademicYear } from '../../store/slices/uiSlice';
import { selectUser } from '../../store/slices/authSlice';

const GradebookRedirectPage = () => {
    const { t } = useTranslation(['gradebook']);
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const user = useSelector(selectUser);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const classes = useSelector(selectClasses);
    const myClasses = useSelector(selectMyClasses);
    const [selectedClassId, setSelectedClassId] = useState('');

    useEffect(() => {
        dispatch(fetchClasses({ academicYear }));
        if (user?.role === 'teacher') {
            dispatch(fetchMyClasses());
        }
    }, [academicYear, dispatch, user?.role]);

    const availableClasses = useMemo(() => {
        if (user?.role !== 'teacher') {
            return classes;
        }
        const seen = new Set();
        return (myClasses || [])
            .map((item) => item.class)
            .filter((classItem) => classItem && !seen.has(classItem._id) && (seen.add(classItem._id), true));
    }, [classes, myClasses, user?.role]);

    useEffect(() => {
        if (availableClasses.length === 1) {
            navigate(`/portal/classes/${availableClasses[0]._id}/gradebook`, { replace: true });
            return;
        }
        if (!selectedClassId && availableClasses.length > 0) {
            setSelectedClassId(availableClasses[0]._id);
        }
    }, [availableClasses, navigate, selectedClassId]);

    const handleOpenGradebook = () => {
        if (!selectedClassId) return;
        navigate(`/portal/classes/${selectedClassId}/gradebook`);
    };

    return (
        <div style={{ padding: 24 }}>
            <div className="card" style={{ maxWidth: 560 }}>
                <div className="card-header">
                    <h3 className="card-title">{t('gradebook:redirect.title')}</h3>
                </div>

                {availableClasses.length === 0 ? (
                    <div className="empty-state">{t('gradebook:redirect.noClasses')}</div>
                ) : (
                    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
                        <div className="form-group">
                            <label>{t('gradebook:redirect.selectClass')}</label>
                            <select
                                value={selectedClassId}
                                onChange={(event) => setSelectedClassId(event.target.value)}
                            >
                                {availableClasses.map((item) => (
                                    <option key={item._id} value={item._id}>
                                        {item.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <button type="button" className="btn btn-primary" onClick={handleOpenGradebook}>
                                {t('gradebook:redirect.open')}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GradebookRedirectPage;
