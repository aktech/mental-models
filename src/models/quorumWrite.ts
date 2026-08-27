import type { Model } from '../components/sim/engine';
import { isRWEvent, startReplicatedWrite, stepReplicatedWrite, type ReplicatedWrite, type RWEvent } from './replicatedWrite';

/*
  Client -> coordinator -> N replicas -> coordinator -> client.
  Every network crossing costs `hop`. Each replica has its own disk time.
*/

export interface QuorumParams {
  hop: number;
  disks: number[];
  acksRequired: number;
}

export type QuorumEvent = RWEvent | { kind: 'coord.receive' } | { kind: 'client.receive' };

export interface QuorumState {
  params: QuorumParams;
  phase: 'request' | 'replicating' | 'returning' | 'done';
  write: ReplicatedWrite | null;
  /** when the coordinator had enough acks and replied */
  returnSentAt: number | null;
  /** when the reply reached the client */
  returnedAt: number | null;
}

export const quorumWrite: Model<QuorumParams, QuorumState, QuorumEvent> = {
  init(params, sched) {
    sched.after(params.hop, { kind: 'coord.receive' });
    return { params, phase: 'request', write: null, returnSentAt: null, returnedAt: null };
  },

  step(state, ev, sched) {
    if (isRWEvent(ev)) {
      const before = state.write!;
      const write = stepReplicatedWrite(before, ev, sched.now);
      if (write.completedAt !== null && before.completedAt === null) {
        sched.after(state.params.hop, { kind: 'client.receive' });
        return { ...state, write, phase: 'returning', returnSentAt: sched.now };
      }
      return { ...state, write };
    }
    switch (ev.kind) {
      case 'coord.receive': {
        const { hop, disks, acksRequired } = state.params;
        const replicas = disks.map((disk) => ({ hopOut: hop, disk, hopBack: hop }));
        return { ...state, phase: 'replicating', write: startReplicatedWrite(sched, 'w', replicas, acksRequired) };
      }
      case 'client.receive':
        return { ...state, phase: 'done', returnedAt: sched.now };
    }
  },
};
