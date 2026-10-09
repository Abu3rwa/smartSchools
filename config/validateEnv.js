import logger from '../utils/logger.js';

const requiredEnvVars = [
  'MONGODB_URI',
  'JWT_SECRET',
  'GEMINI_API_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET'
];

const optionalEnvVars = [
  'PORT',
  'NODE_ENV',
  'PORTAL_URL',
  'CLIENT_URL',
  'JWT_EXPIRE',
  'GOOGLE_REDIRECT_URI',
  'GOOGLE_LOGIN_REDIRECT_URI',
  'GOOGLE_CLASSROOM_ENABLED',
  'GOOGLE_CLASSROOM_REDIRECT_URI',
  'GOOGLE_CLASSROOM_SCHOOL_IDS',
  'ALLOW_LOCAL_SERVICE_ACCOUNT',
  'RUN_NEWSLETTER_ISSUE_SCHEDULER',
  'RUN_SUBSTITUTION_EXPIRY_JOB'
];

export function validateEnvironment() {
  const missing = [];
  const warnings = [];

  for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    logger.error('Missing required environment variables:', missing.join(', '));
    logger.error('Please check your .env file and ensure all required variables are set.');
    process.exit(1);
  }

  // BE-003: Enforce cryptographic strength of JWT_SECRET
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 20) {
    logger.error('JWT_SECRET must be at least 20 characters for cryptographic security');
    process.exit(1);
  }

  for (const varName of optionalEnvVars) {
    if (!process.env[varName]) {
      warnings.push(varName);
    }
  }

  const hasV1Config = Boolean(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );
  const configuredFcmApiVersion = String(process.env.FCM_API_VERSION || '').trim().toLowerCase();
  const fcmApiVersion = (configuredFcmApiVersion === 'v1' || configuredFcmApiVersion === 'legacy')
    ? configuredFcmApiVersion
    : (hasV1Config ? 'v1' : 'legacy');

  if (fcmApiVersion === 'v1') {
    if (!hasV1Config) {
      warnings.push('FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY');
    }
    if (!process.env.FIREBASE_STORAGE_BUCKET) {
      warnings.push('FIREBASE_STORAGE_BUCKET (recommended for image uploads)');
    }
  } else {
    const hasLegacyPushKey = Boolean(
      process.env.FCM_SERVER_KEY ||
      process.env.FIREBASE_SERVER_KEY ||
      process.env.FIREBASE_LEGACY_SERVER_KEY
    );
    if (!hasLegacyPushKey) {
      warnings.push('FCM_SERVER_KEY (or FIREBASE_SERVER_KEY)');
    }
  }

  if (String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production') {
    const allowLocalServiceAccount = String(process.env.ALLOW_LOCAL_SERVICE_ACCOUNT || '').trim().toLowerCase();
    if (allowLocalServiceAccount === 'true') {
      warnings.push('ALLOW_LOCAL_SERVICE_ACCOUNT should be false/empty in production');
    }

    const requiredProdVars = ['CLIENT_URL', 'GOOGLE_LOGIN_REDIRECT_URI'];
    for (const varName of requiredProdVars) {
      if (!process.env[varName]) {
        missing.push(varName);
      }
    }

    const oauthUris = ['GOOGLE_LOGIN_REDIRECT_URI', 'GOOGLE_REDIRECT_URI'];
    for (const varName of oauthUris) {
      const value = String(process.env[varName] || '').trim().toLowerCase();
      if (!value) continue;

      if (value.includes('localhost') || value.includes('127.0.0.1')) {
        warnings.push(`${varName} points to localhost in production`);
      }
    }

    // The Classroom callback must be exact, public and HTTPS, or Google will reject the sign-in.
    if (String(process.env.GOOGLE_CLASSROOM_ENABLED || '').trim().toLowerCase() === 'true') {
      const classroomUri = String(process.env.GOOGLE_CLASSROOM_REDIRECT_URI || '').trim();
      if (!classroomUri) {
        logger.error('GOOGLE_CLASSROOM_REDIRECT_URI is required in production when GOOGLE_CLASSROOM_ENABLED=true');
        process.exit(1);
      }
      if (!/^https:\/\//i.test(classroomUri) || /localhost|127\.0\.0\.1/i.test(classroomUri)) {
        logger.error('GOOGLE_CLASSROOM_REDIRECT_URI must be a public https URL in production');
        process.exit(1);
      }
      // Without a key, secretCrypto stores tokens as plain text.
      if (!process.env.APP_SECRET_ENCRYPTION_KEY && !process.env.ENCRYPTION_KEY) {
        logger.error('APP_SECRET_ENCRYPTION_KEY is required in production when GOOGLE_CLASSROOM_ENABLED=true');
        process.exit(1);
      }
    }
  }

  if (warnings.length > 0) {
    logger.warn('Optional environment variables not set (using defaults):', warnings.join(', '));
  }

  logger.info('Environment validation passed');
}
