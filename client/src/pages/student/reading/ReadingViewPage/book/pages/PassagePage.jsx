import { useTranslation } from 'react-i18next';
import { HiOutlineStop, HiOutlineVolumeUp } from 'react-icons/hi';
import { findVocabularyMatches } from '../../vocabularyHighlight.js';

const withVocabulary = (text, vocabulary, onWordClick) => {
  const matches = findVocabularyMatches(text, vocabulary);
  if (!matches.length) return text;
  const result = [];
  let cursor = 0;
  matches.forEach(({ start, end, term, vocabulary: definition }) => {
    if (start > cursor) result.push(text.slice(cursor, start));
    result.push(
      <button
        type="button"
        key={`v-${start}-${term}`}
        className="vocab-word"
        title={definition?.definition || definition?.simple}
        aria-label={`${term}: ${definition?.definition || definition?.simple || ''}`}
        onClick={(event) => onWordClick?.(event, definition, term)}
      >
        {term}
      </button>
    );
    cursor = end;
  });
  if (cursor < text.length) result.push(text.slice(cursor));
  return result;
};

const PassagePage = ({
  page,
  chapterTitle,
  vocabulary = [],
  onWordClick,
  onListen,
  onFinish,
  onAnswerQuestions,
  gate = null,
  speaking = false,
  listenAvailable = false,
  textDirection = 'ltr',
  languageCode,
}) => {
  const { t } = useTranslation(['reading']);

  return (
    <article className="book-passage-page" dir={textDirection} lang={languageCode || undefined}>
      <div className="book-page-topline">
        <span>{chapterTitle}</span>
        <span>{page.pageNumber}/{page.pageCount}</span>
      </div>

      <div className="book-passage-body">
        {page.paragraphs.map((paragraph) => (
          paragraph.instruction ? (
            <p key={paragraph.key} className="reading-instruction book-passage-instruction">
              {paragraph.text}
            </p>
          ) : (
            <p key={paragraph.key} className="reading-text">
              {withVocabulary(paragraph.text, vocabulary, onWordClick)}
            </p>
          )
        ))}
      </div>

      {(gate || listenAvailable || onAnswerQuestions) && (
        <div className="book-page-footer">
          {gate && (
            <>
              <button
                type="button"
                className="btn btn-primary btn-sm book-finish-btn"
                disabled={!gate.canFinish || gate.finishing}
                onClick={onFinish}
              >
                {gate.finishing ? t('reading:gate.confirming') : t('reading:gate.finish')}
              </button>
              {!gate.canFinish && (
                <span className="book-gate-remaining">
                  {gate.remainingSeconds > 0
                    ? t('reading:book.gateSeconds', { seconds: gate.remainingSeconds })
                    : t('reading:book.gateHint')}
                </span>
              )}
            </>
          )}
          {onAnswerQuestions && (
            <button
              type="button"
              className={`btn ${gate ? 'btn-secondary' : 'btn-primary'} btn-sm`}
              onClick={onAnswerQuestions}
            >
              {t('reading:questions.answerQuestions')}
            </button>
          )}
          {listenAvailable && (
            <button
              type="button"
              className={`listen-btn${speaking ? ' speaking' : ''}`}
              onClick={() => onListen?.(page)}
            >
              {speaking ? <HiOutlineStop size={16} /> : <HiOutlineVolumeUp size={16} />}
              {speaking ? t('reading:view.stop') : t('reading:view.listen')}
            </button>
          )}
        </div>
      )}
    </article>
  );
};

export default PassagePage;
