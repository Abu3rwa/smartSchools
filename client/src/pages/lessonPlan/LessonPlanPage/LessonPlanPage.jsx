import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { HiOutlinePlus } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
  createLesson,
  updateLesson,
  deleteLesson,
  generateSection,
  updateLessonPlanAdminNote,
  reviewLessonPlan,
  triggerLessonEvaluation,
  fetchLessonEvaluationHistory,
  selectEvaluationLoadingByLessonId,
  selectEvaluationHistoryLoadingByLessonId,
  selectEvaluationErrorByLessonId,
  selectEvaluationHistoryByLessonId,
  selectReviewLoadingByLessonId,
} from '../../../store/slices/lessonSlice.js';
import LessonPlanFormModal from '../../../components/lessonPlan/LessonPlanFormModal.jsx';
import EvaluationFeedbackModal from '../../../components/lessonPlan/EvaluationFeedbackModal.jsx';
import { getInitialFormData, lessonToFormData } from './constants.js';
import useLessonPlanPermissions from './hooks/useLessonPlanPermissions.js';
import useLessonPlanFilters from './hooks/useLessonPlanFilters.js';
import useLessonPlanData from './hooks/useLessonPlanData.js';
import LessonPlanToolbar from './components/LessonPlanToolbar.jsx';
import LessonPlanTable from './components/LessonPlanTable.jsx';
import AdminNoteModal from './components/AdminNoteModal.jsx';
import ReviewStatusModal from './components/ReviewStatusModal.jsx';
import { buildRequestedLanguages } from '../../../constants/aiLanguages.js';
import './LessonPlanPage.css';

