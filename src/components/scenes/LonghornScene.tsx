import { useMemo, useState } from 'react';
import {
  engineNode,
  longhorn,
  networkHops,
  NODE_COUNT,
  replicaIsLocal,
  SHARE_MANAGER_NODE,
  type LonghornParams,
  type LonghornState,
  type Mode,
  type PodState,
} from '../../models/longhorn';
import { Choice } from '../sim/Choice';
import { Controls } from '../sim/Controls';
import { Param } from '../sim/Param';
import { Counter, Edge, Node, Packet, type Point, type Tone } from '../sim/primitives';
import { Readouts } from '../sim/Readouts';
import { Toggle } from '../sim/Toggle';
import { useContainerWidth } from '../sim/useContainerWidth';
import { useSimulation } from '../sim/useSimulation';
import '../sim/sim.css';

/*
  Three nodes drawn as boxes, side by side. Inside each: a pod row, a share
  manager row, an engine row, a replica row. Everything that crosses a node
  boundary is a network hop, and the picture is laid out so you can see it
  cross. With dedicated storage on, a second row of storage nodes appears and
  the replicas move down into it.
*/

const GAP = 12;
const PAD = 8;
const SLOT_H = 34;
const LABEL_H = 20;
const ROW_POD = LABEL_H;
const ROW_GAP = 26;
const ROW_SM = ROW_POD + SLOT_H + ROW_GAP;
const ROW_ENGINE = ROW_SM + SLOT_H + ROW_GAP;
const ROW_REPLICA = ROW_ENGINE + SLOT_H + ROW_GAP;
const NODE_H = ROW_REPLICA + SLOT_H + PAD;
const STORAGE_Y = NODE_H + 32;
const STORAGE_H = LABEL_H + SLOT_H + PAD;
const HOP_MAX = 100;

interface Slot {
  x: number;
  y: number;
  w: number;
}

