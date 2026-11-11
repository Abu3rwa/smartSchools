/**
 * Per-child newsletter letter as a print-quality PDF.
 *
 * Repaints the exact HTML the family receives, so the PDF and the email can
 * never drift apart.
 */

import { withPdfPage } from "./pdf/pdfBrowserManager.js";
import { prepareChildLetterEmail } from "./newsletterChildEmailService.js";

export async function renderChildLetterPdf({ letterId }) {
    const { letter, rendered } = await prepareChildLetterEmail({ letterId });
    const pdf = await withPdfPage(async (page) => {
        await page.setContent(rendered.html, { waitUntil: "load" });
        const buffer = Buffer.from(
            await page.pdf({
                format: "A4",
                printBackground: true,
                margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" },
            })
        );
        if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
            throw new Error("The PDF renderer returned an invalid document.");
        }
        return buffer;
    });
    return { pdf, letter, rendered };
}

export function letterPdfFilename({ rendered, letter }) {
    const student = `${letter?.student?.firstName || ""} ${letter?.student?.lastName || ""}`.trim();
    const base = [student || "letter", rendered?.classLabel || "", "weekly-letter"].filter(Boolean).join("-");
    return `${base.replace(/[^\w-]+/g, "-")}.pdf`;
}