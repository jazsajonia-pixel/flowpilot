import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { positionForGraph, positionForViewport } from '../src/components/workflow/responsive-layout';

test('desktop layout preserves canonical workflow coordinates', () => {
  const position = { x: 240, y: 200 };
  assert.deepEqual(positionForViewport(position, false), position);
  assert.deepEqual(positionForGraph(position, false), position);
});

test('portrait layout turns a horizontal chain into a vertical stack and reverses edits losslessly', () => {
  const original = [{ x: 40, y: 200 }, { x: 240, y: 200 }, { x: 440, y: 200 }, { x: 640, y: 200 }];
  const mobile = original.map((position) => positionForViewport(position, true));

  assert.ok(mobile[0].y < mobile[1].y && mobile[1].y < mobile[2].y && mobile[2].y < mobile[3].y);
  assert.ok(mobile.every((position) => position.x === mobile[0].x));
  mobile[1] = { x: mobile[1].x + 30, y: mobile[1].y + 45 };
  const recovered = mobile.map((position) => positionForGraph(position, true));

  assert.ok(Math.abs(recovered[0].x - original[0].x) < 1e-9);
  assert.ok(Math.abs(recovered[0].y - original[0].y) < 1e-9);
  assert.ok(Math.abs(recovered[1].x - (original[1].x + 45 / 0.42)) < 1e-9);
  assert.ok(Math.abs(recovered[1].y - (original[1].y + 30 / 0.75)) < 1e-9);
});
