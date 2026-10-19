import puppeteer from 'puppeteer';
import { resolvePuppeteerExecutablePath } from '../utils/resolvePuppeteerExecutablePath.js';
import { buildMapPracticeReportHtml } from './mapPracticeReportTemplate.js';

let browserPromise;

const getBrowser = async () => {
  if (!browserPromise) {
    browserPromise = (async () => {
      const executablePath = await resolvePuppeteerExecutablePath();
      return puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        ...(executablePath ? { executablePath } : {})
      });
    })().catch((error) => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
};

export const generateMapPracticeReportPdf = async (report) => {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(buildMapPracticeReportHtml(report), { waitUntil: 'load' });
    const pdf = Buffer.from(await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true
    }));
    if (pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('The PDF renderer returned an invalid document.');
    }
    return pdf;
  } finally {
    await page.close();
  }
};
