import { useEffect, useState } from 'react';

const statusLabels = {
  approved: 'Approve',
  needs_revision: 'Needs Revision',
  rejected: 'Reject',
};

const placeholders = {
  approved: 'Optional approval comment (visible to teacher)...',
  needs_revision: 'Add revision notes for the teacher...',
  rejected: 'Rejection reason (optional)...',
};

const ReviewStatusModal = ({
  open,
  lessonTitle,
  finalStatus,
  saving,
  onClose,
  onConfirm,
}) => {
  const [comments, setComments] = useState('');

  useEffect(() => {
    if (open) {
      setComments('');
    }
  }, [open, finalStatus]);

  if (!open) return null;

  const actionLabel = statusLabels[finalStatus] || 'Update Status';

  return (
    <div className="modal-overlay" onClick={() => !saving && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{actionLabel} Lesson Plan</h3>
          <button type="button" className="modal-close" onClick={onClose} disabled={saving}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
            {lessonTitle ? `Lesson: ${lessonTitle}` : 'Add an optional comment to share with the teacher.'}
          </p>
          <textarea
            className="form-control"
            rows={4}
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder={placeholders[finalStatus] || 'Optional comment...'}
            style={{ width: '100%', resize: 'vertical' }}
            disabled={saving}
          />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
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
                Saving...
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
