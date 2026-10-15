'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AudioBus } from '../../../audio/bus';
import { SynthProvider } from '../../../audio/synth';
import { LOOP_NAMES, SOUND_NAMES, isLoopName, type LoopHandle, type SoundName } from '../../../audio/types';

/** Render every sound offline (real Web Audio, no speakers) and report peak level / errors per sound. */
async function renderCheck(): Promise<string[]> {
  const lines: string[] = [];
  for (const n of SOUND_NAMES) {
    try {
      const ctx = new OfflineAudioContext(2, 44100 * 3, 44100);
      const p = new SynthProvider();
      p.init(ctx as unknown as AudioContext, ctx.destination);
      const h = isLoopName(n) ? (p.loop(n, { pan: 0.4 }), null) : p.play(n, { pan: 0.4 });
      const buf = await ctx.startRendering();
      let peak = 0;
      let bad = 0;
      for (let c = 0; c < 2; c++) for (const x of buf.getChannelData(c)) { if (!Number.isFinite(x)) bad++; else peak = Math.max(peak, Math.abs(x)); }
      lines.push(`${n}: peak ${peak.toFixed(2)}${h ? ` dur ${h.duration.toFixed(2)}s` : ' (loop)'}${bad ? ` NaN×${bad}` : ''}${peak < 0.02 ? ' SILENT' : ''}${peak > 1 ? ' CLIP' : ''}`);
    } catch (e) {
      lines.push(`${n}: ERROR ${String(e)}`);
    }
  }
  return lines;
}

/** Hidden audition UI. Mounted only from the server page after the production 404 guard. */
export default function SoundClient() {
  const bus = useRef<AudioBus | null>(null);
  const loops = useRef(new Map<SoundName, LoopHandle>());
  const [running, setRunning] = useState<ReadonlySet<SoundName>>(new Set());
  const [volume, setVolume] = useState(0.6);
  const [pan, setPan] = useState(0);
  const [rate, setRate] = useState(1);
  const [report, setReport] = useState<string[]>([]);

  useEffect(() => {
    const b = new AudioBus({ volume: 0.6 });
    b.setListener(0, 1);
    bus.current = b;
    const active = loops.current;
    return () => {
      for (const h of active.values()) h.stop();
      active.clear();
      b.dispose();
      bus.current = null;
    };
  }, []);

  const play = (n: SoundName) => {
    bus.current?.unlock();
    bus.current?.play(n, { pan, rate });
  };

  const toggle = (n: SoundName) => {
    const b = bus.current;
    if (!b) return;
    b.unlock();
    const existing = loops.current.get(n);
    if (existing) {
      existing.stop();
      loops.current.delete(n);
    } else {
      loops.current.set(n, b.loop(n, { pan, rate }));
    }
    setRunning(new Set(loops.current.keys()));
  };

  const btn: CSSProperties = {
    font: 'inherit', fontSize: 13, padding: '4px 10px', color: 'inherit', background: 'transparent',
    border: '1px solid #777', borderRadius: 4, cursor: 'pointer',
  };
  const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 };
  const label: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 };
  const h2: CSSProperties = { fontSize: 13, color: '#999', margin: '0 0 8px' };

  return (
    <main style={{ minHeight: '100vh', padding: 24, background: '#171717', color: '#eee', fontFamily: 'ui-monospace, monospace' }}>
      <h1 style={{ fontSize: 18, margin: '0 0 16px' }}>Sound audition ({SOUND_NAMES.length} sounds)</h1>
      <div style={{ ...row, gap: 24, alignItems: 'center' }}>
        <label style={label}>
          volume {volume.toFixed(2)}
          <input type="range" min={0} max={1} step={0.01} value={volume}
            onChange={(e) => { const v = +e.target.value; setVolume(v); bus.current?.setVolume(v); }} />
        </label>
        <label style={label}>
          pan {pan.toFixed(2)}
          <input type="range" min={-1} max={1} step={0.05} value={pan} onChange={(e) => setPan(+e.target.value)} />
        </label>
        <label style={label}>
          rate {rate.toFixed(2)}
          <input type="range" min={0.5} max={2} step={0.05} value={rate} onChange={(e) => setRate(+e.target.value)} />
        </label>
      </div>
      <h2 style={h2}>one-shots (loops below also play a ~1s audition here)</h2>
      <div style={row}>
        {SOUND_NAMES.map((n) => (
          <button key={n} style={btn} onClick={() => play(n)}>{n}{isLoopName(n) ? ' (1s)' : ''}</button>
        ))}
      </div>
      <h2 style={h2}>offline render check</h2>
      <button style={btn} onClick={() => { void renderCheck().then(setReport); }}>render all</button>
      <pre id="render-report" style={{ fontSize: 12 }}>{report.join('\n')}</pre>
      <h2 style={h2}>loops (toggle)</h2>
      <div style={{ ...row }}>
        {LOOP_NAMES.map((n) => (
          <button key={n} style={{ ...btn, background: running.has(n) ? '#065f46' : 'transparent' }} onClick={() => toggle(n)}>
            {running.has(n) ? '■ ' : '▶ '}{n}
          </button>
        ))}
      </div>
    </main>
  );
}
