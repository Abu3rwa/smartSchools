import test from "node:test";
import assert from "node:assert/strict";

import {
  dropIndexForPoint,
  encodeMatchingResponse,
  encodeMultiSelectResponse,
  encodeOrderingResponse,
  expectedTextFor,
  matchingComplete,
  moveItem,
  normalizeWireType,
  rightAvailability,
  toggleId
} from "./skillpathResponses.js";

test("normalizeWireType maps legacy wire names to canonical types", () => {
  assert.equal(normalizeWireType("mcq"), "multiple_choice");
  assert.equal(normalizeWireType("fill_blank"), "fill_in_blank");
  assert.equal(normalizeWireType("matching"), "matching");
  assert.equal(normalizeWireType("ordering"), "ordering");
});

test("encodeMultiSelectResponse joins unique ids with the pair separator", () => {
  assert.equal(encodeMultiSelectResponse(["a", "c", "a"]), "a|c");
  assert.equal(encodeMultiSelectResponse([]), "");
  assert.equal(encodeMultiSelectResponse([" b ", ""]), "b");
});

test("encodeMatchingResponse follows the left column order and skips empty slots", () => {
  const encoded = encodeMatchingResponse(
    ["cat", "dog", "cow"],
    { dog: "كلب", cat: "قطة" }
  );
  assert.equal(encoded, "cat::قطة|dog::كلب");
  assert.equal(encodeMatchingResponse(["cat"], {}), "");
});

test("encodeOrderingResponse joins ids with the order separator", () => {
  assert.equal(encodeOrderingResponse(["o2", "o1", "o3"]), "o2>o1>o3");
  assert.equal(encodeOrderingResponse([]), "");
});

test("toggleId adds and removes without mutating the original list", () => {
  const start = ["a"];
  const added = toggleId(start, "b");
  assert.deepEqual(added, ["a", "b"]);
  assert.deepEqual(start, ["a"]);
  assert.deepEqual(toggleId(added, "a"), ["b"]);
});

test("moveItem reorders and clamps out-of-range targets", () => {
  assert.deepEqual(moveItem(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 0, 9), ["b", "c", "a"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 1, 1), ["a", "b", "c"]);
});

test("matchingComplete requires every left slot to be filled", () => {
  assert.equal(matchingComplete(["a", "b"], { a: "x", b: "y" }), true);
  assert.equal(matchingComplete(["a", "b"], { a: "x" }), false);
  assert.equal(matchingComplete([], {}), false);
  assert.equal(matchingComplete(["a"], { a: "  " }), false);
});

test("rightAvailability counts repeated right terms instead of treating them as one", () => {
  const available = rightAvailability(["yes", "yes", "no"], { a: "yes" });
  assert.equal(available("yes"), true);
  const stricter = rightAvailability(["yes", "yes", "no"], { a: "yes", b: "yes" });
  assert.equal(stricter("yes"), false);
  assert.equal(stricter("no"), true);
});

test("dropIndexForPoint picks the row whose midpoint is below the pointer", () => {
  const rects = [
    { top: 0, height: 40 },
    { top: 40, height: 40 },
    { top: 80, height: 40 }
  ];
  assert.equal(dropIndexForPoint(rects, 5), 0);
  assert.equal(dropIndexForPoint(rects, 25), 1);
  assert.equal(dropIndexForPoint(rects, 95), 2);
  assert.equal(dropIndexForPoint(rects, 500), 2);
  assert.equal(dropIndexForPoint([], 10), 0);
});

test("expectedTextFor resolves mcq option ids to text and passes other types through", () => {
  const mcq = { type: "mcq", options: [{ id: "a", text: "unhappy" }] };
  assert.equal(expectedTextFor(mcq, "a"), "unhappy");
  assert.equal(expectedTextFor(mcq, "zz"), "zz");
  assert.equal(expectedTextFor({ type: "matching" }, "cat = قطة"), "cat = قطة");
  assert.equal(expectedTextFor({ type: "numeric_response" }, "3/4"), "3/4");
});