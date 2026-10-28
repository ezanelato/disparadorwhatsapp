import type { SendJob, SendResult } from '../core/model';
export interface Guard { check(): Promise<void>; commit(): Promise<boolean>; local(): void }
export interface Adapter { health(): { ready: boolean; reason: string }; send(job: SendJob, guard: Guard): Promise<SendResult> }
