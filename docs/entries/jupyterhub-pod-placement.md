# Entry: Where a user's pods land

Title: "Where a user's pods land"

Shows the scheduling consequence of the data-science-pack storage layout,
before and after the change agreed in the 2026-08-25 storage discussion.

## Model

Discrete events on the shared engine. Users arrive, request pods, pods get
placed at request time and become running after a fixed spawn delay.

- Users: user 1 requests a lab at t = 0. Each user requests apps one at a
  time; the next request fires when the previous pod is running (or has been
  marked pending). User u+1 arrives when user u's lab is running.
- Nodes: N boxes with K pod slots each. Placement picks the emptiest node
  with a free slot, lowest index on ties.
- Mode `today`: every pod of a user mounts the same RWO home PVC and the same
  RWO nebi workspaces PVC. The first pod of a user picks a node; every later
  pod must go to that node. That node full = pending with reason
  "node-N full · affinity (RWO home)". Nothing ever un-pends.
- Mode `proposed`: each user's home is still their own volume, but RWX. The
  lab carries the RWO `nebi ws` PVC; each app carries an emptyDir `tmp`. Every pod
  picks the emptiest node on its own. Pending only when the whole cluster is
  full.

## Parameters

- Storage: today or proposed.
- Nodes (2 to 4), pods per node (1 to 4), users (1 to 3), apps per user
  (0 to 3). Timing fixed: 600 ms for the request to reach its node, 500 ms
  to create the pod object, 400 ms per volume mount, 400 ms to start, and a
  300 ms pause before the user's next request.

## What the reader should discover

- With the defaults (3 nodes, 2 per node, 2 users, 2 apps) today mode leaves
  user 1's second app pending while other nodes are empty. The reason text
  names the affinity, not capacity.
- Proposed mode spreads the same requests across nodes with nothing pending.
- The lab still carries an RWO volume in proposed mode. That is fine because
  there is one lab per user; RWO means one node at a time, not one node
  forever. The pin came from apps sharing the same RWO volume.
- Apps carry a dashed `tmp` chip: whatever they write there dies with them.

## Visual notes

- Left column of user boxes, each listing lab / app 1 / app 2 rows that
  light up as requests fire.
- Right: node boxes with slots. A placed pod shows its volume chips under it:
  solid = RWO PVC, dashed = emptyDir. In proposed mode one "uN home · RWX"
  bar per user sits under the nodes, and every node running one of that
  user's pods is wired to it.
- Pending tray under the nodes lists pending pods with their reason.
- A dot travels from the user's row to the slot (or the tray), laying a
  dotted trail behind it as it goes. On arrival the pod box is traced onto the node: its outline runs
  round the perimeter over the create window and the label fades in behind
  it, captioned "creating" / "mounting home" / "mounting nebi ws" /
  "starting". Each volume chip is traced the same way during its mount
  window, then the box fills in as running. Tracing is a function of the
  simulated clock, so scrubbing shows half-drawn boxes, and each stage is its
  own event so `step ›` walks through them.
