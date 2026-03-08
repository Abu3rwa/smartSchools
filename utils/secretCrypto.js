import crypto from 'crypto';

const ENCRYPTION_PREFIX = 'enc.v1.';
let cachedKey = null;

const getSecretKey = () => {
    if (cachedKey) return cachedKey;
    const secret = String(
        process.env.APP_SECRET_ENCRYPTION_KEY
        || process.env.ENCRYPTION_KEY
        || ''
    ).trim();
    if (!secret) return null;
    cachedKey = crypto.createHash('sha256').update(secret, 'utf8').digest();
    return cachedKey;
};

export const encryptSecret = (value) => {
    if (value == null || value === '') return value;
    const plainText = String(value);
    if (plainText.startsWith(ENCRYPTION_PREFIX)) return plainText;

    const key = getSecretKey();
    if (!key) return plainText;

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const payload = `${iv.toString('base64')}.${authTag.toString('base64')}.${encrypted.toString('base64')}`;
    return `${ENCRYPTION_PREFIX}${payload}`;
};

export const decryptSecret = (value) => {
    if (value == null || value === '') return value;
    const encoded = String(value);
    if (!encoded.startsWith(ENCRYPTION_PREFIX)) return encoded;

    const key = getSecretKey();
    if (!key) return null;

    try {
        const payload = encoded.slice(ENCRYPTION_PREFIX.length);
        const [ivPart, tagPart, cipherPart] = payload.split('.');
        if (!ivPart || !tagPart || !cipherPart) return null;

        const iv = Buffer.from(ivPart, 'base64');
        const authTag = Buffer.from(tagPart, 'base64');
        const encrypted = Buffer.from(cipherPart, 'base64');

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return plain.toString('utf8');
    } catch {
        return null;
    }
};

export const isEncryptedSecret = (value) => (
    String(value || '').startsWith(ENCRYPTION_PREFIX)
);
