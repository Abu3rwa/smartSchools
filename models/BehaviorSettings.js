import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import {
    BEHAVIOR_COUNTING_MODES,
    BEHAVIOR_VERIFIER_RULES
} from '../constants/behavior.js';

const verifierRuleSchema = new mongoose.Schema({
    taskType: { type: String, required: true },
    rule: { type: String, enum: BEHAVIOR_VERIFIER_RULES, default: 'logging-staff' },
    role: { type: String, default: null }
}, { _id: false });

const behaviorSettingsSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, unique: true },

    // Feature flag. Off means every /api/behavior route except the settings
    // read/write pair answers 404 and nothing is scheduled or sent.
    enabled: { type: Boolean, default: false },

    counting: {
        mode: { type: String, enum: BEHAVIOR_COUNTING_MODES, default: 'school_year' },
        rollingDays: { type: Number, min: 1, max: 366, default: 90 },
        academicYear: { type: String, default: null }
    },

    approval: {
        defaultRequired: { type: Boolean, default: true },
        approverRoles: {
            type: [String],
            default: ['admin', 'department_principal', 'behavior_manager']
        },
        backupApproverRoles: { type: [String], default: ['admin'] },
        reminderIntervalHours: { type: Number, min: 1, max: 168, default: 24 },
        escalationAfterHours: { type: Number, min: 1, max: 720, default: 48 },
        // Fixed false: an approval that times out must never send on its own.
        autoSendOnTimeout: { type: Boolean, default: false, immutable: true }
    },

    cc: {
        roles: { type: [String], default: ['admin'] },
        users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }]
    },

    // Optional pause before an approved (or auto-approved) notification becomes
    // due. The hold defers delivery; it never cancels it.
    sendDelayMinutes: { type: Number, min: 0, max: 240, default: 0 },
    sendDelayMaxMinutes: { type: Number, min: 0, max: 240, default: 240 },

    verifier: {
        defaultRule: { type: String, enum: BEHAVIOR_VERIFIER_RULES, default: 'logging-staff' },
        perTaskType: { type: [verifierRuleSchema], default: [] }
    },

    duplicateWindowMinutes: { type: Number, min: 0, max: 1440, default: 30 },

    apologyMinWords: { type: Number, min: 0, max: 2000, default: 100 },

    seriousIncident: {
        allowedRoles: { type: [String], default: ['admin', 'department_principal', 'behavior_manager'] }
    },

    // The school's half of the send switch. A message leaves only when this is
    // true, the step's approval has cleared, and the deployment-wide
    // BEHAVIOR_EMAIL_DELIVERY gate is on.
    emailDelivery: {
        enabled: { type: Boolean, default: false },
        defaultLanguage: { type: String, enum: ['en', 'ar'], default: 'en' },
        supportedLanguages: { type: [String], default: ['en', 'ar'] }
    },

    substituteAccounts: {
        expiryEnabled: { type: Boolean, default: false },
        expiresAt: { type: Date, default: null }
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

behaviorSettingsSchema.plugin(tenantIsolationPlugin);
behaviorSettingsSchema.set('collection', 'behavior_settings');

export default mongoose.model('BehaviorSettings', behaviorSettingsSchema);
