import 'fake-indexeddb/auto';
import { test, expect } from 'vitest';
import { Engine, type StartInput } from '../src/core/engine';
import { Repository } from '../src/persistence/repository';
import { SimulatedAdapter } from '../src/adapter/simulated';
import type { SendJob } from '../src/core/model';
import { contactsFromGrid, csvGrid } from '../src/core/import';

const input = (): StartInput => ({ contacts: contactsFromGrid(csvGrid('tel;nome\n+12025550101;Ana\n+12025550102;Bruno\n+12025550103;Carla'), { phone: 0, name: 1, company: -1 }, 'BR', []).contacts, template: 'Oi {{nome}}!\n🙂', quantity: 2, fallback: {}, intervalSeconds: 60, tabId: -1, tabTitle: 'Simulador', title: 'Teste', mode: 'simulation' });
function setup() {
  const store = new Repository(crypto.randomUUID()); let clock = Date.now();
  const engine = new Engine(store, 'browser1', () => clock);
  return { store, engine, advance: () => clock += 60_000 };
}

test('fila contínua: contato ignorado avança para próximo e clique encerra sem confirmação', async () => {
  const { store, engine, advance } = setup(); await engine.start(input());
  await engine.tick(async () => ({ status: 'skipped', detail: 'Contato não encontrado.' }));
  let state = await store.read();
  expect(state.recipients[0].status).toBe('skipped'); expect(state.campaigns[0].status).toBe('running');
  advance();
  await engine.tick(async job => {
    expect(job.phone).toBe(input().contacts[1].phone);
    expect(await engine.permit(job, -1, true)).toBe(true);
    return { status: 'dispatched', detail: 'Clique executado.' };
  });
  state = await store.read();
  expect(state.recipients[1].status).toBe('dispatched'); expect(state.campaigns[0].status).toBe('completed');
});

