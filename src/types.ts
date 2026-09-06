// Shapes of the published JSON datasets. Mirrors the data contracts exactly.

export interface OrgCount {
  org: string;
  searches: number;
}

export interface Summary {
  total_searches: number;
  distinct_orgs: number;
  first_search: string;
  last_search: string;
  months: number;
  avg_networks_searched: number;
  duplicate_rows: number;
  top_orgs: OrgCount[];
  per_year: { year: number; searches: number }[];
  generated: string;
}

export interface Monthly {
  months: string[];
  searches: number[];
  distinct_orgs: number[];
}

export interface Agency {
  org: string;
  searches: number;
  first: string;
  last: string;
  months_active: number;
}

export interface Agencies {
  agencies: Agency[];
}

export interface AgencyMonthly {
  months: string[];
  series: Record<string, number[]>;
}

export interface SearchTypes {
  types: { type: string; count: number }[];
}

export interface Heatmap {
  tz: string;
  note: string;
  /** grid[0] = Monday .. grid[6] = Sunday; each row is 24 local hours. */
  grid: number[][];
}

export interface PoLine {
  line: string;
  description: string;
  quantity: number | null;
  uom: string | null;
  unit_price: number | null;
  extended_amount: number | null;
  due_date: string | null;
}

export interface PurchaseOrder {
  po_number: string;
  pdf: string;
  text: string;
  date: string | null;
  revision: string | null;
  supplier: { id: string | null; name: string; address: string | null };
  buyer: string | null;
  buyer_phone: string | null;
  payment_terms: string | null;
  currency: string | null;
  ship_to: string | null;
  lines: PoLine[];
  notes: string | null;
  printed_total: number | null;
  computed_total: number | null;
}

export interface Invoices {
  purchase_orders: PurchaseOrder[];
}

export interface DocRecord {
  file: string;
  text: string;
  title: string;
  type: 'agreement' | 'purchase_order';
  pages: number | null;
  date: string | null;
  parties: string[];
  summary: string | null;
  size_bytes: number | null;
}

export interface Documents {
  documents: DocRecord[];
}

/** One community-mapped ALPR camera from the OpenStreetMap extract. */
export interface Camera {
  osm_id: number;
  osm_type: string;
  lat: number;
  lon: number;
  operator: string | null;
  brand: string | null;
  model: string | null;
  direction: number | null;
  directions: number[] | null;
  zone: string | null;
  mount: string | null;
  ref: string | null;
  start_date: string | null;
  osm_timestamp: string | null;
  km_from_city_center: number;
  in_city_bbox: boolean;
}

export interface LatLonBox {
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
}

export interface Cameras {
  /** Provenance only. Every field is displayed as given, never computed from. */
  source?: {
    name?: string | null;
    repo?: string | null;
    commit?: string | null;
    commit_date?: string | null;
    license?: string | null;
    us_total?: number | null;
  };
  bbox: LatLonBox;
  city_bbox: LatLonBox;
  city_center: { lat: number; lon: number };
  count: number;
  /** Sorted by distance from the city center, nearest first. */
  cameras: Camera[];
}

/** One offense category tallied in the portal's rolling search audit. */
export interface OffenseCount {
  offenseType: string;
  count: number;
}

export interface AccessSearchAudit {
  /** Always ['id', 'searchDate', 'networkCount', 'offenseType']. */
  columns: string[];
  rows: [string, string, number, string][];
  note: string;
}

/**
 * Snapshot of Flock Safety's own public transparency portal for Santa Clara
 * PD. Rolling ~30-day window, not part of the records release.
 */
export interface Access {
  source: { url: string; api: string; fetched: string; method: string };
  /** The portal's own wording, reproduced as published. */
  last_updated: string;
  overview: string;
  retention_days: number;
  total_cameras: number;
  stats_30d: {
    vehicles_detected: number;
    searches: number;
    hotlist_hits: number;
  };
  hotlists: string[];
  detected: string[];
  not_detected: string[];
  /** Verbatim policy text blocks. */
  policies: {
    acceptable_use: string;
    prohibited_uses: string;
    access_policy: string;
    hotlist_policy: string;
  };
  access_org_count: number;
  orgs_with_access: string[];
  search_audit: AccessSearchAudit;
  /** Sorted by count, descending. */
  offense_type_summary: OffenseCount[];
}

export interface ParquetFile {
  name: string;
  rows: number;
  min: string;
  max: string;
  bytes: number;
}

export interface ParquetManifest {
  total_rows: number;
  columns: string[];
  files: ParquetFile[];
}
