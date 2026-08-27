import type { Model, Scheduler } from '../components/sim/engine';

/*
  Where a user's pods land on a cluster.

  A user requests a JupyterLab pod, then one jhub-apps app at a time. A second
  user arrives once the first user's lab is running. Every request is placed
  the moment it is made. The request then travels to its node, the pod object
  is created there, its volumes mount one at a time, and the pod starts. A pod that cannot be
  placed travels to the pending tray instead and stays there.

  today:     every pod of a user mounts the same RWO home PVC and the same RWO
             nebi workspaces PVC, so a hard pod affinity keeps all of them on
             the node the first pod landed on. That node full = pending, even
             when the rest of the cluster is empty.
  proposed:  each user's home is still their own volume, but RWX, so any
             node can mount it. The lab carries the RWO workspaces PVC; each
             app carries an emptyDir it fills with `nebi pull` at start.
             Every pod picks the emptiest node on its own.
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
  /** request -> arrival on the node (or in the pending tray), ms */
  travelMs: number;
  /** arrival -> the pod object exists on the node, ms */
  createMs: number;
  /** mounting one volume, ms */
  attachMs: number;
  /** all volumes mounted -> running, ms */
  startMs: number;
  /** pause between one pod settling and the user's next request, ms */
  thinkMs: number;
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
  /** arrived on the node or in the pending tray */
  placedAt: number | null;
  /** the pod object exists on the node; volumes mount after this */
  createdAt: number | null;
  /** how many of `volumes` are mounted so far */
  attached: number;
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
  | { kind: 'arrive'; pod: string }
  | { kind: 'created'; pod: string }
  | { kind: 'attach'; pod: string }
  | { kind: 'start'; pod: string };

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
        sched.after(state.params.travelMs, { kind: 'arrive', pod: pod.id });
        return { ...state, pods: [...state.pods, pod] };
      }
      case 'arrive': {
        const pod = state.pods.find((p) => p.id === ev.pod)!;
        if (pod.node === null) {
          const pending: Pod = { ...pod, status: 'pending', placedAt: sched.now };
          requestNext(state.params, pending, sched);
          return update(state, pending);
        }
        sched.after(state.params.createMs, { kind: 'created', pod: pod.id });
        return update(state, { ...pod, placedAt: sched.now });
      }
      case 'created': {
        const pod = state.pods.find((p) => p.id === ev.pod)!;
        sched.after(state.params.attachMs, { kind: 'attach', pod: pod.id });
        return update(state, { ...pod, createdAt: sched.now });
      }
      case 'attach': {
        const pod = state.pods.find((p) => p.id === ev.pod)!;
        const attached = pod.attached + 1;
        if (attached < pod.volumes.length) sched.after(state.params.attachMs, { kind: 'attach', pod: pod.id });
        else sched.after(state.params.startMs, { kind: 'start', pod: pod.id });
        return update(state, { ...pod, attached });
      }
      case 'start': {
        const pod = state.pods.find((p) => p.id === ev.pod)!;
        const running: Pod = { ...pod, status: 'running', runningAt: sched.now };
        requestNext(state.params, running, sched);
        return update(state, running);
      }
    }
  },
};

function update(state: PlacementState, pod: Pod): PlacementState {
  return { ...state, pods: state.pods.map((p) => (p.id === pod.id ? pod : p)) };
}

function requestNext(params: PlacementParams, pod: Pod, sched: Scheduler<PlacementEvent>) {
  if (pod.index < params.apps) {
    sched.after(params.thinkMs, { kind: 'request', user: pod.user, podKind: 'app', index: pod.index + 1 });
  }
  if (pod.kind === 'lab' && pod.user + 1 < params.users) {
    sched.after(params.thinkMs, { kind: 'request', user: pod.user + 1, podKind: 'lab', index: 0 });
  }
}

function place(state: PlacementState, user: number, kind: PodKind, index: number, now: number): Pod {
  const { params, pods } = state;
  const base = {
    id: podId(user, index),
    user,
    kind,
    index,
    requestedAt: now,
    status: 'scheduling' as const,
    placedAt: null,
    createdAt: null,
    attached: 0,
    runningAt: null,
    volumes: volumesFor(params.mode, kind),
  };
  const anchor = params.mode === 'today' ? pods.find((p) => p.user === user && p.node !== null)?.node ?? null : null;
  const node = anchor === null ? emptiestNode(state) : hasRoom(state, anchor) ? anchor : null;
  if (node !== null) return { ...base, node };
  const reason = anchor === null ? 'cluster full' : `node-${anchor + 1} full · affinity (RWO home)`;
  return { ...base, node: null, reason };
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
