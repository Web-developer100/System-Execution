// ---------------------------------------------------------------------------
// Global UI State Store (Zustand)
// ---------------------------------------------------------------------------
//
// Centralized state management for:
//   - Sidebar collapse state (persisted)
//   - Active scan tracking for real-time UI updates
//   - Toast queue management
//   - Theme preferences
//   - Command palette state

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── Toast Types ───────────────────────────────────────────────────────────

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "destructive" | "success" | "warning";
  duration?: number;
  createdAt: number;
}

// ── Active Scan State ─────────────────────────────────────────────────────

export interface ActiveScanState {
  scanId: number;
  target: string;
  status: string;
  progress: number;
  startedAt: string;
}

// ── UI Store Interface ────────────────────────────────────────────────────

export interface UIStore {
  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Command Palette
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;

  // Active Scans
  activeScans: ActiveScanState[];
  setActiveScans: (scans: ActiveScanState[]) => void;
  addActiveScan: (scan: ActiveScanState) => void;
  updateActiveScan: (scanId: number, updates: Partial<ActiveScanState>) => void;
  removeActiveScan: (scanId: number) => void;

  // Toast Queue (managed separately from sonner toasts)
  toastQueue: ToastItem[];
  addToast: (toast: Omit<ToastItem, "id" | "createdAt">) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;

  // Global Search
  globalSearchQuery: string;
  setGlobalSearchQuery: (query: string) => void;

  // Theme
  theme: "dark" | "light" | "system";
  setTheme: (theme: "dark" | "light" | "system") => void;

  // Scan progress polling (in milliseconds, 0 = disabled)
  scanPollInterval: number;
  setScanPollInterval: (interval: number) => void;
}

// ── Store Implementation ──────────────────────────────────────────────────

let toastCounter = 0;

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      // ── Sidebar ────────────────────────────────────────────────────────

      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      // ── Command Palette ────────────────────────────────────────────────

      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),

      // ── Active Scans ───────────────────────────────────────────────────

      activeScans: [],
      setActiveScans: (scans) => set({ activeScans: scans }),
      addActiveScan: (scan) =>
        set((s) => ({
          activeScans: s.activeScans.some((a) => a.scanId === scan.scanId)
            ? s.activeScans
            : [...s.activeScans, scan],
        })),
      updateActiveScan: (scanId, updates) =>
        set((s) => ({
          activeScans: s.activeScans.map((a) =>
            a.scanId === scanId ? { ...a, ...updates } : a,
          ),
        })),
      removeActiveScan: (scanId) =>
        set((s) => ({
          activeScans: s.activeScans.filter((a) => a.scanId !== scanId),
        })),

      // ── Toast Queue ────────────────────────────────────────────────────

      toastQueue: [],
      addToast: (toast) => {
        const id = `toast-${++toastCounter}-${Date.now()}`;
        set((s) => ({
          toastQueue: [
            ...s.toastQueue,
            { ...toast, id, createdAt: Date.now() },
          ],
        }));
        // Auto-remove after duration
        const duration = toast.duration ?? 5000;
        setTimeout(() => {
          get().removeToast(id);
        }, duration);
        return id;
      },
      removeToast: (id) =>
        set((s) => ({
          toastQueue: s.toastQueue.filter((t) => t.id !== id),
        })),
      clearToasts: () => set({ toastQueue: [] }),

      // ── Global Search ──────────────────────────────────────────────────

      globalSearchQuery: "",
      setGlobalSearchQuery: (query) => set({ globalSearchQuery: query }),

      // ── Theme ──────────────────────────────────────────────────────────

      theme: "dark",
      setTheme: (theme) => set({ theme }),

      // ── Scan Poll Interval ─────────────────────────────────────────────

      scanPollInterval: 5000,
      setScanPollInterval: (interval) => set({ scanPollInterval: interval }),
    }),
    {
      name: "v8-ui-store",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
        scanPollInterval: state.scanPollInterval,
      }),
    },
  ),
);

// ── Selector Hooks ────────────────────────────────────────────────────────

export const useActiveScansCount = () =>
  useUIStore((s) => s.activeScans.length);

export const useActiveScanById = (scanId: number) =>
  useUIStore((s) => s.activeScans.find((a) => a.scanId === scanId));

export const useHasActiveScan = () =>
  useUIStore((s) => s.activeScans.length > 0);
