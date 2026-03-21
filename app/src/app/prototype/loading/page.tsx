'use client';

import LoadingAnimation from '@/components/LoadingAnimation';

export default function LoadingPrototypePage() {
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#0e0e0e',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
    }}>
      <div style={{
        width: '90%',
        maxWidth: 500,
        aspectRatio: '1 / 1',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        <LoadingAnimation />
      </div>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em' }}>
        generating all 5 states — 30-60 seconds...
      </span>
    </div>
  );
}
