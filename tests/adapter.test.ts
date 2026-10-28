// @vitest-environment happy-dom
import { beforeEach, test, expect, vi } from 'vitest';
import { WhatsAppAdapter, observations, newConfirmation, domText, contactPhoneMatches } from '../src/adapter/whatsapp';
import type { Guard } from '../src/adapter/types';
import type { SendJob } from '../src/core/model';

const job: SendJob = { campaignId: 'c', recipientId: 'r', attempt: 'a', revision: 1, phone: '+12025550101', text: 'Oi Ana!\n🙂' };
const guard = (): Guard => ({ check: async () => {}, commit: async () => true, local() {} });
beforeEach(() => {
  document.body.innerHTML = '';
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) { return (this.closest('[hidden]') ? [] : [{}]) as unknown as DOMRectList; });
});
function fixture(options: { draft?: string; wrong?: boolean; oldOnly?: boolean; noReceipt?: boolean; mappedClick?: boolean; trustedInput?: boolean; actualInput?: boolean; newChatSvg?: boolean; transition?: boolean; nativeFilter?: boolean; extraRows?: boolean; bidiPhone?: boolean } = {}) {
  let clicks = 0;
  const pointerEvents: string[] = [], queries: string[] = [];
  document.body.innerHTML = `<div id="side"><button id="all-filter" aria-selected="true">Tudo</button><button aria-label="Nova conversa">+</button><div id="pane-side"></div></div><div id="main"><header><span title="Ana">Ana</span></header><footer><div contenteditable="true" role="textbox">${options.draft || ''}</div></footer></div>`;
  document.querySelector('[aria-label="Nova conversa"]')!.addEventListener('click', () => {
    const drawer = document.createElement('div'); drawer.dataset.testid = 'new-chat-drawer';
      const dialer = drawer;
      dialer.innerHTML = `<header><button aria-label="Voltar">←</button></header><button aria-label="Número de telefone">Telefone</button><div data-testid="chat-list-search-container">${options.actualInput ? '<input role="textbox" type="text">' : '<div contenteditable="true" role="textbox"></div>'}</div>${options.extraRows ? '<div role="row"><span>Contatos</span></div>' : ''}<div role="row"><div role="gridcell" tabindex="0"><span data-testid="cell-frame-title"><span>Ana</span></span></div></div>${options.extraRows ? '<div role="row"><span>Grupos em comum</span></div><div role="row"><span data-testid="cell-frame-title">Grupo com foto personalizada</span></div>' : ''}`;
      dialer.querySelector('[aria-label="Número de telefone"]')!.addEventListener('click', () => { throw Error('Não deve desviar para Telefone'); });
      dialer.querySelector('button')!.addEventListener('click', () => dialer.remove());
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) dialer.querySelector('[data-testid="cell-frame-title"]')!.addEventListener(type, e => { pointerEvents.push(e.type); });
      dialer.querySelector('[data-testid="cell-frame-title"]')!.addEventListener('click', e => {
        if (!options.mappedClick || (e.target === dialer.querySelector('[data-testid="cell-frame-title"] span') && pointerEvents.join(',') === 'pointerdown,mousedown,pointerup,mouseup')) dialer.remove();
      });
      if (options.transition) {
        document.querySelector('#pane-side')!.setAttribute('hidden', '');
        setTimeout(() => { document.body.append(dialer); document.querySelector('#pane-side')!.removeAttribute('hidden'); }, 3);
      } else document.body.append(dialer);
  });
  document.querySelector('#main header [title]')!.addEventListener('click', () => {
    const pane = document.createElement('aside'); pane.innerHTML = `<div>Dados do contato</div><span>${options.wrong ? '+1 202 555-0109' : '+1 202 555-0101'}</span><button aria-label="Fechar"><span data-icon="x">×</span></button>`;
    pane.querySelector('button')!.addEventListener('click', () => pane.remove()); document.body.append(pane);
  });
  const old = document.createElement('div'); old.className = 'message-out'; old.dataset.id = 'true_12025550101_OLD';
  old.innerHTML = '<span class="selectable-text">Oi Ana!<br><img class="emoji" alt="🙂"></span><span data-icon="msg-check"></span>';
  document.querySelector('#main')!.append(old);
  const send = document.createElement('button'); send.setAttribute('aria-label', 'Enviar'); send.innerHTML = '<span data-icon="send">Enviar</span>';
  send.addEventListener('click', () => {
    clicks++;
    if (!options.oldOnly) {
      const sent = old.cloneNode(true) as HTMLElement; sent.dataset.id = 'true_12025550101_NEW';
      if (options.noReceipt) sent.querySelector('[data-icon]')!.remove();
      document.querySelector('#main')!.append(sent);
    }
    document.querySelector('[contenteditable]')!.textContent = '';
  }); document.querySelector('footer')!.append(send);
  const trustedInput = (target: Element) => { const event = new InputEvent('input', { bubbles: true, inputType: 'insertText' }); Object.defineProperty(event, 'isTrusted', { value: true }); target.dispatchEvent(event); };
  Object.defineProperty(document, 'execCommand', { configurable: true, value: (_command: string, _ui: boolean, value: string) => {
    const target = document.activeElement!;
    if (target.closest('[data-testid="new-chat-drawer"]')) {
      // Native insertText appends at the caret; mimic contenteditable's bidi
      // formatting without changing the digits. The old bulk reader rejected it.
      target.textContent = (target.textContent || '').replace(/\u200e/g, '') + value + (options.bidiPhone ? '\u200e' : '');
    } else target.textContent = value;
    if (target.closest('[data-testid="new-chat-drawer"]')) queries.push(value);
    if (options.trustedInput) trustedInput(target);
    return true;
  } });
  if (options.newChatSvg) { const create = document.querySelector('[aria-label="Nova conversa"]')!; create.removeAttribute('aria-label'); create.innerHTML = '<svg><title>wds-ic-new-chat-filled</title></svg>'; }
  if (options.nativeFilter) { const all = document.querySelector('#all-filter')!; all.removeAttribute('aria-selected'); all.setAttribute('data-state', 'active'); }
  const adapter = new WhatsAppAdapter(document, options.transition ? async () => { await new Promise(r => setTimeout(r, 1)); } : async () => {}, options.transition ? 500 : 60);
  return { adapter, clicks: () => clicks, pointerEvents, queries, trustedInput };
}
test('fluxo DOM completo: busca em Nova conversa, confere dados e confirma saída nova', async () => {
  const f = fixture(); const result = await f.adapter.send(job, guard());
  expect(result.status).toBe('dispatched'); expect(f.clicks()).toBe(1);
});

