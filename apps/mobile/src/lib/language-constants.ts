/**
 * Cap on secondary display languages (the "Also show" Display setting) — kept
 * out of language-store.ts so UI components can import it without pulling in
 * AsyncStorage.
 */
export const MAX_SECONDARY_LANGUAGES = 2
