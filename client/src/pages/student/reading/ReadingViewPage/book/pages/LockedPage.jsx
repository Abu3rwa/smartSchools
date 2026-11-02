import { useTranslation } from 'react-i18next';
import { HiOutlineLockClosed } from 'react-icons/hi';

const LockedPage = ({ chapterNumber, publishAt, onContents }) => {
  const { t, i18n } = useTranslation(['reading']);

  const opens = (() => {
    if (!publishAt) return null;
    try {
      return new Date(publishAt).toLocaleDateString(i18n.language, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return null;
    }
  })();

  return (
    <section className="book-locked-page">
      <span className="book-page-icon" aria-hidden="true">
        <HiOutlineLockClosed size={30} />
      </span>
      <p className="book-chapter-eyebrow">
        {t('reading:book.chapterNumber', { number: chapterNumber })}
      </p>
      <h2 className="book-page-heading">{t('reading:book.lockedTitle')}</h2>
      <p className="book-page-copy">
        {opens
          ? t('reading:book.lockedDated', { date: opens })
          : t('reading:book.lockedMessage')}
      </p>
      <p className="book-page-hint">{t('reading:book.lockedHint')}</p>
      <button type="button" className="btn btn-secondary" onClick={onContents}>
        {t('reading:book.backToContents')}
      </button>
    </section>
  );
};

export default LockedPage;
