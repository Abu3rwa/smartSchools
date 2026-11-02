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
