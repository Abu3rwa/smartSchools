import crypto from 'node:crypto';
import AssessmentPassage from '../../models/AssessmentPassage.js';

export const normalizePassageText = (value) => String(value ?? '')
  .replace(/\r\n/g, '\n')
  .replace(/[ \t]+/g, ' ')
  .replace(/ ?\n ?/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

export const buildPassageHash = (value) => crypto
  .createHash('sha256')
  .update(normalizePassageText(value))
  .digest('hex');

const contextFilter = ({ contextType, plan = null, assignment = null }) => ({
  contextType,
  plan: plan || null,
  assignment: assignment || null
});

/**
 * Store one passage per context key. Identical re-imports are silent; the same key with
 * different text is reported so the import can reject the row instead of guessing.
 */
export const resolveAssessmentPassage = async ({
  schoolId,
  contextType,
  plan = null,
  assignment = null,
  passageKey,
  title = '',
  text,
  source = '',
  language = '',
  accessibilityText = '',
  createdBy = null,
  write = true
}) => {
  const key = String(passageKey ?? '').trim();
  const body = String(text ?? '').trim();
  if (!key || !body) return { passage: null, conflict: null, error: null };

  const contentHash = buildPassageHash(body);
  const base = contextFilter({ contextType, plan, assignment });
  const existing = await AssessmentPassage.findOne({ ...base, school: schoolId, passageKey: key }).lean();

  if (existing && existing.contentHash && existing.contentHash !== contentHash) {
    return {
      passage: existing,
      conflict: {
        passageKey: key,
        problem: `Passage "${key}" already exists in this context with different text.`,
        fix: 'Use one passage id for one text. Give the new text its own passage id, or keep the original wording.'
      },
      error: null
    };
  }

  if (existing) {
    if (!write) return { passage: existing, conflict: null, error: null };
    const nextTitle = String(title ?? '').trim() || existing.title;
    if (nextTitle === existing.title && String(source ?? '').trim() === existing.source) {
      return { passage: existing, conflict: null, error: null };
    }
    return {
      passage: await AssessmentPassage.findByIdAndUpdate(
        existing._id,
        { $set: { title: nextTitle, source: String(source ?? '').trim() || existing.source } },
        { new: true, lean: true }
      ),
      conflict: null,
      error: null
    };
  }

  if (!write) return { passage: null, conflict: null, error: null };

  try {
    const created = await AssessmentPassage.create({
      school: schoolId,
      contextType,
      plan: plan || null,
      assignment: assignment || null,
      passageKey: key,
      title: String(title ?? '').trim(),
      text: body,
      source: String(source ?? '').trim(),
      language: String(language ?? '').trim(),
      accessibilityText: String(accessibilityText ?? '').trim(),
      contentHash,
      createdBy
    });
    return { passage: created.toObject ? created.toObject({ virtuals: false }) : created, conflict: null, error: null };
  } catch (error) {
    if (String(error?.code) === 11000) {
      const raced = await AssessmentPassage.findOne({ ...base, school: schoolId, passageKey: key }).lean();
      const racedConflict = raced && raced.contentHash && raced.contentHash !== contentHash
        ? { passageKey: key, problem: `Passage "${key}" already exists in this context with different text.`, fix: 'Give the new text its own passage id.' }
        : null;
      return { passage: raced || null, conflict: racedConflict, error: null };
    }
    return { passage: null, conflict: null, error: error.message };
  }
};

/**
 * Read one stored passage by its authored key, without creating anything.
 */
export const findAssessmentPassage = async ({
  schoolId,
  contextType,
  plan = null,
  assignment = null,
  passageKey
}) => {
  const key = String(passageKey ?? '').trim();
  if (!key) return null;
  return AssessmentPassage.findOne({ ...contextFilter({ contextType, plan, assignment }), school: schoolId, passageKey: key }).lean();
};

export const buildPassageSnapshot = (passage) => {
  if (!passage) return null;
  const text = normalizePassageText(passage.text);
  if (!text) return null;
  return {
    passageId: passage._id ? String(passage._id) : '',
    passageKey: String(passage.passageKey || ''),
    title: String(passage.title || ''),
    text,
    source: String(passage.source || ''),
    language: String(passage.language || ''),
    accessibilityText: String(passage.accessibilityText || ''),
    contentHash: passage.contentHash || buildPassageHash(text)
  };
};
