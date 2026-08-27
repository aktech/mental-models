import { useMemo, useState } from 'react';
import { quorumWrite } from '../../models/quorumWrite';
import { Controls } from '../sim/Controls';
import { Param } from '../sim/Param';
import { Packet, type Point, type Tone } from '../sim/primitives';
import { Readouts } from '../sim/Readouts';
import { useContainerWidth } from '../sim/useContainerWidth';
import { useSimulation } from '../sim/useSimulation';
import '../sim/sim.css';

/*
  A sequence diagram whose vertical axis is virtual time. Columns are the
  parties, messages are diagonal lines that grow as the clock advances, and a
  horizontal sweep line marks "now". The scale is fixed to the slider maxima,
  so a 100 ms latency is always the same height on screen; the axis just
  grows or shrinks to fit the run.
*/

const HOP_MAX = 100;
const DISK_MIN = 10;
const DISK_MAX = 400;
const PX_PER_MS = 0.5;
const MIN_AXIS_MS = 300;
const AXIS_W = 52;
const HEADER_H = 44;
const PAD_B = 12;
const DEFAULT_DISKS = [60, 120, 300, 80, 150, 100, 360];

interface Message {
  from: number;
  to: number;
  t0: number;
  t1: number;
  tone: Tone;
}

export default function QuorumWriteScene() {
  const [count, setCount] = useState(3);
  const [acks, setAcks] = useState(2);
  const [hop, setHop] = useState(40);
  const [disks, setDisks] = useState(DEFAULT_DISKS);
  const acksRequired = Math.min(acks, count);

  const params = useMemo(
    () => ({ hop, disks: disks.slice(0, count), acksRequired }),
    [hop, disks, count, acksRequired],
  );
  const sim = useSimulation(quorumWrite, params);
  const { ref, width } = useContainerWidth<HTMLDivElement>(640);
  const t = sim.t;
  const now = sim.state;
  const final = sim.trace.frames[sim.trace.frames.length - 1]!.state;
  const write = final.write!;

  // geometry
  const units = 3 + count; // client and coordinator get 1.5 columns each
  const unit = (width - AXIS_W) / units;
  const colX = (i: number) => AXIS_W + (i < 2 ? (i + 0.5) * 1.5 * unit : (3 + (i - 2) + 0.5) * unit);
  const y = (ms: number) => HEADER_H + ms * PX_PER_MS;
  // Fixed scale, axis sized to this run (next 100 ms above the last event).
  const MAX_MS = Math.max(MIN_AXIS_MS, Math.ceil((sim.duration + 20) / 100) * 100);
  const height = y(MAX_MS) + PAD_B;
  const replicaColW = unit;

  const counted = new Set(write.ackOrder.slice(0, write.acksRequired));
  const messages: Message[] = [
    { from: 0, to: 1, t0: 0, t1: hop, tone: 'accent-1' },
    ...write.legs.map<Message>((leg, i) => ({ from: 1, to: 2 + i, t0: leg.sentAt, t1: leg.arrivesAt, tone: 'accent-1' })),
    ...write.legs.map<Message>((leg, i) => ({
      from: 2 + i,
      to: 1,
      t0: leg.ackSentAt,
      t1: leg.ackArrivesAt,
      tone: counted.has(i) ? 'accent-2' : 'muted',
    })),
  ];
  if (final.returnSentAt !== null && final.returnedAt !== null) {
    messages.push({ from: 1, to: 0, t0: final.returnSentAt, t1: final.returnedAt, tone: 'accent-2' });
  }

  const ticks = Array.from({ length: MAX_MS / 100 + 1 }, (_, i) => i * 100);
  const headers = ['client', 'coord', ...Array.from({ length: count }, (_, i) => `r${i + 1}`)];
  const ackedNow = now.write?.ackOrder ?? [];

  return (
    <figure className="sim" ref={ref}>
      <svg
        className="sim-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        data-motion={sim.motion}
        role="img"
        aria-label="Sequence diagram of one replicated write; time runs downward."
      >
        {ticks.map((ms) => (
          <g key={ms} className="sim-tick">
            <line x1={AXIS_W} y1={y(ms)} x2={width} y2={y(ms)} />
            <text x={AXIS_W - 8} y={y(ms)} textAnchor="end" dominantBaseline="central">
              {ms === 0 ? '0 ms' : ms}
            </text>
          </g>
        ))}

        {headers.map((label, i) => (
          <g key={label}>
            <line className="sim-lifeline" x1={colX(i)} y1={HEADER_H} x2={colX(i)} y2={y(MAX_MS)} />
            <text className="sim-header" x={colX(i)} y={14} textAnchor="middle" dominantBaseline="central">
              {label}
            </text>
            {i >= 2 && (
              <text className="sim-sub" x={colX(i)} y={30} textAnchor="middle" dominantBaseline="central">
                {disks[i - 2]}
                {replicaColW > 52 ? ' ms' : ''}
              </text>
            )}
          </g>
        ))}

        {/* the coordinator is blocked from the moment it has the write until it can answer */}
        {final.returnSentAt !== null && t >= hop && (
          <rect
            className="sim-activation is-waiting"
            x={colX(1) - 3}
            y={y(hop)}
            width={6}
            height={(Math.min(t, final.returnSentAt) - hop) * PX_PER_MS}
          />
        )}

        {/* each replica works its disk between arrival and ack */}
        {write.legs.map(
          (leg, i) =>
            t >= leg.arrivesAt && (
              <rect
                key={i}
                className="sim-activation"
                x={colX(2 + i) - 3}
                y={y(leg.arrivesAt)}
                width={6}
                height={(Math.min(t, leg.ackSentAt) - leg.arrivesAt) * PX_PER_MS}
              />
            ),
        )}

        {messages.map((m, i) => {
          if (t < m.t0) return null;
          const from: Point = { x: colX(m.from), y: y(m.t0) };
          const to: Point = { x: colX(m.to), y: y(m.t1) };
          const p = t >= m.t1 ? 1 : (t - m.t0) / (m.t1 - m.t0);
          return (
            <g key={i} className={`sim-message sim-tone-${m.tone}`}>
              <line x1={from.x} y1={from.y} x2={from.x + (to.x - from.x) * p} y2={from.y + (to.y - from.y) * p} />
              <Packet from={from} to={to} t0={m.t0} t1={m.t1} t={t} tone={m.tone} r={3.5} />
            </g>
          );
        })}

        {final.returnedAt !== null && (
          <g className={`sim-marker${t >= final.returnedAt ? ' is-reached' : ''}`} style={{ transform: `translateY(${y(final.returnedAt)}px)` }}>
            <line x1={AXIS_W} y1={0} x2={width} y2={0} />
            <text x={width} y={-6} textAnchor="end">
              returned · {final.returnedAt} ms
            </text>
          </g>
        )}

        <g className="sim-sweep" style={{ transform: `translateY(${y(t)}px)` }}>
          <line x1={AXIS_W} y1={0} x2={width} y2={0} />
        </g>
      </svg>

      <Readouts
        items={[
          ['acks in', ackedNow.length ? ackedNow.map((i) => `r${i + 1}`).join(' ') : '–'],
          ['needed', `${acksRequired} of ${count}`],
          ['returned', now.returnedAt !== null ? `${now.returnedAt} ms` : '…'],
        ]}
      />
      <Controls sim={sim} />

      <div className="sim-params">
        <Param label="replicas" value={count} min={1} max={7} onChange={setCount} />
        <Param label="acks required" value={acksRequired} min={1} max={count} onChange={setAcks} />
        <Param label="network hop" value={hop} min={0} max={HOP_MAX} step={5} unit=" ms" onChange={setHop} />
        <h3>disk time per replica</h3>
        {disks.slice(0, count).map((d, i) => (
          <Param
            key={i}
            label={`replica ${i + 1}`}
            value={d}
            min={DISK_MIN}
            max={DISK_MAX}
            step={10}
            unit=" ms"
            onChange={(v) => setDisks((prev) => prev.map((x, j) => (j === i ? v : x)))}
          />
        ))}
      </div>
    </figure>
  );
}
