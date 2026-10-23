import { useTranslation } from 'react-i18next';
import { SCALE_OPTIONS } from '../../../../utils/sbrScaleUtils';

const StandardsGradebookLegend = ({ standardsCount = 0, studentsCount = 0 }) => {
  const { t } = useTranslation(['standardsGradebook']);

  return (
    <div className="gb-scale-legend" role="note" aria-label={t('standardsGradebook:legend.title', 'Scale')}>
      <span className="gb-scale-legend__title">
        {t('standardsGradebook:legend.title', 'Scale')}
      </span>
      {SCALE_OPTIONS.map((value) => (
        <span key={value} className={`gb-scale-legend__item gb-scale-legend__item--${value}`}>
          <span className="gb-scale-legend__dot" aria-hidden="true" />
          <strong>{value}</strong>
          <span>{t(`standardsGradebook:scale.${value}`, String(value))}</span>
        </span>
      ))}
      <span className="gb-scale-legend__item gb-scale-legend__item--empty">
        <span className="gb-scale-legend__dot" aria-hidden="true" />
        <span>{t('standardsGradebook:matrix.notAssessed', 'Not assessed')}</span>
      </span>
      {(standardsCount > 0 || studentsCount > 0) && (
        <span className="gb-scale-legend__counts">
          {t('standardsGradebook:legend.counts', {
            standards: standardsCount,
            students: studentsCount,
            defaultValue: 'Standards: {{standards}} · Students: {{students}}',
          })}
        </span>
      )}
    </div>
  );
};

export default StandardsGradebookLegend;
