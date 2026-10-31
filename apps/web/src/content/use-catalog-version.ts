import type { ContentVersion } from '@epochs/content';
import { useGameStore } from '../state/game-store.js';
export function useCatalogVersion(override?: ContentVersion): ContentVersion {
  const version = useGameStore(
    (state) => (state.presentationView ?? state.view)?.catalogVersion ?? '1.0',
  );
  return override ?? version;
}
