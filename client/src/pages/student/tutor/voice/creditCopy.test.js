import assert from 'node:assert/strict';
import test from 'node:test';
import { creditCopy, emptyReason, messagesLeft, walletState } from './creditCopy.js';

test('messages left is whole messages the balance can pay for', () => {
    assert.equal(messagesLeft(30, 3), 10);
    assert.equal(messagesLeft(8, 3), 2);
    assert.equal(messagesLeft(2, 3), 0);
    assert.equal(messagesLeft(0, 3), 0);
    assert.equal(messagesLeft(10, 0), 0);
    assert.equal(messagesLeft('9', '3'), 3);
});

test('the wallet is ok, on its last message, or empty', () => {
    assert.equal(walletState({ credits: 30, price: 3 }), 'ok');
    assert.equal(walletState({ credits: 4, price: 3 }), 'last');
    assert.equal(walletState({ credits: 3, price: 3 }), 'last');
    assert.equal(walletState({ credits: 2, price: 3 }), 'empty');
    assert.equal(walletState({ credits: 0, price: 3 }), 'empty');
});

test('a free or unset price never blocks a student', () => {
    assert.equal(walletState({ credits: 0, price: 0 }), 'ok');
    assert.equal(walletState(), 'ok');
});

test('running out is told apart from never having enough', () => {
    assert.equal(emptyReason({ creditsSpent: 6 }), 'ranOut');
    assert.equal(emptyReason({ creditsSpent: 0 }), 'noCredit');
    assert.equal(emptyReason({}), 'noCredit');
});

test('creditCopy answers all the board questions in one object', () => {
    assert.deepEqual(creditCopy({ credits: 30, price: 3 }), {
        credits: 30,
        price: 3,
        messages: 10,
        state: 'ok',
        canAsk: true,
        reason: ''
    });
    assert.deepEqual(creditCopy({ credits: 1, price: 3, creditsSpent: 9 }), {
        credits: 1,
        price: 3,
        messages: 0,
        state: 'empty',
        canAsk: false,
        reason: 'ranOut'
    });
    assert.equal(creditCopy({ credits: 0, price: 3 }).reason, 'noCredit');
});

test('junk input never turns into a negative or fractional balance', () => {
    const copy = creditCopy({ credits: -5, price: 'x', creditsSpent: -2 });
    assert.equal(copy.credits, 0);
    assert.equal(copy.price, 0);
    assert.equal(copy.messages, 0);
    assert.equal(copy.canAsk, true);
    assert.equal(copy.reason, '');
});
