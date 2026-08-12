import type { PayloadAction } from "@reduxjs/toolkit";
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

export type Theme = "dark" | "darker" | "light" | "high-contrast";

const THEMES: readonly Theme[] = ["dark", "darker", "light", "high-contrast"];

function isTheme(value: string | null): value is Theme {
  return value !== null && (THEMES as readonly string[]).includes(value);
}

// The saved preference is authoritative post-login (via loadTheme()'s
// gateway fetch), but that fetch only fires once authStatus becomes
// "authenticated" — so the sign-in page would otherwise always render the
// hardcoded default below regardless of what the user last chose. Reading
// localStorage here means the very first render already has the right
// theme, matching the early inline read in index.html instead of racing it.
function initialTheme(): Theme {
  if (typeof localStorage === "undefined") return "dark";
  const saved = localStorage.getItem("veta-theme");
  return isTheme(saved) ? saved : "dark";
}

interface ThemeState {
  theme: Theme;
}

const initialState: ThemeState = { theme: initialTheme() };

const GATEWAY_PREFS_URL = `${import.meta.env.VITE_GATEWAY_URL ?? "/api/gateway"}/preferences`;

export const loadTheme = createAsyncThunk("theme/load", async () => {
  const res = await fetch(GATEWAY_PREFS_URL, { credentials: "include" });
  if (!res.ok) return null;
  const blob = (await res.json()) as Record<string, unknown>;
  return (blob?.theme ?? null) as Theme | null;
});

export const saveTheme = createAsyncThunk("theme/save", async (theme: Theme) => {
  const existing = await fetch(GATEWAY_PREFS_URL, { credentials: "include" })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  await fetch(GATEWAY_PREFS_URL, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...existing, theme }),
  });
});

export const themeSlice = createSlice({
  name: "theme",
  initialState,
  reducers: {
    setTheme(state, action: PayloadAction<Theme>) {
      state.theme = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loadTheme.fulfilled, (state, action) => {
      if (action.payload) state.theme = action.payload;
    });
  },
});

export const { setTheme } = themeSlice.actions;
