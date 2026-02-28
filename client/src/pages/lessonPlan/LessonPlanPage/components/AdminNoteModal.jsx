import { useState, useEffect } from 'react';

const AdminNoteModal = ({
  lessonId,
  initialText,
  onClose,
  onSave,
  saving,
}) => {
  const [text, setText] = useState(initialText);

  useEffect(() => {
    setText(initialText);
  }, [lessonId, initialText]);

  if (!lessonId) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Note to teacher</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
            This note will be visible to the teacher when they view this lesson plan.
          </p>
          <textarea
            className="form-control"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Please add more detail to the objectives section..."
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onSave(text)}
            disabled={saving}
          >
            {saving ? (
              <>
                <span className="spinner-small" />
                Saving…
              </>
            ) : (
              'Save note'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminNoteModal;
