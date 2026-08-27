import type { BaseEvent } from './engine';
import { formatMs } from './format';
import { SPEEDS, type Simulation } from './useSimulation';

interface ControlsProps<S, E extends BaseEvent> {
  sim: Simulation<S, E>;
}

export function Controls<S, E extends BaseEvent>({ sim }: ControlsProps<S, E>) {
  const atStart = sim.t <= 0;
  const atEnd = sim.t >= sim.duration;
  return (
    <div className="sim-controls" role="group" aria-label="Simulation controls">
      <div className="sim-controls-row">
        {!sim.reducedMotion && (
          <button type="button" className="sim-btn" onClick={sim.toggle}>
            {sim.playing ? 'pause' : 'play'}
          </button>
        )}
        <button type="button" className="sim-btn" onClick={sim.stepBack} disabled={atStart}>
          ‹ step
        </button>
        <button type="button" className="sim-btn" onClick={sim.stepForward} disabled={atEnd}>
          step ›
        </button>
        <button type="button" className="sim-btn" onClick={sim.reset} disabled={atStart}>
          reset
        </button>
        {!sim.reducedMotion && (
          <div className="sim-speed" role="group" aria-label="Playback speed">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                className="sim-btn"
                aria-pressed={sim.speed === s}
                onClick={() => sim.setSpeed(s)}
              >
                {s}×
              </button>
            ))}
          </div>
        )}
        <output className="sim-readout" aria-live={sim.playing ? 'off' : 'polite'} aria-atomic="true">
          t = {formatMs(sim.t)}
        </output>
      </div>
      <input
        type="range"
        className="sim-range sim-scrubber"
        min={0}
        max={sim.duration}
        step={1}
        value={sim.t}
        onChange={(e) => sim.seek(Number(e.currentTarget.value))}
        aria-label="Simulated time"
        aria-valuetext={formatMs(sim.t)}
      />
    </div>
  );
}
