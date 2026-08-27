import type { Model, Scheduler } from '../components/sim/engine';

/*
  Where a user's pods land on a cluster.

  A user requests a JupyterLab pod, then one jhub-apps app at a time. A second
  user arrives once the first user's lab is running. Every request is placed
  the moment it is made; a pod that cannot be placed stays pending.

  today:     every pod of a user mounts the same RWO home PVC and the same RWO
             nebi workspaces PVC, so a hard pod affinity keeps all of them on
             the node the first pod landed on. That node full = pending, even
             when the rest of the cluster is empty.
  proposed:  home is RWX. The lab carries the RWO workspaces PVC; each app
             carries an emptyDir it fills with `nebi pull` at start. Every
             pod picks the emptiest node on its own.
*/

export type Mode = 'today' | 'proposed';
export type PodKind = 'lab' | 'app';
export type PodStatus = 'scheduling' | 'running' | 'pending';

export interface PlacementParams {
  mode: Mode;
  nodes: number;
  /** pods each node can hold */
  slots: number;
  users: number;
  /** apps each user creates after their lab */
  apps: number;
  /** request -> running, ms */
  spawnMs: number;
}

export interface Volume {
  name: 'home' | 'ws' | 'tmp';
  access: 'rwo' | 'rwx' | 'ephemeral';
}

export interface Pod {
  id: string;
  user: number;
  kind: PodKind;
  /** 0 for the lab, 1..apps for apps */
  index: number;
  requestedAt: number;
  node: number | null;
  status: PodStatus;
  runningAt: number | null;
  /** why it is pending */
  reason?: string;
  volumes: Volume[];
}

export interface PlacementState {
  params: PlacementParams;
  pods: Pod[];
}

export type PlacementEvent =
  | { kind: 'request'; user: number; podKind: PodKind; index: number }
  | { kind: 'settle'; pod: string };

export const podId = (user: number, index: number) => `u${user}-${index === 0 ? 'lab' : `app${index}`}`;

export const placement: Model<PlacementParams, PlacementState, PlacementEvent> = {
  init(params, sched) {
    sched.at(0, { kind: 'request', user: 0, podKind: 'lab', index: 0 });
    return { params, pods: [] };
  },

  step(state, ev, sched) {
    switch (ev.kind) {
      case 'request': {
        const pod = place(state, ev.user, ev.podKind, ev.index, sched.now);
        sched.after(state.params.spawnMs, { kind: 'settle', pod: pod.id });
        return { ...state, pods: [...state.pods, pod] };
      }
      case 'settle': {
        const pod = state.pods.find((p) => p.id === ev.pod)!;
        const settled: Pod = pod.node === null ? pod : { ...pod, status: 'running', runningAt: sched.now };
        requestNext(state.params, settled, sched);
        return { ...state, pods: state.pods.map((p) => (p.id === pod.id ? settled : p)) };
      }
    }
  },
};

function requestNext(params: PlacementParams, pod: Pod, sched: Scheduler<PlacementEvent>) {
  if (pod.index < params.apps) {
    sched.after(0, { kind: 'request', user: pod.user, podKind: 'app', index: pod.index + 1 });
  }
  if (pod.kind === 'lab' && pod.user + 1 < params.users) {
    sched.after(0, { kind: 'request', user: pod.user + 1, podKind: 'lab', index: 0 });
  }
}

function place(state: PlacementState, user: number, kind: PodKind, index: number, now: number): Pod {
  const { params, pods } = state;
  const base = { id: podId(user, index), user, kind, index, requestedAt: now, runningAt: null, volumes: volumesFor(params.mode, kind) };
  const anchor = params.mode === 'today' ? pods.find((p) => p.user === user && p.node !== null)?.node ?? null : null;
  const node = anchor === null ? emptiestNode(state) : hasRoom(state, anchor) ? anchor : null;
  if (node !== null) return { ...base, node, status: 'scheduling' };
  const reason = anchor === null ? 'cluster full' : `node-${anchor + 1} full · affinity (RWO home)`;
  return { ...base, node: null, status: 'pending', reason };
}

export function volumesFor(mode: Mode, kind: PodKind): Volume[] {
  if (mode === 'today') {
    const shared: Volume[] = [
      { name: 'home', access: 'rwo' },
      { name: 'ws', access: 'rwo' },
    ];
    return kind === 'lab' ? shared : [...shared, { name: 'tmp', access: 'ephemeral' }];
  }
  return kind === 'lab'
    ? [
        { name: 'home', access: 'rwx' },
        { name: 'ws', access: 'rwo' },
      ]
    : [
        { name: 'home', access: 'rwx' },
        { name: 'tmp', access: 'ephemeral' },
      ];
}

export function load(state: PlacementState, node: number): number {
  return state.pods.filter((p) => p.node === node).length;
}

function hasRoom(state: PlacementState, node: number): boolean {
  return load(state, node) < state.params.slots;
}

/** Least-loaded node with a free slot, lowest index on ties; null when the cluster is full. */
function emptiestNode(state: PlacementState): number | null {
  let best: number | null = null;
  for (let n = 0; n < state.params.nodes; n++) {
    if (!hasRoom(state, n)) continue;
    if (best === null || load(state, n) < load(state, best)) best = n;
  }
  return best;
}
