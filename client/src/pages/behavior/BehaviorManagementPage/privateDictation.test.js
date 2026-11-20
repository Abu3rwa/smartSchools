import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { privateSpeechSupport, insertDictation } from './privateDictation.js';

test('private dictation never uses cloud-only recognition', async () => {
    class CloudRecognition {}
    assert.deepEqual(await privateSpeechSupport('en-US', {}), {
        available: false,
        reason: 'unsupported'
    });
    assert.equal(
        (
            await privateSpeechSupport('en-US', {
                SpeechRecognition: CloudRecognition
            })
        ).available,
        false
    );
});

test('private dictation requires an installed local language and local availability check', async () => {
    class Recognition {}
    Recognition.prototype.processLocally = false;
    let checked;
    Recognition.available = async (options) => {
        checked = options;
        return 'available';
    };
    assert.equal(
        (
            await privateSpeechSupport('ar-SA', {
                SpeechRecognition: Recognition
            })
        ).available,
        true
    );
    assert.deepEqual(checked, { langs: ['ar-SA'], processLocally: true });
    Recognition.available = async () => 'downloadable';
    assert.equal(
        (
            await privateSpeechSupport('ar-SA', {
                SpeechRecognition: Recognition
            })
        ).reason,
        'languageUnavailable'
    );
    Recognition.available = async () => {
        throw new Error('unsupported');
    };
    assert.equal(
        (
            await privateSpeechSupport('ar-SA', {
                SpeechRecognition: Recognition
            })
        ).available,
        false
    );
});

test('dictation replaces only the selection and preserves typed text', () => {
    assert.equal(
        insertDictation('Before after', 'spoken', 7, 7),
        'Before spoken after'
    );
    assert.equal(
        insertDictation('Before replace after', 'spoken', 7, 14),
        'Before spoken after'
    );
    assert.equal(insertDictation('Typed.', 'Spoken.'), 'Typed. Spoken.');
    assert.equal(insertDictation('', 'النص'), 'النص');
});

test('routine and formal log translations keep independent namespaces', async () => {
    for (const language of ['en', 'ar']) {
        const source = await readFile(
            new URL(
                `../../../i18n/locales/${language}/behaviorConsequences.json`,
                import.meta.url
            ),
            'utf8'
        );
        const messages = JSON.parse(source);
        assert.ok(messages.behaviorLog.record);
        assert.ok(messages.behaviorLog.voice.private);
        assert.ok(messages.log.confirm);
        assert.notEqual(messages.behaviorLog.title, messages.log.title);
        assert.equal((source.match(/^ {4}"log":/gm) || []).length, 1);
    }
});
