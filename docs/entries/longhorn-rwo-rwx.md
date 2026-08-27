# Entry: Longhorn RWO vs RWX

Title: "One filesystem, many writers"

Reuses the quorum write simulation underneath. The Longhorn engine writing to
three replicas is a replicated write with acks required = N. Extend it with the
layer above the engine, which is where RWO and RWX differ.

## Model

- Replica tier: three node disks, each with its own latency. Plain files, never
  mounted by anything.
- Engine: one per volume. Exposes a block device. Fans a write to all three
  replicas and waits for all three.
- Above the engine, a mode switch:
  - RWO: the pod's own node holds the block device and runs the filesystem.
    Pod to engine is in-process, zero network.
  - RWX: a share manager pod holds the block device and runs the only
    filesystem. Other pods send file requests to it over the network, so there
    is one extra hop in front of everything.

## Parameters

- Mode: RWO or RWX.
- Number of writing pods (1 to 4). In RWO they must all sit on the engine's
  node; show the others greyed out and unable to attach.
- Client to share manager latency (RWX only).
- Per-replica latency.
- "Replica co-located with engine" toggle. When on, one replica's network hop
  is zero. When off (dedicated storage nodes), all three cross the network.

## What the reader should discover

- The bottom of the stack never changes. Same engine, same three replicas, same
  wait-for-all. Switching modes only changes what sits above the engine.
- RWX costs exactly one extra round trip, in front of replication, not instead
  of it.
- RWO is not network-free. The replica writes still cross the wire.
- Turning off co-location removes the one free local write, which is the real
  cost of dedicated storage nodes.
- With multiple pods in RWX, all requests funnel through one share manager.
  Raise the pod count and show the queue building.

## Visual notes

- Vertical stack: pods on top, share manager tier (RWX only, collapses out in
  RWO), engine, three node disks at the bottom.
- The share manager tier slides in and out, not pops, so the reader sees it as
  an insertion rather than a different diagram.
- Label the block device explicitly as blocks, not files, and the share manager
  / RWO pod node as the place the filesystem lives. The single-filesystem
  invariant is the point of the entry.
- Readout: elapsed virtual time, network hops before the engine, and where the
  filesystem currently lives.

Prose around it should be short. The animation carries the argument.

## Open questions (asked 2026-08-25)

1. What builds the RWX queue: share manager serialises whole writes including
   replication, or a fixed per-request service time with overlapping
   replication?
2. One write per pod at t=0, or writes on an interval per pod?
3. In RWO, are pods 2..4 on other nodes (greyed out) or all on the engine node?
4. Share manager to engine is in-process (assumed yes).
