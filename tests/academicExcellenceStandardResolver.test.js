import test from 'node:test';
import assert from 'node:assert/strict';

import Class from '../models/Class.js';
import Standard from '../models/Standard.js';
import { resolveStandardForObjective } from '../services/academicExcellenceStandardResolver.js';

const originalClassFindOne = Class.findOne;
const originalStandardFindOne = Standard.findOne;
const originalStandardFind = Standard.find;
const originalStandardFindById = Standard.findById;

const restore = () => {
    Class.findOne = originalClassFindOne;
    Standard.findOne = originalStandardFindOne;
    Standard.find = originalStandardFind;
    Standard.findById = originalStandardFindById;
};

test('resolveStandardForObjective returns exact objectiveKey match', async () => {
    Class.findOne = () => ({ select: () => ({ lean: async () => ({ grade: 7 }) }) });

    const standardDoc = { _id: 'std-1', code: 'MATH.7.EE.B.4', name: 'Solve equations' };
    Standard.findOne = async (query) => {
        assert.equal(query.code, 'MATH.7.EE.B.4');
        return standardDoc;
    };

    const result = await resolveStandardForObjective({
        objectiveKey: 'MATH.7.EE.B.4',
        objectiveName: 'Solve equations',
        schoolId: 'school-1',
        subjectId: 'subject-1',
        classId: 'class-1',
    });

    assert.deepEqual(result, standardDoc);
    restore();
});

test('resolveStandardForObjective falls back to normalized name match', async () => {
    Class.findOne = () => ({ select: () => ({ lean: async () => ({ grade: 5 }) }) });
    Standard.findOne = async () => null;

    Standard.find = () => ({
        select: () => ({
            limit: () => ({
                lean: async () => ([
                    { _id: 'std-a', name: 'Add and subtract fractions', code: 'MATH.5.NF.A.1' },
                    { _id: 'std-b', name: 'Identify triangles', code: 'MATH.5.G.B.4' },
                ])
            })
        })
    });

    Standard.findById = async (id) => ({ _id: id, code: 'MATH.5.NF.A.1' });

    const result = await resolveStandardForObjective({
        objectiveKey: 'unknown',
        objectiveName: 'Add and subtract fractions',
        schoolId: 'school-1',
        subjectId: 'subject-1',
        classId: 'class-1',
    });

    assert.equal(result._id, 'std-a');
    restore();
});

test('resolveStandardForObjective returns null when no key/name match exists', async () => {
    Class.findOne = () => ({ select: () => ({ lean: async () => ({ grade: 5 }) }) });
    Standard.findOne = async () => null;
    Standard.find = () => ({
        select: () => ({
            limit: () => ({
                lean: async () => ([{ _id: 'std-a', name: 'Identify triangles' }])
            })
        })
    });
    Standard.findById = async () => null;

    const result = await resolveStandardForObjective({
        objectiveKey: 'NOPE.1',
        objectiveName: 'Completely unrelated objective',
        schoolId: 'school-1',
        subjectId: 'subject-1',
        classId: 'class-1',
    });

    assert.equal(result, null);
    restore();
});
