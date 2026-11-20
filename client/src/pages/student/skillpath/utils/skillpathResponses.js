const WIRE_TYPE_ALIASES = { mcq: "multiple_choice", fill_blank: "fill_in_blank" };

export const normalizeWireType = (type) => WIRE_TYPE_ALIASES[type] || type;

export const encodeMultiSelectResponse = (ids) => [...new Set(
  (Array.isArray(ids) ? ids : []).map((id) => String(id ?? "").trim()).filter(Boolean)
)].join("|");

export const encodeMatchingResponse = (lefts, selections) => (Array.isArray(lefts) ? lefts : [])
  .map((left) => ({ left, right: String(selections?.[left] ?? "").trim() }))
  .filter((pair) => pair.left && pair.right)
  .map((pair) => `${pair.left}::${pair.right}`)
  .join("|");

export const encodeOrderingResponse = (ids) => (Array.isArray(ids) ? ids : [])
  .map((id) => String(id ?? "").trim())
  .filter(Boolean)
  .join(">");

export const toggleId = (list, id) => (list.includes(id)
  ? list.filter((entry) => entry !== id)
  : [...list, id]);

export const moveItem = (list, from, to) => {
  if (from === to || from < 0 || from >= list.length) return [...list];
  const target = Math.max(0, Math.min(list.length - 1, to));
  const next = [...list];
  const [entry] = next.splice(from, 1);
  next.splice(target, 0, entry);
  return next;
};

export const matchingComplete = (lefts, selections) => Array.isArray(lefts)
  && lefts.length > 0
  && lefts.every((left) => String(selections?.[left] ?? "").trim());

// A right-hand term may repeat across pairs, so availability is counted, not boolean.
export const rightAvailability = (rights, selections) => {
  const offered = new Map();
  (rights || []).forEach((right) => offered.set(right, (offered.get(right) || 0) + 1));
  const used = new Map();
  Object.values(selections || {}).forEach((right) => used.set(right, (used.get(right) || 0) + 1));
  return (right) => (offered.get(right) || 0) > (used.get(right) || 0);
};

export const dropIndexForPoint = (rects, y) => {
  for (let index = 0; index < rects.length; index += 1) {
    if (y < rects[index].top + rects[index].height / 2) return index;
  }
  return Math.max(0, rects.length - 1);
};

export const expectedTextFor = (item, expected) => {
  const value = String(expected ?? "");
  if (normalizeWireType(item?.type) === "multiple_choice") {
    return (item?.options || []).find((option) => option.id === value)?.text || value;
  }
  return value;
};