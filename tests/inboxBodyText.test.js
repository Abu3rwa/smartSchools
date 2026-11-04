import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';

import {
    extractPlainText,
    htmlToText,
    trimBody
} from '../services/inbox/inboxBodyText.js';

const encoded = (text) => Buffer.from(text, 'utf8').toString('base64url');

const textPayload = (text) => ({
    mimeType: 'text/plain',
    body: { data: encoded(text) }
});

test('quoted reply lines and everything after the reply header are removed', () => {
    const body = [
        'Thanks, I will send the file today.',
        '',
        '> Could you send the file?',
        '> Thanks',
        'On Mon, 2 Nov 2026 at 09:00, Sami Ali wrote:',
        'Please send the file.',
        '-- ',
        'Sami Ali'
    ].join('\n');

    assert.equal(trimBody(body), 'Thanks, I will send the file today.');
});

test('a signature after the signature line is removed', () => {
    assert.equal(
        trimBody('Noted.\n\n-- \nMs Huda\nGrade 5'),
        'Noted.'
    );
});

test('an original-message separator ends the kept text', () => {
    assert.equal(
        trimBody('Approved.\n-----Original Message-----\nFrom: admin@school.test'),
        'Approved.'
    );
});

test('the text is capped without breaking the cut cleanly', () => {
    const capped = trimBody('word '.repeat(1000), 50);
    assert.ok(capped.length <= 50);
    assert.ok(capped.length >= 49);
    assert.equal(capped.endsWith(' '), false);
});

test('Arabic text survives trimming unchanged', () => {
    const body = 'مرحبًا، سأرسل التقرير صباح الغد.\n\nشكرًا\n> رسالة سابقة';
    assert.equal(trimBody(body), 'مرحبًا، سأرسل التقرير صباح الغد.\n\nشكرًا');
});

test('plain text parts are preferred and decoded from base64url', () => {
    const payload = {
        mimeType: 'multipart/alternative',
        parts: [
            textPayload('Plain words, سطر عربي.'),
            { mimeType: 'text/html', body: { data: encoded('<p>HTML version</p>') } }
        ]
    };
    assert.equal(extractPlainText(payload), 'Plain words, سطر عربي.');
});

test('an HTML-only email becomes readable text with entities decoded', () => {
    const payload = {
        mimeType: 'text/html',
        body: { data: encoded('<p>Tom &amp; Jerry<br>line two</p><style>p{color:red}</style>') }
    };
    assert.equal(extractPlainText(payload), 'Tom & Jerry\nline two');
    assert.equal(htmlToText('<div>A&nbsp;&#39;B&#x27;</div>'), "A 'B'");
});

test('attachments are never read as the email body', () => {
    const payload = {
        mimeType: 'multipart/mixed',
        parts: [
            textPayload('The real message.'),
            {
                mimeType: 'text/plain',
                filename: 'notes.txt',
                body: { data: encoded('attachment words') }
            }
        ]
    };
    const text = extractPlainText(payload);
    assert.equal(text, 'The real message.');
    assert.equal(text.includes('attachment words'), false);
});
