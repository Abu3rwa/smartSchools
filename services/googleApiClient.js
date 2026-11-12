import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
let cached;

// Synchronous lazy require: keeps callers non-async and returns the same
// object identity as `import { google } from 'googleapis'` (CJS cache),
// so test mocks on `google` keep working.
export const getGoogle = () => (cached ??= req('googleapis').google);

export const isGoogleConfigured = () => Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);