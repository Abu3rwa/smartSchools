import { parse } from 'csv-parse/sync';
import { mapPracticeCsvHeader, normalizeSkillCode, isValidSkillCode } from '../validators/mapPracticeValidators.js';

export const parseMapPracticeCsv = (csvText, fileName = '') => {
  if (typeof csvText !== 'string' || !csvText.trim()) {
    throw new Error('CSV file is empty.');
  }

  const normalizedText = csvText.replace(/^\uFEFF/, '');
  const records = parse(normalizedText, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    rtrim: true
  });

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('CSV file has no rows to import.');
  }

  const rows = records.map((row, index) => ({
    rowNumber: index + 2,
    original: row,
    values: Object.fromEntries(
      Object.entries(row).map(([key, value]) => [String(key).trim(), String(value ?? '').trim()])
    )
  }));

  const missingHeaders = mapPracticeCsvHeader.filter((header) => !Object.keys(rows[0]?.values || {}).includes(header));
  if (missingHeaders.length) {
    throw new Error(`Missing required CSV headers: ${missingHeaders.join(', ')}`);
  }

  const fileStudentId = (() => {
    const fromFileName = String(fileName || '').match(/(?:^|[\\/])([A-Za-z0-9-]+)(?:_|\.|-)/);
    return fromFileName ? fromFileName[1] : '';
  })();

  return {
    rows,
    fileStudentId,
    warnings: [],
    validation: rows.map((row) => {
      const skillCode = normalizeSkillCode(row.values.skill_code);
      return {
        rowNumber: row.rowNumber,
        studentId: row.values.student_id || '',
        questionId: row.values.question_id || '',
        skillCode,
        validSkillCode: isValidSkillCode(skillCode),
        questionType: row.values.question_type || '',
        points: Number(row.values.points || 1) || 1
      };
    })
  };
};

export const extractMapPracticeStudentIdFromFilename = (fileName) => {
  const match = String(fileName || '').match(/(?:^|[\\/])([A-Za-z0-9-]+)(?:_|\.|-)/);
  return match ? match[1].trim() : '';
};

export const normalizeMapPracticePlanTitle = (value, fallback = 'MAP Practice') => {
  const title = String(value || '').trim();
  return title || fallback;
};
