import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

interface Movement {
  date: string;
  source: 'Purchasing' | 'Sales' | 'Manufacturing';
  reference: string;
  product: string;
  direction: 'IN' | 'OUT';
  qty: number;
  unit: string;
}

const SOURCE_BADGE: Record<string, string> = {
  Purchasing: 'badge-blue',
  Sales: 'badge-green',
  Manufacturing: 'badge-purple',
};

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const colors = ['#7c3aed','#2563eb','#059669','#d97706','#dc2626','#0891b2'];
  const bg = colors[(name?.charCodeAt(0) || 0) % colors.length];
  const initials = name?.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() || '?';
  return <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: size * 0.38, fontWeight: 700, flexShrink: 0 }}>{initials}</div>;
}

function BackBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', fontWeight: 600, fontSize: 14, padding: '0 0 20px' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
      {label}
    </button>
  );
}

const fmt = (n: number) => 'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB') : '—';

export default function Inventory() {
  const [products, setProducts] = useState<any[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'stock' | 'movements'>('stock');

  const [stockSearch, setStockSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low'>('all');

  const [moveSearch, setMoveSearch] = useState('');
  const [moveSource, setMoveSource] = useState('');

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const [prodRes, grnHRes, invHRes, poRes] = await Promise.all([
      supabase.from('products').select('*').eq('user_id', user.id).order('name'),
      supabase
        .from('grn_headers')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['Received', 'Partial']),
      supabase.from('invoices').select('id,invoice_number,date').eq('user_id', user.id),
      supabase
        .from('production_orders')
        .select(
          '*, bom(*, finished:finished_product_id(name, unit), bom_lines(*, component:component_id(name, unit)))'
        )
        .eq('user_id', user.id)
        .eq('status', 'Completed'),
    ]);

    const productList = prodRes.data || [];
    const grnHeaders = grnHRes.data || [];
    const invoices = invHRes.data || [];
    const productionOrders = poRes.data || [];
    setProducts(productList);

    const [grnLRes, invLRes] = await Promise.all([
      grnHeaders.length
        ? supabase
            .from('grn_lines')
            .select('*')
            .in(
              'grn_id',
              grnHeaders.map((g) => g.id)
            )
        : Promise.resolve({ data: [] as any[] }),
      invoices.length
        ? supabase
            .from('invoice_lines')
            .select('*')
            .in(
              'invoice_id',
              invoices.map((i) => i.id)
            )
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const grnLines = grnLRes.data || [];
    const invoiceLines = invLRes.data || [];

    const productUnit = (id: string) => productList.find((p) => p.id === id)?.unit || '';

    const grnMovements: Movement[] = grnLines
      .filter((l: any) => (l.received_qty || 0) > 0)
      .map((l: any) => {
        const header = grnHeaders.find((g) => g.id === l.grn_id);
        return {
          date: header?.date || '',
          source: 'Purchasing',
          reference: header?.grn_number || '—',
          product: l.product_name,
          direction: 'IN',
          qty: l.received_qty,
          unit: productUnit(l.product_id),
        };
      });

    const salesMovements: Movement[] = invoiceLines.map((l: any) => {
      const header = invoices.find((i) => i.id === l.invoice_id);
      return {
        date: header?.date || '',
        source: 'Sales',
        reference: header?.invoice_number || '—',
        product: l.product_name,
        direction: 'OUT',
        qty: l.qty,
        unit: productUnit(l.product_id),
      };
    });

    const mfgMovements: Movement[] = productionOrders.flatMap((o: any) => {
      const bom = o.bom;
      if (!bom) return [];
      const batches = o.qty_to_produce / (bom.output_qty || 1);
      const rows: Movement[] = (bom.bom_lines || []).map((l: any) => ({
        date: o.date,
        source: 'Manufacturing',
        reference: o.po_number,
        product: l.component?.name || '—',
        direction: 'OUT',
        qty: l.qty_required * batches,
        unit: l.component?.unit || '',
      }));
      rows.push({
        date: o.date,
        source: 'Manufacturing',
        reference: o.po_number,
        product: bom.finished?.name || '—',
        direction: 'IN',
        qty: o.qty_to_produce,
        unit: bom.finished?.unit || '',
      });
      return rows;
    });

    setMovements(
      [...grnMovements, ...salesMovements, ...mfgMovements].sort((a, b) =>
        a.date < b.date ? 1 : a.date > b.date ? -1 : 0
      )
    );
    setLoading(false);
  }

  const lowStock = products.filter((p) => p.type !== 'Service' && p.stock_qty <= p.reorder_level);
  const stockValue = products.reduce((s, p) => s + (p.stock_qty || 0) * (p.cost_price || 0), 0);

  const filteredProducts = products.filter((p) => {
    const matchSearch =
      (p.name || '').toLowerCase().includes(stockSearch.toLowerCase()) ||
      (p.category || '').toLowerCase().includes(stockSearch.toLowerCase());
    const matchFilter = stockFilter === 'all' || (p.type !== 'Service' && p.stock_qty <= p.reorder_level);
    return matchSearch && matchFilter;
  });

  const filteredMovements = movements.filter((m) => {
    const matchSearch =
      (m.product || '').toLowerCase().includes(moveSearch.toLowerCase()) ||
      (m.reference || '').toLowerCase().includes(moveSearch.toLowerCase());
    const matchSource = !moveSource || m.source === moveSource;
    return matchSearch && matchSource;
  });

  // ── DETAIL VIEW ──
  if (view === 'detail' && selected) {
    const p = selected;
    const isLow = p.type !== 'Service' && p.stock_qty <= p.reorder_level;
    const stockVal = (p.stock_qty || 0) * (p.cost_price || 0);
    const productMovements = movements.filter(m => m.product === p.name);

    return (
      <div>
        <BackBtn label="Back to Inventory" onClick={() => { setView('list'); setSelected(null); }} />

        {/* Hero card */}
        <div className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 24, padding: '24px 28px' }}>
          <Avatar name={p.name} size={56} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text1)', marginBottom: 4 }}>{p.name}</div>
            {p.product_code && <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 8 }}>{p.product_code}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {p.category && (
                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: '#ede9fe', color: '#7c3aed' }}>{p.category}</span>
              )}
              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: '#f0f9ff', color: '#0891b2' }}>{p.type}</span>
              {p.unit && <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#f3f4f6', color: 'var(--text2)' }}>{p.unit}</span>}
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Current Stock', value: `${p.stock_qty || 0} ${p.unit || ''}`.trim(), color: '#2563eb' },
            { label: 'Reorder Level', value: `${p.reorder_level || 0} ${p.unit || ''}`.trim(), color: '#d97706' },
            { label: 'Stock Value', value: fmt(stockVal), color: '#059669' },
            { label: 'Status', value: p.type === 'Service' ? 'Service' : isLow ? 'Low Stock' : 'OK', color: p.type === 'Service' ? '#0891b2' : isLow ? '#dc2626' : '#059669' },
          ].map(k => (
            <div key={k.label} style={{ background: '#fff', border: '1px solid #ede9f7', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Notes */}
        {p.notes && (
          <div className="card" style={{ marginBottom: 24, padding: '16px 20px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Notes</div>
            <div style={{ fontSize: 14, color: 'var(--text1)', lineHeight: 1.6 }}>{p.notes}</div>
          </div>
        )}

        {/* Movement history */}
        <div className="table-wrap">
          <div className="table-toolbar">
            <h3>Movement History</h3>
          </div>
          {productMovements.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📜</div>
              <h3>No movements recorded yet</h3>
              <p>Stock movements will appear here once GRNs, invoices, or production orders involve this product.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Source</th>
                  <th>Reference</th>
                  <th>Direction</th>
                  <th>Quantity</th>
                </tr>
              </thead>
              <tbody>
                {productMovements.map((m, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--text2)' }}>{fmtDate(m.date)}</td>
                    <td>
                      <span className={`badge ${SOURCE_BADGE[m.source]}`}>{m.source}</span>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--brand)' }}>{m.reference}</td>
                    <td>
                      <span className={`badge ${m.direction === 'IN' ? 'badge-green' : 'badge-red'}`}>
                        {m.direction === 'IN' ? '⬇ IN' : '⬆ OUT'}
                      </span>
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {m.qty} {m.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // ── LIST VIEW ──
  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Inventory</div>
          <div className="page-sub">Stock levels and a unified movement ledger across Purchasing, Sales and Manufacturing</div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card" style={{ '--kpi-color': '#4f35c8' } as any}>
          <div className="kpi-label">Tracked Products</div>
          <div className="kpi-value">{products.length}</div>
        </div>
        <div className="kpi-card" style={{ '--kpi-color': '#f79009' } as any}>
          <div className="kpi-label">Low Stock Items</div>
          <div className="kpi-value">{lowStock.length}</div>
        </div>
        <div className="kpi-card" style={{ '--kpi-color': '#12b76a' } as any}>
          <div className="kpi-label">Stock Value (at cost)</div>
          <div className="kpi-value">{fmt(stockValue)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button
          onClick={() => setTab('stock')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
            background: tab === 'stock' ? 'var(--brand)' : 'var(--bg2)',
            color: tab === 'stock' ? '#fff' : 'var(--text2)',
            border: tab === 'stock' ? 'none' : '1px solid var(--border)',
            transition: 'all 0.15s',
          }}
        >
          Stock Levels
        </button>
        <button
          onClick={() => setTab('movements')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
            background: tab === 'movements' ? 'var(--brand)' : 'var(--bg2)',
            color: tab === 'movements' ? '#fff' : 'var(--text2)',
            border: tab === 'movements' ? 'none' : '1px solid var(--border)',
            transition: 'all 0.15s',
          }}
        >
          Movement Ledger
        </button>
      </div>

      {tab === 'stock' && (
        <div className="table-wrap">
          <div className="table-toolbar">
            <h3>Stock by Product</h3>
            <div className="table-actions">
              <div className="search-wrap">
                <span className="search-icon">🔍</span>
                <input
                  placeholder="Search product or category..."
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                />
              </div>
              <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value as any)}>
                <option value="all">All Items</option>
                <option value="low">Low Stock Only</option>
              </select>
            </div>
          </div>
          {loading ? (
            <div className="empty-state">
              <p>Loading...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📦</div>
              <h3>No products found</h3>
              <p>Try adjusting your search or filter</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th>Unit</th>
                  <th>In Stock</th>
                  <th>Reorder Level</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p) => {
                  const low = p.type !== 'Service' && p.stock_qty <= p.reorder_level;
                  return (
                    <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => { setSelected(p); setView('detail'); }}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td style={{ color: 'var(--text2)' }}>{p.category || '—'}</td>
                      <td style={{ color: 'var(--text2)' }}>{p.type}</td>
                      <td style={{ color: 'var(--text2)' }}>{p.unit}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{p.stock_qty}</td>
                      <td style={{ color: 'var(--text2)' }}>{p.reorder_level}</td>
                      <td>
                        {p.type === 'Service' ? (
                          <span className="badge badge-blue">Service</span>
                        ) : low ? (
                          <span className="badge badge-red">Low Stock</span>
                        ) : (
                          <span className="badge badge-green">OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'movements' && (
        <div className="table-wrap">
          <div className="table-toolbar">
            <h3>Stock Movement Ledger</h3>
            <div className="table-actions">
              <div className="search-wrap">
                <span className="search-icon">🔍</span>
                <input
                  placeholder="Search product or reference..."
                  value={moveSearch}
                  onChange={(e) => setMoveSearch(e.target.value)}
                />
              </div>
              <select value={moveSource} onChange={(e) => setMoveSource(e.target.value)}>
                <option value="">All Sources</option>
                <option value="Purchasing">Purchasing</option>
                <option value="Sales">Sales</option>
                <option value="Manufacturing">Manufacturing</option>
              </select>
            </div>
          </div>
          {loading ? (
            <div className="empty-state">
              <p>Loading...</p>
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📜</div>
              <h3>No stock movements yet</h3>
              <p>Movements appear here once GRNs are received, invoices are issued, or production orders are completed</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Source</th>
                  <th>Reference</th>
                  <th>Product</th>
                  <th>Movement</th>
                  <th>Quantity</th>
                </tr>
              </thead>
              <tbody>
                {filteredMovements.map((m, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--text2)' }}>{m.date}</td>
                    <td>
                      <span className={`badge ${SOURCE_BADGE[m.source]}`}>{m.source}</span>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--brand)' }}>{m.reference}</td>
                    <td>{m.product}</td>
                    <td>
                      <span className={`badge ${m.direction === 'IN' ? 'badge-green' : 'badge-red'}`}>
                        {m.direction === 'IN' ? '⬇ IN' : '⬆ OUT'}
                      </span>
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {m.qty} {m.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
