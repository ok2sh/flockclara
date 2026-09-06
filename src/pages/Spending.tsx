// Spending: every line item across the released purchase orders, combined
// and grouped, plus a printed-vs-computed total reconciliation.

import { useMemo, useState } from 'react';
import { Section } from '../components/Section';
import { Resolve } from '../components/DataState';
import { StatTile } from '../components/StatTile';
import { SortableTh, compareBy } from '../components/SortableTh';
import type { SortDir } from '../components/SortableTh';
import { PATHS, useJson, assetUrl } from '../lib/data';
import { money, longDate, num, toCsv, downloadText } from '../lib/format';
import type { Invoices, PurchaseOrder } from '../types';

type SortKey =
  | 'po'
  | 'date'
  | 'supplier'
  | 'description'
  | 'quantity'
  | 'uom'
  | 'unit_price'
  | 'extended_amount';

interface CombinedLine {
  key: string;
  po: string;
  date: string | null;
  supplier: string;
  description: string;
  quantity: number | null;
  uom: string | null;
  unit_price: number | null;
  extended_amount: number | null;
}

const NUMERIC_COLS = new Set<SortKey>(['quantity', 'unit_price', 'extended_amount']);

const GETTERS: Record<SortKey, (r: CombinedLine) => string | number | null> = {
  po: (r) => r.po,
  date: (r) => r.date,
  supplier: (r) => r.supplier,
  description: (r) => r.description,
  quantity: (r) => r.quantity,
  uom: (r) => r.uom,
  unit_price: (r) => r.unit_price,
  extended_amount: (r) => r.extended_amount,
};

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'po', label: 'PO' },
  { key: 'date', label: 'Date' },
  { key: 'supplier', label: 'Supplier' },
  { key: 'description', label: 'Description' },
  { key: 'quantity', label: 'Qty' },
  { key: 'uom', label: 'UOM' },
  { key: 'unit_price', label: 'Unit price' },
  { key: 'extended_amount', label: 'Extended amount' },
];

/** True if printed and computed totals differ by more than a cent (float slop). */
function totalsMismatch(po: PurchaseOrder): boolean {
  if (po.printed_total === null || po.computed_total === null) return false;
  return Math.abs(po.printed_total - po.computed_total) > 0.005;
}

export function Spending() {
  const state = useJson<Invoices>(PATHS.invoices);

  return (
    <Section
      kicker="Procurement records"
      title="Spending"
      intro="These are the City of Santa Clara purchase orders released in the same records request. They cover Flock Safety license plate reader cameras and services, purchased through the reseller Insight Public Sector."
    >
      <Resolve state={state} label="purchase order records">
        {(data) => <SpendingContent purchaseOrders={data.purchase_orders} />}
      </Resolve>
    </Section>
  );
}

