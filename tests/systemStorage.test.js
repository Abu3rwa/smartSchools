import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { getStorageStats, cleanStorage } from '../controllers/systemStorageController.js';

test('systemStorageController exports required handler functions', () => {
    assert.equal(typeof getStorageStats, 'function');
    assert.equal(typeof cleanStorage, 'function');
});

test('cleanStorage requires at least one cleanup target', async () => {
    let statusCode = 200;
    let jsonResponse = null;

    const req = {
        body: { targets: [] }
    };
    const res = {
        status(code) {
            statusCode = code;
            return this;
        },
        json(data) {
            jsonResponse = data;
            return this;
        }
    };

    await cleanStorage(req, res, () => {});

    assert.equal(statusCode, 400);
    assert.equal(jsonResponse?.success, false);
    assert.match(jsonResponse?.message, /specify at least one cleanup target/i);
});

test('getStorageStats only reads storage metrics for cleanable collections', async () => {
    const originalDb = mongoose.connection.db;
    const aggregatedCollections = [];
    let listCollectionsCalls = 0;
    const countsByCollection = {
        behaviors: 100,
        notifications: 50,
        spellingemaildeliveries: 8,
        emailreports: 3,
        communicationemaillogs: 2,
        aitokenusages: 7,
        importruns: 1
    };
    const sizesInMB = {
        behaviors: 20,
        notifications: 6,
        spellingemaildeliveries: 4
    };

    mongoose.connection.db = {
        stats: async () => ({
            dataSize: 100 * 1024 * 1024,
            storageSize: 60 * 1024 * 1024,
            indexSize: 10 * 1024 * 1024,
            collections: 7,
            objects: 168
        }),
        listCollections: () => {
            listCollectionsCalls += 1;
            return { toArray: async () => [] };
        },
        collection(name) {
            return {
                aggregate: () => {
                    aggregatedCollections.push(name);
                    return {
                        toArray: async () => [{
                            storageStats: {
                                size: (sizesInMB[name] || 0) * 1024 * 1024
                            }
                        }]
                    };
                },
                countDocuments: async (query = {}) => {
                    if (name === 'behaviors' && query.eventType === 'api_request') return 20;
                    if (name === 'behaviors' && query.eventType === 'session_heartbeat') return 30;
                    if (name === 'behaviors' && query.eventType === 'page_view') return 10;
                    if (name === 'notifications' && query.status) return 15;
                    if (name === 'spellingemaildeliveries' && query.status === 'sent') return 6;
                    return countsByCollection[name] || 0;
                }
            };
        }
    };

    try {
        const response = await new Promise((resolve, reject) => {
            getStorageStats({}, {
                status() {
                    return this;
                },
                json(data) {
                    resolve(data);
                }
            }, reject);
        });

        assert.equal(response.success, true);
        assert.deepEqual(aggregatedCollections.sort(), [
            'behaviors',
            'notifications',
            'spellingemaildeliveries'
        ]);
        assert.equal(listCollectionsCalls, 0);
        assert.equal(response.data.categories.routineTelemetry.estimatedMB, 10);
        assert.equal(response.data.categories.sentEmails.estimatedMB, 4);
        assert.equal(response.data.categories.oldNotifications.estimatedMB, 6);
        assert.equal(response.data.categories.sentEmails.count, 11);
    } finally {
        mongoose.connection.db = originalDb;
    }
});
