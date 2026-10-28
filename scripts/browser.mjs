import { chromium } from '@playwright/test';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';

export async function browserOptions() {
  const candidates = [process.env.ZAPLISTA_BROWSER, chromium.executablePath(), 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean);
  for (const executablePath of candidates) {
    try { await access(executablePath); return { executablePath }; } catch { /* try a local executable */ }
  }
  throw Error('Instale Chromium com npx playwright install chromium ou defina ZAPLISTA_BROWSER.');
}
export async function extensionBrowser(profile) {
  const extension = path.resolve('dist');
  await mkdir('test-results', { recursive: true });
  const context = await chromium.launchPersistentContext(path.resolve('test-results', profile), {
    ...await browserOptions(), headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    ignoreDefaultArgs: ['--disable-extensions'], acceptDownloads: true,
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
  const id = new URL(worker.url()).hostname;
  return { context, worker, id };
}
