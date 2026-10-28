import { Engine, type StartInput } from './core/engine';
import { event, type SendJob, type State, type Contact } from './core/model';
import { normalizePhone } from './core/import';
import { reportCsv } from './core/export';
import { Repository } from './persistence/repository';
import { SimulatedAdapter } from './adapter/simulated';
import { contentSender, panelSender, envelope, isJob, message } from './protocol';

const store = new Repository();
let engine: Engine;
const ALARM = 'zaplista-next';
const panelUrl = chrome.runtime.getURL('panel.html');
const ready = (async () => {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const prior = await chrome.storage.session.get('session');
  const session: string = typeof prior.session === 'string' ? prior.session : crypto.randomUUID();
  await chrome.storage.session.set({ session });
  // A surviving document may still be executing when its worker was lost.
  const state = await store.read();
  if (state.lease) await stopTab(state.campaigns.find(c => c.id === state.lease?.campaignId)?.tabId);
  engine = new Engine(store, session); await engine.recover();
  await schedule();
})();
async function stopTab(tabId?: number) {
  if (tabId === undefined || tabId < 0) return;
  await chrome.tabs.sendMessage(tabId, envelope('STOP'), { frameId: 0 }).catch(() => {});
}
async function health(tabId: number) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || new URL(tab.url).origin !== 'https://web.whatsapp.com') throw Error('Escolha uma aba do WhatsApp Web.');
  const result = await chrome.tabs.sendMessage(tabId, envelope('HEALTH'), { frameId: 0 }).catch(() => { throw Error('Atualize a aba do WhatsApp após instalar ou recarregar a extensão.'); });
  if (result?.version !== chrome.runtime.getManifest().version) throw Error('A aba ainda usa o código anterior da extensão. Atualize a aba do WhatsApp (F5) antes de vincular ou iniciar.');
  return { ...result, tabId, title: tab.title || 'WhatsApp Web', active: tab.active };
}
async function activeTab(tabId: number) {
  const tab = await chrome.tabs.get(tabId);
  const window = await chrome.windows.get(tab.windowId);
  return !!tab.active && !!window.focused && tab.url?.startsWith('https://web.whatsapp.com/');
}
async function schedule() {
  const s = await store.read(), c = s.campaigns.find(c => c.id === s.activeId);
  await chrome.alarms.clear(ALARM);
  if (s.lease) await chrome.alarms.create(ALARM, { when: s.lease.expires + 1000 });
  else if (c?.status === 'running') await chrome.alarms.create(ALARM, { when: Math.max(c.nextAt, Date.now() + 500) });
}
async function drive() {
  await ready;
  await engine.tick(async (job, campaign) => {
    // Watchdog survives loss of the promise/message channel.
    await schedule();
    if (campaign.mode === 'simulation') {
      return new SimulatedAdapter().send(job, {
        local: () => {},
        check: async () => { if (!await engine.permit(job, -1)) throw Error('Autorização revogada.'); },
        commit: () => engine.permit(job, -1, true),
      });
    }
    const h = await health(campaign.tabId);
    if (!h.ready || h.busy || !await activeTab(campaign.tabId)) throw Error(h.reason || 'Mantenha a aba vinculada visível e ativa.');
    let timer: ReturnType<typeof setTimeout>;
    try {
      const result = await Promise.race([
        chrome.tabs.sendMessage(campaign.tabId, envelope('SEND', job), { frameId: 0 }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('Tempo de comunicação com a aba esgotado.')), 65_000); }),
      ]);
      if (!result || !['confirmed', 'dispatched', 'skipped', 'failed', 'uncertain'].includes(result.status) || typeof result.detail !== 'string' || (result.status === 'confirmed' && typeof result.messageId !== 'string')) throw Error('Resposta inválida do adaptador.');
      return result;
    } finally { clearTimeout(timer!); await stopTab(campaign.tabId); }
  });
  await schedule();
}
async function pauseLost(tabId: number, reason: string) {
  const state = await store.read(), c = state.campaigns.find(c => c.id === state.activeId && c.tabId === tabId && c.mode === 'whatsapp');
  if (!c || c.status !== 'running') return;
  await engine.control('pause', c.id);
  await store.mutate((s, events) => { const c = s.campaigns.find(c => c.id === s.activeId); if (c) { c.reason = reason; events.push(event(c.id, 'connection-lost', reason)); } });
  await stopTab(tabId); await schedule();
}
function validateStart(input: any): asserts input is StartInput {
  if (!input || !Array.isArray(input.contacts) || input.contacts.length > 10_000 || typeof input.template !== 'string' || input.template.length > 10_000 || typeof input.title !== 'string' || input.title.length > 160 || !Number.isInteger(input.quantity) || !['simulation', 'whatsapp'].includes(input.mode) || !Number.isInteger(input.tabId) || !Number.isInteger(input.intervalSeconds) || !input.fallback || typeof input.fallback !== 'object' || Array.isArray(input.fallback)) throw Error('Dados da campanha inválidos.');
  if (Object.entries(input.fallback).some(([key, v]) => key.length > 100 || typeof v !== 'string' || v.length > 10_000)) throw Error('Substitutos inválidos.');
  for (const c of input.contacts as Contact[]) {
    if (!c || typeof c.selected !== 'boolean' || typeof c.fields !== 'object' || !c.fields || typeof c.name !== 'string' || !Number.isInteger(c.row) || (c.selected && !c.reason && (typeof c.phone !== 'string' || normalizePhone(c.phone, 'BR') !== c.phone)) || Object.values(c.fields).some(v => typeof v !== 'string' || v.length > 100_000)) throw Error('Contatos inválidos.');
  }
}
async function panelCommand(type: string, data: any) {
  if (type === 'STATE') return store.read();
  if (type === 'TABS') return (await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' })).map(t => ({ id: t.id, title: t.title || 'WhatsApp Web', active: t.active }));
  if (type === 'HEALTH') { if (!Number.isInteger(data)) throw Error('Aba inválida.'); return health(data); }
  if (type === 'DRAFT_GET') return store.draft();
  if (type === 'DRAFT_SET') { if (JSON.stringify(data).length > 8_000_000) throw Error('Rascunho muito grande.'); return store.draft(data); }
  if (type === 'START') {
    validateStart(data);
    if (data.mode === 'whatsapp') {
      const h = await health(data.tabId);
      if (!h.ready || h.busy || !await activeTab(data.tabId)) throw Error(h.reason || 'Aba indisponível ou ocupada.');
      data.tabTitle = h.title;
    } else { data.tabId = -1; data.tabTitle = 'Simulador local'; }
    const id = await engine.start(data); await schedule(); void drive().catch(backgroundError); return id;
  }
  if (['PAUSE', 'RESUME', 'CANCEL'].includes(type)) {
    if (typeof data !== 'string') throw Error('Campanha inválida.');
    if (type === 'RESUME') {
      const s = await store.read(), c = s.campaigns.find(c => c.id === data);
      if (c?.mode === 'whatsapp') { const h = await health(c.tabId); if (!h.ready || h.busy || !await activeTab(c.tabId)) throw Error(h.reason || 'Aba indisponível.'); }
    }
    const tabId = await engine.control(type === 'PAUSE' ? 'pause' : type === 'RESUME' ? 'resume' : 'cancel', data);
    if (type !== 'RESUME') await stopTab(tabId);
    await schedule(); if (type === 'RESUME') void drive().catch(backgroundError); return true;
  }
  if (type === 'EXPORT') {
    if (typeof data !== 'string') throw Error('Campanha inválida.');
    const s = await store.read(), c = s.campaigns.find(c => c.id === data); if (!c) throw Error('Campanha não encontrada.');
    return reportCsv(c, s.recipients, await store.events(c.id));
  }
  if (type === 'DELETE') { if (typeof data !== 'string') throw Error('Campanha inválida.'); await store.deleteCampaign(data); return true; }
  if (type === 'EXCLUSION_ADD' || type === 'EXCLUSION_REMOVE') {
    if (typeof data !== 'string') throw Error('Telefone inválido.');
    const phone = normalizePhone(data, 'BR');
    const s = await store.read();
    if (s.activeId && type === 'EXCLUSION_ADD') {
      const c = s.campaigns.find(c => c.id === s.activeId);
      if (c?.status === 'running') await engine.control('pause', c.id);
      await stopTab(c?.tabId);
    }
    await store.mutate(s => { s.exclusions = type === 'EXCLUSION_ADD' ? [...new Set([...s.exclusions, phone])] : s.exclusions.filter(p => p !== phone); });
    await schedule(); return true;
  }
  if (type === 'CLEAR') {
    if (data !== 'APAGAR') throw Error('Confirmação de exclusão ausente.');
    const s = await store.read();
    // Revoke before contacting the tab, so no outstanding permit can succeed.
    await store.mutate(s => { for (const c of s.campaigns) { c.status = 'cancelled'; c.revision++; } });
    await Promise.all(s.campaigns.map(c => stopTab(c.tabId))); await chrome.alarms.clear(ALARM);
    await store.clear(); await chrome.storage.local.clear(); return true;
  }
  throw Error('Comando não reconhecido.');
}
function backgroundError(err: unknown) {
  void store.mutate((s, events) => {
    const c = s.campaigns.find(c => c.id === s.activeId);
    if (c?.status === 'running') { c.status = 'paused'; c.revision++; c.reason = `Execução interrompida: ${String(err)}`; events.push(event(c.id, 'error', c.reason)); }
  });
}
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!message(msg)) return false;
  const fromPanel = panelSender(sender, chrome.runtime.id, panelUrl);
  const fromContent = contentSender(sender, chrome.runtime.id);
  if (!fromPanel && !fromContent) return false;
  const run = async () => {
    await ready;
    if (fromPanel) return panelCommand(msg.type, msg.payload);
    if (!isJob(msg.payload)) throw Error('Execução inválida.');
    if (msg.type === 'PERMIT' || msg.type === 'COMMIT') {
      if (!await activeTab(sender.tab!.id!)) return false;
      return engine.permit(msg.payload as SendJob, sender.tab!.id!, msg.type === 'COMMIT');
    }
    if (msg.type === 'LOST') { await pauseLost(sender.tab!.id!, 'A aba foi recarregada ou perdeu a sessão. Confira e retome explicitamente.'); return true; }
    throw Error('Comando não autorizado para este contexto.');
  };
  run().then(value => reply({ ok: true, value }), err => reply({ ok: false, error: (err as Error).message })); return true;
});
chrome.runtime.onInstalled.addListener(() => { void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); });
chrome.runtime.onStartup.addListener(() => { void ready.then(() => schedule()); });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== ALARM) return;
  void ready.then(async () => {
    const s = await store.read();
    if (s.lease && s.lease.expires < Date.now()) { await stopTab(s.campaigns.find(c => c.id === s.lease?.campaignId)?.tabId); await engine.recover(); }
    await drive();
  }).catch(backgroundError);
});
chrome.tabs.onRemoved.addListener(id => { void ready.then(() => pauseLost(id, 'A aba vinculada foi fechada. Cancele a campanha e vincule outra aba para uma nova campanha.')); });
chrome.tabs.onUpdated.addListener((id, change) => { if (change.status === 'loading' || change.url) void ready.then(() => pauseLost(id, 'A aba vinculada navegou ou foi recarregada. Confira a sessão antes de retomar.')); });
