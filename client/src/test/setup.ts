import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  // Node-environment tests (file parsing) have no DOM.
  if (typeof window === 'undefined') return;
  cleanup();
  window.sessionStorage.clear();
  window.localStorage.clear();
});
