# My Manga Sources — targeted fixes

This patch replaces only:
- `mangadex.plugin.js`: requests up to 500 English chapters, excludes external links, adds retries for API calls, and uses MangaDex data-saver image URLs.

Important limitations:
- MangaDex can only return chapters available in English and hosted directly on MangaDex through this feed. If older chapters are only available in another language or on a different website, this source cannot conjure them.
- The app controls image rendering and any per-image Retry button after page URLs have been returned. Data-saver URLs reduce payload size, but intermittent CDN/network failures can still happen.
- Test the two replacement files in Harbor before replacing the originals permanently. Keep the other three source files as-is for now.
