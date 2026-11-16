// The prototype has no back end, so the planning state lives in sessionStorage
// and survives a reload. `memory` also covers browsers where storage is blocked.
const KEY = "tb-prototype-state";
let memory: string | null | undefined;
const listeners = new Set<() => void>();

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function read(): string | null {
  if (memory === undefined) {
    try {
      memory = sessionStorage.getItem(KEY);
    } catch {
      memory = null;
    }
  }
  return memory;
}

export function write(value: string | null) {
  memory = value;
  try {
    if (value === null) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, value);
  } catch {
    // Storage unavailable: `memory` still holds the state for this page.
  }
  listeners.forEach((listener) => listener());
}
