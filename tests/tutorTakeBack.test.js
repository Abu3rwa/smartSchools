import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';

import TutorWallet from '../models/TutorWallet.js';
import TutorCreditEntry from '../models/TutorCreditEntry.js';
import Student from '../models/Student.js';
import AiCreditAccount from '../models/AiCreditAccount.js';
import AiCreditEntry from '../models/AiCreditEntry.js';
import User from '../models/User.js';
import { takeBackCredits } from '../services/tutorService.js';
import { takeBackVoiceCredit } from '../services/voiceTutorService.js';
import { takeBackCredits as takeBackController } from '../controllers/tutorController.js';

const schoolId = new mongoose.Types.ObjectId();
const adminId = new mongoose.Types.ObjectId();
const studentA = new mongoose.Types.ObjectId();
const studentB = new mongoose.Types.ObjectId();
const userA = new mongoose.Types.ObjectId();

const chain = (value) => {
    const query = {
        select: () => query,
        sort: () => query,
        limit: () => query,
        lean: async () => value
    };
    return query;
};

const stub = (target, key, replacement) => {
    const original = target[key];
    target[key] = replacement;
    return () => {
        target[key] = original;
    };
};

const withWallets = async ({ students = [studentA], wallets = [], race = false }, run) => {
    const byStudent = new Map(wallets.map((wallet) => [String(wallet.student), { ...wallet }]));
    const entries = [];
    const attempts = new Map();
    const restores = [
        stub(Student, 'find', () => chain(students.map((id) => ({ _id: id })))),
        stub(TutorWallet, 'findOne', (filter) => chain(byStudent.get(String(filter.student)) || null)),
        stub(TutorWallet, 'findOneAndUpdate', (filter, update) => {
            const wallet = byStudent.get(String(filter.student));
            if (!wallet) return chain(null);
            const take = -Number(update.$inc.credits);
            const attempt = (attempts.get(String(filter.student)) || 0) + 1;
            attempts.set(String(filter.student), attempt);
            if (race && attempt === 1) {
                // A question lands between the read and the guarded update.
                wallet.credits -= 1;
                wallet.spent += 1;
                return chain(null);
            }
            if (filter.credits && wallet.credits < filter.credits.$gte) return chain(null);
            wallet.credits -= take;
            wallet.granted -= take;
            return chain({ ...wallet });
        }),
        stub(TutorCreditEntry, 'create', async (entry) => {
            entries.push(entry);
            return entry;
        })
    ];
    try {
        await run({ byStudent, entries });
    } finally {
        restores.forEach((restore) => restore());
    }
};

test('the tutor ledger accepts the reclaim type', () => {
    const entry = new TutorCreditEntry({
        school: schoolId,
        student: studentA,
        type: 'reclaim',
        credits: -5
    });
    assert.equal(entry.validateSync(), undefined);
});

test('take-back removes only what was asked and keeps the wallet invariant', async () => {
    await withWallets(
        { wallets: [{ school: schoolId, student: studentA, credits: 20, granted: 30, spent: 10 }] },
        async ({ byStudent, entries }) => {
            const rows = await takeBackCredits({
                schoolId,
                studentIds: [String(studentA)],
                credits: 10,
                userId: adminId,
                note: 'Correction'
            });
            assert.equal(rows.length, 1);
            assert.equal(rows[0].taken, 10);
            assert.equal(rows[0].credits, 10);
            assert.equal(rows[0].granted, 20);
            assert.equal(rows[0].spent, 10);
            assert.equal(byStudent.get(String(studentA)).credits, 10);
            assert.equal(byStudent.get(String(studentA)).credits,
                byStudent.get(String(studentA)).granted - byStudent.get(String(studentA)).spent);
            assert.equal(entries.length, 1);
            assert.equal(entries[0].type, 'reclaim');
            assert.equal(entries[0].credits, -10);
            assert.equal(entries[0].balanceAfter, 10);
            assert.equal(String(entries[0].by), String(adminId));
            assert.equal(entries[0].note, 'Correction');
        }
    );
});

