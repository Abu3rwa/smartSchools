import assert from 'node:assert/strict';
import test from 'node:test';
import { createClipQueue } from './clipQueue.js';

const instantTimers = {
    setTimeout: (fn) => {
        fn();
        return 1;
    },
    clearTimeout: () => {}
};

const makeAudio = (url, audios, { neverEnds = false } = {}) => {
    const audio = {
        url,
        preload: '',
        onended: null,
        onerror: null,
        paused: false,
        played: 0,
        play() {
            audio.played += 1;
            if (!neverEnds) queueMicrotask(() => audio.onended?.());
            return Promise.resolve();
        },
        pause() {
            audio.paused = true;
        }
    };
    audios.push(audio);
    return audio;
};

const setup = (options = {}) => {
    const audios = [];
    const revoked = [];
    const queue = createClipQueue({
        createAudio: (url) => makeAudio(url, audios, options),
        createUrl: (blob) => `blob:${blob.id}`,
        revokeUrl: (url) => revoked.push(url),
        timers: instantTimers,
        ...options
    });
    return { queue, audios, revoked };
};

test('clips play one after another and report each one', async () => {
    const { queue, audios } = setup();
    const seen = [];
    const result = await queue.play({
        turnId: 't1',
        clips: [{ index: 0 }, { index: 1 }],
        loadClip: ({ index }) => ({ id: index }),
        onState: (state) => seen.push(state)
    });
    assert.deepEqual(audios.map((audio) => audio.url), ['blob:0', 'blob:1']);
    assert.deepEqual(seen.filter((row) => row.type === 'playing').map((row) => row.index), [0, 1]);
    assert.deepEqual(result, { cancelled: false, failed: false, played: 2 });
    assert.equal(seen.at(-1).type, 'done');
});

test('a clip that cannot be fetched is skipped without stopping the turn', async () => {
    const { queue, audios } = setup();
    const seen = [];
    const result = await queue.play({
        turnId: 't2',
        clips: [{ index: 0 }, { index: 1 }],
        loadClip: async ({ index }) => {
            if (index === 0) throw new Error('missing');
            return { id: index };
        },
        onState: (state) => seen.push(state)
    });
    assert.deepEqual(audios.map((audio) => audio.url), ['blob:1']);
    assert.deepEqual(seen.filter((row) => row.type === 'failed').map((row) => row.index), [0]);
    assert.deepEqual(result, { cancelled: false, failed: true, played: 1 });
});

test('replaying a turn reuses its decoded clips', async () => {
    const { queue } = setup();
    let loads = 0;
    const loadClip = async ({ index }) => {
        loads += 1;
        return { id: index };
    };
    const clips = [{ index: 0 }, { index: 1 }];
    await queue.play({ turnId: 'same', clips, loadClip });
    await queue.play({ turnId: 'same', clips, loadClip });
    assert.equal(loads, 2);
});

test('only the last two turns keep their clips', async () => {
    const { queue, revoked } = setup({ maxTurns: 2 });
    const loadClip = async ({ index }) => ({ id: index });
    await queue.play({ turnId: 'a', clips: [{ index: 0 }], loadClip });
    await queue.play({ turnId: 'b', clips: [{ index: 1 }], loadClip });
    assert.deepEqual(revoked, []);
    await queue.play({ turnId: 'c', clips: [{ index: 2 }], loadClip });
    assert.deepEqual(revoked, ['blob:0']);
});

test('cancelling stops the clip in flight and settles the play call', async () => {
    const { queue, audios } = setup({ neverEnds: true });
    const seen = [];
    const playing = queue.play({
        turnId: 'cancel',
        clips: [{ index: 0 }],
        loadClip: async () => ({ id: 0 }),
        onState: (state) => seen.push(state)
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(seen.some((row) => row.type === 'playing'), true);
    queue.cancel();
    const result = await playing;
    assert.equal(result.cancelled, true);
    assert.equal(audios[0].paused, true);
});

test('clear aborts playback and releases every cached clip', async () => {
    const { queue, revoked } = setup();
    await queue.play({
        turnId: 'done',
        clips: [{ index: 0 }],
        loadClip: async () => ({ id: 0 })
    });
    queue.clear();
    assert.deepEqual(revoked, ['blob:0']);
});
