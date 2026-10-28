import { expect } from '@playwright/test';
import { extensionBrowser } from './browser.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';

const { context, worker, id } = await extensionBrowser(`profile-${Date.now()}`);
try {
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const rpc = (type, payload) => page.evaluate(async ({ type, payload }) => {
    const r = await chrome.runtime.sendMessage({ protocol: 'zaplista/1', type, payload });
    if (!r.ok) throw Error(r.error); return r.value;
  }, { type, payload });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await expect(page.locator('#file')).toBeAttached();
  // Exercise XLSX sheet selection and numeric-phone rejection under real extension CSP.
  const xml = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Contatos" sheetId="1" r:id="rId1"/><sheet name="Outra" sheetId="2" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/><Relationship Id="rId2" Target="worksheets/sheet2.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/></Relationships>',
    'xl/worksheets/sheet1.xml': '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>telefone</t></is></c><c r="B1" t="inlineStr"><is><t>nome</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>+12025550101</t></is></c><c r="B2" t="inlineStr"><is><t>Ana XLSX</t></is></c></row><row r="3"><c r="A3"><v>12025550102</v></c><c r="B3" t="inlineStr"><is><t>Telefone numérico</t></is></c></row></sheetData></worksheet>',
  };
  xml['xl/worksheets/sheet2.xml'] = xml['xl/worksheets/sheet1.xml'];
  // Large compressible XML ensures the build's local unzip path is tested.
  xml['xl/ignored.xml'] = '<x>' + ' '.repeat(600_000) + '</x>';
  await writeFile('test-results/contacts.xlsx', zipSync(Object.fromEntries(Object.entries(xml).map(([k, v]) => [k, strToU8(v)]))));
  await page.locator('#mode').selectOption('simulation');
  await page.locator('#file').setInputFiles('test-results/contacts.xlsx');
  await expect(page.locator('#sheet option')).toHaveCount(2);
  await page.getByRole('button', { name: 'Ler planilha' }).click();
  await page.getByRole('button', { name: 'Aplicar mapeamento' }).click();
  await expect(page.locator('.invalid')).toHaveCount(1);
  await page.locator('#file').setInputFiles('examples/leads.csv');
  await page.getByRole('button', { name: 'Aplicar mapeamento' }).click();
  await page.getByRole('button', { name: 'Escrever mensagem' }).click();
  await page.locator('#template').fill('Olá {{nome}}!\nMensagem simulada 🙂');
  await page.locator('#quantity').fill('2');
  await page.getByRole('button', { name: 'Revisar campanha' }).click();
  await page.locator('#consent').check();
  await page.getByRole('button', { name: 'Iniciar simulação' }).click();
  await expect(page.locator('.status.confirmed')).toHaveCount(1, { timeout: 10000 });
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect(page.locator('.pill')).toHaveText('Pausada');
  const saved = await rpc('STATE');
  expect(saved.recipients.length).toBe(2);
  expect(saved.recipients.filter(r => r.status === 'confirmed').length).toBe(1);
  // Reopen a second panel and ensure neither loss of state nor second executor.
  const second = await context.newPage(); await second.goto(page.url());
  await expect(second.locator('.pill')).toHaveText('Pausada');
  await page.reload(); await expect(page.locator('.pill')).toHaveText('Pausada');
  await page.getByRole('button', { name: 'Retomar', exact: true }).click();
  await expect(page.locator('.pill')).toHaveText('Em execução');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.locator('.pill')).toHaveText('Cancelado');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar relatório CSV' }).click();
  const download = await downloadPromise; await download.saveAs('test-results/report.csv');
  const report = await readFile('test-results/report.csv', 'utf8');
  expect(report).toContain('simulation'); expect(report).toContain('confirmed'); expect(report).toContain('cancelled');
  await page.screenshot({ path: 'test-results/extension-results.png', fullPage: true });
  await page.locator('.settings>summary').click();
  await page.locator('#exclude-phone').fill('+12025550103');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  expect((await rpc('STATE')).exclusions).toEqual(['+12025550103']);
  await rpc('DELETE', saved.campaigns[0].id);
  expect((await rpc('STATE')).recipients).toHaveLength(0);
  await page.locator('.settings>summary').click(); // re-render collapses details after action
  await page.locator('#erase').fill('APAGAR');
  await page.getByRole('button', { name: 'Apagar todos os dados locais' }).click();
  expect((await rpc('STATE')).exclusions).toHaveLength(0);
  expect(errors).toEqual([]);
  console.log(`PASS: extensão MV3 ${id}; XLSX multi-planilha e CSV; simulação persistida, dois painéis, pausa/retomada/cancelamento, relatório e exclusão. Sem WhatsApp real.`);
} finally { await context.close(); }
