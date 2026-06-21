import React from 'react';

interface SmartButtonProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  onClick?: () => void;
  forceActive?: boolean;
}

export function SmartButton({ icon, value, label, onClick, forceActive }: SmartButtonProps) {
  const numVal = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, '')) || 0;
  const active = forceActive !== undefined ? forceActive : numVal > 0;

  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        padding: '10px 18px',
        minWidth: 90,
        background: active ? '#ede9fe' : '#f9fafb',
        border: `1.5px solid ${active ? '#c4b5fd' : '#e5e7eb'}`,
        borderRadius: 10,
        cursor: onClick ? 'pointer' : 'default',
        color: active ? '#7c3aed' : '#9ca3af',
        transition: 'all 0.15s',
        outline: 'none',
        userSelect: 'none' as const,
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.background = active ? '#ddd6fe' : '#f3f4f6'; }}
      onMouseLeave={e => { e.currentTarget.style.background = active ? '#ede9fe' : '#f9fafb'; }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', opacity: 0.8, textAlign: 'center' as const }}>{label}</span>
    </button>
  );
}

export function SmartButtons({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
      {children}
    </div>
  );
}
