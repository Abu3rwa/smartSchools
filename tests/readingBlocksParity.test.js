import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildReadingLevels as buildClientLevels,
    readingBlocksFor as clientBlocksFor
} from '../client/src/pages/student/reading/ReadingViewPage/readingPresentation.js';
import {
    buildReadingLevels as buildServerLevels,
    looksLikeListPart,
    readingBlocksFor as serverBlocksFor,
    readingTextHash,
    suggestedPartKeys
} from '../utils/readingBlocks.js';

const withSections = {
    text: { id: 'text-1', originalText: 'Original passage' },
    targetLevel: 9,
    readingLevels: [
        {
            targetLevel: 9,
            text: '',
            sections: [
                { order: 2, title: 'Trouble in Boston', text: 'British soldiers fired into a crowd.' },
                { order: 1, title: 'Money and the Stamp Act', text: 'Parliament passed the Stamp Act.' }
            ]
        },
        {
            targetLevel: 6,
            text: 'Parliament passed the Stamp Act.\n\nSome people were angry.',
            sections: []
        }
    ]
};

const flatOnly = {
    simplifiedContent: 'First paragraph.\n\nSecond paragraph.',
    targetLevel: 5,
    text: {
        originalText: 'First paragraph.\n\nSecond paragraph.',
        sections: []
    }
};

test('server and client build levels identically', () => {
    for (const content of [withSections, flatOnly]) {
        assert.deepEqual(buildServerLevels(content), buildClientLevels(content));
    }
});

test('server and client build blocks identically for sections and paragraphs', () => {
    const contents = [withSections, flatOnly];
    for (const content of contents) {
        const serverLevels = buildServerLevels(content);
        const clientLevels = buildClientLevels(content);
        serverLevels.forEach((level, index) => {
            assert.deepEqual(serverBlocksFor(level), clientBlocksFor(clientLevels[index]));
        });
    }
});

const withArabic = {
    simplifiedContent: 'كانت المدينة هادئة.\n\nثم بدأ المطر.',
    targetLevel: 7
};

test('server and client count words identically for sections, flat text and fallback', () => {
    const contents = [withSections, flatOnly, withArabic];
    for (const content of contents) {
        const serverLevels = buildServerLevels(content);
        const clientLevels = buildClientLevels(content);
        assert.deepEqual(
            serverLevels.map((level) => level.wordCount),
            clientLevels.map((level) => level.wordCount)
        );
    }
    assert.equal(buildServerLevels(withSections)[0].wordCount, 11);
    assert.equal(buildServerLevels(flatOnly)[0].wordCount, 4);
    assert.equal(buildServerLevels(withArabic)[0].wordCount, 6);
});

test('an explicit wordCount on a level wins on both sides', () => {
    const content = {
        readingLevels: [{ targetLevel: 4, text: 'One two three', sections: [], wordCount: 99 }]
    };
    assert.equal(buildServerLevels(content)[0].wordCount, 99);
    assert.deepEqual(buildServerLevels(content), buildClientLevels(content));
});

test('model-audio hashes stay derived from block text only', () => {
    assert.equal(
        readingTextHash({ targetLevel: 9, blockKey: 's-1', text: 'Parliament passed the Stamp Act.' }),
        'ff2d04e30ad3dd2c45eab3bedbab79a321b6c4f00795e1cd308ebca04102d123'
    );
});

test('timeline-like parts are suggested off', () => {
    const prose = { key: 's-1', text: 'Parliament passed the Stamp Act.' };
    const timeline = {
        key: 's-2',
        text: '1765 Stamp Act\n1766 Repeal\n1770 Boston Massacre\n1776 Independence'
    };
    assert.equal(looksLikeListPart(prose), false);
    assert.equal(looksLikeListPart(timeline), true);
    assert.deepEqual(suggestedPartKeys([prose, timeline]), ['s-1']);
});
