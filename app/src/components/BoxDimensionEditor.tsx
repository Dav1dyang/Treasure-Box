'use client';

import { useState, useMemo } from 'react';
import type { BoxDimensions, BoxState, HandleStyle, CornerStyle } from '@/lib/types';
import { DEFAULT_BOX_DIMENSIONS, HANDLE_STYLES, CORNER_STYLES } from '@/lib/config';
import { normalizeDimensions } from '@/lib/boxStyles';

interface Props {
  dimensions: BoxDimensions;
  onChange: (dims: BoxDimensions) => void;
}

const STATE_LABELS: Record<BoxState, string> = {
  IDLE: 'idle (closed)',
  HOVER_PEEK: 'hover peek (20%)',
  OPEN: 'open (90%)',
  HOVER_CLOSE: 'closing (60%)',
  CLOSING: 'closing (30%)',
  SLAMMING: 'slam (5%)',
};

const STATE_ORDER: BoxState[] = ['IDLE', 'HOVER_PEEK', 'OPEN', 'HOVER_CLOSE', 'CLOSING', 'SLAMMING'];

export default function BoxDimensionEditor({ dimensions, onChange }: Props) {
  const [previewState, setPreviewState] = useState<BoxState>('IDLE');
  const [showAllStates, setShowAllStates] = useState(false);

  const update = (patch: Partial<BoxDimensions>) => {
    onChange({ ...dimensions, ...patch });
  };

  const updatePullout = (state: BoxState, value: number) => {
    onChange({
      ...dimensions,
      drawerPullout: { ...dimensions.drawerPullout, [state]: value },
    });
  };

  return (
    <div className="space-y-6">
      {/* Live ASCII Preview */}
      <div className="rounded-sm p-4 overflow-x-auto" style={{ background: 'var(--tb-bg)', border: '1px solid var(--tb-border-subtle)' }}>
        {showAllStates ? (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {STATE_ORDER.map(state => (
              <div key={state} className="flex-shrink-0">
                <div className="text-[9px] mb-1 text-center" style={{ color: 'var(--tb-fg-faint)' }}>{state}</div>
                <ASCIIPreview dimensions={dimensions} state={state} compact />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex justify-center">
            <ASCIIPreview dimensions={dimensions} state={previewState} compact={false} />
          </div>
        )}
      </div>

      {/* State selector */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs" style={{ color: 'var(--tb-fg-faint)' }}>preview state</label>
          <button
            onClick={() => setShowAllStates(!showAllStates)}
            className="text-[10px] cursor-pointer"
            style={{ color: 'var(--tb-highlight, var(--tb-accent))' }}
          >
            {showAllStates ? 'single view' : 'show all 5 states'}
          </button>
        </div>
        {!showAllStates && (
          <div className="flex gap-1 flex-wrap">
            {STATE_ORDER.map(state => (
              <button
                key={state}
                onClick={() => setPreviewState(state)}
                className="text-[10px] px-2 py-1 border rounded-sm cursor-pointer transition-colors"
                style={{
                  borderColor: previewState === state ? 'var(--tb-accent)' : 'var(--tb-border-subtle)',
                  color: previewState === state ? 'var(--tb-accent)' : 'var(--tb-fg-faint)',
                  background: previewState === state ? 'var(--tb-bg-muted)' : 'transparent',
                }}
              >
                {state}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Dimension Sliders */}
      <div className="grid grid-cols-2 gap-4">
        <SliderControl
          label="box width"
          value={dimensions.boxWidth}
          min={20}
          max={60}
          onChange={v => update({ boxWidth: v })}
        />
        <SliderControl
          label="body height"
          value={dimensions.boxHeight}
          min={6}
          max={20}
          onChange={v => update({ boxHeight: v })}
        />
        <SliderControl
          label="drawer height"
          value={dimensions.drawerHeight}
          min={3}
          max={10}
          onChange={v => update({ drawerHeight: v })}
        />
      </div>

      {/* Drawer Pullout per State */}
      <div>
        <label className="text-xs block mb-2" style={{ color: 'var(--tb-fg-faint)' }}>drawer pullout per state (%)</label>
        <div className="space-y-2">
          {STATE_ORDER.map(state => (
            <div key={state} className="flex items-center gap-3">
              <span className="text-[10px] w-24 flex-shrink-0" style={{ color: 'var(--tb-fg-faint)' }}>{STATE_LABELS[state]}</span>
              <input
                type="range"
                min="0"
                max="100"
                value={dimensions.drawerPullout[state]}
                onChange={e => updatePullout(state, Number(e.target.value))}
                className="flex-1 h-1"
                style={{ accentColor: 'var(--tb-accent)' }}
              />
              <span className="text-[10px] w-8 text-right" style={{ color: 'var(--tb-fg-muted)' }}>
                {dimensions.drawerPullout[state]}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Handle & Corner Style */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs block mb-2" style={{ color: 'var(--tb-fg-faint)' }}>handle style</label>
          <div className="flex gap-1 flex-wrap">
            {HANDLE_STYLES.map(h => (
              <button
                key={h.id}
                onClick={() => update({ handleStyle: h.id })}
                className="text-[10px] px-2 py-1 border rounded-sm cursor-pointer"
                style={{
                  borderColor: dimensions.handleStyle === h.id ? 'var(--tb-accent)' : 'var(--tb-border-subtle)',
                  color: dimensions.handleStyle === h.id ? 'var(--tb-accent)' : 'var(--tb-fg-faint)',
                }}
              >
                {h.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs block mb-2" style={{ color: 'var(--tb-fg-faint)' }}>corner style</label>
          <div className="flex gap-1 flex-wrap">
            {CORNER_STYLES.map(c => (
              <button
                key={c.id}
                onClick={() => update({ cornerStyle: c.id })}
                className="text-[10px] px-2 py-1 border rounded-sm cursor-pointer"
                style={{
                  borderColor: dimensions.cornerStyle === c.id ? 'var(--tb-accent)' : 'var(--tb-border-subtle)',
                  color: dimensions.cornerStyle === c.id ? 'var(--tb-accent)' : 'var(--tb-fg-faint)',
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Decorations */}
      <div className="flex gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={dimensions.hasRivets}
            onChange={e => update({ hasRivets: e.target.checked })}
            style={{ accentColor: 'var(--tb-accent)' }}
          />
          <span className="text-[10px]" style={{ color: 'var(--tb-fg-muted)' }}>rivets / bolts</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={dimensions.hasKeyhole}
            onChange={e => update({ hasKeyhole: e.target.checked })}
            style={{ accentColor: 'var(--tb-accent)' }}
          />
          <span className="text-[10px]" style={{ color: 'var(--tb-fg-muted)' }}>keyhole</span>
        </label>
      </div>

      {/* Reset */}
      <button
        onClick={() => onChange(DEFAULT_BOX_DIMENSIONS)}
        className="text-[10px] cursor-pointer"
        style={{ color: 'var(--tb-fg-faint)' }}
      >
        reset to defaults
      </button>
    </div>
  );
}

// ===== Slider Control =====

function SliderControl({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <label className="text-[10px]" style={{ color: 'var(--tb-fg-faint)' }}>{label}</label>
        <span className="text-[10px]" style={{ color: 'var(--tb-fg-muted)' }}>{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1"
        style={{ accentColor: 'var(--tb-accent)' }}
      />
    </div>
  );
}

// ===== ASCII Rendering Engine =====

function ASCIIPreview({
  dimensions,
  state,
  compact,
}: {
  dimensions: BoxDimensions;
  state: BoxState;
  compact: boolean;
}) {
  const ascii = useMemo(
    () => renderASCIIBox(dimensions, state, compact),
    [dimensions, state, compact]
  );

  return (
    <pre
      className={`font-mono leading-[1.25] select-all ${compact ? 'text-[7px]' : 'text-[10px]'}`}
      style={{ color: 'var(--tb-fg)', whiteSpace: 'pre' }}
      dangerouslySetInnerHTML={{ __html: ascii }}
    />
  );
}

// ===== ASCII Box Renderer =====

function renderASCIIBox(dims: BoxDimensions, state: BoxState, compact: boolean): string {
  const w = compact ? Math.min(dims.boxWidth, 30) : dims.boxWidth;
  const bodyH = compact ? Math.min(dims.boxHeight, 8) : dims.boxHeight;
  const drawerH = compact ? Math.min(dims.drawerHeight, 4) : dims.drawerHeight;
  const pullout = dims.drawerPullout[state];
  const innerW = w - 4; // inside border width

  // Characters based on corner style
  const c = getCornerChars(dims.cornerStyle);

  const lines: string[] = [];

  // If drawer is pulled out, render the slide-out portion first
  if (pullout > 0) {
    const slideRows = Math.max(1, Math.round((pullout / 100) * (drawerH + 2)));

    // Slide-out top edge
    const slideW = innerW - 2;
    lines.push(`    ${c.tl}${'─'.repeat(slideW)}${c.tr}`);

    // Slide-out body with interior visible
    for (let i = 0; i < slideRows - 1; i++) {
      if (i === 0 && pullout > 50) {
        // Show dark interior for wide-open states
        const interiorW = slideW - 2;
        lines.push(`    │ <span style="color:var(--tb-fg-ghost)">${'░'.repeat(interiorW)}</span> │`);
      } else {
        lines.push(`    │${' '.repeat(slideW)}│`);
      }
    }

    // Slide-out bottom edge
    lines.push(`    ${c.bl}${'─'.repeat(slideW)}${c.br}`);
  }

  // === DRAWER FACE (always visible) ===
  // Top border of drawer
  lines.push(`  ${c.tl}${'═'.repeat(innerW)}${c.tr}`);

  // Drawer body
  for (let row = 0; row < drawerH; row++) {
    const mid = Math.floor(drawerH / 2);

    if (row === mid) {
      // Handle row
      const handle = renderHandle(dims.handleStyle, innerW);
      const rivL = dims.hasRivets ? '<span style="color:var(--tb-highlight, #8a6a4a)">o</span>' : ' ';
      const rivR = dims.hasRivets ? '<span style="color:var(--tb-highlight, #8a6a4a)">o</span>' : ' ';
      lines.push(`  ║${rivL}${handle}${rivR}║`);
    } else if (row === mid + 1 && dims.hasKeyhole) {
      // Keyhole row
      const padSide = Math.floor((innerW - 3) / 2);
      const keyhole = '<span style="color:var(--tb-accent)">[@]</span>';
      lines.push(`  ║${' '.repeat(padSide)}${keyhole}${' '.repeat(innerW - padSide - 3)}║`);
    } else {
      // Empty drawer row with optional texture
      const rivL = dims.hasRivets && (row === 0 || row === drawerH - 1) ? '<span style="color:var(--tb-highlight, #8a6a4a)">o</span>' : ' ';
      const rivR = dims.hasRivets && (row === 0 || row === drawerH - 1) ? '<span style="color:var(--tb-highlight, #8a6a4a)">o</span>' : ' ';
      lines.push(`  ║${rivL}${' '.repeat(innerW - 2)}${rivR}║`);
    }
  }

  // Divider between drawer and body
  lines.push(`  ╠${'═'.repeat(innerW)}╣`);

  // === BOX BODY ===
  for (let row = 0; row < bodyH; row++) {
    const rivL = dims.hasRivets && (row === 0 || row === bodyH - 1)
      ? '<span style="color:var(--tb-highlight, #8a6a4a)">o</span>' : ' ';
    const rivR = dims.hasRivets && (row === 0 || row === bodyH - 1)
      ? '<span style="color:var(--tb-highlight, #8a6a4a)">o</span>' : ' ';

    // Add some texture to body
    if (row === 1 || row === bodyH - 2) {
      const tex = '<span style="color:var(--tb-fg-ghost)">' + '░'.repeat(innerW - 2) + '</span>';
      lines.push(`  ║${rivL}${tex}${rivR}║`);
    } else {
      lines.push(`  ║${rivL}${' '.repeat(innerW - 2)}${rivR}║`);
    }
  }

  // Bottom border
  lines.push(`  ${c.bl}${'═'.repeat(innerW)}${c.br}`);

  // Shadow
  if (!compact) {
    const shadowW = Math.min(innerW + 2, w);
    lines.push(`  <span style="color:var(--tb-fg-ghost)">${'·'.repeat(shadowW + 2)}</span>`);
  }

  // Motion blur indicator for SLAMMING
  if (state === 'SLAMMING') {
    lines.push(`  <span style="color:var(--tb-highlight, var(--tb-accent))">~ ~ ~ SLAM ~ ~ ~</span>`);
  }

  return lines.join('\n');
}

function getCornerChars(style: CornerStyle) {
  switch (style) {
    case 'square':
      return { tl: '┌', tr: '┐', bl: '└', br: '┘' };
    case 'rounded':
      return { tl: '╭', tr: '╮', bl: '╰', br: '╯' };
    case 'double':
      return { tl: '╔', tr: '╗', bl: '╚', br: '╝' };
    case 'beveled':
      return { tl: '╒', tr: '╕', bl: '╘', br: '╛' };
    case 'reinforced':
      return { tl: '╔', tr: '╗', bl: '╚', br: '╝' };
  }
}

function renderHandle(style: HandleStyle, innerW: number): string {
  const available = innerW - 2; // minus rivet space
  const accent = (s: string) => `<span style="color:var(--tb-accent)">${s}</span>`;

  switch (style) {
    case 'round-knob': {
      const pad = Math.floor((available - 3) / 2);
      return ' '.repeat(pad) + accent('(O)') + ' '.repeat(available - pad - 3);
    }
    case 'pull-bar': {
      const barW = Math.min(16, available - 4);
      const pad = Math.floor((available - barW) / 2);
      const bar = accent(`[ ${'═'.repeat(barW - 4)} ]`);
      return ' '.repeat(pad) + bar + ' '.repeat(available - pad - barW);
    }
    case 'ring-pull': {
      const pad = Math.floor((available - 5) / 2);
      return ' '.repeat(pad) + accent('(( ))') + ' '.repeat(available - pad - 5);
    }
    case 'half-moon': {
      const pad = Math.floor((available - 5) / 2);
      return ' '.repeat(pad) + accent('(   )') + ' '.repeat(available - pad - 5);
    }
    case 'slot-pull': {
      const pad = Math.floor((available - 7) / 2);
      return ' '.repeat(pad) + accent('[_____]') + ' '.repeat(available - pad - 7);
    }
    case 'none': {
      return ' '.repeat(available);
    }
  }
}
