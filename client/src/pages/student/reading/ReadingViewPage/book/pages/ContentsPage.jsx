import { useTranslation } from 'react-i18next';
import {
  HiOutlineLockClosed,
  HiOutlineQuestionMarkCircle,
  HiOutlineChevronRight,
} from 'react-icons/hi';
import { chapterStatus } from '../chapterStatus.js';

const ContentsPage = ({
  chapters = [],
  onOpen,
  onAnswerQuestions,
  highlightChapterId = null,
  unlockedChapterId = null,
}) => {
  const { t, i18n } = useTranslation(['reading']);

  const formatDate = (value) => {
    if (!value) return null;
    try {
      return new Date(value).toLocaleDateString(i18n.language, {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return null;
    }
  };

  return (
    <section className="book-contents">
      <header className="book-contents-head">
        <h2>{t('reading:book.contentsTitle')}</h2>
        <p>{t('reading:book.contentsHint')}</p>
      </header>

      {chapters.length === 0 ? (
        <div className="book-contents-empty">
          <h3>{t('reading:my.emptyTitle')}</h3>
          <p>{t('reading:my.emptySubtitle')}</p>
        </div>
      ) : (
        <ol className="book-toc">
          {chapters.map((chapter) => {
            const status = chapterStatus(chapter);
            const due = formatDate(chapter.dueDate);
            const opens = formatDate(chapter.publishAt);
            const counts = chapter.questionCounts || {};
            const questionTotal =
              (Number(counts.comprehension) || 0) +
              (Number(counts.criticalThinking) || 0);
            const classes = [
              'book-toc-row',
              `is-${status}`,
              highlightChapterId === chapter._id ? 'is-highlighted' : '',
              unlockedChapterId === chapter._id ? 'is-unlocked' : '',
            ].filter(Boolean).join(' ');
            return (
              <li key={chapter._id} className="book-toc-item">
                <button type="button" className={classes} onClick={() => onOpen?.(chapter)}>
                  <span className="book-toc-number" aria-hidden="true">{chapter.chapterNumber}</span>
                  <span className="book-toc-main">
                    <span className="book-toc-title">
                      {chapter.locked
                        ? t('reading:book.lockedChapter', { number: chapter.chapterNumber })
                        : chapter.text?.title}
                    </span>
                    <span className="book-toc-meta">
                      {chapter.locked ? (
                        opens
                          ? t('reading:book.opensOn', { date: opens })
                          : t('reading:book.lockedShort')
                      ) : (
                        <>
                          {chapter.text?.subjectArea && <span>{chapter.text.subjectArea}</span>}
                          {due && <span>{t('reading:my.dueLabel', { date: due })}</span>}
                        </>
                      )}
                    </span>
                  </span>
                  {status === 'completed' && chapter.score?.totalCount > 0 && (
                    <span className="book-toc-score">
                      {chapter.score.correctCount}/{chapter.score.totalCount}
                    </span>
                  )}
                  <span className={`book-toc-status is-${status}`}>
                    {status === 'locked' && <HiOutlineLockClosed size={13} />}
                    {t(`reading:book.status.${status}`)}
                  </span>
                  <HiOutlineChevronRight size={16} className="book-toc-arrow" aria-hidden="true" />
                </button>
                {onAnswerQuestions && !chapter.locked && questionTotal > 0 && (
                  <button
                    type="button"
                    className="book-toc-questions"
                    onClick={() => onAnswerQuestions?.(chapter)}
                  >
                    <HiOutlineQuestionMarkCircle size={14} aria-hidden="true" />
                    {t('reading:questions.answerQuestions')}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};

export default ContentsPage;
