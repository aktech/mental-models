import { describe, expect, it } from 'vitest';
import { run } from '../components/sim/engine';
import { placement, type PlacementParams } from './placement';

const base: PlacementParams = { mode: 'today', nodes: 3, slots: 2, users: 1, apps: 2, spawnMs: 100 };

function finalPods(params: PlacementParams) {
  const trace = run(placement, params);
  return trace.frames[trace.frames.length - 1]!.state.pods;
}

describe('placement, today (RWO home + affinity)', () => {
  it('keeps one user on one node and leaves the pod that no longer fits pending', () => {
    const pods = finalPods(base);
    const lab = pods.find((p) => p.kind === 'lab')!;
    const [app1, app2] = pods.filter((p) => p.kind === 'app');
    expect(lab.status).toBe('running');
    expect(app1!.status).toBe('running');
    expect(app1!.node).toBe(lab.node);
    expect(app2!.status).toBe('pending');
    expect(app2!.node).toBeNull();
    expect(app2!.reason).toMatch(/affinity/);
  });
});

describe('placement, proposed (RWX home, lab RWO workspaces, app emptyDir)', () => {
  it('schedules every pod independently so nothing waits while nodes have room', () => {
    const pods = finalPods({ ...base, mode: 'proposed' });
    expect(pods).toHaveLength(3);
    expect(pods.every((p) => p.status === 'running')).toBe(true);
    const nodes = new Set(pods.map((p) => p.node));
    expect(nodes.size).toBe(3);
  });

  it('goes pending only when the whole cluster is full', () => {
    const pods = finalPods({ ...base, mode: 'proposed', nodes: 1, slots: 2 });
    const [lab, app1, app2] = pods;
    expect(lab!.status).toBe('running');
    expect(app1!.status).toBe('running');
    expect(app2!.status).toBe('pending');
    expect(app2!.reason).toBe('cluster full');
  });
});

describe('second user', () => {
  it('arrives once the first lab is running and lands on the emptiest node', () => {
    const pods = finalPods({ ...base, users: 2, apps: 0 });
    const [lab1, lab2] = pods;
    expect(lab2!.requestedAt).toBe(lab1!.runningAt);
    expect(lab2!.node).not.toBe(lab1!.node);
  });
});

describe('volumes', () => {
  it('today: every pod carries the RWO home and RWO workspaces PVCs', () => {
    const pods = finalPods({ ...base, apps: 1 });
    for (const p of pods) {
      expect(p.volumes).toEqual(expect.arrayContaining([
        { name: 'home', access: 'rwo' },
        { name: 'ws', access: 'rwo' },
      ]));
    }
  });

  it('proposed: lab keeps RWO workspaces, app gets emptyDir, both share RWX home', () => {
    const pods = finalPods({ ...base, mode: 'proposed', apps: 1 });
    const lab = pods.find((p) => p.kind === 'lab')!;
    const app = pods.find((p) => p.kind === 'app')!;
    expect(lab.volumes).toEqual([
      { name: 'home', access: 'rwx' },
      { name: 'ws', access: 'rwo' },
    ]);
    expect(app.volumes).toEqual([
      { name: 'home', access: 'rwx' },
      { name: 'tmp', access: 'ephemeral' },
    ]);
  });
});
