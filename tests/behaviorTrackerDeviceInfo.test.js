import assert from 'node:assert/strict';
import test from 'node:test';

import { parseDeviceInfoFromUserAgent } from '../middleware/behaviorTracker.js';

test('parseDeviceInfoFromUserAgent returns mobile details for iPhone Safari', () => {
  const info = parseDeviceInfoFromUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  );
  assert.equal(info.type, 'mobile');
  assert.equal(info.isMobile, true);
  assert.equal(info.isTablet, false);
  assert.equal(info.browser, 'Safari');
  assert.equal(info.os, 'iOS');
});

test('parseDeviceInfoFromUserAgent returns tablet details for iPad', () => {
  const info = parseDeviceInfoFromUserAgent(
    'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
  );
  assert.equal(info.type, 'tablet');
  assert.equal(info.isMobile, false);
  assert.equal(info.isTablet, true);
  assert.equal(info.os, 'iOS');
});

test('parseDeviceInfoFromUserAgent returns desktop details for Windows Chrome', () => {
  const info = parseDeviceInfoFromUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
  );
  assert.equal(info.type, 'desktop');
  assert.equal(info.browser, 'Chrome');
  assert.equal(info.os, 'Windows');
});

test('parseDeviceInfoFromUserAgent returns unknown shape for empty user-agent', () => {
  const info = parseDeviceInfoFromUserAgent('');
  assert.deepEqual(info, {
    type: 'unknown',
    browser: 'Unknown',
    os: 'Unknown',
    platform: 'Unknown',
    isMobile: false,
    isTablet: false
  });
});