const LessonPlanPage = () => {
  const { t } = useTranslation(['lessonPlan']);
  const dispatch = useDispatch();
  const evaluationLoadingByLessonId = useSelector(selectEvaluationLoadingByLessonId);
  const evaluationHistoryLoadingByLessonId = useSelector(selectEvaluationHistoryLoadingByLessonId);
  const evaluationErrorByLessonId = useSelector(selectEvaluationErrorByLessonId);
  const evaluationHistoryByLessonId = useSelector(selectEvaluationHistoryByLessonId);
  const reviewLoadingByLessonId = useSelector(selectReviewLoadingByLessonId);
  const {
    canManageLessonPlans,
    canFilterBySubject,
    canFilterAsAdmin,
    canReviewLessonPlans,
    canManageLesson,
  } = useLessonPlanPermissions();

  const filters = useLessonPlanFilters(canFilterAsAdmin);
  const {
    selectedSubjectFilter,
    setSelectedSubjectFilter,
    selectedClassFilter,
    setSelectedClassFilter,
    selectedTeacherFilter,
    setSelectedTeacherFilter,
    startDateFilter,
    setStartDateFilter,
    endDateFilter,
    setEndDateFilter,
    teachers,
    filterClasses,
    filterSubjects,
    subjects,
  } = filters;

  const { lessons, loading } = useLessonPlanData({
    canFilterAsAdmin,
    selectedSubjectFilter,
    selectedClassFilter,
    selectedTeacherFilter,
    startDateFilter,
    endDateFilter,
  });

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(getInitialFormData);
  const [generatingSection, setGeneratingSection] = useState(false);
  const [generatedStandards, setGeneratedStandards] = useState([]);
  const [adminNoteLessonId, setAdminNoteLessonId] = useState(null);
  const [adminNoteText, setAdminNoteText] = useState('');
  const [adminNoteSaving, setAdminNoteSaving] = useState(false);
  const [evaluationLessonId, setEvaluationLessonId] = useState(null);
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [reviewModalState, setReviewModalState] = useState({
    open: false,
    lessonId: null,
    lessonTitle: '',
    finalStatus: 'approved',
  });

  const openCreate = () => {
    setEditingId(null);
    setFormData(getInitialFormData());
    setGeneratedStandards([]);
    setShowModal(true);
  };

  const openEdit = (lesson) => {
    setEditingId(lesson._id);
    setFormData(lessonToFormData(lesson));
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData(getInitialFormData());
    setGeneratedStandards([]);
  };

  const handleGenerateFromTitle = async (formDataArg) => {
    if (!formDataArg.classId || !formDataArg.subjectId || !formDataArg.title?.trim()) {
      toast.error(t('lessonPlan:toasts.requireClassSubjectTitle'));
      return;
    }
    setGeneratingSection(true);
    const requestedLanguages = buildRequestedLanguages(
      formDataArg.aiPrimaryLanguage,
      formDataArg.aiSecondaryLanguage
    );
    const normalizedRequestedLanguages = requestedLanguages.length > 0 ? requestedLanguages : ['en'];
    const result = await dispatch(
      generateSection({
        title: formDataArg.title.trim(),
        subjectId: formDataArg.subjectId,
        classId: formDataArg.classId,
        requestedLanguages: normalizedRequestedLanguages,
        primaryLanguage: formDataArg.aiPrimaryLanguage || 'en',
        secondaryLanguage: formDataArg.aiSecondaryLanguage || '',
      })
    );
    setGeneratingSection(false);
    if (generateSection.fulfilled.match(result)) {
      const g = result.payload?.generated || {};
      const standards = result.payload?.standards || [];
      const standardIds = standards.map((s) => s.standardId).filter(Boolean);
      const generatedStages =
        Array.isArray(g.stages) && g.stages.length > 0
          ? g.stages.map((s) => ({
              name: s.name || '',
              procedure: s.procedure || '',
              materials: s.materials || '',
              timing: s.timing || '',
            }))
          : null;
      setFormData((prev) => ({
        ...prev,
        summary: prev.summary || g.summary || '',
        description: prev.description || g.description || '',
        teachingObjectives: prev.teachingObjectives || g.teachingObjectives || '',
        vocabulary: prev.vocabulary || g.vocabulary || '',
        homework: prev.homework || g.homework || '',
        previousKnowledge: prev.previousKnowledge || g.previousKnowledge || '',
        characterTraitLinks: prev.characterTraitLinks || g.characterTraitLinks || '',
        techIntegration: prev.techIntegration || g.techIntegration || '',
        standardIds: standardIds.length > 0 ? standardIds : prev.standardIds,
        stages: generatedStages || prev.stages,
      }));
      setGeneratedStandards(standards);
      toast.success(t('lessonPlan:toasts.sectionsGenerated'));
    } else {
      toast.error(result.payload || t('lessonPlan:toasts.generationFailed'));
    }
  };

  const handleSubmitForm = async (payload) => {
    if (editingId) {
      const result = await dispatch(updateLesson({ id: editingId, lessonData: payload }));
      if (updateLesson.fulfilled.match(result)) {
        toast.success(t('lessonPlan:toasts.updated'));
        closeModal();
      } else {
        toast.error(result.payload || t('lessonPlan:toasts.updateFailed'));
      }
    } else {
      const result = await dispatch(createLesson(payload));
      if (createLesson.fulfilled.match(result)) {
        toast.success(t('lessonPlan:toasts.saved'));
        closeModal();
      } else {
        toast.error(result.payload || t('lessonPlan:toasts.saveFailed'));
      }
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('lessonPlan:toasts.confirmDelete'))) return;
    const result = await dispatch(deleteLesson(id));
    if (deleteLesson.fulfilled.match(result)) {
      toast.success(t('lessonPlan:toasts.deleted'));
    } else {
      toast.error(result.payload || t('lessonPlan:toasts.deleteFailed'));
    }
  };

  const openAdminNote = (lesson) => {
    setAdminNoteLessonId(lesson._id);
    setAdminNoteText(lesson.adminNoteToTeacher || '');
  };

  const closeAdminNoteModal = () => {
    setAdminNoteLessonId(null);
    setAdminNoteText('');
  };

  const openEvaluationModal = async (lesson) => {
    setEvaluationLessonId(lesson._id);
    setShowEvaluationModal(true);
    await dispatch(fetchLessonEvaluationHistory({ id: lesson._id, page: 1, limit: 10 }));
  };

  const closeEvaluationModal = () => {
    setShowEvaluationModal(false);
    setEvaluationLessonId(null);
  };

  const handleTriggerEvaluation = async (
    lessonId,
    { forceReevaluate = false, openModal = true, reason = '' } = {}
  ) => {
    const result = await dispatch(
      triggerLessonEvaluation({
        id: lessonId,
        forceReevaluate,
        reason,
      })
    );

    if (triggerLessonEvaluation.fulfilled.match(result)) {
      const cached = Boolean(result.payload?.data?.cached);
      toast.success(cached ? t('lessonPlan:toasts.usingCachedEvaluation') : t('lessonPlan:toasts.evaluated'));
      await dispatch(fetchLessonEvaluationHistory({ id: lessonId, page: 1, limit: 10 }));
      if (openModal) {
        setEvaluationLessonId(lessonId);
        setShowEvaluationModal(true);
      }
    } else {
      const errorMessage = result.payload?.message || t('lessonPlan:toasts.evaluateFailed');
      toast.error(errorMessage);
    }
  };

  const handleSaveAdminNote = async (text) => {
    if (adminNoteLessonId == null) return;
    setAdminNoteSaving(true);
    const result = await dispatch(
      updateLessonPlanAdminNote({
        id: adminNoteLessonId,
        adminNoteToTeacher: text,
      })
    );
    setAdminNoteSaving(false);
    if (updateLessonPlanAdminNote.fulfilled.match(result)) {
      toast.success(t('lessonPlan:toasts.noteSaved'));
      closeAdminNoteModal();
    } else {
      toast.error(result.payload || t('lessonPlan:toasts.noteSaveFailed'));
    }
  };

  const handleReviewLessonStatus = async ({ lessonId, finalStatus, comments = '' }) => {
    const result = await dispatch(
      reviewLessonPlan({
        id: lessonId,
        finalStatus,
        comments,
      })
    );

    if (reviewLessonPlan.fulfilled.match(result)) {
      const label = String(finalStatus || '').replace('_', ' ');
      toast.success(t('lessonPlan:toasts.markedAs', { status: label }));
    } else {
      toast.error(result.payload?.message || t('lessonPlan:toasts.statusUpdateFailed'));
    }
  };

  const openReviewModal = ({ lesson, finalStatus }) => {
    setReviewModalState({
      open: true,
      lessonId: lesson?._id || null,
      lessonTitle: lesson?.title || '',
      finalStatus,
    });
  };

  const closeReviewModal = () => {
    setReviewModalState((prev) => ({
      ...prev,
      open: false,
    }));
  };

  const handleConfirmReviewModal = async (comments) => {
    const { lessonId, finalStatus } = reviewModalState;
    if (!lessonId) return;
    await handleReviewLessonStatus({ lessonId, finalStatus, comments });
    closeReviewModal();
  };

  const showToolbar = canFilterBySubject || canFilterAsAdmin;

  return (
    <div className="lesson-plan-page">
      <div className="page-header">
        <div>
          <h1>{t('lessonPlan:page.title')}</h1>
          <p className="text-muted">{t('lessonPlan:page.subtitle')}</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <HiOutlinePlus size={20} />
          {t('lessonPlan:page.newLesson')}
        </button>
      </div>

      <div className="lessons-list mt-lg">
        {showToolbar && (
          <LessonPlanToolbar
            canFilterAsAdmin={canFilterAsAdmin}
            canFilterBySubject={canFilterBySubject}
            teachers={teachers}
            filterClasses={filterClasses}
            filterSubjects={filterSubjects}
            subjects={subjects}
            selectedTeacherFilter={selectedTeacherFilter}
            setSelectedTeacherFilter={setSelectedTeacherFilter}
            selectedClassFilter={selectedClassFilter}
            setSelectedClassFilter={setSelectedClassFilter}
            selectedSubjectFilter={selectedSubjectFilter}
            setSelectedSubjectFilter={setSelectedSubjectFilter}
            startDateFilter={startDateFilter}
            setStartDateFilter={setStartDateFilter}
            endDateFilter={endDateFilter}
            setEndDateFilter={setEndDateFilter}
          />
        )}

        {loading ? (
          <div className="loading-container">
            <div className="spinner" />
          </div>
        ) : (
          <LessonPlanTable
            lessons={lessons}
            canFilterAsAdmin={canFilterAsAdmin}
            canManageLessonPlans={canManageLessonPlans}
            canReviewLessonPlans={canReviewLessonPlans}
            canManageLesson={canManageLesson}
            onEdit={openEdit}
            onDelete={handleDelete}
            onAdminNote={openAdminNote}
            onOpenEvaluation={openEvaluationModal}
            onTriggerEvaluation={handleTriggerEvaluation}
            onRequestReviewAction={openReviewModal}
            evaluationLoadingByLessonId={evaluationLoadingByLessonId}
            reviewLoadingByLessonId={reviewLoadingByLessonId}
          />
        )}
      </div>

      <LessonPlanFormModal
        open={showModal}
        onClose={closeModal}
        editingId={editingId}
        formData={formData}
        setFormData={setFormData}
        classes={filters.classes}
        subjects={subjects}
        onSubmit={handleSubmitForm}
        onGenerateSection={handleGenerateFromTitle}
        generatingSection={generatingSection}
        generatedStandards={generatedStandards}
      />

      <AdminNoteModal
        lessonId={adminNoteLessonId}
        initialText={adminNoteText}
        onClose={closeAdminNoteModal}
        onSave={handleSaveAdminNote}
        saving={adminNoteSaving}
      />

      <ReviewStatusModal
        open={reviewModalState.open}
        lessonTitle={reviewModalState.lessonTitle}
        finalStatus={reviewModalState.finalStatus}
        saving={Boolean(reviewLoadingByLessonId?.[reviewModalState.lessonId])}
        onClose={closeReviewModal}
        onConfirm={handleConfirmReviewModal}
      />

      <EvaluationFeedbackModal
        open={showEvaluationModal && Boolean(evaluationLessonId)}
        onClose={closeEvaluationModal}
        lesson={lessons.find((lesson) => lesson._id === evaluationLessonId) || null}
        historyData={evaluationLessonId ? evaluationHistoryByLessonId?.[evaluationLessonId] : null}
        loading={evaluationLessonId ? Boolean(evaluationHistoryLoadingByLessonId?.[evaluationLessonId]) : false}
        reevaluating={evaluationLessonId ? Boolean(evaluationLoadingByLessonId?.[evaluationLessonId]) : false}
        onReevaluate={() =>
          evaluationLessonId
            ? handleTriggerEvaluation(evaluationLessonId, { forceReevaluate: true, openModal: true })
            : Promise.resolve()
        }
        errorMessage={evaluationLessonId ? evaluationErrorByLessonId?.[evaluationLessonId] : ''}
      />
    </div>
  );
};

export default LessonPlanPage;
