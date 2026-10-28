import type { Campaign, Event, Recipient } from './model';
export function safeCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}
export function reportCsv(campaign: Campaign, recipients: Recipient[], events: Event[]): string {
  const rows: unknown[][] = [['campanha', 'modo', 'ordem', 'telefone', 'nome', 'mensagem', 'estado', 'motivo', 'id_mensagem', 'atualizado_em', 'eventos']];
  for (const r of recipients.filter(r => r.campaignId === campaign.id).sort((a, b) => a.index - b.index)) {
    rows.push([campaign.title, campaign.mode, r.index + 1, r.phone, r.name, r.text, r.status, r.detail || '', r.messageId || '', new Date(r.updatedAt).toISOString(), events.filter(e => e.recipientId === r.id).map(e => `${new Date(e.at).toISOString()} ${e.kind}: ${e.detail}`).join('\n')]);
  }
  return '\uFEFF' + rows.map(row => row.map(safeCell).join(';')).join('\r\n');
}
