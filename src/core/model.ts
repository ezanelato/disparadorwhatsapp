export type RecipientStatus = 'pending' | 'preparing' | 'authorized' | 'confirmed' | 'dispatched' | 'failed' | 'uncertain' | 'skipped' | 'cancelled';
export type CampaignStatus = 'running' | 'paused' | 'completed' | 'cancelled';
export interface Contact {
  id: string; row: number; phone: string; rawPhone: string; name: string; company: string;
  fields: Record<string, string>; selected: boolean; reason?: string;
}
export interface Recipient {
  id: string; campaignId: string; phone: string; name: string; text: string; index: number;
  status: RecipientStatus; detail?: string; attempt?: string; messageId?: string; updatedAt: number;
}
export interface Campaign {
  id: string; title: string; status: CampaignStatus; tabId: number; tabTitle: string;
  mode: 'whatsapp' | 'simulation'; createdAt: number; intervalMs: number; nextAt: number;
  revision: number; session: string; reason?: string;
}
export interface Lease { owner: string; campaignId: string; recipientId: string; attempt: string; revision: number; expires: number }
export interface Event { id: string; campaignId: string; recipientId?: string; at: number; kind: string; detail: string }
export interface State {
  campaigns: Campaign[]; recipients: Recipient[]; exclusions: string[]; activeId?: string; lease?: Lease;
}
export interface SendJob { campaignId: string; recipientId: string; attempt: string; revision: number; phone: string; text: string }
export interface SendResult { status: 'confirmed' | 'dispatched' | 'skipped' | 'failed' | 'uncertain'; detail: string; messageId?: string }
export const statusLabel: Record<RecipientStatus | CampaignStatus, string> = {
  pending: 'Pendente', preparing: 'Em preparação', authorized: 'Envio autorizado', confirmed: 'Confirmado na interface',
  dispatched: 'Envio acionado',
  failed: 'Falha antes do envio', uncertain: 'Resultado incerto', skipped: 'Ignorado', cancelled: 'Cancelado',
  running: 'Em execução', paused: 'Pausada', completed: 'Concluída',
};
export const emptyState = (): State => ({ campaigns: [], recipients: [], exclusions: [] });
export function event(campaignId: string, kind: string, detail: string, recipientId?: string): Event {
  return { id: crypto.randomUUID(), campaignId, recipientId, kind, detail, at: Date.now() };
}
