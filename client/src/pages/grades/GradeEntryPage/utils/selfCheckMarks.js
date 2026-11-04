export const isGradeRowEdited = (row = {}) => (
    String(row?.marks ?? '').trim() !== '' || String(row?.remarks ?? '').trim() !== ''
);

/**
 * Builds the marks patch for "Use these marks". Rows the teacher already
 * touched are skipped unless overwrite is true, so typing always wins by default.
 */
export const buildSelfCheckPatch = ({ rows = [], grades = {}, overwrite = false }) => {
    const patch = {};
    let updated = 0;
    let skipped = 0;
    let conflicts = 0;

    rows.forEach((row) => {
        const studentId = row?.studentId;
        if (!studentId) return;
        const edited = isGradeRowEdited(grades[studentId]);
        if (edited) conflicts += 1;
        if (edited && !overwrite) {
            skipped += 1;
            return;
        }
        patch[studentId] = { marks: row.marks, remarks: row.remarks || '' };
        updated += 1;
    });

    return { patch, updated, skipped, conflicts };
};