function SpendingContent({ purchaseOrders }: { purchaseOrders: PurchaseOrder[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('extended_amount');
  const [dir, setDir] = useState<SortDir>('desc');

  const combined = useMemo<CombinedLine[]>(() => {
    const rows: CombinedLine[] = [];
    for (const po of purchaseOrders) {
      for (const line of po.lines) {
        rows.push({
          key: `${po.po_number}-${line.line}`,
          po: po.po_number,
          date: po.date,
          supplier: po.supplier.name,
          description: line.description,
          quantity: line.quantity,
          uom: line.uom,
          unit_price: line.unit_price,
          extended_amount: line.extended_amount,
        });
      }
    }
    return rows;
  }, [purchaseOrders]);

  const sorted = useMemo(
    () => [...combined].sort((a, b) => compareBy(a, b, GETTERS[sortKey], dir)),
    [combined, sortKey, dir],
  );

  const grandTotal = useMemo(
    () => purchaseOrders.reduce((sum, po) => sum + (po.computed_total ?? 0), 0),
    [purchaseOrders],
  );

  const dateRange = useMemo(() => {
    const dates = purchaseOrders.map((po) => po.date).filter((d): d is string => !!d);
    if (!dates.length) return '-';
    const sortedDates = [...dates].sort();
    const first = sortedDates[0];
    const last = sortedDates[sortedDates.length - 1];
    return first === last ? longDate(first) : `${longDate(first)} - ${longDate(last)}`;
  }, [purchaseOrders]);

  const mismatched = useMemo(() => purchaseOrders.filter(totalsMismatch), [purchaseOrders]);

  function onSort(key: SortKey) {
    if (key === sortKey) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setDir(NUMERIC_COLS.has(key) ? 'desc' : 'asc');
    }
  }

  function handleDownload() {
    const csv = toCsv(
      COLUMNS.map((c) => c.label),
      sorted.map((r) => [r.po, r.date, r.supplier, r.description, r.quantity, r.uom, r.unit_price, r.extended_amount]),
    );
    downloadText('flock-po-line-items.csv', csv);
  }

  return (
    <div className="stack stack--lg">
      <div className="grid grid--4">
        <StatTile label="Grand total" value={money(grandTotal)} note={`${purchaseOrders.length} purchase orders`} />
        <StatTile label="Purchase orders" value={num(purchaseOrders.length)} />
        <StatTile label="Line items" value={num(combined.length)} />
        <StatTile label="Date range" value={dateRange} />
      </div>

      <div className="stack stack--sm">
        <div className="spread">
          <h3>All line items</h3>
          <button type="button" className="btn btn--ghost btn--sm" onClick={handleDownload}>
            Download line items as CSV
          </button>
        </div>
        <div className="table-scroll">
          <table className="data">
            <caption>
              All {combined.length} line items across {purchaseOrders.length} purchase orders.
            </caption>
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <SortableTh
                    key={c.key}
                    col={c.key}
                    label={c.label}
                    sortKey={sortKey}
                    dir={dir}
                    onSort={onSort}
                    numeric={NUMERIC_COLS.has(c.key)}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.key}>
                  <td className="mono">{r.po}</td>
                  <td>{longDate(r.date)}</td>
                  <td>{r.supplier}</td>
                  <td>{r.description}</td>
                  <td className="n">{num(r.quantity)}</td>
                  <td>{r.uom ?? '-'}</td>
                  <td className="n">{money(r.unit_price)}</td>
                  <td className="n">{money(r.extended_amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7}>Total</td>
                <td className="n">{money(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="stack">
        <h3>Purchase orders</h3>
        <p className="note">
          {mismatched.length === 0
            ? `Printed and computed totals agree on all ${purchaseOrders.length} purchase orders.`
            : `Printed and computed totals differ on ${mismatched.length} of ${purchaseOrders.length} purchase orders: ${mismatched.map((po) => po.po_number).join(', ')}.`}
        </p>

        {purchaseOrders.map((po) => (
          <PurchaseOrderCard key={po.po_number} po={po} mismatch={totalsMismatch(po)} />
        ))}
      </div>
    </div>
  );
}

function PurchaseOrderCard({ po, mismatch }: { po: PurchaseOrder; mismatch: boolean }) {
  const notes = po.notes ? po.notes.split(' | ').filter(Boolean) : [];

  return (
    <article className="card stack">
      <div className="row spread">
        <h4 className="mono">PO {po.po_number}</h4>
        <div className="row">
          <span className="badge">{longDate(po.date)}</span>
          {po.revision ? <span className="badge">Rev {po.revision}</span> : null}
          {mismatch ? <span className="badge badge--warn">Totals differ</span> : null}
        </div>
      </div>

      <dl className="dl">
        <dt>Supplier</dt>
        <dd>
          {po.supplier.name}
          {po.supplier.id ? ` (#${po.supplier.id})` : ''}
          {po.supplier.address ? `, ${po.supplier.address}` : ''}
        </dd>
        <dt>Buyer</dt>
        <dd>
          {po.buyer ?? '-'}
          {po.buyer_phone ? `, ${po.buyer_phone}` : ''}
        </dd>
        <dt>Payment terms</dt>
        <dd>{po.payment_terms ?? '-'}</dd>
        <dt>Currency</dt>
        <dd>{po.currency ?? '-'}</dd>
        <dt>Ship to</dt>
        <dd>{po.ship_to ?? '-'}</dd>
      </dl>

      <div className="table-scroll">
        <table className="data">
          <caption className="visually-hidden">Line items for purchase order {po.po_number}</caption>
          <thead>
            <tr>
              <th scope="col">Line</th>
              <th scope="col">Description</th>
              <th scope="col" className="n">
                Qty
              </th>
              <th scope="col">UOM</th>
              <th scope="col" className="n">
                Unit price
              </th>
              <th scope="col" className="n">
                Extended amount
              </th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((line) => (
              <tr key={line.line}>
                <td className="mono">{line.line}</td>
                <td>{line.description}</td>
                <td className="n">{num(line.quantity)}</td>
                <td>{line.uom ?? '-'}</td>
                <td className="n">{money(line.unit_price)}</td>
                <td className="n">{money(line.extended_amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>Subtotal</td>
              <td className="n">{money(po.computed_total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {notes.length > 0 ? (
        <div className="stack stack--sm">
          <span className="field__label">Notes</span>
          <ul className="note">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="row spread">
        <span>
          Printed total: <strong className="mono">{money(po.printed_total)}</strong>
        </span>
        <span>
          Computed total: <strong className="mono">{money(po.computed_total)}</strong>
        </span>
      </div>

      <div className="row">
        <a className="btn btn--sm" href={assetUrl('docs/' + po.pdf)} target="_blank" rel="noreferrer noopener">
          Open PDF
        </a>
        <a
          className="btn btn--ghost btn--sm"
          href={assetUrl('docs/text/' + po.text)}
          target="_blank"
          rel="noreferrer noopener"
        >
          View extracted text
        </a>
      </div>
    </article>
  );
}
