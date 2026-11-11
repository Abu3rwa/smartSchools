import { withPdfPage } from './pdf/pdfBrowserManager.js';
import { buildMapPracticeReportHtml } from './mapPracticeReportTemplate.js';

export const generateMapPracticeReportPdf = async (report) => withPdfPage(async (page) => {
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
});
