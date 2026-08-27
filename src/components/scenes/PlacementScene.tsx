import { useMemo, useState } from 'react';
import { placement, type Mode, type PlacementParams, type PlacementState, type Pod, type Volume } from '../../models/placement';
import { Choice } from '../sim/Choice';
import { Controls } from '../sim/Controls';
import { Param } from '../sim/Param';
import { Edge, Node, Packet, type Point, type Tone } from '../sim/primitives';
import { Readouts } from '../sim/Readouts';
import { useContainerWidth } from '../sim/useContainerWidth';
import { useSimulation } from '../sim/useSimulation';
import '../sim/sim.css';

/*
  Users on the left, nodes on the right. Each user is a box listing what they
  ask for: a lab, then apps. When a request is made, a dot leaves the user's
  row and travels to the slot it was given on a node, or down to the pending
  tray if no node can take it. On arrival the pod is built up in stages: its
  box is traced onto the node, its volumes are traced in one at a time, then
  it starts. Every trace is a function of the clock, so scrubbing shows a
  half-drawn box.

  In the proposed mode one RWX home bar per user appears under the nodes,
  and every node that runs one of that user's pods is wired to it: still one
  home per user, now reachable from any node.
*/

const TRAVEL_MS = 600;
const CREATE_MS = 500;
const ATTACH_MS = 400;
const START_MS = 400;
const THINK_MS = 300;
const LANE = 48;
const GAP = 14;
const PAD = 10;
const LABEL_H = 28;
const POD_H = 46;
const CHIP_H = 34;
const CHIP_GAP = 6;
const CHIPS_PER_ROW = 2;
const ACTION_H = 36;
const ACTION_GAP = 6;
const BAR_H = 46;
const TRAY_LINE = 24;

