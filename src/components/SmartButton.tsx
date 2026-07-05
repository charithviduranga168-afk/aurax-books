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
        alignItems: 'center',
        gap: 0,
        padding: 0,
        height: 36,
        background: active ? '#ede9fe' : '#f3f4f6',
        border: `1.5px solid ${active ? '#c4b5fd' : '#e5e7eb'}`,
        borderRadius: 20,
        cursor: onClick ? 'pointer' : 'default',
        color: active ? '#7c3aed' : '#9ca3af',
        transition: 'all 0.15s',
        outline: 'none',
        userSelect: 'none' as const,
        overflow: 'hidden',
        whiteSpace: 'nowrap' as const,
        fontFamily: 'inherit',
      }}
      onMouseEnter={e => {
        if (onClick) {
          e.currentTarget.style.background = active ? '#ddd6fe' : '#e9eaec';
          e.currentTarget.style.borderColor = active ? '#a78bfa' : '#d1d5db';
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = active ? '#ede9fe' : '#f3f4f6';
        e.currentTarget.style.borderColor = active ? '#c4b5fd' : '#e5e7eb';
      }}
    >
      {/* Icon pill section */}
      <span style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        borderRight: `1.5px solid ${active ? '#c4b5fd' : '#e5e7eb'}`,
        background: active ? 'rgba(124,58,237,0.10)' : 'rgba(0,0,0,0.03)',
        flexShrink: 0,
      }}>
        {icon}
      </span>

      {/* Count + label */}
      <span style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 5,
        padding: '0 14px 0 12px',
      }}>
        <span style={{ fontSize: 15, fontWeight: 800, lineHeight: 1 }}>{value}</span>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.06em',
          opacity: 0.75,
        }}>{label}</span>
      </span>
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
