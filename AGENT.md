# AGENT.md

Agent entry point for the `00-Ghost-5.116.2` workspace.

## Main focus

This repo is a customized Ghost backend with social/API extensions.

## Start here

For Ghost custom backend docs and implementation notes, prefer:

1. [docs/README.md](./docs/README.md)
2. [docs/social-api/README.md](./docs/social-api/README.md)
3. [.agent/README.md](./.agent/README.md)

## Important doc entry points

- Ghost docs index:
  - [docs/README.md](./docs/README.md)
- Social API docs index:
  - [docs/social-api/README.md](./docs/social-api/README.md)
- Main social API reference:
  - [docs/social-api/API_REFERENCE.md](./docs/social-api/API_REFERENCE.md)
- Custom backend implementation guide:
  - [docs/social-api/CUSTOM.md](./docs/social-api/CUSTOM.md)
- Legacy custom notes:
  - [docs/social-api/LEGACY_NOTES.md](./docs/social-api/LEGACY_NOTES.md)

## Agent-facing notes

- Main agent notes:
  - [.agent/SKILLS.md](./.agent/SKILLS.md)

## Current implementation notes

- Ghost social/custom APIs are organized under `docs/social-api/`
- Mermaid is not finalized server-side in Ghost HTML generation; current stable direction keeps Mermaid rendering on the host display path
- Ghost-side save flow should be kept stable and low-risk unless a task clearly requires model/save-path changes

## Working rule

When starting a new Ghost task:

1. check whether it is social API, rendering, or migration work
2. read the corresponding doc in `docs/social-api/`
3. use `.agent/SKILLS.md` for recent backend conventions and implementation history

