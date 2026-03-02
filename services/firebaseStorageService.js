import { storage } from '../config/firebase.js';

/**
 * Upload a file to Firebase Storage
 * @param {Buffer} fileBuffer - The buffer from multer
 * @param {string} mimetype - File mimetype
 * @param {string} destinationPath - Path inside the bucket
 * @returns {Promise<string>} Public URL of the uploaded file
 */
export const uploadFile = async (fileBuffer, mimetype, destinationPath) => {
    if (!storage) throw new Error('Firebase Storage is not configured.');

    const bucket = storage.bucket();
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
        const bucket = storage.bucket();
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
    if (!storage) throw new Error('Firebase Storage is not configured.');

    const bucket = storage.bucket();
    const file = bucket.file(destinationPath);

    const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    });

    return url;
};
