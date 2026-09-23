import { METRIC_LABELS, METRIC_UNITS, MetricKey, Reading } from "../domain/types";

export const METRIC_KEYS: MetricKey[] = ["particles", "pressure", "temperature", "humidity"];

export type ReadingStrings = Record<MetricKey, string>;

export function toStrings(r: Reading): ReadingStrings {
  return {
    particles: String(r.particles),
    pressure: String(r.pressure),
    temperature: String(r.temperature),
    humidity: String(r.humidity),
  };
}

export function emptyStrings(): ReadingStrings {
  return { particles: "", pressure: "", temperature: "", humidity: "" };
}

export function parseReadings(values: ReadingStrings): Reading | null {
  const out = {} as Reading;
  for (const k of METRIC_KEYS) {
    const n = Number(values[k]);
    if (values[k].trim() === "" || !Number.isFinite(n)) return null;
    out[k] = n;
  }
  return out;
}

export function ReadingInputs({
  values,
  onChange,
}: {
  values: ReadingStrings;
  onChange: (key: MetricKey, value: string) => void;
}) {
  return (
    <div className="reading-grid">
      {METRIC_KEYS.map((k) => (
        <label key={k}>
          <span>
            {METRIC_LABELS[k]}（{METRIC_UNITS[k]}）
          </span>
          <input
            type="number"
            step="any"
            value={values[k]}
            onChange={(e) => onChange(k, e.target.value)}
            placeholder={`填写${METRIC_LABELS[k]}`}
          />
        </label>
      ))}
    </div>
  );
}
