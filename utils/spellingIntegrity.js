const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

export const validateSpellingIntegrityEvent = ({ eventId, eventType, sequence, occurredAt } = {}) => {
    if (typeof eventId !== 'string' || !/^[a-f\d-]{36}$/i.test(eventId)) throw badRequest('A valid eventId is required');
    if (eventType !== 'page_hidden') throw badRequest('Invalid spelling integrity event type');
    if (sequence != null && (!Number.isInteger(sequence) || sequence < 1)) throw badRequest('sequence must be a positive integer');

    const parsedOccurredAt = occurredAt == null ? null : new Date(occurredAt);
    if (occurredAt != null && Number.isNaN(parsedOccurredAt.getTime())) throw badRequest('occurredAt must be a valid date');

    return { eventId, sequence: sequence || null, occurredAt: parsedOccurredAt };
};