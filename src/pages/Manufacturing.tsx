import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

interface Product {
  id: string;
  name: string;
  unit: string;
  cost_price: number;
  stock_qty: number;
}

interface BomLine {
  id: string;
  component_id: string;
  qty_required: number;
  unit: string;
  cost_price: number;
  component?: { name: string; unit: string; cost_price: number };
}

interface Bom {
  id: string;
  finished_product_id: string;
  output_qty: number;
  unit: string;
  active: boolean;
  notes: string;
  bom_lines: BomLine[];
  finished?: { name: string; unit: string };
}

interface ProductionOrder {
  id: string;
  po_number: string;
  bom_id: string;
  qty_to_produce: number;
  status: string;
  date: string;
  total_cost: number;
  notes: string;
  bom?: Bom;
}

const UNITS = ['Pcs', 'Kg', 'L', 'M', 'Box', 'Pack', 'Set', 'Unit'];

export default function Manufacturing() {
  const [tab, setTab] = useState<'bom' | 'orders'>('bom');
  const [products, setProducts] = useState<Product[]>([]);
  const [boms, setBoms] = useState<Bom[]>([]);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // BOM form state
  const [showBomForm, setShowBomForm] = useState(false);
  const [editingBom, setEditingBom] = useState<Bom | null>(null);
  const [bomForm, setBomForm] = useState({
    finished_product_id: '',
    output_qty: '1',
    unit: 'Pcs',
    active: true,
    notes: '',
  });
  const [bomLines, setBomLines] = useState([
    { component_id: '', qty_required: '1', unit: 'Pcs', cost_price: '0' },
  ]);
  const [savingBom, setSavingBom] = useState(false);

  // Production order form state
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [orderForm, setOrderForm] = useState({
    bom_id: '',
    qty_to_produce: '1',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [savingOrder, setSavingOrder] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const [prodRes, bomRes, orderRes] = await Promise.all([
      supabase
        .from('products')
        .select('id, name, unit, cost_price, stock_qty')
        .eq('user_id', user.id)
        .order('name'),
      supabase
        .from('bom')
        .select(
          '*, finished:finished_product_id(name, unit), bom_lines(*, component:component_id(name, unit, cost_price))'
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('production_orders')
        .select('*, bom(*, finished:finished_product_id(name))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
    ]);
    setProducts(prodRes.data || []);
    setBoms(bomRes.data || []);
    setOrders(orderRes.data || []);
    setLoading(false);
  }

  // ---------- BOM helpers ----------
  function openAddBom() {
    setEditingBom(null);
    setBomForm({ finished_product_id: '', output_qty: '1', unit: 'Pcs', active: true, notes: '' });
    setBomLines([{ component_id: '', qty_required: '1', unit: 'Pcs', cost_price: '0' }]);
    setShowBomForm(true);
  }

  function openEditBom(b: Bom) {
    setEditingBom(b);
    setBomForm({
      finished_product_id: b.finished_product_id,
      output_qty: String(b.output_qty),
      unit: b.unit || 'Pcs',
      active: b.active,
      notes: b.notes || '',
    });
    setBomLines(
      (b.bom_lines || []).map((l) => ({
        component_id: l.component_id,
        qty_required: String(l.qty_required),
        unit: l.unit || 'Pcs',
        cost_price: String(l.cost_price ?? 0),
      }))
    );
    setShowBomForm(true);
  }

  function addBomLine() {
    setBomLines([...bomLines, { component_id: '', qty_required: '1', unit: 'Pcs', cost_price: '0' }]);
  }

  function removeBomLine(idx: number) {
    setBomLines(bomLines.filter((_, i) => i !== idx));
  }

  function updateBomLine(
    idx: number,
    patch: Partial<{ component_id: string; qty_required: string; unit: string; cost_price: string }>
  ) {
    setBomLines(bomLines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function selectBomLineMaterial(idx: number, productId: string) {
    const p = products.find((pr) => pr.id === productId);
    updateBomLine(idx, {
      component_id: productId,
      unit: p?.unit || 'Pcs',
      cost_price: String(p?.cost_price ?? 0),
    });
  }

  const lineCost = (l: { qty_required: string; cost_price: string }) =>
    (parseFloat(l.qty_required) || 0) * (parseFloat(l.cost_price) || 0);

  const bomFormCost = bomLines.reduce((sum, l) => sum + lineCost(l), 0);

  function bomTotalCost(b: Bom) {
    return (b.bom_lines || []).reduce((sum, l) => sum + l.qty_required * (l.cost_price || 0), 0);
  }

  async function handleSaveBom() {
    if (!bomForm.finished_product_id) return alert('Select a finished product');
    if (!bomForm.output_qty || parseFloat(bomForm.output_qty) <= 0)
      return alert('Quantity produced must be greater than zero');
    const validLines = bomLines.filter((l) => l.component_id);
    if (validLines.length === 0) return alert('Add at least one material line');

    setSavingBom(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSavingBom(false);
      return;
    }

    const payload = {
      finished_product_id: bomForm.finished_product_id,
      output_qty: parseFloat(bomForm.output_qty) || 1,
      unit: bomForm.unit,
      active: bomForm.active,
      notes: bomForm.notes,
    };

    let bomId = editingBom?.id;
    if (editingBom) {
      await supabase.from('bom').update(payload).eq('id', editingBom.id);
      await supabase.from('bom_lines').delete().eq('bom_id', editingBom.id);
    } else {
      const { data, error } = await supabase
        .from('bom')
        .insert({ ...payload, user_id: user.id })
        .select()
        .single();
      if (error || !data) {
        setSavingBom(false);
        return alert('Failed to save BOM');
      }
      bomId = data.id;
    }

    await supabase.from('bom_lines').insert(
      validLines.map((l) => ({
        bom_id: bomId,
        component_id: l.component_id,
        qty_required: parseFloat(l.qty_required) || 0,
        unit: l.unit,
        cost_price: parseFloat(l.cost_price) || 0,
      }))
    );

    setSavingBom(false);
    setShowBomForm(false);
    loadAll();
  }

  async function handleDeleteBom(b: Bom) {
    if (!confirm(`Delete BOM for "${b.finished?.name || 'this product'}"?`)) return;
    await supabase.from('bom_lines').delete().eq('bom_id', b.id);
    await supabase.from('bom').delete().eq('id', b.id);
    loadAll();
  }

  // ---------- Production order helpers ----------
  function generatePoNumber() {
    if (orders.length === 0) return 'PRD-0001';
    const nums = orders.map((o) => {
      const m = o.po_number?.match(/(\d+)$/);
      return m ? parseInt(m[1]) : 0;
    });
    return 'PRD-' + String(Math.max(0, ...nums) + 1).padStart(4, '0');
  }

  function openAddOrder() {
    setOrderForm({
      bom_id: '',
      qty_to_produce: '1',
      date: new Date().toISOString().slice(0, 10),
      notes: '',
    });
    setShowOrderForm(true);
  }

  async function handleSaveOrder() {
    if (!orderForm.bom_id) return alert('Select a Bill of Materials');
    if (!orderForm.qty_to_produce || parseFloat(orderForm.qty_to_produce) <= 0)
      return alert('Quantity must be greater than zero');

    setSavingOrder(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSavingOrder(false);
      return;
    }

    const bom = boms.find((b) => b.id === orderForm.bom_id);
    const qty = parseFloat(orderForm.qty_to_produce) || 0;
    const batches = bom ? qty / (bom.output_qty || 1) : 0;
    const totalCost = bom
      ? (bom.bom_lines || []).reduce((sum, l) => sum + l.qty_required * batches * (l.cost_price || 0), 0)
      : 0;

    await supabase.from('production_orders').insert({
      user_id: user.id,
      po_number: generatePoNumber(),
      bom_id: orderForm.bom_id,
      qty_to_produce: qty,
      status: 'Planned',
      date: orderForm.date,
      total_cost: totalCost,
      notes: orderForm.notes,
    });

    setSavingOrder(false);
    setShowOrderForm(false);
    loadAll();
  }

  async function updateOrderStatus(order: ProductionOrder, newStatus: string) {
    if (newStatus === 'Completed') {
      if (
        !confirm(
          `Complete order ${order.po_number}? This will deduct raw materials and add finished goods to stock.`
        )
      )
        return;
      const bom = order.bom;
      if (!bom) return alert('BOM not found for this order');
      const batches = order.qty_to_produce / (bom.output_qty || 1);

      for (const line of bom.bom_lines || []) {
        const product = products.find((p) => p.id === line.component_id);
        if (!product) continue;
        const used = line.qty_required * batches;
        await supabase
          .from('products')
          .update({ stock_qty: (product.stock_qty || 0) - used })
          .eq('id', product.id);
      }

      const finishedProduct = products.find((p) => p.id === bom.finished_product_id);
      if (finishedProduct) {
        await supabase
          .from('products')
          .update({ stock_qty: (finishedProduct.stock_qty || 0) + order.qty_to_produce })
          .eq('id', finishedProduct.id);
      }

      await supabase.from('production_orders').update({ status: 'Completed' }).eq('id', order.id);
    } else if (newStatus === 'Cancelled') {
      if (!confirm(`Cancel order ${order.po_number}?`)) return;
      await supabase.from('production_orders').update({ status: 'Cancelled' }).eq('id', order.id);
    } else {
      await supabase.from('production_orders').update({ status: newStatus }).eq('id', order.id);
    }
    loadAll();
  }

  const fmt = (n: number) =>
    'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      Planned: 'badge-blue',
      'In Progress': 'badge-yellow',
      Completed: 'badge-green',
      Cancelled: 'badge-red',
    };
    return <span className={`badge ${map[status] || 'badge-blue'}`}>{status}</span>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Manufacturing</div>
          <div className="page-sub">Bills of Materials and Production Orders</div>
        </div>
        {tab === 'bom' ? (
          <button
            className="btn btn-primary"
            onClick={() => (showBomForm ? setShowBomForm(false) : openAddBom())}
          >
            {showBomForm ? 'Close' : '+ New BOM'}
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={() => (showOrderForm ? setShowOrderForm(false) : openAddOrder())}
          >
            {showOrderForm ? 'Close' : '+ New Production Order'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button
          onClick={() => {
            setTab('bom');
            setShowOrderForm(false);
          }}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
            background: tab === 'bom' ? 'var(--brand)' : 'var(--bg2)',
            color: tab === 'bom' ? '#fff' : 'var(--text2)',
            border: tab === 'bom' ? 'none' : '1px solid var(--border)',
            transition: 'all 0.15s',
          }}
        >
          Bill of Materials
        </button>
        <button
          onClick={() => {
            setTab('orders');
            setShowBomForm(false);
          }}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
            background: tab === 'orders' ? 'var(--brand)' : 'var(--bg2)',
            color: tab === 'orders' ? '#fff' : 'var(--text2)',
            border: tab === 'orders' ? 'none' : '1px solid var(--border)',
            transition: 'all 0.15s',
          }}
        >
          Production Orders
        </button>
      </div>

      {tab === 'bom' && (
        <>
          {showBomForm && (
            <div className="inline-panel">
              <div className="inline-panel-header">
                <div className="inline-panel-title">
                  {editingBom ? 'Edit Bill of Materials' : 'New Bill of Materials'}
                </div>
                <button className="modal-close" onClick={() => setShowBomForm(false)}>
                  ×
                </button>
              </div>
              <div className="inline-panel-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label>Finished Product *</label>
                    <select
                      value={bomForm.finished_product_id}
                      onChange={(e) => {
                        const p = products.find((pr) => pr.id === e.target.value);
                        setBomForm({
                          ...bomForm,
                          finished_product_id: e.target.value,
                          unit: p?.unit || bomForm.unit,
                        });
                      }}
                    >
                      <option value="">— Select Product —</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Quantity Produced *</label>
                    <input
                      type="number"
                      value={bomForm.output_qty}
                      onChange={(e) => setBomForm({ ...bomForm, output_qty: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Unit</label>
                    <select
                      value={bomForm.unit}
                      onChange={(e) => setBomForm({ ...bomForm, unit: e.target.value })}
                    >
                      {UNITS.map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={bomForm.active ? 'active' : 'inactive'}
                      onChange={(e) => setBomForm({ ...bomForm, active: e.target.value === 'active' })}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="form-group full">
                    <label>Notes</label>
                    <textarea
                      value={bomForm.notes}
                      onChange={(e) => setBomForm({ ...bomForm, notes: e.target.value })}
                      rows={2}
                      placeholder="Optional notes"
                    />
                  </div>
                </div>

                <div style={{ marginTop: '20px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '10px',
                    }}
                  >
                    <h3 style={{ fontSize: '14px', margin: 0 }}>Material Lines</h3>
                    <button className="btn btn-secondary btn-sm" onClick={addBomLine}>
                      + Add Material
                    </button>
                  </div>
                  {bomLines.map((line, idx) => (
                    <div
                      key={idx}
                      style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '10px' }}
                    >
                      <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                        <label>Material</label>
                        <select
                          value={line.component_id}
                          onChange={(e) => selectBomLineMaterial(idx, e.target.value)}
                        >
                          <option value="">— Select Material —</option>
                          {products
                            .filter((p) => p.id !== bomForm.finished_product_id)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                        <label>Quantity</label>
                        <input
                          type="number"
                          value={line.qty_required}
                          onChange={(e) => updateBomLine(idx, { qty_required: e.target.value })}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                        <label>Unit</label>
                        <select value={line.unit} onChange={(e) => updateBomLine(idx, { unit: e.target.value })}>
                          {UNITS.map((u) => (
                            <option key={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                        <label>Cost Price (LKR)</label>
                        <input
                          type="number"
                          value={line.cost_price}
                          onChange={(e) => updateBomLine(idx, { cost_price: e.target.value })}
                        />
                      </div>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => removeBomLine(idx)}
                        disabled={bomLines.length === 1}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div style={{ textAlign: 'right', fontWeight: 700, marginTop: '10px' }}>
                    Total Material Cost: {fmt(bomFormCost)}
                  </div>
                </div>
              </div>
              <div className="inline-panel-footer">
                <button className="btn btn-secondary" onClick={() => setShowBomForm(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSaveBom} disabled={savingBom}>
                  {savingBom ? 'Saving...' : editingBom ? 'Save Changes' : 'Create BOM'}
                </button>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <div className="table-toolbar">
              <h3>All Bills of Materials</h3>
            </div>
            {loading ? (
              <div className="empty-state">
                <p>Loading...</p>
              </div>
            ) : boms.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🏗️</div>
                <h3>No BOMs yet</h3>
                <p>Create a bill of materials to define how products are manufactured</p>
                <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={openAddBom}>
                  + New BOM
                </button>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Finished Product</th>
                    <th>Quantity Produced</th>
                    <th>Materials</th>
                    <th>Material Cost</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {boms.map((b) => (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600 }}>{b.finished?.name || '—'}</td>
                      <td>
                        {b.output_qty} {b.unit}
                      </td>
                      <td>{(b.bom_lines || []).length}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(bomTotalCost(b))}</td>
                      <td>
                        <span className={`badge ${b.active ? 'badge-green' : 'badge-red'}`}>
                          {b.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEditBom(b)}>
                            Edit
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteBom(b)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'orders' && (
        <>
          {showOrderForm && (
            <div className="inline-panel">
              <div className="inline-panel-header">
                <div className="inline-panel-title">New Production Order</div>
                <button className="modal-close" onClick={() => setShowOrderForm(false)}>
                  ×
                </button>
              </div>
              <div className="inline-panel-body">
                <div className="form-grid">
                  <div className="form-group full">
                    <label>Bill of Materials *</label>
                    <select
                      value={orderForm.bom_id}
                      onChange={(e) => setOrderForm({ ...orderForm, bom_id: e.target.value })}
                    >
                      <option value="">— Select BOM —</option>
                      {boms
                        .filter((b) => b.active)
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.finished?.name} (makes {b.output_qty} {b.unit})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Quantity to Produce *</label>
                    <input
                      type="number"
                      value={orderForm.qty_to_produce}
                      onChange={(e) => setOrderForm({ ...orderForm, qty_to_produce: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Planned Date</label>
                    <input
                      type="date"
                      value={orderForm.date}
                      onChange={(e) => setOrderForm({ ...orderForm, date: e.target.value })}
                    />
                  </div>
                  <div className="form-group full">
                    <label>Notes</label>
                    <textarea
                      value={orderForm.notes}
                      onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })}
                      rows={2}
                      placeholder="Optional notes"
                    />
                  </div>
                </div>
              </div>
              <div className="inline-panel-footer">
                <button className="btn btn-secondary" onClick={() => setShowOrderForm(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSaveOrder} disabled={savingOrder}>
                  {savingOrder ? 'Creating...' : 'Create Order'}
                </button>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <div className="table-toolbar">
              <h3>All Production Orders</h3>
            </div>
            {loading ? (
              <div className="empty-state">
                <p>Loading...</p>
              </div>
            ) : orders.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">⚙️</div>
                <h3>No production orders yet</h3>
                <p>Create a production order to start manufacturing</p>
                <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={openAddOrder}>
                  + New Production Order
                </button>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Product</th>
                    <th>Quantity</th>
                    <th>Planned Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 600 }}>{o.po_number}</td>
                      <td>{o.bom?.finished?.name || '—'}</td>
                      <td>
                        {o.qty_to_produce} {o.bom?.unit}
                      </td>
                      <td style={{ color: 'var(--text2)' }}>{o.date}</td>
                      <td>{statusBadge(o.status)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {o.status === 'Planned' && (
                            <>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => updateOrderStatus(o, 'In Progress')}
                              >
                                Start
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => updateOrderStatus(o, 'Cancelled')}
                              >
                                Cancel
                              </button>
                            </>
                          )}
                          {o.status === 'In Progress' && (
                            <>
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => updateOrderStatus(o, 'Completed')}
                              >
                                Complete
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => updateOrderStatus(o, 'Cancelled')}
                              >
                                Cancel
                              </button>
                            </>
                          )}
                          {(o.status === 'Completed' || o.status === 'Cancelled') && (
                            <span style={{ color: 'var(--text3)', fontSize: '12px' }}>—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
