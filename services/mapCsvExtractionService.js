import crypto from 'crypto';

const REQUIRED_HEADERS = ['student_id', 'student_name', 'grade', 'subject', 'assessment_date', 'term', 'rit_score', 'instructional_area', 'standard_code', 'standard_description', 'performance_level'];

const parseCsvLine = (line, rowNumber) => {
    const values = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (character === '"') {
            if (quoted && line[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted;
        } else if (character === ',' && !quoted) {
            values.push(value);
            value = '';
        } else value += character;
    }
    if (quoted) throw new Error(`Row ${rowNumber}: malformed CSV syntax; a quoted value was not closed.`);
    values.push(value);
    return values;
};

const parseNumber = (value, rowNumber, column) => {
    if (!String(value || '').trim()) return null;
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`Row ${rowNumber}: ${column} must be a number. Received: '${value}'.`);
    return number;
};

const parseDate = (value, rowNumber) => {
    if (!String(value || '').trim()) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim()) || Number.isNaN(new Date(value).getTime())) {
        throw new Error(`Row ${rowNumber}: assessment_date must use YYYY-MM-DD. Received: '${value}'.`);
    }
    return new Date(value);
};

const normalizeRow = (raw, rowNumber, fileHash) => {
    const required = ['student_id', 'student_name', 'subject', 'instructional_area'];
    const missing = required.find((column) => !String(raw[column] || '').trim());
    if (missing) throw new Error(`Row ${rowNumber}: ${missing} is required.`);
    const grade = Number(raw.grade);
    if (!Number.isInteger(grade) || grade < 0 || grade > 12) throw new Error(`Row ${rowNumber}: grade must be a valid grade number. Received: '${raw.grade}'.`);
    const performanceLevel = String(raw.performance_level || '').trim();
    return {
        mapEvidenceId: `evidence_${crypto.createHash('sha256').update(`${fileHash}:${rowNumber}:${JSON.stringify(raw)}`).digest('hex').slice(0, 24)}`,
        studentId: raw.student_id.trim(), studentName: raw.student_name.trim(), grade, subject: raw.subject.trim(),
        assessmentDate: parseDate(raw.assessment_date, rowNumber), term: raw.term.trim(),
        ritScore: parseNumber(raw.rit_score, rowNumber, 'rit_score'), instructionalArea: raw.instructional_area.trim(),
        standardCode: raw.standard_code.trim(), standardDescription: raw.standard_description.trim(), performanceLevel
    };
};

export const parseMapCsv = (text) => {
    const fileHash = crypto.createHash('sha256').update(String(text || '')).digest('hex');
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
    while (lines.length && !lines.at(-1).trim()) lines.pop();
    if (lines.length < 2) throw new Error('The MAP CSV must contain a header and at least one data row.');
    const headers = parseCsvLine(lines[0], 1).map((header) => header.trim());
    if (headers.length !== REQUIRED_HEADERS.length || headers.some((header, index) => header !== REQUIRED_HEADERS[index])) throw new Error(`CSV headers must exactly match: ${REQUIRED_HEADERS.join(',')}`);
    const evidence = lines.slice(1).map((line, index) => {
        const rowNumber = index + 2;
        const values = parseCsvLine(line, rowNumber);
        if (values.length !== headers.length) throw new Error(`Row ${rowNumber}: expected ${headers.length} columns but received ${values.length}.`);
        return normalizeRow(Object.fromEntries(headers.map((header, valueIndex) => [header, values[valueIndex]])), rowNumber, fileHash);
    });
    const first = evidence[0];
    if (evidence.some((row) => row.studentId !== first.studentId || row.subject !== first.subject || row.grade !== first.grade)) throw new Error('All CSV rows must belong to one student, subject, and grade per import.');
    return { sourceType: 'csv', fileHash, studentId: first.studentId, studentName: first.studentName, grade: first.grade, subject: first.subject, assessmentDate: first.assessmentDate, term: first.term, ritScore: first.ritScore, evidence };
};

export const parseCsvRecord = (text, studentId) => {
    const parsed = parseMapCsv(text);
    if (studentId && parsed.studentId !== studentId) throw new Error(`The MAP CSV belongs to student ${parsed.studentId}, not ${studentId}.`);
    return parsed;
};

export default { parseMapCsv, parseCsvRecord };
