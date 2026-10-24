import './AssessmentAnswers.css';

const PassagePanel = ({ passage, labels }) => {
  const title = String(passage?.title ?? '').trim();
  const text = String(passage?.text ?? '').trim();
  if (!text) return null;

  return (
    <section className="assessment-passage" aria-label={labels?.label || 'Reading passage'}>
      {!!title && <h4 className="assessment-passage-title">{title}</h4>}
      <p className="assessment-passage-text">{text}</p>
      {!!String(passage?.source ?? '').trim() && (
        <p className="assessment-passage-source">{labels?.source || 'Source'}: {String(passage.source).trim()}</p>
      )}
    </section>
  );
};

export default PassagePanel;
