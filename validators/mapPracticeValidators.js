import { z } from 'zod';

export const mapPracticeCsvHeader = [
  'student_id', 'plan_title', 'set_id', 'set_title', 'set_order', 'question_id', 'order',
  'subject', 'strand', 'skill_code', 'skill_name', 'rit_band', 'passage_id', 'passage_title',
  'passage_text', 'question_type', 'stem', 'option_a', 'option_b', 'option_c', 'option_d',
  'correct_answer', 'explanation', 'distractor_note', 'points'
];

export const mapPracticeQuestionTypes = ['mcq', 'multi_select', 'short_text', 'matching'];

export const mapPracticeQuestionTypeSchema = z.enum(mapPracticeQuestionTypes);

export const emptyMapPracticeQuestionTypeCounts = () =>
  Object.fromEntries(mapPracticeQuestionTypes.map((type) => [type, 0]));

export const mapPracticePreviewFileSchema = z.object({
  fileName: z.string().min(1),
  rows: z.array(z.record(z.any())),
  studentId: z.string().trim().optional().nullable(),
  decisions: z.object({
    action: z.enum(['create','update','skip']).default('create'),
    matchedStudentId: z.string().trim().optional().nullable(),
    warnings: z.array(z.string()).default([]),
    errors: z.array(z.string()).default([])
  }).default({ action: 'create', matchedStudentId: null, warnings: [], errors: [] })
});

export const mapPracticeImportSchema = z.object({
  mode: z.enum(['stop_on_error', 'skip_errors']).default('stop_on_error'),
  assignFirstSet: z.boolean().default(false),
  dueDate: z.string().nullable().optional(),
  files: z.array(mapPracticePreviewFileSchema).min(1).max(30)
});

export const normalizeSkillCode = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, '-');

export const isValidSkillCode = (value) => /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(String(value || '').trim());

export const normalizeShortText = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201C\u201D]/g, '"')
  .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-')
  .replace(/\s+/g, ' ')
  .replace(/[.,!?;:]+$/g, '')
  .trim();

export const normalizeAnswerList = (value) => String(value ?? '')
  .split('|')
  .map((part) => normalizeShortText(part))
  .filter(Boolean);

export const MAP_MATCHING_PAIR_SEPARATOR = '|';
export const MAP_MATCHING_TERM_SEPARATOR = '::';
export const MAP_MATCHING_MIN_PAIRS = 2;

export const parseMatchingPairs = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return { pairs: [], invalid: [] };

  const pairs = [];
  const invalid = [];
  const seenLefts = new Set();

  raw.split(MAP_MATCHING_PAIR_SEPARATOR).forEach((chunk) => {
    const part = String(chunk ?? '').trim();
    if (!part) return;
    const splitIndex = part.indexOf(MAP_MATCHING_TERM_SEPARATOR);
    const left = splitIndex === -1 ? '' : part.slice(0, splitIndex).trim();
    const right = splitIndex === -1 ? '' : part.slice(splitIndex + MAP_MATCHING_TERM_SEPARATOR.length).trim();
    if (!left || !right) {
      invalid.push(part);
      return;
    }
    const key = normalizeShortText(left);
    if (seenLefts.has(key)) return;
    seenLefts.add(key);
    pairs.push({ left, right });
  });

  return { pairs, invalid };
};
