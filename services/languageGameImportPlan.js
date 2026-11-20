// The effective import plan. Preview and commit both build it from the same
// inputs against current state, so the teacher can only commit the exact
// result that was reviewed. Execution is separate and transactional.
import mongoose from 'mongoose';
import GameSkill from '../models/GameSkill.js';
import GamePack from '../models/GamePack.js';
import Standard from '../models/Standard.js';
import StandardQuestionPool from '../models/StandardQuestionPool.js';
import { MAX_PACK_ITEMS, ITEM_TYPES } from './languageGameItems.js';
import { resolvePracticeQuestionType } from '../constants/practiceQuestionTypes.js';
import { validatePackCsv } from './languageGamePackCsv.js';
import { buildPoolDraft } from './languageGamePoolImport.js';
import { fingerprintOf, createPlanToken } from './languageGameImportToken.js';
import { ImportConflictError, revisionValue, saveWithRevision, touchReferencedSkills, uniqueSlugKey } from './languageGameAuthoring.js';

const LANGUAGES = ['en', 'ar', 'mixed'];

const canManageDoc = (ctx, doc) => ctx.isAdmin || String(doc.owner) === String(ctx.userId);

const query = (q, session) => (session ? q.session(session) : q);

const standardLookupFor = async (packs, session) => {
    const codes = [...new Set(packs.flatMap((pack) => pack.items.flatMap((item) => item.standardCodes || [])))];
    if (codes.length === 0) return new Map();
    const standards = await query(
        Standard.find({ code: { $in: codes }, isActive: true }).select('_id code'),
        session
    ).lean();
    const lookup = new Map();
    for (const standard of standards) {
        const key = String(standard.code || '').toUpperCase();
        lookup.set(key, [...(lookup.get(key) || []), standard._id]);
    }
    return lookup;
};

const parseCsv = async (input, ctx, existingSkillKeys) => {
    let draft;
    try {
        draft = validatePackCsv(input.content, input.type, { target: input.mode, existingSkillKeys });
    } catch (error) {
        const failure = new Error(error.message);
        failure.status = 400;
        throw failure;
    }
    const standardLookup = await standardLookupFor(draft.packs, ctx.session);
    return validatePackCsv(input.content, input.type, { target: input.mode, existingSkillKeys, standardLookup });
};

export const normalizeImportInput = (body = {}) => {
    const source = body.source === 'pool' ? 'pool' : 'csv';
    const mode = source === 'pool' ? 'single' : (body.mode === 'advanced' ? 'bulk' : 'single');
    return {
        source,
        mode,
        type: String(body.type || ''),
        operation: body.operation === 'replace' ? 'replace' : 'create',
        content: String(body.content || ''),
        poolId: String(body.poolId || '').trim(),
        questionIds: Array.isArray(body.questionIds) ? body.questionIds.map(String) : [],
        skillId: String(body.skillId || '').trim(),
        packId: String(body.packId || '').trim(),
        newPack: body.newPack && typeof body.newPack === 'object' ? body.newPack : {},
        skillMappings: body.skillMappings && typeof body.skillMappings === 'object' ? body.skillMappings : {},
        confirmations: Array.isArray(body.confirmations) ? body.confirmations.map(String) : [],
        rowDisposition: body.rowDisposition === 'valid_rows' ? 'valid_rows' : 'all'
    };
};

const cleanMeta = (raw, fallback = {}) => ({
    title: String(raw.title ?? fallback.title ?? '').trim(),
    description: String(raw.description ?? fallback.description ?? '').trim(),
    language: LANGUAGES.includes(raw.language) ? raw.language : (fallback.language || 'en'),
    gradeLevels: (Array.isArray(raw.gradeLevels) ? raw.gradeLevels : fallback.gradeLevels || [])
        .map((level) => String(level).trim()).filter(Boolean),
    visibility: raw.visibility === 'school' ? 'school' : (raw.visibility === 'private' ? 'private' : (fallback.visibility || 'private'))
});