test('regressão fluxo solicitado: input nativo, contato aberto e envio sem voltar à lista', async () => {
  const f = fixture({ actualInput: true, mappedClick: true });
  const edits: string[] = []; let back = 0;
  document.addEventListener('input', e => { if (e.target instanceof HTMLInputElement) edits.push(e.target.value); });
  document.addEventListener('click', e => { if ((e.target as Element).closest('[aria-label="Voltar"]')) back++; });
  const result = await f.adapter.send(job, guard());
  expect(result.status, result.detail).toBe('dispatched');
  expect(edits).toEqual([...job.phone.slice(1)].map((_, i) => job.phone.slice(1, i + 2)));
  expect(back).toBe(0); expect(f.clicks()).toBe(1);
});

test('regressão fluxo solicitado: busca sem resultado permanece aberta e não envia', async () => {
  const f = fixture({ actualInput: true });
  document.addEventListener('input', e => {
    if (e.target instanceof HTMLInputElement) document.querySelectorAll('[data-testid="new-chat-drawer"] [role="row"]').forEach(row => row.remove());
  }, { once: true });
  const result = await f.adapter.send(job, guard());
  expect(result.status).toBe('failed'); expect(f.clicks()).toBe(0);
  expect(document.querySelector<HTMLInputElement>('[data-testid="new-chat-drawer"] input')?.value).toBe(job.phone.slice(1));
});

test('fila contínua: aviso de contato não encontrado ignora e limpa busca sem enviar', async () => {
  const f = fixture({ actualInput: true }); const g = guard(); let commits = 0;
  g.commit = async () => { commits++; return true; };
  document.addEventListener('input', e => {
    if (!(e.target instanceof HTMLInputElement)) return;
    const drawer = e.target.closest('[data-testid="new-chat-drawer"]')!;
    drawer.querySelectorAll('[role="row"]').forEach(row => row.remove());
    drawer.insertAdjacentHTML('beforeend', '<span>Nenhum contato encontrado</span>');
  }, { once: true });
  const result = await f.adapter.send(job, g);
  expect(result.status, result.detail).toBe('skipped');
  expect(document.querySelector('[data-testid="new-chat-drawer"]')).toBeNull();
  expect(f.clicks()).toBe(0); expect(commits).toBe(0);
});

