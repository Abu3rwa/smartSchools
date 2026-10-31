import mongoose from 'mongoose';

const demoRequestSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120
    },
    schoolName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 160
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        maxlength: 254
    },
    phone: {
        type: String,
        trim: true,
        maxlength: 40,
        default: ''
    },
    role: {
        type: String,
        trim: true,
        maxlength: 80,
        default: ''
    },
    message: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: ''
    },
    locale: {
        type: String,
        trim: true,
        default: 'en'
    },
    status: {
        type: String,
        enum: ['new', 'contacted', 'scheduled', 'closed'],
        default: 'new'
    },
    notes: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: ''
    },
    handledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    handledAt: {
        type: Date
    }
}, {
    timestamps: true
});

demoRequestSchema.index({ status: 1, createdAt: -1 });
demoRequestSchema.index({ createdAt: -1 });

const DemoRequest = mongoose.model('DemoRequest', demoRequestSchema);

export default DemoRequest;