export default function LonghornScene() {
  const [mode, setMode] = useState<Mode>('rwo');
  const [pods, setPods] = useState(1);
  const [clientHop, setClientHop] = useState(30);
  const [replicaHop, setReplicaHop] = useState(20);
  const [dedicatedStorage, setDedicatedStorage] = useState(false);
  const [disks, setDisks] = useState([60, 90, 140]);

  const params = useMemo<LonghornParams>(
    () => ({ mode, pods, clientHop, replicaHop, disks, dedicatedStorage }),
    [mode, pods, clientHop, replicaHop, disks, dedicatedStorage],
  );
  const sim = useSimulation(longhorn, params);
  const { ref, width } = useContainerWidth<HTMLDivElement>(640);
  const t = sim.t;
  const now = sim.state;
  const final = sim.trace.frames[sim.trace.frames.length - 1]!.state;
  const rwx = mode === 'rwx';
  const eng = engineNode(mode);
  const height = (dedicatedStorage ? STORAGE_Y + STORAGE_H : NODE_H) + 4;

  // geometry
  const nodeW = (width - GAP * (NODE_COUNT - 1)) / NODE_COUNT;
  const nodeX = (n: number) => n * (nodeW + GAP);
  const innerW = nodeW - 2 * PAD;
  const slot = (n: number, row: number): Slot => ({ x: nodeX(n) + PAD, y: row, w: innerW });
  const podsOnNode = (n: number) => now.pods.filter((p) => p.node === n);
  const podSlot = (pod: PodState): Slot => {
    const siblings = podsOnNode(pod.node);
    const k = siblings.length;
    const w = (innerW - 6 * (k - 1)) / k;
    const i = siblings.findIndex((p) => p.id === pod.id);
    return { x: nodeX(pod.node) + PAD + i * (w + 6), y: ROW_POD, w };
  };
  const replicaSlot = (i: number): Slot =>
    dedicatedStorage ? { x: nodeX(i) + PAD, y: STORAGE_Y + LABEL_H, w: innerW } : slot(i, ROW_REPLICA);
  const bottom = (s: Slot): Point => ({ x: s.x + s.w / 2, y: s.y + SLOT_H });
  const top = (s: Slot): Point => ({ x: s.x + s.w / 2, y: s.y });
  const smSlot = slot(SHARE_MANAGER_NODE, ROW_SM);
  const engineSlot = slot(eng, ROW_ENGINE);
  const narrow = innerW < 120;

  const activeWrites = now.active.map((p) => now.writes[`p${p}`]!);
  // put the NFS label on a line that crosses a node boundary, preferring the far side
  const nfsLabelPod = (now.pods.find((p) => p.node > SHARE_MANAGER_NODE) ?? now.pods.find((p) => p.node !== SHARE_MANAGER_NODE) ?? now.pods[0])!.id;
  const anyDone = now.pods.some((p) => p.returnedAt !== null);
  const hops = networkHops(params);

  return (
    <figure className="sim" ref={ref}>
      <svg
        className="sim-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        data-motion={sim.motion}
        role="img"
        aria-label="Three cluster nodes with pods, a Longhorn engine and replicas; lines crossing between nodes are network hops."
      >
        {/* node boxes */}
        {Array.from({ length: NODE_COUNT }, (_, n) => (
          <g key={n} className="sim-box">
            <rect x={nodeX(n)} y={0} width={nodeW} height={NODE_H} rx={6} />
            <text x={nodeX(n) + PAD} y={11} dominantBaseline="central">
              node-{n + 1}
            </text>
          </g>
        ))}
        <g className={`sim-tier${dedicatedStorage ? '' : ' is-hidden'}`}>
          {Array.from({ length: NODE_COUNT }, (_, n) => (
            <g key={n} className="sim-box is-storage">
              <rect x={nodeX(n)} y={STORAGE_Y} width={nodeW} height={STORAGE_H} rx={6} />
              <text x={nodeX(n) + PAD} y={STORAGE_Y + 11} dominantBaseline="central">
                storage-{n + 1}
              </text>
            </g>
          ))}
        </g>

        {/* RWO: attached pods talk to the engine in-process */}
        <g className={`sim-tier${rwx ? ' is-hidden' : ''}`}>
          {now.pods
            .filter((p) => p.attached && !rwx)
            .map((p) => (
              <Edge key={p.id} from={bottom(podSlot(p))} to={top(engineSlot)} tone="default" label={p.id === 0 && !narrow ? 'in-process' : undefined} />
            ))}
        </g>

        {/* RWX: every pod reaches the share manager over NFS */}
        <g className={`sim-tier${rwx ? '' : ' is-hidden'}`}>
          {now.pods.map((p) => (
            <Edge
              key={p.id}
              from={bottom(podSlot(p))}
              to={top(smSlot)}
              label={p.id === nfsLabelPod ? `nfs · ${clientHop} ms` : undefined}
              labelOffset={{ x: p.node > SHARE_MANAGER_NODE ? 10 : -10, y: 10 }}
            />
          ))}
          <Edge from={bottom(smSlot)} to={top(engineSlot)} tone="default" label={narrow ? undefined : 'in-process'} />
          <Node x={smSlot.x} y={smSlot.y} w={smSlot.w} h={SLOT_H} label={narrow ? 'share mgr' : 'share manager'} sub="filesystem" tone={rwx && now.active.length ? 'accent-1' : 'default'} />
          {now.queue.length > 0 && <Counter x={smSlot.x + smSlot.w / 2} y={smSlot.y - 8} anchor="middle" label="queue" value={now.queue.length} tone="accent-1" />}
        </g>

        {/* engine and replicas, the same in both modes */}
        {disks.map((_, i) => {
          const local = replicaIsLocal(params, i);
          const firstNetwork = disks.findIndex((_, j) => !replicaIsLocal(params, j));
          const label = local ? 'local' : i === firstNetwork ? `${replicaHop} ms · network` : undefined;
          return (
            <Edge
              key={i}
              from={bottom(engineSlot)}
              to={top(replicaSlot(i))}
              label={narrow && !local ? undefined : label}
              labelOffset={{ x: i > eng ? -6 : 6, y: local ? 0 : -6 }}
            />
          );
        })}
        <Node
          x={engineSlot.x}
          y={engineSlot.y}
          w={engineSlot.w}
          h={SLOT_H}
          label="engine"
          sub={rwx ? (narrow ? 'blocks' : 'block device · blocks') : narrow ? 'fs + blocks' : 'filesystem + block device'}
          tone={now.active.length ? 'accent-1' : anyDone ? 'accent-2' : 'default'}
        />
        {disks.map((disk, i) => {
          const s = replicaSlot(i);
          const busy = activeWrites.some((w) => w.legs[i]!.arrivesAt <= t && t < w.legs[i]!.ackSentAt);
          const acked = !busy && (activeWrites.some((w) => w.legs[i]!.ackSentAt <= t) || (activeWrites.length === 0 && anyDone));
          const tone: Tone = busy ? 'accent-1' : acked ? 'accent-2' : 'default';
          return (
            <g key={i} className="sim-tier" style={{ transform: `translateY(${s.y - ROW_REPLICA}px)` }}>
              <Node x={s.x} y={ROW_REPLICA} w={s.w} h={SLOT_H} label={`replica ${i + 1}`} sub={`${disk} ms disk`} tone={tone} fill={tone !== 'default'} />
            </g>
          );
        })}

        {/* pods */}
        {now.pods.map((p) => {
          const s = podSlot(p);
          const { tone, sub, dim } = podLook(p, t, s.w < 70);
          return <Node key={p.id} x={s.x} y={s.y} w={s.w} h={SLOT_H} label={`pod ${p.id + 1}`} sub={sub} tone={tone} fill={tone === 'accent-2'} dim={dim} />;
        })}

        {/* packets, from the fully known trace */}
        {rwx &&
          final.pods.map((p) =>
            p.sentAt !== null && p.arrivedAt !== null ? (
              <Packet key={`req${p.id}`} from={bottom(podSlot(p))} to={top(smSlot)} t0={p.sentAt} t1={p.arrivedAt} t={t} tone="accent-1" />
            ) : null,
          )}
        {rwx &&
          final.pods.map((p) =>
            p.completedAt !== null && p.returnedAt !== null ? (
              <Packet key={`rep${p.id}`} from={top(smSlot)} to={bottom(podSlot(p))} t0={p.completedAt} t1={p.returnedAt} t={t} tone="accent-2" />
            ) : null,
          )}
        {Object.values(final.writes).flatMap((w) =>
          w.legs.flatMap((leg, i) => [
            leg.arrivesAt > leg.sentAt && (
              <Packet key={`${w.id}-out-${i}`} from={bottom(engineSlot)} to={top(replicaSlot(i))} t0={leg.sentAt} t1={leg.arrivesAt} t={t} tone="accent-1" />
            ),
            leg.ackArrivesAt > leg.ackSentAt && (
              <Packet key={`${w.id}-ack-${i}`} from={top(replicaSlot(i))} to={bottom(engineSlot)} t0={leg.ackSentAt} t1={leg.ackArrivesAt} t={t} tone="accent-2" />
            ),
          ]),
        )}
      </svg>

      <Readouts items={readouts(now, params, hops)} />
      <Controls sim={sim} />

      <div className="sim-params">
        <Choice<Mode>
          label="access mode"
          value={mode}
          options={[
            { value: 'rwo', label: 'RWO' },
            { value: 'rwx', label: 'RWX' },
          ]}
          onChange={setMode}
        />
        <Param label="writing pods" value={pods} min={1} max={4} onChange={setPods} />
        <Param label="pod → share manager" value={clientHop} min={0} max={HOP_MAX} step={5} unit=" ms" disabled={!rwx} onChange={setClientHop} />
        <h3>below the engine</h3>
        <Param label="engine → other node" value={replicaHop} min={0} max={HOP_MAX} step={5} unit=" ms" onChange={setReplicaHop} />
        <Toggle label="dedicated storage nodes" on={dedicatedStorage} onChange={setDedicatedStorage} />
        {disks.map((d, i) => (
          <Param
            key={i}
            label={`replica ${i + 1} disk`}
            value={d}
            min={10}
            max={400}
            step={10}
            unit=" ms"
            onChange={(v) => setDisks((prev) => prev.map((x, j) => (j === i ? v : x)))}
          />
        ))}
      </div>
    </figure>
  );
}

