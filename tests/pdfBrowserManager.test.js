import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { setTimeout as wait } from "node:timers/promises";

import {
  acquirePdfPage,
  closePdfBrowser,
  pdfBrowserState,
  releasePdfPage,
  setPdfBrowserLauncherForTests,
  withPdfPage,
} from "../services/pdf/pdfBrowserManager.js";

/** A browser-shaped stand-in: counts launches, pages, and closes. */
const installFakeLauncher = () => {
  const state = { launches: 0, closes: 0, openPages: 0 };
  const browsers = [];

  const makePage = () => ({
    closed: false,
    setDefaultTimeout() {},
    setDefaultNavigationTimeout() {},
    async close() {
      if (this.closed) return;
      this.closed = true;
      state.openPages -= 1;
    },
  });

  const makeBrowser = () => {
    const browser = {
      connected: true,
      isConnected() {
        return browser.connected;
      },
      async newPage() {
        state.openPages += 1;
        return makePage();
      },
      async close() {
        state.closes += 1;
        browser.connected = false;
      },
      once() {},
    };
    return browser;
  };

  setPdfBrowserLauncherForTests(async () => {
    state.launches += 1;
    const browser = makeBrowser();
    browsers.push(browser);
    return browser;
  });

  return { state, browsers };
};

const reset = async (t) => {
  t.after(async () => {
    await closePdfBrowser();
    setPdfBrowserLauncherForTests(null);
    delete process.env.PDF_BROWSER_IDLE_MS;
  });
};

test("concurrent renders share one browser launch", async (t) => {
  reset(t);
  const { state } = installFakeLauncher();

  const results = await Promise.all([
    withPdfPage(async () => "a"),
    withPdfPage(async () => "b"),
    withPdfPage(async () => "c"),
  ]);

  assert.deepEqual(results, ["a", "b", "c"]);
  assert.equal(state.launches, 1);
  assert.equal(state.openPages, 0);
});

test("the browser stays alive while a page is open and closes once idle", async (t) => {
  reset(t);
  process.env.PDF_BROWSER_IDLE_MS = "30";
  const { state } = installFakeLauncher();

  await releasePdfPage(await acquirePdfPage());
  const secondPage = await acquirePdfPage();

  await wait(80);
  assert.equal(state.closes, 0, "a second live page must keep the browser open");

  await releasePdfPage(secondPage);
  await wait(80);
  assert.equal(state.closes, 1);
  assert.equal(pdfBrowserState().launched, false);
});

test("the next export launches a fresh browser after the idle close", async (t) => {
  reset(t);
  process.env.PDF_BROWSER_IDLE_MS = "20";
  const { state } = installFakeLauncher();

  await withPdfPage(async () => "first");
  await wait(70);
  assert.equal(state.closes, 1);

  await withPdfPage(async () => "second");
  assert.equal(state.launches, 2);
  assert.equal(pdfBrowserState().launched, true);
});

test("a browser that disconnected is replaced rather than handed out", async (t) => {
  reset(t);
  const { state, browsers } = installFakeLauncher();

  await withPdfPage(async () => "before");
  browsers[0].connected = false;
  await withPdfPage(async () => "after");

  assert.equal(state.launches, 2);
});

test("the page is closed and the browser released when a render throws", async (t) => {
  reset(t);
  const { state } = installFakeLauncher();

  await assert.rejects(withPdfPage(async () => {
    throw new Error("render failed");
  }), /render failed/);

  assert.equal(state.openPages, 0);
  assert.equal(pdfBrowserState().activePages, 0);
});

test("a failing launch is retried on the next export", async (t) => {
  reset(t);
  let attempts = 0;
  setPdfBrowserLauncherForTests(async () => {
    attempts += 1;
    if (attempts === 1) throw Object.assign(new Error("no browser"), { statusCode: 503 });
    return {
      isConnected: () => true,
      async newPage() {
        return { setDefaultTimeout() {}, setDefaultNavigationTimeout() {}, close: async () => {} };
      },
      async close() {},
      once() {},
    };
  });

  await assert.rejects(withPdfPage(async () => "never"), /no browser/);
  assert.equal(await withPdfPage(async () => "second attempt"), "second attempt");
  assert.equal(attempts, 2);
});