/** what a volume is called in the picture */
const VOLUME_LABEL: Record<Volume['name'], string> = { home: 'home', ws: 'nebi ws', tmp: 'tmp' };

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function PlacementScene() {
  const [mode, setMode] = useState<Mode>('today');
  const [nodes, setNodes] = useState(3);
  const [slots, setSlots] = useState(2);
  const [users, setUsers] = useState(2);
  const [apps, setApps] = useState(2);

  const params = useMemo<PlacementParams>(
    () => ({ mode, nodes, slots, users, apps, travelMs: TRAVEL_MS, createMs: CREATE_MS, attachMs: ATTACH_MS, startMs: START_MS, thinkMs: THINK_MS }),
    [mode, nodes, slots, users, apps],
  );
  const sim = useSimulation(placement, params);
  const { ref, width } = useContainerWidth<HTMLDivElement>(640);
  const t = sim.t;
  const now = sim.state;
  const final = sim.trace.frames[sim.trace.frames.length - 1]!.state;
  const proposed = mode === 'proposed';

  // geometry: user column | lane | node boxes
  const userW = Math.max(120, Math.min(180, Math.round(width * 0.22)));
  const nodesX = userW + LANE;
  const nodeW = (width - nodesX - GAP * (nodes - 1)) / nodes;
  const nodeX = (n: number) => nodesX + n * (nodeW + GAP);
  // a pod row is tall enough for the most volumes any pod in this run carries
  const chipRows = Math.ceil(Math.max(...final.pods.map((p) => p.volumes.length), 1) / CHIPS_PER_ROW);
  const rowH = POD_H + CHIP_GAP + chipRows * CHIP_H + (chipRows - 1) * CHIP_GAP + 14;
  const nodeH = LABEL_H + slots * rowH + PAD;
  const barY = nodeH + 26;
  const barW = (width - nodesX - GAP * (users - 1)) / users;
  const barX = (u: number) => nodesX + u * (barW + GAP);
  const trayY = (proposed ? barY + BAR_H : nodeH) + 26;
  const pendingFinal = final.pods.filter((p) => p.status === 'pending');
  const trayH = LABEL_H + Math.max(1, pendingFinal.length) * TRAY_LINE + PAD;

  const userH = LABEL_H + (1 + apps) * (ACTION_H + ACTION_GAP) + PAD;
  const userY = (u: number) => u * (userH + GAP);
  const usersH = users * (userH + GAP) - GAP;
  const height = Math.max(usersH, trayY + trayH) + 4;

  // every pod's final slot is fixed: pods never leave a node
  const slotOf = (pod: Pod): Rect | null => {
    if (pod.node === null) return null;
    const i = final.pods.filter((p) => p.node === pod.node).findIndex((p) => p.id === pod.id);
    return { x: nodeX(pod.node) + PAD, y: LABEL_H + i * rowH, w: nodeW - 2 * PAD, h: POD_H };
  };
  const actionOf = (pod: Pod): Rect => ({
    x: PAD,
    y: userY(pod.user) + LABEL_H + pod.index * (ACTION_H + ACTION_GAP),
    w: userW - 2 * PAD,
    h: ACTION_H,
  });
  const trayLineOf = (pod: Pod): Point => {
    const i = pendingFinal.findIndex((p) => p.id === pod.id);
    return { x: nodesX + PAD + 14, y: trayY + LABEL_H + i * TRAY_LINE + TRAY_LINE / 2 };
  };
  const right = (r: Rect): Point => ({ x: r.x + r.w, y: r.y + r.h / 2 });
  const entry = (r: Rect): Point => ({ x: r.x + 12, y: r.y + r.h / 2 });
  const narrow = nodeW - 2 * PAD < 130;

  // pods that have arrived on a node, whether still being built or running
  const placed = now.pods.filter((p) => p.node !== null && p.placedAt !== null);
  const running = now.pods.filter((p) => p.status === 'running');
  const pending = now.pods.filter((p) => p.status === 'pending');

  return (
    <figure className="sim" ref={ref}>
      <svg
        className="sim-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        data-motion={sim.motion}
        role="img"
        aria-label="Users on the left request lab and app pods; dots travel to the node slot each pod is given on the right, where the pod is built up volume by volume, or to a pending tray when no node can take it."
      >
        {/* users */}
        {Array.from({ length: users }, (_, u) => (
          <g key={u} className="sim-box">
            <rect x={0} y={userY(u)} width={userW} height={userH} rx={6} />
            <text x={PAD} y={userY(u) + 14} dominantBaseline="central">
              user {u + 1}
            </text>
          </g>
        ))}
        {final.pods.map((p) => {
          const r = actionOf(p);
          const live = now.pods.find((q) => q.id === p.id);
          const look = actionLook(live);
          return <Node key={p.id} x={r.x} y={r.y} w={r.w} h={r.h} label={p.kind === 'lab' ? 'lab' : `app ${p.index}`} tone={look.tone} fill={look.tone === 'accent-2'} dim={look.dim} />;
        })}

        {/* nodes */}
        {Array.from({ length: nodes }, (_, n) => (
          <g key={n} className="sim-box">
            <rect x={nodeX(n)} y={0} width={nodeW} height={nodeH} rx={6} />
            <text x={nodeX(n) + PAD} y={14} dominantBaseline="central">
              node-{n + 1}
              {!narrow && ` · ${placed.filter((p) => p.node === n).length}/${slots}`}
            </text>
          </g>
        ))}

        {/* RWX homes, one per user, proposed only */}
        <g className={`sim-tier${proposed ? '' : ' is-hidden'}`}>
          {proposed &&
            Array.from({ length: nodes }, (_, n) =>
              Array.from({ length: users }, (_, u) =>
                placed.some((p) => p.node === n && p.user === u && p.attached > 0) ? (
                  <Edge
                    key={`${n}-${u}`}
                    from={{ x: nodeX(n) + (nodeW * (u + 1)) / (users + 1), y: nodeH }}
                    to={{ x: barX(u) + barW / 2, y: barY }}
                    tone="default"
                    dashed
                  />
                ) : null,
              ),
            )}
          {Array.from({ length: users }, (_, u) => (
            <g key={u} className="sim-lg">
              <Node x={barX(u)} y={barY} w={barW} h={BAR_H} label={`u${u + 1} home · RWX`} sub={barW < 220 ? 'any node' : 'one volume, mounted from any node'} tone="default" />
            </g>
          ))}
        </g>

        {/* placed pods, traced onto the node in stages, with their volumes */}
        {placed.map((p) => {
          const s = slotOf(p)!;
          const done = p.status === 'running';
          const creating = p.createdAt === null;
          const boxProgress = creating ? clamp((t - p.placedAt!) / CREATE_MS) : 1;
          const stage = done ? undefined : creating ? 'creating' : p.attached < p.volumes.length ? `mounting ${VOLUME_LABEL[p.volumes[p.attached]!.name]}` : 'starting';
          return (
            <g key={p.id}>
              <Drawn r={s} rx={6} progress={boxProgress} tone={done ? 'accent-2' : 'accent-1'} fill={done} large label={`u${p.user + 1} ${p.kind === 'lab' ? 'lab' : `app ${p.index}`}`} sub={stage} />
              {p.volumes.map((v, i) => {
                if (creating) return null;
                const mountStart = p.createdAt! + i * ATTACH_MS;
                const progress = clamp((t - mountStart) / ATTACH_MS);
                if (progress <= 0) return null;
                const c = chipRect(s, p.volumes, v.name);
                const mounting = i === p.attached && !done;
                return (
                  <Drawn key={v.name} r={c} rx={4} progress={progress} tone={mounting ? 'accent-1' : v.access === 'rwx' ? 'default' : 'muted'} dashed={v.access === 'ephemeral'} label={VOLUME_LABEL[v.name]} sub={chipAccess(v)} />
                );
              })}
            </g>
          );
        })}

        {/* pending tray */}
        <g className="sim-box is-storage">
          <rect x={nodesX} y={trayY} width={width - nodesX} height={trayH} rx={6} />
          <text x={nodesX + PAD} y={trayY + 14} dominantBaseline="central">
            pending{pending.length ? ` · ${pending.length}` : ''}
          </text>
        </g>
        {pending.map((p) => {
          const at = trayLineOf(p);
          return (
            <text key={p.id} className="sim-counter sim-tone-accent-1 sim-appear" x={at.x} y={at.y} dominantBaseline="central">
              <tspan className="sim-counter-value">
                u{p.user + 1} {p.kind === 'lab' ? 'lab' : `app ${p.index}`}
              </tspan>
              <tspan className="sim-counter-label" dx="0.6em">
                {p.reason}
              </tspan>
            </text>
          );
        })}

        {/* requests in flight, from the fully known trace: a dotted path from the user's row to the destination, and the dot on it */}
        {final.pods.map((p) => {
          const from = right(actionOf(p));
          const slot = slotOf(p);
          const to = slot ? entry(slot) : { x: trayLineOf(p).x - 10, y: trayLineOf(p).y };
          const t0 = p.requestedAt;
          const t1 = p.requestedAt + TRAVEL_MS;
          const inFlight = t >= t0 && t < t1;
          // the trail is laid down behind the dot: it ends wherever the dot is now
          const k = clamp((t - t0) / (t1 - t0));
          const head = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
          return (
            <g key={p.id}>
              {inFlight && <Edge from={from} to={head} tone={slot ? 'accent-1' : 'muted'} dashed />}
              <Packet from={from} to={to} t0={t0} t1={t1} t={t} tone={slot ? 'accent-1' : 'muted'} />
            </g>
          );
        })}
      </svg>

      <Readouts items={readouts(now, params, running, pending)} />
      <Controls sim={sim} />

      <div className="sim-params">
        <Choice<Mode>
          label="storage"
          value={mode}
          options={[
            { value: 'today', label: 'today' },
            { value: 'proposed', label: 'proposed' },
          ]}
          onChange={setMode}
        />
        <Param label="nodes" value={nodes} min={2} max={4} onChange={setNodes} />
        <Param label="pods per node" value={slots} min={1} max={4} onChange={setSlots} />
        <Param label="users" value={users} min={1} max={3} onChange={setUsers} />
        <Param label="apps per user" value={apps} min={0} max={3} onChange={setApps} />
      </div>
    </figure>
  );
}

