import type { Model, Scheduler } from '../components/sim/engine';
import {
  isRWEvent,
  startReplicatedWrite,
  stepReplicatedWrite,
  type ReplicaSpec,
  type ReplicatedWrite,
  type RWEvent,
} from './replicatedWrite';

/*
  Longhorn volume, RWO vs RWX, on a three-node cluster.

  Placement:
    pods       land round-robin: pod 1 on node 1, pod 2 on node 2, pod 3 on
               node 3, pod 4 on node 1 again.
    replicas   one per node (replica i on node i), or on three dedicated
               storage nodes that run no pods.
    engine     runs on the node that holds the filesystem: the writing pod's
               node in RWO (node 1), the share manager's node in RWX (node 2).

  Bottom of the stack, identical in both modes: the engine fans every write to
  all three replicas and waits for all three. A replica on the engine's own
  node is a local write; every other replica is a network hop each way.

  RWO: only pods on the engine's node can attach. They write in-process and
       their writes overlap at the engine.
  RWX: every pod reaches the share manager over NFS, one extra hop each way,
       and the share manager serves one write at a time.

  Every attached pod issues one write at t = 0.
*/

export type Mode = 'rwo' | 'rwx';

export const NODE_COUNT = 3;
export const SHARE_MANAGER_NODE = 1;

export interface LonghornParams {
  mode: Mode;
  pods: number;
  /** pod -> share manager over NFS, one way, ms (RWX only) */
  clientHop: number;
  /** engine -> replica on another node, one way, ms */
  replicaHop: number;
  disks: number[];
  /** replicas live on separate storage nodes, so none is local to the engine */
  dedicatedStorage: boolean;
}

export interface PodState {
  id: number;
  node: number;
  attached: boolean;
  sentAt: number | null;
  /** request reached the share manager (RWX) or the engine (RWO) */
  arrivedAt: number | null;
  /** the engine started replicating this pod's write */
  startedAt: number | null;
  /** all replica acks were in */
  completedAt: number | null;
  /** the pod got its reply */
  returnedAt: number | null;
}

export interface LonghornState {
  params: LonghornParams;
  pods: PodState[];
  /** pods whose write is currently at the engine */
  active: number[];
  /** pods waiting at the share manager (RWX) */
  queue: number[];
  writes: Record<string, ReplicatedWrite>;
}

export type LonghornEvent = RWEvent | { kind: 'sm.arrive'; pod: number } | { kind: 'pod.receive'; pod: number };

export const podNode = (pod: number) => pod % NODE_COUNT;
export const engineNode = (mode: Mode) => (mode === 'rwo' ? 0 : SHARE_MANAGER_NODE);
export const writeId = (pod: number) => `p${pod}`;
const podOf = (id: string) => Number(id.slice(1));

export function replicaIsLocal(params: LonghornParams, replica: number): boolean {
  return !params.dedicatedStorage && replica === engineNode(params.mode);
}

export function replicaSpecs(params: LonghornParams): ReplicaSpec[] {
  return params.disks.map((disk, i) => {
    const hop = replicaIsLocal(params, i) ? 0 : params.replicaHop;
    return { hopOut: hop, disk, hopBack: hop };
  });
}

/** Network crossings one write makes on its way down, one direction. */
export function networkHops(params: LonghornParams): { beforeEngine: number; toReplicas: number } {
  const toReplicas = params.disks.filter((_, i) => !replicaIsLocal(params, i)).length;
  return { beforeEngine: params.mode === 'rwx' ? 1 : 0, toReplicas };
}

export const longhorn: Model<LonghornParams, LonghornState, LonghornEvent> = {
  init(params, sched) {
    const eng = engineNode(params.mode);
    const pods: PodState[] = Array.from({ length: params.pods }, (_, id) => ({
      id,
      node: podNode(id),
      attached: params.mode === 'rwx' || podNode(id) === eng,
      sentAt: null,
      arrivedAt: null,
      startedAt: null,
      completedAt: null,
      returnedAt: null,
    }));
    let state: LonghornState = { params, pods, active: [], queue: [], writes: {} };

    if (params.mode === 'rwo') {
      for (const pod of pods) {
        if (!pod.attached) continue;
        state = { ...state, pods: updatePod(state.pods, pod.id, { sentAt: 0, arrivedAt: 0 }) };
        state = serve(state, pod.id, sched);
      }
      return state;
    }

    for (const pod of pods) {
      state = { ...state, pods: updatePod(state.pods, pod.id, { sentAt: 0 }) };
      sched.after(params.clientHop, { kind: 'sm.arrive', pod: pod.id });
    }
    return state;
  },

  step(state, ev, sched) {
    if (isRWEvent(ev)) {
      const before = state.writes[ev.write]!;
      const write = stepReplicatedWrite(before, ev, sched.now);
      const writes = { ...state.writes, [ev.write]: write };
      if (write.completedAt === null || before.completedAt !== null) return { ...state, writes };

      // This pod's write just became durable on all replicas.
      const pod = podOf(ev.write);
      const active = state.active.filter((p) => p !== pod);
      let pods = updatePod(state.pods, pod, { completedAt: sched.now });

      if (state.params.mode === 'rwo') {
        pods = updatePod(pods, pod, { returnedAt: sched.now });
        return { ...state, writes, pods, active };
      }

      sched.after(state.params.clientHop, { kind: 'pod.receive', pod });
      const [next, ...queue] = state.queue;
      const drained = { ...state, writes, pods, active, queue };
      return next === undefined ? drained : serve(drained, next, sched);
    }

    switch (ev.kind) {
      case 'sm.arrive': {
        const pods = updatePod(state.pods, ev.pod, { arrivedAt: sched.now });
        if (state.active.length > 0) return { ...state, pods, queue: [...state.queue, ev.pod] };
        return serve({ ...state, pods }, ev.pod, sched);
      }
      case 'pod.receive':
        return { ...state, pods: updatePod(state.pods, ev.pod, { returnedAt: sched.now }) };
    }
  },
};

function serve(state: LonghornState, pod: number, sched: Scheduler<LonghornEvent>): LonghornState {
  const id = writeId(pod);
  const write = startReplicatedWrite(sched, id, replicaSpecs(state.params), state.params.disks.length);
  return {
    ...state,
    active: [...state.active, pod],
    pods: updatePod(state.pods, pod, { startedAt: sched.now }),
    writes: { ...state.writes, [id]: write },
  };
}

function updatePod(pods: PodState[], id: number, patch: Partial<PodState>): PodState[] {
  return pods.map((p) => (p.id === id ? { ...p, ...patch } : p));
}
