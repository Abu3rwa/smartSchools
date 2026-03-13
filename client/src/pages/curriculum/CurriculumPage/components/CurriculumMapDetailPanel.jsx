import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildWorkflowActions,
  getStatusClassName,
} from '../utils/curriculumPresentation';

const CurriculumMapDetailPanel = ({
  map,
  history,
  onEditMap,
  onDownloadMap,
  onTransition,
  onAddComment,
  onCreateVersion,
  onDeleteMap,
  canEditMap,
  canReviewMap,
  canPublishMap,
  canDeleteMap,
  transitionLoading,
}) => {
  const { t } = useTranslation(['curriculum']);
  const [transitionNote, setTransitionNote] = useState('');
  const [commentForm, setCommentForm] = useState({
    targetType: 'map',
    sectionId: '',
    itemId: '',
    fieldKey: '',
    commentType: 'comment',
    message: '',
  });

  const sections = Array.isArray(map?.sections) ? map.sections : [];
  const workflowActions = useMemo(
    () => buildWorkflowActions({ map, canReview: canReviewMap, canPublish: canPublishMap, canEdit: canEditMap }),
    [map, canEditMap, canPublishMap, canReviewMap]
  );

  if (!map) {
    return (
      <div className="curriculum-map-detail-panel">
        <p className="empty-hint">{t('maps.detail.empty')}</p>
      </div>
    );
  }

  return (
    <div className="curriculum-map-detail-panel">
      <div className="panel-header">
        <div>
          <h2>{map.title}</h2>
          <p>
            {map.academicYear}
            {' • '}
            {map.classId?.name || t('shared.gradeFallback', { grade: map.grade || '' })}
            {' • '}
            {map.subject?.name || ''}
          </p>
        </div>
        <span className={getStatusClassName(map.status)}>
          {t(`status.${map.status}`, { defaultValue: map.status })}
        </span>
      </div>

      <div className="detail-actions-row">
        {canEditMap && (
          <button type="button" onClick={() => onEditMap(map)}>{t('shared.edit')}</button>
        )}
        <button type="button" onClick={() => onDownloadMap(map._id, 'csv')}>{t('maps.detail.exportCsv')}</button>
        <button type="button" onClick={() => onDownloadMap(map._id, 'pdf')}>{t('maps.detail.exportPdf')}</button>
        <button type="button" onClick={() => onDownloadMap(map._id, 'html')}>{t('maps.detail.printableHtml')}</button>
        {canDeleteMap && (
          <button type="button" className="danger-button" onClick={() => onDeleteMap(map)}>{t('shared.delete')}</button>
        )}
        {canEditMap && map.status === 'published' && (
          <button type="button" onClick={() => onCreateVersion(map)}>{t('maps.detail.newVersion')}</button>
        )}
      </div>

      <div className="workflow-action-bar">
        <textarea
          placeholder={t('workflow.notePlaceholder')}
          value={transitionNote}
          onChange={(event) => setTransitionNote(event.target.value)}
        />
        <div className="workflow-buttons">
          {workflowActions.map((action) => (
            <button
              key={action.key}
              type="button"
              disabled={transitionLoading}
              onClick={() => onTransition(map, action.key, transitionNote)}
            >
              {t(action.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="map-sections-readonly">
        {sections.map((section) => (
          <section key={section._id || section.title} className="readonly-section-card">
            <h3>{section.title}</h3>
            <div className="readonly-items-table-wrap">
              <table className="readonly-items-table">
                <thead>
                  <tr>
                    <th>{map?.structure?.itemLabel || t('shared.item')}</th>
                    <th>{t('maps.detail.dateWeek')}</th>
                    <th>{t('shared.standards')}</th>
                    <th>{t('shared.skills')}</th>
                    <th>{t('shared.learningObjectives')}</th>
                    <th>{t('shared.performanceTasks')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(section.items || []).map((item) => (
                    <tr key={item._id || item.title}>
                      <td>{item.title}</td>
                      <td>{item.startWeek ? `W${item.startWeek}-${item.endWeek || item.startWeek}` : ''}</td>
                      <td>{Array.isArray(item.standards) ? item.standards.map((s) => s.code || s.title).filter(Boolean).join(', ') : ''}</td>
                      <td>{Array.isArray(item.skills) ? item.skills.join(', ') : ''}</td>
                      <td>{Array.isArray(item.learningObjectives) ? item.learningObjectives.join('; ') : ''}</td>
                      <td>{Array.isArray(item.performanceTasks) ? item.performanceTasks.join('; ') : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      <div className="review-comments-panel">
        <h3>{t('comments.title')}</h3>
        <div className="comment-form-grid">
          <select
            value={commentForm.targetType}
            onChange={(event) => setCommentForm((prev) => ({ ...prev, targetType: event.target.value }))}
          >
            <option value="map">{t('comments.targetTypes.map')}</option>
            <option value="section">{t('comments.targetTypes.section')}</option>
            <option value="item">{t('comments.targetTypes.item')}</option>
          </select>
          <select
            value={commentForm.commentType}
            onChange={(event) => setCommentForm((prev) => ({ ...prev, commentType: event.target.value }))}
          >
            <option value="comment">{t('comments.types.comment')}</option>
            <option value="revision_request">{t('comments.types.revision_request')}</option>
            <option value="approval_note">{t('comments.types.approval_note')}</option>
            <option value="rejection_note">{t('comments.types.rejection_note')}</option>
          </select>
          {commentForm.targetType !== 'map' && (
            <select
              value={commentForm.sectionId}
              onChange={(event) => setCommentForm((prev) => ({ ...prev, sectionId: event.target.value, itemId: '' }))}
            >
              <option value="">{t('comments.selectSection')}</option>
              {sections.map((section) => (
                <option key={section._id || section.title} value={section._id || ''}>{section.title}</option>
              ))}
            </select>
          )}
          {commentForm.targetType === 'item' && (
            <select
              value={commentForm.itemId}
              onChange={(event) => setCommentForm((prev) => ({ ...prev, itemId: event.target.value }))}
            >
              <option value="">{t('comments.selectItem')}</option>
              {sections
                .find((section) => String(section._id || '') === String(commentForm.sectionId || ''))
                ?.items?.map((item) => (
                  <option key={item._id || item.title} value={item._id || ''}>{item.title}</option>
                ))}
            </select>
          )}
        </div>
        <textarea
          placeholder={t('comments.placeholder')}
          value={commentForm.message}
          onChange={(event) => setCommentForm((prev) => ({ ...prev, message: event.target.value }))}
        />
        <button
          type="button"
          onClick={async () => {
            if (!commentForm.message.trim()) return;
            await onAddComment(map, commentForm);
            setCommentForm((prev) => ({ ...prev, message: '' }));
          }}
        >
          {t('comments.add')}
        </button>

        <div className="comments-list">
          {(history?.reviewComments || []).map((comment) => (
            <article key={comment._id} className="comment-card">
              <p>{comment.message}</p>
              <small>
                {t(`comments.types.${comment.commentType}`, { defaultValue: comment.commentType })}
                {' • '}
                {new Date(comment.createdAt).toLocaleString()}
              </small>
            </article>
          ))}
          {(history?.reviewComments || []).length === 0 && <p className="empty-hint">{t('comments.empty')}</p>}
        </div>
      </div>

      <div className="history-panel">
        <h3>{t('history.title')}</h3>
        <ul>
          {[...(history?.workflowHistory || []), ...(history?.auditTrail || [])]
            .sort((left, right) => new Date(right.at || right.createdAt) - new Date(left.at || left.createdAt))
            .slice(0, 40)
            .map((entry, index) => (
              <li key={`${entry.action}-${index}`}>
                <strong>{t(`workflow.actions.${entry.action}`, { defaultValue: entry.action })}</strong>
                {' - '}
                {entry.message || ''}
                {' '}
                <small>{new Date(entry.at || entry.createdAt).toLocaleString()}</small>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
};

export default CurriculumMapDetailPanel;
