/**
 * Cap on secondary display languages (the "Also show" Display setting) — kept
 * out of language-store.ts so UI components can import it without pulling in
 * AsyncStorage.
 *
 * Reduced from 2 to 1 by issue #176: exactly one optional extra language, not
 * several. `language-store.ts`'s reader already re-slices to this constant on
 * every read, so a legacy 2-entry stored array is transparently migrated down
 * to its first entry the next time it's read — no separate migration routine
 * needed (see the "storage migration" tests in language-store.test.ts).
 */
export const MAX_SECONDARY_LANGUAGES = 1
