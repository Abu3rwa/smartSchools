import test from 'node:test';
import assert from 'node:assert/strict';
import SpellingWord from '../models/SpellingWord.js';
import SpellingSession from '../models/SpellingSession.js';
import { updateSpellingWord } from '../controllers/spellingWordController.js';

const invokeUpdate = async ({ word = '  allowance  ', currentSession = null } = {}, t) => {
    const document = {
        _id: 'word-1',
        word: 'allowance',
        normalizedWord: 'allowance',
        save: async function save() { this.saved = true; }
    };
    t.mock.method(SpellingWord, 'findOne', () => ({ select: async () => document }));
    t.mock.method(SpellingSession, 'findOne', () => ({
        select: () => ({ lean: async () => currentSession })
    }));
    let resolveResponse;
    const responseDone = new Promise((resolve) => { resolveResponse = resolve; });
    const response = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            resolveResponse();
            return this;
        }
    };
    updateSpellingWord(
        { body: { word }, params: { wordId: 'word-1' }, schoolId: 'school-1' },
        response,
        (error) => { throw error; }
    );
    await responseDone;
    return { response, document };
};

test('curriculum word update trims the word and updates its grading key', async (t) => {
    const { response, document } = await invokeUpdate({ word: '  allowance  ' }, t);
    assert.equal(document.word, 'allowance');
    assert.equal(document.normalizedWord, 'allowance');
    assert.equal(document.saved, true);
    assert.deepEqual(response.body, { success: true, data: { id: 'word-1', word: 'allowance' } });
});

test('curriculum word update rejects an empty value', async (t) => {
    const { response } = await invokeUpdate({ word: '  ' }, t);
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
});

test('curriculum word update prevents edits to the current word in an active session', async (t) => {
    const { response, document } = await invokeUpdate({ currentSession: { _id: 'session-1' } }, t);
    assert.equal(response.statusCode, 409);
    assert.equal(document.saved, undefined);
});
