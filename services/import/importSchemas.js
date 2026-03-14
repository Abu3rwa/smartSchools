const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export const MAX_IMPORT_ROWS = 500;

export const ENTITY_TYPES = [
    'students',
    'standards',
    'subjects',
    'teachers',
    'classes',
    'rooms',
    'timetable_periods'
];

export const ENTITY_DISPLAY_NAMES = {
    students: 'students',
    standards: 'standards',
    subjects: 'subjects',
    teachers: 'teachers',
    classes: 'classes',
    rooms: 'rooms',
    timetable_periods: 'timetable periods'
};

export const IMPORT_TEMPLATE_DEFINITIONS = {
    students: {
        displayName: 'Students',
        headers: ['firstName', 'lastName', 'dateOfBirth', 'gender', 'email', 'studentId', 'fatherName', 'fatherPhone', 'fatherEmail', 'motherName', 'motherPhone', 'motherEmail'],
        sampleRow: ['John', 'Doe', '2010-03-15', 'male', 'john.doe@example.com', 'STU260001', 'Ahmed Doe', '0812345678', 'ahmed.doe@example.com', 'Fatima Doe', '0823456789', 'fatima.doe@example.com']
    },
    teachers: {
        displayName: 'Teachers',
        headers: ['firstName', 'lastName', 'email', 'phone', 'employeeId', 'department', 'subjects', 'qualification', 'specialization', 'isActive'],
        sampleRow: ['Aisha', 'Khan', 'aisha.khan@example.com', '0811111111', 'TCH260001', 'Science', 'SCI101,SCI102', 'B.Ed', 'Physics', 'true']
    },
    classes: {
        displayName: 'Classes',
        headers: ['grade', 'section', 'name', 'academicYear', 'room', 'capacity', 'classTeacherEmail', 'department', 'isActive'],
        sampleRow: ['5', 'A', 'Grade 5-A', '2025-2026', 'Room 12', '35', 'aisha.khan@example.com', 'Science', 'true']
    },
    subjects: {
        displayName: 'Subjects',
        headers: ['name', 'code', 'description', 'applicableGrades', 'type', 'creditHours', 'maxMarks', 'passingMarks', 'dailyMaxMarks', 'isActive'],
        sampleRow: ['English Language Arts', 'ELA5', 'Core ELA subject for grade 5', '5', 'core', '1', '100', '40', '10', 'true']
    },
    standards: {
        displayName: 'Standards',
        headers: ['code', 'name', 'description', 'subjectCode', 'gradeLevel', 'category', 'masteryThreshold', 'masteryMinQuestions', 'isActive'],
        sampleRow: ['ELA.5.RL.1', 'Quote accurately', 'Quote accurately from a text when explaining', 'ELA5', '5', 'Reading Literature', '80', '5', 'true']
    },
    rooms: {
        displayName: 'Rooms',
        headers: ['name', 'type', 'capacity', 'building', 'floor', 'number', 'status', 'isAvailable', 'notes'],
        sampleRow: ['Room 12', 'classroom', '35', 'Main Building', '1', '12', 'active', 'true', 'Grade 5 wing']
    },
    timetable_periods: {
        displayName: 'Timetable Periods',
        headers: ['name', 'startTime', 'endTime', 'order', 'isActive'],
        sampleRow: ['Period 1', '08:00', '08:45', '1', 'true']
    }
};

const ENTITY_ALIASES = {
    students: 'students',
    standards: 'standards',
    subjects: 'subjects',
    teachers: 'teachers',
    classes: 'classes',
    rooms: 'rooms',
    timetable_periods: 'timetable_periods',
    'timetable-periods': 'timetable_periods',
    periods: 'timetable_periods',
    timetableperiods: 'timetable_periods'
};

const LEGACY_ROW_KEYS = {
    students: ['students'],
    standards: ['standards'],
    subjects: ['subjects'],
    teachers: ['teachers'],
    classes: ['classes'],
    rooms: ['rooms'],
    timetable_periods: ['periods', 'timetablePeriods', 'timetable_periods']
};

const toTrimmedString = (value) => {
    if (value === undefined || value === null) return '';
    return String(value).trim();
};

const toLowerCase = (value) => toTrimmedString(value).toLowerCase();
const toUpperCase = (value) => toTrimmedString(value).toUpperCase();

const parseBooleanLoose = (value, defaultValue = null) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    const normalized = toLowerCase(value);
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
    return null;
};

const parseInteger = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : null;
};

