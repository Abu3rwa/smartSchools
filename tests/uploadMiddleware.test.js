import assert from 'node:assert/strict';
import test from 'node:test';

import { isAllowedImageUpload } from '../middleware/upload.js';

test('isAllowedImageUpload accepts allowed mime and extension combinations', () => {
  assert.equal(isAllowedImageUpload({ mimetype: 'image/jpeg', originalname: 'photo.jpg' }), true);
  assert.equal(isAllowedImageUpload({ mimetype: 'image/png', originalname: 'avatar.png' }), true);
  assert.equal(isAllowedImageUpload({ mimetype: 'image/webp', originalname: 'banner.webp' }), true);
});

test('isAllowedImageUpload rejects disallowed or spoofed combinations', () => {
  assert.equal(isAllowedImageUpload({ mimetype: 'image/svg+xml', originalname: 'icon.svg' }), false);
  assert.equal(isAllowedImageUpload({ mimetype: 'image/jpeg', originalname: 'payload.exe' }), false);
  assert.equal(isAllowedImageUpload({ mimetype: 'application/pdf', originalname: 'doc.pdf' }), false);
});
