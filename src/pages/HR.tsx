import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import jsPDF from 'jspdf';

interface Employee {
  id: string; emp_number: string; first_name: string; last_name: string; nic: string;
  email: string; phone: string; department: string; designation: string;
  join_date: string; basic_salary: number; transport_allowance: number;
  meal_allowance: number; other_allowance: number; bank_name: string; bank_account: string; status: string;
}
interface PayrollRun {
  id: string; run_number: string; month: number; year: number; status: string;
  total_gross: number; total_net: number; total_epf_employee: number; total_epf_employer: number; total_etf: number; employee_count: number;
}
interface Payslip {
  id: string; payroll_run_id: string; employee_id: string; emp_number: string; employee_name: string;
  department: string; designation: string; month: number; year: number;
  basic_salary: number; transport_allowance: number; meal_allowance: number; other_allowance: number;
  gross_salary: number; epf_employee: number; epf_employer: number; etf: number; net_salary: number;
}
interface LeaveRequest {
  id: string; employee_id: string; employee_name: string; leave_type: string;
  from_date: string; to_date: string; days: number; reason: string; status: string;
}

const TABS = ['Employees', 'Payroll', 'Leaves'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const LEAVE_TYPES = ['Annual Leave', 'Sick Leave', 'Casual Leave', 'Maternity Leave', 'No Pay Leave'];
const DEPARTMENTS = ['Management', 'Finance', 'Sales', 'Operations', 'IT', 'HR', 'Marketing', 'Warehouse', 'Other'];

const now = new Date();

export default function HR() {
  const [activeTab, setActiveTab] = useState(0);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Employee form
  const blankEmp = { first_name: '', last_name: '', nic: '', email: '', phone: '', department: '', designation: '', join_date: new Date().toISOString().split('T')[0], basic_salary: '', transport_allowance: '0', meal_allowance: '0', other_allowance: '0', bank_name: '', bank_account: '', status: 'active' };
  const [showEmpForm, setShowEmpForm] = useState(false);
  const [empForm, setEmpForm] = useState<any>(blankEmp);
  const [editEmpId, setEditEmpId] = useState<string | null>(null);
  const [savingEmp, setSavingEmp] = useState(false);
  const [empSearch, setEmpSearch] = useState('');

  // Payroll
  const [payMonth, setPayMonth] = useState(now.getMonth() + 1);
  const [payYear, setPayYear] = useState(now.getFullYear());
  const [runningPayroll, setRunningPayroll] = useState(false);
  const [selectedRun, setSelectedRun] = useState<string>('');

  // Leaves
  const blankLeave = { employee_id: '', leave_type: 'Annual Leave', from_date: new Date().toISOString().split('T')[0], to_date: new Date().toISOString().split('T')[0], reason: '' };
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState<any>(blankLeave);
  const [savingLeave, setSavingLeave] = useState(false);

  const [dialog, setDialog] = useState<{ msg: string; type: 'alert' | 'confirm'; onOk?: () => void } | null>(null);
  const showAlert = (msg: string) => setDialog({ msg, type: 'alert' });
  const showConfirm = (msg: string, onOk: () => void) => setDialog({ msg, type: 'confirm', onOk });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [empRes, prRes, lRes] = await Promise.all([
      supabase.from('employees').select('*').eq('user_id', user.id).order('emp_number'),
      supabase.from('payroll_runs').select('*').eq('user_id', user.id).order('year', { ascending: false }).order('month', { ascending: false }),
      supabase.from('leave_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);
    setEmployees(empRes.data || []);
    setPayrollRuns(prRes.data || []);
    setLeaves(lRes.data || []);
    if (prRes.data?.length) setSelectedRun(prRes.data[0].id);
    setLoading(false);
  }

  async function loadPayslips(runId: string) {
    const { data } = await supabase.from('payslips').select('*').eq('payroll_run_id', runId).order('employee_name');
    setPayslips(data || []);
  }

  useEffect(() => { if (selectedRun) loadPayslips(selectedRun); }, [selectedRun]);

  function generateEmpNumber(existing: Employee[]) {
    if (!existing.length) return 'EMP-001';
    const max = Math.max(0, ...existing.map(e => { const m = e.emp_number?.match(/(\d+)$/); return m ? +m[1] : 0; }));
    return 'EMP-' + String(max + 1).padStart(3, '0');
  }

  async function saveEmployee() {
    if (!empForm.first_name.trim()) { showAlert('First name is required.'); return; }
    const basic = parseFloat(empForm.basic_salary);
    if (!basic || basic <= 0) { showAlert('Basic salary is required.'); return; }
    setSavingEmp(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingEmp(false); return; }
    const payload = {
      user_id: user.id,
      emp_number: editEmpId ? employees.find(e => e.id === editEmpId)?.emp_number : generateEmpNumber(employees),
      first_name: empForm.first_name.trim(), last_name: empForm.last_name.trim(),
      nic: empForm.nic.trim(), email: empForm.email.trim(), phone: empForm.phone.trim(),
      department: empForm.department, designation: empForm.designation.trim(),
      join_date: empForm.join_date, basic_salary: basic,
      transport_allowance: parseFloat(empForm.transport_allowance) || 0,
      meal_allowance: parseFloat(empForm.meal_allowance) || 0,
      other_allowance: parseFloat(empForm.other_allowance) || 0,
      bank_name: empForm.bank_name.trim(), bank_account: empForm.bank_account.trim(),
      status: empForm.status,
    };
    let error;
    if (editEmpId) {
      ({ error } = await supabase.from('employees').update(payload).eq('id', editEmpId));
    } else {
      ({ error } = await supabase.from('employees').insert(payload));
    }
    setSavingEmp(false);
    if (error) { showAlert('Failed to save: ' + error.message); return; }
    setShowEmpForm(false); setEditEmpId(null); setEmpForm(blankEmp);
    loadAll();
  }

  async function deleteEmployee(id: string) {
    showConfirm('Delete this employee? This will also remove their payslips and leave records.', async () => {
      await supabase.from('employees').delete().eq('id', id);
      loadAll();
    });
  }

  async function runPayroll() {
    const activeEmps = employees.filter(e => e.status === 'active');
    if (!activeEmps.length) { showAlert('No active employees to process payroll for.'); return; }
    const existing = payrollRuns.find(r => r.month === payMonth && r.year === payYear);
    if (existing) { showAlert(`Payroll for ${MONTHS[payMonth - 1]} ${payYear} already exists. Delete it first to re-run.`); return; }
    setRunningPayroll(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setRunningPayroll(false); return; }

    const slipData = activeEmps.map(emp => {
      const gross = emp.basic_salary + (emp.transport_allowance || 0) + (emp.meal_allowance || 0) + (emp.other_allowance || 0);
      const epfEmp = Math.round(gross * 0.08 * 100) / 100;
      const epfEmr = Math.round(gross * 0.12 * 100) / 100;
      const etf = Math.round(gross * 0.03 * 100) / 100;
      const net = Math.round((gross - epfEmp) * 100) / 100;
      return { emp, gross, epfEmp, epfEmr, etf, net };
    });

    const totals = slipData.reduce((acc, s) => ({
      gross: acc.gross + s.gross, net: acc.net + s.net,
      epfEmp: acc.epfEmp + s.epfEmp, epfEmr: acc.epfEmr + s.epfEmr, etf: acc.etf + s.etf,
    }), { gross: 0, net: 0, epfEmp: 0, epfEmr: 0, etf: 0 });

    const runNum = 'PAY-' + String(payYear).slice(2) + String(payMonth).padStart(2, '0');

    const { data: run, error } = await supabase.from('payroll_runs').insert({
      user_id: user.id, run_number: runNum, month: payMonth, year: payYear, status: 'completed',
      total_gross: totals.gross, total_net: totals.net, total_epf_employee: totals.epfEmp,
      total_epf_employer: totals.epfEmr, total_etf: totals.etf, employee_count: activeEmps.length,
    }).select().single();

    if (error || !run) { showAlert('Failed to create payroll run.'); setRunningPayroll(false); return; }

    const slipRows = slipData.map(s => ({
      user_id: user.id, payroll_run_id: run.id, employee_id: s.emp.id,
      emp_number: s.emp.emp_number, employee_name: `${s.emp.first_name} ${s.emp.last_name}`.trim(),
      department: s.emp.department, designation: s.emp.designation,
      month: payMonth, year: payYear, basic_salary: s.emp.basic_salary,
      transport_allowance: s.emp.transport_allowance || 0, meal_allowance: s.emp.meal_allowance || 0,
      other_allowance: s.emp.other_allowance || 0, gross_salary: s.gross,
      epf_employee: s.epfEmp, epf_employer: s.epfEmr, etf: s.etf, net_salary: s.net,
    }));

    await supabase.from('payslips').insert(slipRows);
    setRunningPayroll(false);
    await loadAll();
    setSelectedRun(run.id);
    showAlert(`Payroll for ${MONTHS[payMonth - 1]} ${payYear} processed successfully for ${activeEmps.length} employees.`);
  }

  async function deletePayrollRun(id: string) {
    showConfirm('Delete this payroll run and all its payslips?', async () => {
      await supabase.from('payslips').delete().eq('payroll_run_id', id);
      await supabase.from('payroll_runs').delete().eq('id', id);
      loadAll();
    });
  }

  async function saveLeave() {
    if (!leaveForm.employee_id) { showAlert('Select an employee.'); return; }
    if (!leaveForm.from_date || !leaveForm.to_date) { showAlert('Select leave dates.'); return; }
    const from = new Date(leaveForm.from_date), to = new Date(leaveForm.to_date);
    if (to < from) { showAlert('End date must be after start date.'); return; }
    const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
    setSavingLeave(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingLeave(false); return; }
    const emp = employees.find(e => e.id === leaveForm.employee_id);
    await supabase.from('leave_requests').insert({
      user_id: user.id, employee_id: leaveForm.employee_id,
      employee_name: emp ? `${emp.first_name} ${emp.last_name}`.trim() : '',
      leave_type: leaveForm.leave_type, from_date: leaveForm.from_date,
      to_date: leaveForm.to_date, days, reason: leaveForm.reason.trim(), status: 'pending',
    });
    setSavingLeave(false); setShowLeaveForm(false); setLeaveForm(blankLeave);
    loadAll();
  }

  async function updateLeaveStatus(id: string, status: string) {
    await supabase.from('leave_requests').update({ status }).eq('id', id);
    loadAll();
  }

  const fmt = (n: number) => 'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });

  function printPayslip(ps: Payslip, run: PayrollRun) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, ml = 15, mr = 195;
    const c = (hex: string) => { const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16); return [r,g,b] as [number,number,number]; };
    const fmtAmt = (n: number) => 'Rs. ' + (n||0).toLocaleString('en-LK',{minimumFractionDigits:2});

    // Header band
    doc.setFillColor(...c('#7c3aed'));
    doc.rect(0, 0, W, 32, 'F');
    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','bold');
    doc.setFontSize(20);
    doc.text('AURAX BOOKS', ml, 13);
    doc.setFontSize(9);
    doc.setFont('helvetica','normal');
    doc.text('Business Management Software', ml, 19);
    doc.setFontSize(16);
    doc.setFont('helvetica','bold');
    doc.text('SALARY PAYSLIP', mr, 13, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica','normal');
    doc.text(`${MONTHS[run.month - 1]} ${run.year}  ·  ${run.run_number}`, mr, 19, { align: 'right' });

    // Sub-header: generated date
    doc.setFillColor(...c('#ede9fe'));
    doc.rect(0, 32, W, 8, 'F');
    doc.setTextColor(...c('#5b21b6'));
    doc.setFontSize(8);
    doc.text(`Generated on ${new Date().toLocaleDateString('en-LK', { day:'2-digit', month:'long', year:'numeric' })}`, W/2, 37.5, { align: 'center' });

    let y = 48;

    // Employee info box
    doc.setDrawColor(...c('#e5e7eb'));
    doc.setFillColor(...c('#f9fafb'));
    doc.roundedRect(ml, y, mr-ml, 32, 3, 3, 'FD');

    doc.setTextColor(...c('#7c3aed'));
    doc.setFont('helvetica','bold');
    doc.setFontSize(8);
    doc.text('EMPLOYEE INFORMATION', ml+4, y+6);

    const empInfo = [
      ['Employee Name', ps.employee_name],
      ['Employee No.', ps.emp_number],
      ['Department', ps.department || '—'],
      ['Designation', ps.designation || '—'],
    ];
    const col1x = ml+4, col2x = ml+42, col3x = ml+95, col4x = ml+130;
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...c('#6b7280'));
    doc.text(empInfo[0][0], col1x, y+13); doc.text(empInfo[1][0], col3x, y+13);
    doc.text(empInfo[2][0], col1x, y+21); doc.text(empInfo[3][0], col3x, y+21);
    doc.setTextColor(...c('#111827'));
    doc.setFont('helvetica','bold');
    doc.text(empInfo[0][1], col2x, y+13); doc.text(empInfo[1][1], col4x, y+13);
    doc.text(empInfo[2][1], col2x, y+21); doc.text(empInfo[3][1], col4x, y+21);

    y += 38;

    // Two-column: Earnings | Deductions
    const colW = (mr - ml - 6) / 2;
    const col1 = ml, col2 = ml + colW + 6;

    // Earnings header
    doc.setFillColor(...c('#7c3aed'));
    doc.roundedRect(col1, y, colW, 7, 2, 2, 'F');
    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','bold');
    doc.setFontSize(8);
    doc.text('EARNINGS', col1 + colW/2, y+4.8, { align: 'center' });

    // Deductions header
    doc.setFillColor(...c('#dc2626'));
    doc.roundedRect(col2, y, colW, 7, 2, 2, 'F');
    doc.text('DEDUCTIONS', col2 + colW/2, y+4.8, { align: 'center' });

    y += 9;
    const rowH = 7;

    const earnings = [
      ['Basic Salary', ps.basic_salary],
      ['Transport Allowance', ps.transport_allowance || 0],
      ['Meal Allowance', ps.meal_allowance || 0],
      ['Other Allowance', ps.other_allowance || 0],
    ];
    const deductions = [
      ['EPF (Employee 8%)', ps.epf_employee],
    ];

    // Draw earning rows
    earnings.forEach((row, i) => {
      doc.setFillColor(i % 2 === 0 ? 255 : 250, i % 2 === 0 ? 255 : 247, i % 2 === 0 ? 255 : 255);
      doc.rect(col1, y + i*rowH, colW, rowH, 'F');
      doc.setDrawColor(...c('#e5e7eb'));
      doc.rect(col1, y + i*rowH, colW, rowH, 'D');
      doc.setTextColor(...c('#374151'));
      doc.setFont('helvetica','normal');
      doc.setFontSize(8.5);
      doc.text(row[0] as string, col1+3, y + i*rowH + 4.8);
      doc.setFont('helvetica','bold');
      doc.text(fmtAmt(row[1] as number), col1 + colW - 3, y + i*rowH + 4.8, { align: 'right' });
    });

    // Draw deduction rows
    deductions.forEach((row, i) => {
      doc.setFillColor(i % 2 === 0 ? 255 : 250, i % 2 === 0 ? 243 : 242, i % 2 === 0 ? 243 : 242);
      doc.rect(col2, y + i*rowH, colW, rowH, 'F');
      doc.setDrawColor(...c('#e5e7eb'));
      doc.rect(col2, y + i*rowH, colW, rowH, 'D');
      doc.setTextColor(...c('#374151'));
      doc.setFont('helvetica','normal');
      doc.setFontSize(8.5);
      doc.text(row[0] as string, col2+3, y + i*rowH + 4.8);
      doc.setFont('helvetica','bold');
      doc.setTextColor(...c('#dc2626'));
      doc.text('- ' + fmtAmt(row[1] as number), col2 + colW - 3, y + i*rowH + 4.8, { align: 'right' });
    });

    const maxRows = Math.max(earnings.length, deductions.length);
    y += maxRows * rowH + 2;

    // Subtotals row
    doc.setFillColor(...c('#ede9fe'));
    doc.rect(col1, y, colW, 8, 'F');
    doc.setTextColor(...c('#5b21b6'));
    doc.setFont('helvetica','bold');
    doc.setFontSize(8.5);
    doc.text('Gross Salary', col1+3, y+5.3);
    doc.text(fmtAmt(ps.gross_salary), col1+colW-3, y+5.3, { align: 'right' });

    doc.setFillColor(...c('#fee2e2'));
    doc.rect(col2, y, colW, 8, 'F');
    doc.setTextColor(...c('#991b1b'));
    doc.text('Total Deductions', col2+3, y+5.3);
    doc.text('- ' + fmtAmt(ps.epf_employee), col2+colW-3, y+5.3, { align: 'right' });

    y += 14;

    // Net Salary highlight box
    doc.setFillColor(...c('#7c3aed'));
    doc.roundedRect(ml, y, mr-ml, 18, 4, 4, 'F');
    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    doc.text('NET SALARY (TAKE HOME)', ml+6, y+6.5);
    doc.setFont('helvetica','bold');
    doc.setFontSize(16);
    doc.text(fmtAmt(ps.net_salary), mr-6, y+13, { align: 'right' });

    y += 24;

    // Employer contributions (info only)
    doc.setFillColor(...c('#fef3c7'));
    doc.setDrawColor(...c('#f59e0b'));
    doc.roundedRect(ml, y, mr-ml, 22, 3, 3, 'FD');
    doc.setTextColor(...c('#92400e'));
    doc.setFont('helvetica','bold');
    doc.setFontSize(8);
    doc.text('EMPLOYER CONTRIBUTIONS  (not deducted from your salary)', ml+4, y+6);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...c('#374151'));
    const empContr = [
      `EPF – Employer (12%):  ${fmtAmt(ps.epf_employer)}`,
      `ETF – Employer (3%):   ${fmtAmt(ps.etf)}`,
      `Total Employer Cost:   ${fmtAmt(ps.gross_salary + ps.epf_employer + ps.etf)}`,
    ];
    empContr.forEach((line, i) => doc.text(line, ml+4 + (i < 2 ? 0 : 0), y+12 + i*5));

    y += 30;

    // Divider
    doc.setDrawColor(...c('#e5e7eb'));
    doc.line(ml, y, mr, y);
    y += 6;

    // Signature area
    doc.setTextColor(...c('#6b7280'));
    doc.setFont('helvetica','normal');
    doc.setFontSize(8);
    doc.text('Authorized Signature', ml+20, y+18);
    doc.line(ml, y+20, ml+55, y+20);
    doc.text('Employee Signature', mr-55, y+18);
    doc.line(mr-55, y+20, mr, y+20);

    // Footer
    doc.setFillColor(...c('#f3f4f6'));
    doc.rect(0, 283, W, 14, 'F');
    doc.setTextColor(...c('#9ca3af'));
    doc.setFontSize(7.5);
    doc.text('This is a computer-generated payslip and does not require a physical signature.', W/2, 290, { align: 'center' });
    doc.text('AURAX BOOKS  ·  Confidential', W/2, 294, { align: 'center' });

    doc.save(`Payslip_${ps.emp_number}_${MONTHS[run.month-1]}_${run.year}.pdf`);
  }
  const tabStyle = (i: number): React.CSSProperties => ({
    padding: '8px 18px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
    fontWeight: activeTab === i ? 700 : 500, background: activeTab === i ? 'var(--brand)' : 'transparent',
    color: activeTab === i ? '#fff' : 'var(--text2)',
  });
  const sLabel: React.CSSProperties = { fontSize: '13px', fontWeight: 700, color: 'var(--brand)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' };

  const filteredEmps = employees.filter(e => !empSearch || `${e.first_name} ${e.last_name} ${e.emp_number} ${e.department} ${e.designation}`.toLowerCase().includes(empSearch.toLowerCase()));
  const activeCount = employees.filter(e => e.status === 'active').length;
  const selectedRunData = payrollRuns.find(r => r.id === selectedRun);

  const statusColor = (s: string) => s === 'approved' ? '#16a34a' : s === 'rejected' ? '#dc2626' : '#d97706';
  const statusBg   = (s: string) => s === 'approved' ? 'rgba(34,197,94,0.1)' : s === 'rejected' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)';

  if (loading) return <div className="empty-state"><p>Loading...</p></div>;

  return (
    <div>
      {dialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 380, padding: '28px 24px' }}>
            <p style={{ margin: '0 0 20px', fontSize: '14px', lineHeight: 1.6 }}>{dialog.msg}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {dialog.type === 'confirm' && <button className="btn btn-danger" onClick={() => { dialog.onOk?.(); setDialog(null); }}>Confirm</button>}
              <button className="btn btn-secondary" onClick={() => setDialog(null)}>{dialog.type === 'alert' ? 'OK' : 'Cancel'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <div className="page-title">HR & Payroll</div>
          <div className="page-sub">Manage employees, run monthly payroll, track leaves</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--bg2)', padding: 4, borderRadius: 8, width: 'fit-content' }}>
        {TABS.map((t, i) => <button key={t} style={tabStyle(i)} onClick={() => setActiveTab(i)}>{t}</button>)}
      </div>

      {/* ── EMPLOYEES ── */}
      {activeTab === 0 && (
        <div>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
            {[
              { label: 'Total Employees', value: employees.length, color: 'var(--brand)' },
              { label: 'Active', value: activeCount, color: '#16a34a' },
              { label: 'On Leave Today', value: leaves.filter(l => l.status === 'approved' && l.from_date <= new Date().toISOString().split('T')[0] && l.to_date >= new Date().toISOString().split('T')[0]).length, color: '#d97706' },
              { label: 'Monthly Salary Bill', value: fmt(employees.filter(e => e.status === 'active').reduce((s, e) => s + e.basic_salary + (e.transport_allowance || 0) + (e.meal_allowance || 0) + (e.other_allowance || 0), 0)), color: '#2563eb' },
            ].map(k => (
              <div key={k.label} className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Employee form */}
          {showEmpForm && (
            <div className="card" style={{ marginBottom: 24 }}>
              <div style={sLabel}>{editEmpId ? 'Edit Employee' : 'New Employee'}</div>
              <div className="form-grid">
                <div className="form-group"><label>First Name *</label><input value={empForm.first_name} onChange={e => setEmpForm({ ...empForm, first_name: e.target.value })} /></div>
                <div className="form-group"><label>Last Name</label><input value={empForm.last_name} onChange={e => setEmpForm({ ...empForm, last_name: e.target.value })} /></div>
                <div className="form-group"><label>NIC</label><input value={empForm.nic} onChange={e => setEmpForm({ ...empForm, nic: e.target.value })} placeholder="200012345678" /></div>
                <div className="form-group"><label>Email</label><input type="email" value={empForm.email} onChange={e => setEmpForm({ ...empForm, email: e.target.value })} /></div>
                <div className="form-group"><label>Phone</label><input value={empForm.phone} onChange={e => setEmpForm({ ...empForm, phone: e.target.value })} /></div>
                <div className="form-group"><label>Department</label>
                  <select value={empForm.department} onChange={e => setEmpForm({ ...empForm, department: e.target.value })}>
                    <option value="">— Select —</option>
                    {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Designation</label><input value={empForm.designation} onChange={e => setEmpForm({ ...empForm, designation: e.target.value })} placeholder="e.g. Software Engineer" /></div>
                <div className="form-group"><label>Join Date</label><input type="date" value={empForm.join_date} onChange={e => setEmpForm({ ...empForm, join_date: e.target.value })} /></div>
                <div className="form-group"><label>Basic Salary (Rs.) *</label><input type="number" min="0" value={empForm.basic_salary} onChange={e => setEmpForm({ ...empForm, basic_salary: e.target.value })} /></div>
                <div className="form-group"><label>Transport Allowance (Rs.)</label><input type="number" min="0" value={empForm.transport_allowance} onChange={e => setEmpForm({ ...empForm, transport_allowance: e.target.value })} /></div>
                <div className="form-group"><label>Meal Allowance (Rs.)</label><input type="number" min="0" value={empForm.meal_allowance} onChange={e => setEmpForm({ ...empForm, meal_allowance: e.target.value })} /></div>
                <div className="form-group"><label>Other Allowance (Rs.)</label><input type="number" min="0" value={empForm.other_allowance} onChange={e => setEmpForm({ ...empForm, other_allowance: e.target.value })} /></div>
                <div className="form-group"><label>Bank Name</label><input value={empForm.bank_name} onChange={e => setEmpForm({ ...empForm, bank_name: e.target.value })} /></div>
                <div className="form-group"><label>Bank Account No.</label><input value={empForm.bank_account} onChange={e => setEmpForm({ ...empForm, bank_account: e.target.value })} /></div>
                <div className="form-group"><label>Status</label>
                  <select value={empForm.status} onChange={e => setEmpForm({ ...empForm, status: e.target.value })}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={saveEmployee} disabled={savingEmp}>{savingEmp ? 'Saving...' : 'Save Employee'}</button>
                <button className="btn btn-secondary" onClick={() => { setShowEmpForm(false); setEditEmpId(null); setEmpForm(blankEmp); }}>Cancel</button>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <div className="table-toolbar">
              <h3>Employee Directory</h3>
              <div className="table-actions">
                <div className="search-wrap"><span className="search-icon">🔍</span><input placeholder="Search..." value={empSearch} onChange={e => setEmpSearch(e.target.value)} /></div>
                <button className="btn btn-primary" onClick={() => { setShowEmpForm(true); setEditEmpId(null); setEmpForm(blankEmp); }}>+ Add Employee</button>
              </div>
            </div>
            {filteredEmps.length === 0 ? (
              <div className="empty-state"><div className="empty-state-icon">👤</div><h3>No employees yet</h3><p>Add your first employee to get started</p></div>
            ) : (
              <table>
                <thead>
                  <tr><th>EMP #</th><th>Name</th><th>Department</th><th>Designation</th><th>Join Date</th><th style={{ textAlign: 'right' }}>Basic Salary</th><th style={{ textAlign: 'right' }}>Gross</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {filteredEmps.map(emp => {
                    const gross = emp.basic_salary + (emp.transport_allowance || 0) + (emp.meal_allowance || 0) + (emp.other_allowance || 0);
                    return (
                      <tr key={emp.id}>
                        <td style={{ fontWeight: 700, color: 'var(--brand)', fontSize: 13 }}>{emp.emp_number}</td>
                        <td style={{ fontWeight: 600 }}>{emp.first_name} {emp.last_name}</td>
                        <td style={{ color: 'var(--text2)', fontSize: 13 }}>{emp.department || '—'}</td>
                        <td style={{ color: 'var(--text2)', fontSize: 13 }}>{emp.designation || '—'}</td>
                        <td style={{ color: 'var(--text2)', fontSize: 13 }}>{emp.join_date || '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 500 }}>{fmt(emp.basic_salary)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--brand)' }}>{fmt(gross)}</td>
                        <td>
                          <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: emp.status === 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(100,100,100,0.1)', color: emp.status === 'active' ? '#16a34a' : 'var(--text3)' }}>
                            {emp.status}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => { setEditEmpId(emp.id); setEmpForm({ first_name: emp.first_name, last_name: emp.last_name, nic: emp.nic || '', email: emp.email || '', phone: emp.phone || '', department: emp.department || '', designation: emp.designation || '', join_date: emp.join_date || '', basic_salary: String(emp.basic_salary), transport_allowance: String(emp.transport_allowance || 0), meal_allowance: String(emp.meal_allowance || 0), other_allowance: String(emp.other_allowance || 0), bank_name: emp.bank_name || '', bank_account: emp.bank_account || '', status: emp.status }); setShowEmpForm(true); }}>Edit</button>
                            <button className="btn btn-danger btn-sm" onClick={() => deleteEmployee(emp.id)}>Del</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── PAYROLL ── */}
      {activeTab === 1 && (
        <div>
          {/* Run payroll card */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div style={sLabel}>Run Monthly Payroll</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <select value={payMonth} onChange={e => setPayMonth(+e.target.value)} style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 14, fontWeight: 600 }}>
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <input type="number" value={payYear} onChange={e => setPayYear(+e.target.value)} style={{ width: 90, height: 38, padding: '0 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 14, fontWeight: 600 }} />
              <button className="btn btn-primary" onClick={runPayroll} disabled={runningPayroll}>
                {runningPayroll ? 'Processing...' : `Run Payroll for ${MONTHS[payMonth - 1]} ${payYear}`}
              </button>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>{activeCount} active employees · EPF 8%+12%, ETF 3%</div>
            </div>
          </div>

          {/* Payroll history + payslips */}
          {payrollRuns.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">💰</div><h3>No payroll runs yet</h3><p>Run payroll above to generate monthly payslips</p></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
              {/* Run list */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>Payroll History</div>
                {payrollRuns.map(run => (
                  <div key={run.id} onClick={() => setSelectedRun(run.id)}
                    style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selectedRun === run.id ? 'rgba(124,58,237,0.08)' : 'var(--bg)', borderLeft: selectedRun === run.id ? '3px solid var(--brand)' : '3px solid transparent' }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{MONTHS[run.month - 1]} {run.year}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{run.employee_count} employees · {fmt(run.total_net)}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 10, background: 'rgba(34,197,94,0.1)', color: '#16a34a', fontWeight: 700 }}>{run.status}</span>
                      <button onClick={e => { e.stopPropagation(); deletePayrollRun(run.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 11 }}>Del</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Payslips panel */}
              <div>
                {selectedRunData && (
                  <>
                    {/* Totals */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 16 }}>
                      {[
                        { label: 'Gross Salary', value: fmt(selectedRunData.total_gross), color: 'var(--brand)' },
                        { label: 'EPF (Employee 8%)', value: fmt(selectedRunData.total_epf_employee), color: '#dc2626' },
                        { label: 'Net Salary', value: fmt(selectedRunData.total_net), color: '#16a34a' },
                        { label: 'EPF (Employer 12%)', value: fmt(selectedRunData.total_epf_employer), color: '#d97706' },
                        { label: 'ETF (Employer 3%)', value: fmt(selectedRunData.total_etf), color: '#7c3aed' },
                      ].map(k => (
                        <div key={k.label} className="card" style={{ textAlign: 'center', padding: '14px 10px' }}>
                          <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>{k.label}</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: k.color }}>{k.value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="table-wrap">
                      <div className="table-toolbar">
                        <h3>Payslips — {MONTHS[selectedRunData.month - 1]} {selectedRunData.year}</h3>
                        <button className="btn btn-secondary" onClick={() => payslips.forEach(ps => printPayslip(ps, selectedRunData))}>
                          🖨 Print All
                        </button>
                      </div>
                      <table>
                        <thead>
                          <tr><th>Emp #</th><th>Name</th><th>Department</th><th style={{ textAlign: 'right' }}>Basic</th><th style={{ textAlign: 'right' }}>Allowances</th><th style={{ textAlign: 'right' }}>Gross</th><th style={{ textAlign: 'right' }}>EPF (8%)</th><th style={{ textAlign: 'right' }}>Net Salary</th><th></th></tr>
                        </thead>
                        <tbody>
                          {payslips.map(ps => (
                            <tr key={ps.id}>
                              <td style={{ fontWeight: 700, color: 'var(--brand)', fontSize: 13 }}>{ps.emp_number}</td>
                              <td style={{ fontWeight: 600 }}>{ps.employee_name}</td>
                              <td style={{ color: 'var(--text2)', fontSize: 13 }}>{ps.department || '—'}</td>
                              <td style={{ textAlign: 'right', fontSize: 13 }}>{fmt(ps.basic_salary)}</td>
                              <td style={{ textAlign: 'right', fontSize: 13, color: 'var(--text2)' }}>{fmt((ps.transport_allowance || 0) + (ps.meal_allowance || 0) + (ps.other_allowance || 0))}</td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(ps.gross_salary)}</td>
                              <td style={{ textAlign: 'right', color: '#dc2626', fontSize: 13 }}>-{fmt(ps.epf_employee)}</td>
                              <td style={{ textAlign: 'right', fontWeight: 800, color: '#16a34a' }}>{fmt(ps.net_salary)}</td>
                              <td>
                                <button className="btn btn-secondary btn-sm" onClick={() => printPayslip(ps, selectedRunData)}>🖨 Print</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── LEAVES ── */}
      {activeTab === 2 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, flex: 1, marginRight: 20 }}>
              {[
                { label: 'Pending', value: leaves.filter(l => l.status === 'pending').length, color: '#d97706' },
                { label: 'Approved', value: leaves.filter(l => l.status === 'approved').length, color: '#16a34a' },
                { label: 'Rejected', value: leaves.filter(l => l.status === 'rejected').length, color: '#dc2626' },
              ].map(k => (
                <div key={k.label} className="card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={() => setShowLeaveForm(!showLeaveForm)}>{showLeaveForm ? 'Cancel' : '+ New Leave Request'}</button>
          </div>

          {showLeaveForm && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={sLabel}>New Leave Request</div>
              <div className="form-grid">
                <div className="form-group"><label>Employee *</label>
                  <select value={leaveForm.employee_id} onChange={e => setLeaveForm({ ...leaveForm, employee_id: e.target.value })}>
                    <option value="">— Select Employee —</option>
                    {employees.filter(e => e.status === 'active').map(e => <option key={e.id} value={e.id}>{e.emp_number} – {e.first_name} {e.last_name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Leave Type</label>
                  <select value={leaveForm.leave_type} onChange={e => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}>
                    {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>From Date</label><input type="date" value={leaveForm.from_date} onChange={e => setLeaveForm({ ...leaveForm, from_date: e.target.value })} /></div>
                <div className="form-group"><label>To Date</label><input type="date" value={leaveForm.to_date} onChange={e => setLeaveForm({ ...leaveForm, to_date: e.target.value })} /></div>
                <div className="form-group full"><label>Reason</label><input value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder="Optional reason" /></div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={saveLeave} disabled={savingLeave}>{savingLeave ? 'Saving...' : 'Submit Request'}</button>
                <button className="btn btn-secondary" onClick={() => setShowLeaveForm(false)}>Cancel</button>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <div className="table-toolbar"><h3>Leave Requests</h3></div>
            {leaves.length === 0 ? (
              <div className="empty-state"><div className="empty-state-icon">📅</div><h3>No leave requests</h3></div>
            ) : (
              <table>
                <thead><tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {leaves.map(l => (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 600 }}>{l.employee_name}</td>
                      <td style={{ fontSize: 13, color: 'var(--text2)' }}>{l.leave_type}</td>
                      <td style={{ fontSize: 13, color: 'var(--text2)' }}>{l.from_date}</td>
                      <td style={{ fontSize: 13, color: 'var(--text2)' }}>{l.to_date}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{l.days}</td>
                      <td style={{ fontSize: 12, color: 'var(--text3)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.reason || '—'}</td>
                      <td>
                        <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: statusBg(l.status), color: statusColor(l.status) }}>
                          {l.status}
                        </span>
                      </td>
                      <td>
                        {l.status === 'pending' && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-sm" style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 11 }} onClick={() => updateLeaveStatus(l.id, 'approved')}>Approve</button>
                            <button className="btn btn-danger btn-sm" onClick={() => updateLeaveStatus(l.id, 'rejected')}>Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
