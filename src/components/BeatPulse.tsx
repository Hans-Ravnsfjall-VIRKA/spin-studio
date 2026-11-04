import { useEffect, useRef } from 'react';

interface Props {
  /** Returns 0 up to 1 within the pedal stroke, or null to hold still. */
  getPhase: () => number | null;
  color: string;
  label: string;
  sublabel: string;
}

/** A ring that swells on every pedal stroke. Writes straight to the DOM so React never re-renders per frame. */
export function BeatPulse({ getPhase, color, label, sublabel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const getter = useRef(getPhase);
  getter.current = getPhase;

  useEffect(() => {
    let raf = 0;
    const frame = () => {
      const el = ref.current;
      if (el) {
        const phase = getter.current();
        const pulse = phase === null ? 0 : Math.pow(1 - phase, 2.2);
        el.style.setProperty('--pulse', pulse.toFixed(3));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="pulse" ref={ref} style={{ ['--pc' as string]: color }}>
      <div className="pulse-ring" />
      <div className="pulse-core">
        <div className="pulse-value">{label}</div>
        <div className="pulse-unit">RPM</div>
        <div className="pulse-sub">{sublabel}</div>
      </div>
    </div>
  );
}
