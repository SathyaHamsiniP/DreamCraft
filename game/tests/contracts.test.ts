import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import cases from '../../contracts/validation-cases.json';
import { parseLevel } from '../src/contracts';

describe('shared validation cases', () => {
  for (const item of cases) it(item.file, () => {
    const data = JSON.parse(readFileSync(new URL(`../../contracts/examples/${item.file}`, import.meta.url), 'utf8'));
    if (item.valid) expect(parseLevel(data)).toEqual(data);
    else expect(() => parseLevel(data)).toThrow();
  });
  for (const value of [NaN, Infinity, -Infinity]) it(`rejects ${value}`, () => {
    const level = JSON.parse(readFileSync(new URL('../../contracts/examples/flat.json', import.meta.url), 'utf8'));
    level.objects[0].x = value;
    expect(() => parseLevel(level)).toThrow();
  });
});
