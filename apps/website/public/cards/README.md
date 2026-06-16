# Printable card PDFs (not committed)

The per-language printable decks (`*-tall.pdf`, `*-wide.pdf`, ~147 MB) were intentionally
left out of the monorepo to keep its git history lean. They are large static download
artifacts, not application code, and `astro build` does not need them.

To restore them for a production build, sync them from the original website repo or object
storage into this directory (they are referenced by `src/components/Print.tsx`):

```
rsync -a ../../../../website/public/cards/ ./   # from the legacy website checkout
```

Tracked as follow-up: host these via Git LFS / external storage rather than plain blobs.
