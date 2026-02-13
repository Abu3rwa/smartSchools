import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchMyAssignments,
  selectMyReadingAssignments,
  selectReadingLoading,
  selectReadingError,
} from '../store/slices/readingSlice';
import { HiOutlineBookOpen, HiOutlineArrowRight, HiOutlineCheck } from 'react-icons/hi';
import toast from 'react-hot-toast';
import './ReadingMyAssignmentsPage.css';

const ReadingMyAssignmentsPage = () => {
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

  const formatDate = (d) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="reading-my-assignments-page">
      <div className="page-header">
        <h1>My reading assignments</h1>
        <p className="subtitle">
          Texts assigned by your teacher. Build vocabulary and critical thinking
          with level-appropriate readings.
        </p>
      </div>

      {loading && assignments.length === 0 ? (
        <div className="loading-container">
          <div className="spinner" />
        </div>
      ) : assignments.length === 0 ? (
        <div className="reading-empty">
          <HiOutlineBookOpen size={48} className="empty-icon" />
          <h3>No assignments yet</h3>
          <p>Your teacher will assign readings here.</p>
        </div>
      ) : (
        <div className="reading-assignments-list">
          {assignments.map((a) => (
            <article
              key={a._id}
              className={`reading-assignment-card ${a.completed ? 'completed' : ''}`}
            >
              <div className="card-main">
                <h3 className="card-title">{a.text?.title}</h3>
                {a.text?.subjectArea && (
                  <span className="card-meta">{a.text.subjectArea}</span>
                )}
                {a.dueDate && (
                  <span className="card-due">
                    Due {formatDate(a.dueDate)}
                  </span>
                )}
                {a.instructions && (
                  <p className="card-instructions">{a.instructions}</p>
                )}
              </div>
              <div className="card-footer">
                {a.completed ? (
                  <span className="completed-badge">
                    <HiOutlineCheck size={18} />
                    Completed
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() =>
                      navigate(`/portal/reading/view/${a.text?._id}`, {
                        state: { assignmentId: a._id },
                      })
                    }
                  >
                    Read
                    <HiOutlineArrowRight size={16} />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReadingMyAssignmentsPage;
