import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { HardHat, Settings2, Package } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  unit: string;
  cost_price: number;
  stock_qty: number;
  type: string;
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
  const [tab, setTab] = useState<'bom' | 'orders' | 'movements'>('bom');
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

  // Custom in-app dialog (replaces native confirm()/alert())
  const [dialog, setDialog] = useState<{ message: string; onConfirm?: () => void } | null>(null);

  function showAlert(message: string) {
    setDialog({ message });
  }

  function showConfirm(message: string, onConfirm: () => void) {
    setDialog({ message, onConfirm });
  }

  // Strips leading minus signs so quantity/price fields can never go negative
  const noNegative = (v: string) => v.replace(/^-+/, '');

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
        .select('id, name, unit, cost_price, stock_qty, type')
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

  // Uses each component's live Cost Price (kept current by the costing engine)
  // so BOM cost reflects today's stock valuation, falling back to the stored
  // line cost for components whose product record can't be resolved
  function bomTotalCost(b: Bom) {
    return (b.bom_lines || []).reduce(
      (sum, l) => sum + l.qty_required * (l.component?.cost_price ?? l.cost_price ?? 0),
      0
    );
  }

  async function handleSaveBom() {
    if (!bomForm.finished_product_id) {
      showAlert('Select a finished product');
      return;
    }
    if (!bomForm.output_qty || parseFloat(bomForm.output_qty) <= 0) {
      showAlert('Quantity produced must be greater than zero');
      return;
    }
    const validLines = bomLines.filter((l) => l.component_id);
    if (validLines.length === 0) {
      showAlert('Add at least one material line');
      return;
    }

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
        showAlert('Failed to save BOM');
        return;
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

  function handleDeleteBom(b: Bom) {
    showConfirm(`Delete BOM for "${b.finished?.name || 'this product'}"?`, async () => {
      await supabase.from('bom_lines').delete().eq('bom_id', b.id);
      await supabase.from('bom').delete().eq('id', b.id);
      loadAll();
    });
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
    if (!orderForm.bom_id) {
      showAlert('Select a Bill of Materials');
      return;
    }
    if (!orderForm.qty_to_produce || parseFloat(orderForm.qty_to_produce) <= 0) {
      showAlert('Quantity must be greater than zero');
      return;
    }

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
      ? (bom.bom_lines || []).reduce(
          (sum, l) => sum + l.qty_required * batches * (l.component?.cost_price ?? l.cost_price ?? 0),
          0
        )
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
      const bom = order.bom;
      if (!bom) {
        showAlert('BOM not found for this order');
        return;
      }
      showConfirm(
        `Complete order ${order.po_number}? This will deduct raw materials and add finished goods to stock.`,
        async () => {
          const batches = order.qty_to_produce / (bom.output_qty || 1);
          let consumedCost = 0;

          for (const line of bom.bom_lines || []) {
            const product = products.find((p) => p.id === line.component_id);
            if (!product) continue;
            const used = line.qty_required * batches;
            consumedCost += used * (product.cost_price || 0);
            await supabase
              .from('products')
              .update({ stock_qty: (product.stock_qty || 0) - used })
              .eq('id', product.id);
          }

          // Cost Price of the finished good is rolled forward as a weighted average,
          // using the actual cost of the components consumed to make this batch
          const finishedProduct = products.find((p) => p.id === bom.finished_product_id);
          if (finishedProduct) {
            const oldQty = finishedProduct.stock_qty || 0;
            const oldCost = finishedProduct.cost_price || 0;
            const producedQty = order.qty_to_produce;
            const batchUnitCost = producedQty > 0 ? consumedCost / producedQty : 0;
            const newQty = oldQty + producedQty;
            const newCost = newQty > 0 ? (oldQty * oldCost + producedQty * batchUnitCost) / newQty : oldCost;
            await supabase
              .from('products')
              .update({ stock_qty: newQty, cost_price: newCost })
              .eq('id', finishedProduct.id);
          }

          await supabase.from('production_orders').update({ status: 'Completed' }).eq('id', order.id);
          loadAll();
        }
      );
      return;
    }
    if (newStatus === 'Cancelled') {
      showConfirm(`Cancel order ${order.po_number}?`, async () => {
        await supabase.from('production_orders').update({ status: 'Cancelled' }).eq('id', order.id);
        loadAll();
      });
      return;
    }
    await supabase.from('production_orders').update({ status: newStatus }).eq('id', order.id);
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

  // Derived stock-movement ledger from completed production orders
  const movements = orders
    .filter((o) => o.status === 'Completed' && o.bom)
    .flatMap((o) => {
      const bom = o.bom as Bom;
      const batches = o.qty_to_produce / (bom.output_qty || 1);
      const rows = (bom.bom_lines || []).map((l) => ({
        date: o.date,
        po: o.po_number,
        product: l.component?.name || '—',
        direction: 'OUT' as const,
        qty: l.qty_required * batches,
        unit: l.unit,
      }));
      rows.push({
        date: o.date,
        po: o.po_number,
        product: bom.finished?.name || '—',
        direction: 'IN' as const,
        qty: o.qty_to_produce,
        unit: bom.unit,
      });
      return rows;
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Manufacturing</div>
          <div className="page-sub">Bills of Materials and Production Orders</div>
        </div>
        {tab === 'bom' && (
          <button
            className="btn btn-primary"
            onClick={() => (showBomForm ? setShowBomForm(false) : openAddBom())}
          >
            {showBomForm ? 'Close' : '+ New BOM'}
          </button>
        )}
        {tab === 'orders' && (
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
        <button
          onClick={() => {
            setTab('movements');
            setShowBomForm(false);
            setShowOrderForm(false);
          }}
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
          Inventory Movements
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
                      {products
                        .filter((p) => p.type === 'Finished Good')
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                    <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>
                      Only products categorized as "Finished Good" can have a BOM.
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Quantity Produced *</label>
                    <input
                      type="number"
                      min="0"
                      value={bomForm.output_qty}
                      onChange={(e) => setBomForm({ ...bomForm, output_qty: noNegative(e.target.value) })}
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
                          min="0"
                          value={line.qty_required}
                          onChange={(e) => updateBomLine(idx, { qty_required: noNegative(e.target.value) })}
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
                          min="0"
                          value={line.cost_price}
                          onChange={(e) => updateBomLine(idx, { cost_price: noNegative(e.target.value) })}
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
                <div className="empty-state-icon"><HardHat size={32} color="#7c3aed" /></div>
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
                      min="0"
                      value={orderForm.qty_to_produce}
                      onChange={(e) =>
                        setOrderForm({ ...orderForm, qty_to_produce: noNegative(e.target.value) })
                      }
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
                <div className="empty-state-icon"><Settings2 size={32} color="#7c3aed" /></div>
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

      {tab === 'movements' && (
        <div className="table-wrap">
          <div className="table-toolbar">
            <h3>Inventory Movements</h3>
            <div className="page-sub" style={{ margin: 0 }}>
              Stock changes from completed production orders
            </div>
          </div>
          {loading ? (
            <div className="empty-state">
              <p>Loading...</p>
            </div>
          ) : movements.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><Package size={32} color="#7c3aed" /></div>
              <h3>No stock movements yet</h3>
              <p>Movements appear here once production orders are completed</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Order #</th>
                  <th>Product</th>
                  <th>Movement</th>
                  <th>Quantity</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m, idx) => (
                  <tr key={idx}>
                    <td style={{ color: 'var(--text2)' }}>{m.date}</td>
                    <td style={{ fontWeight: 600 }}>{m.po}</td>
                    <td>{m.product}</td>
                    <td>
                      <span className={`badge ${m.direction === 'IN' ? 'badge-green' : 'badge-red'}`}>
                        {m.direction === 'IN' ? 'Stock In' : 'Stock Out'}
                      </span>
                    </td>
                    <td
                      style={{
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 600,
                        color: m.direction === 'IN' ? 'var(--green)' : 'var(--red)',
                      }}
                    >
                      {m.direction === 'IN' ? '+' : '-'}
                      {m.qty} {m.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {dialog && (
        <div className="modal-overlay" onClick={() => setDialog(null)}>
          <div className="modal" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{dialog.onConfirm ? 'Confirm' : 'Notice'}</div>
              <button className="modal-close" onClick={() => setDialog(null)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, color: 'var(--text2)', lineHeight: 1.6 }}>{dialog.message}</p>
            </div>
            <div className="modal-footer">
              {dialog.onConfirm ? (
                <>
                  <button className="btn btn-secondary" onClick={() => setDialog(null)}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      const action = dialog.onConfirm;
                      setDialog(null);
                      action?.();
                    }}
                  >
                    Confirm
                  </button>
                </>
              ) : (
                <button className="btn btn-primary" onClick={() => setDialog(null)}>
                  OK
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
