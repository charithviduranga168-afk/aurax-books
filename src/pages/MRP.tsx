import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

interface OpenPO {
  id: string;
  po_number: string;
  bom_id: string;
  finished_product_name: string;
  qty_to_produce: number;
  status: string;
}

interface Requirement {
  component_id: string;
  component_name: string;
  unit: string;
  gross: number;
  stock: number;
  net: number;
  po_numbers: string[];
}

interface ReorderAlert {
  id: string;
  name: string;
  unit: string;
  stock_qty: number;
  reorder_level: number;
  deficit: number;
}

interface Suggestion {
  product_id: string;
  product_name: string;
  qty: number;
  unit: string;
  reasons: string[];
}

function fmt(n: number, decimals = 2) {
  return (n || 0).toLocaleString('en-LK', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function MRP() {
  const [tab, setTab] = useState(0);
  const [openPOs, setOpenPOs] = useState<OpenPO[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [reorderAlerts, setReorderAlerts] = useState<ReorderAlert[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [calculated, setCalculated] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);

  useEffect(() => { loadInitial(); }, []);

  async function loadInitial() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [{ data: pos }, { data: prods }] = await Promise.all([
      supabase.from('production_orders')
        .select('id,po_number,bom_id,finished_product_name,qty_to_produce,status')
        .eq('user_id', user.id)
        .neq('status', 'completed')
        .neq('status', 'cancelled')
        .order('date', { ascending: false }),
      supabase.from('products')
        .select('id,name,unit,stock_qty,reorder_level')
        .eq('user_id', user.id)
        .gt('reorder_level', 0),
    ]);

    setOpenPOs(pos || []);

    const alerts: ReorderAlert[] = (prods || [])
      .filter(p => (p.stock_qty || 0) <= (p.reorder_level || 0))
      .map(p => ({
        id: p.id,
        name: p.name,
        unit: p.unit || '',
        stock_qty: p.stock_qty || 0,
        reorder_level: p.reorder_level || 0,
        deficit: (p.reorder_level || 0) - (p.stock_qty || 0),
      }))
      .sort((a, b) => b.deficit - a.deficit);

    setReorderAlerts(alerts);
    setLoading(false);
  }

  async function runMRP() {
    setCalculating(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setCalculating(false); return; }

    // Re-fetch open production orders
    const { data: pos } = await supabase.from('production_orders')
      .select('id,po_number,bom_id,finished_product_name,qty_to_produce,status')
      .eq('user_id', user.id)
      .neq('status', 'completed')
      .neq('status', 'cancelled');

    const activePOs = pos || [];
    setOpenPOs(activePOs);

    if (activePOs.length === 0) {
      setRequirements([]);
      setCalculated(true);
      setLastRun(new Date().toLocaleTimeString());
      buildSuggestions([], reorderAlerts);
      setCalculating(false);
      return;
    }

    const bomIds = [...new Set(activePOs.map(po => po.bom_id).filter(Boolean))];

    const [{ data: bomHeaders }, { data: bomLines }] = await Promise.all([
      supabase.from('bom_headers').select('id,quantity_produced').in('id', bomIds),
      supabase.from('bom_lines').select('bom_id,component_id,component_name,qty_required,unit').in('bom_id', bomIds),
    ]);

    // Stock lookup
    const componentIds = [...new Set((bomLines || []).map(l => l.component_id).filter(Boolean))];
    let stockMap: Record<string, number> = {};

    if (componentIds.length > 0) {
      const { data: stockProds } = await supabase
        .from('products')
        .select('id,stock_qty')
        .in('id', componentIds);
      (stockProds || []).forEach(p => { stockMap[p.id] = p.stock_qty || 0; });
    }

    const bomQtyMap: Record<string, number> = {};
    (bomHeaders || []).forEach(h => { bomQtyMap[h.id] = h.quantity_produced || 1; });

    // BOM explosion
    const reqMap: Record<string, Requirement> = {};

    activePOs.forEach(po => {
      if (!po.bom_id) return;
      const qtyProduced = bomQtyMap[po.bom_id] || 1;
      const multiplier = (po.qty_to_produce || 1) / qtyProduced;

      const lines = (bomLines || []).filter(l => l.bom_id === po.bom_id);
      lines.forEach(line => {
        const key = line.component_id || line.component_name;
        if (!reqMap[key]) {
          reqMap[key] = {
            component_id: line.component_id || '',
            component_name: line.component_name,
            unit: line.unit || '',
            gross: 0,
            stock: stockMap[line.component_id] ?? 0,
            net: 0,
            po_numbers: [],
          };
        }
        reqMap[key].gross += (line.qty_required || 0) * multiplier;
        if (!reqMap[key].po_numbers.includes(po.po_number)) {
          reqMap[key].po_numbers.push(po.po_number);
        }
      });
    });

    const reqs: Requirement[] = Object.values(reqMap).map(r => ({
      ...r,
      gross: Math.round(r.gross * 100) / 100,
      net: Math.max(0, Math.round((r.gross - r.stock) * 100) / 100),
    })).sort((a, b) => b.net - a.net);

    setRequirements(reqs);
    setCalculated(true);
    setLastRun(new Date().toLocaleTimeString());
    buildSuggestions(reqs, reorderAlerts);
    setCalculating(false);
  }

  function buildSuggestions(reqs: Requirement[], alerts: ReorderAlert[]) {
    const map: Record<string, Suggestion> = {};

    // From production requirements
    reqs.filter(r => r.net > 0).forEach(r => {
      const key = r.component_id || r.component_name;
      if (!map[key]) map[key] = { product_id: r.component_id, product_name: r.component_name, qty: 0, unit: r.unit, reasons: [] };
      map[key].qty = Math.max(map[key].qty, r.net);
      map[key].reasons.push('Production shortage');
    });

    // From reorder alerts
    alerts.forEach(a => {
      if (!map[a.id]) map[a.id] = { product_id: a.id, product_name: a.name, qty: 0, unit: a.unit, reasons: [] };
      map[a.id].qty = Math.max(map[a.id].qty, a.deficit);
      if (!map[a.id].reasons.includes('Below reorder level')) map[a.id].reasons.push('Below reorder level');
    });

    setSuggestions(Object.values(map).sort((a, b) => b.qty - a.qty));
  }

  const shortages = requirements.filter(r => r.net > 0).length;
  const sufficient = requirements.filter(r => r.net === 0).length;

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">MRP — Material Requirements Planning</div>
          <div className="page-sub">
            {openPOs.length} open production order{openPOs.length !== 1 ? 's' : ''} · {reorderAlerts.length} reorder alert{reorderAlerts.length !== 1 ? 's' : ''}
          </div>
        </div>
        <button className="btn btn-primary" onClick={runMRP} disabled={calculating}>
          {calculating ? '⏳ Calculating...' : '▶ Run MRP'}
        </button>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Open Production Orders', value: openPOs.length, color: '#7c3aed', icon: '🏭' },
          { label: 'Material Shortages', value: calculated ? shortages : '—', color: shortages > 0 ? '#dc2626' : '#16a34a', icon: '⚠️' },
          { label: 'Components Sufficient', value: calculated ? sufficient : '—', color: '#16a34a', icon: '✅' },
          { label: 'Reorder Alerts', value: reorderAlerts.length, color: reorderAlerts.length > 0 ? '#d97706' : '#16a34a', icon: '📦' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '20px 24px' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Last run note */}
      {lastRun && (
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
          Last calculated at {lastRun} — click Run MRP to refresh
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 24 }}>
        {[
          { label: `Production Requirements${calculated ? ` (${requirements.length})` : ''}`, icon: '🔩' },
          { label: `Reorder Alerts (${reorderAlerts.length})`, icon: '🔔' },
          { label: `Purchase Suggestions${calculated ? ` (${suggestions.length})` : ''}`, icon: '🛒' },
        ].map((t, i) => (
          <button key={t.label} onClick={() => setTab(i)}
            style={{ padding: '10px 22px', background: 'none', border: 'none', borderBottom: tab === i ? '2px solid var(--blue)' : '2px solid transparent', marginBottom: -2, color: tab === i ? 'var(--blue)' : 'var(--text2)', fontWeight: tab === i ? 700 : 500, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab 0: Production Requirements ── */}
      {tab === 0 && (
        <div>
          {!calculated ? (
            <div className="empty-state">
              <div className="empty-state-icon">🏭</div>
              <h3>Run MRP to see requirements</h3>
              <p>Click "Run MRP" above to explode your BOMs and calculate material requirements from {openPOs.length} open production order{openPOs.length !== 1 ? 's' : ''}.</p>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={runMRP} disabled={calculating || openPOs.length === 0}>
                {openPOs.length === 0 ? 'No open production orders' : '▶ Run MRP Now'}
              </button>
            </div>
          ) : requirements.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">✅</div>
              <h3>No material requirements found</h3>
              <p>No open production orders have BOMs with components, or all production orders are completed.</p>
            </div>
          ) : (
            <>
              {/* Open production orders used */}
              <div className="card" style={{ padding: '14px 20px', marginBottom: 20, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Orders in calculation:</span>
                {openPOs.map(po => (
                  <span key={po.id} style={{ background: '#ede9fe', color: '#7c3aed', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                    {po.po_number} — {po.finished_product_name} × {po.qty_to_produce}
                  </span>
                ))}
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Component / Material</th>
                      <th style={{ textAlign: 'right' }}>Gross Required</th>
                      <th style={{ textAlign: 'right' }}>In Stock</th>
                      <th style={{ textAlign: 'right' }}>Net Need</th>
                      <th>Unit</th>
                      <th>Needed For</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requirements.map((r, idx) => (
                      <tr key={r.component_id || idx} style={{ background: r.net > 0 ? '#fff5f5' : undefined }}>
                        <td style={{ fontWeight: 600 }}>{r.component_name}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.gross)}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.stock < r.gross ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{fmt(r.stock)}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: r.net > 0 ? '#dc2626' : '#16a34a', fontSize: 15 }}>
                          {r.net > 0 ? fmt(r.net) : '—'}
                        </td>
                        <td style={{ color: 'var(--text2)', fontSize: 13 }}>{r.unit || '—'}</td>
                        <td style={{ fontSize: 12 }}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {r.po_numbers.map(n => (
                              <span key={n} style={{ background: '#f3f4f6', borderRadius: 4, padding: '2px 6px', fontSize: 11 }}>{n}</span>
                            ))}
                          </div>
                        </td>
                        <td>
                          {r.net > 0 ? (
                            <span style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                              ⚠ Shortage
                            </span>
                          ) : (
                            <span style={{ background: '#dcfce7', color: '#16a34a', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                              ✓ OK
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tab 1: Reorder Alerts ── */}
      {tab === 1 && (
        <div>
          {reorderAlerts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">✅</div>
              <h3>All stock levels are healthy</h3>
              <p>No products are currently at or below their reorder level. Set reorder levels in the Products module to track low stock.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <div style={{ padding: '12px 20px', background: '#fffbeb', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16 }}>⚠️</span>
                <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>
                  {reorderAlerts.length} product{reorderAlerts.length !== 1 ? 's' : ''} at or below reorder level — order soon to avoid stockouts
                </span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th style={{ textAlign: 'right' }}>Current Stock</th>
                    <th style={{ textAlign: 'right' }}>Reorder Level</th>
                    <th style={{ textAlign: 'right' }}>Deficit</th>
                    <th>Unit</th>
                    <th>Urgency</th>
                  </tr>
                </thead>
                <tbody>
                  {reorderAlerts.map(a => {
                    const pct = a.reorder_level > 0 ? (a.stock_qty / a.reorder_level) * 100 : 0;
                    const urgency = a.stock_qty <= 0 ? 'critical' : pct < 50 ? 'high' : 'medium';
                    const urgencyStyle = {
                      critical: { bg: '#fee2e2', color: '#dc2626', label: '🔴 Critical' },
                      high:     { bg: '#fef3c7', color: '#d97706', label: '🟠 High' },
                      medium:   { bg: '#fef9c3', color: '#a16207', label: '🟡 Medium' },
                    }[urgency];
                    return (
                      <tr key={a.id} style={{ background: urgency === 'critical' ? '#fff5f5' : undefined }}>
                        <td style={{ fontWeight: 600 }}>{a.name}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: a.stock_qty <= 0 ? '#dc2626' : '#d97706', fontVariantNumeric: 'tabular-nums' }}>
                          {fmt(a.stock_qty)}
                        </td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text2)' }}>{fmt(a.reorder_level)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{fmt(a.deficit)}</td>
                        <td style={{ color: 'var(--text2)', fontSize: 13 }}>{a.unit || '—'}</td>
                        <td>
                          <span style={{ background: urgencyStyle.bg, color: urgencyStyle.color, borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                            {urgencyStyle.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab 2: Purchase Suggestions ── */}
      {tab === 2 && (
        <div>
          {!calculated && reorderAlerts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🛒</div>
              <h3>Run MRP to generate suggestions</h3>
              <p>Purchase suggestions combine production shortages and reorder alerts into a single recommended order list.</p>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={runMRP} disabled={calculating}>
                ▶ Run MRP Now
              </button>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">✅</div>
              <h3>No purchases needed</h3>
              <p>All materials are sufficiently stocked and no reorder alerts are active.</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 14, color: 'var(--text2)' }}>
                  {suggestions.length} item{suggestions.length !== 1 ? 's' : ''} recommended for purchase
                </div>
                <button className="btn btn-secondary" onClick={() => {
                  const lines = ['Product,Qty to Order,Unit,Reason'];
                  suggestions.forEach(s => lines.push(`"${s.product_name}",${s.qty},"${s.unit}","${s.reasons.join(' + ')}"`));
                  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = 'mrp-suggestions.csv'; a.click();
                  URL.revokeObjectURL(url);
                }}>
                  ↓ Export CSV
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product / Material</th>
                      <th style={{ textAlign: 'right' }}>Suggested Order Qty</th>
                      <th>Unit</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggestions.map((s, idx) => (
                      <tr key={s.product_id || idx}>
                        <td style={{ fontWeight: 600 }}>{s.product_name}</td>
                        <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 15, fontVariantNumeric: 'tabular-nums', color: '#7c3aed' }}>{fmt(s.qty)}</td>
                        <td style={{ color: 'var(--text2)', fontSize: 13 }}>{s.unit || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {s.reasons.map(r => (
                              <span key={r} style={{ background: r === 'Production shortage' ? '#fee2e2' : '#fef3c7', color: r === 'Production shortage' ? '#dc2626' : '#d97706', borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 700 }}>
                                {r === 'Production shortage' ? '🏭' : '📦'} {r}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 16, padding: '14px 18px', background: '#f8f7ff', border: '1px solid #ede9fe', borderRadius: 10, fontSize: 13, color: 'var(--text2)' }}>
                Go to <strong>Purchasing → Purchase Orders</strong> to create orders for these items. Export the CSV above as a reference.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
