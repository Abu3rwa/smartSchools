import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import SpellingWord from '../models/SpellingWord.js';
import {
    createSpellingWord,
    deleteSpellingWord,
    updateSpellingWord
} from '../controllers/spellingWordController.js';
import {
    parseDomainInput,
    updateWordBodySchema
} from '../validators/spellingLibraryValidators.js';

const invoke = async (handler, overrides = {}) => {
    const req = {
        body: {},
        params: {},
        query: {},
        schoolId: 'school-1',
        user: { _id: 'user-1', role: 'teacher' },
        ...overrides
    };
    let capturedError = null;
    const response = {
        statusCode: 200,
        body: null,
        headers: {},
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
        set(headers) {
            this.headers = { ...this.headers, ...headers };
            return this;
        }
    };
    handler(req, response, (error) => { capturedError = error; });
    await delay(0);
    return { response, error: capturedError };
};

const envelope = {
    operationId: 'operation-1234',
    reason: 'correct a typo in the weekly list',
    confirmImpact: true
};

test('update validation trims the word before it reaches the service', () => {
    const input = parseDomainInput(updateWordBodySchema, { word: '  allowance  ', ...envelope });
    assert.equal(input.patch.word, 'allowance');
});

test('curriculum word update rejects an empty or punctuation-only value before querying', async (t) => {
    const findOne = t.mock.method(SpellingWord, 'findOne', () => {
        throw new Error('validation must run before the database');
    });

    const empty = await invoke(updateSpellingWord, {
        body: { word: '  ', ...envelope },
        params: { wordId: '507f1f77bcf86cd799439011' }
    });
    assert.equal(empty.error?.code, 'INVALID_WORD');

    const punctuation = await invoke(updateSpellingWord, {
        body: { word: '!!!', ...envelope },
        params: { wordId: '507f1f77bcf86cd799439011' }
    });
    assert.equal(punctuation.error?.code, 'INVALID_WORD');
    assert.equal(findOne.mock.callCount(), 0);
});

test('curriculum word update requires the save envelope instead of a blind write', async (t) => {
    const findOne = t.mock.method(SpellingWord, 'findOne', () => {
        throw new Error('the envelope guard must run before the database');
    });

    const { error } = await invoke(updateSpellingWord, {
        body: { word: 'allowance' },
        params: { wordId: '507f1f77bcf86cd799439011' }
    });
    assert.equal(error?.code, 'EXPECTATION_REQUIRED');
    assert.equal(findOne.mock.callCount(), 0);
});

test('curriculum word update keeps the school scope on the word lookup', async (t) => {
    const findOne = t.mock.method(SpellingWord, 'findOne', () => ({
        select: () => ({ lean: async () => null })
    }));

    const { error } = await invoke(updateSpellingWord, {
        body: { word: 'allowance', ...envelope },
        params: { wordId: '507f1f77bcf86cd799439011' }
    });

    assert.equal(error?.code, 'WORD_NOT_FOUND');
    assert.equal(findOne.mock.callCount(), 1);
    const filter = findOne.mock.calls[0].arguments[0];
    assert.equal(filter.school, 'school-1');
    assert.equal(filter._id, '507f1f77bcf86cd799439011');
    assert.equal(filter.deletedAt, null);
});

test('curriculum word archive requires an envelope and never deletes directly', async (t) => {
    const findOne = t.mock.method(SpellingWord, 'findOne', () => {
        throw new Error('the envelope guard must run before the database');
    });
    const deleteOne = t.mock.method(SpellingWord, 'deleteOne', () => {
        throw new Error('archival must not delete documents');
    });

    const { error } = await invoke(deleteSpellingWord, { params: { wordId: '507f1f77bcf86cd799439011' } });
    assert.equal(error?.code, 'EXPECTATION_REQUIRED');
    assert.equal(findOne.mock.callCount(), 0);
    assert.equal(deleteOne.mock.callCount(), 0);
});

test('curriculum word creation rejects an unknown grade before the service runs', async (t) => {
    const create = t.mock.method(SpellingWord, 'create', () => {
        throw new Error('validation must run before the database');
    });

    const { error } = await invoke(createSpellingWord, {
        body: {
            grade: 'G9',
            week: 2,
            category: 'Animals',
            word: 'fox',
            ...envelope
        }
    });
    assert.equal(error?.code, 'INVALID_FILTER');
    assert.equal(create.mock.callCount(), 0);
});