function podLook(p: PodState, t: number, short: boolean): { tone: Tone; sub: string; dim: boolean } {
  if (!p.attached) return { tone: 'muted', sub: short ? 'no attach' : "can't attach", dim: true };
  if (p.returnedAt !== null && p.returnedAt <= t) return { tone: 'accent-2', sub: short ? `${p.returnedAt} ms` : `done · ${p.returnedAt} ms`, dim: false };
  if (p.startedAt !== null && p.startedAt <= t) return { tone: 'accent-1', sub: 'writing', dim: false };
  if (p.arrivedAt !== null && p.arrivedAt <= t) return { tone: 'muted', sub: 'queued', dim: false };
  return { tone: 'default', sub: 'sending', dim: false };
}

function readouts(s: LonghornState, params: LonghornParams, hops: { beforeEngine: number; toReplicas: number }): [string, string][] {
  const eng = engineNode(params.mode);
  const done = s.pods.filter((p) => p.returnedAt !== null);
  return [
    ['filesystem + engine', params.mode === 'rwo' ? `node-${eng + 1} · the pod's node` : `node-${eng + 1} · share manager pod`],
    ['network hops', `${hops.beforeEngine} before engine + ${hops.toReplicas} of 3 replicas, each way`],
    ['returned', done.length ? done.map((p) => `pod ${p.id + 1} ${p.returnedAt} ms`).join(' · ') : '…'],
  ];
}