test('fila contínua: clique retorna sem esperar mensagem nova ou recibo', async () => {
  const f = fixture({ actualInput: true, oldOnly: true });
  const result = await f.adapter.send(job, guard());
  expect(result.status, result.detail).toBe('dispatched'); expect(f.clicks()).toBe(1);
  expect(result.messageId).toBeUndefined();
});
test('regressão Gatherco: input confiável do execCommand não é intervenção humana', async () => {
  const f = fixture({ trustedInput: true });
  const result = await f.adapter.send(job, guard());
  expect(result.status, result.detail).toBe('dispatched'); expect(f.clicks()).toBe(1);
  expect(f.queries.join('')).toBe('12025550101');
});
test('regressão Gatherco: conteúdo interno recebe foco e sequência pointer/mouse antes do clique', async () => {
  const f = fixture({ mappedClick: true });
  const result = await f.adapter.send(job, guard());
  expect(result.status, result.detail).toBe('dispatched');
  expect(f.pointerEvents).toEqual(['pointerdown', 'mousedown', 'pointerup', 'mouseup']); expect(f.clicks()).toBe(1);
});
test('regressão Gatherco: transição React entre painéis aguarda novo painel', async () => {
  const f = fixture({ transition: true, trustedInput: true }); const result = await f.adapter.send(job, guard());
  expect(result.status, result.detail).toBe('dispatched'); expect(f.clicks()).toBe(1);
});
test('regressão Gatherco: SVG Nova conversa, data-state active e seções/grupos não são contatos', async () => {
  const f = fixture({ newChatSvg: true, nativeFilter: true, extraRows: true, mappedClick: true });
  const result = await f.adapter.send(job, guard()); expect(result.status, result.detail).toBe('dispatched'); expect(f.clicks()).toBe(1);
});
test('input humano fora do comando de escrita ainda interrompe antes do clique', async () => {
  const f = fixture({ trustedInput: true }); const g = guard();
  g.check = async () => { if (document.querySelector('[contenteditable]')?.textContent === job.text) f.trustedInput(document.querySelector('[contenteditable]')!); };
  const result = await f.adapter.send(job, g); expect(result.status).toBe('failed'); expect(result.detail).toMatch(/Intervenção/); expect(f.clicks()).toBe(0);
});
test('editor visualmente vazio com parágrafo e BR não é confundido com rascunho', async () => {
  const f = fixture({ trustedInput: true }); document.querySelector('#main [contenteditable]')!.innerHTML = '<p><br></p>';
  const result = await f.adapter.send(job, guard()); expect(result.status, result.detail).toBe('dispatched'); expect(f.clicks()).toBe(1);
});
test('regressão gravação: Telefone usa dígitos progressivos e aceita formatação bidi nativa', async () => {
  const f = fixture({ bidiPhone: true, trustedInput: true, mappedClick: true });
  const result = await f.adapter.send(job, guard());
  expect(result.status, result.detail).toBe('dispatched'); expect(f.clicks()).toBe(1);
  expect(f.queries).toEqual([...job.phone.slice(1)]);
});
test('rascunho humano é preservado e não navega nem clica', async () => {
  const f = fixture({ draft: 'meu rascunho' }); const result = await f.adapter.send(job, guard());
  expect(result.status).toBe('failed'); expect(document.querySelector('[contenteditable]')!.textContent).toBe('meu rascunho'); expect(f.clicks()).toBe(0);
});
test('telefone incorreto bloqueia antes do editor', async () => {
  const f = fixture({ wrong: true }); const result = await f.adapter.send(job, guard()); expect(result.status).toBe('failed'); expect(result.detail).toMatch(/não corresponde/); expect(f.clicks()).toBe(0);
  expect(document.querySelector('aside')).toBeNull();
});

test('conferência BR: mesmo DDD e oito finais aceita nono dígito, mas rejeita outro DDD ou DDI', () => {
  expect(contactPhoneMatches('+55 11 8765-4321', '+5511987654321')).toBe(true);
  expect(contactPhoneMatches('(11) 8765-4321', '+5511987654321')).toBe(true);
  expect(contactPhoneMatches('+55 11 98765-4321', '+551187654321')).toBe(true);
  expect(contactPhoneMatches('+55 21 8765-4321', '+5511987654321')).toBe(false);
  expect(contactPhoneMatches('+55 11 8765-4322', '+5511987654321')).toBe(false);
  expect(contactPhoneMatches('+1 1187654321', '+5511987654321')).toBe(false);
});

test('conferência BR: diferença do nono dígito fecha dados e continua até o envio', async () => {
  const f = fixture({ actualInput: true });
  document.querySelector('#main header [title]')!.addEventListener('click', () => {
    document.querySelector('aside > span')!.textContent = '+55 11 8765-4321';
  });
  const result = await f.adapter.send({ ...job, phone: '+5511987654321' }, guard());
  expect(result.status, result.detail).toBe('dispatched'); expect(f.clicks()).toBe(1);
  expect(document.querySelector('aside')).toBeNull();
});

