# 👩‍💻 Developer & AI Agent Contribution Guide

Welcome! Whether you are a human developer or an AI coding agent, this guide outlines the repository invariants, testing requirements, and contribution workflows for **Quomida**.

---

## 1. Development Prerequisites

- **Node.js**: `v24.0.0` (LTS) or higher (minimum `v20.0.0`)
- **npm**: `v10.0.0` or higher

---

## 2. Quickstart Environment Setup

```bash
# Clone the repository
git clone https://github.com/qozara/quomida.git
cd quomida

# Install all workspace dependencies
npm install

# Run unit tests across packages
npm run test

# Start local web development server
npm run dev
```

The web application runs locally at `http://localhost:3000` using `MockSyncAdapter` in zero-config offline mode.

---

## 3. Monorepo Scripts Reference

| Command | Action |
| :--- | :--- |
| `npm run dev` | Starts Vite development server for `@quomida/webapp`. |
| `npm run build` | Compiles all monorepo packages and applications. |
| `npm run test` | Runs Vitest unit test suite across all workspace packages. |
| `npm run test:web:e2e` | Runs Playwright E2E integration test suite in `apps/webapp`. |
| `npm run test:all:non-interactive` | Executes full offline suite (unit tests + headless E2E). |
| `npm run etl` | Runs regional food ingestion pipeline script and updates `seed_v1.json`. |
| `npm run cli` | Launches interactive terminal CLI tool for domain testing. |

---

## 4. Test-Driven Development (TDD) Workflow

Quomida strictly enforces a **Test-First (Red-Green-Refactor)** workflow:

1. **Red**: Write a failing unit test in `packages/[package-name]/tests/` capturing the desired function signature or schema constraint.
2. **Green**: Implement the minimal logic in `packages/[package-name]/src/` to pass the test.
3. **Refactor**: Clean up the implementation while keeping unit tests green.
4. **Verification**: Run `npm run test` before submitting changes.

---

## 5. Guidelines for Adding/Modifying RxDB Schemas

When adding a new field to an RxDB collection in `packages/domain-core`:

1. Update the TypeScript interface in `packages/domain-core/src/types.ts`.
2. Update the JSON Schema definition in `packages/domain-core/src/schemas/index.ts`. Increment schema `version` if modifying existing fields to trigger RxDB silent migration handlers.
3. Add unit test assertions in `packages/domain-core/tests/schemas.test.ts`.
4. Ensure `daily_logs` snapshots remain hardcoded and historically immutable.

---

## 6. GitFlow & Pull Request Workflow

- **`main` Branch Protection**: The `main` branch represents production releases and is protected. Direct pushes to `main` are disabled.
- **Branch Naming Conventions**:
  - Features: `feature/short-description`
  - Bug Fixes: `fix/short-description`
  - Refactoring/Docs: `refactor/short-description` or `docs/short-description`
- **Submitting Pull Requests**:
  1. Create a feature branch off `main` (`git checkout -b feature/my-feature`).
  2. Implement changes following TDD and verify all tests pass (`npm run test`).
  3. Push the feature branch to GitHub (`git push -u origin feature/my-feature`).
  4. Open a Pull Request on GitHub against `main`.
  5. The repository owner will review, inspect CI build results, and merge the PR on the GitHub website.
