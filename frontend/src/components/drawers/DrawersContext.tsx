import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

export type DrawerId = string;

export interface DrawersContextValue {
  openDrawers: DrawerId[];
  open: (id: DrawerId) => void;
  close: (id: DrawerId) => void;
  toggle: (id: DrawerId) => void;
  closeAll: () => void;
  isOpen: (id: DrawerId) => boolean;
  positionOf: (id: DrawerId) => number;
}

const NOOP = () => {};

const DrawersContext = createContext<DrawersContextValue>({
  openDrawers: [],
  open: NOOP,
  close: NOOP,
  toggle: NOOP,
  closeAll: NOOP,
  isOpen: () => false,
  positionOf: () => -1,
});

export function useDrawers(): DrawersContextValue {
  return useContext(DrawersContext);
}

export function DrawersProvider({ children }: { children: ReactNode }) {
  const [openDrawers, setOpenDrawers] = useState<DrawerId[]>([]);

  const open = useCallback((id: DrawerId) => {
    setOpenDrawers((current) => (current.includes(id) ? current : [id, ...current]));
  }, []);

  const close = useCallback((id: DrawerId) => {
    setOpenDrawers((current) => current.filter((d) => d !== id));
  }, []);

  const toggle = useCallback((id: DrawerId) => {
    setOpenDrawers((current) =>
      current.includes(id) ? current.filter((d) => d !== id) : [id, ...current]
    );
  }, []);

  const closeAll = useCallback(() => {
    setOpenDrawers([]);
  }, []);

  const value = useMemo<DrawersContextValue>(
    () => ({
      openDrawers,
      open,
      close,
      toggle,
      closeAll,
      isOpen: (id) => openDrawers.includes(id),
      positionOf: (id) => openDrawers.indexOf(id),
    }),
    [openDrawers, open, close, toggle, closeAll]
  );

  return <DrawersContext.Provider value={value}>{children}</DrawersContext.Provider>;
}