test('dados do contato: usa texto renderizado e espera editor após fechar painel reutilizado', async () => {
  const f = fixture({ actualInput: true });
  const editor = document.querySelector('#main footer')!;
  document.querySelector('#main header [title]')!.addEventListener('click', () => {
    const pane = document.querySelector('aside')!;
    pane.insertAdjacentHTML('beforeend', '<span hidden>11999999999</span>');
    Object.defineProperty(pane, 'innerText', { configurable: true, value: 'Dados do contato\n+1 202 555-0101\nFechar' });
    editor.setAttribute('hidden', '');
    const close = pane.querySelector('button')!;
    close.replaceWith(close.cloneNode(true));
    pane.querySelector('button')!.addEventListener('click', () => {
      pane.replaceChildren(); // WhatsApp may retain the drawer container.
      Object.defineProperty(pane, 'innerText', { configurable: true, value: '' });
      editor.removeAttribute('hidden');
    });
  });
  const result = await f.adapter.send(job, guard());
  expect(result.status, result.detail).toBe('dispatched'); expect(f.clicks()).toBe(1);
});
test('revogação no commit impede clique e preserva texto para conferência', async () => {
  const f = fixture(), g = guard(); g.commit = async () => false;
  const result = await f.adapter.send(job, g); expect(result.status).toBe('failed'); expect(f.clicks()).toBe(0); expect(domText(document.querySelector('[contenteditable]')!)).toBe(job.text);
});
test('mudança do destinatário depois da autorização produz incerto sem clique', async () => {
  const f = fixture(), g = guard(); g.commit = async () => { document.querySelector('#main header [title]')!.setAttribute('title', 'Outro'); return true; };
  const result = await f.adapter.send(job, g); expect(result.status).toBe('uncertain'); expect(f.clicks()).toBe(0);
});
test('nova confirmação exige ID novo, saída e recibo positivo na mesma linha', () => {
  fixture(); const before = new Set(observations(document).map(o => o.id));
  expect(newConfirmation(document, before, job.text)).toBeUndefined();
  const incoming = document.createElement('div'); incoming.className = 'message-in'; incoming.dataset.id = 'false_12025550101_OTHER'; incoming.innerHTML = '<span class="selectable-text">Oi Ana!<br>🙂</span><span data-icon="msg-check"></span>'; document.querySelector('#main')!.append(incoming);
  expect(newConfirmation(document, before, job.text)).toBeUndefined();
  const outgoing = document.createElement('div'); outgoing.className = 'message-out'; outgoing.dataset.id = 'true_12025550101_NEW'; outgoing.innerHTML = '<span class="selectable-text">Oi Ana!<br>🙂</span>'; document.querySelector('#main')!.append(outgoing);
  expect(newConfirmation(document, before, job.text)).toBeUndefined();
  outgoing.innerHTML += '<span data-icon="msg-check"></span>';
  expect(newConfirmation(document, before, job.text)?.id).toContain('NEW');
});
test('emojis e links aninhados são lidos uma vez, citação ignorada', () => {
  document.body.innerHTML = '<span id="text" class="selectable-text">Olá <img alt="🙂"><span class="selectable-text"><a>https://exemplo.test</a></span><blockquote>citado</blockquote></span>';
  expect(domText(document.querySelector('#text')!)).toBe('Olá 🙂https://exemplo.test');
});
test('recuperação fecha somente painéis de criação e confirma Tudo', async () => {
  document.body.innerHTML = '<div id="side"><button id="all-filter" aria-selected="true">Tudo</button><div id="pane-side"></div></div><section data-testid="dialer-pad-drawer"><header><button aria-label="Voltar">←</button></header></section>';
  let back = 0; document.querySelector('[aria-label="Voltar"]')!.addEventListener('click', e => { back++; (e.target as Element).closest('section')!.remove(); });
  const a = new WhatsAppAdapter(document, async () => {}, 20); await a.recoverList(guard()); expect(back).toBe(1);
});
test('recuperação sem efeito tem limite e STOP bloqueia até o Voltar', async () => {
  document.body.innerHTML = '<div id="pane-side"></div><section data-testid="dialer-pad-drawer"><header><button aria-label="Voltar">←</button></header></section>';
  let clicks = 0; document.querySelector('button')!.addEventListener('click', () => clicks++);
  const a = new WhatsAppAdapter(document, async () => {}, 15);
  await expect(a.recoverList(guard())).rejects.toThrow(); expect(clicks).toBe(1);
  const g = guard(); g.local = () => { throw Error('STOP'); }; await expect(a.recoverList(g)).rejects.toThrow('STOP'); expect(clicks).toBe(1);
});
test('logout e aba invisível bloqueiam a operação', () => {
  document.body.innerHTML = '<div data-testid="qrcode"></div>'; expect(new WhatsAppAdapter().health().ready).toBe(false);
  document.body.innerHTML = '<div id="pane-side"></div>'; Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); expect(new WhatsAppAdapter().health().ready).toBe(false);
});
