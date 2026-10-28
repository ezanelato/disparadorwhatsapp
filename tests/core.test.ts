import { describe, test, expect } from 'vitest';
import { csvGrid, normalizePhone, contactsFromGrid, validateGrid } from '../src/core/import';
import { freezeRecipients, personalize } from '../src/core/personalize';
import { safeCell } from '../src/core/export';
import { isJob, panelSender, contentSender } from '../src/protocol';
import { zipSync, strToU8 } from 'fflate';
import unzip from '../src/core/bounded-unzip';

export const contacts = () => contactsFromGrid(csvGrid('telefone;nome;empresa\n+12025550101;Ana;Teste\n+12025550102;Bruno;Oficina\n+12025550103;Carla;Ateliê'), { phone: 0, name: 1, company: 2 }, 'BR', []).contacts;
describe('importação local', () => {
  test.each([',', ';', '\t'])('BOM, aspas, delimitador %s e quebra dentro do campo', delimiter => {
    const g = csvGrid(`\uFEFFtelefone${delimiter}nome\r\n"+12025550101"${delimiter}"Ana ""A""\nExemplo"`);
    expect(g[1]).toEqual(['+12025550101', 'Ana "A"\nExemplo']);
  });
  test('não perde zeros de campos texto', () => expect(csvGrid('telefone;codigo\n+12025550101;00102')[1][1]).toBe('00102'));
  test('normaliza somente números válidos sem adivinhar dígitos', () => { expect(normalizePhone('(11) 99999-0001', 'BR')).toBe('+5511999990001'); expect(normalizePhone('+1 (202) 555-0101', 'BR')).toBe('+12025550101'); });
  test.each(['5.511E+12', '5511999990001e0', '011999990001', '000123', '+55 11 99999-0001 ramal 2', 'abc', '+55+11999990001'])('rejeita ambiguidade %s', value => expect(() => normalizePhone(value, 'BR')).toThrow());
  test('deduplica pelo normalizado e preserva exclusões', () => {
    const result = contactsFromGrid(csvGrid('tel;nome\n+5511999990001;A\n11999990001;B\n+12025550101;C\n1e10;D'), { phone: 0, name: 1, company: -1 }, 'BR', ['+12025550101']);
    expect([result.valid, result.duplicate, result.excluded, result.invalid]).toEqual([1, 1, 1, 1]);
    expect(result.contacts[2].selected).toBe(false);
  });
  test('rejeita cabeçalhos duplicados, vazio e células numéricas XLSX como telefone', () => {
    expect(() => validateGrid([['a', 'a'], ['1', '2']])).toThrow();
    expect(() => validateGrid([[''], ['1']])).toThrow();
    const g = validateGrid([['telefone'], [12025550101]]);
    expect(contactsFromGrid(g, { phone: 0, name: -1, company: -1 }, 'BR', []).invalid).toBe(1);
  });
  test('limita descompressão de XLSX e conserva filtro XML', async () => {
    const zipped = zipSync({ 'xl/sheet.xml': strToU8('<x/>'), 'image.png': strToU8('ignored') });
    const result = await unzip(zipped.buffer as ArrayBuffer, { filter: e => e.path.endsWith('.xml') });
    expect(Object.keys(result)).toEqual(['xl/sheet.xml']);
  });
});
describe('congelamento e personalização', () => {
  test('limite exato na ordem exibida, sem duplicar ou trocar destinatário', () => {
    const list = contacts(); list.push(structuredClone(list[0]));
    const result = freezeRecipients(list, 'Olá {{nome}} / {{empresa}}', 2, {}, [], 'c');
    expect(result.map(r => r.phone)).toEqual(['+12025550101', '+12025550102']);
    list[0].fields.nome = 'Mudou'; expect(result[0].text).toBe('Olá Ana / Teste');
  });
  test.each([0, -1, 1.5, 4, NaN])('quantidade inválida %s', value => expect(() => freezeRecipients(contacts(), 'Oi', value, {}, [], 'c')).toThrow());
  test('seleção individual e exclusão são respeitadas', () => {
    const list = contacts(); list[0].selected = false;
    expect(freezeRecipients(list, 'Oi', 1, {}, ['+12025550102'], 'c')[0].phone).toBe('+12025550103');
  });
  test('campos ausentes bloqueiam, fallback determinístico e sintaxe inválida', () => {
    expect(personalize('Oi {{nome}} {{cidade}}', { nome: 'Ana' }).missing).toEqual(['cidade']);
    expect(personalize('{{cidade}}', {}, { cidade: 'sua região' }).text).toBe('sua região');
    expect(personalize('{{nome', {}).missing).toContain('variável malformada');
    expect(() => freezeRecipients(contacts(), '{{faltando}}', 1, {}, [], 'c')).toThrow();
    expect(() => freezeRecipients(contacts(), '{{nome}}', 1, { nome: '{{outro}}' }, [], 'c')).not.toThrow();
  });
  test('valores de célula não podem introduzir variáveis não resolvidas', () => {
    const list = contacts(); list[0].fields.nome = '{{injeção}}';
    expect(() => freezeRecipients(list, '{{nome}}', 1, {}, [], 'c')).toThrow();
  });
});
test.each(['=HYPERLINK("a")', '+12025550101', '@SUM(1)', '-1+1', '  =1', '\t=1', '\n=1'])('CSV protege fórmula %s', value => expect(safeCell(value).startsWith('"\'')).toBe(true));
test('células com aspas e texto simples são escapadas', () => expect(safeCell('Ana "A"')).toBe('"Ana ""A"""'));
test('protocolo não aceita page script, outro frame ou outra extensão', () => {
  expect(panelSender({ id: 'a', url: 'chrome-extension://a/panel.html' }, 'a', 'chrome-extension://a/panel.html')).toBe(true);
  expect(panelSender({ id: 'a', tab: { id: 1 } as chrome.tabs.Tab, url: 'https://web.whatsapp.com/' }, 'a', 'chrome-extension://a/panel.html')).toBe(false);
  expect(contentSender({ id: 'a', frameId: 1, tab: { id: 1 } as chrome.tabs.Tab, url: 'https://web.whatsapp.com/' }, 'a')).toBe(false);
  expect(contentSender({ id: 'other', frameId: 0, tab: { id: 1 } as chrome.tabs.Tab, url: 'https://web.whatsapp.com/' }, 'a')).toBe(false);
  expect(isJob({ phone: '+12025550101', text: '{{nome}}' })).toBe(false);
});
