import admin from 'firebase-admin';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadServiceAccountFile = () => {
    try {
        const serviceAccountPath = path.resolve(__dirname, '../smile3-service-account.json');
        if (!fs.existsSync(serviceAccountPath)) return null;
        const raw = fs.readFileSync(serviceAccountPath, 'utf8');
        return JSON.parse(raw);
    } catch (error) {
        console.warn('Failed to parse smile3-service-account.json:', error.message);
        return null;
    }
};

// Initialize only once
if (!admin.apps.length) {
    try {
        const serviceAccountFromFile = loadServiceAccountFile();
        const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccountFromFile?.project_id;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || serviceAccountFromFile?.client_email;
        const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY || serviceAccountFromFile?.private_key;
        const privateKey = privateKeyRaw?.replace(/\\n/g, '\n');
        const storageBucket = process.env.FIREBASE_STORAGE_BUCKET
            || serviceAccountFromFile?.storage_bucket
            || null;

        const serviceAccountConfig = {
            projectId,
            clientEmail,
            privateKey,
        };

        if (serviceAccountConfig.projectId && serviceAccountConfig.clientEmail && serviceAccountConfig.privateKey) {
            const initializeOptions = {
                credential: admin.credential.cert(serviceAccountConfig),
            };
            if (storageBucket) {
                initializeOptions.storageBucket = storageBucket;
            }

            admin.initializeApp(initializeOptions);
            console.log('Firebase Admin initialized successfully.');
            if (!storageBucket) {
                console.warn('FIREBASE_STORAGE_BUCKET is not set; bucket resolution will use project-based fallback.');
            }
        } else {
            console.warn('Firebase Admin is not fully configured (missing env vars).');
        }
    } catch (error) {
        console.error('Firebase Admin initialization error', error.stack);
    }
}

export const storage = admin.apps.length ? admin.storage() : null;
export default admin;
