import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineArrowLeft,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineXCircle,
} from 'react-icons/hi';
import useStudentAssessmentResultData from './hooks/useStudentAssessmentResultData';
import './StudentAssessmentResultsPage.css';

const formatNumber = (value, locale) => {
  if (value === null || value === undefined || value === '') return '—';
  const tag = locale.startsWith('ar') ? 'ar-EG-u-nu-arab' : locale;
  try {
    return new Intl.NumberFormat(tag, { maximumFractionDigits: 2 }).format(value);
  } catch {
    return String(value);
  }
};

const formatDate = (value, locale) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const StudentAssessmentResultsPage = () => {
  const { t, i18n } = useTranslation(['assignments']);
  const locale = i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const { loading, result, error, backDestination } = useStudentAssessmentResultData();

  if (loading) {
    return (
      <div className="student-result-page">
        <div className="loading-container">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="student-result-page">
      <Link to={backDestination} className="btn btn-ghost back-btn">
        <HiOutlineArrowLeft size={18} aria-hidden="true" />
        {t('student.results.back')}
      </Link>

      {error ? (
        <div className="result-card result-error" role="alert">
          <h1>
            {error.code === 'RESULTS_NOT_RELEASED'
              ? t('student.results.notReleased')
              : t('student.results.unavailableTitle')}
          </h1>
          <p>
            {error.code === 'RESULTS_NOT_RELEASED'
              ? t('student.results.notReleasedBody')
              : t('student.results.unavailableBody')}
          </p>
        </div>
      ) : result ? (
        <>
          <header className="result-card result-header">
            <p className="result-eyebrow">
              {result.standard?.code
                ? t('student.results.title') + ` · ${result.standard.code}`
                : t('student.results.title')}
            </p>
            <h1>{result.title}</h1>
            <p className="result-meta">
              {result.standard?.name ? `${result.standard.name}` : ''}
              {result.subject?.name ? ` · ${result.subject.name}` : ''}
              {result.submittedAt
                ? ` · ${t('student.results.submittedOn', {
                    date: formatDate(result.submittedAt, locale),
                  })}`
                : ''}
            </p>

            <div className="result-stats">
              <div className="result-stat">
                <span>{t('student.results.score')}</span>
                <strong>
                  {formatNumber(result.score, locale)} / {formatNumber(result.maxScore, locale)}
                </strong>
              </div>
              <div className="result-stat">
                <span>{t('student.results.percentage')}</span>
                <strong>{formatNumber(result.percentage, locale)}%</strong>
              </div>
              <div className="result-stat">
                <span>{t('student.results.scale')}</span>
                <strong>{formatNumber(result.scale4, locale)}</strong>
              </div>
              <div className="result-stat">
                <span>{t('student.results.summary', {
                  correct: formatNumber(result.correctCount || 0, locale),
                  total: formatNumber(result.totalAnswered || 0, locale),
                })}</span>
                <strong className={result.isPassed ? 'pass' : 'fail'}>
                  {result.isPassed ? t('student.results.passed') : t('student.results.failed')}
                </strong>
              </div>
            </div>
          </header>

          <section className="result-questions" aria-label={t('student.results.question')}>
            {(result.questions || []).map((question, index) => (
              <article
                className={`result-question ${question.isCorrect ? 'correct' : 'incorrect'}`}
                key={question.id || index}
              >
                <div className="result-question-head">
                  <h2>
                    {t('student.results.question')} {formatNumber(index + 1, locale)}
                  </h2>
                  <span className={`result-verdict ${question.requiresTeacherReview ? 'review' : question.isCorrect ? 'correct' : 'incorrect'}`}>
                    {question.requiresTeacherReview ? (
                      <>
                        <HiOutlineClock size={16} aria-hidden="true" />
                        {t('student.results.awaitingReview')}
                      </>
                    ) : question.isCorrect ? (
                      <>
                        <HiOutlineCheckCircle size={16} aria-hidden="true" />
                        {t('student.results.correct')}
                      </>
                    ) : (
                      <>
                        <HiOutlineXCircle size={16} aria-hidden="true" />
                        {t('student.results.incorrect')}
                      </>
                    )}
                  </span>
                </div>
                <p className="result-question-text">{question.questionText}</p>
                <dl className="result-answer-grid">
                  <div>
                    <dt>{t('student.results.yourAnswer')}</dt>
                    <dd>{question.studentAnswer || t('student.results.noAnswer')}</dd>
                  </div>
                  {!question.requiresTeacherReview ? (
                    <div>
                      <dt>{t('student.results.correctAnswer')}</dt>
                      <dd>{question.correctAnswer || '—'}</dd>
                    </div>
                  ) : null}
                </dl>
                {question.feedback || question.explanation ? (
                  <div className="result-feedback">
                    <p className="result-feedback-label">{t('student.results.feedback')}</p>
                    <p>{question.feedback || question.explanation}</p>
                  </div>
                ) : null}
              </article>
            ))}
          </section>
        </>
      ) : null}
    </div>
  );
};

export default StudentAssessmentResultsPage;
