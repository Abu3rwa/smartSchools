import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../../../config/api';
import { fetchClasses, selectClasses } from '../../../store/slices/classSlice';
import { selectCurrentAcademicYear } from '../../../store/slices/uiSlice';
import {
  fetchPromotionQueue,
  selectPromotionActionLoading,
  selectPromotionQueue,
  selectPromotionQueueLoading,
  submitStudentPromotionDecision,
  updateStudentReEnrollment
} from '../../../store/slices/studentSlice';
import './PromotionCenterPage.css';

const DECISION_STATUS_OPTIONS = [
  { value: '', labelKey: 'allDecisionStatuses' },
  { value: 'undecided', labelKey: 'undecided' },
  { value: 'approved', labelKey: 'approved' },
  { value: 'pending', labelKey: 'pending' },
  { value: 'rejected', labelKey: 'rejected' },
  { value: 'hold_review', labelKey: 'holdReview' }
];

const DECISION_TYPE_OPTIONS = [
  { value: 'promote', labelKey: 'promote' },
  { value: 'promote_with_conditions', labelKey: 'promoteWithConditions' },
  { value: 'retain', labelKey: 'repeatGrade' },
  { value: 'hold_review', labelKey: 'holdReview' }
];

const APPROVAL_STATUS_OPTIONS = [
  { value: 'approved', labelKey: 'approved' },
  { value: 'pending', labelKey: 'pending' },
  { value: 'rejected', labelKey: 'rejected' }
];

const RE_ENROLLMENT_STATUS_OPTIONS = [
  { value: 'pending_contact', labelKey: 'pendingContact' },
  { value: 'documents_pending', labelKey: 'documentsPending' },
  { value: 'financial_clearance_pending', labelKey: 'financialClearancePending' },
  { value: 'approved_for_placement', labelKey: 'approvedForPlacement' },
  { value: 'enrolled', labelKey: 'enrolled' }
];

