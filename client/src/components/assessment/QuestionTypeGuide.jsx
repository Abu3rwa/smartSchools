import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  questionGuideIntroKey,
  questionGuideLimits,
  questionGuideRows,
  questionGuideRuleKeys,
  questionGuideSeparators
} from './questionTypeGuideData';
import './QuestionTypeGuide.css';

/**
 * Teacher-facing popup that explains every question type a CSV import accepts for one flow.
 * The column names and examples come from questionTypeGuideData, the same grammar the parser reads.
 */
const QuestionTypeGuide = ({ flow, className = 'question-guide-trigger' }) => {
  const { t } = useTranslation(['common', 'questionTypes']);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const limits = questionGuideLimits();
  const rows = questionGuideRows(flow);
  const separators = questionGuideSeparators();
  const introKey = questionGuideIntroKey(flow);
  const ruleKeys = questionGuideRuleKeys(flow);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {t('questionTypes:guide.trigger')}
      </button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div
            className="modal question-guide-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t('questionTypes:guide.title')}
          >
            <div className="modal-header">
              <h3>{t('questionTypes:guide.title')}</h3>
              <button type="button" className="modal-close" onClick={() => setOpen(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p className="question-guide-intro">{t(`questionTypes:guide.${introKey}`)}</p>

              <section className="question-guide-section">
                <h4>{t('questionTypes:guide.sections.separators')}</h4>
                <ul className="question-guide-separators">
                  {separators.map((separator) => (
                    <li key={separator.key}>
                      <code dir="ltr">{separator.symbol}</code>
                      <span>{t(`questionTypes:guide.separators.${separator.key}`)}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="question-guide-section">
                <h4>{t('questionTypes:guide.sections.types')}</h4>
                <ul className="question-guide-types">
                  {rows.map((row) => (
                    <li key={row.key} className="question-guide-type">
                      <div className="question-guide-type-head">
                        <strong>{t(`questionTypes:guide.types.${row.key}.name`)}</strong>
                        <code dir="ltr">{row.token}</code>
                      </div>
                      <p className="question-guide-type-text">
                        {t(`questionTypes:guide.types.${row.key}.write`, limits)}
                      </p>
                      <p className="question-guide-type-columns">
                        <span>{t('questionTypes:guide.columnLabel')}</span>
                        {row.columns.map((column) => (
                          <code key={column} dir="ltr">{column}</code>
                        ))}
                      </p>
                      <p className="question-guide-type-example">
                        <span>{t('questionTypes:guide.exampleLabel')}</span>
                        <code dir="ltr">{row.example}</code>
                      </p>
                      {!!row.stemExample && (
                        <p className="question-guide-type-example">
                          <code dir="ltr">{row.stemExample.column}</code>
                          <code dir="ltr">{row.stemExample.value}</code>
                        </p>
                      )}
                      <p className="question-guide-type-grading">
                        {t(`questionTypes:guide.types.${row.key}.grading`)}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="question-guide-section">
                <h4>{t('questionTypes:guide.sections.rules')}</h4>
                {ruleKeys.map((ruleKey) => (
                  <p key={ruleKey} className="question-guide-rule">{t(`questionTypes:guide.${ruleKey}`)}</p>
                ))}
              </section>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
                {t('common:actions.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default QuestionTypeGuide;
