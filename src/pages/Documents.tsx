// Documents: one card per released document, with the original PDF and a
// lazily-loaded view of the text extracted from it.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Section } from '../components/Section';
import { Resolve } from '../components/DataState';
import { PATHS, useJson, useText, assetUrl } from '../lib/data';
import { longDate, bytes } from '../lib/format';
import type { Documents as DocumentsData, DocRecord } from '../types';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function Documents() {
  const state = useJson<DocumentsData>(PATHS.documents);

  return (
    <Section
      kicker="Released documents"
      title="Documents"
      intro="Every document released in response to this records request, with the original PDF and the text extracted from it."
    >
      <Resolve state={state} label="released documents">
        {(data) => (
          <div className="stack">
            {data.documents.map((doc) => (
              <DocumentCard key={doc.file} doc={doc} />
            ))}
          </div>
        )}
      </Resolve>
    </Section>
  );
}

function DocumentCard({ doc }: { doc: DocRecord }) {
  const [open, setOpen] = useState(false);
  const text = useText(open ? 'docs/text/' + doc.text : null);
  const textId = `doctext-${slugify(doc.file)}`;
  const typeLabel = doc.type === 'agreement' ? 'Agreement' : 'Purchase order';

  return (
    <article className="card stack">
      <div className="row spread">
        <h3>{doc.title}</h3>
        <span className="badge">{typeLabel}</span>
      </div>

      <dl className="dl">
        <dt>Date</dt>
        <dd>{longDate(doc.date)}</dd>
        <dt>Pages</dt>
        <dd>{doc.pages ?? '-'}</dd>
        <dt>Parties</dt>
        <dd>{doc.parties.join(', ')}</dd>
        <dt>File size</dt>
        <dd>{bytes(doc.size_bytes)}</dd>
        <dt>File</dt>
        <dd className="mono">{doc.file}</dd>
      </dl>

      {doc.summary ? (
        <div className="prose">
          <p>{doc.summary}</p>
        </div>
      ) : null}

      {doc.type === 'purchase_order' ? (
        <p className="note">
          See the full line items for this purchase order on the <Link to="/spending">Spending page</Link>.
        </p>
      ) : null}

      <div className="row">
        <a className="btn" href={assetUrl('docs/' + doc.file)} target="_blank" rel="noreferrer noopener">
          Open PDF
        </a>
        <button
          type="button"
          className="btn btn--ghost"
          aria-expanded={open}
          aria-controls={textId}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Hide extracted text' : 'Show extracted text'}
        </button>
      </div>

      <div id={textId}>
        {open ? (
          <Resolve state={text} label="extracted text">
            {(data) => <div className="pre">{data}</div>}
          </Resolve>
        ) : null}
      </div>
    </article>
  );
}
