// drive.file only exposes files this app itself created — the minimal scope
// for uploading assignment attachments on a teacher's behalf. It is never
// added to the shared Classroom/Forms/Gmail suite or the curriculum import.
export const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const GOOGLE_DRIVE_FILE_SCOPES = Object.freeze([
    GOOGLE_DRIVE_FILE_SCOPE,
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
]);

export const hasDriveFileScope = (scopes) =>
    Array.isArray(scopes) && scopes.includes(GOOGLE_DRIVE_FILE_SCOPE);