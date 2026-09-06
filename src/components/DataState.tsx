import type { ReactNode } from 'react';
import type { Async } from '../lib/data';

interface Props {
  label: string;
  height?: number;
}

export function Loading({ label, height }: Props) {
  return (
    <div
      className="state"
      role="status"
      aria-live="polite"
      style={height ? { minHeight: height, display: 'grid', placeItems: 'center' } : undefined}
    >
      Loading {label}...
    </div>
  );
}

export function LoadError({ label, error }: { label: string; error: Error }) {
  return (
    <div className="state state--error" role="alert">
      <strong>{label} could not be loaded</strong>
      {error.message}. The file may still be publishing. Reload the page in a
      moment, or use the data links on the About page.
    </div>
  );
}

/** Renders children only once the fetch resolves. */
export function Resolve<T>({
  state,
  label,
  height,
  children,
}: {
  state: Async<T>;
  label: string;
  height?: number;
  children: (data: T) => ReactNode;
}) {
  if (state.loading) return <Loading label={label} height={height} />;
  if (state.error) return <LoadError label={label} error={state.error} />;
  if (!state.data) return <LoadError label={label} error={new Error('No data returned')} />;
  return <>{children(state.data)}</>;
}
