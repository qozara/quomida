# 0000. Use Markdown Architectural Decision Records

* Status: accepted
* Date: 2026-09-12

## Context and Problem Statement

We need a standardized method to document architectural decisions, tradeoffs, and design choices made in Quomida so that future developers, open-source contributors, and AI coding agents can understand the rationale behind system boundaries and avoid breaking core invariants.

## Decision Drivers

* Need for lightweight, version-controlled architecture records alongside codebase.
* Optimization for both human developers and autonomous AI coding agents (Antigravity, Cursor, Copilot).
* Transparency for open-source GitHub contributors.

## Considered Options

* Option 1: Wiki or external Google Docs (decoupled from codebase).
* Option 2: Inline code comments only.
* Option 3: Markdown Architectural Decision Records (MADR) in repository (`docs/adr/`).

## Decision Outcome

Chosen option: **Option 3 (MADR in `docs/adr/`)**, because it stores architecture documentation directly in Git alongside the source code, enabling PR-driven reviews, searchability, and instant context parsing for AI agents.