const removalStats = (existingItems, incomingItems) => {
    const incomingIds = new Set(incomingItems.map((item) => item.externalId));
    const removed = existingItems.filter((item) => !incomingIds.has(item.externalId));
    const incomingTypes = new Set(incomingItems.map((item) => item.type));
    return {
        existingCount: existingItems.length,
        removedCount: existingItems.length,
        retainedIds: existingItems.filter((item) => incomingIds.has(item.externalId)).map((item) => item.externalId),
        crossTypeRemovals: removed.filter((item) => !incomingTypes.has(item.type)).length
    };
};

const taggedItems = (rows, skillId) => rows.map((row) => ({
    externalId: row.externalId,
    type: row.type,
    prompt: row.prompt,
    options: row.options,
    correctOptionId: row.correctOptionId,
    correctAnswer: row.correctAnswer || '',
    acceptedAnswers: row.acceptedAnswers,
    matchingPairs: row.matchingPairs || [],
    orderingItems: row.orderingItems || [],
    numericRule: row.numericRule || null,
    explanation: row.explanation,
    skillId: skillId ? String(skillId) : null,
    difficulty: row.difficulty,
    // Authoring-only: which file key this row came from, so rows whose skill
    // is created inside the transaction can be retagged. Never persisted.
    sourceSkillKey: row.skillKey || null
}));

const fingerprintMaterial = (input, ctx, targets, skillActions, poolRef = null) => ({
    school: String(ctx.schoolId),
    user: String(ctx.userId),
    source: input.source || 'csv',
    pool: poolRef,
    mode: input.mode,
    type: input.type,
    operation: input.operation,
    content: input.content,
    targets: targets.map((target) => ({
        skillIds: target.skillIds.map(String).sort(),
        packId: target.pack ? String(target.pack._id) : null,
        packRevision: target.pack ? revisionValue(target.pack, 'authoringRevision') : null,
        meta: target.meta,
        packKey: target.packKey || null
    })),
    skillCreations: skillActions.filter((action) => action.action === 'create')
        .map((action) => ({ key: action.key, name: action.name, gradeLevel: action.gradeLevel, language: action.language }))
        .sort((a, b) => a.key.localeCompare(b.key))
});

/* ------------------------------------------------------------------ */
/* Single-skill destination                                            */
/* ------------------------------------------------------------------ */

