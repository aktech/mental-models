import { describe, expect, it } from 'vitest';
import { frameAt, run, type Model } from './engine';

/*
  Smoke tests for the discrete-event kernel every scene runs on: events fire
  in time order, ties keep FIFO order, the trace can be looked up by time,
  and a model that never terminates is caught.
*/

type Ev = { kind: 'tick'; n: number };
interface State {
  seen: number[];
}

/** Schedules the given (delay, n) pairs at init and records the order they fire. */
const order = (pairs: [number, number][]): Model<void, State, Ev> => ({
  init(_params, sched) {
    for (const [delay, n] of pairs) sched.after(delay, { kind: 'tick', n });
    return { seen: [] };
  },
  step(state, ev) {
    return { seen: [...state.seen, ev.n] };
  },
});

describe('run', () => {
  it('fires events in time order and reports the last time as duration', () => {
    const trace = run(order([[30, 3], [10, 1], [20, 2]]), undefined);
    expect(trace.frames.at(-1)!.state.seen).toEqual([1, 2, 3]);
    expect(trace.times).toEqual([0, 10, 20, 30]);
    expect(trace.duration).toBe(30);
  });

  it('keeps first-in-first-out order for events at the same time', () => {
    const trace = run(order([[5, 1], [5, 2], [5, 3]]), undefined);
    expect(trace.frames.at(-1)!.state.seen).toEqual([1, 2, 3]);
  });

  it('lets a step schedule follow-up events relative to now', () => {
    const chain: Model<void, State, Ev> = {
      init(_params, sched) {
        sched.after(10, { kind: 'tick', n: 1 });
        return { seen: [] };
      },
      step(state, ev, sched) {
        if (ev.n < 3) sched.after(10, { kind: 'tick', n: ev.n + 1 });
        return { seen: [...state.seen, ev.n] };
      },
    };
    const trace = run(chain, undefined);
    expect(trace.times).toEqual([0, 10, 20, 30]);
    expect(trace.frames.at(-1)!.state.seen).toEqual([1, 2, 3]);
  });

  it('refuses to schedule into the past', () => {
    const bad: Model<void, State, Ev> = {
      init(_params, sched) {
        sched.after(10, { kind: 'tick', n: 1 });
        return { seen: [] };
      },
      step(state, _ev, sched) {
        sched.at(5, { kind: 'tick', n: 9 });
        return state;
      },
    };
    expect(() => run(bad, undefined)).toThrow(/cannot schedule/);
  });

  it('stops a model that never terminates', () => {
    const forever: Model<void, State, Ev> = {
      init(_params, sched) {
        sched.after(1, { kind: 'tick', n: 1 });
        return { seen: [] };
      },
      step(state, _ev, sched) {
        sched.after(1, { kind: 'tick', n: 1 });
        return state;
      },
    };
    expect(() => run(forever, undefined, 50)).toThrow(/exceeded 50 events/);
  });
});

describe('frameAt', () => {
  const trace = run(order([[10, 1], [20, 2]]), undefined);

  it('returns the last frame at or before the asked time', () => {
    expect(frameAt(trace, 0).state.seen).toEqual([]);
    expect(frameAt(trace, 9).state.seen).toEqual([]);
    expect(frameAt(trace, 10).state.seen).toEqual([1]);
    expect(frameAt(trace, 15).state.seen).toEqual([1]);
    expect(frameAt(trace, 99).state.seen).toEqual([1, 2]);
  });
});
