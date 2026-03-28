import { INITIAL_STANDARD_FORM_DATA } from '../constants';

export const createInitialStandardFormData = () => {
    return { ...INITIAL_STANDARD_FORM_DATA };
};

export const toUppercaseCode = (value) => {
    return String(value || '').toUpperCase();
};

export const buildStandardFormDataFromStandard = (standard) => {
    return {
        code: standard.code,
        name: standard.name,
        description: standard.description || '',
        subject: standard.subject?._id || standard.subject || '',
        gradeLevel: standard.gradeLevel || '',
        category: standard.category || '',
        masteryThreshold: standard.masteryThreshold || 80,
        masteryMinQuestions: standard.masteryMinQuestions || 5
    };
};

const getEntityId = (entity) => String(entity?._id || entity?.id || entity || '');

const getClassTeacherUserId = (schoolClass) =>
    getEntityId(schoolClass?.classTeacher?.user || schoolClass?.classTeacher?.user?._id);

const getSubjectTeacherUserId = (subjectEntry) =>
    getEntityId(
        subjectEntry?.teacher?.user ||
        subjectEntry?.teacher?.user?._id ||
        subjectEntry?.teacher
    );

export const getScopedClassSubjects = (schoolClass, isTeacher, userId) => {
    const classSubjectsRaw = Array.isArray(schoolClass?.subjects) ? schoolClass.subjects : [];

    if (!isTeacher) {
        return classSubjectsRaw
            .map((entry) => entry?.subject)
            .filter(Boolean);
    }

    const userIdValue = getEntityId(userId);
    const isClassTeacher = getClassTeacherUserId(schoolClass) === userIdValue;

    const scopedEntries = classSubjectsRaw.filter((entry) => {
        if (!entry?.subject) return false;
        if (isClassTeacher) return true;
        return getSubjectTeacherUserId(entry) === userIdValue;
    });

    const seen = new Set();
    return scopedEntries
        .map((entry) => entry.subject)
        .filter((subject) => {
            const subjectId = getEntityId(subject);
            if (!subjectId || seen.has(subjectId)) return false;
            seen.add(subjectId);
            return true;
        });
};

export const getSubjectsForStandardsFilter = ({ classes, subjects, filterClass, isTeacher, userId }) => {
    const allSubjects = Array.isArray(subjects) ? subjects : [];
    if (!filterClass) {
        return allSubjects;
    }

    const selectedClass = Array.isArray(classes)
        ? classes.find((schoolClass) => getEntityId(schoolClass) === String(filterClass))
        : null;

    if (!selectedClass) {
        return [];
    }

    return getScopedClassSubjects(selectedClass, isTeacher, userId).sort((left, right) => {
        const leftName = String(left?.name || '');
        const rightName = String(right?.name || '');
        return leftName.localeCompare(rightName);
    });
};

export const filterStandardsList = (
    standards,
    searchTerm,
    filterSubject,
    filterGrade,
    filterClass,
    classes,
    options = {}
) => {
    const isTeacher = options?.isTeacher === true;
    const userId = options?.userId;
    const selectedClass = Array.isArray(classes)
        ? classes.find((schoolClass) => getEntityId(schoolClass) === String(filterClass || ''))
        : null;
    const selectedClassGrade = selectedClass?.grade != null ? Number(selectedClass.grade) : null;
    const selectedClassSubjectIds = new Set(
        getScopedClassSubjects(selectedClass, isTeacher, userId).map((subject) => getEntityId(subject))
    );

    return standards.filter((standard) => {
        const searchValue = searchTerm.toLowerCase();
        const matchSearch =
            !searchTerm ||
            standard.code?.toLowerCase().includes(searchValue) ||
            standard.name?.toLowerCase().includes(searchValue) ||
            standard.description?.toLowerCase().includes(searchValue);
        const standardSubjectId = getEntityId(standard.subject);
        const matchSubject =
            !filterSubject || standardSubjectId === String(filterSubject);
        const matchGrade = !filterGrade || standard.gradeLevel === parseInt(filterGrade);

        let matchClass = true;
        if (filterClass) {
            if (!selectedClass) {
                matchClass = false;
            } else {
                const hasSubjectMatch = selectedClassSubjectIds.has(standardSubjectId);
                const hasGradeMatch =
                    selectedClassGrade == null ||
                    Number(standard.gradeLevel) === selectedClassGrade;
                matchClass = hasSubjectMatch && hasGradeMatch;
            }
        }

        return matchSearch && matchSubject && matchGrade && matchClass;
    });
};

const parseCsvLine = (line) => {
    const delimiter = line.includes('\t') ? '\t' : ',';
    const out = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                cur += '"';
                i++;
                continue;
            }
            inQuotes = !inQuotes;
            continue;
        }
        if (!inQuotes && ch === delimiter) {
            out.push(cur);
            cur = '';
            continue;
        }
        cur += ch;
    }
    out.push(cur);

    return out.map((value) => value.trim());
};

export const parseStandardsImportText = (text, filterGrade, importSubjectId) => {
    const lines = text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length === 0) return [];

    const firstRow = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
    const hasHeader =
        firstRow.includes('code') &&
        firstRow.includes('name') &&
        firstRow.includes('description');

    let headerMap = null;
    let dataLines = lines;

    if (hasHeader) {
        headerMap = {};
        firstRow.forEach((header, index) => {
            headerMap[header] = index;
        });
        dataLines = lines.slice(1);
    }

    return dataLines
        .map((line) => {
            const parts = parseCsvLine(line);
            if (parts.length < 3) return null;

            const get = (key, fallbackIdx) => {
                const idx = headerMap?.[key];
                const value = (idx !== undefined ? parts[idx] : parts[fallbackIdx]) ?? '';
                return String(value).trim();
            };

            const gradeStr = get('grade', 3) || get('gradelevel', 3) || get('grade_level', 3);
            const masteryThresholdStr = get('masterythreshold', 5) || get('mastery_threshold', 5);
            const masteryMinQuestionsStr =
                get('masteryminquestions', 6) || get('mastery_min_questions', 6);

            return {
                code: get('code', 0),
                name: get('name', 1),
                description: get('description', 2),
                gradeLevel: gradeStr ? parseInt(gradeStr) : parseInt(filterGrade) || 1,
                category: get('category', 4) || '',
                masteryThreshold: masteryThresholdStr ? parseInt(masteryThresholdStr) : undefined,
                masteryMinQuestions: masteryMinQuestionsStr
                    ? parseInt(masteryMinQuestionsStr)
                    : undefined,
                subject: importSubjectId
            };
        })
        .filter(Boolean);
};
