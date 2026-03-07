import type { PayloadAction } from "@reduxjs/toolkit";
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

export type Theme = "dark" | "darker" | "light" | "high-contrast";

interface ThemeState {
  theme: Theme;
}

const initialState: ThemeState = { theme: "dark" };

export const loadTheme = createAsyncThunk("theme/load", async () => {
  const res = await fetch("/api/gateway/preferences");
  if (!res.ok) return null;
  const blob = (await res.json()) as Record<string, unknown>;
  return (blob?.theme ?? null) as Theme | null;
});

export const saveTheme = createAsyncThunk("theme/save", async (theme: Theme) => {
  const existing = await fetch("/api/gateway/preferences")
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  await fetch("/api/gateway/preferences", {
    method: "PUT",
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
