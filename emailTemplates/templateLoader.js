import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const cache = {};

/**
 * Load an HTML email template and replace {{placeholders}} with values.
 * Templates are cached after first read.
 *
 * @param {string} templateName - File name without extension (e.g. 'gradeUpdate')
 * @param {Object} data - Key/value pairs to replace in the template
 * @returns {string} Rendered HTML string
 */
export function renderTemplate(templateName, data = {}) {
  if (!cache[templateName]) {
    const filePath = join(__dirname, `${templateName}.html`);
    cache[templateName] = readFileSync(filePath, 'utf-8');
  }

  let html = cache[templateName];

  for (const [key, value] of Object.entries(data)) {
    // Replace all occurrences of {{key}} with the value
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    html = html.replace(regex, value ?? '');
  }

  return html;
}
