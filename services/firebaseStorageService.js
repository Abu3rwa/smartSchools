import { storage } from '../config/firebase.js';

let resolvedBucketName = null;

const unique = (items) => [...new Set(items.filter(Boolean))];

const parseStoragePath = (fileRef = '', bucketName = '') => {
    const value = String(fileRef || '').trim();
    if (!value) return '';

    if (value.startsWith('gs://')) {
        const withoutPrefix = value.slice('gs://'.length);
        const slashIndex = withoutPrefix.indexOf('/');
        if (slashIndex === -1) return '';
        return withoutPrefix.slice(slashIndex + 1);
    }

    if (bucketName) {
        const bucketPrefix = `https://storage.googleapis.com/${bucketName}/`;
        if (value.startsWith(bucketPrefix)) {
            return value.slice(bucketPrefix.length);
        }
    }

    return value;
};

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
 * Upload a private file to Firebase Storage (no public ACL)
 * @param {Buffer} fileBuffer
 * @param {string} mimetype
 * @param {string} destinationPath
 * @returns {Promise<{ fileRef: string, storagePath: string }>} gs:// reference + normalized path
 */
export const uploadPrivateFile = async (fileBuffer, mimetype, destinationPath) => {
    const bucket = await getStorageBucket();
    const file = bucket.file(destinationPath);

    await file.save(fileBuffer, {
        metadata: {
            contentType: mimetype
        }
    });

    return {
        fileRef: `gs://${bucket.name}/${destinationPath}`,
        storagePath: destinationPath
    };
};

/**
 * Delete a file from Firebase Storage using its public URL
 * @param {string} fileUrl - Public URL of the generated file
 */
export const deleteFile = async (fileUrl) => {
    if (!storage || !fileUrl) return;

    try {
        const bucket = await getStorageBucket();
        const destinationPath = parseStoragePath(fileUrl, bucket.name);
        if (!destinationPath) return;
        const file = bucket.file(destinationPath);
        await file.delete();
    } catch (error) {
        console.warn(`Failed to delete file from Firebase: ${fileUrl}`, error.message);
    }
};

/**
 * Generate a signed URL for private files
 * @param {string} destinationPath 
 * @returns {Promise<string>}
 */
export const getSignedUrl = async (destinationPath, expiresInMs = 15 * 60 * 1000) => {
    const bucket = await getStorageBucket();
    const normalizedPath = parseStoragePath(destinationPath, bucket.name);
    if (!normalizedPath) {
        throw new Error('Invalid storage path for signed URL generation');
    }
    const file = bucket.file(normalizedPath);

    const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + expiresInMs,
    });

    return url;
};

/**
 * Download a file from Firebase Storage
 * @param {string} fileRefOrPath
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
export const downloadFile = async (fileRefOrPath) => {
    const bucket = await getStorageBucket();
    const normalizedPath = parseStoragePath(fileRefOrPath, bucket.name);
    if (!normalizedPath) {
        throw new Error('Invalid storage path for download');
    }
    const file = bucket.file(normalizedPath);
    const [buffer] = await file.download();
    const [metadata] = await file.getMetadata();

    return {
        buffer,
        contentType: metadata?.contentType || 'application/octet-stream'
    };
};
