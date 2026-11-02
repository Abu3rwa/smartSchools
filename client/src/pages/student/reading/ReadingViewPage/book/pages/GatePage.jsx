import { useTranslation } from 'react-i18next';
import { HiOutlineLockClosed } from 'react-icons/hi';

const GatePage = ({ gate, onFinish, onContents }) => {
  const { t } = useTranslation(['reading']);
  const required = Number(gate?.requiredSeconds) || 0;
  const elapsed = Number(gate?.elapsedSeconds) || 0;
  const remaining = Math.max(0, Number(gate?.remainingSeconds) || 0);
  const percent = required > 0 ? Math.min(100, Math.round((elapsed / required) * 100)) : 100;
  const canFinish = Boolean(gate?.canFinish) && !gate?.finishing;

  return (
    <section className="book-gate-page">
      <span className="book-page-icon" aria-hidden="true">
        <HiOutlineLockClosed size={26} />
      </span>
      <p className="book-chapter-eyebrow">
        {t('reading:book.chapterNumber', { number: gate?.chapterNumber })}
      </p>
      <h2 className="book-page-heading">{t('reading:gate.title')}</h2>
      <p className="book-page-copy">{t('reading:gate.message')}</p>

      <div className="progress-track" role="presentation">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>

      <p className="book-page-hint">
        {remaining > 0
          ? t('reading:gate.timeLeft', { seconds: remaining })
          : !gate?.reachedEnd
            ? t('reading:book.gateHint')
            : t('reading:gate.ready')}
      </p>

      <button
        type="button"
        className="btn btn-primary"
        disabled={!canFinish}
        onClick={onFinish}
      >
        {gate?.finishing ? t('reading:gate.confirming') : t('reading:gate.finish')}
      </button>

      <button type="button" className="book-text-link" onClick={onContents}>
        {t('reading:book.backToContents')}
      </button>
    </section>
  );
};

export default GatePage;
