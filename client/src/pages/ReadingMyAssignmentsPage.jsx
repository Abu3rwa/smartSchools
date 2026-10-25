import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchMyAssignments,
  selectMyReadingAssignments,
  selectReadingLoading,
  selectReadingError,
} from '../store/slices/readingSlice';
import { selectCurrentAcademicYear } from '../store/slices/uiSlice';
import { HiOutlineBookOpen, HiOutlineArrowRight, HiOutlineCheckCircle } from 'react-icons/hi';
import toast from 'react-hot-toast';
import './ReadingMyAssignmentsPage.css';

const ReadingMyAssignmentsPage = () => {
  const { t, i18n } = useTranslation(['reading']);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const academicYear = useSelector(selectCurrentAcademicYear);
  const assignments = useSelector(selectMyReadingAssignments) || [];
  const loading = useSelector(selectReadingLoading);
  const error = useSelector(selectReadingError);

  useEffect(() => {
    dispatch(fetchMyAssignments());
  }, [dispatch]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const formatDate = (value) => {
    if (!value) return null;
    try {
      return new Date(value).toLocaleDateString(i18n.language, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return null;
    }
  };

  return (
    <div className="reading-my-assignments-page">
      <div className="page-header">
        <h1>{t('reading:my.title')}</h1>
        <p className="subtitle">
          {t('reading:my.subtitle')}
          {academicYear ? ` ${t('reading:my.academicYearNote', { year: academicYear })}` : ''}
        </p>
      </div>

      {loading && assignments.length === 0 ? (
        <div className="loading-container">
          <div className="spinner" />
        </div>
      ) : assignments.length === 0 ? (
        <div className="reading-empty">
          <HiOutlineBookOpen size={48} className="empty-icon" />
          <h3>{t('reading:my.emptyTitle')}</h3>
          <p>{t('reading:my.emptySubtitle')}</p>
        </div>
      ) : (
        <div className="reading-assignments-list">
          {assignments.map((assignment) => {
            const due = formatDate(assignment.dueDate);
            return (
              <article
                key={assignment._id}
                className={`reading-assignment-card${assignment.completed ? ' completed' : ''}`}
              >
                <div className="card-main">
                  <div className="card-title-row">
                    <h3 className="card-title">{assignment.text?.title}</h3>
                    {assignment.completed && (
                      <span className="completed-badge">
                        <HiOutlineCheckCircle size={16} />
                        {t('reading:my.completed')}
                      </span>
                    )}
                  </div>
                  <div className="card-meta-row">
                    {assignment.text?.subjectArea && (
                      <span className="card-meta">{assignment.text.subjectArea}</span>
                    )}
                    {due && <span className="card-due">{t('reading:my.dueLabel', { date: due })}</span>}
                    {assignment.score?.totalCount > 0 && (
                      <span className="card-score">
                        {t('reading:my.scoreBadge', {
                          correct: assignment.score.correctCount,
                          total: assignment.score.totalCount,
                        })}
                      </span>
                    )}
                  </div>
                  {assignment.instructions && (
                    <p className="card-instructions">{assignment.instructions}</p>
                  )}
                </div>
                <div className="card-footer">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => navigate(
                      `/portal/reading/view/${assignment.text?._id}?assignmentId=${encodeURIComponent(assignment._id)}`,
                      { state: { assignmentId: assignment._id } }
                    )}
                  >
                    {assignment.completed ? t('reading:my.review') : t('reading:my.read')}
                    <HiOutlineArrowRight size={16} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ReadingMyAssignmentsPage;