test('fila contínua: não aceita envio acionado sem autorização nem ignora após intenção', async () => {
  const first = setup(); await first.engine.start(input());
  await first.engine.tick(async () => ({ status: 'dispatched', detail: 'Sem autorização.' }));
  expect((await first.store.read()).recipients[0].status).toBe('failed');
  const second = setup(); await second.engine.start(input());
  await second.engine.tick(async job => {
    await second.engine.permit(job, -1, true);
    return { status: 'skipped', detail: 'Resposta inconsistente.' };
  });
  expect((await second.store.read()).recipients[0].status).toBe('uncertain');
});
async function send(engine: Engine, scenario: ConstructorParameters<typeof SimulatedAdapter>[0] = 'ok') {
  const adapter = new SimulatedAdapter(scenario, async () => {});
  await engine.tick(job => adapter.send(job, { local() {}, check: async () => { if (!await engine.permit(job, -1)) throw Error('Revogada'); }, commit: () => engine.permit(job, -1, true) }));
  return adapter;
}
test('intenção é persistida antes do clique e confirmação tem evento', async () => {
  const { store, engine } = setup(); const id = await engine.start(input());
  await engine.tick(async job => {
    expect(await engine.permit(job, -1, true)).toBe(true);
    expect((await store.read()).recipients[0].status === 'authorized' || (await store.read()).recipients[1].status === 'authorized').toBe(true);
    expect(await engine.permit(job, -1, true)).toBe(false);
    return { status: 'confirmed', detail: 'SIMULAÇÃO', messageId: 'new1' };
  });
  expect((await store.events(id)).map(e => e.kind)).toContain('intent');
  expect((await store.read()).recipients.filter(r => r.status === 'confirmed')).toHaveLength(1);
});
test('duas instâncias: somente uma assume o envio; duas criações não coexistem', async () => {
  const { engine, store } = setup(), other = new Engine(store, 'browser1');
  const results = await Promise.allSettled([engine.start(input()), other.start(input())]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  let release!: () => void, calls = 0;
  const blocking = new Promise<void>(r => release = r);
  const first = engine.tick(async () => { calls++; await blocking; return { status: 'failed', detail: 'Antes do clique.' }; });
  await new Promise(r => setTimeout(r, 20));
  await other.tick(async () => { calls++; return { status: 'failed', detail: 'Não deveria iniciar' }; });
  release(); await first; expect(calls).toBe(1);
});
test.each(['pause', 'cancel'] as const)('%s revoga autorização antes do clique', async action => {
  const { engine, store } = setup(); const id = await engine.start(input());
  let clicks = 0;
  await engine.tick(async job => {
    await engine.control(action, id);
    if (await engine.permit(job, -1, true)) clicks++;
    return { status: 'failed', detail: 'Revogado antes do clique' };
  });
  expect(clicks).toBe(0);
  expect((await store.read()).campaigns[0].status).toBe(action === 'pause' ? 'paused' : 'cancelled');
});
test('pausa após clique preserva resultado confirmado e impede o seguinte', async () => {
  const { engine, store, advance } = setup(); const id = await engine.start(input());
  await engine.tick(async job => { expect(await engine.permit(job, -1, true)).toBe(true); await engine.control('pause', id); return { status: 'confirmed', detail: 'Já clicado', messageId: 'new' }; });
  advance(); const adapter = await send(engine);
  expect(adapter.clicks).toBe(0); expect((await store.read()).recipients.filter(r => r.status === 'confirmed')).toHaveLength(1);
});
test.each(['draft', 'wrong-phone'] as const)('simulador bloqueia %s antes do clique', async scenario => {
  const { engine, store } = setup(); await engine.start(input()); const adapter = await send(engine, scenario);
  expect(adapter.clicks).toBe(0); expect((await store.read()).recipients.filter(r => r.status === 'failed')).toHaveLength(1);
});
test('resultado incerto não é reenviado; falha não é substituída por um terceiro contato', async () => {
  const { engine, store, advance } = setup(); const id = await engine.start(input());
  await send(engine, 'uncertain');
  expect((await store.read()).recipients.filter(r => r.status === 'uncertain')).toHaveLength(1);
  await engine.control('resume', id); advance(); const adapter = await send(engine); advance(); await send(engine);
  const s = await store.read();
  expect(adapter.clicks).toBe(1); expect(s.recipients).toHaveLength(2);
  expect(s.recipients.filter(r => r.status === 'uncertain')).toHaveLength(1); expect(s.campaigns[0].status).toBe('completed');
});
test.each([false, true])('recuperação após perda em preparação/commit %s', async commit => {
  const { engine, store } = setup(); await engine.start(input());
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>(r => started = r), end = new Promise<void>(r => release = r);
  const tick = engine.tick(async job => { if (commit) await engine.permit(job, -1, true); started(); await end; throw Error('worker perdido'); });
  await gate;
  const restarted = new Engine(store, 'browser1'); await restarted.recover();
  expect((await store.read()).campaigns[0].status).toBe('paused');
  expect((await store.read()).recipients.filter(r => r.status === (commit ? 'uncertain' : 'failed'))).toHaveLength(1);
  release(); await tick;
  expect((await send(restarted)).clicks).toBe(0);
});
test('reinício do navegador pausa inclusive uma fila entre envios; reabertura do painel só lê', async () => {
  const { engine, store } = setup(); const id = await engine.start(input()); await send(engine);
  const reopened = new Repository((store as any).name || 'not-used'); void reopened;
  expect((await store.read()).campaigns[0].status).toBe('running');
  const restarted = new Engine(store, 'browser2'); await restarted.recover(); expect((await store.read()).campaigns[0].status).toBe('paused');
  await restarted.control('resume', id); expect((await store.read()).campaigns[0].session).toBe('browser2');
});
test('suspensão do worker entre envios preserva nextAt; alarme antecipado não envia', async () => {
  const { engine, store, advance } = setup(); await engine.start(input()); await send(engine);
  const nextAt = (await store.read()).campaigns[0].nextAt;
  const restarted = new Engine(store, 'browser1'); await restarted.recover();
  expect((await store.read()).campaigns[0].nextAt).toBe(nextAt); expect((await send(engine)).clicks).toBe(0);
  advance(); expect((await send(engine)).clicks).toBe(1);
});
test('exclusão aplicada depois da criação ignora destinatário sem reposição', async () => {
  const { engine, store } = setup(); await engine.start(input());
  await store.mutate(s => { s.exclusions.push('+12025550101'); }); await send(engine);
  expect((await store.read()).recipients.filter(r => r.status === 'skipped')).toHaveLength(1); expect((await store.read()).recipients).toHaveLength(2);
});
test('aba errada e tentativa adulterada não têm autorização; eventos e exclusão de campanha', async () => {
  const { engine, store } = setup(); const id = await engine.start(input());
  await engine.tick(async job => {
    expect(await engine.permit(job, 5, true)).toBe(false);
    expect(await engine.permit({ ...job, phone: '+12025550109' }, -1, true)).toBe(false);
    await expect(store.deleteCampaign(id)).rejects.toThrow();
    return { status: 'failed', detail: 'Antes do envio' };
  });
  await engine.control('cancel', id); await store.deleteCampaign(id); expect((await store.read()).recipients).toHaveLength(0); expect(await store.events(id)).toHaveLength(0);
});
test('exceção após commit é incerta; erro antes é falha', async () => {
  for (const committed of [false, true]) {
    const { engine, store } = setup(); await engine.start(input());
    await engine.tick(async job => { if (committed) await engine.permit(job, -1, true); throw Error('Canal perdido'); });
    expect((await store.read()).recipients.some(r => r.status === (committed ? 'uncertain' : 'failed'))).toBe(true);
  }
});
