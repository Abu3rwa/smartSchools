import { useTranslation } from 'react-i18next';

import { getStatusClassName } from '../utils/curriculumPresentation';

const CurriculumMapListPanel = ({
  maps = [],
  filters,
  onFilterChange,
  selectedMapId,
  onSelectMap,
  onCreateMap,
  onEditMap,
  onDeleteMap,
  onDownloadMap,
  canEditMap,
  canDeleteMap,
}) => {
  const { t } = useTranslation(['curriculum']);

  return (
    <div className="curriculum-map-list-panel">
      <div className="panel-header">
        <h2>{t('maps.list.title')}</h2>
        {canEditMap && (
          <button type="button" onClick={onCreateMap}>{t('maps.list.newMap')}</button>
        )}
      </div>

      <div className="panel-filters">
        <input
          type="text"
          placeholder={t('maps.list.searchPlaceholder')}
          value={filters.search}
          onChange={(event) => onFilterChange('search', event.target.value)}
        />
        <input
          type="text"
          placeholder={t('shared.academicYear')}
          value={filters.academicYear}
          onChange={(event) => onFilterChange('academicYear', event.target.value)}
        />
        <select
          value={filters.status}
          onChange={(event) => onFilterChange('status', event.target.value)}
        >
          <option value="">{t('shared.allStatuses')}</option>
          <option value="draft">{t('status.draft')}</option>
          <option value="submitted">{t('status.submitted')}</option>
          <option value="in_review">{t('status.in_review')}</option>
          <option value="revision_requested">{t('status.revision_requested')}</option>
          <option value="approved">{t('status.approved')}</option>
          <option value="rejected">{t('status.rejected')}</option>
          <option value="published">{t('status.published')}</option>
        </select>
      </div>

      <div className="curriculum-map-list">
        {maps.map((map) => (
          <article
            key={map._id}
            className={`curriculum-map-list-item ${selectedMapId === map._id ? 'selected' : ''}`}
          >
            <button type="button" className="map-select-button" onClick={() => onSelectMap(map)}>
              <div className="map-list-title-row">
                <h3>{map.title}</h3>
                <span className={getStatusClassName(map.status)}>
                  {t(`status.${map.status}`, { defaultValue: map.status })}
                </span>
              </div>
              <p>
                {map.academicYear}
                {' • '}
                {map.classId?.name || t('shared.gradeFallback', { grade: map.grade || '' })}
                {' • '}
                {map.subject?.name || ''}
              </p>
            </button>
            <div className="map-list-actions">
              {canEditMap && (
                <button type="button" onClick={() => onEditMap(map)}>{t('shared.edit')}</button>
              )}
              {canDeleteMap && (
                <button type="button" className="danger-button" onClick={() => onDeleteMap(map)}>{t('shared.delete')}</button>
              )}
              <button type="button" onClick={() => onDownloadMap(map._id, 'csv')}>CSV</button>
              <button type="button" onClick={() => onDownloadMap(map._id, 'pdf')}>PDF</button>
            </div>
          </article>
        ))}
        {maps.length === 0 && <p className="empty-hint">{t('maps.list.empty')}</p>}
      </div>
    </div>
  );
};

export default CurriculumMapListPanel;
