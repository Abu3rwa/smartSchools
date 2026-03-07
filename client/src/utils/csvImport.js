export const readFileAsText = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
});

const parseCsvLine = (line) => {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const next = line[i + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
            continue;
        }

        current += char;
    }

    values.push(current.trim());
    return values;
};

export const parseCsvText = (text) => {
    const content = String(text || '').replace(/^\uFEFF/, '');
    const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    if (lines.length < 2) {
        return {
            headers: [],
            rows: [],
            errors: ['CSV must include a header row and at least one data row']
        };
    }

    const headers = parseCsvLine(lines[0]).map((header) => header.trim());
    const rows = [];
    const errors = [];

    for (let index = 1; index < lines.length; index++) {
        const values = parseCsvLine(lines[index]);
        if (values.length !== headers.length) {
            errors.push(`Row ${index + 1}: expected ${headers.length} columns, got ${values.length}`);
            continue;
        }

        const row = {};
        headers.forEach((header, headerIndex) => {
            row[header] = values[headerIndex];
        });
        rows.push(row);
    }

    return { headers, rows, errors };
};

export const parseCsvFile = async (file, { requiredColumns = [] } = {}) => {
    const text = await readFileAsText(file);
    const { headers, rows, errors } = parseCsvText(text);
    const missingColumns = requiredColumns.filter((column) => !headers.includes(column));

    if (missingColumns.length > 0) {
        return {
            headers,
            rows: [],
            errors: [...errors, `Missing required columns: ${missingColumns.join(', ')}`]
        };
    }

    return { headers, rows, errors };
};
