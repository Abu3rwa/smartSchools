import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  canReviewLessonPlans,
  canManageLesson,
  onEdit,
  onDelete,
  onAdminNote,
  onOpenEvaluation,
  onTriggerEvaluation,
  onRequestReviewAction,
  evaluationLoadingByLessonId,
  reviewLoadingByLessonId,
}) => {
  const { t } = useTranslation(['lessonPlan']);
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
            <th>{t('lessonPlan:table.title')}</th>
            {canFilterAsAdmin && <th className="lesson-col-teacher">{t('lessonPlan:table.teacher')}</th>}
            <th className="lesson-col-class">{t('lessonPlan:table.class')}</th>
            <th className="lesson-col-subject">{t('lessonPlan:table.subject')}</th>
            <th>{t('lessonPlan:table.date')}</th>
            <th className="lesson-col-status">{t('lessonPlan:table.status')}</th>
            {(canManageLessonPlans || canReviewLessonPlans) && <th className="lesson-col-actions">{t('lessonPlan:table.actions')}</th>}
          </tr>
        </thead>
        <tbody>
          {lessons.map((lesson) => {
            const isMenuOpen = openActionMenuLessonId === lesson._id;
            const lessonIsManageable = canManageLesson(lesson);
            const reviewLoading = Boolean(reviewLoadingByLessonId?.[lesson._id]);
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
                      ? `${lesson.teacher.firstName || ''} ${lesson.teacher.lastName || ''}`.trim() || t('lessonPlan:common.emptySymbol')
                      : t('lessonPlan:common.emptySymbol')}
                  </td>
                )}
                <td className="lesson-col-class">{lesson.class?.name || t('lessonPlan:common.emptySymbol')}</td>
                <td className="lesson-col-subject">{lesson.subject?.name || t('lessonPlan:common.emptySymbol')}</td>
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
                    {t(`lessonPlan:status.${lesson.status || 'draft'}`, {
                      defaultValue: getStatusLabel(lesson.status)
                    })}
                  </span>
                </td>
                {(canManageLessonPlans || canReviewLessonPlans) && (
                  <td className="lesson-col-actions">
                    {lessonIsManageable || canFilterAsAdmin || canReviewLessonPlans ? (
                      <div className="lesson-actions-menu">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm lesson-actions-trigger"
                          onClick={() =>
                            setOpenActionMenuLessonId(
                              isMenuOpen ? null : lesson._id
                            )
                          }
                          title={t('lessonPlan:table.actions')}
                          aria-label={t('lessonPlan:table.actionsForLesson', { title: lesson.title })}
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
                              {t('lessonPlan:actions.viewPrint')}
                            </button>
                            {canFilterAsAdmin && (
                              <>
                                <button
                                  type="button"
                                  className="lesson-menu-item"
                                  disabled={reviewLoading}
                                  onClick={() => {
                                    setOpenActionMenuLessonId(null);
                                    onRequestReviewAction({
                                      lesson,
                                      finalStatus: 'approved',
                                    });
                                  }}
                                >
                                  {reviewLoading ? t('lessonPlan:actions.updating') : t('lessonPlan:actions.approve')}
                                </button>
                                <button
                                  type="button"
                                  className="lesson-menu-item"
                                  disabled={reviewLoading}
                                  onClick={() => {
                                    setOpenActionMenuLessonId(null);
                                    onRequestReviewAction({
                                      lesson,
                                      finalStatus: 'needs_revision',
                                    });
                                  }}
                                >
                                  {reviewLoading ? t('lessonPlan:actions.updating') : t('lessonPlan:actions.needsRevision')}
                                </button>
                                <button
                                  type="button"
                                  className="lesson-menu-item text-danger"
                                  disabled={reviewLoading}
                                  onClick={() => {
                                    setOpenActionMenuLessonId(null);
                                    onRequestReviewAction({
                                      lesson,
                                      finalStatus: 'rejected',
                                    });
                                  }}
                                >
                                  {reviewLoading ? t('lessonPlan:actions.updating') : t('lessonPlan:actions.reject')}
                                </button>
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
                                    {t('lessonPlan:actions.reEvaluateWithAi')}
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
                                    ? t('lessonPlan:actions.viewEditNote')
                                    : t('lessonPlan:actions.noteToTeacher')}
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
                                  {t('lessonPlan:actions.edit')}
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
                                  {t('lessonPlan:actions.delete')}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted">{t('lessonPlan:common.emptySymbol')}</span>
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
                  (canManageLessonPlans || canReviewLessonPlans ? 1 : 0)
                }
                className="empty-row"
              >
                {t('lessonPlan:table.empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default LessonPlanTable;
