/** Picks the reply recipients. Only the original message decides them; the AI is never asked. */

const ADDRESS = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]{2,}$/;
const MAX_CC = 10;

export const normalizeAddress = (value) => String(value ?? '').trim().toLowerCase();

export const isValidAddress = (value) => {
    const address = normalizeAddress(value);
    return address.length <= 320 && ADDRESS.test(address);
};

/**
 * `to` is the Reply-To address when it is valid, otherwise the sender. Cc is
 * only filled when the teacher asked for it, never includes the teacher or the
 * primary recipient, and is capped so a long thread cannot leak a crowd.
 */
export const resolveRecipients = (email, { includeCc = false, selfAddress = '' } = {}) => {
    const self = normalizeAddress(selfAddress);
    const from = normalizeAddress(email?.fromEmail);
    const replyTo = normalizeAddress(email?.replyToEmail);
    const to = isValidAddress(replyTo) ? replyTo : (isValidAddress(from) ? from : '');

    const cc = [];
    if (includeCc) {
        const candidates = [
            ...(Array.isArray(email?.ccEmails) ? email.ccEmails : []),
            ...(Array.isArray(email?.toEmails) ? email.toEmails : [])
        ].map(normalizeAddress);

        for (const address of new Set(candidates)) {
            if (!isValidAddress(address)) continue;
            if (address === to || address === self) continue;
            cc.push(address);
            if (cc.length === MAX_CC) break;
        }
    }

    return { to: to ? [to] : [], cc };
};

export default { resolveRecipients, isValidAddress, normalizeAddress };
