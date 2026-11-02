import { useTranslation } from 'react-i18next';
import { HiOutlineArrowRight, HiOutlineCheckCircle, HiOutlineMicrophone } from 'react-icons/hi';

const ChapterTitlePage = ({
  chapter,
  loading = false,
  levels = [],
  activeLevelIndex = 0,
  recommendedIndex = 0,
  levelIsRecommended = false,
  onLevelChange,
  onStartFluency,
  onContents,
  unlockedFlash = false,
}) => {
  const { t, i18n } = useTranslation(['reading']);
  const course = chapter?.text || {};

  const formatDate = (value) => {
    if (!value) return null;
    try {
      return new Date(value).toLocaleDateString(i18n.language, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return null;
    }
  };

  const due = formatDate(chapter?.dueDate);
  const className = [
    'book-chapter-title',
    unlockedFlash ? 'is-unlocked' : '',
  ].filter(Boolean).join(' ');

  return (
    <section className={className}>
      <p className="book-chapter-eyebrow">
        {t('reading:book.chapterNumber', { number: chapter?.chapterNumber })}
      </p>
      <h1 className="book-chapter-heading">{course.title}</h1>

      <div className="book-chapter-meta">
        {course.subjectArea && <span className="reading-chip">{course.subjectArea}</span>}
        {due && <span className="reading-chip">{t('reading:my.dueLabel', { date: due })}</span>}
        {chapter?.completed && (
          <span className="reading-chip is-recommended">
            <HiOutlineCheckCircle size={14} />
            {t('reading:my.completed')}
            {chapter.score?.totalCount > 0 && (
              <> · {chapter.score.correctCount}/{chapter.score.totalCount}</>
            )}
          </span>
        )}
      </div>

      {chapter?.instructions && (
        <div className="book-chapter-instructions">
          <span>{t('reading:book.teacherNotes')}</span>
          <p>{chapter.instructions}</p>
        </div>
      )}

      {levels.length > 1 && (
        <div className="book-chapter-levels" role="group" aria-label={t('reading:view.levelsLabel')}>
          {levels.map((level, index) => (
            <button
              type="button"
              key={level.targetLevel}
              className={`level-chip${index === activeLevelIndex ? ' active' : ''}`}
              aria-pressed={index === activeLevelIndex}
              onClick={() => onLevelChange?.(index)}
            >
              {t('reading:view.gradeLevel', { level: level.targetLevel })}
              {index === recommendedIndex && levelIsRecommended && (
                <span className="level-chip-flag">{t('reading:view.forYou')}</span>
              )}
            </button>
          ))}
          <p className="reading-levels-hint">{t('reading:view.levelsHint')}</p>
        </div>
      )}

      {chapter?.fluency?.enabled && (
        <section className="reading-fluency-entry book-chapter-fluency">
          <div className="reading-fluency-icon">
            <HiOutlineMicrophone size={20} />
          </div>
          <div className="reading-fluency-text">
            <strong>{t('reading:fluency.badge')}</strong>
            <p>{t('reading:fluency.entryDescription')}</p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm reading-fluency-btn"
            onClick={onStartFluency}
          >
            {t('reading:fluency.startPractising')}
            <HiOutlineArrowRight size={16} />
          </button>
        </section>
      )}

      <p className="book-chapter-hint">
        {loading ? t('reading:book.opening') : t('reading:book.turnHint')}
      </p>

      <button type="button" className="book-text-link" onClick={onContents}>
        {t('reading:book.backToContents')}
      </button>
    </section>
  );
};

export default ChapterTitlePage;
