import assert from "node:assert/strict";
import test from "node:test";
import { isBlockedImageHost, slideImageUrlError } from "../utils/slideImageUrl.js";

test("public lesson images still pass", () => {
  for (const url of [
    "https://cdn.example.org/a/b.png",
    "https://images.example.com/pic?size=large&token=abc",
    "http://legacy.example.net/visual.jpg",
    "https://sub.domain.co.uk/i.webp",
    "",
  ]) {
    assert.equal(slideImageUrlError(url), "", `${url} should be accepted`);
  }
});

test("internal and encoded targets are refused", () => {
  const rejected = [
    "http://127.0.0.1/x.png",
    "http://localhost:8000/x.png",
    "http://10.0.3.7/x.png",
    "http://172.16.0.1/x.png",
    "http://192.168.1.1/x.png",
    "http://169.254.169.254/latest/meta-data",
    "http://100.64.1.2/x.png",
    "http://[::1]/x.png",
    "http://[fd00::1234]/x.png",
    "http://server.internal/x.png",
    "http://printer.local/x.png",
    "http://2130706433/x.png",
    "http://0x7f000001/x.png",
    "https://user:pass@example.com/x.png",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "https://example.com/a b.png",
  ];
  for (const url of rejected) {
    assert.notEqual(slideImageUrlError(url), "", `${url} should be rejected`);
  }
});

test("oversized image URLs keep the previous limit", () => {
  assert.match(
    slideImageUrlError(`https://example.com/${"a".repeat(2100)}`),
    /2,048 characters/,
  );
});

test("host blocking covers literal and suffix forms", () => {
  assert.equal(isBlockedImageHost("192.168.0.9"), true);
  assert.equal(isBlockedImageHost("8.8.8.8"), false);
  assert.equal(isBlockedImageHost("EXAMPLE.COM."), false);
  assert.equal(isBlockedImageHost(""), true);
});
