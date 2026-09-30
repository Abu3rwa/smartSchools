export const summarizePracticeSkill = (attempts = []) => {
  const rows = Array.isArray(attempts) ? attempts : [];
  const total = rows.length;
  const correct = rows.filter((item) => item?.isCorrect === true).length;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  return { total, correct, accuracy };
};