const parseFloatStrict = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const parseStrictDate = (value) => {
    const raw = toTrimmedString(value);
    if (!raw) return null;

    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        const [, year, month, day] = isoMatch;
        const y = Number(year);
        const m = Number(month);
        const d = Number(day);
        const date = new Date(Date.UTC(y, m - 1, d));
        if (date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d) {
            return date;
        }
        return null;
    }

    const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
        const [, month, day, year] = slashMatch;
        const y = Number(year);
        const m = Number(month);
        const d = Number(day);
        const date = new Date(Date.UTC(y, m - 1, d));
        if (date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d) {
            return date;
        }
        return null;
    }

    return null;
};

const parseTimeHHMM = (value) => {
    const raw = toTrimmedString(value);
    if (!raw) return null;
    const match = raw.match(/^([01]?[0-9]|2[0-3]):([0-5][0-9])$/);
    if (!match) return null;
    const hh = String(match[1]).padStart(2, '0');
    const mm = match[2];
    return `${hh}:${mm}`;
};

const parseArray = (value) => {
    if (value === undefined || value === null || value === '') return [];
    if (Array.isArray(value)) return value;
    return String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
};

const buildIssue = (row, field, code, message, data) => ({
    row,
    field,
    code,
    message,
    ...(data !== undefined ? { data } : {})
});

const normalizeStudentsRow = (row, rowNumber, context) => {
    const errors = [];
    const warnings = [];

    const firstName = toTrimmedString(row.firstName);
    const lastName = toTrimmedString(row.lastName);
    const gender = toLowerCase(row.gender);
    const dateOfBirth = parseStrictDate(row.dateOfBirth);
    const email = toLowerCase(row.email);
    const studentId = toTrimmedString(row.studentId);

    if (!firstName) errors.push(buildIssue(rowNumber, 'firstName', 'REQUIRED_FIELD', 'firstName is required', row));
    if (!lastName) errors.push(buildIssue(rowNumber, 'lastName', 'REQUIRED_FIELD', 'lastName is required', row));
    if (!gender) errors.push(buildIssue(rowNumber, 'gender', 'REQUIRED_FIELD', 'gender is required', row));
    if (gender && !['male', 'female', 'other'].includes(gender)) {
        errors.push(buildIssue(rowNumber, 'gender', 'INVALID_ENUM', 'gender must be one of male, female, other', row));
    }
    if (!row.dateOfBirth) errors.push(buildIssue(rowNumber, 'dateOfBirth', 'REQUIRED_FIELD', 'dateOfBirth is required', row));
    if (row.dateOfBirth && !dateOfBirth) {
        errors.push(buildIssue(rowNumber, 'dateOfBirth', 'INVALID_DATE', 'dateOfBirth must use YYYY-MM-DD or MM/DD/YYYY', row));
    }
    if (email && !EMAIL_PATTERN.test(email)) {
        errors.push(buildIssue(rowNumber, 'email', 'INVALID_EMAIL', 'email format is invalid', row));
    }

    const parentInfo = {};
    const parentFields = [
        'fatherName', 'fatherPhone', 'fatherEmail',
        'motherName', 'motherPhone', 'motherEmail',
        'guardianName', 'guardianPhone', 'guardianEmail'
    ];
    for (const field of parentFields) {
        const value = toTrimmedString(row[field]);
        if (value) parentInfo[field] = value;
    }
    const primaryContact = toLowerCase(row.primaryContact);
    if (primaryContact) {
        if (['father', 'mother', 'guardian'].includes(primaryContact)) {
            parentInfo.primaryContact = primaryContact;
        } else {
            warnings.push(buildIssue(rowNumber, 'primaryContact', 'NORMALIZATION_FALLBACK', 'primaryContact is invalid and was ignored', row));
        }
    }

    const duplicateSignatures = [];
    if (studentId) duplicateSignatures.push(`studentId:${studentId.toLowerCase()}`);
    if (email) duplicateSignatures.push(`email:${email}`);
    if (firstName && lastName && dateOfBirth) {
        const dobKey = dateOfBirth.toISOString().slice(0, 10);
        duplicateSignatures.push(`nameDob:${firstName.toLowerCase()}|${lastName.toLowerCase()}|${dobKey}`);
    }

    return {
        normalized: {
            firstName,
            lastName,
            gender,
            dateOfBirth,
            email: email || null,
            studentId: studentId || null,
            classRef: toTrimmedString(row.classId || row.currentClass || row.class) || null,
            academicYear: toTrimmedString(row.academicYear || context?.academicYear) || null,
            parentInfo: Object.keys(parentInfo).length > 0 ? parentInfo : undefined
        },
        duplicateSignatures,
        errors,
        warnings
    };
};

