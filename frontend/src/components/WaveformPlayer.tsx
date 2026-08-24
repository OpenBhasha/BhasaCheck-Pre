import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';

export function WaveformPlayer({ audioUrl }: { audioUrl: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const waveRef = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#b3cdff',
      progressColor: '#2563eb',
      cursorColor: '#1d4ed8',
      height: 64,
      barWidth: 2,
      barGap: 1,
      url: audioUrl,
    });
    waveRef.current = wavesurfer;

    wavesurfer.on('play', () => setPlaying(true));
    wavesurfer.on('pause', () => setPlaying(false));
    wavesurfer.on('finish', () => setPlaying(false));

    return () => {
      wavesurfer.destroy();
      waveRef.current = null;
    };
  }, [audioUrl]);

  return (
    <div className="waveform-box">
      <div ref={containerRef} />
      <div className="btn-row" style={{ marginTop: 10 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => waveRef.current?.playPause()}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => waveRef.current?.stop()}>
          Stop
        </button>
      </div>
    </div>
  );
}
