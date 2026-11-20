import School from "../models/School.js";
import { marksModeOf } from "../client/src/utils/writingRubric.js";

/**
 * The school's chosen child-facing marks mode. Every surface that a child or a
 * family reads — workspace, email, print — resolves it here so the three can
 * never disagree (C4). A missing setting means the historic behaviour: words.
 */
export const writingMarksMode = async (schoolId) => {
  const school = await School.findById(schoolId)
    .select("settings.writingFeedback.marksMode")
    .lean();
  return marksModeOf(school?.settings?.writingFeedback?.marksMode);
};