const normalizeStandardsRow = (row, rowNumber) => {
    const errors = [];
    const warnings = [];

    const code = toUpperCase(row.code);
    const name = toTrimmedString(row.name);
    const description = toTrimmedString(row.description);
    const subjectRef = toTrimmedString(row.subject || row.subjectId || row.subjectCode);
    const gradeLevel = parseInteger(row.gradeLevel);
    const masteryThreshold = parseFloatStrict(row.masteryThreshold);
    const masteryMinQuestions = parseInteger(row.masteryMinQuestions);

    if (!code) errors.push(buildIssue(rowNumber, 'code', 'REQUIRED_FIELD', 'code is required', row));
    if (!name) errors.push(buildIssue(rowNumber, 'name', 'REQUIRED_FIELD', 'name is required', row));
    if (!description) errors.push(buildIssue(rowNumber, 'description', 'REQUIRED_FIELD', 'description is required', row));
    if (!subjectRef) errors.push(buildIssue(rowNumber, 'subject', 'REQUIRED_FIELD', 'subject is required', row));
    if (gradeLevel === null) {
        errors.push(buildIssue(rowNumber, 'gradeLevel', 'REQUIRED_FIELD', 'gradeLevel is required', row));
    } else if (gradeLevel < 1 || gradeLevel > 12) {
        errors.push(buildIssue(rowNumber, 'gradeLevel', 'INVALID_RANGE', 'gradeLevel must be between 1 and 12', row));
    }
    if (masteryThreshold !== null && (masteryThreshold < 1 || masteryThreshold > 100)) {
        errors.push(buildIssue(rowNumber, 'masteryThreshold', 'INVALID_RANGE', 'masteryThreshold must be between 1 and 100', row));
    }
    if (masteryMinQuestions !== null && masteryMinQuestions < 1) {
        errors.push(buildIssue(rowNumber, 'masteryMinQuestions', 'INVALID_RANGE', 'masteryMinQuestions must be at least 1', row));
    }

    return {
        normalized: {
            code,
            name,
            description,
            subjectRef,
            gradeLevel,
            category: toTrimmedString(row.category),
            masteryThreshold: masteryThreshold ?? 80,
            masteryMinQuestions: masteryMinQuestions ?? 5,
            isActive: parseBooleanLoose(row.isActive, true)
        },
        duplicateSignatures: code ? [`code:${code}`] : [],
        errors,
        warnings
    };
};

const normalizeSubjectsRow = (row, rowNumber) => {
    const errors = [];
    const warnings = [];
    const code = toUpperCase(row.code);
    const name = toTrimmedString(row.name);
    const gradesRaw = parseArray(row.applicableGrades);
    const applicableGrades = gradesRaw
        .map((value) => parseInteger(value))
        .filter((value) => value !== null);

    if (!name) errors.push(buildIssue(rowNumber, 'name', 'REQUIRED_FIELD', 'name is required', row));
    if (!code) errors.push(buildIssue(rowNumber, 'code', 'REQUIRED_FIELD', 'code is required', row));
    for (const grade of applicableGrades) {
        if (grade < 1 || grade > 12) {
            errors.push(buildIssue(rowNumber, 'applicableGrades', 'INVALID_RANGE', 'applicableGrades values must be between 1 and 12', row));
            break;
        }
    }
    if (row.requiresLab !== undefined || row.isCore !== undefined) {
        warnings.push(buildIssue(rowNumber, 'row', 'UNSUPPORTED_FIELD', 'requiresLab and isCore are ignored for current subject model', row));
    }

    return {
        normalized: {
            name,
            code,
            description: toTrimmedString(row.description),
            applicableGrades,
            type: toTrimmedString(row.type) || 'core',
            creditHours: parseInteger(row.creditHours) ?? 1,
            maxMarks: parseInteger(row.maxMarks) ?? 100,
            passingMarks: parseInteger(row.passingMarks) ?? 40,
            dailyMaxMarks: parseInteger(row.dailyMaxMarks) ?? 10,
            isActive: parseBooleanLoose(row.isActive, true)
        },
        duplicateSignatures: code ? [`code:${code}`] : [],
        errors,
        warnings
    };
};

