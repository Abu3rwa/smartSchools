import mongoose from 'mongoose';
import PlpEvidence from '../models/PlpEvidence.js';
import PlpStudentRecord from '../models/PlpStudentRecord.js';
import SupportPlanVersion from '../models/SupportPlanVersion.js';
import { supportError } from './supportAccessService.js';
import { loadSettings } from './supportSettingsService.js';

const cleanText = (value, max) => String(value ?? '').trim().slice(0, max);

/**
 * Family-safe plan summary. No severity, staff names, source roles, baselines,
 * outcomes, other-family answers or free staff notes.
 */
export const familySafeSummary = (version) => {
    if (!version) return null;
    const goalTitlesEn = (version.goals || []).map((goal) => goal.title).filter(Boolean);
    const goalTitlesAr = (version.goals || []).map((goal) => goal.titleAr || goal.title).filter(Boolean);
    const homeEn = (version.goals || []).flatMap((goal) => (goal.homeTasks || []).map((task) => task.title)).filter(Boolean);
    const homeAr = (version.goals || []).flatMap((goal) => (goal.homeTasks || []).map((task) => task.titleAr || task.title)).filter(Boolean);
    return {
        en: [
            version.headline,
            version.summary,
            goalTitlesEn.length ? `Goals: ${goalTitlesEn.join('; ')}.` : '',
            homeEn.length ? `At home: ${homeEn.join('; ')}.` : '',
        ].filter(Boolean).join(' ').slice(0, 1600),
        ar: [
            version.headlineAr,
            version.summaryAr,
            goalTitlesAr.length ? `الأهداف: ${goalTitlesAr.join('؛ ')}.` : '',
            homeAr.length ? `في المنزل: ${homeAr.join('؛ ')}.` : '',
        ].filter(Boolean).join(' ').slice(0, 1600),
    };
};

export const supportIntegrationStatus = async ({ schoolId }) => {
    const settings = await loadSettings(schoolId);
    return {
        parentUpdates: {
            available: settings.integrations?.parentUpdates === true,
            automatic: true,
        },
        newsletter: {
            // The existing child-letter screen stays the only delivery path.
            available: settings.integrations?.newsletter === true,
            automatic: false,
            howTo: 'Copy the family-safe summary into the child\'s newsletter note. The teacher still reviews and sends the letter.',
        },
        observations: {
            available: settings.integrations?.observations === true,
            automatic: false,
            howTo: 'Staff choose the exact wording. A support action never creates a behavior incident or consequence.',
        },
    };
};

const publishedVersionFor = async ({ schoolId, caseDoc }) => {
    if (!caseDoc?.currentPlan) return null;
    const version = await SupportPlanVersion.findOne({
        school: schoolId,
        plan: caseDoc.currentPlan,
        status: 'published',
    }).sort({ version: -1 });
    return version;
};

export const newsletterSummaryForCase = async ({ schoolId, caseDoc }) => {
    const settings = await loadSettings(schoolId);
    if (!settings.integrations?.newsletter) {
        throw supportError(409, 'NEWSLETTER_DISABLED', 'Newsletter integration is off in support settings.');
    }
    const version = await publishedVersionFor({ schoolId, caseDoc });
    if (!version) throw supportError(409, 'PLAN_NOT_PUBLISHED', 'Publish a plan before using it in a newsletter.');
    return {
        versionId: String(version._id),
        version: version.version,
        summary: familySafeSummary(version),
        note: 'This text is safe for the individual child\'s newsletter. It is not for a class-wide newsletter.',
    };
};

/**
 * Explicit, authorized observation. It is appended once and linked to its
 * support source so the suggestion engine cannot feed it back as new evidence.
 */
export const recordSupportObservation = async ({
    schoolId,
    caseDoc,
    user,
    note,
    traitId = null,
}) => {
    const settings = await loadSettings(schoolId);
    if (!settings.integrations?.observations) {
        throw supportError(409, 'OBSERVATIONS_DISABLED', 'Observation integration is off in support settings.');
    }
    const text = cleanText(note, 1000);
    if (text.length < 10) {
        throw supportError(400, 'OBSERVATION_TEXT', 'Write the factual observation in at least ten characters.');
    }
    const studentId = caseDoc.student?._id || caseDoc.student;
    const record = await PlpStudentRecord.findOne({
        school: schoolId,
        student: studentId,
        academicYear: caseDoc.academicYear,
    }).sort({ createdAt: -1 }).select('_id').lean();
    if (!record) {
        throw supportError(409, 'NO_PLP_RECORD', 'This student has no character-development record for this year, so an observation cannot be added yet.');
    }
    const version = await publishedVersionFor({ schoolId, caseDoc });

    const evidence = await PlpEvidence.create({
        school: schoolId,
        plpRecord: record._id,
        student: studentId,
        teacher: user?._id,
        traitId: mongoose.isValidObjectId(traitId) ? traitId : null,
        type: 'observation',
        note: text,
        taggedTraits: [],
        source: 'manual',
        reviewStatus: 'confirmed',
        class: caseDoc.class?._id || caseDoc.class || null,
        subject: (caseDoc.subjects || [])[0]?.subject || null,
        capturedVia: 'manual',
        supportCase: caseDoc._id,
        supportVersion: version?._id || null,
    });
    return { id: String(evidence._id) };
};
