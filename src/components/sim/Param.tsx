import { useId } from 'react';

interface ParamProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onChange(value: number): void;
}

/** One parameter slider: label, range input, live value. */
export function Param({ label, value, min, max, step = 1, unit = '', disabled = false, onChange }: ParamProps) {
  const id = useId();
  return (
    <div className={`sim-param${disabled ? ' is-disabled' : ''}`}>
      <label htmlFor={id} className="sim-param-label">
        {label}
      </label>
      <input
        id={id}
        type="range"
        className="sim-range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
      />
      <output htmlFor={id} className="sim-param-value">
        {value}
        {unit}
      </output>
    </div>
  );
}
