import { canEditPacingGuide } from './curriculumAccessService.js';
import { assertCondition } from './curriculumErrors.js';
import { sortByWeek, toObjectIdString } from './curriculumUtils.js';

const toSelectedWeeksSet = (includeWeeks = []) => new Set((includeWeeks || []).map((item) => Number(item)));

const toWeekRange = (unit) => {
    const start = Number(unit.startWeek || 1);
    const end = Number(unit.endWeek || start);
    return { start, end };
};

const shouldIncludeWeek = (selectedWeeks, week) => selectedWeeks.size === 0 || selectedWeeks.has(week);

const toEntry = (unit, week) => ({
    weekNumber: week,
    unitRef: {
        unitId: unit._id || null,
        unitCode: unit.unitCode || '',
        unitTitle: unit.title || ''
    },
    focus: unit.title || '',
    objectives: [],
    assessment: '',
    notes: ''
});

const appendUnitEntries = (entries, unit, selectedWeeks) => {
    const { start, end } = toWeekRange(unit);
    for (let week = start; week <= end; week += 1) {
        if (shouldIncludeWeek(selectedWeeks, week)) {
            entries.push(toEntry(unit, week));
        }
    }
};

export const buildEntriesFromMapUnits = (map, includeWeeks = []) => {
    const selectedWeeks = toSelectedWeeksSet(includeWeeks);
    const entries = [];
    for (const unit of map.units || []) {
        appendUnitEntries(entries, unit, selectedWeeks);
    }
    return sortByWeek(entries);
};

export const ensureTeacherGuideScope = async ({ repository, req, guide }) => {
    if (req.user.role !== 'teacher' || canEditPacingGuide(req.user)) return;
    const scope = await repository.getTeacherScope({ schoolId: req.schoolId, userId: req.user._id });
    const classId = toObjectIdString(guide.classId?._id || guide.classId);
    const subjectId = toObjectIdString(guide.subject?._id || guide.subject);
    assertCondition(scope.classIds.includes(classId), 403, 'You can only access guides for your assigned classes');
    assertCondition(scope.subjectIds.includes(subjectId), 403, 'You can only access guides for your assigned subjects');
};

export const buildTeacherFilter = async ({ repository, req }) => {
    const scope = await repository.getTeacherScope({ schoolId: req.schoolId, userId: req.user._id });
    if (!scope.classIds.length || !scope.subjectIds.length) {
        return { _id: { $in: [] } };
    }
    return {
        classId: { $in: scope.classIds },
        subject: { $in: scope.subjectIds },
        status: 'published'
    };
};

export const reconcileEntriesWithMap = ({ currentMap, guideEntries }) => {
    const byWeek = new Map();
    for (const entry of guideEntries || []) {
        byWeek.set(Number(entry.weekNumber), entry.toObject ? entry.toObject() : entry);
    }
    const generated = buildEntriesFromMapUnits(currentMap);
    return generated.map((generatedEntry) => {
        const existing = byWeek.get(Number(generatedEntry.weekNumber));
        if (!existing) return generatedEntry;
        return {
            ...generatedEntry,
            focus: existing.focus || generatedEntry.focus,
            objectives: existing.objectives || [],
            assessment: existing.assessment || '',
            notes: existing.notes || ''
        };
    });
};
