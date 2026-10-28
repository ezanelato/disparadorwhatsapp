import type { Adapter, Guard } from './types';
import type { SendJob, SendResult } from '../core/model';
export class SimulatedAdapter implements Adapter {
  clicks = 0;
  constructor(readonly scenario: 'ok' | 'draft' | 'wrong-phone' | 'uncertain' = 'ok', readonly wait = () => new Promise<void>(r => setTimeout(r, 500))) {}
  health() { return { ready: true, reason: 'Simulador local. Nenhuma mensagem real será enviada.' }; }
  async send(job: SendJob, guard: Guard): Promise<SendResult> {
    let intent = false;
    try {
      await guard.check(); await this.wait(); guard.local();
      if (this.scenario === 'draft') throw Error('Há um rascunho humano. Nenhum conteúdo foi substituído.');
      if (this.scenario === 'wrong-phone') throw Error('O telefone aberto não corresponde ao destinatário.');
      await guard.check();
      if (!await guard.commit()) throw Error('Autorização revogada antes do clique.');
      intent = true; guard.local(); this.clicks++;
      await this.wait();
      if (this.scenario === 'uncertain') throw Error('Sem evidência confiável de uma nova mensagem.');
      return { status: 'confirmed', detail: 'SIMULAÇÃO: mensagem confirmada no adaptador fictício.', messageId: `sim-${job.attempt}` };
    } catch (err) { return { status: intent ? 'uncertain' : 'failed', detail: (err as Error).message }; }
  }
}
