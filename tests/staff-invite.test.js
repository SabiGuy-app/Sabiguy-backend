const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeEmail,
  matchServicesToCatalog,
} = require('../src/modules/business/staff.service');

test('normalizeEmail trims and lowercases', () => {
  assert.equal(normalizeEmail('  Tunde@Example.COM '), 'tunde@example.com');
});

test('matchServicesToCatalog resolves names case-insensitively to catalog spelling', () => {
  const catalog = [{ serviceName: 'Haircut' }, { serviceName: 'Shape-up' }];
  assert.deepEqual(matchServicesToCatalog(['hAiRcUt'], catalog), ['Haircut']);
  assert.deepEqual(matchServicesToCatalog(['shape-up ', ' Haircut'], catalog), [
    'Shape-up',
    'Haircut',
  ]);
});

test('matchServicesToCatalog deduplicates', () => {
  const catalog = [{ serviceName: 'Fade' }, { serviceName: 'Dye' }];
  assert.deepEqual(matchServicesToCatalog(['Fade', 'fade', 'DYE'], catalog), [
    'Fade',
    'Dye',
  ]);
});

test('matchServicesToCatalog rejects unknown services', () => {
  const catalog = [{ serviceName: 'Fade' }];
  assert.throws(
    () => matchServicesToCatalog(['Braids'], catalog),
    (error) =>
      error.name === 'ValidationError' &&
      /Unknown service: "Braids"/.test(error.message),
  );
});

test('matchServicesToCatalog rejects empty or invalid input', () => {
  const catalog = [{ serviceName: 'Fade' }];
  assert.throws(() => matchServicesToCatalog([], catalog), {
    name: 'ValidationError',
  });
  assert.throws(() => matchServicesToCatalog(undefined, catalog), {
    name: 'ValidationError',
  });
  assert.throws(() => matchServicesToCatalog(['  '], catalog), {
    name: 'ValidationError',
  });
});

test('matchServicesToCatalog tolerates catalog entries without names', () => {
  const catalog = [{}, { serviceName: '' }, { serviceName: 'Locs' }];
  assert.deepEqual(matchServicesToCatalog(['locs'], catalog), ['Locs']);
});
