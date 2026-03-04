import path from 'path'
import fs from 'fs'
const dir = path.join(__dirname, 'emailTemplates');
let css = fs.readFileSync(path.join(dir, 'reportSharedStyles.html'), 'utf8');

const vars = {
    '--bg': '#f6f7fb',
    '--card': '#fff',
    '--text': '#111827',
    '--muted': '#6b7280',
    '--divider': 'rgba(59,130,246,.24)',
    '--radius': '16px',
    '--shadow': '0 2px 10px rgba(0,0,0,.06)',
    '--sp-1': '4px',
    '--sp-2': '8px',
    '--sp-3': '12px',
    '--sp-4': '16px',
    '--sp-5': '24px',
};

for (const [k, v] of Object.entries(vars)) {
    css = css.replace(new RegExp(`var\\(${k}\\)`, 'g'), v);
}
css = css.replace(/:root\\s*\\{[^}]*\\}\\s*/, '');
fs.writeFileSync(path.join(dir, 'reportSharedStyles.html'), css.trim());

const htmlFiles = [
    'dailyClassworkUpdate.html',
    'dailyReport.html',
    'gradeUpdate.html',
    'monthlyReport.html'
];

for (const file of htmlFiles) {
    const p = path.join(dir, file);
    let content = fs.readFileSync(p, 'utf8');

    if (content.includes('<!DOCTYPE html>')) continue;

    content = content.replace('<style>{{reportSharedStyles}}</style>', '').trim();

    const wrapped = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>{{reportSharedStyles}}</style>
</head>
<body style="margin: 0; padding: 0; background: #f6f7fb; -webkit-font-smoothing: antialiased;">
${content}
</body>
</html>`;

    fs.writeFileSync(p, wrapped);
}

console.log("Done fixing email templates");
