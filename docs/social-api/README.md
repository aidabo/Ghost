# Ghost Social API Docs Index

Use this directory for custom social API and backend notes.

## Main docs

- [CUSTOM.md](./CUSTOM.md)
- [API_REFERENCE.md](./API_REFERENCE.md)
- [API_INDEX.md](./API_INDEX.md)
- [LEGACY_NOTES.md](./LEGACY_NOTES.md)
- [summary-2026-02-18.md](./summary-2026-02-18.md)

## Recommended use

- [CUSTOM.md](./CUSTOM.md)
  - custom API creation flow
  - migration / model / endpoint / route conventions
- [API_REFERENCE.md](./API_REFERENCE.md)
  - main custom social API reference
  - related endpoint / model / route conventions
- [API_INDEX.md](./API_INDEX.md)
  - short pointer for the older index name
- [summary-2026-02-18.md](./summary-2026-02-18.md)
  - backend functional report
  - implemented social API behavior snapshot
- [LEGACY_NOTES.md](./LEGACY_NOTES.md)
  - older post/user/schema extension notes
  - historical custom admin API examples

## Group routing rule

- use the Content API for `public` groups when no member auth is available
- use the Admin/Dashboard API for private groups and any write flow that depends on logged-in user permissions
- pick the route based on group type before making the request, rather than trying one endpoint and falling back after a failure
