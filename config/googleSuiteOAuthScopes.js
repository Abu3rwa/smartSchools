import { CLASSROOM_EMAIL_SCOPE, CLASSROOM_SCOPES } from './classroomConfig.js';
import { GOOGLE_FORMS_SCOPES } from './googleFormsConfig.js';

export const GOOGLE_SUITE_SCOPES = Object.freeze([...new Set([
    ...CLASSROOM_SCOPES,
    ...GOOGLE_FORMS_SCOPES,
    CLASSROOM_EMAIL_SCOPE,
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/userinfo.profile'
])]);

export const GOOGLE_GMAIL_MODIFY_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
