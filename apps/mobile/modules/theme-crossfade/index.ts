import {requireOptionalNativeModule} from 'expo'

type ThemeCrossfadeModule = {crossfade(durationMs: number): Promise<void>}

// Null in jest and in dev clients built before the module existed.
const native = requireOptionalNativeModule<ThemeCrossfadeModule>('ThemeCrossfade')

/** Snapshots the window to fade over the next Theme change; undefined when there is nothing to wait for. */
export const crossfadeWindow = (durationMs: number): Promise<void> | undefined =>
  durationMs > 0 && native ? native.crossfade(durationMs) : undefined
