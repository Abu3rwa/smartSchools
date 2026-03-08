import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Initialize only once
if (!admin.apps.length) {
    try {
        const projectId = process.env.FIREBASE_PROJECT_ID || null;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || null;
        const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY || null;
        const privateKey = privateKeyRaw?.replace(/\\n/g, '\n');
        const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || null;

        const serviceAccountConfig = {
            projectId,
            clientEmail,
            privateKey,
        };

        let credential = null;
        if (serviceAccountConfig.projectId && serviceAccountConfig.clientEmail && serviceAccountConfig.privateKey) {
            credential = admin.credential.cert(serviceAccountConfig);
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_USE_APPLICATION_DEFAULT === 'true') {
            credential = admin.credential.applicationDefault();
        } else {
            console.warn('Firebase Admin is not fully configured. Set FIREBASE_* env vars or GOOGLE_APPLICATION_CREDENTIALS.');
        }

        if (credential) {
            const initializeOptions = { credential };
            if (storageBucket) initializeOptions.storageBucket = storageBucket;
            admin.initializeApp(initializeOptions);
            console.log('Firebase Admin initialized successfully.');
        }
    } catch (error) {
        console.error('Firebase Admin initialization error', error.stack);
    }
}

export const storage = admin.apps.length ? admin.storage() : null;
export default admin;
