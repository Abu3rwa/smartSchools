import test from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_ACADEMIC_INTELLIGENCE_THRESHOLDS,
    getAcademicIntelligenceSettingsFromSchool,
    normalizeAcademicIntelligenceSettings
} from '../utils/academicIntelligenceSettings.js';

test('normalizeAcademicIntelligenceSettings fills defaults', () => {
    const settings = normalizeAcademicIntelligenceSettings({});

    assert.deepEqual(settings.thresholds, DEFAULT_ACADEMIC_INTELLIGENCE_THRESHOLDS);
    assert.deepEqual(settings.overrides, []);
});

test('getAcademicIntelligenceSettingsFromSchool resolves matching override', () => {
    const school = {
        settings: {
            academicIntelligence: {
                thresholds: { objectiveWeakThreshold: 70 },
                overrides: [{
                    class: 'class-1',
                    subject: 'subject-1',
                    thresholds: { objectiveWeakThreshold: 65, repeatedWeakCount: 3, repeatedWeakWindowDays: 20, classWideWeakThreshold: 35 }
                }]
            }
        }
    };

    const result = getAcademicIntelligenceSettingsFromSchool({ school, classId: 'class-1', subjectId: 'subject-1' });

    assert.equal(result.thresholds.objectiveWeakThreshold, 65);
    assert.equal(result.thresholds.repeatedWeakCount, 3);
});