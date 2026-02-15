import mongoose from 'mongoose';

/**
 * SubRequestToken - Secure expiring single-use tokens for substitute confirm/decline.
 * Only tokenHash is stored; raw token is sent to teacher and never persisted.
 */
const subRequestTokenSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    requestId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SubstitutionRequest',
        required: true,
        index: true
    },
    assignmentId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    periodId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TimetablePeriod',
        required: true
    },
    substituteTeacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    tokenHash: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    expiresAt: {
        type: Date,
        required: true,
        index: true
    },
    usedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

const SubRequestToken = mongoose.model('SubRequestToken', subRequestTokenSchema);
export default SubRequestToken;
