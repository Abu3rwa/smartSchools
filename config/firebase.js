import admin from 'firebase-admin';

// Initialize only once
if (!admin.apps.length) {
    try {
        const serviceAccountConfig = {
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        };

        if (serviceAccountConfig.projectId && serviceAccountConfig.clientEmail && serviceAccountConfig.privateKey) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccountConfig),
                storageBucket: process.env.FIREBASE_STORAGE_BUCKET
            });
            console.log('Firebase Admin initialized successfully.');
        } else {
            console.warn('Firebase Admin is not fully configured (missing env vars).');
        }
    } catch (error) {
        console.error('Firebase Admin initialization error', error.stack);
    }
}

export const storage = admin.apps.length ? admin.storage() : null;
export default admin;
