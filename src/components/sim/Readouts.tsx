import type { ReactNode } from 'react';

/** Live facts about the current instant. Announced politely when they change. */
export function Readouts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="sim-readouts" aria-live="polite" aria-atomic="true">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
