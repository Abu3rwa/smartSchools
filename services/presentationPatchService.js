const PATCHABLE_SLIDE_FIELDS = new Set([
  "title",
  "subtitle",
  "bodyHtml",
  "bodyHtml2",
  "speakerNotes",
  "layout",
  "imageUrl",
  "imageAlt",
  "imageCaption",
  "background.type",
  "background.solidColor",
  "background.gradientFrom",
  "background.gradientTo",
  "background.gradientAngle",
  "background.imageUrl",
  "background.overlayColor",
  "background.overlayOpacity",
]);

const getNestedValue = (obj, path) => {
  const parts = path.split(".");
  let cursor = obj;
  for (const part of parts) {
    if (cursor == null) return undefined;
    cursor = cursor[part];
  }
  return cursor;
};

const setNestedValue = (obj, path, value) => {
  const parts = path.split(".");
  let cursor = obj;

  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (cursor[part] == null || typeof cursor[part] !== "object") {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }

  cursor[parts[parts.length - 1]] = value;
};

const unsetNestedValue = (obj, path) => {
  const parts = path.split(".");
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (cursor == null) return;
    cursor = cursor[part];
  }

  if (cursor && typeof cursor === "object") {
    delete cursor[parts[parts.length - 1]];
  }
};

const normalizeOperations = (operations = []) =>
  operations.filter(
    (operation) =>
      operation &&
      typeof operation === "object" &&
      typeof operation.op === "string" &&
      typeof operation.path === "string"
  );

export const applySlidePatchOperations = (slide, operations = []) => {
  const normalizedOperations = normalizeOperations(operations);

  for (const operation of normalizedOperations) {
    const op = operation.op.toLowerCase();
    const path = operation.path.trim();

    if (!PATCHABLE_SLIDE_FIELDS.has(path)) {
      throw Object.assign(new Error(`Unsupported patch path: ${path}`), {
        status: 400,
      });
    }

    if (op === "set" || op === "replace") {
      setNestedValue(slide, path, operation.value);
      continue;
    }

    if (op === "unset" || op === "remove") {
      unsetNestedValue(slide, path);
      continue;
    }

    if (op === "append") {
      const current = getNestedValue(slide, path);
      const next = Array.isArray(current) ? current : [];
      next.push(operation.value);
      setNestedValue(slide, path, next);
      continue;
    }

    throw Object.assign(new Error(`Unsupported patch operation: ${op}`), {
      status: 400,
    });
  }

  return slide;
};
