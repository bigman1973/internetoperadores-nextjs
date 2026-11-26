'use strict';
// Fuente real transpilada, loader local stub. Sin red, servidor, sesión ni BD.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'components/io-ui/fonts.ts'), 'utf8');
const calls = [];
const moduleExports = {};
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
vm.runInNewContext(code, {
  exports: moduleExports,
  require(id) {
    assert.equal(id, 'next/font/local');
    return options => { calls.push(options); return { variable: `local-${options.variable}` }; };
  },
}, { filename: 'components/io-ui/fonts.ts' });
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
const expected = [
  { variable: '--io-f-body', file: 'RobotoLatin.woff2', weights: ['400', '500', '700'], sha: '0a44e0bb6ba5c8537e8814c148ef7755f1bce12112361231f595ecc584a18d7a' },
  { variable: '--io-f-display', file: 'RobotoCondensedLatin.woff2', weights: ['500', '700'], sha: '718ced55c5d8e207d6d14b1765fe6cf5886882834f45cc0ad23283cd210f9a96' },
  { variable: '--io-f-mono', file: 'RobotoMonoLatin.woff2', weights: ['400', '500'], sha: '2ed6ac9efae6d21f51b2946176a0eef79a4043d643f9ac976e66d7fc4d57803a' },
];
check('sólo tres cargadores locales', () => assert.equal(calls.length, 3));
check('sin import next/font/google ni URL remota', () => assert.ok(!/next\/font\/google|https?:\/\//.test(source)));
expected.forEach((entry, i) => {
  const call = calls[i];
  check(`${entry.variable}: misma variable y display swap`, () => { assert.equal(call.variable, entry.variable); assert.equal(call.display, 'swap'); });
  check(`${entry.variable}: mismos pesos y estilo normal`, () => {
    assert.deepEqual(Array.from(call.src, s => s.weight), entry.weights);
    assert.ok(call.src.every(s => s.style === 'normal' && s.path === `./fonts/${entry.file}`));
  });
  check(`${entry.variable}: WOFF2 sin transformar del staging validado`, () => {
    const binary = fs.readFileSync(path.join(root, 'components/io-ui/fonts', entry.file));
    assert.equal(binary.subarray(0, 4).toString(), 'wOF2');
    assert.equal(crypto.createHash('sha256').update(binary).digest('hex'), entry.sha);
  });
});
check('export ioFontClasses conserva orden cuerpo/títulos/cifras', () => assert.equal(moduleExports.ioFontClasses, 'local---io-f-body local---io-f-display local---io-f-mono'));
check('licencias completas de las tres familias', () => {
  for (const family of ['roboto', 'robotocondensed', 'robotomono']) {
    const text = fs.readFileSync(path.join(root, `components/io-ui/fonts/${family}-OFL.txt`), 'utf8');
    assert.ok(text.includes('Copyright') && text.includes('SIL OPEN FONT LICENSE Version 1.1') && text.includes('DISCLAIMER'));
  }
});
check('conserva también el aviso Apache del WOFF2 histórico', () => {
  const text = fs.readFileSync(path.join(root, 'components/io-ui/fonts/Apache-2.0.txt'), 'utf8');
  assert.ok(text.includes('Apache License') && text.includes('Version 2.0, January 2004'));
});
console.log(`OK ${passed}/${passed}: fuentes locales, mismos archivos/pesos/variables; red 0, BD 0.`);
