import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchMyAssignments,
  selectMyReadingAssignments,
  selectReadingLoading,
  selectReadingError,
} from '../../../store/slices/readingSlice';
import {
  HiOutlineBookOpen,
  HiOutlineArrowRight,
  HiOutlineCheckCircle,
  HiOutlineMicrophone,
} from 'react-icons/hi';
import toast from 'react-hot-toast';

const ReadingAssignmentCards = () => {
  const { t, i18n } = useTranslation(['reading']);
  const navigate = useNavigate();
  const dispatch = useDispatch();
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

  if (loading && assignments.length === 0) {
    return (
      <div className="loading-container">
        <div className="spinner" />
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="reading-empty">
        <HiOutlineBookOpen size={48} className="empty-icon" />
        <h3>{t('reading:my.emptyTitle')}</h3>
        <p>{t('reading:my.emptySubtitle')}</p>
      </div>
    );
  }

  return (
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
                    {assignment.score.correctCount}/{assignment.score.totalCount}
                  </span>
                )}
                {assignment.fluency?.enabled && (
                  <span className="card-fluency-badge">
                    <HiOutlineMicrophone size={14} />
                    {t('reading:fluency.badge')}
                    <span className="card-fluency-sep">·</span>
                    {t('reading:fluency.badgeCount', {
                      done: assignment.fluency.partsDone,
                      total: assignment.fluency.parts,
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
  );
};

export default ReadingAssignmentCards;
