import { useNavigate, useParams } from 'react-router-dom';
import { TEACHER_DETAILS_MESSAGES } from './constants';
import TeacherDetailsHeader from './components/TeacherDetailsHeader';
import TeacherInfoPanel from './components/TeacherInfoPanel';
import TeacherClassesPanel from './components/TeacherClassesPanel';
import useTeacherDetailsState from './hooks/useTeacherDetailsState';
import './TeacherDetailsPage.css';

const TeacherDetailsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { teachers, currentTeacher, loading } = useTeacherDetailsState(id);

    const handleBack = () => {
        navigate('/portal/teachers');
    };

    const handleTeacherChange = (teacherId) => {
        navigate(`/portal/teachers/${teacherId}`);
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
                <TeacherClassesPanel teacher={currentTeacher} />
            </div>
        </div>
    );
};

export default TeacherDetailsPage;
