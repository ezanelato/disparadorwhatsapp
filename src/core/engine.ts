import { event, type Campaign, type Contact, type SendJob, type SendResult, type State } from './model';
import { freezeRecipients } from './personalize';
import type { Store } from '../persistence/repository';

export interface StartInput {
  contacts: Contact[]; template: string; quantity: number; fallback: Record<string, string>;
  intervalSeconds: number; tabId: number; tabTitle: string; title: string; mode: Campaign['mode'];
}
export class Engine {
  readonly owner = crypto.randomUUID();
  constructor(readonly store: Store, readonly session: string, readonly now = () => Date.now()) {}
  async recover() {
    await this.store.mutate((s, events) => {
      for (const c of s.campaigns) {
        const interrupted = s.lease?.campaignId === c.id || s.recipients.some(r => r.campaignId === c.id && ['preparing', 'authorized'].includes(r.status));
        if (c.status === 'running' && (c.session !== this.session || interrupted)) {
          c.status = 'paused'; c.revision++; c.reason = 'Execução interrompida. Confira os resultados e retome explicitamente.';
          events.push(event(c.id, 'recovered', c.reason));
        }
        for (const r of s.recipients.filter(r => r.campaignId === c.id)) {
          if (r.status === 'authorized') { r.status = 'uncertain'; r.detail = 'Intenção persistida; confirmação perdida. Não será reenviado.'; }
          else if (r.status === 'preparing') { r.status = 'failed'; r.detail = 'Execução interrompida antes da autorização de envio.'; }
          else continue;
          r.updatedAt = this.now(); events.push(event(c.id, r.status, r.detail!, r.id));
        }
      }
      s.lease = undefined;
    });
  }
  async start(input: StartInput) {
    if (!Number.isInteger(input.intervalSeconds) || input.intervalSeconds < 30 || input.intervalSeconds > 86400) throw Error('Intervalo: inteiro entre 30 e 86.400 segundos.');
    return this.store.mutate((s, events) => {
      if (s.activeId || s.lease) throw Error('Finalize ou cancele a campanha atual antes de iniciar outra.');
      const id = crypto.randomUUID();
      const recipients = freezeRecipients(input.contacts, input.template, input.quantity, input.fallback, s.exclusions, id);
      const campaign: Campaign = { id, title: input.title.trim() || 'Minha campanha', status: 'running', mode: input.mode, tabId: input.tabId, tabTitle: input.tabTitle, intervalMs: input.intervalSeconds * 1000, nextAt: this.now(), createdAt: this.now(), revision: 1, session: this.session };
      s.campaigns.push(campaign); s.recipients.push(...recipients); s.activeId = id;
      events.push(event(id, 'started', `${recipients.length} destinatários congelados; modo ${input.mode}.`)); return id;
    });
  }
  async control(action: 'pause' | 'resume' | 'cancel', id: string) {
    return this.store.mutate((s, events) => {
      const c = s.campaigns.find(c => c.id === id);
      if (!c || !['running', 'paused'].includes(c.status) || s.activeId !== id) throw Error('Campanha não está ativa.');
      if (action === 'resume') {
        if (c.status !== 'paused') throw Error('A campanha já está em execução.');
        if (s.lease) throw Error('Aguarde a interrupção do envio atual antes de retomar.');
        c.status = 'running'; c.session = this.session; c.nextAt = Math.max(c.nextAt, this.now()); c.reason = undefined;
      } else {
        c.status = action === 'pause' ? 'paused' : 'cancelled';
        c.reason = action === 'pause' ? 'Pausada por você. Novas ações estão bloqueadas.' : 'Campanha cancelada. Envios já realizados não podem ser desfeitos.';
        if (action === 'cancel') {
          for (const r of s.recipients.filter(r => r.campaignId === id && r.status === 'pending')) { r.status = 'cancelled'; r.updatedAt = this.now(); }
          s.activeId = undefined;
        }
      }
      c.revision++; events.push(event(id, action, c.reason || 'Retomada explícita.')); return c.tabId;
    });
  }
  private matches(s: State, job: SendJob, tabId: number) {
    const c = s.campaigns.find(c => c.id === job.campaignId), l = s.lease;
    const r = s.recipients.find(r => r.id === job.recipientId && r.campaignId === job.campaignId);
    if (!c || !r || !l || c.status !== 'running' || s.activeId !== c.id || c.tabId !== tabId || c.session !== this.session || c.revision !== job.revision || l.revision !== job.revision || l.owner !== this.owner || l.expires < this.now() || l.attempt !== job.attempt || l.recipientId !== r.id || r.attempt !== job.attempt || r.phone !== job.phone || r.text !== job.text || s.exclusions.includes(r.phone)) return;
    return { c, r, l };
  }
  async permit(job: SendJob, tabId: number, commit = false) {
    return this.store.mutate((s, events) => {
      const match = this.matches(s, job, tabId);
      if (!match || !['preparing', 'authorized'].includes(match.r.status)) return false;
      if (commit) {
        // A second COMMIT for this attempt must never authorize another click.
        if (match.r.status !== 'preparing') return false;
        match.r.status = 'authorized'; match.r.updatedAt = this.now();
        events.push(event(match.c.id, 'intent', 'Intenção de um único clique persistida antes do envio.', match.r.id));
      }
      return true;
    });
  }
  async tick(send: (job: SendJob, c: Campaign) => Promise<SendResult>) {
    const claimed = await this.store.mutate((s, events) => {
      const c = s.campaigns.find(c => c.id === s.activeId);
      if (!c || c.status !== 'running' || s.lease || c.nextAt > this.now()) return;
      for (const r of s.recipients.filter(r => r.campaignId === c.id && r.status === 'pending' && s.exclusions.includes(r.phone))) {
        r.status = 'skipped'; r.detail = 'Contato na lista de exclusão.'; r.updatedAt = this.now(); events.push(event(c.id, 'skipped', r.detail, r.id));
      }
      const r = s.recipients.filter(r => r.campaignId === c.id && r.status === 'pending').sort((a, b) => a.index - b.index)[0];
      if (!r) { c.status = 'completed'; s.activeId = undefined; events.push(event(c.id, 'completed', 'Todos os destinatários têm resultado.')); return; }
      const attempt = crypto.randomUUID();
      r.status = 'preparing'; r.attempt = attempt; r.updatedAt = this.now();
      s.lease = { owner: this.owner, campaignId: c.id, recipientId: r.id, attempt, revision: c.revision, expires: this.now() + 120_000 };
      events.push(event(c.id, 'preparing', 'Preparação iniciada.', r.id));
      return { job: { campaignId: c.id, recipientId: r.id, attempt, revision: c.revision, phone: r.phone, text: r.text }, campaign: structuredClone(c) };
    });
    if (!claimed) return;
    let result: SendResult;
    try { result = await send(claimed.job, claimed.campaign); }
    catch (err) {
      const r = (await this.store.read()).recipients.find(r => r.id === claimed.job.recipientId);
      result = { status: r?.status === 'authorized' ? 'uncertain' : 'failed', detail: `Comunicação interrompida: ${(err as Error).message}` };
    }
    await this.store.mutate((s, events) => {
      const r = s.recipients.find(r => r.id === claimed.job.recipientId), c = s.campaigns.find(c => c.id === claimed.job.campaignId);
      if (!r || !c || r.attempt !== claimed.job.attempt || !['preparing', 'authorized'].includes(r.status)) return;
      // Once intent was committed, any missing confirmation is conservative uncertainty.
      if (r.status === 'authorized' && !['confirmed', 'dispatched'].includes(result.status)) result.status = 'uncertain';
      if (r.status !== 'authorized' && ['confirmed', 'dispatched'].includes(result.status)) result = { status: 'failed', detail: 'Resultado de envio recebido sem intenção autorizada.' };
      r.status = result.status; r.detail = result.detail; r.messageId = result.messageId; r.updatedAt = this.now();
      events.push(event(c.id, r.status, r.detail, r.id));
      if (s.lease?.attempt === claimed.job.attempt) s.lease = undefined;
      c.nextAt = this.now() + c.intervalMs;
      if (!['confirmed', 'dispatched', 'skipped'].includes(result.status) && c.status === 'running') {
        c.status = 'paused'; c.revision++; c.reason = result.detail;
      } else if (c.status === 'running' && !s.recipients.some(r => r.campaignId === c.id && r.status === 'pending')) {
        c.status = 'completed'; s.activeId = undefined;
      }
    });
  }
}
