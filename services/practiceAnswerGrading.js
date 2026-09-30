const normalizeText = (value) => String(value ?? '')
  .normalize('NFKC')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ');

const normalizeTrueFalse = (value) => {
  const normalized = normalizeText(value).replace(/[^a-z0-9]/g, '');
  if (['true', 't', 'yes', 'y', '1'].includes(normalized)) return 'true';
  if (['false', 'f', 'no', 'n', '0'].includes(normalized)) return 'false';
  return null;
};

const resolveChoiceValue = (value, options = []) => {
  const normalized = normalizeText(value);
  if (!normalized) return '';

  const upperValue = normalized.toUpperCase();
  const matchingLabel = options.find(
    (option) => String(option?.label || '').trim().toUpperCase() === upperValue
  );
  if (matchingLabel) return String(matchingLabel.label).trim().toUpperCase();

  const leadingLabel = upperValue.match(/^([A-D])[).:\-\s]/);
  if (leadingLabel) return leadingLabel[1];

  const matchingText = options.find(
    (option) => normalizeText(option?.text) === normalized
  );
  if (matchingText?.label) return String(matchingText.label).trim().toUpperCase();

  return normalized;
};

const resolveTrueFalseValue = (value, options = []) => {
  const directValue = normalizeTrueFalse(value);
  if (directValue) return directValue;

  const normalized = normalizeText(value);
  const upperValue = normalized.toUpperCase();
  const matchingOption = options.find((option) => (
    String(option?.label || '').trim().toUpperCase() === upperValue
    || normalizeText(option?.text) === normalized
  ));
  return matchingOption
    ? normalizeTrueFalse(matchingOption.text || matchingOption.label)
    : null;
};

export const gradePracticeAnswer = ({
  questionType,
  studentAnswer,
  correctAnswer,
  questionOptions = [],
}) => {
  if (questionType === 'multiple_choice') {
    const studentValue = resolveChoiceValue(studentAnswer, questionOptions);
    const correctValue = resolveChoiceValue(correctAnswer, questionOptions);
    if (!studentValue || !correctValue) {
      return {
        isCorrect: null,
        requiresTeacherReview: true,
        feedback: 'Your answer has been submitted for teacher review.',
      };
    }
    const isCorrect = studentValue === correctValue;
    return {
      isCorrect,
      requiresTeacherReview: false,
      feedback: isCorrect ? 'Your answer is correct.' : 'Your answer is not correct.',
    };
  }

  if (questionType === 'true_false') {
    const studentValue = resolveTrueFalseValue(studentAnswer, questionOptions);
    const correctValue = resolveTrueFalseValue(correctAnswer, questionOptions);
    if (studentValue && correctValue) {
      const isCorrect = studentValue === correctValue;
      return {
        isCorrect,
        requiresTeacherReview: false,
        feedback: isCorrect ? 'Your answer is correct.' : 'Your answer is not correct.',
      };
    }
  }

  return {
    isCorrect: null,
    requiresTeacherReview: true,
    feedback: 'Your answer has been submitted for teacher review.',
  };
};