import {
    HiOutlineAcademicCap,
    HiOutlineBookOpen,
    HiOutlineCalendar,
    HiOutlineEye,
    HiOutlinePencilAlt,
    HiOutlineTrash,
    HiOutlineUserGroup
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import LoadingState from './LoadingState';
import { formatStandardLabel } from '../../../../utils/standardLabel';

const StandardAssignList = ({
    loading,
    assignments,
    academicYear,
    selectedSemester,
    isAdmin,
    user,
    onViewProgress,
    onEdit,
    onManageQuestionPool,
    onViewAssessmentGradebook,
    onDelete,
    onReviewQuestionPool,
    onApproveQuestionPool,
    onPublishQuestionPool,
    canApproveQuestionPool,
    isTeacher,
    poolActionLoadingId,
    getStandardDescription
}) => {
    const { t, i18n } = useTranslation(['standardAssign']);
    const locale = i18n.resolvedLanguage === 'ar' ? 'ar' : undefined;

    const getWorkflowStatusLabel = (status = '') => {
        const normalized = String(status || '').toLowerCase();
        return t(`standardAssign:workflowStatus.${normalized}`, { defaultValue: normalized });
    };

    const getSessionModeLabel = (sessionType = '') =>
        sessionType === 'assessment'
            ? t('standardAssign:modes.gradedAssessment')
            : t('standardAssign:modes.practice');

    if (loading && !assignments.length) {
        return <LoadingState />;
    }

    if (assignments.length === 0) {
        return (
            <div className="assign-empty">
                <HiOutlineAcademicCap size={48} />
                <p>{t('standardAssign:list.emptyTitle')}</p>
                <p style={{ fontSize: '0.85rem' }}>
                    {t('standardAssign:list.emptyDescription')}
                </p>
            </div>
        );
    }

    return (
        <div className="assign-cards">
            {assignments.map((assignment) => (
                <div key={assignment._id} className="assign-card">
                    <div className="assign-card-header">
                        <div>
                            <span
                                className="text-muted"
                                style={{ fontSize: '0.78rem', fontWeight: 600 }}
                            >
                                {assignment.title || t('standardAssign:list.defaultAssignmentTitle', {
                                    code: assignment.standard?.code
                                })}
                            </span>
                            <span className="standard-code">
                                {formatStandardLabel(assignment.standard) || assignment.standard?.code}
                            </span>
                        </div>
                    </div>
                    <div className="assign-card-body">
                        {getStandardDescription(assignment.standard).substring(0, 100)}
                        {getStandardDescription(assignment.standard).length > 100 ? '...' : ''}
                    </div>
                    <div className="assign-card-meta">
                        <span>
                            <HiOutlineBookOpen size={14} /> {assignment.subject?.name}
                        </span>
                        <span>
                            <HiOutlineAcademicCap size={14} /> {assignment.class?.name || t('standardAssign:common.class')}
                        </span>
                        <span>
                            <HiOutlineUserGroup size={14} /> {assignment.students?.length || t('standardAssign:common.all')} {t('standardAssign:common.students')}
                        </span>
                        <span>
                            <HiOutlineBookOpen size={14} /> {t('standardAssign:list.mode')}{' '}
                            {getSessionModeLabel(assignment.practiceConfig?.sessionType)}
                        </span>
                        
                        <span>
                            <HiOutlineBookOpen size={14} /> {t('standardAssign:list.poolSize')}{' '}
                            {assignment.questionWorkflow?.preGeneratedQuestionCount || 0}
                        </span>
                        <span>
                            <HiOutlineCalendar size={14} /> {t('standardAssign:list.academicYear')} {assignment.academicYear || academicYear}
                        </span>
                        <span>
                            <HiOutlineCalendar size={14} /> {t('standardAssign:list.semester')}{' '}
                            {assignment.semester || selectedSemester || 1}
                        </span>
                        {assignment.dueDate && (
                            <span>
                                <HiOutlineCalendar size={14} /> {t('standardAssign:list.dueDate')}{' '}
                                {new Date(assignment.dueDate).toLocaleDateString(locale)}
                            </span>
                        )}
                        {user?.role === 'teacher' &&
                            assignment.teacher?.user?._id !== user?._id &&
                            assignment.teacher?.user !== user?._id && (
                                <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                                    {t('standardAssign:list.adminAssigned')}
                                </span>
                            )}
                    </div>
                    <div className="assign-card-footer">
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => onViewProgress(assignment._id)}
                        >
                            <HiOutlineEye size={16} /> {t('standardAssign:actions.viewProgress')}
                        </button>
                        {(isAdmin ||
                            assignment.teacher?.user?._id === user?._id ||
                            assignment.teacher?.user === user?._id) && (
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => onEdit(assignment)}
                            >
                                <HiOutlinePencilAlt size={16} /> {t('standardAssign:actions.edit')}
                            </button>
                        )}
                        {(isAdmin ||
                            assignment.teacher?.user?._id === user?._id ||
                            assignment.teacher?.user === user?._id) &&
                            assignment.practiceConfig?.sessionType === 'assessment' && (
                                <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => onManageQuestionPool(assignment._id)}
                            >
                                <HiOutlinePencilAlt size={16} /> {t('standardAssign:actions.questionPool')}
                            </button>
                            )}
                        {isTeacher &&
                            assignment.practiceConfig?.sessionType === 'assessment' &&
                            assignment.questionWorkflow?.status === 'draft' && (
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => onReviewQuestionPool(assignment._id)}
                                disabled={poolActionLoadingId === assignment._id}
                            >
                                <HiOutlineEye size={16} />
                                {poolActionLoadingId === assignment._id
                                    ? t('standardAssign:actions.reviewing')
                                    : t('standardAssign:actions.submitReview')}
                            </button>
                            )}
                        {canApproveQuestionPool &&
                            assignment.practiceConfig?.sessionType === 'assessment' &&
                            assignment.questionWorkflow?.status === 'reviewed' && (
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => onApproveQuestionPool(assignment._id)}
                                disabled={poolActionLoadingId === assignment._id}
                            >
                                <HiOutlineEye size={16} />
                                {poolActionLoadingId === assignment._id
                                    ? t('standardAssign:actions.approving')
                                    : t('standardAssign:actions.approvePool')}
                            </button>
                            )}
                        {canApproveQuestionPool &&
                            assignment.practiceConfig?.sessionType === 'assessment' &&
                            ['draft', 'reviewed', 'approved'].includes(
                                String(assignment.questionWorkflow?.status || '').toLowerCase()
                            ) && (
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => onPublishQuestionPool(assignment)}
                                disabled={poolActionLoadingId === assignment._id}
                            >
                                <HiOutlineEye size={16} />
                                {poolActionLoadingId === assignment._id
                                    ? t('standardAssign:actions.publishing')
                                    : t('standardAssign:actions.publishPool')}
                            </button>
                            )}
                        {assignment.practiceConfig?.sessionType === 'assessment' && (
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => onViewAssessmentGradebook(assignment._id)}
                            >
                                <HiOutlineEye size={16} /> {t('standardAssign:actions.sbGradebook')}
                            </button>
                        )}
                        {(isAdmin ||
                            assignment.teacher?.user?._id === user?._id ||
                            assignment.teacher?.user === user?._id) && (
                            <button
                                className="btn-icon text-danger"
                                onClick={() => onDelete(assignment._id)}
                                title={t('standardAssign:actions.remove')}
                            >
                                <HiOutlineTrash />
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default StandardAssignList;
