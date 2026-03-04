import { storage } from '../config/firebase.js';

let resolvedBucketName = null;

const unique = (items) => [...new Set(items.filter(Boolean))];

const getBucketCandidates = () => {
    const configuredBucket = String(process.env.FIREBASE_STORAGE_BUCKET || '').trim();
    if (configuredBucket) return [configuredBucket];

    const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim()
        || String(storage?.app?.options?.projectId || '').trim();
    if (!projectId) return [];

    return unique([
        storage?.app?.options?.storageBucket,
        `${projectId}.appspot.com`,
        `${projectId}.firebasestorage.app`
    ]);
};

const getStorageBucket = async () => {
    if (!storage) {
        throw new Error('Firebase Storage is not configured. Check Firebase credentials and env loading.');
    }

    if (resolvedBucketName) {
        return storage.bucket(resolvedBucketName);
    }

    const candidates = getBucketCandidates();
    if (candidates.length === 0) {
        throw new Error(
            'Firebase Storage bucket is not configured. Set FIREBASE_STORAGE_BUCKET in your server environment.'
        );
    }

    // If explicitly configured, trust it and fail on upload if invalid.
    if (process.env.FIREBASE_STORAGE_BUCKET) {
        resolvedBucketName = candidates[0];
        return storage.bucket(resolvedBucketName);
    }

    // Otherwise detect a valid default bucket from known Firebase naming patterns.
    for (const candidate of candidates) {
        try {
            const bucket = storage.bucket(candidate);
            const [exists] = await bucket.exists();
            if (exists) {
                resolvedBucketName = candidate;
                return bucket;
            }
        } catch {
            // Try next candidate
        }
    }

    throw new Error(
        `Firebase Storage bucket was not found for project "${process.env.FIREBASE_PROJECT_ID || storage?.app?.options?.projectId || 'unknown'}". `
        + 'Set FIREBASE_STORAGE_BUCKET explicitly in your server environment.'
    );
};

/**
 * Upload a file to Firebase Storage
 * @param {Buffer} fileBuffer - The buffer from multer
 * @param {string} mimetype - File mimetype
 * @param {string} destinationPath - Path inside the bucket
 * @returns {Promise<string>} Public URL of the uploaded file
 */
export const uploadFile = async (fileBuffer, mimetype, destinationPath) => {
    const bucket = await getStorageBucket();
    const file = bucket.file(destinationPath);

    await file.save(fileBuffer, {
        metadata: {
            contentType: mimetype
        }
    });

    await file.makePublic();

    // Construct public URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destinationPath}`;
    return publicUrl;
};

/**
 * Delete a file from Firebase Storage using its public URL
 * @param {string} fileUrl - Public URL of the generated file
 */
export const deleteFile = async (fileUrl) => {
    if (!storage || !fileUrl) return;

    try {
        const bucket = await getStorageBucket();
        // Parse out the destination path from https://storage.googleapis.com/bucket-name/destination/path
        const bucketPrefix = `https://storage.googleapis.com/${bucket.name}/`;
        if (fileUrl.startsWith(bucketPrefix)) {
            const destinationPath = fileUrl.replace(bucketPrefix, '');
            const file = bucket.file(destinationPath);
            await file.delete();
        }
    } catch (error) {
        console.warn(`Failed to delete file from Firebase: ${fileUrl}`, error.message);
    }
};

/**
 * Generate a signed URL for private files
 * @param {string} destinationPath 
 * @returns {Promise<string>}
 */
export const getSignedUrl = async (destinationPath) => {
    const bucket = await getStorageBucket();
    const file = bucket.file(destinationPath);

    const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    });

    return url;
};
