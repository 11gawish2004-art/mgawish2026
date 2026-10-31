# AGENTS.md

## Rules

- Shared cross-section person registry lives in `src/lib/duplicateRegistry.ts` as a module-level singleton (`useRegistryEntries`): all consumers (duplicate detector, inline duplicate warnings, autofill) share one Firestore subscription set per screen instead of one per input. Why: forms render many smart fields (13+ payroll rows); per-input subscriptions would open dozens of listeners.
- Duplicate-warning + one-click autofill UI comes from `src/components/SmartFields.tsx` (`useFieldMatches`, `DupStrip`, `SmartInput`); form primitives `FormField` (CasesScreen), `FormInput` (MarriageCasesScreen), `InputGroup` (MedicalRecordsScreen) accept `matchBy`/`excludeDocId`/`onPick`. New sections must be added to `SECTIONS` in duplicateRegistry.ts to participate.
- Global Enter→next-field navigation is installed once in `App.tsx` via `installEnterNavigation()` (`src/lib/enterNav.ts`); it only hijacks Enter inside real `<form>` elements, never search boxes or inline table grids, and the last field keeps native submit.
- The app's own data layer is Firebase (Firestore) for all section screens, even though Lovable Cloud is enabled for uploads/AI (`upload-image` edge function, `ai-chat`). Do not move section CRUD to Cloud without an explicit migration request.
