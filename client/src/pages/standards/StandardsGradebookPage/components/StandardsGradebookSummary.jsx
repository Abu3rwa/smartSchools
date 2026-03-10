import { useTranslation } from 'react-i18next';

const SUMMARY_KEYS = [
  'totalRows',
  'totalStudents',
  'mastered',
  'needsReview',
  'inProgress',
  'notStarted',
  'submitted',
  'released',
  'averageMastery',
  'averagePercentage',
];

const StandardsGradebookSummary = ({ summary }) => {
  const { t } = useTranslation(['standardsGradebook']);

  return (
    <section className="standards-gradebook-summary" aria-label={t('standardsGradebook:summary.title')}>
      {SUMMARY_KEYS.map((key) => (
        <article key={key} className="standards-gradebook-summary-card">
          <span>{t(`standardsGradebook:summary.${key}`)}</span>
          <strong>{summary?.[key] ?? 0}</strong>
        </article>
      ))}
    </section>
  );
};

export default StandardsGradebookSummary;
