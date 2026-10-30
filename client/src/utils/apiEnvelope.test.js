import assert from 'node:assert/strict';
import test from 'node:test';
import { unwrapEnvelope } from './apiEnvelope.js';

test('the payload inside the envelope is what callers receive', async () => {
  const request = Promise.resolve({ data: { success: true, data: { token: 'abc', surveys: [] } } });
  assert.deepEqual(await unwrapEnvelope(request), { token: 'abc', surveys: [] });
});

test('a rejected request keeps its error for the caller', async () => {
  const failure = { response: { status: 401 } };
  await assert.rejects(
    () => unwrapEnvelope(Promise.reject(failure)),
    (error) => error === failure,
  );
});
