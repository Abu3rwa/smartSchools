import fs from 'node:fs/promises';
import path from 'node:path';

const enDir = path.resolve('src/i18n/locales/en');
const arDir = path.resolve('src/i18n/locales/ar');

const flattenKeys = (input, parent = '') => {
    const output = [];
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        return output;
    }

    for (const [key, value] of Object.entries(input)) {
        const nextKey = parent ? `${parent}.${key}` : key;
        output.push(nextKey);
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            output.push(...flattenKeys(value, nextKey));
        }
    }

    return output;
};

const readJson = async (filePath) => {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
};

const run = async () => {
    const enFiles = (await fs.readdir(enDir)).filter((file) => file.endsWith('.json'));
    const arFiles = new Set((await fs.readdir(arDir)).filter((file) => file.endsWith('.json')));

    const errors = [];

    for (const file of enFiles) {
        const enFilePath = path.join(enDir, file);
        const arFilePath = path.join(arDir, file);

        if (!arFiles.has(file)) {
            errors.push(`Missing Arabic namespace file: ${file}`);
            continue;
        }

        const enJson = await readJson(enFilePath);
        const arJson = await readJson(arFilePath);

        const enKeys = new Set(flattenKeys(enJson));
        const arKeys = new Set(flattenKeys(arJson));

        const missingInAr = [...enKeys].filter((key) => !arKeys.has(key));
        const extraInAr = [...arKeys].filter((key) => !enKeys.has(key));

        if (missingInAr.length > 0) {
            errors.push(
                `Missing keys in ar/${file}: ${missingInAr.join(', ')}`
            );
        }

        if (extraInAr.length > 0) {
            errors.push(
                `Extra keys in ar/${file}: ${extraInAr.join(', ')}`
            );
        }
    }

    for (const file of arFiles) {
        if (!enFiles.includes(file)) {
            errors.push(`Extra Arabic namespace file without English pair: ${file}`);
        }
    }

    if (errors.length > 0) {
        console.error('i18n locale parity check failed:');
        for (const error of errors) {
            console.error(`- ${error}`);
        }
        process.exit(1);
    }

    console.log(`i18n locale parity check passed for ${enFiles.length} namespace files.`);
};

run().catch((error) => {
    console.error('Failed to run i18n locale parity check:', error);
    process.exit(1);
});
