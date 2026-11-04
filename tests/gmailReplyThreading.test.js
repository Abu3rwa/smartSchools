import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import gmailOAuthService, {
    buildGmailRequestBody,
    sendRawGmailMessage
} from '../services/gmailOAuthService.js';

const decodeRaw = (raw) => Buffer.from(String(raw).replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    .toString('utf8');

const withAuthorizedClient = async (run) => {
    const original = gmailOAuthService.getAuthorizedGmailClient;
    gmailOAuthService.getAuthorizedGmailClient = async () => run.client;
    try {
        return await run.assert();
    } finally {
        gmailOAuthService.getAuthorizedGmailClient = original;
    }
};

test('a reply carries In-Reply-To, References and Reply-To', async () => {
    const raw = await gmailOAuthService.buildRawGmailMessage({
        from: 'teacher@example.test',
        to: 'parent@example.test',
        replyTo: 'office@example.test',
        inReplyTo: '<message-1@example.test>',
        references: '<message-0@example.test> <message-1@example.test>',
        subject: 'Re: Meeting',
        text: 'See you then.'
    });
    const message = decodeRaw(raw);

    assert.match(message, /^Reply-To: office@example\.test$/m);
    assert.match(message, /^In-Reply-To: <message-1@example\.test>$/m);
    assert.match(message, /^References: <message-0@example\.test> <message-1@example\.test>$/m);
});

test('a plain message carries none of the reply headers', async () => {
    const raw = await gmailOAuthService.buildRawGmailMessage({
        from: 'teacher@example.test',
        to: 'parent@example.test',
        subject: 'Meeting',
        text: 'Hello.'
    });
    const message = decodeRaw(raw);

    assert.doesNotMatch(message, /^Reply-To:/m);
    assert.doesNotMatch(message, /^In-Reply-To:/m);
    assert.doesNotMatch(message, /^References:/m);
});

test('threadId reaches messages.send only when provided', async () => {
    const calls = [];
    const gmail = {
        users: {
            messages: {
                send: async (args) => {
                    calls.push(args);
                    return { data: { id: 'message-1', threadId: 'thread-1' } };
                }
            }
        }
    };

    await sendRawGmailMessage(gmail, 'raw-with-thread', { threadId: 'thread-1' });
    await sendRawGmailMessage(gmail, 'raw-without-thread', { threadId: '   ' });
    await sendRawGmailMessage(gmail, 'raw-no-thread');

    assert.equal(calls[0].userId, 'me');
    assert.equal(calls[0].requestBody.raw, 'raw-with-thread');
    assert.equal(calls[0].requestBody.threadId, 'thread-1');
    assert.equal('threadId' in calls[1].requestBody, false);
    assert.equal('threadId' in calls[2].requestBody, false);
});

test('buildGmailRequestBody trims the thread id', () => {
    assert.deepEqual(buildGmailRequestBody('raw', { threadId: ' thread-9 ' }), {
        raw: 'raw',
        threadId: 'thread-9'
    });
    assert.deepEqual(buildGmailRequestBody('raw'), { raw: 'raw' });
});

test('createGmailDraft stores the raw message and thread in Gmail drafts', async () => {
    let createArgs;
    await withAuthorizedClient({
        client: {
            accountEmail: 'teacher@example.test',
            gmail: {
                users: {
                    drafts: {
                        create: async (args) => {
                            createArgs = args;
                            return { data: { id: 'draft-1', message: { id: 'message-1', threadId: 'thread-1' } } };
                        }
                    }
                }
            }
        },
        assert: async () => {
            const result = await gmailOAuthService.createGmailDraft('user-1', {
                to: 'parent@example.test',
                subject: 'Re: Meeting',
                text: 'See you then.',
                threadId: 'thread-1'
            });

            assert.deepEqual(result, { draftId: 'draft-1', messageId: 'message-1', threadId: 'thread-1' });
            assert.equal(createArgs.userId, 'me');
            assert.equal(createArgs.requestBody.message.threadId, 'thread-1');
            const message = decodeRaw(createArgs.requestBody.message.raw);
            assert.match(message, /^From: teacher@example\.test$/m);
            assert.match(message, /^To: parent@example\.test$/m);
        }
    });
});

test('deleteGmailDraft treats a missing draft as already gone', async () => {
    let deletedId = '';
    await withAuthorizedClient({
        client: {
            gmail: {
                users: {
                    drafts: {
                        delete: async ({ id }) => {
                            deletedId = id;
                            if (id === 'draft-missing') {
                                throw Object.assign(new Error('Not found'), { code: 404 });
                            }
                            if (id === 'draft-broken') throw new Error('Gmail is down');
                            return {};
                        }
                    }
                }
            }
        },
        assert: async () => {
            assert.equal(await gmailOAuthService.deleteGmailDraft('user-1', 'draft-1'), true);
            assert.equal(deletedId, 'draft-1');
            assert.equal(await gmailOAuthService.deleteGmailDraft('user-1', 'draft-missing'), true);
            await assert.rejects(
                gmailOAuthService.deleteGmailDraft('user-1', 'draft-broken'),
                /Gmail is down/
            );
        }
    });
});
