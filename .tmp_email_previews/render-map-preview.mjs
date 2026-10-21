import fs from 'node:fs';
import puppeteer from 'puppeteer';
import { buildMapPracticeProgressEmail } from '../services/mapPracticeProgressEmailService.js';

const email = buildMapPracticeProgressEmail({
  student: { firstName: 'Ava', lastName: 'Martinez' },
  generatedAt: new Date('2026-10-21T09:00:00Z'),
  assignments: [
    { _id: 'a1', set: { _id: 's1', title: 'Fractions & Mixed Numbers', questionCount: 20 } },
    { _id: 'a2', set: { _id: 's2', title: 'Decimal Place Value', questionCount: 20 } },
    { _id: 'a3', set: { _id: 's3', title: 'Geometry: Area & Perimeter', questionCount: 15 } },
    { _id: 'a4', set: { _id: 's4', title: 'Data, Graphs & Line Plots', questionCount: 15 } },
  ],
  attempts: [
    { _id: 't1', set: 's1', status: 'in_progress', answers: Array.from({ length: 12 }, (_, i) => ({ question: 'q' + i, response: 'A' })) },
    { _id: 't2', set: 's2', status: 'reviewed', submittedAt: '2026-10-19T10:00:00Z', score: 18, maxScore: 20 },
    { _id: 't4', set: 's4', status: 'submitted', submittedAt: '2026-10-20T10:00:00Z', score: 14, maxScore: 15 },
  ],
  skillsBySet: new Map([
    ['s1', ['Adding fractions', 'Comparing fractions', 'Mixed numbers']],
    ['s2', ['Decimal place value', 'Rounding decimals']],
    ['s3', ['Area of rectangles', 'Perimeter']],
    ['s4', ['Line plots', 'Bar graphs']],
  ]),
});

const dir = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const htmlPath = `${dir}map-progress-preview.html`;
fs.writeFileSync(htmlPath, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MAP progress preview</title></head><body style="margin:0">${email.html}</body></html>`);

const browser = await puppeteer.launch({ headless: 'new', executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage();
await page.setViewport({ width: 640, height: 900, deviceScaleFactor: 1 });
await page.goto(`file:///${htmlPath}`, { waitUntil: 'networkidle0' });
const height = await page.evaluate(() => document.documentElement.scrollHeight);
await page.setViewport({ width: 640, height, deviceScaleFactor: 1 });
await page.screenshot({ path: `${dir}map-progress-preview.png`, fullPage: true });
await browser.close();

console.log(JSON.stringify({ htmlPath, pngPath: `${dir}map-progress-preview.png`, height, subject: email.subject }));
