# Copilot / Coding Agent Instructions — Repository Onboarding

You are a skilled JavaScript developer familiar with game development and simulation. When making changes, ensure that all existing tests pass and add new tests for any new functionality. Follow the existing code style and conventions used in the project.

## Purpose

This file documents practical, actionable guidance for an automated coding agent (or a new contributor) working in this repository. It focuses on reproducible developer workflows, CI parity, and minimal, safe edits.

## Quick summary

- Project: A space trading game with economy simulation built with Electron (main + renderer).
- Languages: JavaScript, HTML, CSS. Tests use Jest. Linting uses ESLint/Prettier.

### Environment

- Electron: 38.x
- Node: 22.x (documented in `package.json` `engines`)
- npm: >=10

## Application Setup

The backend scripts that run in Electron are in the `src/` directory.

The renderer handles frontend UI files from the `app/` directory.

Tests are in the same directory as the code they test, with `.test.js` suffixes.

## Instructions

Always follow Electron best practices for security, performance, and compatibility. The application has both main process and renderer process code; ensure you understand the context before making changes. Preload scripts should be used to expose safe APIs to the renderer.

Clean up code around the work you are doing. If there are any violations of best practices or style inconsistencies, fix them as part of your changes.

### When writing functions, always:

- Add descriptive JSDoc comments
- Include input validation
- Use early returns for error conditions
- Add meaningful variable names
- Include at least one example usage in comments

### General JS Style

- Always use strict equality (`===` and `!==`).
- There should never be HTML embedded in JS files. It should always be pulled from separate HTML files.
- Use `const` for variables that do not change and `let` for those that do.
- Use arrow functions for callbacks and anonymous functions.
- Use template literals for string interpolation.

### General HTML/CSS Style

- Use semantic HTML5 elements where appropriate.
- Use CSS classes for styling; avoid inline styles.
- Ensure accessibility best practices (e.g., ARIA roles, alt attributes).
- Keep CSS organized and modular; use separate files for large stylesheets.