/** Where volume `name` sits under a pod slot: two chips per row, a lone last chip takes the full width. */
function chipRect(slot: Rect, volumes: Volume[], name: Volume['name']): Rect {
  const i = volumes.findIndex((v) => v.name === name);
  const row = Math.floor(i / CHIPS_PER_ROW);
  const col = i % CHIPS_PER_ROW;
  const inRow = Math.min(CHIPS_PER_ROW, volumes.length - row * CHIPS_PER_ROW);
  const w = (slot.w - CHIP_GAP * (inRow - 1)) / inRow;
  return { x: slot.x + col * (w + CHIP_GAP), y: slot.y + slot.h + CHIP_GAP + row * (CHIP_H + CHIP_GAP), w, h: CHIP_H };
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));

interface DrawnProps {
  r: Rect;
  rx: number;
  /** 0 = nothing yet, 1 = fully drawn. The outline is traced round the box and the label fades in behind it. */
  progress: number;
  tone: Tone;
  label: string;
  sub?: string;
  fill?: boolean;
  dashed?: boolean;
  large?: boolean;
}

/**
 * A box that is drawn into existence. Its outline runs round the perimeter as
 * progress goes 0 to 1 (stroke-dashoffset over a unit path length); the label
 * fades in over the second half. Once complete it is an ordinary node.
 */
