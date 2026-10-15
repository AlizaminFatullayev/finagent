// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const designCss = fileURLToPath(new URL('../../../finagent-design/assets/fa.css', import.meta.url));
const globalsCss = fileURLToPath(new URL('./globals.css', import.meta.url));

/** Variables declared in the first block whose selector list starts with `selector`. */
function variables(css: string, selector: string): Record<string, string> {
  const start = css.search(new RegExp(`^${selector.replace('.', '\\.')}[ ,{]`, 'm'));
  if (start < 0) throw new Error(`block ${selector} not found`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

// The design export is a local, untracked reference: the guard runs wherever it is present.
describe.skipIf(!existsSync(designCss))('design tokens', () => {
  // Files are read inside the test: skipped suites still run their describe callback.
  it.each([':root', '.dark'])('%s matches fa.css name for name and value for value', (selector) => {
    const expected = variables(readFileSync(designCss, 'utf8'), selector);
    expect(Object.keys(expected).length).toBeGreaterThan(20);
    expect(variables(readFileSync(globalsCss, 'utf8'), selector)).toEqual(expected);
  });
});
