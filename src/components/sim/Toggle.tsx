interface ToggleProps {
  label: string;
  on: boolean;
  onChange(on: boolean): void;
}

export function Toggle({ label, on, onChange }: ToggleProps) {
  return (
    <div className="sim-param">
      <span className="sim-param-label">{label}</span>
      <div>
        <button type="button" role="switch" aria-checked={on} className="sim-btn" onClick={() => onChange(!on)}>
          {on ? 'on' : 'off'}
        </button>
      </div>
      <span />
    </div>
  );
}
