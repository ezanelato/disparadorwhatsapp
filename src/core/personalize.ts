import type { Contact, Recipient } from './model';
export function personalize(template: string, fields: Record<string, string>, fallback: Record<string, string> = {}) {
  const missing = new Set<string>();
  const text = template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, key: string) => {
    const value = Object.hasOwn(fields, key) && fields[key]?.trim() ? fields[key] : (Object.hasOwn(fallback, key) ? fallback[key] : '');
    if (!value?.trim()) missing.add(key);
    return value || '';
  });
  if (/\{\{|\}\}/.test(text)) missing.add('variável malformada');
  return { text, missing: [...missing] };
}
export function freezeRecipients(contacts: Contact[], template: string, quantity: number, fallback: Record<string, string>, exclusions: string[], campaignId: string): Recipient[] {
  if (!template.trim() || template.length > 10_000) throw Error('Escreva uma mensagem de até 10.000 caracteres.');
  const unique = new Set<string>();
  const eligible = contacts.filter(c => c.selected && !c.reason && c.phone && !exclusions.includes(c.phone)).filter(c => {
    if (unique.has(c.phone)) return false; unique.add(c.phone); return true;
  });
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > eligible.length) throw Error('Quantidade deve ser um inteiro positivo até o total selecionado e elegível.');
  return eligible.slice(0, quantity).map((c, index) => {
    const { text, missing } = personalize(template, c.fields, fallback);
    if (missing.length) throw Error(`Linha ${c.row}: preencha ${missing.join(', ')} ou exclua o contato.`);
    if (!text.trim() || text.length > 10_000) throw Error(`Linha ${c.row}: mensagem vazia ou acima de 10.000 caracteres.`);
    return { id: crypto.randomUUID(), campaignId, phone: c.phone, name: c.name, text, index, status: 'pending', updatedAt: Date.now() };
  });
}
