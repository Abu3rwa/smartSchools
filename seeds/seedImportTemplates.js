import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import ImportTemplate from '../models/ImportTemplate.js';
import User from '../models/User.js';
import { sanitizeCsvFilename } from '../services/import/importTemplateService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..', '..');
const csvSamplesDir = path.join(rootDir, 'csvFiles');
const templateStorageDir = path.join(rootDir, 'server', 'uploads', 'import-templates');

const SAMPLE_MAP = {
    students: 'sample_students_import.csv',
    teachers: 'sample_teachers_import.csv',
    classes: 'sample_classes_import.csv',
    subjects: 'sample_subjects_import.csv',
    standards: 'sample_standards_import.csv',
    rooms: 'sample_rooms_import.csv',
    timetable_periods: 'sample_timetable_periods_import.csv'
};

const main = async () => {
    await connectDB();
    await fs.mkdir(templateStorageDir, { recursive: true });

    const actor = await User.findOne({ role: 'super_admin' }).setOptions({ skipTenantFilter: true }).lean();
    if (!actor) {
        throw new Error('Cannot seed import templates: no super_admin user found');
    }

    for (const [entityType, sampleFilename] of Object.entries(SAMPLE_MAP)) {
        const sourcePath = path.join(csvSamplesDir, sampleFilename);
        try {
            await fs.access(sourcePath);
        } catch {
            // Skip missing sample files.
            continue;
        }

        const alreadyExists = await ImportTemplate.findOne({ entityType, status: 'active' }).lean();
        if (alreadyExists) continue;

        const sanitizedName = sanitizeCsvFilename(sampleFilename, entityType);
        const storedName = `${entityType}-seed-${Date.now()}-${sanitizedName}`;
        const targetPath = path.join(templateStorageDir, storedName);

        await fs.copyFile(sourcePath, targetPath);

        await ImportTemplate.create({
            entityType,
            filePath: targetPath,
            fileUrl: null,
            filename: sanitizedName,
            mimeType: 'text/csv',
            status: 'active',
            version: 'v1-seed',
            notes: 'Seeded from repository sample CSV',
            changelog: 'Initial seeded template',
            createdBy: actor._id,
            updatedBy: actor._id
        });

        await ImportTemplate.updateMany(
            { entityType, status: 'active', filename: { $ne: sanitizedName } },
            { $set: { status: 'inactive', updatedBy: actor._id } }
        );
    }

    process.exit(0);
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
