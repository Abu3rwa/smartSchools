import { useTranslation } from 'react-i18next';
import { HiOutlineBookOpen } from 'react-icons/hi';

const CoverPage = ({ studentName, academicYear, chapterCount, completedCount, empty }) => {
  const { t } = useTranslation(['reading']);
  return (
    <section className="book-cover">
      <div className="book-cover-frame">
        <span className="book-cover-icon" aria-hidden="true">
          <HiOutlineBookOpen size={30} />
        </span>
        <p className="book-cover-kicker">{t('reading:book.title')}</p>
        <h1 className="book-cover-name">{studentName || t('reading:book.studentFallback')}</h1>
        {academicYear && (
          <p className="book-cover-year">{t('reading:book.yearLabel', { year: academicYear })}</p>
        )}
        {empty ? (
          <div className="book-cover-empty">
            <h2>{t('reading:my.emptyTitle')}</h2>
            <p>{t('reading:my.emptySubtitle')}</p>
          </div>
        ) : (
          <>
            <div className="book-cover-stats">
              <div>
                <strong>{chapterCount}</strong>
                <span>{t('reading:book.chaptersLabel')}</span>
              </div>
              <span className="book-cover-rule" aria-hidden="true" />
              <div>
                <strong>{completedCount}</strong>
                <span>{t('reading:book.completedLabel')}</span>
              </div>
            </div>
            <p className="book-cover-progress">
              {t('reading:book.progress', { done: completedCount, total: chapterCount })}
            </p>
            <p className="book-cover-hint">{t('reading:book.coverHint')}</p>
          </>
        )}
      </div>
    </section>
  );
};

export default CoverPage;