const buildSinglePlan = async (input, ctx, csv) => {
    const problems = [];
    if (!mongoose.isValidObjectId(input.skillId)) {
        const failure = new Error('Choose the skill these questions belong to.');
        failure.status = 400;
        throw failure;
    }
    const skill = await query(
        GameSkill.findOne({ _id: input.skillId, school: ctx.schoolId, status: { $ne: 'archived' } }),
        ctx.session
    ).lean();
    if (!skill) {
        const failure = new Error('The selected skill was not found or is archived. Pick another skill.');
        failure.status = 409;
        throw failure;
    }

    const rows = csv.packs[0]?.items || [];
    const items = taggedItems(rows, skill._id);

    let pack = null;
    if (input.operation === 'replace') {
        if (!mongoose.isValidObjectId(input.packId)) {
            const failure = new Error('Choose the question pack to replace.');
            failure.status = 400;
            throw failure;
        }
        pack = await query(GamePack.findOne({ _id: input.packId, school: ctx.schoolId }), ctx.session);
        if (!pack) {
            const failure = new Error('The selected question pack was not found.');
            failure.status = 404;
            throw failure;
        }
        if (!canManageDoc(ctx, pack)) {
            const failure = new Error('This question pack belongs to another teacher.');
            failure.status = 403;
            throw failure;
        }
        if (pack.status === 'archived') {
            problems.push('The selected question pack is archived. Choose another pack.');
        }
        const foreignSkills = new Set(
            (pack.items || []).map((item) => String(item.skillId)).filter((id) => id !== String(skill._id))
        );
        if (foreignSkills.size > 0) {
            problems.push('This pack also holds questions for other skills. Replacing it here would remove them; use the advanced import to manage multi-skill packs.');
        }
    }

    const meta = pack
        ? cleanMeta({}, pack)
        : cleanMeta(input.newPack, {
            title: '',
            language: skill.language || 'en',
            gradeLevels: skill.gradeLevel ? [skill.gradeLevel] : []
        });
    if (!pack && !meta.title) problems.push('Give the new question pack a title.');
    if (items.length > MAX_PACK_ITEMS) problems.push(`A pack cannot hold more than ${MAX_PACK_ITEMS} questions.`);

    const replacement = pack ? removalStats(pack.items || [], items) : null;

    const declaredKeys = [...new Set(rows.map((row) => row.skillKey).filter(Boolean))]
        .filter((key) => key !== String(skill.key).toLowerCase());
    const declaredNames = [...new Set(rows.map((row) => row.skillName).filter(Boolean))]
        .filter((name) => name.toLowerCase().replace(/\s+/g, ' ').trim()
            !== String(skill.name).toLowerCase().replace(/\s+/g, ' ').trim());
    const conflicts = {
        skillKeys: declaredKeys,
        skillNames: declaredNames,
        language: !pack && rows.length > 0 && csv.packs[0].language && csv.packs[0].language !== meta.language
            ? csv.packs[0].language : null,
        gradeLevels: !pack && csv.packs[0]?.gradeLevels?.length
            && csv.packs[0].gradeLevels.join(';') !== meta.gradeLevels.join(';')
            ? csv.packs[0].gradeLevels : null
    };

    const requiredConfirmations = [];
    if (declaredKeys.length > 0 || declaredNames.length > 0) requiredConfirmations.push('skillConflicts');
    if (pack && replacement.removedCount > 0) requiredConfirmations.push('replace');
    if (pack && pack.status === 'published') requiredConfirmations.push('unpublish');
    if (csv.invalidRows > 0) requiredConfirmations.push('validRows');

    const targets = [{ skillIds: [skill._id], pack, meta, items, packKey: null }];
    return {
        csv,
        skill,
        targets,
        replacement,
        conflicts,
        skillActions: [{ action: 'use', skillId: String(skill._id), name: skill.name, gradeLevel: skill.gradeLevel || '' }],
        problems,
        requiredConfirmations
    };
};

/* ------------------------------------------------------------------ */
/* Advanced bulk import                                                */
/* ------------------------------------------------------------------ */

