const asText = (value) => (value == null ? "" : String(value));

/** Everything a student can type to find a lesson: its title and its numbers. */
const matches = (lesson, query) => {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return true;
  return [
    lesson.title,
    lesson.lessonNumber,
    lesson.chapterNumber,
    lesson.unitNumber,
  ]
    .map(asText)
    .some((value) => value.toLowerCase().includes(needle));
};

/**
 * One flat list for the picker, with the unit and chapter headings kept so the
 * rows are not a wall of "1". A filter keeps only the lessons that match and
 * the headings above them.
 */
export const flatLessons = (outline = [], query = "") => {
  const rows = [];
  for (const unit of Array.isArray(outline) ? outline : []) {
    const unitLessons = [];
    const grouped = [];

    const pushLesson = (lesson, chapterNumber) => {
      if (!matches(lesson, query)) return;
      unitLessons.push(lesson);
      grouped.push({
        kind: "lesson",
        key: `lesson-${lesson.id}`,
        lesson,
        chapterNumber: chapterNumber ?? null,
      });
    };

    for (const lesson of unit.lessons || []) {
      pushLesson(lesson, null);
    }
    for (const chapter of unit.chapters || []) {
      const chapterRows = [];
      for (const lesson of chapter.lessons || []) {
        if (!matches(lesson, query)) continue;
        unitLessons.push(lesson);
        chapterRows.push({
          kind: "lesson",
          key: `lesson-${lesson.id}`,
          lesson,
          chapterNumber: chapter.chapterNumber,
        });
      }
      if (chapterRows.length) {
        grouped.push(
          {
            kind: "chapter",
            key: `chapter-${asText(unit.unitNumber)}-${chapter.chapterNumber}`,
            unitNumber: unit.unitNumber,
            chapterNumber: chapter.chapterNumber,
            chapterTitle: chapter.chapterTitle || "",
          },
          ...chapterRows,
        );
      }
    }

    if (!unitLessons.length && String(query || "").trim()) continue;
    rows.push({
      kind: "unit",
      key: `unit-${asText(unit.unitNumber)}`,
      unitNumber: unit.unitNumber,
      unitTitle: unit.unitTitle || "",
      count: unitLessons.length,
    });
    rows.push(...grouped);
  }
  return rows;
};
