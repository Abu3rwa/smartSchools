import { useTranslation } from 'react-i18next';
import {
  formatDateTime,
  formatPercent,
  getStudentDisplayName,
} from '../utils/standardsGradebookFormatters';

const StandardsGradebookTable = ({ rows, pagination, filters, onPageChange }) => {
  const { t } = useTranslation(['standardsGradebook']);

  if (!rows.length) {
    return <div className="standards-gradebook-empty">{t('standardsGradebook:table.empty')}</div>;
  }

  return (
    <section className="standards-gradebook-table-wrap">
      <table className="standards-gradebook-table">
        <thead>
          <tr>
            <th>{t('standardsGradebook:table.student')}</th>
            <th>{t('standardsGradebook:table.class')}</th>
            <th>{t('standardsGradebook:table.subject')}</th>
            <th>{t('standardsGradebook:table.standard')}</th>
            <th>{t('standardsGradebook:table.attempts')}</th>
            <th>{t('standardsGradebook:table.mastery')}</th>
            <th>{t('standardsGradebook:table.average')}</th>
            <th>{t('standardsGradebook:table.status')}</th>
            <th>{t('standardsGradebook:table.lastActivity')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.rowKey}>
              <td>{getStudentDisplayName(row.student)}</td>
              <td>{row.class?.name || '--'}</td>
              <td>{row.subject?.name || '--'}</td>
              <td>{row.standard?.code || row.standard?.name || '--'}</td>
              <td>{row.totalAttempts || 0}</td>
              <td>{formatPercent(row.masteryPercentage)}</td>
              <td>{formatPercent(row.averagePercentage)}</td>
              <td>{t(`standardsGradebook:status.${row.status || 'not_started'}`)}</td>
              <td>{formatDateTime(row.lastActivityAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="standards-gradebook-pagination">
        <button
          type="button"
          onClick={() => onPageChange(Math.max((pagination?.page || 1) - 1, 1))}
          disabled={!pagination || pagination.page <= 1}
        >
          {t('standardsGradebook:pagination.previous')}
        </button>
        <span>
          {t('standardsGradebook:pagination.pageOf', {
            page: pagination?.page || 1,
            pages: pagination?.pages || 1,
          })}
        </span>
        <button
          type="button"
          onClick={() => onPageChange((pagination?.page || 1) + 1)}
          disabled={!pagination || pagination.page >= pagination.pages}
        >
          {t('standardsGradebook:pagination.next')}
        </button>
      </div>

      <div className="standards-gradebook-page-size">
        <label htmlFor="standards-gradebook-limit">{t('standardsGradebook:pagination.rowsPerPage')}</label>
        <select
          id="standards-gradebook-limit"
          value={filters.limit}
          onChange={(event) => onPageChange(1, Number(event.target.value) || 25)}
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </div>
    </section>
  );
};

export default StandardsGradebookTable;