const normalizeTeachersRow = (row, rowNumber) => {
    const errors = [];
    const warnings = [];

    const firstName = toTrimmedString(row.firstName);
    const lastName = toTrimmedString(row.lastName);
    const email = toLowerCase(row.email);
    const employeeId = toTrimmedString(row.employeeId);

    if (!firstName) errors.push(buildIssue(rowNumber, 'firstName', 'REQUIRED_FIELD', 'firstName is required', row));
    if (!lastName) errors.push(buildIssue(rowNumber, 'lastName', 'REQUIRED_FIELD', 'lastName is required', row));
    if (!email) errors.push(buildIssue(rowNumber, 'email', 'REQUIRED_FIELD', 'email is required', row));
    if (email && !EMAIL_PATTERN.test(email)) {
        errors.push(buildIssue(rowNumber, 'email', 'INVALID_EMAIL', 'email format is invalid', row));
    }

    const duplicateSignatures = [];
    if (email) duplicateSignatures.push(`email:${email}`);
    if (employeeId) duplicateSignatures.push(`employeeId:${employeeId.toLowerCase()}`);

    return {
        normalized: {
            firstName,
            lastName,
            email,
            phone: toTrimmedString(row.phone) || undefined,
            employeeId: employeeId || null,
            qualification: toTrimmedString(row.qualification) || undefined,
            specialization: toTrimmedString(row.specialization) || undefined,
            departmentRef: toTrimmedString(row.department || row.departmentId) || null,
            subjectsRef: parseArray(row.subjects || row.subjectIds || row.subjectCodes),
            isActive: parseBooleanLoose(row.isActive, true),
            password: toTrimmedString(row.password) || null
        },
        duplicateSignatures,
        errors,
        warnings
    };
};

const normalizeClassesRow = (row, rowNumber, context) => {
    const errors = [];
    const warnings = [];
    let grade = parseInteger(row.grade);
    const section = toUpperCase(row.section);
    const name = toTrimmedString(row.name);

    if (grade === null && name) {
        const parsed = name.match(/(\d{1,2})/);
        if (parsed) grade = parseInteger(parsed[1]);
    }

    if (grade === null) errors.push(buildIssue(rowNumber, 'grade', 'REQUIRED_FIELD', 'grade is required', row));
    if (grade !== null && (grade < 1 || grade > 12)) {
        errors.push(buildIssue(rowNumber, 'grade', 'INVALID_RANGE', 'grade must be between 1 and 12', row));
    }

    const capacity = parseInteger(row.capacity);
    if (capacity !== null && capacity < 1) {
        errors.push(buildIssue(rowNumber, 'capacity', 'INVALID_RANGE', 'capacity must be a positive integer', row));
    }

    const academicYear = toTrimmedString(row.academicYear || context?.academicYear);
    if (!academicYear) {
        errors.push(buildIssue(rowNumber, 'academicYear', 'REQUIRED_FIELD', 'academicYear is required', row));
    }

    const duplicateSignatures = (grade !== null && academicYear)
        ? [`class:${grade}|${section || ''}|${academicYear}`]
        : [];

    return {
        normalized: {
            name: name || `Grade ${grade}${section ? `-${section}` : ''}`,
            grade,
            section: section || '',
            academicYear,
            room: toTrimmedString(row.room),
            capacity: capacity ?? 40,
            classTeacherRef: toTrimmedString(row.classTeacher || row.classTeacherId || row.classTeacherEmail || row.classTeacherEmployeeId) || null,
            departmentRef: toTrimmedString(row.department || row.departmentId) || null,
            isActive: parseBooleanLoose(row.isActive, true)
        },
        duplicateSignatures,
        errors,
        warnings
    };
};

const normalizeRoomsRow = (row, rowNumber) => {
    const errors = [];
    const warnings = [];

    const name = toTrimmedString(row.name);
    const type = toTrimmedString(row.type) || 'classroom';
    const capacity = parseInteger(row.capacity);
    const status = toTrimmedString(row.status) || 'active';

    if (!name) errors.push(buildIssue(rowNumber, 'name', 'REQUIRED_FIELD', 'name is required', row));
    if (capacity !== null && capacity < 1) {
        errors.push(buildIssue(rowNumber, 'capacity', 'INVALID_RANGE', 'capacity must be at least 1', row));
    }

    return {
        normalized: {
            name,
            type,
            capacity: capacity ?? 40,
            building: toTrimmedString(row.building),
            floor: toTrimmedString(row.floor),
            number: toTrimmedString(row.number || row.code),
            status,
            isAvailable: parseBooleanLoose(row.isAvailable, true),
            notes: toTrimmedString(row.notes)
        },
        duplicateSignatures: name ? [`room:${name.toLowerCase()}`] : [],
        errors,
        warnings
    };
};

