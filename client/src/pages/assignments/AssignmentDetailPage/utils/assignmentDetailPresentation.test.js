import test from 'node:test';
import assert from 'node:assert/strict';
import { collectAssignmentResources, getSafeUrl } from './assignmentDetailPresentation.js';

test('resources combine external links, Drive files and uploaded files', () => {
  const resources = collectAssignmentResources({
    links: [
      { _id: 'l1', type: 'external_url', title: 'Study guide', url: 'https://example.com/guide' },
      { _id: 'l2', type: 'practice_objective', title: 'Objective', url: '' },
      { _id: 'l3', type: 'external_url', title: 'Unsafe', url: 'javascript:alert(1)' }
    ],
    driveAttachments: [
      { fileId: 'f1', fileName: 'Slides', webViewLink: 'https://drive.google.com/file/d/f1/view' }
    ],
    attachments: [
      { _id: 'a1', fileName: 'worksheet.pdf', url: 'https://files.example.com/w.pdf' }
    ]
  });

  assert.deepEqual(resources.map((resource) => resource.title), [
    'Study guide',
    'Objective',
    'Slides',
    'worksheet.pdf'
  ]);
  assert.equal(resources[1].url, '', 'an in-app reference has no URL to open');
  assert.ok(resources.filter((resource) => resource.url).every((resource) => resource.url.startsWith('https://')));
});

test('the same URL is listed once and credentialed URLs are rejected', () => {
  const resources = collectAssignmentResources({
    links: [
      { _id: 'l1', type: 'external_url', title: 'Guide', url: 'https://example.com/guide' },
      { _id: 'l2', type: 'external_url', title: 'Same guide', url: 'https://example.com/guide' }
    ],
    driveAttachments: [
      { fileId: 'f1', fileName: 'Private', webViewLink: 'https://user:pass@example.com/doc' }
    ]
  });

  assert.equal(resources.length, 1);
  assert.equal(getSafeUrl('https://user:pass@example.com/doc'), null);
});
