import { useTranslation } from 'react-i18next';
import { HiOutlineCheckCircle } from 'react-icons/hi';

const EndPage = ({
  chapterNumber,
  title,
  submitted = false,
  submitting = false,
  canComplete = false,
  onComplete,
  onContents,
}) => {
  const { t } = useTranslation(['reading']);
  return (
    <section className="book-end-page">
      <span className="book-end-mark" aria-hidden="true" />
      <p className="book-chapter-eyebrow">
        {t('reading:book.chapterNumber', { number: chapterNumber })}
      </p>
      <h2 className="book-page-heading">{t('reading:book.theEnd')}</h2>
      {title && <p className="book-page-copy">{title}</p>}

      {submitted ? (
        <p className="reading-done">
          <HiOutlineCheckCircle size={18} />
          {t('reading:view.answersSaved')}
        </p>
      ) : canComplete ? (
        <button
          type="button"
          className="btn btn-primary"
          onClick={onComplete}
          disabled={submitting}
        >
          {submitting ? t('reading:common.submitting') : t('reading:view.markComplete')}
        </button>
      ) : null}

      <button type="button" className="book-text-link" onClick={onContents}>
        {t('reading:book.backToContents')}
      </button>
    </section>
  );
};

export default EndPage;
