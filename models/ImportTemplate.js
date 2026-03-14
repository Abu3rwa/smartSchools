import mongoose from 'mongoose';

const importTemplateSchema = new mongoose.Schema({
    entityType: {
        type: String,
        enum: ['students', 'standards', 'subjects', 'teachers', 'classes', 'rooms', 'timetable_periods'],
        required: true,
        index: true
    },
    filePath: {
        type: String,
        required: true,
        trim: true
    },
    fileUrl: {
        type: String,
        trim: true
    },
    filename: {
        type: String,
        required: true,
        trim: true
    },
    mimeType: {
        type: String,
        required: true,
        trim: true
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'inactive',
        index: true
    },
    version: {
        type: String,
        default: 'v1',
        trim: true
    },
    notes: {
        type: String,
        default: '',
        trim: true,
        maxlength: 2000
    },
    changelog: {
        type: String,
        default: '',
        trim: true,
        maxlength: 4000
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

importTemplateSchema.index({ entityType: 1, status: 1, updatedAt: -1 });

const ImportTemplate = mongoose.model('ImportTemplate', importTemplateSchema);
export default ImportTemplate;
