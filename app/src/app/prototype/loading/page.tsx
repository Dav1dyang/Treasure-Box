'use client';

import { useState } from 'react';
import LoadingAnimation from '@/components/LoadingAnimation';

export default function LoadingPrototypePage() {
  const [finishing, setFinishing] = useState(false);
  const [showAnimation, setShowAnimation] = useState(true);
  const [message, setMessage] = useState('');

  const handleFinished = () => {
    setShowAnimation(false);
    setMessage('Generation complete!');
  };

  const handleReset = () => {
    setFinishing(false);
    setShowAnimation(true);
    setMessage('');
  };

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
        position: 'relative',
      }}>
        {showAnimation ? (
          <LoadingAnimation finishing={finishing} onFinished={handleFinished} />
        ) : (
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.5)',
            fontSize: 14,
            letterSpacing: '0.08em',
          }}>
            {message}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {showAnimation && !finishing && (
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em' }}>
            generating all 5 states — 30-60 seconds...
          </span>
        )}
        {finishing && showAnimation && (
          <span style={{ fontSize: 11, color: 'rgba(186,225,255,0.6)', letterSpacing: '0.12em' }}>
            finishing up...
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        {showAnimation && !finishing && (
          <button
            onClick={() => setFinishing(true)}
            style={{
              fontSize: 11,
              padding: '6px 16px',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 4,
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              letterSpacing: '0.08em',
            }}
          >
            simulate generation complete
          </button>
        )}
        {!showAnimation && (
          <button
            onClick={handleReset}
            style={{
              fontSize: 11,
              padding: '6px 16px',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 4,
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              letterSpacing: '0.08em',
            }}
          >
            restart animation
          </button>
        )}
      </div>
    </div>
  );
}