test('take-back clamps to the balance and skips students with nothing left', async () => {
    await withWallets(
        {
            students: [studentA, studentB],
            wallets: [
                { school: schoolId, student: studentA, credits: 20, granted: 20, spent: 0 },
                { school: schoolId, student: studentB, credits: 0, granted: 5, spent: 5 }
            ]
        },
        async ({ entries }) => {
            const rows = await takeBackCredits({
                schoolId,
                studentIds: [String(studentA), String(studentB)],
                credits: 50,
                userId: adminId
            });
            assert.equal(rows.length, 1, 'the empty wallet is skipped');
            assert.equal(rows[0].studentId, String(studentA));
            assert.equal(rows[0].taken, 20);
            assert.equal(rows[0].credits, 0);
            assert.equal(entries.length, 1);
            assert.equal(entries[0].credits, -20);
        }
    );
});

test('take-back all empties what is available', async () => {
    await withWallets(
        { wallets: [{ school: schoolId, student: studentA, credits: 7, granted: 9, spent: 2 }] },
        async () => {
            const rows = await takeBackCredits({
                schoolId,
                studentIds: [String(studentA)],
                all: true,
                userId: adminId
            });
            assert.equal(rows[0].taken, 7);
            assert.equal(rows[0].credits, 0);
            assert.equal(rows[0].granted, 2);
            assert.equal(rows[0].spent, 2);
        }
    );
});

test('a lost race retries with the real balance and never overdraws', async () => {
    await withWallets(
        {
            wallets: [{ school: schoolId, student: studentA, credits: 5, granted: 5, spent: 0 }],
            race: true
        },
        async ({ byStudent }) => {
            const rows = await takeBackCredits({
                schoolId,
                studentIds: [String(studentA)],
                credits: 5,
                userId: adminId
            });
            // The concurrent question bought one credit, so only four are left.
            assert.equal(rows[0].taken, 4);
            assert.equal(rows[0].credits, 0);
            assert.equal(byStudent.get(String(studentA)).credits, 0);
        }
    );
});

test('take-back refuses a student from another school', async () => {
    const restores = [stub(Student, 'find', () => chain([]))];
    try {
        await assert.rejects(
            takeBackCredits({
                schoolId,
                studentIds: [String(studentA)],
                credits: 5,
                userId: adminId
            }),
            { statusCode: 404 }
        );
    } finally {
        restores.forEach((restore) => restore());
    }
});

test('take-back validates the amount before touching a wallet', async () => {
    await assert.rejects(
        takeBackCredits({ schoolId, studentIds: [String(studentA)], credits: 0, userId: adminId }),
        { statusCode: 400 }
    );
    await assert.rejects(
        takeBackCredits({ schoolId, studentIds: [String(studentA)], credits: 2.5, userId: adminId }),
        { statusCode: 400 }
    );
});

test('the endpoint rejects an unknown credit kind', async () => {
    const error = await new Promise((resolve) => {
        takeBackController(
            { schoolId, user: { _id: adminId }, body: { kind: 'stars', studentIds: [studentA] } },
            {},
            resolve
        );
    });
    assert.equal(error.statusCode, 400);
});

