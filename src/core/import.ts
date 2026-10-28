import { parse } from 'csv-parse/browser/esm/sync';
import parsePhoneNumber, { type CountryCode } from 'libphonenumber-js/max';
import readXlsxFile, { readSheetNames } from 'read-excel-file/browser';
import type { Contact } from './model';

export type Grid = string[][];
export interface Mapping { phone: number; name: number; company: number }
export function csvGrid(text: string): Grid {
  const source = text.replace(/^\uFEFF/, '');
  // Detect only separators outside quotes in the first logical row.
  const counts = new Map([ [',', 0], [';', 0], ['\t', 0] ]); let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') { if (quoted && source[i + 1] === '"') i++; else quoted = !quoted; }
    else if (!quoted && (c === '\n' || c === '\r')) break;
    else if (!quoted && counts.has(c)) counts.set(c, counts.get(c)! + 1);
  }
  const delimiter = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  return validateGrid(parse(source, { delimiter, bom: true, skip_empty_lines: true, relax_column_count: true, max_record_size: 200_000 }));
}
export function validateGrid(grid: unknown[][]): Grid {
  if (grid.length < 2) throw Error('O arquivo precisa de cabeçalho e pelo menos uma linha.');
  if (grid.length > 10_001 || grid[0].length > 100) throw Error('Limite local: 10.000 linhas e 100 colunas.');
  const headers = grid[0].map(v => String(v ?? '').trim());
  if (headers.some(v => !v) || new Set(headers).size !== headers.length) throw Error('Use nomes de colunas únicos e não vazios.');
  return [headers, ...grid.slice(1).map(row => headers.map((_, i) => {
    const v = row[i];
    // Numeric XLSX values cannot prove leading-zero or scientific-notation provenance.
    if (typeof v === 'number') return `[célula numérica: ${v}]`;
    return String(v ?? '').trim();
  }))];
}
export async function sheets(file: File): Promise<string[]> { return readSheetNames(file); }
export async function xlsxGrid(file: File, sheet: string): Promise<Grid> {
  return validateGrid(await readXlsxFile(file, { sheet }));
}
export function normalizePhone(raw: string, country: CountryCode): string {
  const value = raw.trim();
  if (!value || /[eE]|\[célula|[^\d+().\s-]/.test(value)) throw Error('Telefone deve ser texto, sem notação científica, ramal ou letras.');
  const phone = parsePhoneNumber(value, { defaultCountry: country, extract: false });
  if (!phone || !phone.isValid() || phone.ext) throw Error('Número inválido para o país escolhido. Confira DDD e DDI.');
  const inputDigits = value.replace(/\D/g, '');
  // Reject parsers silently stripping prefixes or adding/changing subscriber digits.
  if (inputDigits !== phone.number.slice(1) && inputDigits !== phone.nationalNumber) {
    throw Error('Dígitos ambíguos: informe explicitamente +DDI e o número completo.');
  }
  return phone.number;
}
export function contactsFromGrid(grid: Grid, map: Mapping, country: CountryCode, exclusions: string[]) {
  if (!Number.isInteger(map.phone) || map.phone < 0 || map.phone >= grid[0].length) throw Error('Mapeie a coluna Telefone.');
  const seen = new Set<string>(); let duplicate = 0, invalid = 0, excluded = 0;
  const contacts: Contact[] = grid.slice(1).map((row, index) => {
    const fields: Record<string, string> = Object.create(null);
    grid[0].forEach((key, i) => fields[key] = row[i] || '');
    const name = row[map.name] || '', company = row[map.company] || '';
    fields.nome = name; fields.empresa = company;
    let phone = '', reason: string | undefined;
    try { phone = normalizePhone(row[map.phone] || '', country); }
    catch (err) { reason = (err as Error).message; invalid++; }
    if (phone) {
      if (seen.has(phone)) { reason = 'Telefone duplicado na lista.'; duplicate++; }
      else if (exclusions.includes(phone)) { reason = 'Contato na lista local de exclusão.'; excluded++; }
      seen.add(phone);
    }
    return { id: crypto.randomUUID(), row: index + 2, rawPhone: row[map.phone] || '', phone, name, company, fields, selected: !reason, reason };
  });
  return { contacts, imported: contacts.length, valid: contacts.length - invalid - duplicate - excluded, invalid, duplicate, excluded };
}
