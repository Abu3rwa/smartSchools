/**
 * Per-child newsletter letter as a print-quality PDF.
 *
 * Repaints the exact HTML the family receives, so the PDF and the email can
 * never drift apart. One shared headless browser is reused across requests.
 */

import puppeteer from "puppeteer";
import { resolvePuppeteerExecutablePath } from "../utils/resolvePuppeteerExecutablePath.js";
import { prepareChildLetterEmail } from "./newsletterChildEmailService.js";

let browserPromise;

const getBrowser = async () => {
    if (!browserPromise) {
        browserPromise = (async () => {
            const executablePath = await resolvePuppeteerExecutablePath();
            return puppeteer.launch({
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
                ...(executablePath ? { executablePath } : {}),
            });
        })().catch((error) => {
            browserPromise = null;
            throw error;
        });
    }
    return browserPromise;
};

export async function renderChildLetterPdf({ letterId }) {
    const { letter, rendered } = await prepareChildLetterEmail({ letterId });
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        await page.setContent(rendered.html, { waitUntil: "load" });
        const pdf = Buffer.from(
            await page.pdf({
                format: "A4",
                printBackground: true,
                margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" },
            })
        );
        if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
            throw new Error("The PDF renderer returned an invalid document.");
        }
        return { pdf, letter, rendered };
    } finally {
        await page.close();
    }
}

export function letterPdfFilename({ rendered, letter }) {
    const student = `${letter?.student?.firstName || ""} ${letter?.student?.lastName || ""}`.trim();
    const base = [student || "letter", rendered?.classLabel || "", "weekly-letter"].filter(Boolean).join("-");
    return `${base.replace(/[^\w\-]+/g, "-")}.pdf`;
}