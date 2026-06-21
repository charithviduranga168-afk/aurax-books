import { Check } from 'lucide-react';

interface StatusBarProps {
  steps: string[];
  current: string;
}

const CH = 14; // chevron arrow width in px

export function StatusBar({ steps, current }: StatusBarProps) {
  const isCancelled = current.toLowerCase() === 'cancelled';
  const currentIdx = steps.findIndex(s => s.toLowerCase() === current.toLowerCase());
  const displaySteps = isCancelled ? [...steps, 'Cancelled'] : steps;

  return (
    <div style={{ display: 'flex', height: 34, gap: 2, marginBottom: 20 }}>
      {displaySteps.map((step, i) => {
        const isCancelledStep = isCancelled && step === 'Cancelled';
        const isDone = !isCancelled && currentIdx > -1 && i < currentIdx;
        const isCurrent = !isCancelled && i === currentIdx;
        const isFirst = i === 0;
        const isLast = i === displaySteps.length - 1;

        const clipPath = isFirst
          ? `polygon(0 0, calc(100% - ${CH}px) 0, 100% 50%, calc(100% - ${CH}px) 100%, 0 100%)`
          : isLast
          ? `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${CH}px 50%)`
          : `polygon(${CH}px 0, calc(100% - ${CH}px) 0, 100% 50%, calc(100% - ${CH}px) 100%, ${CH}px 100%, 0 50%)`;

        let bg: string;
        let color: string;
        let bgImage: string | undefined;

        if (isCancelledStep) {
          bg = '#fee2e2'; color = '#dc2626';
        } else if (isCancelled) {
          bg = '#f3f4f6'; color = '#d1d5db';
        } else if (isCurrent) {
          bg = 'transparent'; color = '#ffffff';
          bgImage = 'linear-gradient(105deg, #6d28d9, #8b5cf6)';
        } else if (isDone) {
          bg = '#ede9fe'; color = '#7c3aed';
        } else {
          bg = '#f3f4f6'; color = '#9ca3af';
        }

        return (
          <div
            key={`${step}-${i}`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 5, flex: 1, minWidth: 0,
              paddingLeft: isFirst ? 14 : 14 + CH,
              paddingRight: isLast ? 14 : 14 + CH,
              background: bg,
              backgroundImage: bgImage,
              color, fontSize: 12, fontWeight: 700, letterSpacing: '0.01em',
              clipPath, whiteSpace: 'nowrap' as const,
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {isDone && <Check size={11} strokeWidth={3} style={{ flexShrink: 0 }} />}
            {isCancelledStep && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            )}
            {step}
          </div>
        );
      })}
    </div>
  );
}
