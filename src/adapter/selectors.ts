// Visible DOM only. Keep compatibility changes and bounded recovery here.
export const S = {
  main: '#main', list: '#pane-side',
  composer: '#main footer [contenteditable="true"][role="textbox"]',
  qr: '[data-testid="qrcode"],[data-testid="link-device-qrcode"],canvas[aria-label*="QR"]',
  drawer: '[data-testid="dialer-pad-drawer"],[data-testid="new-chat-drawer"]',
  newChat: 'button[aria-label="Nova conversa"],button[aria-label="New chat"],[role="button"][aria-label="Nova conversa"],[role="button"][aria-label="New chat"]',
  phoneButton: '[aria-label="Número de telefone"],[aria-label="Phone number"]',
  dialer: '[data-testid="dialer-pad-drawer"]', newDrawer: '[data-testid="new-chat-drawer"]',
  newChatSearch: '[data-testid="chat-list-search-container"] input[role="textbox"],[data-testid="chat-list-search-container"] [contenteditable="true"][role="textbox"]',
  back: '[aria-label="Voltar"],[aria-label="Back"],[aria-label="Fechar"],[aria-label="Close"],[title="Voltar"],[title="Back"],[title="Fechar"],[title="Close"],[data-icon="back"],[data-icon="arrow-left"],[data-testid="back"],[data-icon="x"]',
  all: '#all-filter,#side button,#side [role="button"],#side [role="tab"],[data-testid="drawer-left"] [role="tab"],[aria-label="chat-list-filters"] button',
  row: '[role="listitem"],[role="row"],[data-testid="cell-frame-container"]',
  send: '#main footer button,#main footer [role="button"]',
  sendIcon: '[data-icon="send"],[data-testid="send"]',
  contactInfo: '[data-testid="conversation-info-header"],[data-testid="conversation-info-header-chat-title"]',
  close: '[aria-label="Fechar"],[aria-label="Close"],[title="Fechar"],[title="Close"],[data-icon="x"],[data-icon="x-alt"],[data-icon="x-viewer"]',
  outgoing: '#main .message-out[data-id],#main .message-out [data-id],#main [data-id^="true_"]',
  body: '.selectable-text', quoted: 'blockquote,[data-testid*="quoted"],[data-testid*="preview"]',
  receipt: '[data-icon="msg-check"],[data-icon="msg-dblcheck"],[aria-label="Enviada"],[aria-label="Entregue"],[aria-label="Lida"],[aria-label="Sent"],[aria-label="Delivered"],[aria-label="Read"]',
};
export const visible = (el: Element | null | undefined): el is HTMLElement => !!el && el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
export const norm = (s: string | null) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
export function unique(scope: ParentNode, selector: string): HTMLElement | null {
  const elements = [...scope.querySelectorAll(selector)].filter(visible);
  return elements.length === 1 ? elements[0] : null;
}
export function control(el: HTMLElement) { return el.closest<HTMLElement>('button,[role="button"]') || el; }
export const selectedFilter = (el: Element) => ['aria-selected', 'aria-pressed', 'aria-checked', 'data-selected', 'data-active'].some(attr => el.getAttribute(attr) === 'true') || ['active', 'on', 'checked'].includes(el.getAttribute('data-state') || '');
export function controls(scope: ParentNode, selector: string) {
  return [...new Set([...scope.querySelectorAll(selector)].filter(visible).map(control))].filter(el => scope.contains(el));
}
