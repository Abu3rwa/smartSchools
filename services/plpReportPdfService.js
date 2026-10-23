import puppeteer from 'puppeteer';
import { resolvePuppeteerExecutablePath } from '../utils/resolvePuppeteerExecutablePath.js';
import { buildPlpReportHtml } from './plpReportTemplate.js';

let browserPromise;

const getBrowser = async () => {
    if (!browserPromise) {
        browserPromise = (async () => {
            const executablePath = await resolvePuppeteerExecutablePath();
            return puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
                ...(executablePath ? { executablePath } : {}),
            });
        })().catch((error) => {
            browserPromise = null;
            throw error;
        });
    }
    return browserPromise;
};

export const generatePlpReportPdf = async (model) => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        await page.setContent(buildPlpReportHtml(model), { waitUntil: 'load' });
        const pdf = Buffer.from(await page.pdf({
            format: 'A4',
            printBackground: true,
            preferCSSPageSize: true,
            displayHeaderFooter: true,
            headerTemplate: '<div></div>',
            footerTemplate: '<div style="font-size:7px;color:#5c6f7a;width:100%;text-align:center;">Personal Learning Plan · page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
        }));
        if (pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
            throw new Error('The PDF renderer returned an invalid document.');
        }
        return pdf;
    } finally {
        await page.close();
    }
};