const buildBulkPlan = async (input, ctx, csv) => {
    const problems = [];
    const keys = [...new Set(csv.packs.flatMap((pack) => pack.items.map((item) => item.skillKey)).filter(Boolean))];
    const skills = keys.length > 0
        ? await query(GameSkill.find({ school: ctx.schoolId, key: { $in: keys } }), ctx.session).lean()
        : [];
    const byKey = new Map(skills.map((skill) => [String(skill.key).toLowerCase(), skill]));

    const skillActions = [];
    const resolveRowSkill = (row, packMeta) => {
        const existing = byKey.get(row.skillKey);
        if (existing) {
            if (existing.status === 'archived') {
                problems.push(`Skill ${row.skillKey} is archived. Restore it in the studio before importing.`);
                return null;
            }
            return existing._id;
        }
        const mapping = input.skillMappings[row.skillKey];
        if (mapping?.skillId && mongoose.isValidObjectId(mapping.skillId)) {
            return mapping.skillId;
        }
        if (!skillActions.some((action) => action.key === row.skillKey)) {
            skillActions.push({
                action: 'create',
                key: row.skillKey,
                name: row.skillName,
                gradeLevel: packMeta.gradeLevels[0] || '',
                language: packMeta.language || 'en'
            });
        }
        return null;
    };

    const packKeys = csv.packs.map((pack) => pack.packKey);
    const existingPacks = packKeys.length > 0
        ? await query(GamePack.find({ school: ctx.schoolId, key: { $in: packKeys } }), ctx.session)
        : [];
    const packsByKey = new Map(existingPacks.map((pack) => [String(pack.key), pack]));

    const targets = [];
    for (const draftPack of csv.packs) {
        if (draftPack.items.length === 0) continue;
        const pack = packsByKey.get(draftPack.packKey) || null;
        if (pack) {
            if (!canManageDoc(ctx, pack)) {
                problems.push(`Pack ${draftPack.packKey} belongs to another teacher. Copy it under a new pack_key instead of importing over it.`);
                continue;
            }
            if (pack.status === 'archived') {
                problems.push(`Pack ${draftPack.packKey} is archived. Restore or rename it before importing.`);
                continue;
            }
        }
        const meta = pack ? cleanMeta({}, pack) : cleanMeta({
            title: draftPack.title,
            language: draftPack.language,
            gradeLevels: draftPack.gradeLevels
        });
        const items = [];
        for (const row of draftPack.items) {
            const skillId = resolveRowSkill(row, meta);
            // Rows for a skill created inside the commit transaction stay in
            // the plan with a null skillId; execution retags them by key.
            const pendingCreate = !skillId
                && skillActions.some((action) => action.action === 'create' && action.key === row.skillKey);
            if (!skillId && !pendingCreate) continue;
            items.push({ ...taggedItems([row], skillId)[0] });
        }
        if (items.length > MAX_PACK_ITEMS) problems.push(`Pack ${draftPack.packKey} would hold more than ${MAX_PACK_ITEMS} questions.`);
        targets.push({
            skillIds: [...new Set(items.map((item) => item.skillId).filter(Boolean))],
            pack,
            meta,
            items,
            packKey: draftPack.packKey
        });
    }

    for (const mapping of Object.values(input.skillMappings)) {
        if (!mapping?.skillId || !mongoose.isValidObjectId(mapping.skillId)) continue;
        const mapped = await query(
            GameSkill.findOne({ _id: mapping.skillId, school: ctx.schoolId, status: { $ne: 'archived' } }).select('_id name gradeLevel'),
            ctx.session
        ).lean();
        if (!mapped) problems.push('One of the mapped skills was not found or is archived.');
        else if (!skillActions.some((action) => action.skillId === String(mapped._id))) {
            skillActions.push({ action: 'use', skillId: String(mapped._id), name: mapped.name, gradeLevel: mapped.gradeLevel || '' });
        }
    }
    for (const skill of byKey.values()) {
        if (skill.status !== 'archived' && !skillActions.some((action) => action.skillId === String(skill._id))) {
            skillActions.push({ action: 'use', skillId: String(skill._id), name: skill.name, gradeLevel: skill.gradeLevel || '' });
        }
    }

    const requiredConfirmations = [];
    if (targets.some((target) => target.pack && target.pack.items.length > 0)) requiredConfirmations.push('replace');
    if (targets.some((target) => target.pack?.status === 'published')) requiredConfirmations.push('unpublish');
    if (skillActions.some((action) => action.action === 'create')) requiredConfirmations.push('skillCreate');
    if (csv.invalidRows > 0) requiredConfirmations.push('validRows');

    return {
        csv,
        skill: null,
        targets,
        replacement: null,
        conflicts: null,
        skillActions,
        problems,
        requiredConfirmations
    };
};

/* ------------------------------------------------------------------ */
/* Build / summarize / execute                                         */
/* ------------------------------------------------------------------ */

