import { withPdfPage } from './pdf/pdfBrowserManager.js';
import { buildPlpReportHtml } from './plpReportTemplate.js';

export const generatePlpReportPdf = async (model) => withPdfPage(async (page) => {
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
});
