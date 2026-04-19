import { clearResolvedPuppeteerExecutablePathCache, resolvePuppeteerExecutablePath } from '../utils/resolvePuppeteerExecutablePath.js';

const isTrue = (value) => String(value || '').trim().toLowerCase() === 'true';
const shouldEnforce = isTrue(process.env.RENDER) || process.env.NODE_ENV === 'production' || isTrue(process.env.CI);
const shouldSkip = isTrue(process.env.SKIP_PUPPETEER_BROWSER_INSTALL);

if (shouldSkip) {
    console.log('[postinstall] Skipping Puppeteer browser install due to SKIP_PUPPETEER_BROWSER_INSTALL=true');
    process.exit(0);
}

try {
    // Ensure we do a fresh resolve for each install run.
    clearResolvedPuppeteerExecutablePathCache();
    const executablePath = await resolvePuppeteerExecutablePath();

    if (!executablePath) {
        const message = '[postinstall] Chromium/Chrome executable was not found or installed for Puppeteer.';
        if (shouldEnforce) {
            console.error(message);
            process.exit(1);
        }

        console.warn(message);
        process.exit(0);
    }

    console.log(`[postinstall] Puppeteer browser ready at: ${executablePath}`);
} catch (error) {
    const message = `[postinstall] Failed to prepare Puppeteer browser: ${error?.message || error}`;
    if (shouldEnforce) {
        console.error(message);
        process.exit(1);
    }

    console.warn(message);
    process.exit(0);
}
