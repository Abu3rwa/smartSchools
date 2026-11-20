import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

export const SUPPORT_SETTINGS_DEFAULTS = Object.freeze({
    enabled: false,
    label: 'support',
    roles: ['teacher', 'counselor', 'nurse'],
    approvalMode: 'owner_release',
    ownerFallback: 'homeroom',
    caseloadCap: 5,
    studentAgeMin: 10,
    studentAgeMax: 18,
    defaultSurveyLength: 6,
    maxSurveyLength: 10,
    reminderDays: 3,
    reminderCount: 2,
    acknowledgmentDays: 2,
    escalationBackup: null,
    autoSuggestions: false,
    aiPlanDrafts: true,
    suggestionWindowDays: 45,
    suggestionAttendanceRate: 85,
    suggestionFailingGrades: 2,
    suggestionBehaviorIncidents: 3,
    severityCadence: { watch: 60, support: 30, intensive: 14 },
    notifications: {
        invitation: true,
        reminder: true,
        reminderEscalation: true,
        acknowledgmentEscalation: true,
        planPublished: true,
        closure: true,
    },
    integrations: {
        parentUpdates: true,
        newsletter: false,
        observations: false,
    },
});

export const SUPPORT_SETTINGS_ROLES = ['teacher', 'counselor', 'nurse', 'admin'];

const notificationSettingsSchema = new mongoose.Schema({
    invitation: { type: Boolean, default: true },
    reminder: { type: Boolean, default: true },
    reminderEscalation: { type: Boolean, default: true },
    acknowledgmentEscalation: { type: Boolean, default: true },
    planPublished: { type: Boolean, default: true },
    closure: { type: Boolean, default: true },
}, { _id: false });

const integrationSettingsSchema = new mongoose.Schema({
    parentUpdates: { type: Boolean, default: true },
    newsletter: { type: Boolean, default: false },
    observations: { type: Boolean, default: false },
}, { _id: false });

const cadenceSchema = new mongoose.Schema({
    watch: { type: Number, default: 60, min: 1, max: 365 },
    support: { type: Number, default: 30, min: 1, max: 365 },
    intensive: { type: Number, default: 14, min: 1, max: 365 },
}, { _id: false });

const supportSettingsSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, unique: true },
    enabled: { type: Boolean, default: SUPPORT_SETTINGS_DEFAULTS.enabled },
    label: {
        type: String,
        enum: ['support', 'intervention', 'wellbeing', 'learning_support'],
        default: SUPPORT_SETTINGS_DEFAULTS.label,
    },
    roles: { type: [String], default: () => [...SUPPORT_SETTINGS_DEFAULTS.roles] },
    approvalMode: {
        type: String,
        enum: ['owner_release', 'counselor_approve', 'admin_approve'],
        default: SUPPORT_SETTINGS_DEFAULTS.approvalMode,
    },
    ownerFallback: {
        type: String,
        enum: ['homeroom', 'nominator', 'counselor', 'admin'],
        default: SUPPORT_SETTINGS_DEFAULTS.ownerFallback,
    },
    caseloadCap: { type: Number, default: SUPPORT_SETTINGS_DEFAULTS.caseloadCap, min: 0, max: 50 },
    studentAgeMin: { type: Number, default: SUPPORT_SETTINGS_DEFAULTS.studentAgeMin, min: 0, max: 25 },
    studentAgeMax: { type: Number, default: SUPPORT_SETTINGS_DEFAULTS.studentAgeMax, min: 0, max: 25 },
    defaultSurveyLength: { type: Number, default: SUPPORT_SETTINGS_DEFAULTS.defaultSurveyLength, min: 1, max: 20 },
    maxSurveyLength: { type: Number, default: SUPPORT_SETTINGS_DEFAULTS.maxSurveyLength, min: 1, max: 20 },
    reminderDays: { type: Number, default: SUPPORT_SETTINGS_DEFAULTS.reminderDays, min: 1, max: 30 },
    reminderCount: { type: Number, default: SUPPORT_SETTINGS_DEFAULTS.reminderCount, min: 0, max: 5 },
    // Q12: school working days a case may sit before its owner must acknowledge it.
    acknowledgmentDays: { type: Number, default: SUPPORT_SETTINGS_DEFAULTS.acknowledgmentDays, min: 1, max: 10 },
    // Named staff member who absorbs acknowledgment escalations; falls back to admins.
    escalationBackup: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    autoSuggestions: { type: Boolean, default: SUPPORT_SETTINGS_DEFAULTS.autoSuggestions },
    aiPlanDrafts: { type: Boolean, default: SUPPORT_SETTINGS_DEFAULTS.aiPlanDrafts },
    suggestionWindowDays: { type: Number, default: SUPPORT_SETTINGS_DEFAULTS.suggestionWindowDays, min: 7, max: 180 },
    suggestionAttendanceRate: { type: Number, default: SUPPORT_SETTINGS_DEFAULTS.suggestionAttendanceRate, min: 1, max: 100 },
    suggestionFailingGrades: { type: Number, default: SUPPORT_SETTINGS_DEFAULTS.suggestionFailingGrades, min: 1, max: 20 },
    suggestionBehaviorIncidents: { type: Number, default: SUPPORT_SETTINGS_DEFAULTS.suggestionBehaviorIncidents, min: 1, max: 20 },
    severityCadence: { type: cadenceSchema, default: () => ({ ...SUPPORT_SETTINGS_DEFAULTS.severityCadence }) },
    notifications: { type: notificationSettingsSchema, default: () => ({ ...SUPPORT_SETTINGS_DEFAULTS.notifications }) },
    integrations: { type: integrationSettingsSchema, default: () => ({ ...SUPPORT_SETTINGS_DEFAULTS.integrations }) },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

supportSettingsSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('SupportSettings', supportSettingsSchema);
