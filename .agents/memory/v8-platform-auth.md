---
name: V8 Platform Auth
description: Auth architecture — React Context (AuthProvider), JWT flow, token storage
---

## Auth Architecture

- `use-auth.tsx` exports `AuthProvider` (React Context) + `useAuth()` hook
- `AuthProvider` wraps the entire app in `App.tsx` — inside `QueryClientProvider`, outside `Router`
- Token stored in `localStorage` as `"v8_token"`; synced via `StorageEvent` for multi-tab
- `setToken(null)` calls `logout()` — clears localStorage + state
- Login: admin / admin123

## Why it was broken (fixed)
Original `use-auth.tsx` used plain `useState` per component — no shared state. Login set token in its own state instance but ProtectedRoute read from a different instance, so it never saw the token. Fixed by converting to React Context.

**Why:** React hooks with `useState` are NOT shared between component instances. Only context (or external stores like Zustand) can share state across the tree.

## How to apply
- Any new page that needs auth: call `useAuth()` — it reads from the same context
- Never add `useState` for auth state outside of `AuthProvider`
- `ProtectedRoute` in `App.tsx` handles redirecting unauthenticated users to `/login`
