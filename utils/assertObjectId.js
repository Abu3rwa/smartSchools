import mongoose from 'mongoose';

export const assertObjectId = (value, label) => {
    const id = String(value ?? '').trim();
    if (!/^[0-9a-fA-F]{24}$/.test(id) || !mongoose.isValidObjectId(id)) {
        const error = new Error(`Invalid ${label}.`);
        error.statusCode = 400;
        error.code = 'INVALID_ID';
        throw error;
    }
    return id;
};