function Drawn({ r, rx, progress, tone, label, sub, fill = false, dashed = false, large = false }: DrawnProps) {
  const complete = progress >= 1;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const labelY = large ? (sub ? cy - 7 : cy) : r.y + 11;
  const subY = large ? cy + 11 : r.y + 24;
  return (
    <g className={`sim-node sim-tone-${tone}${fill ? ' is-filled' : ''}${large ? ' sim-lg' : ''}`}>
      <rect
        x={r.x}
        y={r.y}
        width={r.w}
        height={r.h}
        rx={rx}
        pathLength={1}
        strokeDasharray={complete ? (dashed ? '3 3' : undefined) : 1}
        strokeDashoffset={complete ? undefined : 1 - progress}
        style={complete ? undefined : { fill: 'none', transition: 'none' }}
      />
      <g opacity={clamp((progress - 0.5) * 2)}>
        <text x={cx} y={labelY} textAnchor="middle" dominantBaseline="central">
          {label}
        </text>
        {sub && (
          <text className="sim-sub" x={cx} y={subY} textAnchor="middle" dominantBaseline="central">
            {sub}
          </text>
        )}
      </g>
    </g>
  );
}

function chipAccess(v: Volume): string {
  return v.access === 'ephemeral' ? 'emptyDir' : v.access;
}

function actionLook(p: Pod | undefined): { tone: Tone; dim: boolean } {
  if (!p) return { tone: 'muted', dim: true };
  if (p.status === 'running') return { tone: 'accent-2', dim: false };
  if (p.status === 'pending') return { tone: 'muted', dim: false };
  return { tone: 'accent-1', dim: false };
}

function readouts(s: PlacementState, params: PlacementParams, running: Pod[], pending: Pod[]): [string, string][] {
  const perUser = Array.from({ length: params.users }, (_, u) => {
    const nodesUsed = new Set(running.filter((p) => p.user === u).map((p) => p.node));
    return nodesUsed.size ? `u${u + 1} on ${nodesUsed.size} node${nodesUsed.size === 1 ? '' : 's'}` : null;
  }).filter((x): x is string => x !== null);
  const building = s.pods.filter((p) => p.status === 'scheduling' && p.placedAt !== null);
  return [
    ['home volume', params.mode === 'today' ? 'RWO · one per user, one node at a time, so every pod of a user follows the first one' : 'RWX · one per user, any node, so every pod picks its own'],
    ['running / building / pending', `${running.length} / ${building.length} / ${pending.length}`],
    ['spread', perUser.length ? perUser.join(' · ') : '…'],
  ];
}
