export const calculateLiveSessionMark = ({
  correctAnswers,
  questionCount,
  maxMarks,
  visibilityIncidents,
  deductionPerIncident,
}) => {
  const baseMarks = Number(((correctAnswers / questionCount) * maxMarks).toFixed(2));
  const requestedDeduction = Number((visibilityIncidents * deductionPerIncident).toFixed(2));
  const behaviorDeduction = Math.min(baseMarks, requestedDeduction);
  return {
    baseMarks,
    behaviorDeduction,
    marks: Math.max(0, Number((baseMarks - requestedDeduction).toFixed(2))),
  };
};
