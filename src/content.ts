import { WhatsAppAdapter } from './adapter/whatsapp';
import { envelope, isJob, message, rpc } from './protocol';
import type { SendJob } from './core/model';
import brand from '../brand.json';

const adapter = new WhatsAppAdapter();
let active: { job: SendJob; stopped: boolean } | undefined;
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  // Only extension-owned worker messages; no window.postMessage or page bridge.
  if (sender.id !== chrome.runtime.id || sender.tab || !message(msg)) return false;
  if (msg.type === 'HEALTH') { reply({ ...adapter.health(), version: brand.version, busy: !!active }); return false; }
  if (msg.type === 'STOP') { if (active) active.stopped = true; reply({ stopped: true }); return false; }
  if (msg.type !== 'SEND' || !isJob(msg.payload) || active) { reply({ status: 'failed', detail: 'Operação inválida ou aba ocupada.' }); return false; }
  const run = { job: msg.payload, stopped: false }; active = run;
  const local = () => { if (run.stopped || active !== run) throw Error('Operação pausada ou cancelada.'); };
  adapter.send(run.job, {
    local,
    check: async () => { local(); if (!await rpc('PERMIT', run.job)) throw Error('Campanha ou destinatário sem autorização.'); local(); },
    commit: async () => { local(); const allowed = await rpc<boolean>('COMMIT', run.job); local(); return allowed; },
  }).then(reply, err => reply({ status: 'uncertain', detail: String(err) })).finally(() => { if (active === run) active = undefined; });
  return true;
});
// Notify the worker once when a controlled document is leaving; never keep it alive.
window.addEventListener('pagehide', () => { if (active) { active.stopped = true; void chrome.runtime.sendMessage(envelope('LOST', active.job)).catch(() => {}); } });
