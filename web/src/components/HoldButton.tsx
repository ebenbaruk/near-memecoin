import { useEffect, useRef, useState } from 'react';

const HOLD_MS = 1500;
const R = 28;
const CIRC = 2 * Math.PI * R;

/** Press and hold 1.5 s. Releasing or sliding off cancels. Space or Enter held down works too. */
export function HoldButton({ label, disabled, onDone, testId }: { label: string; disabled?: boolean; onDone: () => void; testId: string }) {
  const ring = useRef<SVGCircleElement>(null);
  const raf = useRef(0);
  const started = useRef<number | null>(null);
  const [holding, setHolding] = useState(false);

  const paint = (p: number) => ring.current?.setAttribute('stroke-dashoffset', String(CIRC * (1 - p)));

  const cancel = () => {
    cancelAnimationFrame(raf.current);
    started.current = null;
    setHolding(false);
    paint(0);
  };

  const step = () => {
    if (started.current === null) return;
    const p = (performance.now() - started.current) / HOLD_MS;
    if (p >= 1) {
      paint(1);
      started.current = null;
      setHolding(false);
      onDone();
      return;
    }
    paint(p);
    raf.current = requestAnimationFrame(step);
  };

  const start = () => {
    if (disabled || started.current !== null) return;
    started.current = performance.now();
    setHolding(true);
    raf.current = requestAnimationFrame(step);
  };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <button
      type="button"
      className={`btn btn-hold${holding ? ' holding' : ''}`}
      data-testid={testId}
      disabled={disabled}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        start();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onLostPointerCapture={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') cancel();
      }}
      onBlur={cancel}
    >
      <svg className="hold-ring" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={R} className="hold-track" />
        <circle ref={ring} cx="32" cy="32" r={R} className="hold-bar" strokeDasharray={CIRC} strokeDashoffset={CIRC} transform="rotate(-90 32 32)" />
      </svg>
      <span>{holding ? 'Keep holding…' : label}</span>
    </button>
  );
}
