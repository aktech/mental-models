import { useMemo, useState } from 'react';
import type { Model } from '../sim/engine';
import { Controls } from '../sim/Controls';
import { Param } from '../sim/Param';
import { Counter, Edge, Node, NODE_H, NODE_W, Packet, type Point } from '../sim/primitives';
import { useContainerWidth } from '../sim/useContainerWidth';
import { useSimulation } from '../sim/useSimulation';
import '../sim/sim.css';

/*
  The trivial scene: A sends a request to B, B replies. Two events in the
  queue at any time, one parameter. Exists to prove the clock, the stepper,
  the scrubber and the packet maths before anything real is built on them.
*/

interface Params {
  latency: number;
  processing: number;
}

interface Flight {
  from: 'a' | 'b';
  t0: number;
  t1: number;
}

interface State {
  params: Params;
  phase: 'request' | 'processing' | 'reply' | 'done';
  flights: Flight[];
  roundTrip: number | null;
}

type Event = { kind: 'arrive-b' } | { kind: 'reply' } | { kind: 'arrive-a' };

const pingModel: Model<Params, State, Event> = {
  init(params, sched) {
    sched.after(params.latency, { kind: 'arrive-b' });
    return { params, phase: 'request', flights: [{ from: 'a', t0: 0, t1: params.latency }], roundTrip: null };
  },
  step(state, event, sched) {
    switch (event.kind) {
      case 'arrive-b':
        sched.after(state.params.processing, { kind: 'reply' });
        return { ...state, phase: 'processing' };
      case 'reply': {
        const { latency } = state.params;
        sched.after(latency, { kind: 'arrive-a' });
        return {
          ...state,
          phase: 'reply',
          flights: [...state.flights, { from: 'b', t0: sched.now, t1: sched.now + latency }],
        };
      }
      case 'arrive-a':
        return { ...state, phase: 'done', roundTrip: sched.now };
    }
  },
};

export default function PingScene() {
  const [latency, setLatency] = useState(120);
  const [processing, setProcessing] = useState(40);
  const params = useMemo(() => ({ latency, processing }), [latency, processing]);
  const sim = useSimulation(pingModel, params);

  const { ref, width } = useContainerWidth<HTMLDivElement>(640);
  const height = 96;
  const a: Point = { x: 0, y: 24 };
  const b: Point = { x: Math.max(width, 2 * NODE_W + 80) - NODE_W, y: 24 };
  const aPort: Point = { x: a.x + NODE_W, y: a.y + NODE_H / 2 };
  const bPort: Point = { x: b.x, y: b.y + NODE_H / 2 };

  const { state, t } = sim;
  const bTone = state.phase === 'processing' ? 'accent-1' : state.phase === 'done' ? 'accent-2' : 'default';

  return (
    <figure className="sim" ref={ref}>
      <svg className="sim-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} data-motion={sim.motion} role="img" aria-label="A sends a request to B, which replies after processing.">
        <Edge from={aPort} to={bPort} />
        <Node x={a.x} y={a.y} label="A" tone={state.phase === 'done' ? 'accent-2' : 'default'} fill={state.phase === 'done'} />
        <Node x={b.x} y={b.y} label="B" sub={`${processing} ms`} tone={bTone} fill={bTone !== 'default'} />
        {state.flights.map((f, i) => (
          <Packet
            key={i}
            from={f.from === 'a' ? aPort : bPort}
            to={f.from === 'a' ? bPort : aPort}
            t0={f.t0}
            t1={f.t1}
            t={t}
            tone={f.from === 'a' ? 'accent-1' : 'accent-2'}
          />
        ))}
        <Counter x={0} y={height - 12} label="phase" value={state.phase} />
        <Counter
          x={width}
          y={height - 12}
          anchor="end"
          label="round trip"
          value={state.roundTrip === null ? '…' : `${state.roundTrip} ms`}
          tone={state.roundTrip === null ? 'muted' : 'accent-2'}
        />
      </svg>
      <Controls sim={sim} />
      <div className="sim-params">
        <Param label="one-way latency" value={latency} min={10} max={500} step={10} unit=" ms" onChange={setLatency} />
        <Param label="processing at B" value={processing} min={0} max={300} step={10} unit=" ms" onChange={setProcessing} />
      </div>
    </figure>
  );
}
