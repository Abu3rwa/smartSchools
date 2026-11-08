// Single source of truth for whether a student (or their parent) may see an
// assessment's performance. Every student-facing surface must consult this so
// answer keys, correctness and scores cannot leak ahead of the teacher's
// release decision through one endpoint while another hides them.
export const isAssessmentResultVisible = (
  assessmentConfig = {},
  entry = null,
  now = new Date(),
) => {
  if (assessmentConfig?.resultsVisibility === "immediate") return true;
  if (entry?.status === "released") return true;
  const releaseAt = assessmentConfig?.resultsReleaseAt;
  if (releaseAt) {
    const releaseTime = new Date(releaseAt).getTime();
    if (Number.isFinite(releaseTime) && now.getTime() >= releaseTime) {
      return true;
    }
  }
  return false;
};