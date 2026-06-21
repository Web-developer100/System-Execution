---
name: V8 Login Race Condition Fix
description: Explains why the login button appeared to not work and the two-part fix applied.
---

## Problem
After successful `POST /api/auth/login`, calling `setToken(data.token)` then immediately `setLocation("/dashboard")` caused `ProtectedRoute` to see stale `isAuthenticated = false` (React state batched async) and redirect back to `/login`.

## Fix (two parts)

**1. `flushSync` in Login.tsx** — forces React to flush the AuthProvider state update synchronously before `setLocation` executes:
```tsx
import { flushSync } from "react-dom";
flushSync(() => setToken(data.token));
setLocation("/dashboard");
```

**2. `ProtectedRoute` reads localStorage directly** — not from React context — so even if state is stale, the token presence check is authoritative:
```tsx
function ProtectedRoute({ component: Component }) {
  const token = localStorage.getItem("v8_token");
  if (!token) return <Redirect to="/login" />;
  return <Component />;
}
```

**Why:** React state updates are asynchronous / batched. Relying only on context state for auth guard during a navigation triggered by state change causes a one-render race where the guard fires before the state propagates.

**How to apply:** Whenever a protected page guard depends on React state that was just set right before navigation, use flushSync at the setter call site OR check the authoritative synchronous source (localStorage) in the guard directly.

## Additional related fix
`setAuthTokenGetter(() => localStorage.getItem("v8_token"))` must be called at **module level** in `use-auth.tsx` (outside any function/hook) so `customFetch` from `@workspace/api-client-react` includes the `Authorization: Bearer` header on all generated API hooks from the very first import.

## API endpoint note
Audit logs route is `/api/audit` (NOT `/api/audit-logs`). Report download uses `authFetch` blob approach — NOT direct `<a href>` — because browser navigation bypasses the Authorization header.
