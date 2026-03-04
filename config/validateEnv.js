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
  'CLIENT_URL',
  'JWT_EXPIRE',
  'GOOGLE_REDIRECT_URI',
  'GOOGLE_LOGIN_REDIRECT_URI',
  'RUN_ATTENDANCE_REMINDER_JOB',
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

  if (warnings.length > 0) {
    logger.warn('Optional environment variables not set (using defaults):', warnings.join(', '));
  }

  logger.info('Environment validation passed');
}
