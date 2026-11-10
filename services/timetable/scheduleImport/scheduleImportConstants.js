export const PROMPT_VERSION = 'timetable_schedule_import_v1';

export const WEEKDAY_NAMES = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
];

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const MAX_PDF_PAGES = 8;
export const PDF_PARSE_TIMEOUT_MS = 20000;
export const MAX_TEACHER_SHEET_CELLS = 60;
export const MAX_CLASS_SHEET_CELLS = 200;
export const MAX_COMMIT_ROWS = 200;
export const MAX_SUBJECTS_TO_CREATE = 20;
export const MAX_SUBJECT_CANDIDATES = 300;
export const MIN_CONFIDENT_CELL = 0.5;
export const MAX_CELL_TITLE_CHARS = 160;
export const MAX_CELL_REASON_CHARS = 240;
export const MAX_SUBJECT_NAME_CHARS = 120;
export const MAX_SUBJECT_CODE_CHARS = 20;

export const CELL_KINDS = ['class', 'meeting', 'duty', 'empty'];

export const CELL_STATUS = {
    READY: 'ready',
    WILL_CREATE_SUBJECT: 'will_create_subject',
    NEEDS_DECISION: 'needs_decision',
    NEEDS_CLASS: 'needs_class',
    NEEDS_PERIOD: 'needs_period',
    SKIPPED: 'skipped',
    EMPTY: 'empty'
};
