import { chromium, expect } from '@playwright/test';
import { browserOptions } from './browser.mjs';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ ...await browserOptions(), headless: true, args: ['--allow-file-access-from-files'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 1000 } });
  const errors = []; page.on('pageerror', err => errors.push(err.message));
  await page.addInitScript(() => {
    // UI-only harness: not a WhatsApp transport. Production does not bundle it.
    const state = { campaigns: [], recipients: [], exclusions: [] };
    let draft;
    globalThis.chrome = { runtime: { sendMessage: async msg => {
      const { type, payload } = msg;
      if (type === 'STATE') return { ok: true, value: state };
      if (type === 'TABS') return { ok: true, value: [] };
      if (type === 'DRAFT_GET') return { ok: true, value: draft };
      if (type === 'DRAFT_SET') { draft = payload; return { ok: true, value: true }; }
      return { ok: true, value: true };
    } } };
  });
  await page.goto(pathToFileURL(path.resolve('dist/panel.html')).href);
  await expect(page.getByRole('heading', { name: /Boas conversas/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/panel-390-contacts.png', fullPage: true });
  await page.locator('#mode').selectOption('simulation');
  await page.locator('#file').setInputFiles('examples/leads.csv');
  await page.getByRole('button', { name: 'Aplicar mapeamento' }).click();
  await expect(page.locator('.contact')).toHaveCount(5);
  await expect(page.locator('.invalid')).toHaveCount(2);
  await page.getByRole('button', { name: 'Escrever mensagem' }).click();
  await page.locator('#template').fill('Olá, {{nome}}!\nTudo bem com a {{empresa}}? 🙂');
  await page.locator('#quantity').fill('2');
  await expect(page.locator('#preview-text')).toHaveText('Olá, Ana Exemplo!\nTudo bem com a Estúdio Fictício? 🙂');
  await page.screenshot({ path: 'test-results/panel-390-message.png', fullPage: true });
  await page.getByRole('button', { name: 'Revisar campanha' }).click();
  await expect(page.locator('.review-contact')).toHaveCount(2);
  await page.locator('.review-contact').first().locator('summary').click();
  await page.screenshot({ path: 'test-results/panel-390-review.png', fullPage: true });
  for (const width of [320, 600]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/panel-${width}-review.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
  console.log('PASS: painel CSV → mensagem → revisão; larguras 320/390/600; sem overflow ou erros JS. Harness simulado, nenhum envio.');
} finally { await browser.close(); }
