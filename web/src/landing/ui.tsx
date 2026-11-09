import { useEffect, useState, type ReactNode } from 'react';
import { jumpTo } from './data';

/** The rendered width of an element, so a chart is drawn for the size it really has (text stays legible at 390 and at 1920). */
export function useWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!el) return;
    const read = () => setW(Math.round(el.clientWidth));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, w];
}

export const useIsPhone = () => {
  const [phone, setPhone] = useState(() => matchMedia('(max-width: 759.98px)').matches);
  useEffect(() => {
    const m = matchMedia('(max-width: 759.98px)');
    const on = () => setPhone(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
};

/** Says where a number comes from. Every panel of the page carries one. */
export function Src({ kind, children }: { kind: 'live' | 'model' | 'sim' | 'past'; children: ReactNode }) {
  const label = { live: 'Live', model: 'What if', sim: 'Simulated', past: 'On chain' }[kind];
  return <p className={`l-src l-src-${kind}`}><b>{label}</b> {children}</p>;
}

export function Copy({ text, testId }: { text: string; testId?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'no'>('idle');
  return (
    <div className="l-cmd" data-testid={testId}>
      <code>{text.split(/(?<=[,&])/).map((part, i) => <span key={i}>{i ? <wbr /> : null}{part}</span>)}</code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard
            .writeText(text)
            .then(() => setState('done'))
            .catch(() => setState('no'))
            .finally(() => window.setTimeout(() => setState('idle'), 1500));
        }}
      >
        {state === 'done' ? 'Copied' : state === 'no' ? 'Select it' : 'Copy'}
      </button>
    </div>
  );
}

/** A link to another section of this page: the hash is the route, so sections are reached by script. */
export function Jump({ to, children, className, label }: { to: string; children: ReactNode; className?: string; label?: string }) {
  return <a href="#/" className={className} aria-label={label} onClick={(e) => { e.preventDefault(); jumpTo(to, true); }}>{children}</a>;
}

/** Secondary text: shown on desktop, one tap away on a phone. */
export function Explain({ phone, label, children }: { phone: boolean; label: string; children: ReactNode }) {
  return phone ? <details className="l-explain"><summary>{label}</summary>{children}</details> : <>{children}</>;
}

export function Slider({ id, label, value, min, max, step, onChange, output, testId }: {
  id: string; label: ReactNode; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; output: ReactNode; testId?: string;
}) {
  return (
    <div className="l-slider">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" min={min} max={max} step={step ?? 1} value={value} data-testid={testId} onChange={(e) => onChange(Number(e.target.value))} />
      <output htmlFor={id}>{output}</output>
    </div>
  );
}

export const near3 = (n: number) => n.toFixed(3);
export const coins = (n: number) => Math.round(n).toLocaleString('en-US');
