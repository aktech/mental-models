import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { frameAt, run, type BaseEvent, type Frame, type Model, type Trace } from './engine';

export const SPEEDS = [0.05, 0.1, 0.25, 1] as const;

export interface Simulation<S, E extends BaseEvent> {
  /** Virtual time in ms, clamped to [0, duration]. */
  t: number;
  state: S;
  frame: Frame<S, E>;
  trace: Trace<S, E>;
  duration: number;
  playing: boolean;
  /** Virtual ms per real ms. */
  speed: number;
  reducedMotion: boolean;
  /**
   * How the last time change happened. "tween" after a step or reset, so CSS
   * transitions may ease elements to their new place. "none" while the clock
   * runs or the reader scrubs, where per-frame positioning is the animation.
   */
  motion: 'tween' | 'none';
  play(): void;
  pause(): void;
  toggle(): void;
  stepForward(): void;
  stepBack(): void;
  reset(): void;
  seek(t: number): void;
  setSpeed(speed: number): void;
}

export interface SimulationOptions {
  /** Initial playback speed. Default 0.1 (a 100 ms latency plays over 1 s). */
  speed?: number;
}

export function useSimulation<P, S, E extends BaseEvent>(
  model: Model<P, S, E>,
  params: P,
  options: SimulationOptions = {},
): Simulation<S, E> {
  // Re-run whenever a parameter value changes. Sliders produce plain data, so
  // a serialised key is a faithful identity.
  const paramsKey = JSON.stringify(params);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const trace = useMemo(() => run(model, params), [model, paramsKey]);

  const tRef = useRef(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(options.speed ?? 0.1);
  const [motion, setMotion] = useState<'tween' | 'none'>('none');
  const reducedMotion = useReducedMotion();

  const setTime = useCallback((next: number, how: 'tween' | 'none') => {
    tRef.current = next;
    setT(next);
    setMotion(how);
  }, []);

  // Keep the clock inside the new trace when parameters change mid-run.
  useEffect(() => {
    if (tRef.current > trace.duration) setTime(trace.duration, 'none');
  }, [trace, setTime]);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let id = 0;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const next = Math.min(tRef.current + dt * speed, trace.duration);
      setTime(next, 'none');
      if (next >= trace.duration) {
        setPlaying(false);
        return;
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, speed, trace, setTime]);

  const play = useCallback(() => {
    if (tRef.current >= trace.duration) setTime(0, 'none');
    setPlaying(true);
  }, [trace, setTime]);

  const pause = useCallback(() => setPlaying(false), []);

  const toggle = useCallback(() => {
    if (playing) pause();
    else play();
  }, [playing, play, pause]);

  const stepForward = useCallback(() => {
    setPlaying(false);
    const next = trace.times.find((x) => x > tRef.current);
    if (next !== undefined) setTime(next, 'tween');
  }, [trace, setTime]);

  const stepBack = useCallback(() => {
    setPlaying(false);
    const prev = [...trace.times].reverse().find((x) => x < tRef.current);
    if (prev !== undefined) setTime(prev, 'tween');
  }, [trace, setTime]);

  const reset = useCallback(() => {
    setPlaying(false);
    setTime(0, 'tween');
  }, [setTime]);

  const seek = useCallback(
    (next: number) => {
      setPlaying(false);
      setTime(Math.max(0, Math.min(next, trace.duration)), 'none');
    },
    [trace, setTime],
  );

  const clamped = Math.min(t, trace.duration);
  const frame = frameAt(trace, clamped);

  return {
    t: clamped,
    state: frame.state,
    frame,
    trace,
    duration: trace.duration,
    playing,
    speed,
    reducedMotion,
    motion,
    play,
    pause,
    toggle,
    stepForward,
    stepBack,
    reset,
    seek,
    setSpeed,
  };
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
