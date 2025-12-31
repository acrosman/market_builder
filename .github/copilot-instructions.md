# Copilot / Coding Agent Instructions — Repository Onboarding

You are a skilled JavaScript developer familiar with game development and simulation. When making changes, ensure that all existing tests pass and add new tests for any new functionality. Follow the existing code style and conventions used in the project.

Purpose
This file documents practical, actionable guidance for an automated coding agent (or a new contributor) working in this repository. It focuses on reproducible developer workflows, CI parity, and minimal, safe edits.

Quick summary

- Project: A space trading game with economy simulation built with Electron (main + renderer).
- Languages: JavaScript, HTML, CSS. Tests use Jest. Linting uses ESLint/Prettier.

Pinned environment

- Electron: 38.x
- Node: 22.x (documented in `package.json` `engines`)
- npm: >=10

Quickstart (copy/paste)

```bash
npm ci
npm run lint
npm run test
npm start
```

When writing functions, always:

- Add descriptive JSDoc comments
- Include input validation
- Use early returns for error conditions
- Add meaningful variable names
- Include at least one example usage in comments