const normalizeTimetablePeriodsRow = (row, rowNumber) => {
    const errors = [];
    const warnings = [];

    const name = toTrimmedString(row.name);
    const startTime = parseTimeHHMM(row.startTime);
    const endTime = parseTimeHHMM(row.endTime);
    const order = parseInteger(row.order);

    if (!name) errors.push(buildIssue(rowNumber, 'name', 'REQUIRED_FIELD', 'name is required', row));
    if (!startTime) errors.push(buildIssue(rowNumber, 'startTime', 'INVALID_TIME', 'startTime must be in HH:MM format', row));
    if (!endTime) errors.push(buildIssue(rowNumber, 'endTime', 'INVALID_TIME', 'endTime must be in HH:MM format', row));

    if (startTime && endTime) {
        const [sh, sm] = startTime.split(':').map(Number);
        const [eh, em] = endTime.split(':').map(Number);
        const startMinutes = sh * 60 + sm;
        const endMinutes = eh * 60 + em;
        if (startMinutes >= endMinutes) {
            errors.push(buildIssue(rowNumber, 'endTime', 'INVALID_TIME_RANGE', 'endTime must be after startTime', row));
        }
    }

    return {
        normalized: {
            name,
            startTime,
            endTime,
            order: order ?? 0,
            isActive: parseBooleanLoose(row.isActive, true)
        },
        duplicateSignatures: name ? [`period:${name.toLowerCase()}`] : [],
        errors,
        warnings
    };
};

export const normalizeEntityType = (value) => {
    const normalized = toLowerCase(value).replace(/\s+/g, '_');
    return ENTITY_ALIASES[normalized] || null;
};

const escapeCsvCell = (value) => {
    const raw = value === undefined || value === null ? '' : String(value);
    const escaped = raw.replace(/"/g, '""');
    return `"${escaped}"`;
};

export const getImportTemplateDefinition = (entityType) => {
    const normalized = normalizeEntityType(entityType);
    if (!normalized) return null;
    return IMPORT_TEMPLATE_DEFINITIONS[normalized] || null;
};

export const buildFallbackSampleCsv = (entityType) => {
    const definition = getImportTemplateDefinition(entityType);
    if (!definition) return '';
    const headerLine = definition.headers.map((header) => escapeCsvCell(header)).join(',');
    const sampleLine = definition.sampleRow.map((cell) => escapeCsvCell(cell)).join(',');
    return `${headerLine}\n${sampleLine}\n`;
};

export const getEntityDisplayName = (entityType) => ENTITY_DISPLAY_NAMES[entityType] || entityType;

export const extractImportRows = (entityType, payload = {}) => {
    if (Array.isArray(payload.rows)) return payload.rows;
    const keys = LEGACY_ROW_KEYS[entityType] || [];
    for (const key of keys) {
        if (Array.isArray(payload[key])) return payload[key];
    }
    return [];
};

export const normalizeImportOptions = (payload = {}) => {
    const duplicatePolicyRaw = toLowerCase(payload.duplicatePolicy);
    const duplicatePolicy = ['skip', 'update', 'error'].includes(duplicatePolicyRaw)
        ? duplicatePolicyRaw
        : 'skip';
    const strictMode = parseBooleanLoose(payload.strictMode ?? payload.strict ?? false, false) === true;
    const previewLimit = parseInteger(payload.sampleLimit);

    return {
        duplicatePolicy,
        strictMode,
        sampleLimit: previewLimit && previewLimit > 0 ? Math.min(previewLimit, 25) : 10
    };
};

export const normalizeRowByEntity = (entityType, row, { rowNumber, context = {} }) => {
    switch (entityType) {
        case 'students':
            return normalizeStudentsRow(row, rowNumber, context);
        case 'standards':
            return normalizeStandardsRow(row, rowNumber);
        case 'subjects':
            return normalizeSubjectsRow(row, rowNumber);
        case 'teachers':
            return normalizeTeachersRow(row, rowNumber);
        case 'classes':
            return normalizeClassesRow(row, rowNumber, context);
        case 'rooms':
            return normalizeRoomsRow(row, rowNumber);
        case 'timetable_periods':
            return normalizeTimetablePeriodsRow(row, rowNumber);
        default:
            return {
                normalized: {},
                duplicateSignatures: [],
                errors: [buildIssue(rowNumber, 'row', 'UNSUPPORTED_ENTITY', `Unsupported entityType "${entityType}"`, row)],
                warnings: []
            };
    }
};

export const createIssue = buildIssue;
