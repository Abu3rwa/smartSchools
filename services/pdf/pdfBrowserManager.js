/**
 * One headless Chromium for every PDF export.
 *
 * Each export used to launch its own browser and keep it for the life of the
 * process. On a small instance that means several hundred MB of idle Chromium
 * that never comes back, so the browser now starts on first use and closes
 * again once the last page is finished.
 */

import puppeteer from 'puppeteer';
import logger from '../../utils/logger.js';
import { resolvePuppeteerExecutablePath } from '../../utils/resolvePuppeteerExecutablePath.js';

const DEFAULT_IDLE_MS = 60 * 1000;
const LAUNCH_TIMEOUT_MS = 30 * 1000;

const idleMs = () => {
  const configured = Number(process.env.PDF_BROWSER_IDLE_MS);
  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_IDLE_MS;
};

const unavailable = () => Object.assign(
  new Error('PDF export is not available on this server right now.'),
  { statusCode: 503, expose: true },
);

let launcher = null; // test seam: resolves instead of spawning Chromium
let browser = null;
let launching = null;
let activePages = 0;
let idleTimer = null;

const usable = (instance) => Boolean(
  instance
  && (typeof instance.isConnected === 'function' ? instance.isConnected() : true),
);

const defaultLaunch = async () => {
  // A request must never wait on a browser download; the build installs it.
  const executablePath = await resolvePuppeteerExecutablePath({ allowInstall: false });
  if (!executablePath) throw unavailable();
  return puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    executablePath,
    timeout: LAUNCH_TIMEOUT_MS,
  });
};

const clearIdleTimer = () => {
  if (!idleTimer) return;
  clearTimeout(idleTimer);
  idleTimer = null;
};

const closeNow = async () => {
  const instance = browser;
  browser = null;
  if (!instance) return;
  try {
    await instance.close();
    logger.info('pdf_browser_closed', { idleMs: idleMs() });
  } catch (error) {
    logger.warn('pdf_browser_close_failed', { error: error?.message });
  }
};

const scheduleIdleClose = () => {
  if (activePages > 0 || !browser) return;
  clearIdleTimer();
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (activePages === 0) void closeNow();
  }, idleMs());
  // Never keep the process alive just to close an idle browser.
  if (typeof idleTimer.unref === 'function') idleTimer.unref();
};

const getBrowser = async () => {
  clearIdleTimer();
  if (usable(browser)) return browser;
  if (launching) return launching;

  launching = (launcher || defaultLaunch)()
    .then((instance) => {
      browser = instance;
      launching = null;
      instance.once?.('disconnected', () => {
        if (browser !== instance) return;
        browser = null;
        clearIdleTimer();
      });
      return instance;
    })
    .catch((error) => {
      launching = null;
      throw error;
    });

  return launching;
};

/** Opens a page and keeps the browser alive until `releasePdfPage` says otherwise. */
export const acquirePdfPage = async () => {
  // Counted before the browser is awaited, so an idle close that is already due
  // cannot shut the browser down between the wait and the page being opened.
  activePages += 1;
  clearIdleTimer();
  try {
    const instance = await getBrowser();
    return await instance.newPage();
  } catch (error) {
    activePages = Math.max(0, activePages - 1);
    scheduleIdleClose();
    throw error;
  }
};

export const releasePdfPage = async (page) => {
  try {
    if (page && typeof page.close === 'function') await page.close().catch(() => {});
  } finally {
    activePages = Math.max(0, activePages - 1);
    scheduleIdleClose();
  }
};

/** For exporters that have no timing of their own; closes the page even when the render throws. */
export const withPdfPage = async (render, { timeoutMs } = {}) => {
  const page = await acquirePdfPage();
  try {
    if (timeoutMs) {
      page.setDefaultTimeout(timeoutMs);
      page.setDefaultNavigationTimeout(timeoutMs);
    }
    return await render(page);
  } finally {
    await releasePdfPage(page);
  }
};

export const closePdfBrowser = async () => {
  clearIdleTimer();
  if (launching) {
    try {
      await launching;
    } catch {
      // A failed launch leaves nothing to close.
    }
  }
  await closeNow();
};

export const pdfBrowserState = () => ({
  activePages,
  launched: Boolean(browser),
  launching: Boolean(launching),
});

export const setPdfBrowserLauncherForTests = (nextLauncher) => {
  launcher = nextLauncher;
};
