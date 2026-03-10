import fs from 'node:fs/promises';
import path from 'node:path';

const requiredFiles = [
  'src/i18n/locales/en/landing.page.json',
  'src/i18n/locales/ar/landing.page.json',
];

const requiredPaths = [
  'ui',
];

const getAtPath = (source, keyPath) => {
  return keyPath.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), source);
};

const run = async () => {
  const errors = [];

  for (const file of requiredFiles) {
    const fullPath = path.resolve(file);
    let parsed;

    try {
      const raw = await fs.readFile(fullPath, 'utf8');
      parsed = JSON.parse(raw);
    } catch (error) {
      errors.push(`Failed to read ${file}: ${error.message}`);
      continue;
    }

    for (const keyPath of requiredPaths) {
      if (typeof getAtPath(parsed, keyPath) === 'undefined') {
        errors.push(`Missing ${keyPath} in ${file}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error('Landing namespace check failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('Landing namespace check passed for EN/AR files.');
};

run().catch((error) => {
  console.error('Failed to run landing namespace check:', error);
  process.exit(1);
});