const withVoiceCredit = async ({ accounts, pool = 1000, students = [], onStudents }, run) => {
    const byUser = new Map(accounts.map((account) => [String(account.user), { ...account }]));
    let poolBalance = pool;
    const entries = [];
    const restores = [
        stub(Student, 'find', (filter) => {
            if (onStudents) onStudents(filter);
            return chain(students);
        }),
        stub(User, 'findOne', () => chain({ _id: userA, role: 'student', roles: ['student'] })),
        stub(AiCreditAccount, 'updateOne', async () => ({ modifiedCount: 1 })),
        stub(AiCreditAccount, 'findOne', (filter) => {
            if (filter.user === null) return chain({ balanceCents: poolBalance });
            const account = byUser.get(String(filter.user));
            return chain(account ? { ...account } : null);
        }),
        stub(AiCreditAccount, 'findOneAndUpdate', (filter, update) => {
            if (filter.user === null) {
                poolBalance += update.$inc.balanceCents;
                return chain({ balanceCents: poolBalance });
            }
            const account = byUser.get(String(filter.user));
            const amount = -Number(update.$inc.schoolCents || 0);
            if (!account) return chain(null);
            if (filter.schoolCents && account.schoolCents < filter.schoolCents.$gte) return chain(null);
            account.balanceCents -= amount;
            account.schoolCents -= amount;
            account.grantedCents -= amount;
            return chain({ ...account });
        }),
        stub(AiCreditEntry, 'create', async (rows) => {
            rows.forEach((entry) => entries.push(entry));
            return rows;
        })
    ];
    try {
        await run({ entries, account: () => byUser.get(String(userA)), poolBalance: () => poolBalance });
    } finally {
        restores.forEach((restore) => restore());
    }
};

test('voice take-back returns only school-allocated credit to the reserve', async (context) => {
    context.mock.method(mongoose.connection, 'transaction', async (callback) =>
        callback({ testSession: true })
    );
    await withVoiceCredit(
        {
            accounts: [{ user: userA, balanceCents: 12, schoolCents: 8, grantedCents: 8 }],
            students: [{ _id: studentA, user: userA }],
            pool: 1000
        },
        async ({ entries, account, poolBalance }) => {
            const data = await takeBackVoiceCredit({
                schoolId,
                studentIds: [String(studentA)],
                credits: 10,
                adminId
            });
            assert.equal(data.takenTotal, 8);
            assert.equal(data.students, 1);
            assert.equal(data.reserveCredits, 1008);
            assert.equal(data.rows[0].taken, 8);
            assert.equal(data.rows[0].voiceCredits, 4, 'the platform grant stays with the student');
            assert.equal(data.rows[0].reclaimableCredits, 0);
            assert.equal(account().schoolCents, 0);
            assert.equal(poolBalance(), 1008);
            assert.deepEqual(
                entries.map((entry) => [entry.accountType, entry.type, entry.amountCents]),
                [
                    ['user', 'reclaim', -8],
                    ['school', 'reclaim', 8]
                ]
            );
        }
    );
});

test('voice take-back asks only for students with a sign-in and skips empty accounts', async (context) => {
    context.mock.method(mongoose.connection, 'transaction', async (callback) =>
        callback({ testSession: true })
    );
    let filter = null;
    await withVoiceCredit(
        {
            accounts: [{ user: userA, balanceCents: 3, schoolCents: 0, grantedCents: 0 }],
            students: [{ _id: studentA, user: userA }],
            pool: 500,
            onStudents: (query) => {
                filter = query;
            }
        },
        async ({ account, poolBalance }) => {
            const data = await takeBackVoiceCredit({
                schoolId,
                classId: String(new mongoose.Types.ObjectId()),
                credits: 2,
                adminId
            });
            assert.deepEqual(filter.user, { $ne: null });
            assert.equal(data.takenTotal, 0, 'nothing school-allocated is left');
            assert.equal(data.rows.length, 0);
            assert.equal(data.reserveCredits, 500);
            assert.equal(account().schoolCents, 0);
            assert.equal(poolBalance(), 500);
        }
    );
});

test('voice take-back all moves the whole reclaimable share', async (context) => {
    context.mock.method(mongoose.connection, 'transaction', async (callback) =>
        callback({ testSession: true })
    );
    await withVoiceCredit(
        {
            accounts: [{ user: userA, balanceCents: 9, schoolCents: 6, grantedCents: 6 }],
            students: [{ _id: studentA, user: userA }],
            pool: 200
        },
        async ({ poolBalance }) => {
            const data = await takeBackVoiceCredit({
                schoolId,
                studentIds: [String(studentA)],
                all: true,
                adminId
            });
            assert.equal(data.takenTotal, 6);
            assert.equal(data.rows[0].voiceCredits, 3);
            assert.equal(poolBalance(), 206);
        }
    );
});