export const buildImportPlan = async (input, ctx) => {
    let csv;
    let poolRef = null;
    if (input.source === 'pool') {
        if (!mongoose.isValidObjectId(input.poolId)) {
            const failure = new Error('Choose the question pool to import from.');
            failure.status = 400;
            throw failure;
        }
        const pool = await query(
            StandardQuestionPool.findOne({ _id: input.poolId, school: ctx.schoolId, status: 'published', isActive: true }),
            ctx.session
        ).lean();
        if (!pool) {
            const failure = new Error('The selected question pool was not found or is not published.');
            failure.status = 404;
            throw failure;
        }
        if (!ctx.isAdmin && !(ctx.teacherClassIds || []).map(String).includes(String(pool.class))) {
            const failure = new Error('This question pool belongs to a class you do not teach.');
            failure.status = 403;
            throw failure;
        }
        csv = buildPoolDraft(pool, input.questionIds);
        // The pool version rides the fingerprint: an edit between preview and
        // commit changes the material and forces a fresh preview.
        poolRef = {
            poolId: String(pool._id),
            version: pool.currentVersion || 1,
            questionIds: [...input.questionIds].sort()
        };
    } else {
        const mixed = String(input.type || '').trim().toLowerCase() === 'mixed';
        if (!mixed && !ITEM_TYPES.includes(resolvePracticeQuestionType(input.type))) {
            const failure = new Error('Choose a question type.');
            failure.status = 400;
            throw failure;
        }
        if (!input.content.trim()) {
            const failure = new Error('Paste or upload the CSV content first.');
            failure.status = 400;
            throw failure;
        }
        const existingSkillKeys = input.mode === 'bulk'
            ? new Set((await query(GameSkill.find({ school: ctx.schoolId, status: { $ne: 'archived' } }).select('key'), ctx.session).lean())
                .map((skill) => String(skill.key).toLowerCase()))
            : new Set();
        csv = await parseCsv(input, ctx, existingSkillKeys);
    }
    const plan = input.mode === 'single'
        ? await buildSinglePlan(input, ctx, csv)
        : await buildBulkPlan(input, ctx, csv);

    const blockingErrors = plan.problems.length > 0
        || csv.errors.length > 0 && (input.operation === 'replace' || input.mode === 'bulk' || input.rowDisposition !== 'valid_rows')
        || plan.targets.every((target) => target.items.length === 0);
    const confirmationsMissing = plan.requiredConfirmations.filter((code) => !input.confirmations.includes(code));

    const material = fingerprintMaterial(input, ctx, plan.targets, plan.skillActions, poolRef);
    const fingerprint = fingerprintOf(material);
    const packRevision = input.mode === 'single' && plan.targets[0]?.pack
        ? revisionValue(plan.targets[0].pack, 'authoringRevision')
        : null;

    return {
        ...plan,
        input,
        poolRef,
        fingerprint,
        packRevision,
        canCommit: !blockingErrors && confirmationsMissing.length === 0,
        blockingErrors,
        confirmationsMissing
    };
};

export const previewResponseFor = (plan, ctx) => {
    const { token, expiresAt } = createPlanToken({
        schoolId: ctx.schoolId,
        userId: ctx.userId,
        fingerprint: plan.fingerprint,
        packRevision: plan.packRevision
    });
    const first = plan.targets[0] || null;
    return {
        source: plan.input.source || 'csv',
        pool: plan.poolRef || null,
        mode: plan.input.mode,
        type: plan.input.type,
        operation: plan.input.operation,
        destination: plan.input.mode === 'single' ? {
            skill: plan.skill ? {
                _id: plan.skill._id,
                name: plan.skill.name,
                nameAr: plan.skill.nameAr || '',
                gradeLevel: plan.skill.gradeLevel || ''
            } : null,
            pack: first?.pack ? {
                _id: first.pack._id,
                title: first.pack.title,
                status: first.pack.status,
                itemCount: first.pack.items.length
            } : null,
            isNewPack: !first?.pack,
            effectiveMetadata: first?.meta || null
        } : null,
        packs: plan.targets.map((target) => ({
            packKey: target.packKey,
            packId: target.pack ? String(target.pack._id) : null,
            title: target.meta.title,
            exists: Boolean(target.pack),
            status: target.pack?.status || null,
            itemCount: target.items.length,
            existingItemCount: target.pack?.items?.length || 0,
            skillIds: target.skillIds.map(String)
        })),
        replacement: plan.replacement,
        conflicts: plan.conflicts,
        skillActions: plan.skillActions,
        counts: {
            totalRows: plan.csv.totalRows,
            validRows: plan.csv.validRows,
            invalidRows: plan.csv.invalidRows
        },
        errors: plan.csv.errors.slice(0, 200),
        errorsTruncated: plan.csv.errors.length > 200,
        problems: plan.problems,
        requiredConfirmations: plan.requiredConfirmations,
        confirmationsMissing: plan.confirmationsMissing,
        canCommit: plan.canCommit,
        sampleItems: plan.targets.flatMap((target) => target.items.slice(0, 3)).slice(0, 6).map((item) => ({
            prompt: item.prompt,
            type: item.type,
            options: item.options
        })),
        token: plan.canCommit || !plan.blockingErrors ? token : null,
        expiresAt: plan.canCommit || !plan.blockingErrors ? expiresAt : null
    };
};

