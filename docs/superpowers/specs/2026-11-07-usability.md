# Syllo usability: approved implementation scope

The user approved the three current/proposed comparisons and explicitly requested implementation on November 7, 2026.

1. Today has one prominent recommendation. Existing task/class context dialogs and exact review links remain functional. Quiet days resume a real recent notebook/lesson directly; new students can create a note without academic setup. Other due work and the schedule remain reachable in compact expandable sections.
2. Notes keeps Write/Practice, focus, and save status together. Insert, Format and Outline replace the scattered study controls; templates and scientific illustrations stay available. Notebook options retains appearance, history, export, Trash, and recovery. Existing editor identity, autosave, offline drafts, conflicts and illustrations must survive the changes.
3. Onboarding creates an optional unlinked note, then an optional manually authored recall question using the existing APIs. Completion opens that exact notebook. Students can explore without setup; subjects/timetable remain available later. Contextual guidance can be dismissed and reopened.

Reuse current React/Radix components and APIs. Maintain desktop/mobile accessibility, close menus on outside interaction/Escape/selection and restore useful focus. No new dependencies, backend schema changes or database execution are planned. All automated requests are mocked; do not execute real writes, migrations or seeds without showing commands/environment/effects and receiving explicit user confirmation.

Work in the current checkout, preserving the uncommitted dropdown fix. Do not commit, push or deploy as part of this request.
