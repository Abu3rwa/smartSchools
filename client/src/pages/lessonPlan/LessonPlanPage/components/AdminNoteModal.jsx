import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const AdminNoteModal = ({
  lessonId,
  initialText,
  onClose,
  onSave,
  saving,
}) => {
  const { t } = useTranslation(['lessonPlan']);
  const [text, setText] = useState(initialText);

  useEffect(() => {
    setText(initialText);
  }, [lessonId, initialText]);

  if (!lessonId) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t('lessonPlan:adminNote.title')}</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
            {t('lessonPlan:adminNote.description')}
          </p>
          <textarea
            className="form-control"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('lessonPlan:adminNote.placeholder')}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('lessonPlan:common.cancel')}
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
                {t('lessonPlan:common.saving')}
              </>
            ) : (
              t('lessonPlan:adminNote.save')
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminNoteModal;
