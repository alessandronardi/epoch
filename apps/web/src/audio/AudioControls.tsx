import { useId, useSyncExternalStore, type ReactElement } from 'react';
import { soundEffects, type SoundEffects } from './sound-effects.js';

export function AudioControls({
  audio = soundEffects,
}: {
  readonly audio?: SoundEffects;
}): ReactElement {
  const { muted, volume } = useSyncExternalStore(
    audio.subscribe,
    audio.getPreferences,
    audio.getPreferences,
  );
  const volumeId = useId();
  return (
    <div
      role="group"
      aria-label="Controlli audio"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px',
        color: 'var(--chalk, #E9E5D6)',
      }}
    >
      <button
        type="button"
        className="touch-target"
        aria-pressed={muted}
        onClick={() => {
          audio.setMuted(!muted);
          void audio.unlock();
        }}
        style={{
          minWidth: 44,
          minHeight: 44,
          borderRadius: 6,
          border: '1px solid var(--brass, #B58E48)',
          background: muted ? 'rgba(181, 142, 72, 0.24)' : 'var(--surface-card, #223444)',
          color: 'inherit',
          padding: '6px 10px',
          cursor: 'pointer',
        }}
      >
        Silenzia audio
      </button>
      <label htmlFor={volumeId}>Volume</label>
      <input
        id={volumeId}
        type="range"
        min="0"
        max="100"
        step="1"
        value={Math.round(volume * 100)}
        aria-valuetext={`${Math.round(volume * 100)}%`}
        onChange={(event) => {
          audio.setVolume(Number(event.currentTarget.value) / 100);
          void audio.unlock();
        }}
        style={{ width: 100, minHeight: 44, accentColor: 'var(--brass, #B58E48)' }}
      />
    </div>
  );
}
