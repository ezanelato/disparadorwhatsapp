import type { SendJob } from './core/model';
export const PROTOCOL = 'zaplista/1';
export const envelope = (type: string, payload?: unknown) => ({ protocol: PROTOCOL, type, payload });
export function message(value: unknown): value is { protocol: string; type: string; payload?: any } {
  return !!value && typeof value === 'object' && (value as any).protocol === PROTOCOL && typeof (value as any).type === 'string';
}
export function isJob(job: any): job is SendJob {
  return !!job && ['campaignId', 'recipientId', 'attempt'].every(k => typeof job[k] === 'string' && job[k].length <= 100) && Number.isInteger(job.revision) && /^\+[1-9]\d{7,14}$/.test(job.phone) && typeof job.text === 'string' && job.text.length > 0 && job.text.length <= 10_000 && !/\{\{|\}\}/.test(job.text);
}
export function panelSender(sender: chrome.runtime.MessageSender, extensionId: string, panelUrl: string) {
  return sender.id === extensionId && !sender.tab && sender.url === panelUrl;
}
export function contentSender(sender: chrome.runtime.MessageSender, extensionId: string) {
  return sender.id === extensionId && sender.frameId === 0 && sender.tab?.id !== undefined && !!sender.url && new URL(sender.url).origin === 'https://web.whatsapp.com';
}
export async function rpc<T = any>(type: string, payload?: unknown): Promise<T> {
  const result = await chrome.runtime.sendMessage(envelope(type, payload));
  if (!result?.ok) throw Error(result?.error || 'Não foi possível comunicar com o executor.');
  return result.value as T;
}
