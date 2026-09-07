import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';

export interface WaveformPlayerHandle {
  /** Seeks to the given time (seconds) and starts playback from there. */
  seekTo: (seconds: number) => void;
}

export const WaveformPlayer = forwardRef<WaveformPlayerHandle, { audioUrl: string }>(function WaveformPlayer(
  { audioUrl },
  ref
) {
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

  useImperativeHandle(ref, () => ({
    seekTo: (seconds: number) => {
      const wavesurfer = waveRef.current;
      if (!wavesurfer) return;
      wavesurfer.setTime(seconds);
      void wavesurfer.play();
    },
  }));

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
});
