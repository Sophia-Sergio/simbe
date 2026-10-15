# Design specs

Written by **Claude Code** (superpowers `brainstorming`) before plans. Name: `YYYY-MM/YYYY-MM-DD-HHmm-<topic>-design.md`.

Structure: **Status/Depends on/Plan** header · **Goal** · **Findings** (facts from the data/design/code) · **Decisions** (numbered) · **Non-goals** · **Acceptance criteria**.

## Acceptance criteria must be runnable

Every line is a command (or spec file) someone can run and get yes/no from — never a feeling about the code.

1. A criterion may only assert something the Findings claimed.
2. A criterion may not contradict Decisions or Non-goals — re-read both against every criterion.
3. Run every criterion before calling the work complete and paste the output into the PR.

A criterion worth enforcing forever belongs in `backend/lib/tasks/boundaries.rake` (CI runs it on every change).

Index and build order: [`../README.md`](../README.md).
