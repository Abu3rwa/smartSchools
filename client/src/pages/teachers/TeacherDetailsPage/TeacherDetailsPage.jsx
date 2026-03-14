import { useNavigate, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { removeClassFromTeacher } from '../../../store/slices/teacherSlice';
import { fetchClasses } from '../../../store/slices/classSlice';
import { selectIsAdmin, selectUser } from '../../../store/slices/authSlice';
import { TEACHER_DETAILS_MESSAGES } from './constants';
import TeacherDetailsHeader from './components/TeacherDetailsHeader';
import TeacherInfoPanel from './components/TeacherInfoPanel';
import TeacherClassesPanel from './components/TeacherClassesPanel';
import useTeacherDetailsState from './hooks/useTeacherDetailsState';
import './TeacherDetailsPage.css';

const TeacherDetailsPage = () => {
    const dispatch = useDispatch();
    const { id } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation(['teachers']);
    const { teachers, currentTeacher, loading } = useTeacherDetailsState(id);
    const isAdmin = useSelector(selectIsAdmin);
    const user = useSelector(selectUser);
    const canManageTeachers = isAdmin || user?.role === 'department_principal';

    const handleBack = () => {
        navigate('/portal/teachers');
    };

    const handleTeacherChange = (teacherId) => {
        navigate(`/portal/teachers/${teacherId}`);
    };

    const handleRemoveAssignment = async (assignmentId) => {
        if (!currentTeacher?._id) return;

        if (!window.confirm(t('teachers:confirm.removeAssignment'))) {
            return;
        }

        const result = await dispatch(removeClassFromTeacher({
            teacherId: currentTeacher._id,
            assignmentId
        }));

        if (removeClassFromTeacher.fulfilled.match(result)) {
            toast.success(t('teachers:toast.assignmentRemoved'));
            dispatch(fetchClasses());
        } else {
            toast.error(result.payload || t('teachers:toast.assignmentRemoveFailed'));
        }
    };

    if (loading) {
        return (
            <div className="teacher-details-page">
                <div className="loading-container">
                    <div className="spinner"></div>
                </div>
            </div>
        );
    }

    if (!currentTeacher) {
        return (
            <div className="teacher-details-page">
                <div className="empty-state">
                    <h3>{TEACHER_DETAILS_MESSAGES.NOT_FOUND}</h3>
                    <button className="btn btn-primary" onClick={handleBack}>
                        {TEACHER_DETAILS_MESSAGES.BACK_TO_TEACHERS}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="teacher-details-page">
            <TeacherDetailsHeader
                teachers={teachers}
                currentTeacherId={currentTeacher._id}
                onBack={handleBack}
                onTeacherChange={handleTeacherChange}
            />

            <div className="teacher-profile-card">
                <TeacherInfoPanel teacher={currentTeacher} />
                <TeacherClassesPanel
                    teacher={currentTeacher}
                    canManageTeachers={canManageTeachers}
                    onRemoveAssignment={handleRemoveAssignment}
                />
            </div>
        </div>
    );
};

export default TeacherDetailsPage;