const PromotionCenterPage = () => {
  const dispatch = useDispatch();
  const { t } = useTranslation(['students']);
  const classes = useSelector(selectClasses);
  const queue = useSelector(selectPromotionQueue);
  const queueLoading = useSelector(selectPromotionQueueLoading);
  const actionLoading = useSelector(selectPromotionActionLoading);
  const currentAcademicYear = useSelector(selectCurrentAcademicYear);

  const [search, setSearch] = useState('');
  const [decisionStatus, setDecisionStatus] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [reasonCodes, setReasonCodes] = useState([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [reEnrollmentStatus, setReEnrollmentStatus] = useState('pending_contact');
  const [reEnrollmentNote, setReEnrollmentNote] = useState('');
  const [decisionForm, setDecisionForm] = useState({
    decisionType: 'promote',
    reasonCode: '',
    approvalStatus: 'approved',
    targetClassId: '',
    note: '',
    conditions: ''
  });

  const loadQueue = useCallback(() => {
    dispatch(fetchPromotionQueue({
      search: search || undefined,
      decisionStatus: decisionStatus || undefined,
      academicYear: currentAcademicYear || undefined,
      page: 1,
      limit: 200
    }));
  }, [currentAcademicYear, decisionStatus, dispatch, search]);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const response = await api.get('/schools/me/admissions-promotion-settings');
      if (response.data?.success) {
        const codes = Array.isArray(response.data.data?.reasonCodes)
          ? response.data.data.reasonCodes
          : [];
        setReasonCodes(codes);
      } else {
        toast.error(response.data?.message || t('students:promotionCenter.toast.loadSettingsFailed'));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || t('students:promotionCenter.toast.loadSettingsFailed'));
    } finally {
      setSettingsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    dispatch(fetchClasses());
    loadQueue();
    loadSettings();
  }, [dispatch, loadQueue, loadSettings]);

  useEffect(() => {
    if (!selectedStudentId && queue.length > 0) {
      setSelectedStudentId(queue[0].student?._id || '');
    }

    if (selectedStudentId && !queue.some((item) => item.student?._id === selectedStudentId)) {
      setSelectedStudentId(queue[0]?.student?._id || '');
    }
  }, [queue, selectedStudentId]);

  useEffect(() => {
    if (!decisionForm.reasonCode && reasonCodes.length > 0) {
      setDecisionForm((previous) => ({ ...previous, reasonCode: reasonCodes[0] }));
    }
  }, [decisionForm.reasonCode, reasonCodes]);

  const selectedQueueItem = useMemo(
    () => queue.find((item) => item.student?._id === selectedStudentId) || null,
    [queue, selectedStudentId]
  );

  const studentTargetYear = selectedQueueItem?.student?.academicYear || currentAcademicYear || '';

  const classOptions = useMemo(
    () => classes.filter((item) => !studentTargetYear || item.academicYear === studentTargetYear),
    [classes, studentTargetYear]
  );

  useEffect(() => {
    const currentStatus = selectedQueueItem?.student?.admissions?.reEnrollmentStatus || 'pending_contact';
    setReEnrollmentStatus(currentStatus);
    setReEnrollmentNote('');

    setDecisionForm((previous) => ({
      ...previous,
      reasonCode: previous.reasonCode || reasonCodes[0] || ''
    }));
  }, [reasonCodes, selectedQueueItem]);

  const getDecisionStatusLabel = useCallback((status) => {
    if (!status) return t('students:promotionCenter.status.undecided');
    const keyByStatus = {
      hold_review: 'holdReview'
    };
    return t(`students:promotionCenter.status.${keyByStatus[status] || status}`, {
      defaultValue: status
    });
  }, [t]);

  const getReEnrollmentStatusLabel = useCallback((status) => {
    if (!status) return t('students:promotionCenter.common.na');
    return t(`students:promotionCenter.reEnrollment.${status}`, {
      defaultValue: status
    });
  }, [t]);

  const canSetTargetClass =
    decisionForm.decisionType === 'promote' || decisionForm.decisionType === 'promote_with_conditions';

  const handleSubmitDecision = async () => {
    if (!selectedQueueItem?.student?._id) {
      toast.error(t('students:promotionCenter.toast.selectStudentFirst'));
      return;
    }

    if (!decisionForm.reasonCode) {
      toast.error(t('students:promotionCenter.toast.reasonCodeRequired'));
      return;
    }

    if (canSetTargetClass && !decisionForm.targetClassId) {
      toast.error(t('students:promotionCenter.toast.targetClassRequired'));
      return;
    }

    const payload = {
      decisionType: decisionForm.decisionType,
      reasonCode: decisionForm.reasonCode,
      approvalStatus: decisionForm.approvalStatus,
      note: decisionForm.note,
      conditions: decisionForm.conditions,
      targetClassId: canSetTargetClass ? decisionForm.targetClassId : undefined,
      targetAcademicYear: canSetTargetClass ? studentTargetYear : undefined
    };

    const result = await dispatch(submitStudentPromotionDecision({
      studentId: selectedQueueItem.student._id,
      decisionData: payload
    }));

    if (submitStudentPromotionDecision.fulfilled.match(result)) {
      toast.success(t('students:promotionCenter.toast.decisionSaved'));
      setDecisionForm((previous) => ({
        ...previous,
        note: '',
        conditions: ''
      }));
      loadQueue();
    } else {
      toast.error(result.payload || t('students:promotionCenter.toast.decisionSaveFailed'));
    }
  };

  const handleSaveReEnrollment = async () => {
    if (!selectedQueueItem?.student?._id) {
      toast.error(t('students:promotionCenter.toast.selectStudentFirst'));
      return;
    }

    const result = await dispatch(updateStudentReEnrollment({
      studentId: selectedQueueItem.student._id,
      updates: {
        reEnrollmentStatus,
        note: reEnrollmentNote || undefined
      }
    }));

    if (updateStudentReEnrollment.fulfilled.match(result)) {
      toast.success(t('students:promotionCenter.toast.reEnrollmentUpdated'));
      setReEnrollmentNote('');
      loadQueue();
    } else {
      toast.error(result.payload || t('students:promotionCenter.toast.reEnrollmentUpdateFailed'));
    }
  };

  return (
    <div className="promotion-center-page">
      <div className="page-header">
        <div>
          <h1>{t('students:promotionCenter.title')}</h1>
          <p className="text-muted">{t('students:promotionCenter.subtitle')}</p>
        </div>
      </div>

      <div className="card promotion-center-filters">
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="promotion-search">{t('students:promotionCenter.filters.search')}</label>
            <input
              id="promotion-search"
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('students:promotionCenter.filters.searchPlaceholder')}
            />
          </div>
          <div className="form-group">
            <label htmlFor="promotion-status-filter">{t('students:promotionCenter.filters.decisionStatus')}</label>
            <select
              id="promotion-status-filter"
              value={decisionStatus}
              onChange={(event) => setDecisionStatus(event.target.value)}
            >
              {DECISION_STATUS_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {t(`students:promotionCenter.status.${option.labelKey}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button className="btn btn-outline" onClick={loadQueue} disabled={queueLoading}>
          {queueLoading
            ? t('students:promotionCenter.actions.loadingQueue')
            : t('students:promotionCenter.actions.refreshQueue')}
        </button>
      </div>

      <div className="promotion-center-grid">
        <div className="card promotion-center-list">
          <h3>{t('students:promotionCenter.queueTitle')}</h3>
          {queueLoading ? (
            <p className="text-muted">{t('students:promotionCenter.loading')}</p>
          ) : queue.length === 0 ? (
            <p className="text-muted">{t('students:promotionCenter.empty')}</p>
          ) : (
            <div className="promotion-center-table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('students:promotionCenter.table.student')}</th>
                    <th>{t('students:promotionCenter.table.class')}</th>
                    <th>{t('students:promotionCenter.table.reEnrollment')}</th>
                    <th>{t('students:promotionCenter.table.decisionStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((item) => {
                    const student = item.student;
                    const active = selectedStudentId === student?._id;
                    return (
                      <tr
                        key={student?._id}
                        className={active ? 'active-row' : ''}
                        onClick={() => setSelectedStudentId(student?._id || '')}
                      >
                        <td>
                          <div className="student-row-name">{student?.firstName} {student?.lastName}</div>
                          <div className="text-muted">{student?.studentId || t('students:promotionCenter.common.na')}</div>
                        </td>
                        <td>{student?.currentClass?.name || t('students:promotionCenter.common.na')}</td>
                        <td>{getReEnrollmentStatusLabel(student?.admissions?.reEnrollmentStatus)}</td>
                        <td>{getDecisionStatusLabel(item?.decisionStatus)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card promotion-center-actions">
          <h3>{t('students:promotionCenter.actionsPanelTitle')}</h3>
          {!selectedQueueItem ? (
            <p className="text-muted">{t('students:promotionCenter.selectPrompt')}</p>
          ) : (
            <>
              <div className="selected-student-summary">
                <strong>
                  {selectedQueueItem.student?.firstName} {selectedQueueItem.student?.lastName}
                </strong>
                <span className="text-muted">
                  {selectedQueueItem.student?.currentClass?.name || t('students:promotionCenter.common.na')}
                </span>
              </div>

              <div className="wizard-step">
                <h4>{t('students:promotionCenter.reEnrollmentTitle')}</h4>
                <div className="form-group">
                  <label htmlFor="re-enrollment-status">{t('students:promotionCenter.fields.reEnrollmentStatus')}</label>
                  <select
                    id="re-enrollment-status"
                    value={reEnrollmentStatus}
                    onChange={(event) => setReEnrollmentStatus(event.target.value)}
                  >
                    {RE_ENROLLMENT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(`students:promotionCenter.reEnrollment.${option.labelKey}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="re-enrollment-note">{t('students:promotionCenter.fields.note')}</label>
                  <textarea
                    id="re-enrollment-note"
                    rows={3}
                    value={reEnrollmentNote}
                    onChange={(event) => setReEnrollmentNote(event.target.value)}
                    placeholder={t('students:promotionCenter.fields.notePlaceholder')}
                  />
                </div>
                <button className="btn btn-outline" onClick={handleSaveReEnrollment} disabled={actionLoading}>
                  {actionLoading
                    ? t('students:promotionCenter.actions.saving')
                    : t('students:promotionCenter.actions.saveReEnrollment')}
                </button>
              </div>

              <div className="wizard-step">
                <h4>{t('students:promotionCenter.decisionTitle')}</h4>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="decision-type">{t('students:promotionCenter.fields.decisionType')}</label>
                    <select
                      id="decision-type"
                      value={decisionForm.decisionType}
                      onChange={(event) => setDecisionForm((previous) => ({
                        ...previous,
                        decisionType: event.target.value
                      }))}
                    >
                      {DECISION_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {t(`students:promotionCenter.decisionTypes.${option.labelKey}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="approval-status">{t('students:promotionCenter.fields.approvalStatus')}</label>
                    <select
                      id="approval-status"
                      value={decisionForm.approvalStatus}
                      onChange={(event) => setDecisionForm((previous) => ({
                        ...previous,
                        approvalStatus: event.target.value
                      }))}
                    >
                      {APPROVAL_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {t(`students:promotionCenter.status.${option.labelKey}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="reason-code">{t('students:promotionCenter.fields.reasonCode')}</label>
                  {settingsLoading ? (
                    <p className="text-muted">{t('students:promotionCenter.loadingSettings')}</p>
                  ) : (
                    <select
                      id="reason-code"
                      value={decisionForm.reasonCode}
                      onChange={(event) => setDecisionForm((previous) => ({
                        ...previous,
                        reasonCode: event.target.value
                      }))}
                    >
                      {reasonCodes.map((code) => (
                        <option key={code} value={code}>{code}</option>
                      ))}
                    </select>
                  )}
                </div>

                {canSetTargetClass && (
                  <div className="form-group">
                    <label htmlFor="target-class">{t('students:promotionCenter.fields.targetClass')}</label>
                    <select
                      id="target-class"
                      value={decisionForm.targetClassId}
                      onChange={(event) => setDecisionForm((previous) => ({
                        ...previous,
                        targetClassId: event.target.value
                      }))}
                    >
                      <option value="">{t('students:promotionCenter.fields.selectTargetClass')}</option>
                      {classOptions.map((classItem) => (
                        <option key={classItem._id} value={classItem._id}>
                          {classItem.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="decision-conditions">{t('students:promotionCenter.fields.conditions')}</label>
                  <textarea
                    id="decision-conditions"
                    rows={2}
                    value={decisionForm.conditions}
                    onChange={(event) => setDecisionForm((previous) => ({
                      ...previous,
                      conditions: event.target.value
                    }))}
                    placeholder={t('students:promotionCenter.fields.conditionsPlaceholder')}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="decision-note">{t('students:promotionCenter.fields.note')}</label>
                  <textarea
                    id="decision-note"
                    rows={3}
                    value={decisionForm.note}
                    onChange={(event) => setDecisionForm((previous) => ({
                      ...previous,
                      note: event.target.value
                    }))}
                    placeholder={t('students:promotionCenter.fields.notePlaceholder')}
                  />
                </div>

                <button className="btn btn-primary" onClick={handleSubmitDecision} disabled={actionLoading || settingsLoading}>
                  {actionLoading
                    ? t('students:promotionCenter.actions.saving')
                    : t('students:promotionCenter.actions.saveDecision')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PromotionCenterPage;
