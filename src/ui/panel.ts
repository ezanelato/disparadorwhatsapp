import brand from '../../brand.json';
import { contactsFromGrid, csvGrid, sheets, xlsxGrid, type Grid, type Mapping } from '../core/import';
import { freezeRecipients, personalize } from '../core/personalize';
import { emptyState, statusLabel, type Contact, type State, type Recipient } from '../core/model';
import { rpc } from '../protocol';
import type { CountryCode } from 'libphonenumber-js';
import './panel.css';

interface Draft { contacts: Contact[]; template: string; quantity: number; interval: number; fallback: Record<string, string>; title: string; country: CountryCode; mode: 'whatsapp' | 'simulation'; tabId?: number; tabTitle?: string; grid?: Grid; mapping: Mapping; stats?: { imported: number; valid: number; invalid: number; duplicate: number; excluded: number } }
const initial = (): Draft => ({ contacts: [], template: '', quantity: 1, interval: 60, fallback: {}, title: 'Minha primeira campanha', country: 'BR', mode: 'whatsapp', mapping: { phone: -1, name: -1, company: -1 } });
let draft = initial(), state: State = emptyState(), step = 0, page = 0, preview = 0, historyId = '', notice = '', linked = false, consent = false, busy = false;
let tabs: { id: number; title: string; active: boolean }[] = [], sheetNames: string[] = [], pendingFile: File | undefined;
const root = document.querySelector<HTMLDivElement>('#app')!;
const h = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const selected = () => draft.contacts.filter(c => c.selected && !c.reason && !state.exclusions.includes(c.phone));
const pendingFields = () => [...new Set(selected().slice(0, draft.quantity).flatMap(c => personalize(draft.template, c.fields, draft.fallback).missing))];
const button = (action: string, text: string, cls = 'secondary', disabled = false, attrs = '') => `<button type="button" data-action="${action}" class="${cls}" ${disabled ? 'disabled' : ''} ${attrs}>${text}</button>`;
const time = (value: number) => new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
function download(text: string, name: string) { const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); }
let saveTimer: ReturnType<typeof setTimeout>;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { void rpc('DRAFT_SET', draft).catch(showError); }, 250); }
function showError(err: unknown) { notice = (err as Error).message || String(err); renderNotice(); }
function renderNotice() { const n = root.querySelector('#notice'); if (n) { n.textContent = notice; n.classList.toggle('hidden', !notice); } }
function current() { return state.campaigns.find(c => c.id === historyId) || state.campaigns.find(c => c.id === state.activeId) || state.campaigns.at(-1); }
function options(chosen: number) { return `<option value="-1">Não mapear</option>` + (draft.grid?.[0] || []).map((name, i) => `<option value="${i}" ${chosen === i ? 'selected' : ''}>${h(name)}</option>`).join(''); }
function frame() {
  root.innerHTML = `<header class="brand"><div class="brandmark" aria-hidden="true">${h(brand.initial)}</div><div><strong>${h(brand.name)}</strong><span>${h(brand.description)}</span></div><span class="local-badge">LOCAL</span></header>
    <main><section class="connection" aria-label="Conexão"><div class="connection-line"><span class="dot ${linked || draft.mode === 'simulation' ? 'online' : ''}"></span><strong>${draft.mode === 'simulation' ? 'Simulador local' : linked ? 'WhatsApp disponível' : 'Vincule seu WhatsApp'}</strong>${button('refresh-tabs', '↻', 'icon', busy, 'aria-label="Atualizar abas"')}</div>
    <label class="compact-label" for="mode">Ambiente de execução</label><select id="mode"><option value="whatsapp" ${draft.mode === 'whatsapp' ? 'selected' : ''}>WhatsApp Web · envio real após revisão</option><option value="simulation" ${draft.mode === 'simulation' ? 'selected' : ''}>Simulação local · sem envios reais</option></select>
    ${draft.mode === 'whatsapp' ? `<div class="bind-row"><select id="tab" aria-label="Aba do WhatsApp"><option value="">Escolha uma aba</option>${tabs.map(t => `<option value="${t.id}" ${draft.tabId === t.id ? 'selected' : ''}>${h(t.title)} · #${t.id}${t.active ? ' · ativa' : ''}</option>`).join('')}</select>${button('bind', 'Vincular', 'secondary', busy)}</div><p class="micro">Aba vinculada: ${h(draft.tabId ? `${draft.tabTitle || 'WhatsApp'} · #${draft.tabId}` : 'nenhuma')}. Mantenha-a ativa.</p>` : '<p class="micro">O simulador usa a mesma fila. Não controla abas nem envia ao WhatsApp.</p>'}</section>
    <nav class="steps" aria-label="Etapas">${['Contatos', 'Mensagem', 'Revisão', 'Resultados'].map((title, i) => `<button data-action="step" data-step="${i}" class="${step === i ? 'active' : ''}" aria-current="${step === i ? 'step' : 'false'}"><span>${i + 1}</span>${title}</button>`).join('')}</nav>
    <div id="notice" class="notice ${notice ? '' : 'hidden'}" role="alert">${h(notice)}</div><div id="stage"></div>
    <details class="settings"><summary>Exclusões, histórico e dados locais</summary><div class="settings-body"><h3>Não enviar para</h3><p class="micro">Exclusões são preservadas ao reimportar. Adicionar uma exclusão pausa a campanha ativa.</p><label for="exclude-phone">Telefone completo com DDI</label><div class="bind-row"><input id="exclude-phone" type="text" placeholder="+55 …">${button('exclude-add', 'Adicionar')}</div><ul class="exclusions">${state.exclusions.map(p => `<li>${h(p)} ${button('exclude-remove', 'Remover', 'text-button', busy, `data-phone="${h(p)}"`)}</li>`).join('') || '<li>Nenhum contato excluído.</li>'}</ul>
    <h3>Campanhas salvas</h3><select id="history" aria-label="Histórico de campanhas"><option value="">Selecione uma campanha</option>${state.campaigns.map(c => `<option value="${c.id}" ${current()?.id === c.id ? 'selected' : ''}>${h(c.title)} · ${statusLabel[c.status]}${c.mode === 'simulation' ? ' · SIMULAÇÃO' : ''}</option>`).join('')}</select>${button('history-open', 'Ver resultados')}${button('delete', 'Excluir campanha selecionada', 'danger-text', busy || !current() || state.activeId === current()?.id || state.lease?.campaignId === current()?.id)}
    <hr><p class="micro">Apagar remove contatos, mensagens, relatórios, preferências e exclusões deste navegador.</p><label for="erase">Digite APAGAR para excluir tudo</label><input id="erase" autocomplete="off">${button('clear', 'Apagar todos os dados locais', 'danger-text', busy)}</div></details>
    <footer>Use com contatos que autorizaram a comunicação.<br>Projeto independente, sem vínculo oficial com o WhatsApp.</footer></main>`;
}
function render() { frame(); renderStage(); }
function renderStage() {
  const stage = root.querySelector<HTMLDivElement>('#stage')!;
  if (step === 0) stage.innerHTML = contactsView();
  if (step === 1) stage.innerHTML = messageView();
  if (step === 2) stage.innerHTML = reviewView();
  if (step === 3) stage.innerHTML = resultsView();
}
function contactsView() {
  const stats = draft.stats;
  const shown = draft.contacts.slice(page * 40, (page + 1) * 40);
  return `<div class="eyebrow">01 / PREPARE SUA LISTA</div><h1>Boas conversas<br>começam por aqui.</h1><p class="lede">Importe seus contatos, confira os números e escolha quem vai receber sua mensagem.</p>
    <label class="upload" for="file"><span class="upload-icon" aria-hidden="true">↥</span><strong>Importar CSV ou XLSX</strong><span>Processamento no seu navegador · até 10 MB</span><input id="file" type="file" accept=".csv,.xlsx"></label><a class="sample" href="examples/leads.csv" download>↓ Baixar lista de exemplo fictícia</a>
    ${sheetNames.length ? `<label for="sheet">Planilha do arquivo XLSX</label><div class="bind-row"><select id="sheet">${sheetNames.map(n => `<option>${h(n)}</option>`).join('')}</select>${button('read-sheet', 'Ler planilha')}</div>` : ''}
    <label for="country">País padrão para números sem DDI</label><select id="country">${[['BR', 'Brasil (+55)'], ['PT', 'Portugal (+351)'], ['US', 'Estados Unidos (+1)'], ['AR', 'Argentina (+54)'], ['MX', 'México (+52)'], ['GB', 'Reino Unido (+44)']].map(([v, t]) => `<option value="${v}" ${draft.country === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
    ${draft.grid ? `<section class="card"><h2>Mapeie as colunas</h2><p class="micro">Primeira linha como cabeçalho. Telefones devem estar formatados como texto no XLSX. Outras colunas ficam disponíveis pelo nome original.</p><label for="map-phone">Telefone (obrigatório)</label><select id="map-phone">${options(draft.mapping.phone)}</select><div class="two-col"><div><label for="map-name">Nome</label><select id="map-name">${options(draft.mapping.name)}</select></div><div><label for="map-company">Empresa</label><select id="map-company">${options(draft.mapping.company)}</select></div></div><p class="micro">${draft.grid.length - 1} linhas lidas · Exemplo: ${h(draft.grid[1]?.join(' · '))}</p>${button('apply-import', 'Aplicar mapeamento', 'secondary', busy)}</section>` : ''}
    ${stats ? `<div class="stats"><div><b>${stats.imported}</b><span>Importados</span></div><div><b>${stats.valid}</b><span>Válidos únicos</span></div><div><b>${stats.invalid}</b><span>Inválidos</span></div><div><b>${stats.duplicate}</b><span>Duplicados</span></div></div><p class="micro">${stats.excluded} na lista de exclusão · ${selected().length} selecionados agora</p>` : ''}
    ${draft.contacts.length ? `<div class="list-toolbar"><strong>Seus contatos</strong>${button('select-all', 'Todos', 'text-button')}${button('select-none', 'Nenhum', 'text-button')}</div><div class="contact-list">${shown.map(c => `<article class="contact ${c.reason || state.exclusions.includes(c.phone) ? 'invalid' : ''}"><label class="contact-check"><input type="checkbox" data-contact="${c.id}" ${c.selected && !state.exclusions.includes(c.phone) ? 'checked' : ''} ${c.reason || state.exclusions.includes(c.phone) ? 'disabled' : ''}><span><strong>${h(c.name || 'Sem nome')}</strong><span>${h(c.phone || c.rawPhone)}</span><small>Linha ${c.row}${c.company ? ` · ${h(c.company)}` : ''}</small></span></label><div class="contact-actions">${c.phone ? button('exclude-contact', 'Não enviar', 'text-button', busy, `data-id="${c.id}"`) : ''}${button('remove-contact', '×', 'icon', busy, `data-id="${c.id}" aria-label="Excluir linha ${c.row}"`)}</div>${c.reason || state.exclusions.includes(c.phone) ? `<p class="reason">${h(c.reason || 'Contato na lista de exclusão.')}</p>` : ''}</article>`).join('')}</div>${pager(draft.contacts.length)}<div class="bottom-bar"><span>${selected().length} selecionados</span>${button('next', 'Escrever mensagem →', 'primary', selected().length === 0)}</div>` : '<div class="empty"><span>01</span>Seu próximo passo: importar uma lista.</div>'}`;
}
function pager(total: number) { return `<div class="pagination">${button('page-prev', '←', 'icon', page === 0, 'aria-label="Página anterior"')}<span>Página ${page + 1} de ${Math.max(1, Math.ceil(total / 40))}</span>${button('page-next', '→', 'icon', (page + 1) * 40 >= total, 'aria-label="Próxima página"')}</div>`; }
function messageView() {
  const chosen = selected(); const c = chosen[Math.min(preview, chosen.length - 1)];
  const rendered = c ? personalize(draft.template, c.fields, draft.fallback) : { text: '', missing: [] };
  return `<div class="eyebrow">02 / ESCREVA DO SEU JEITO</div><h1>Uma mensagem.<br>Um toque pessoal.</h1><p class="lede">Use os dados da sua lista para conversar com cada pessoa.</p><label for="title">Nome da campanha</label><input id="title" maxlength="160" value="${h(draft.title)}"><label for="template">Mensagem de texto</label><textarea id="template" maxlength="10000" rows="7" placeholder="Olá, {{nome}}! Tudo bem com você e a equipe da {{empresa}}?">${h(draft.template)}</textarea><div class="editor-meta"><span>Quebras de linha e emojis são bem-vindos.</span><span id="count">${[...draft.template].length} caracteres</span></div><p class="micro">Variáveis: ${['nome', 'empresa', ...(draft.grid?.[0] || []).filter(n => !['nome', 'empresa'].includes(n))].map(n => `<code>{{${h(n)}}}</code>`).join(' ')}</p>
    <div class="two-col"><div><label for="quantity">Quantidade de destinatários</label><input id="quantity" type="number" min="1" max="${chosen.length}" step="1" value="${draft.quantity}"><small>${chosen.length} selecionados elegíveis</small></div><div><label for="interval">Intervalo fixo (segundos)</label><input id="interval" type="number" min="30" max="86400" step="1" value="${draft.interval}"><small>Padrão operacional: 60 s</small></div></div><p class="micro">O intervalo não garante evitar restrições. Cada falha conta dentro do limite escolhido; ninguém será adicionado para substituí-la.</p>
    <section class="card"><h2>Prévia por contato</h2><label for="preview-contact">Destinatário da prévia</label><select id="preview-contact">${chosen.map((c, i) => `<option value="${i}" ${preview === i ? 'selected' : ''}>${h(c.name || c.phone)} · ${h(c.phone)}</option>`).join('')}</select><div class="message-preview" id="preview-text">${h(rendered.text || 'Sua mensagem aparecerá aqui.')}</div><p id="preview-missing" class="reason">${rendered.missing.length ? `Campos ausentes: ${h(rendered.missing.join(', '))}` : ''}</p></section><div id="missing-fields">${missingView()}</div><div class="bottom-bar">${button('back', '← Contatos')}${button('review', 'Revisar campanha →', 'primary', !chosen.length)}</div>`;
}
function missingView() {
  const missing = pendingFields();
  return missing.length ? `<section class="card warning"><h2>Complete os campos ausentes</h2><p class="micro">Os valores abaixo serão usados somente onde a coluna está vazia. Variáveis não resolvidas bloqueiam o início.</p>${missing.map(key => `<label>${h(key)}<input data-fallback="${h(key)}" value="${h(draft.fallback[key] || '')}" placeholder="Valor substituto"></label>`).join('')}${button('exclude-missing', 'Desmarcar contatos com campos ausentes')}</section>` : '';
}
function frozen() { return freezeRecipients(draft.contacts, draft.template, draft.quantity, draft.fallback, state.exclusions, 'review'); }
function reviewView() {
  let recipients: Recipient[] = []; let error = '';
  try { recipients = frozen(); } catch (e) { error = (e as Error).message; }
  return `<div class="eyebrow">03 / CONFIRA ANTES DE INICIAR</div><h1>Tudo pronto<br>para conversar?</h1><p class="lede">Revise a lista final e cada mensagem. Ao iniciar, esta versão será congelada.</p>${draft.mode === 'simulation' ? '<div class="sim-banner">SIMULAÇÃO LOCAL · nenhum envio real</div>' : '<div class="notice">Envio real pelo WhatsApp Web da aba escolhida.</div>'}<section class="card"><h2>${h(draft.title)}</h2><dl><div><dt>Destinatários únicos</dt><dd>${recipients.length || draft.quantity}</dd></div><div><dt>Intervalo entre mensagens</dt><dd>${draft.interval} s</dd></div><div><dt>Aba vinculada</dt><dd>${h(draft.mode === 'simulation' ? 'Simulador local' : draft.tabId ? `#${draft.tabId} · ${draft.tabTitle}` : 'Nenhuma')}</dd></div></dl><p class="micro">Somente os primeiros ${draft.quantity} contatos elegíveis selecionados, na ordem da lista. Falhas e incertos não são reenviados nem substituídos automaticamente.</p></section>${error ? `<p class="notice">${h(error)}</p>` : recipients.slice(page * 40, (page + 1) * 40).map(r => `<details class="review-contact"><summary>${r.index + 1}. ${h(r.name || 'Sem nome')} <span>${h(r.phone)}</span></summary><div class="message-preview">${h(r.text)}</div></details>`).join('')}${pager(recipients.length)}<label class="consent"><input id="consent" type="checkbox" ${consent ? 'checked' : ''}><span>Revisei destinatários e mensagens e tenho autorização desses contatos para esta comunicação.</span></label><div class="bottom-bar">${button('back', '← Mensagem')}${button('start', draft.mode === 'simulation' ? 'Iniciar simulação' : 'Iniciar envios', 'primary', busy || !!error || !consent || (draft.mode === 'whatsapp' && !linked) || !!state.activeId || !!state.lease)}</div>${state.activeId ? '<p class="reason">Há uma campanha ativa. Pause ou cancele em Resultados antes de criar outra.</p>' : ''}`;
}
function resultsView() {
  const c = current();
  if (!c) return '<div class="eyebrow">04 / EXECUÇÃO E RESULTADOS</div><h1>Cada conversa<br>tem seu registro.</h1><div class="empty">Suas campanhas aparecerão aqui depois da revisão.</div>';
  const rows = state.recipients.filter(r => r.campaignId === c.id).sort((a, b) => a.index - b.index);
  const done = rows.filter(r => !['pending', 'preparing', 'authorized'].includes(r.status)).length;
  const confirmed = rows.filter(r => ['confirmed', 'dispatched'].includes(r.status)).length;
  const uncertain = rows.filter(r => r.status === 'uncertain').length;
  const failures = rows.filter(r => r.status === 'failed').length;
  return `<div class="eyebrow">04 / EXECUÇÃO E RESULTADOS</div><h1>${h(c.title)}</h1>${c.mode === 'simulation' ? '<div class="sim-banner">SIMULAÇÃO LOCAL · nenhum envio real</div>' : ''}<div class="run-state"><span class="pill ${c.status}">${statusLabel[c.status]}</span><span>Aba ${c.tabId < 0 ? 'simulada' : '#' + c.tabId}</span></div><label class="progress-label" for="progress">${done} de ${rows.length} processados</label><progress id="progress" max="${rows.length}" value="${done}"></progress><div class="stats"><div><b>${confirmed}</b><span>Envios acionados</span></div><div><b>${failures}</b><span>Falhas</span></div><div><b>${uncertain}</b><span>Incertos</span></div></div><p class="next-send">${state.lease?.campaignId === c.id ? 'Um destinatário em processamento…' : c.status === 'running' ? `Próximo envio previsto: ${time(c.nextAt)}` : 'Nenhum próximo envio autorizado.'}</p>${c.reason ? `<p class="notice">${h(c.reason)}</p>` : ''}<div class="run-controls">${button('pause', 'Pausar', 'secondary', busy || c.status !== 'running')}${button('resume', 'Retomar', 'primary', busy || c.status !== 'paused' || !!state.lease)}${button('cancel', 'Cancelar', 'danger-text', busy || !['running', 'paused'].includes(c.status))}</div><p class="micro">Envio acionado significa que o clique em Enviar foi executado, sem aguardar confirmação. Contatos não encontrados são ignorados. Resultados incertos exigem conferência manual e nunca são reenviados automaticamente.</p>${button('export', '↓ Exportar relatório CSV', 'secondary', busy)}<div class="result-list">${rows.slice(page * 40, (page + 1) * 40).map(r => `<details class="result"><summary><span><strong>${r.index + 1}. ${h(r.name || r.phone)}</strong><small>${h(r.phone)}</small></span><span class="status ${r.status}">${statusLabel[r.status]}</span></summary><div class="result-detail"><p>${h(r.detail || 'Aguardando a vez na fila.')}</p><div class="message-preview">${h(r.text)}</div><small>${time(r.updatedAt)}</small></div></details>`).join('')}</div>${pager(rows.length)}`;
}
async function refreshState() { state = await rpc<State>('STATE'); }
async function refreshTabs() { tabs = await rpc('TABS'); }
async function loadGrid(grid: Grid) {
  draft.grid = grid; draft.mapping = { phone: grid[0].findIndex(n => /telefone|phone|celular/i.test(n)), name: grid[0].findIndex(n => /^(nome|name)$/i.test(n)), company: grid[0].findIndex(n => /empresa|company/i.test(n)) };
  sheetNames = []; save(); render();
}
async function action(name: string, target: HTMLElement) {
  notice = '';
  if (name === 'step') { step = Number(target.dataset.step); page = 0; consent = false; render(); return; }
  if (name === 'next') { step = 1; page = 0; render(); return; }
  if (name === 'back') { step = Math.max(0, step - 1); page = 0; consent = false; render(); return; }
  if (name === 'page-prev' || name === 'page-next') { page += name === 'page-prev' ? -1 : 1; renderStage(); return; }
  if (name === 'refresh-tabs') { await refreshTabs(); linked = false; if (draft.tabId) { const health = await rpc('HEALTH', draft.tabId).catch(() => null); linked = !!health?.ready; } }
  if (name === 'bind') {
    const tabId = Number((root.querySelector('#tab') as HTMLSelectElement).value);
    if (!tabId) throw Error('Escolha uma aba do WhatsApp.');
    const health = await rpc('HEALTH', tabId); draft.tabId = tabId; draft.tabTitle = health.title; linked = !!health.ready;
    notice = health.reason; save();
  }
  if (name === 'read-sheet' && pendingFile) await loadGrid(await xlsxGrid(pendingFile, (root.querySelector('#sheet') as HTMLSelectElement).value));
  if (name === 'apply-import' && draft.grid) {
    const result = contactsFromGrid(draft.grid, draft.mapping, draft.country, state.exclusions);
    draft.contacts = result.contacts; draft.stats = result; draft.quantity = Math.max(1, result.valid); page = 0; save();
  }
  if (name === 'select-all' || name === 'select-none') { for (const c of draft.contacts) c.selected = name === 'select-all' && !c.reason && !state.exclusions.includes(c.phone); save(); }
  if (name === 'remove-contact') { draft.contacts = draft.contacts.filter(c => c.id !== target.dataset.id); if (page * 40 >= draft.contacts.length) page = Math.max(0, page - 1); save(); }
  if (name === 'exclude-contact') { const c = draft.contacts.find(c => c.id === target.dataset.id); if (c) { await rpc('EXCLUSION_ADD', c.phone); c.selected = false; await refreshState(); save(); } }
  if (name === 'exclude-add') { await rpc('EXCLUSION_ADD', (root.querySelector('#exclude-phone') as HTMLInputElement).value); await refreshState(); }
  if (name === 'exclude-remove') { await rpc('EXCLUSION_REMOVE', target.dataset.phone); await refreshState(); }
  if (name === 'exclude-missing') { for (const c of selected()) if (personalize(draft.template, c.fields, draft.fallback).missing.length) c.selected = false; draft.quantity = Math.max(1, Math.min(draft.quantity, selected().length)); save(); }
  if (name === 'review') { frozen(); if (!Number.isInteger(draft.interval) || draft.interval < 30 || draft.interval > 86400) throw Error('Intervalo deve ser um inteiro entre 30 e 86.400 segundos.'); step = 2; page = 0; consent = false; }
  if (name === 'start') {
    if (!consent) throw Error('Revise e confirme a autorização de comunicação.');
    frozen();
    historyId = await rpc('START', { ...draft, intervalSeconds: draft.interval });
    await refreshState(); step = 3; page = 0; consent = false; save();
  }
  if (['pause', 'resume', 'cancel'].includes(name)) { if (!current()) return; await rpc(name.toUpperCase(), current()!.id); await refreshState(); }
  if (name === 'export') { if (!current()) return; download(await rpc('EXPORT', current()!.id), `zaplista-${current()!.id}.csv`); }
  if (name === 'history-open') { historyId = (root.querySelector('#history') as HTMLSelectElement).value; step = 3; page = 0; }
  if (name === 'delete') { const id = (root.querySelector('#history') as HTMLSelectElement).value || current()?.id; if (id) { await rpc('DELETE', id); await refreshState(); historyId = ''; } }
  if (name === 'clear') {
    const confirmation = (root.querySelector('#erase') as HTMLInputElement).value;
    if (confirmation !== 'APAGAR') throw Error('Digite APAGAR no campo para confirmar a exclusão local.');
    clearTimeout(saveTimer); await rpc('CLEAR', confirmation); draft = initial(); state = emptyState(); step = 0; page = 0; historyId = ''; linked = false; pendingFile = undefined; sheetNames = []; notice = 'Todos os dados locais foram apagados.';
  }
  render();
}
root.addEventListener('click', e => {
  const target = (e.target as Element).closest<HTMLElement>('[data-action]');
  if (!target || target.hasAttribute('disabled') || busy) return;
  busy = true;
  void action(target.dataset.action!, target).catch(showError).finally(() => { busy = false; render(); });
});
root.addEventListener('input', e => {
  const t = e.target as HTMLInputElement;
  if (t.id === 'template') {
    draft.template = t.value;
    root.querySelector('#count')!.textContent = `${[...t.value].length} caracteres`;
    updatePreview(); root.querySelector('#missing-fields')!.innerHTML = missingView(); save();
  }
  if (t.id === 'title') { draft.title = t.value; save(); }
  if (t.id === 'quantity' || t.id === 'interval') { draft[t.id === 'quantity' ? 'quantity' : 'interval'] = t.value === '' ? 0 : Number(t.value); save(); }
  if (t.dataset.fallback) { draft.fallback[t.dataset.fallback] = t.value; updatePreview(); save(); }
});
function updatePreview() {
  const c = selected()[preview];
  if (!c) return;
  const p = personalize(draft.template, c.fields, draft.fallback);
  root.querySelector('#preview-text')!.textContent = p.text || 'Sua mensagem aparecerá aqui.';
  root.querySelector('#preview-missing')!.textContent = p.missing.length ? `Campos ausentes: ${p.missing.join(', ')}` : '';
}
root.addEventListener('change', e => {
  const t = e.target as HTMLInputElement;
  void (async () => {
    if (t.id === 'file') {
      const file = t.files?.[0]; if (!file) return;
      if (file.size > 10 * 1024 * 1024) throw Error('Arquivo acima do limite de 10 MB.');
      pendingFile = file; notice = '';
      if (/\.csv$/i.test(file.name)) await loadGrid(csvGrid(await file.text()));
      else if (/\.xlsx$/i.test(file.name)) { sheetNames = await sheets(file); if (sheetNames.length === 1) await loadGrid(await xlsxGrid(file, sheetNames[0])); else render(); }
      else throw Error('Selecione um arquivo .csv ou .xlsx.');
    }
    if (t.id === 'mode') { draft.mode = t.value as Draft['mode']; linked = false; consent = false; save(); render(); }
    if (t.id === 'country') { draft.country = t.value as CountryCode; save(); }
    if (t.id.startsWith('map-')) { draft.mapping[t.id === 'map-phone' ? 'phone' : t.id === 'map-name' ? 'name' : 'company'] = Number(t.value); save(); }
    if (t.dataset.contact) { const c = draft.contacts.find(c => c.id === t.dataset.contact); if (c && !c.reason) c.selected = t.checked; save(); renderStage(); }
    if (t.id === 'preview-contact') { preview = Number(t.value); updatePreview(); }
    if (t.id === 'consent') { consent = t.checked; renderStage(); }
    if (t.id === 'history') historyId = t.value;
  })().catch(showError);
});
async function init() {
  try {
    const [saved] = await Promise.all([rpc<Draft | undefined>('DRAFT_GET'), refreshState(), refreshTabs()]);
    if (saved?.contacts && Array.isArray(saved.contacts)) draft = { ...initial(), ...saved };
    if (state.activeId) { step = 3; historyId = state.activeId; }
    render();
    // This timer updates the visible UI only. It never drives or authorizes the queue.
    setInterval(() => { const before = JSON.stringify(state); void refreshState().then(() => { if (step === 3 && !busy && before !== JSON.stringify(state)) renderStage(); }).catch(showError); }, 1500);
  } catch (err) { render(); showError(err); }
}
render(); void init();
