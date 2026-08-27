/*
  A tiny discrete-event simulation kernel.

  A model schedules events at computed times. The kernel drains the queue in
  time order and records a frame (time, event, state) after every event. The
  whole run happens up front, so rendering is a pure lookup: "what was the
  state at virtual time t?"
*/

export interface BaseEvent {
  kind: string;
}

export interface Scheduler<E extends BaseEvent> {
  /** Current virtual time in ms. */
  readonly now: number;
  /** Schedule an event at an absolute virtual time. */
  at(time: number, event: E): void;
  /** Schedule an event `delay` ms after now. */
  after(delay: number, event: E): void;
}

export interface Model<P, S, E extends BaseEvent> {
  /** Build the initial state and schedule the first events. */
  init(params: P, sched: Scheduler<E>): S;
  /** Handle one event. Return the next state; schedule follow-up events. */
  step(state: S, event: E, sched: Scheduler<E>): S;
}

export interface Frame<S, E extends BaseEvent> {
  t: number;
  /** null only for the initial frame at t = 0 */
  event: E | null;
  state: S;
}

export interface Trace<S, E extends BaseEvent> {
  frames: Frame<S, E>[];
  /** Distinct frame times, ascending. Used for stepping. */
  times: number[];
  /** Time of the last event. */
  duration: number;
}

interface Queued<E> {
  t: number;
  seq: number;
  event: E;
}

export function run<P, S, E extends BaseEvent>(
  model: Model<P, S, E>,
  params: P,
  maxEvents = 10_000,
): Trace<S, E> {
  const queue: Queued<E>[] = [];
  let seq = 0;
  let now = 0;

  const insert = (t: number, event: E) => {
    if (!Number.isFinite(t) || t < now) {
      throw new Error(`cannot schedule "${event.kind}" at ${t} ms (now is ${now} ms)`);
    }
    const item = { t, seq: seq++, event };
    // Insert after every queued item with time <= t, so equal times keep FIFO order.
    let lo = 0;
    let hi = queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (queue[mid]!.t <= t) lo = mid + 1;
      else hi = mid;
    }
    queue.splice(lo, 0, item);
  };

  const sched: Scheduler<E> = {
    get now() {
      return now;
    },
    at: insert,
    after: (delay, event) => insert(now + delay, event),
  };

  let state = model.init(params, sched);
  const frames: Frame<S, E>[] = [{ t: 0, event: null, state }];

  let handled = 0;
  while (queue.length > 0) {
    if (++handled > maxEvents) {
      throw new Error(`simulation exceeded ${maxEvents} events; does the model terminate?`);
    }
    const { t, event } = queue.shift()!;
    now = t;
    state = model.step(state, event, sched);
    frames.push({ t, event, state });
  }

  const times = [...new Set(frames.map((f) => f.t))];
  return { frames, times, duration: frames[frames.length - 1]!.t };
}

/** The last frame whose time is <= t. */
export function frameAt<S, E extends BaseEvent>(trace: Trace<S, E>, t: number): Frame<S, E> {
  const frames = trace.frames;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid]!.t <= t) lo = mid;
    else hi = mid - 1;
  }
  return frames[lo]!;
}
