import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatDateTime,
  formatPercent,
  getStudentDisplayName,
} from '../utils/standardsGradebookFormatters';

/**
 * Aggregate a list of rows for the same (student × standard) bucket into
 * one display row, applying the configured scoringMode.
 */
const aggregateGroup = (rows, scoringMode) => {
  const first = rows[0];

  // Collect all valid averagePercentage values along with timestamps
  const entries = rows
    .map((r) => ({
      percentage: r.averagePercentage != null ? Number(r.averagePercentage) : null,
      time: r.lastActivityAt ? new Date(r.lastActivityAt).getTime() : 0,
    }))
    .filter((e) => e.percentage !== null && Number.isFinite(e.percentage));

  let displayPercentage = null;
  if (entries.length > 0) {
    if (scoringMode === 'latest') {
      const latest = entries.reduce((best, e) => (e.time > best.time ? e : best), entries[0]);
      displayPercentage = latest.percentage;
    } else if (scoringMode === 'highest') {
      displayPercentage = Math.max(...entries.map((e) => e.percentage));
    } else {
      // average (default)
      const sum = entries.reduce((acc, e) => acc + e.percentage, 0);
      displayPercentage = Number((sum / entries.length).toFixed(2));
    }
  }

  // Mastery is always average of all masteryPercentage values in the group
  const masteryEntries = rows
    .map((r) => Number(r.masteryPercentage))
    .filter((v) => Number.isFinite(v));
  const displayMastery =
    masteryEntries.length > 0
      ? Number((masteryEntries.reduce((a, b) => a + b, 0) / masteryEntries.length).toFixed(2))
      : 0;

  // Last activity is the latest across the group
  const lastActivity = rows.reduce((best, r) => {
    const t = r.lastActivityAt ? new Date(r.lastActivityAt).getTime() : 0;
    return t > best ? t : best;
  }, 0);

  return {
    groupKey: `${String(first.student._id)}|${String(first.standard.code || first.standard.name || first.standard.description || first.standard._id).trim().toLowerCase()}`,
    student: first.student,
    class: first.class,
    subject: first.subject,
    standard: first.standard,
    attempts: rows.reduce((sum, r) => sum + (r.totalAttempts || 0), 0),
    masteryPercentage: displayMastery,
    averagePercentage: displayPercentage,
    status: first.status,
    lastActivityAt: lastActivity ? new Date(lastActivity).toISOString() : null,
  };
};

const StandardsGradebookTable = ({ rows, pagination, filters, onPageChange, scoringMode = 'average' }) => {
  const { t } = useTranslation(['standardsGradebook']);

  // Group rows by studentId|standardId and produce one aggregated row per group
  const aggregatedRows = useMemo(() => {
    const groups = new Map();
    for (const row of rows) {
      const normStd = String(row.standard?.code || row.standard?.name || row.standard?.description || row.standard?._id).trim().toLowerCase();
      const key = `${String(row.student?._id)}|${normStd}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    return Array.from(groups.values()).map((group) => aggregateGroup(group, scoringMode));
  }, [rows, scoringMode]);

  if (!aggregatedRows.length) {
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
          {aggregatedRows.map((row) => (
            <tr key={row.groupKey}>
              <td>{getStudentDisplayName(row.student)}</td>
              <td>{row.class?.name || '--'}</td>
              <td>{row.subject?.name || '--'}</td>
              <td>{row.standard?.code || row.standard?.name || '--'}</td>
              <td>{row.attempts || 0}</td>
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
