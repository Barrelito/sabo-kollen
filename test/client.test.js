import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { requestJson, submitReport, escapeHtml, buildReportsUrl, finishReportSubmission, selectedDeficiencies, createReportRequestGate, filterForPrint } from '../script.js';

describe('frontend API errors', () => {
  test('turns network failures into useful Swedish feedback', async () => {
    await assert.rejects(
      requestJson('/api/residences', {}, async () => { throw new TypeError('fetch failed'); }),
      /Kunde inte nå servern/
    );
  });

  test('does not run the success callback after a rejected report', async () => {
    let success = false;
    await assert.rejects(
      submitReport({}, () => { success = true; }, async () => ({ ok: false, status: 503, json: async () => ({ error: 'Databasen är tillfälligt otillgänglig.' }) })),
      /Databasen är tillfälligt otillgänglig/
    );
    assert.equal(success, false);
  });
});

test('captures the submitted form before awaiting and resets that form after success', async () => {
  let reset = false;
  const form = { reset() { reset = true; } };
  const event = { currentTarget: form };
  await finishReportSubmission(event, async () => { event.currentTarget = null; });
  assert.equal(reset, true);
});

test('does not submit hidden deficiencies for a complete folder', () => {
  assert.equal(selectedDeficiencies('JA', ['ID-band']), '');
  assert.equal(selectedDeficiencies('NEJ', ['ID-band', 'Läkemedelslista']), 'ID-band, Läkemedelslista');
});

test('the residence-only print keeps the residence and clears calendar dates', () => {
  assert.deepEqual(
    filterForPrint({ boende: 'Solgläntan', fromDate: '2026-01-01', toDate: '2026-01-31' }, true),
    { boende: 'Solgläntan', fromDate: '', toDate: '' }
  );
});

test('report request gate blocks duplicate appends and discards superseded responses', () => {
  const gate = createReportRequestGate();
  const first = gate.start(true);
  assert.equal(gate.start(true), null);
  const replacement = gate.start(false);
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(replacement), true);
  gate.finish(first);
  assert.equal(gate.start(true), null);
  gate.finish(replacement);
  assert.notEqual(gate.start(true), null);
});

test('escapes every stored text field used in generated HTML', () => {
  assert.equal(escapeHtml(`<img src=x onerror="alert('x')">`), '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;');
});

test('builds encoded filter URLs without concatenating executable query syntax', () => {
  assert.equal(
    buildReportsUrl({ boende: 'A&B', fromDate: '2026-03-29', toDate: '2026-03-29' }, 50, 0),
    '/api/admin/reports?boende=A%26B&from=2026-03-29&to=2026-03-29&limit=50&offset=0'
  );
});
