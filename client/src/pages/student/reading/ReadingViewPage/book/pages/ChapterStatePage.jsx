import { useTranslation } from 'react-i18next';

export const ChapterLoadingPage = ({ chapterNumber }) => {
  const { t } = useTranslation(['reading']);
  return (
    <section className="book-loading-page" aria-busy="true" aria-live="polite">
      <p className="book-chapter-eyebrow">
        {t('reading:book.chapterNumber', { number: chapterNumber })}
      </p>
      <p className="visually-hidden">{t('reading:book.opening')}</p>
      <div className="book-skeleton" aria-hidden="true">
        <span style={{ width: '72%' }} />
        <span style={{ width: '94%' }} />
        <span style={{ width: '88%' }} />
        <span style={{ width: '96%' }} />
        <span style={{ width: '64%' }} />
        <span style={{ width: '92%' }} />
        <span style={{ width: '81%' }} />
      </div>
    </section>
  );
};

export const ChapterErrorPage = ({ chapterNumber, onRetry, onContents }) => {
  const { t } = useTranslation(['reading']);
  return (
    <section className="book-error-page" role="alert">
      <p className="book-chapter-eyebrow">
        {t('reading:book.chapterNumber', { number: chapterNumber })}
      </p>
      <h2 className="book-page-heading">{t('reading:book.chapterLoadFailed')}</h2>
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        {t('reading:book.retry')}
      </button>
      <button type="button" className="book-text-link" onClick={onContents}>
        {t('reading:book.backToContents')}
      </button>
    </section>
  );
};
