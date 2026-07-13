# Pending Release Notes

This file accumulates release notes for the next unreleased version. PRs that add user-visible behavior should append a bullet to the relevant section here. Versioned files (`X.Y.Z.md`) are owned by the release skill — never create them in feature commits.

## Features

- **Bind Automations to Projects** — Prompt Automations can now target a workspace Project, so spawned sessions inherit its working directory, context, memory, and project-level Skills. Stale or archived bindings fail safely instead of running in the workspace default directory.

## Improvements

- **List-only personal workspace** — Session navigation now focuses exclusively on the List and chat workflow. The Kanban board, Task YAML/DAG Conductor, task editor surface, board appearance controls, and related playground demos have been removed, while legacy Board links safely fall back to All Sessions. Ordinary background tasks, child sessions, Projects, Sources, Skills, and Automations remain available.
- **Configure remote OpenConnector providers in Craft** — Provider pages now render secure API-key and custom-credential forms that proxy connection setup through the workspace server, so remote runtimes no longer require direct access to a VPS-local Web Console.

## Bug Fixes

## Breaking Changes
