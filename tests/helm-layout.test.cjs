const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sources = process.env.TRIM_SOURCE
  ? [process.env.TRIM_SOURCE]
  : ['src-app.html', 'app.html', 'docs/index.html'];

test('desktop feedback footer has a fixed height so live copy cannot resize the helm', () => {
  for (const path of sources) {
    const src = fs.readFileSync(path, 'utf8');
    const desktop = src.match(/@media\(min-width:760px\) and \(min-height:520px\)\{[\s\S]+?\n  \}/)?.[0];
    assert.ok(desktop, `${path}: desktop Helm layout CSS is extractable`);
    assert.match(desktop, /#pane-sim \.fx\{[^}]*flex:0 0 112px[^}]*height:112px[^}]*\}/);
    assert.match(desktop, /#pane-sim \.fx-zone\{overflow-y:auto\}/);
  }
});
