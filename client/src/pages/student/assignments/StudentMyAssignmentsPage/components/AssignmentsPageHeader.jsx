import { useTranslation } from 'react-i18next';

const AssignmentsPageHeader = ({ academicYear }) => {
  const { t } = useTranslation(['assignments']);
  return (
    <div className="page-header">
      <h1>{t('student.header.title')}</h1>
      <p className="subtitle">
        {t('student.header.subtitle')}
        {academicYear
          ? ` ${t('student.header.academicYear', { year: academicYear })}`
          : ''}
      </p>
    </div>
  );
};

export default AssignmentsPageHeader;
