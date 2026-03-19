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
      <div className="standards-gradebook-empty">
        {t('standardsGradebook:matrix.selectClassSubject', 'Select a class and subject to view the gradebook.')}
      </div>
    );
  }

  if (!standards.length) {
    return (
      <div className="standards-gradebook-empty">
        {t('standardsGradebook:matrix.noStandards', 'No standards assigned for this class/subject.')}
      </div>
    );
  }

  return (
    <section className="gb-matrix-wrap">
      <div className="gb-matrix-scroll">
        <table className="gb-matrix" role="grid">
          <thead>
            <tr>
              <th className="gb-matrix__student-header">
                {t('standardsGradebook:table.student', 'STUDENT')}
              </th>
              {standards.map((std) => (
                <th
                  key={std._id}
                  className="gb-matrix__std-header"
                  title={`${std.code || ''}${std.code && (std.description || std.name) ? ' - ' : ''}${std.description || std.name || ''}`}
                >
                  <div className="gb-matrix__std-code">{std.code || std.name}</div>
                  <div
                    className="gb-matrix__std-desc"
                    title={std.description || std.name || ''}
                  >
                    {std.description || std.name || ''}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Class Average row */}
            <tr className="gb-matrix__avg-row">
              <td className="gb-matrix__student-cell gb-matrix__avg-label">
                <strong>{t('standardsGradebook:matrix.classAverage', 'Class Average')}</strong>
              </td>
              {standards.map((std) => {
                const avg = classAverage?.[String(std._id)];
                const hasAvg = avg !== null && avg !== undefined;
                const rounded = hasAvg ? Math.round(avg) : null;
                return (
                  <td
                    key={std._id}
                    className="gb-cell gb-cell--readonly gb-matrix__student-cell"
                    style={{
                      backgroundColor: hasAvg ? getScaleBgColor(rounded) : 'transparent',
                      fontWeight: 600,
                      color: hasAvg ? getScaleColor(rounded) : '#a0aec0',
                    }}
                  >
                    {hasAvg ? avg.toFixed(1) : 'NAN'}
                  </td>
                );
              })}
            </tr>

            {/* Student rows */}
            {students.map((student) => (
              <tr key={student._id}>
                <td className="gb-matrix__student-cell" title={student.fullName || ''}>
                  <span className="gb-matrix__student-name">
                    {student.fullName || [student.firstName, student.lastName].filter(Boolean).join(' ') || student.studentId || '--'}
                  </span>
                </td>
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
          <span>
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
