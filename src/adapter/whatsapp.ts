import type { SendJob, SendResult } from '../core/model';
import type { Adapter, Guard } from './types';
import { S, visible, norm, unique, control, controls, selectedFilter } from './selectors';

class ContactNotFound extends Error {}

export const canonical = (text: string) => text.replaceAll('\u00a0', ' ').replaceAll('\r\n', '\n').replace(/\n$/, '');
function contactDigits(raw: string, expected: string) {
  const digits = raw.replace(/\D/g, '');
  // National Brazilian display omits +55. Never reinterpret an explicit DDI.
  return expected.startsWith('+55') && !raw.trim().startsWith('+') && [10, 11].includes(digits.length) ? `55${digits}` : digits;
}
export function contactPhoneMatches(raw: string, expected: string) {
  const actual = contactDigits(raw, expected), target = expected.replace(/\D/g, '');
  if (actual === target) return true;
  if (!target.startsWith('55') || !actual.startsWith('55') || ![12, 13].includes(target.length) || ![12, 13].includes(actual.length)) return false;
  return actual.slice(2, 4) === target.slice(2, 4) && actual.slice(-8) === target.slice(-8);
}
export function domText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (!(node instanceof Element) || node.matches(S.quoted)) return '';
  if (node.tagName === 'IMG') return node.getAttribute('data-plain-text') || node.getAttribute('alt') || '';
  if (node.tagName === 'BR') return '\n';
  let result = '';
  for (const child of node.childNodes) {
    const block = child instanceof Element && /^(DIV|P)$/.test(child.tagName);
    if (block && result && !result.endsWith('\n')) result += '\n';
    result += domText(child);
    if (block && child.nextSibling && !result.endsWith('\n')) result += '\n';
  }
  return result;
}
export function observations(doc: Document) {
  const found = new Map<string, { id: string; text: string; positive: boolean }>();
  for (const marker of doc.querySelectorAll(S.outgoing)) {
    const row = marker.closest('.message-out') || marker;
    const id = marker.getAttribute('data-id') || row.getAttribute('data-id');
    if (!id?.startsWith('true_')) continue;
    const spans = [...row.querySelectorAll(S.body)].filter(n => !n.closest(S.quoted));
    const roots = spans.filter(n => !spans.some(other => other !== n && other.contains(n)));
    const text = canonical(roots.map(domText).join('\n'));
    found.set(id, { id, text, positive: !!row.querySelector(S.receipt) });
  }
  return [...found.values()];
}
export function newConfirmation(doc: Document, before: Set<string>, expected: string) {
  return observations(doc).find(o => !before.has(o.id) && o.positive && o.text === canonical(expected));
}
export class WhatsAppAdapter implements Adapter {
  // execCommand generates trusted input events too. Those are our edits, not
  // proof of a human intervention (pointer/key/paste still revoke immediately).
  private ownInputDepth = 0;
  constructor(readonly doc: Document = document, readonly sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms)), readonly timeout = 7000) {}
  health() {
    if ([...this.doc.querySelectorAll(S.qr)].some(visible)) return { ready: false, reason: 'Conecte sua sessão pelo QR code na aba do WhatsApp.' };
    if (this.doc.visibilityState !== 'visible') return { ready: false, reason: 'Mantenha a aba do WhatsApp visível e ativa.' };
    const alert = [...this.doc.querySelectorAll('[role="alert"],[role="dialog"]')].filter(visible).filter(n => !n.closest('#main .message-in,#main .message-out,#pane-side'));
    if (alert.some(n => /conta.*restrit|account.*restrict|computador.*desconect|computer.*not connected|sem conexao|connecting|conectando/i.test(norm(n.textContent)))) return { ready: false, reason: 'O WhatsApp mostrou um aviso de conexão ou restrição. Confira a aba.' };
    const ready = [...this.doc.querySelectorAll(`${S.list},${S.drawer}`)].some(visible);
    return { ready, reason: ready ? 'Interface disponível. O destinatário será conferido antes de enviar.' : 'Interface desconhecida ou sessão desconectada. Atualize a aba e confira o WhatsApp.' };
  }
  private async until<T>(read: () => T | undefined | null | false, guard: Guard, reason: string, timeout = this.timeout): Promise<T> {
    const started = Date.now();
    do { guard.local(); const value = read(); if (value) return value; await this.sleep(150); } while (Date.now() - started < timeout);
    throw Error(reason);
  }
  private async click(el: HTMLElement, guard: Guard) {
    await guard.check(); guard.local();
    if (!visible(el) || el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled) throw Error('Controle indisponível. Nenhum clique realizado.');
    control(el).click(); await this.sleep(180); guard.local();
  }
  private emptyDraft() {
    const boxes = [...this.doc.querySelectorAll(S.composer)].filter(visible);
    if (boxes.some(b => domText(b).trim().length > 0)) throw Error('Há um rascunho humano na conversa. Nenhum conteúdo foi substituído.');
  }
  async recoverList(guard: Guard) {
    for (let attempt = 0; attempt < 3; attempt++) {
      guard.local(); this.emptyDraft();
      const drawer = unique(this.doc, S.dialer) || unique(this.doc, S.newDrawer);
      if (!drawer) break;
      const scope = drawer.querySelector('header') || drawer;
      let back = controls(scope, S.back);
      if (!back.length) back = [...new Set([...scope.querySelectorAll('svg title')].filter(el => /^(?:wds-ic-)?(?:arrow-left|back)(?:-(?:alt|filled))?$/.test(norm(el.textContent))).map(el => el.closest<HTMLElement>('button,[role="button"],[tabindex="0"]') || el.closest('svg')?.parentElement).filter(visible))];
      if (back.length !== 1) throw Error('Não localizei Voltar/Fechar no painel de criação. Retorne manualmente à lista.');
      await this.click(back[0], guard);
      await this.until(() => !visible(drawer), guard, 'O painel de criação não fechou.');
    }
    if ([...this.doc.querySelectorAll(S.drawer)].some(visible)) throw Error('Limite de recuperação atingido. Retorne manualmente à lista.');
    await this.until(() => unique(this.doc, S.list), guard, 'Lista geral de conversas indisponível.');
    const all = [...this.doc.querySelectorAll(S.all)].filter(visible).filter(el => !el.closest(S.row) && (el.id === 'all-filter' || [el, ...el.querySelectorAll('span,[dir="auto"]')].some(node => [node.textContent, node.getAttribute('aria-label'), node.getAttribute('title')].some(text => /^(tudo|todos|todas|all)(\s*\(?\d+\)?)?$/.test(norm(text))))));
    if (all.length !== 1) throw Error('Filtro Tudo não pôde ser confirmado.');
    if (!selectedFilter(all[0])) await this.click(all[0], guard);
    await this.until(() => [...this.doc.querySelectorAll(S.all)].filter(visible).some(el => (el === all[0] || el.id === 'all-filter' || /^(tudo|todos|todas|all)$/.test(norm(el.textContent))) && selectedFilter(el)), guard, 'Filtro Tudo não confirmou a seleção.');
  }
  private writeEmpty(box: HTMLElement, text: string) {
    const input = box instanceof HTMLInputElement || box instanceof HTMLTextAreaElement;
    if ((input ? box.value : canonical(domText(box))).length) throw Error('Campo contém um rascunho ou pesquisa humana. Nada substituído.');
    this.ownInputDepth++;
    try {
    box.focus();
    if (input) {
      const proto = box instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(box, text);
      box.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    } else {
      // Replace only the empty editor's structural filler (<p><br></p>), not
      // append after it and accidentally introduce an extra leading newline.
      const range = this.doc.createRange(); range.selectNodeContents(box);
      const selection = this.doc.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
      // Contenteditable input via the browser's local editing command, no private WhatsApp API.
      if (!this.doc.execCommand('insertText', false, text)) throw Error('O editor recusou o texto.');
    }
    } finally { this.ownInputDepth--; }
  }
  private newChatButton() {
    const labeled = [...this.doc.querySelectorAll(S.newChat)].filter(visible).filter(el => !el.closest('#main'));
    const candidates = labeled.length ? labeled : [...new Set([...this.doc.querySelectorAll('button svg title')].filter(el => el.textContent?.trim() === 'wds-ic-new-chat-filled').map(el => el.closest('button')).filter((el): el is HTMLButtonElement => visible(el)))].filter(el => !el.closest('#main'));
    if (candidates.length > 1) throw Error('Mais de um botão Nova conversa visível. Nenhum foi escolhido.');
    return candidates[0];
  }
  private phoneValue(box: HTMLElement) {
    // Use the same value/textContent read as Gatherco, rather than the message
    // body's block-aware reader. The native dialer may add formatting/bidi marks.
    return (box instanceof HTMLInputElement || box instanceof HTMLTextAreaElement ? box.value : box.textContent || '').replace(/\D/g, '');
  }
  private async fillPhone(box: HTMLElement, query: string, guard: Guard) {
    const existing = box instanceof HTMLInputElement || box instanceof HTMLTextAreaElement ? box.value : box.textContent || '';
    if (existing.trim()) throw Error('A busca de Nova conversa já contém texto. Nada substituído.');
    let written = '';
    for (const digit of query) {
      guard.local();
      if (!visible(box) || this.phoneValue(box) !== written) throw Error('O campo Telefone mudou durante o preenchimento. Nada enviado.');
      this.ownInputDepth++;
      try {
        box.focus();
        if (box instanceof HTMLInputElement || box instanceof HTMLTextAreaElement) {
          const proto = box instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(box, written + digit);
        } else {
          const range = this.doc.createRange(); range.selectNodeContents(box);
          if (written) range.collapse(false);
          const selection = this.doc.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
          if (!this.doc.execCommand('insertText', false, digit)) throw Error('O campo Telefone recusou o preenchimento.');
        }
        box.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: digit }));
      } finally { this.ownInputDepth--; }
      written += digit;
      if (this.phoneValue(box) !== written) throw Error('O campo Telefone não aceitou o número digitado. Nada enviado.');
      // Native React filtering needs to consume each edit, as in Gatherco.
      await this.sleep(25);
    }
    await guard.check();
  }
  private resultCandidates(scope: HTMLElement) {
    const all = [...scope.querySelectorAll(S.row)].filter(visible);
    const roots = all.filter(el => !all.some(other => other !== el && other.contains(el)));
    const sections = [...scope.querySelectorAll('div,span,h1,h2,h3,[role="heading"]')].filter(visible).filter(el => /^(conversas|chats|contatos|contacts|grupos|groups|grupos em comum|groups in common|mensagens|messages)$/.test(norm(el.textContent)) && !el.closest('[data-testid="cell-frame-title"],[data-testid="cell-frame-secondary"]') && !el.querySelector('[data-testid="cell-frame-title"],[data-testid="cell-frame-secondary"]'));
    return roots.filter(el => {
      if (sections.some(s => el === s || el.contains(s)) || el.querySelector('[data-icon*="group"]') || el.getAttribute('data-id')?.includes('@g.us')) return false;
      let section: HTMLElement | undefined;
      for (const s of sections) if ((s.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) && (!section || (section.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING))) section = s;
      return !section || !/^(grupos|groups|grupos em comum|groups in common|mensagens|messages)$/.test(norm(section.textContent));
    });
  }
  private async openResult(scope: HTMLElement, guard: Guard) {
    // Gatherco activates mapped chat content with focus + pointer/mouse events.
    // These are bounded navigation fallbacks, never retries of a send click.
    for (let attempt = 0; attempt < 6; attempt++) {
      await guard.check(); this.emptyDraft();
      const rows = this.resultCandidates(scope);
      if (rows.length !== 1) throw Error('Os resultados mudaram antes da abertura do contato.');
      const row = rows[0], title = row.querySelector<HTMLElement>('[data-testid="cell-frame-title"]'), preview = row.querySelector<HTMLElement>('[data-testid="cell-frame-secondary"]');
      const targets = [...new Set([title?.querySelector<HTMLElement>('span'), title, preview?.querySelector<HTMLElement>('span'), preview, row.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]'), row.querySelector<HTMLElement>('[data-testid="cell-frame-container"]'), row].filter(visible))];
      const target = targets[attempt]; if (!target) break;
      guard.local(); (row.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]') || target).focus({ preventScroll: true });
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
        guard.local();
        const Ctor = type.startsWith('pointer') ? this.doc.defaultView?.PointerEvent : this.doc.defaultView?.MouseEvent;
        if (Ctor) target.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, composed: true, button: 0, buttons: type.endsWith('down') ? 1 : 0, pointerType: 'mouse', isPrimary: true }));
      }
      guard.local(); target.click();
      const opened = () => !visible(scope) && unique(this.doc, S.composer) && unique(this.doc, '#main header');
      // The result may disappear on success. Do not require it to survive or
      // assume an already-open previous chat proves this result opened.
      const at = Date.now();
      do { guard.local(); if (opened()) return; await this.sleep(150); } while (Date.now() - at < Math.min(this.timeout, 1800));
      if (!visible(scope)) { await this.until(opened, guard, 'O resultado foi selecionado, mas a conversa não ficou pronta.'); return; }
    }
    throw Error('O resultado foi localizado, mas a conversa não abriu com confirmação.');
  }
  private async open(phone: string, guard: Guard) {
    this.emptyDraft();
    // Reuse an already-open new-chat search; never close and reopen it while
    // locating a recipient. Recovery is only needed for a pre-existing dialer.
    if (!unique(this.doc, S.newDrawer)) {
      await this.recoverList(guard); this.emptyDraft();
      const create = this.newChatButton();
      if (!create) throw Error('Botão Nova conversa indisponível neste layout.');
      await this.click(create, guard);
    }
    const drawer = await this.until(() => unique(this.doc, S.newDrawer), guard, 'Nova conversa não abriu.');
    const box = await this.until(() => unique(drawer, S.newChatSearch), guard, 'Busca de Nova conversa não foi localizada de forma única.');
    // Gatherco's create-search route: type directly into New chat, no dialer.
    const query = phone.slice(1);
    await guard.check(); guard.local(); await this.fillPhone(box, query, guard);
    await this.sleep(500);
    // Wait for a single stable result. Never click a pre-filter contact or an ambiguous list.
    let stable = '', count = 0, absentCount = 0;
    const row = await this.until(() => {
      // Filtering/animations can temporarily hide or rebuild the field. Never
      // click on a mismatch, but allow the bounded UI wait instead of failing on
      // the first transient frame (the failure visible in the user's recording).
      const current = unique(drawer, S.newChatSearch);
      if (!current || this.phoneValue(current) !== query || !visible(drawer) || drawer.querySelector('[aria-busy="true"]')) { count = 0; absentCount = 0; return null; }
      const candidates = this.resultCandidates(drawer);
      const absent = !candidates.length && [...drawer.querySelectorAll('span,div,p,[role="status"]')].filter(visible).some(el => /^(nenhum(a)? (contato|conversa|resultado)s? (foi |foram )?encontrad[oa]s?|no (contacts?|chats?|results?) found|(?:este |esse |o )?numero(?: de telefone)? nao (esta|existe) no whatsapp)[.!]?$/.test(norm(el.textContent)));
      if (absent && ++absentCount >= 4) throw new ContactNotFound('Contato não encontrado no WhatsApp. Ignorado; seguindo para o próximo da fila.');
      if (!absent) absentCount = 0;
      if (candidates.length !== 1) { count = 0; return null; }
      const signature = candidates[0].textContent || '';
      if (signature !== stable) { stable = signature; count = 0; return null; }
      return ++count >= 4 ? candidates[0] : null;
    }, guard, 'Número não localizado ou resultado ambíguo em Nova conversa. A busca foi mantida para conferência.');
    if (!visible(row)) throw Error('O resultado mudou antes da abertura.');
    await this.openResult(drawer, guard);
    this.emptyDraft();
  }
  private contactPane() {
    const headings = [...this.doc.querySelectorAll('h1,h2,[role="heading"],header,span,div')].filter(visible).filter(h => /^(dados do contato|informacoes do contato|contact info)$/.test(norm(h.textContent)));
    for (const heading of headings) {
      let root: HTMLElement | null = heading;
      for (let depth = 0; root && depth < 9; depth++, root = root.parentElement) {
        if (root === this.doc.body || root.id === 'main' || root.contains(this.doc.querySelector('#main'))) break;
        const found = controls(root, S.close), close = found.length === 1 ? found[0] : null;
        const text = root.innerText || root.textContent || '';
        if (close && /\d[\d ()-]{8,}/.test(text)) return { root, close, text };
      }
    }
    return null;
  }
  private async verifyPhone(phone: string, guard: Guard) {
    const header = unique(this.doc, '#main header');
    if (!header) throw Error('Cabeçalho da conversa indisponível.');
    if (header.querySelector('[data-icon*="group"]')) throw Error('Grupos não são suportados.');
    const title = header.querySelector<HTMLElement>(S.contactInfo) || header.querySelector<HTMLElement>('[title]') || header.querySelector<HTMLElement>('[role="button"]');
    if (!title) throw Error('Controle de dados do contato não identificado.');
    await this.click(title, guard);
    const pane = await this.until(() => this.contactPane(), guard, 'Dados do contato indisponíveis. Não foi possível conferir o telefone.');
    try {
      // Read rendered text as Gatherco does: textContent can concatenate hidden
      // fields and adjacent numbers that are separate lines in the actual pane.
      const raw = pane.text.match(/\+?\d[\d ()-]{8,24}\d/g) || [];
      const numbers = new Set(raw.map(v => contactDigits(v, phone)));
      if (numbers.size !== 1 || !contactPhoneMatches(`+${[...numbers][0]}`, phone)) throw Error('O telefone nos dados do contato não corresponde ao destinatário: confira DDD e os oito dígitos finais (Brasil), ou o número completo (outros países).');
    } finally {
      // Always return from this inspection, including a rejected phone. A
      // verification error must still stop sending, but must not strand the UI.
      await this.click(pane.close, guard);
      await this.until(() => !this.contactPane(), guard, 'Não foi possível fechar Dados do contato.');
    }
    await this.until(() => unique(this.doc, S.composer), guard, 'Dados do contato fechados, mas o editor da conversa não ficou disponível.');
    if (!visible(header) || this.doc.querySelector('#main header') !== header) throw Error('A conversa mudou durante a conferência do telefone.');
    return { header, signature: this.signature(header) };
  }
  private signature(header: HTMLElement) { return [...header.querySelectorAll('[title]')].map(n => n.getAttribute('title')).join('|') || header.textContent || ''; }
  private sendButton() {
    const footer = this.doc.querySelector('#main footer'); if (!footer) return null;
    const enabled = (el: HTMLElement) => visible(el) && !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true';
    const byIcon = controls(footer, S.sendIcon).filter(enabled);
    if (byIcon.length === 1) return byIcon[0];
    if (byIcon.length > 1) return null;
    const found = [...this.doc.querySelectorAll(S.send)].filter(visible).filter(el => enabled(el) && [el.getAttribute('aria-label'), el.getAttribute('title'), el.textContent].some(text => ['enviar', 'send', 'enviar mensagem', 'send message'].includes(norm(text))));
    return found.length === 1 ? found[0] : null;
  }
  async send(job: SendJob, guard: Guard): Promise<SendResult> {
    let intent = false;
    let manual = false;
    const onHuman = (e: globalThis.Event) => { if (e.isTrusted && !(e.type === 'input' && this.ownInputDepth > 0)) manual = true; };
    for (const type of ['pointerdown', 'keydown', 'input', 'paste']) this.doc.addEventListener(type, onHuman, true);
    const safe: Guard = { ...guard, check: async () => { guard.local(); if (manual) throw Error('Intervenção manual detectada na aba. Confira a conversa.'); await guard.check(); safe.local(); }, local: () => {
      guard.local(); if (manual) throw Error('Intervenção manual detectada na aba. Confira a conversa.');
      if (this.doc.visibilityState !== 'visible' || [...this.doc.querySelectorAll(S.qr)].some(visible)) throw Error(this.health().reason);
      // React can temporarily remove both old and new panels while navigating.
      // Readiness is checked at preflight; each transition has its own bounded wait.
    } };
    try {
      await safe.check(); if (!this.health().ready) throw Error(this.health().reason); await this.open(job.phone, safe);
      const verified = await this.verifyPhone(job.phone, safe);
      const box = unique(this.doc, S.composer);
      if (!box) throw Error('Editor de mensagem não localizado de forma única.');
      this.emptyDraft();
      const assertContext = () => {
        safe.local();
        if (!visible(box) || this.doc.querySelector(S.composer) !== box || this.doc.querySelector('#main header') !== verified.header || this.signature(verified.header) !== verified.signature) throw Error('Destinatário ou editor mudou. Operação interrompida.');
        if (canonical(domText(box)) !== canonical(job.text)) throw Error('Mensagem no editor foi alterada ou está incompleta.');
      };
      await safe.check(); this.emptyDraft(); this.writeEmpty(box, job.text);
      await this.sleep(180); assertContext();
      const button = await this.until(() => this.sendButton(), safe, 'Botão Enviar não identificado. O texto foi preservado como rascunho.');
      await safe.check(); assertContext();
      if (!await guard.commit()) throw Error('Autorização revogada antes do clique.');
      intent = true; assertContext();
      if (!visible(button) || control(button).getAttribute('aria-disabled') === 'true' || (control(button) as HTMLButtonElement).disabled) throw Error('Botão Enviar mudou antes do clique.');
      control(button).click(); // Exactly one attempted click per committed job; no retry path.
      return { status: 'dispatched', detail: 'Clique em Enviar executado. A fila continua sem aguardar confirmação na interface.' };
    } catch (err) {
      if (!intent && err instanceof ContactNotFound) {
        try {
          // Only a stable, explicit no-result state may skip. Return to the
          // list so the next recipient starts with a clean search.
          await this.recoverList(safe);
          return { status: 'skipped', detail: err.message };
        } catch (recovery) { return { status: 'failed', detail: `Contato não encontrado, mas não foi possível preparar a próxima busca: ${(recovery as Error).message}` }; }
      }
      // Keep the failed step visible. Closing the search here hid the cause and
      // produced the New chat -> general-list bounce reported by the user.
      const detail = (err as Error).message;
      return { status: intent ? 'uncertain' : 'failed', detail };
    } finally {
      for (const type of ['pointerdown', 'keydown', 'input', 'paste']) this.doc.removeEventListener(type, onHuman, true);
    }
  }
}
