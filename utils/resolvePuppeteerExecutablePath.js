import fs from 'fs/promises';
import puppeteer from 'puppeteer';

const WINDOWS_BROWSER_PATHS = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];

const MACOS_BROWSER_PATHS = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
];

const LINUX_BROWSER_PATHS = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable'
];

let cachedExecutablePathPromise = null;

const pathExists = async (candidatePath) => {
    if (!candidatePath) return false;

    try {
        await fs.access(candidatePath);
        return true;
    } catch {
        return false;
    }
};

const getPlatformCandidates = () => {
    if (process.platform === 'win32') return WINDOWS_BROWSER_PATHS;
    if (process.platform === 'darwin') return MACOS_BROWSER_PATHS;
    return LINUX_BROWSER_PATHS;
};

export const resolvePuppeteerExecutablePath = async () => {
    if (!cachedExecutablePathPromise) {
        cachedExecutablePathPromise = (async () => {
            const envCandidates = [
                process.env.PUPPETEER_EXECUTABLE_PATH,
                process.env.CHROME_PATH
            ]
                .map((value) => String(value || '').trim())
                .filter(Boolean);

            const candidates = [...envCandidates, ...getPlatformCandidates()];
            for (const candidate of candidates) {
                if (await pathExists(candidate)) {
                    return candidate;
                }
            }

            // Fall back to Puppeteer's own bundled browser
            try {
                const executablePath = puppeteer.executablePath();
                if (executablePath && await pathExists(executablePath)) {
                    return executablePath;
                }
            } catch {
                // ignore — bundled browser not available
            }

            return undefined;
        })();
    }

    return cachedExecutablePathPromise;
};

export const clearResolvedPuppeteerExecutablePathCache = () => {
    cachedExecutablePathPromise = null;
};
