import { useTranslation } from 'react-i18next';
import { HiOutlineCheckCircle } from 'react-icons/hi';

const scoreTier = (correctCount, totalCount) => {
  const ratio = totalCount ? correctCount / totalCount : 0;
  if (ratio >= 0.8) return 'resultGreat';
  if (ratio >= 0.5) return 'resultGood';
  return 'resultKeepGoing';
};

const ResultsPage = ({ chapterNumber, result, onContents }) => {
  const { t } = useTranslation(['reading']);
  const correct = Number(result?.correctCount) || 0;
  const total = Number(result?.totalCount) || 0;
  const percent = total ? Math.round((correct / total) * 100) : 0;

  return (
    <section className="book-results-page">
      <span className="book-page-icon is-success" aria-hidden="true">
        <HiOutlineCheckCircle size={28} />
      </span>
      <p className="book-chapter-eyebrow">
        {t('reading:book.chapterNumber', { number: chapterNumber })}
      </p>
      <h2 className="book-page-heading">{t('reading:book.chapterComplete')}</h2>
      <p className="book-result-line">
        {t('reading:view.resultScore', { correct, total })}
      </p>
      <div className="progress-track" role="presentation">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="book-page-copy">
        {t(`reading:view.${scoreTier(correct, total)}`)}
      </p>
      <p className="book-page-hint">{t('reading:book.reviewNote')}</p>
      <button type="button" className="btn btn-secondary" onClick={onContents}>
        {t('reading:book.backToContents')}
      </button>
    </section>
  );
};

export default ResultsPage;
