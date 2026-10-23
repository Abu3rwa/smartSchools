import { useTranslation } from 'react-i18next';
import GradebookCell from './GradebookCell';
import { getScaleBgColor, getScaleColor } from '../../../../utils/sbrScaleUtils';

const StandardsGradebookMatrix = ({
  standards,
  students,
  classAverage,
  pagination,
  getCellValue,
  onCellChange,
  onPageChange,
}) => {
  const { t } = useTranslation(['standardsGradebook']);

  if (!standards.length && !students.length) {
    return (
      <div className="gb-empty" role="status">
        <span className="gb-empty__icon" aria-hidden="true">▦</span>
        <h3>{t('standardsGradebook:matrix.selectClassSubjectTitle', 'Choose a class and subject')}</h3>
        <p>{t('standardsGradebook:matrix.selectClassSubject', 'Select a class and subject to view the gradebook.')}</p>
      </div>
    );
  }

  if (!standards.length) {
    return (
      <div className="gb-empty" role="status">
        <span className="gb-empty__icon" aria-hidden="true">＋</span>
        <h3>{t('standardsGradebook:matrix.noStandardsTitle', 'No standards yet')}</h3>
        <p>{t('standardsGradebook:matrix.noStandards', 'No standards assigned for this class/subject.')}</p>
        <p className="gb-empty__hint">
          {t('standardsGradebook:matrix.noStandardsHint', 'Use + Assign Standard to add one, then enter 0–4 scores here.')}
        </p>
      </div>
    );
  }

  return (
    <section className="gb-matrix-wrap">
      <div className="gb-matrix-scroll">
        <table
          className="gb-matrix"
          role="grid"
          aria-label={t('standardsGradebook:matrix.gridAria', 'Standards scores by student')}
        >
          <thead>
            <tr role="row">
              <th scope="col" role="columnheader" className="gb-matrix__student-header">
                {t('standardsGradebook:table.student', 'Student')}
              </th>
              {standards.map((std) => {
                const fullText = `${std.code || ''}${std.code && (std.description || std.name) ? ' - ' : ''}${std.description || std.name || ''}`;
                return (
                  <th
                    key={std._id}
                    scope="col"
                    role="columnheader"
                    className="gb-matrix__std-header"
                    title={fullText}
                  >
                    <span className="gb-matrix__std-code">{std.code || std.name}</span>
                    {std.description || std.name ? (
                      <span className="gb-matrix__std-desc" title={std.description || std.name || ''}>
                        {std.description || std.name}
                      </span>
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {/* Class Average row */}
            <tr className="gb-matrix__avg-row" role="row">
              <td
                role="rowheader"
                className="gb-matrix__student-cell gb-matrix__avg-label"
              >
                <strong>{t('standardsGradebook:matrix.classAverage', 'Class Average')}</strong>
              </td>
              {standards.map((std) => {
                const avg = classAverage?.[String(std._id)];
                const hasAvg = avg !== null && avg !== undefined;
                const rounded = hasAvg ? Math.round(avg) : null;
                const label = `${t('standardsGradebook:matrix.classAverage', 'Class Average')}: ${
                  hasAvg ? Number(avg).toFixed(1) : t('standardsGradebook:matrix.notAssessed', 'Not assessed')
                }`;
                return (
                  <td
                    key={std._id}
                    role="gridcell"
                    aria-readonly="true"
                    aria-label={label}
                    title={label}
                    className={`gb-cell gb-cell--readonly${
                      hasAvg ? '' : ' gb-cell--empty'
                    }`}
                    style={{
                      backgroundColor: hasAvg ? getScaleBgColor(rounded) : 'transparent',
                      fontWeight: 600,
                      color: hasAvg ? getScaleColor(rounded) : 'var(--text-secondary, #a0aec0)',
                    }}
                  >
                    {hasAvg ? Number(avg).toFixed(1) : '—'}
                  </td>
                );
              })}
            </tr>

            {/* Student rows */}
            {students.map((student) => (
              <tr key={student._id} role="row">
                <th
                  scope="row"
                  role="rowheader"
                  className="gb-matrix__student-cell"
                  title={student.fullName || ''}
                >
                  <span className="gb-matrix__student-name">
                    {student.fullName || [student.firstName, student.lastName].filter(Boolean).join(' ') || student.studentId || '--'}
                  </span>
                </th>
                {standards.map((std) => {
                  const cellData = getCellValue(String(student._id), String(std._id));
                  return (
                    <GradebookCell
                      key={`${student._id}-${std._id}`}
                      studentId={String(student._id)}
                      standardId={String(std._id)}
                      cellData={cellData}
                      onChange={onCellChange}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="standards-gradebook-pagination">
          <button
            type="button"
            onClick={() => onPageChange(Math.max((pagination.page || 1) - 1, 1))}
            disabled={pagination.page <= 1}
          >
            {t('standardsGradebook:pagination.previous', '← Previous')}
          </button>
          <span aria-live="polite">
            {t('standardsGradebook:pagination.pageOf', {
              page: pagination.page || 1,
              pages: pagination.pages || 1,
            })}
          </span>
          <button
            type="button"
            onClick={() => onPageChange((pagination.page || 1) + 1)}
            disabled={pagination.page >= pagination.pages}
          >
            {t('standardsGradebook:pagination.next', 'Next →')}
          </button>
        </div>
      )}
    </section>
  );
};

export default StandardsGradebookMatrix;