export const executeImportPlan = async (plan, ctx) => {
    const summary = { packsCreated: 0, packsUpdated: 0, itemsImported: 0, skillsCreated: 0, rowsSkipped: plan.csv.invalidRows };
    const createdSkills = new Map();

    for (const action of plan.skillActions.filter((entry) => entry.action === 'create')) {
        const key = await uniqueSlugKey(GameSkill, action.key || action.name, { schoolId: ctx.schoolId, session: ctx.session });
        const [skill] = await GameSkill.create([{
            school: ctx.schoolId,
            owner: ctx.userId,
            key,
            name: action.name,
            gradeLevel: action.gradeLevel,
            language: action.language,
            source: 'import'
        }], { session: ctx.session });
        createdSkills.set(action.key, skill);
        summary.skillsCreated += 1;
    }
    // Rows whose skill is being created in this transaction get the new id.
    for (const target of plan.targets) {
        target.items = target.items.map((item) => {
            const created = item.sourceSkillKey ? createdSkills.get(item.sourceSkillKey) : null;
            const rest = { ...item };
            delete rest.sourceSkillKey;
            return created ? { ...rest, skillId: String(created._id) } : rest;
        });
        target.skillIds = [...new Set(target.items.map((item) => item.skillId))];
    }

    const referencedSkillIds = plan.targets.flatMap((target) => target.skillIds);
    await touchReferencedSkills(referencedSkillIds, { schoolId: ctx.schoolId, session: ctx.session });

    let primaryPackId = null;
    for (const target of plan.targets) {
        if (target.items.length === 0) continue;
        if (!target.pack) {
            const key = await uniqueSlugKey(GamePack, target.packKey || target.meta.title, { schoolId: ctx.schoolId, session: ctx.session });
            const [pack] = await GamePack.create([{
                school: ctx.schoolId,
                owner: ctx.userId,
                key,
                title: target.meta.title,
                description: target.meta.description,
                language: target.meta.language,
                gradeLevels: target.meta.gradeLevels,
                subject: plan.skill?.subject || null,
                visibility: target.meta.visibility,
                defaultSkillId: plan.skill ? plan.skill._id : (target.skillIds[0] || null),
                items: target.items,
                skillIds: target.skillIds.map((id) => new mongoose.Types.ObjectId(String(id))),
                authoringRevision: 1
            }], { session: ctx.session });
            summary.packsCreated += 1;
            primaryPackId = primaryPackId || String(pack._id);
        } else {
            const pack = target.pack;
            pack.items = target.items;
            pack.skillIds = target.skillIds.map((id) => new mongoose.Types.ObjectId(String(id)));
            if (plan.skill) pack.defaultSkillId = plan.skill._id;
            if (pack.status === 'published') pack.status = 'draft';
            await saveWithRevision(pack, {
                field: 'authoringRevision',
                expected: plan.packRevision ?? revisionValue(pack, 'authoringRevision'),
                schoolId: ctx.schoolId,
                session: ctx.session,
                conflictMessage: 'This question pack changed since the preview. Preview the file again.'
            });
            summary.packsUpdated += 1;
            primaryPackId = primaryPackId || String(pack._id);
        }
        summary.itemsImported += target.items.length;
    }

    return { summary, primaryPackId };
};

export { ImportConflictError };
