import { useEffect, useState } from 'react';
import type { ClassEngine, EngineStatus } from '../audio/engine';

export interface Clock {
  elapsed: number;
  status: EngineStatus;
}

/** Polls the engine a few times a second so React only renders what text needs. */
export function useEngineClock(engine: ClassEngine, intervalMs = 150): Clock {
  const [clock, setClock] = useState<Clock>({ elapsed: engine.elapsed, status: engine.getStatus() });

  useEffect(() => {
    const read = () => {
      const next: Clock = { elapsed: engine.elapsed, status: engine.getStatus() };
      setClock((prev) =>
        Math.abs(prev.elapsed - next.elapsed) < 0.05 && prev.status === next.status ? prev : next,
      );
    };
    read();
    const id = window.setInterval(read, intervalMs);
    return () => window.clearInterval(id);
  }, [engine, intervalMs]);

  return clock;
}

/** Only re-renders when the status changes, not on every tick. */
export function useEngineStatus(engine: ClassEngine, intervalMs = 250): EngineStatus {
  const [status, setStatus] = useState<EngineStatus>(engine.getStatus());

  useEffect(() => {
    const read = () => setStatus(engine.getStatus());
    read();
    const id = window.setInterval(read, intervalMs);
    return () => window.clearInterval(id);
  }, [engine, intervalMs]);

  return status;
}
