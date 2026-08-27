import type { ReactNode } from 'react';

export interface Point {
  x: number;
  y: number;
}

export type Tone = 'default' | 'muted' | 'accent-1' | 'accent-2';

export const NODE_W = 96;
export const NODE_H = 32;

interface NodeProps {
  x: number;
  y: number;
  w?: number;
  h?: number;
  label: string;
  /** small second line under the label, e.g. a latency */
  sub?: string;
  tone?: Tone;
  fill?: boolean;
  /** faded out: present in the picture but not taking part */
  dim?: boolean;
}

/** A labelled box. (x, y) is the top-left corner. */
export function Node({ x, y, w = NODE_W, h = NODE_H, label, sub, tone = 'default', fill = false, dim = false }: NodeProps) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return (
    <g className={`sim-node sim-tone-${tone}${fill ? ' is-filled' : ''}${dim ? ' is-dim' : ''}`}>
      <rect x={x} y={y} width={w} height={h} rx={4} />
      <text x={cx} y={sub ? cy - 4 : cy} textAnchor="middle" dominantBaseline="central">
        {label}
      </text>
      {sub && (
        <text className="sim-sub" x={cx} y={cy + 9} textAnchor="middle" dominantBaseline="central">
          {sub}
        </text>
      )}
    </g>
  );
}

interface EdgeProps {
  from: Point;
  to: Point;
  tone?: Tone;
  dashed?: boolean;
  /** small mono label beside the midpoint */
  label?: string;
  labelOffset?: Point;
}

export function Edge({ from, to, tone = 'muted', dashed = false, label, labelOffset = { x: 6, y: 0 } }: EdgeProps) {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  return (
    <g className={`sim-edge sim-tone-${tone}`}>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} strokeDasharray={dashed ? '2 3' : undefined} />
      {label && (
        <text className="sim-edge-label" x={mx + labelOffset.x} y={my + labelOffset.y} textAnchor={labelOffset.x < 0 ? 'end' : 'start'} dominantBaseline="central">
          {label}
        </text>
      )}
    </g>
  );
}

interface PacketProps {
  from: Point;
  to: Point;
  /** departure and arrival, virtual ms */
  t0: number;
  t1: number;
  /** current virtual time */
  t: number;
  tone?: Tone;
  r?: number;
}

/**
 * A dot travelling from `from` to `to` between t0 and t1. Its position is a
 * pure function of t. Rendered inclusive of both ends so a step from t0 to t1
 * can tween across.
 */
export function Packet({ from, to, t0, t1, t, tone = 'accent-1', r = 4 }: PacketProps) {
  if (t < t0 || t > t1) return null;
  const p = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
  const x = from.x + (to.x - from.x) * p;
  const y = from.y + (to.y - from.y) * p;
  return (
    <g className={`sim-packet sim-tone-${tone}`} style={{ transform: `translate(${x}px, ${y}px)` }}>
      <circle r={r} />
    </g>
  );
}

interface CounterProps {
  x: number;
  y: number;
  label: string;
  value: ReactNode;
  anchor?: 'start' | 'middle' | 'end';
  tone?: Tone;
}

/** A mono readout inside the diagram: "label value". */
export function Counter({ x, y, label, value, anchor = 'start', tone = 'muted' }: CounterProps) {
  return (
    <text className={`sim-counter sim-tone-${tone}`} x={x} y={y} textAnchor={anchor} dominantBaseline="central">
      <tspan className="sim-counter-label">{label}</tspan>
      <tspan className="sim-counter-value" dx="0.6em">
        {value}
      </tspan>
    </text>
  );
}
