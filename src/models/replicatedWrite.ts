import type { BaseEvent, Scheduler } from '../components/sim/engine';

/*
  One replicated write: a coordinator fans a write out to N replicas and the
  write is complete once `acksRequired` acknowledgements are back.

  This is the bottom of the stack for every storage entry. Models embed it:
  call startReplicatedWrite() when the engine receives a write, and hand every
  rw.* event to stepReplicatedWrite().
*/

export interface ReplicaSpec {
  /** network time from the engine to this replica, ms (0 = same node) */
  hopOut: number;
  /** time the replica needs to make the write durable, ms */
  disk: number;
  /** network time for the ack to come back, ms */
  hopBack: number;
}

export interface ReplicaLeg {
  sentAt: number;
  arrivesAt: number;
  ackSentAt: number;
  ackArrivesAt: number;
  arrived: boolean;
  acked: boolean;
}

export interface ReplicatedWrite {
  id: string;
  startedAt: number;
  acksRequired: number;
  legs: ReplicaLeg[];
  /** replica indexes in the order their acks arrived */
  ackOrder: number[];
  /** when the acksRequired-th ack arrived, or null while still waiting */
  completedAt: number | null;
}

export type RWEvent =
  | { kind: 'rw.arrive'; write: string; replica: number }
  | { kind: 'rw.ack'; write: string; replica: number };

export function isRWEvent(ev: BaseEvent): ev is RWEvent {
  return ev.kind === 'rw.arrive' || ev.kind === 'rw.ack';
}

export function startReplicatedWrite(
  sched: Scheduler<RWEvent>,
  id: string,
  replicas: ReplicaSpec[],
  acksRequired: number,
): ReplicatedWrite {
  const startedAt = sched.now;
  const legs = replicas.map((r, i) => {
    const arrivesAt = startedAt + r.hopOut;
    const ackSentAt = arrivesAt + r.disk;
    const ackArrivesAt = ackSentAt + r.hopBack;
    sched.at(arrivesAt, { kind: 'rw.arrive', write: id, replica: i });
    sched.at(ackArrivesAt, { kind: 'rw.ack', write: id, replica: i });
    return { sentAt: startedAt, arrivesAt, ackSentAt, ackArrivesAt, arrived: false, acked: false };
  });
  return {
    id,
    startedAt,
    acksRequired: Math.max(1, Math.min(acksRequired, replicas.length)),
    legs,
    ackOrder: [],
    completedAt: null,
  };
}

/** Returns the same object when the event belongs to a different write. */
export function stepReplicatedWrite(write: ReplicatedWrite, ev: RWEvent, now: number): ReplicatedWrite {
  if (ev.write !== write.id) return write;
  const legs = write.legs.map((leg, i) =>
    i === ev.replica ? { ...leg, ...(ev.kind === 'rw.arrive' ? { arrived: true } : { acked: true }) } : leg,
  );
  if (ev.kind === 'rw.arrive') return { ...write, legs };
  const ackOrder = [...write.ackOrder, ev.replica];
  const completedAt = write.completedAt ?? (ackOrder.length >= write.acksRequired ? now : null);
  return { ...write, legs, ackOrder, completedAt };
}
