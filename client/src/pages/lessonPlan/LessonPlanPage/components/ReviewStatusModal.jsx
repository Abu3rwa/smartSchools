import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const ReviewStatusModal = ({
  open,
  lessonTitle,
  finalStatus,
  saving,
  onClose,
  onConfirm,
}) => {
  const { t } = useTranslation(['lessonPlan']);
  const [comments, setComments] = useState('');

  useEffect(() => {
    if (open) {
      setComments('');
    }
  }, [open, finalStatus]);

  if (!open) return null;

  const actionLabel = t(`lessonPlan:review.actions.${finalStatus}`, {
    defaultValue: t('lessonPlan:review.actions.default')
  });
  const placeholder = t(`lessonPlan:review.placeholders.${finalStatus}`, {
    defaultValue: t('lessonPlan:review.placeholders.default')
  });

  return (
    <div className="modal-overlay" onClick={() => !saving && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t('lessonPlan:review.modalTitle', { action: actionLabel })}</h3>
          <button type="button" className="modal-close" onClick={onClose} disabled={saving}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
            {lessonTitle
              ? t('lessonPlan:review.lessonLabel', { title: lessonTitle })
              : t('lessonPlan:review.commentHint')}
          </p>
          <textarea
            className="form-control"
            rows={4}
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder={placeholder}
            style={{ width: '100%', resize: 'vertical' }}
            disabled={saving}
          />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            {t('lessonPlan:common.cancel')}
          </button>
          <button
            type="button"
            className={`btn ${finalStatus === 'rejected' ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => onConfirm(comments)}
            disabled={saving}
          >
            {saving ? (
              <>
                <span className="spinner-small" />
                {t('lessonPlan:common.saving')}
              </>
            ) : (
              actionLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReviewStatusModal;
