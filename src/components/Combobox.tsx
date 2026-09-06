import { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface ComboOption {
  value: string;
  meta?: string;
}

interface Props {
  label: string;
  options: ComboOption[];
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  /** Row shown at the top that clears the selection. */
  allLabel?: string;
  /** What one option is called, used in the no-match message. */
  noun?: string;
  maxRender?: number;
}

/** Searchable single-select for long option lists (3,000+ agencies). */
export function Combobox({
  label,
  options,
  value,
  onChange,
  placeholder = 'Type to search',
  allLabel = 'All agencies',
  noun = 'agency',
  maxRender = 60,
}: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? options.filter((o) => o.value.toLowerCase().includes(q)) : options;
    return base.slice(0, maxRender);
  }, [options, query, maxRender]);

  const rows: (ComboOption | null)[] = [null, ...matches];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function pick(row: ComboOption | null) {
    onChange(row ? row.value : null);
    setQuery('');
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
        return;
      }
      setActive((i) => {
        const n = rows.length;
        return e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n;
      });
    } else if (e.key === 'Enter') {
      if (open) {
        e.preventDefault();
        pick(rows[active] ?? null);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  const display = open ? query : (value ?? '');

  return (
    <div className="field combo" ref={rootRef}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        value={display}
        placeholder={value ? value : placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open ? (
        <ul className="combo__list" id={`${id}-list`} role="listbox" ref={listRef}>
          {rows.map((row, i) => (
            <li
              key={row ? row.value : '__all'}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className="combo__opt"
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(row)}
            >
              <span>{row ? row.value : allLabel}</span>
              {row?.meta ? <span>{row.meta}</span> : null}
            </li>
          ))}
          {matches.length === 0 && query ? (
            <li className="combo__opt" aria-disabled="true">
              <span>
                No {noun} matches "{query}"
              </span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
