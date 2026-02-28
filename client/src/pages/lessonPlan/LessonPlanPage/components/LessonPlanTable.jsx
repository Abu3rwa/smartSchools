import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiOutlineCalendar,
  HiOutlinePencil,
  HiOutlineDotsVertical,
  HiOutlineEye,
  HiOutlineChat,
  HiOutlineTrash,
} from 'react-icons/hi';
import { format } from 'date-fns';
import { getStatusLabel } from '../constants.js';
import AdminEvaluationButton from '../../../../components/lessonPlan/AdminEvaluationButton.jsx';

const LessonPlanTable = ({
  lessons,
  canFilterAsAdmin,
  canManageLessonPlans,
  canManageLesson,
  onEdit,
  onDelete,
  onAdminNote,
  onOpenEvaluation,
  onTriggerEvaluation,
  evaluationLoadingByLessonId,
}) => {
  const navigate = useNavigate();
  const [openActionMenuLessonId, setOpenActionMenuLessonId] = useState(null);

  useEffect(() => {
    const onDocumentClick = (event) => {
      if (!event.target.closest('.lesson-actions-menu')) {
        setOpenActionMenuLessonId(null);
      }
    };
    const onEsc = (event) => {
      if (event.key === 'Escape') setOpenActionMenuLessonId(null);
    };
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  return (
    <div className="table-container lesson-table-container">
      <table className="data-table lesson-table">
        <thead>
          <tr>
            <th>Title</th>
            {canFilterAsAdmin && <th className="lesson-col-teacher">Teacher</th>}
            <th className="lesson-col-class">Class</th>
            <th className="lesson-col-subject">Subject</th>
            <th>Date</th>
            <th className="lesson-col-status">Status</th>
            {canManageLessonPlans && <th className="lesson-col-actions">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {lessons.map((lesson) => {
            const isMenuOpen = openActionMenuLessonId === lesson._id;
            const lessonIsManageable = canManageLesson(lesson);
            return (
              <tr key={lesson._id}>
                <td>
                  <div className="lesson-title-cell">
                    <span className="lesson-title">{lesson.title}</span>
                  </div>
                </td>
                {canFilterAsAdmin && (
                  <td className="lesson-col-teacher">
                    {lesson.teacher
                      ? `${lesson.teacher.firstName || ''} ${lesson.teacher.lastName || ''}`.trim() || '—'
                      : '—'}
                  </td>
                )}
                <td className="lesson-col-class">{lesson.class?.name || '—'}</td>
                <td className="lesson-col-subject">{lesson.subject?.name || '—'}</td>
                <td>
                  <div className="lesson-date">
                    <HiOutlineCalendar />
                    {format(new Date(lesson.date), 'MMM d, yyyy')}
                  </div>
                </td>
                <td className="lesson-col-status">
                  <span
                    className={`badge lesson-status-badge status-${lesson.status || 'draft'}`}
                  >
                    {getStatusLabel(lesson.status)}
                  </span>
                </td>
                {canManageLessonPlans && (
                  <td className="lesson-col-actions">
                    {lessonIsManageable || canFilterAsAdmin ? (
                      <div className="lesson-actions-menu">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm lesson-actions-trigger"
                          onClick={() =>
                            setOpenActionMenuLessonId(
                              isMenuOpen ? null : lesson._id
                            )
                          }
                          title="Actions"
                          aria-label={`Actions for ${lesson.title}`}
                        >
                          <HiOutlineDotsVertical />
                        </button>
                        {isMenuOpen && (
                          <div className="lesson-actions-dropdown">
                            <button
                              type="button"
                              className="lesson-menu-item"
                              onClick={() => {
                                setOpenActionMenuLessonId(null);
                                navigate(`/portal/lessons/${lesson._id}`);
                              }}
                            >
                              <HiOutlineEye />
                              View / Print
                            </button>
                            {canFilterAsAdmin && (
                              <>
                                <AdminEvaluationButton
                                  loading={Boolean(evaluationLoadingByLessonId?.[lesson._id])}
                                  hasEvaluation={Boolean(lesson.aiEvaluation?.evaluatedAt)}
                                  onClick={() => {
                                    setOpenActionMenuLessonId(null);
                                    if (lesson.aiEvaluation?.evaluatedAt) {
                                      onOpenEvaluation(lesson);
                                    } else {
                                      onTriggerEvaluation(lesson._id, { forceReevaluate: false, openModal: true });
                                    }
                                  }}
                                />
                                {lesson.aiEvaluation?.evaluatedAt && (
                                  <button
                                    type="button"
                                    className="lesson-menu-item"
                                    onClick={() => {
                                      setOpenActionMenuLessonId(null);
                                      onTriggerEvaluation(lesson._id, { forceReevaluate: true, openModal: true });
                                    }}
                                  >
                                    Re-evaluate with AI
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="lesson-menu-item"
                                  onClick={() => {
                                    setOpenActionMenuLessonId(null);
                                    onAdminNote(lesson);
                                  }}
                                >
                                  <HiOutlineChat />
                                  {lesson.adminNoteToTeacher
                                    ? 'View / Edit note to teacher'
                                    : 'Note to teacher'}
                                </button>
                              </>
                            )}
                            {lessonIsManageable && (
                              <>
                                <button
                                  type="button"
                                  className="lesson-menu-item"
                                  onClick={() => {
                                    setOpenActionMenuLessonId(null);
                                    onEdit(lesson);
                                  }}
                                >
                                  <HiOutlinePencil />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="lesson-menu-item text-danger"
                                  onClick={() => {
                                    setOpenActionMenuLessonId(null);
                                    onDelete(lesson._id);
                                  }}
                                >
                                  <HiOutlineTrash />
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
          {lessons.length === 0 && (
            <tr>
              <td
                colSpan={
                  5 +
                  (canFilterAsAdmin ? 1 : 0) +
                  (canManageLessonPlans ? 1 : 0)
                }
                className="empty-row"
              >
                No lesson plans created yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default LessonPlanTable;
