/**
 * Checks the Tagalog strings (src/i18n/tl.ts) against the code.
 *   - every English literal passed to tr('...') has a Tagalog entry
 *     (t('...') is already checked by TypeScript);
 *   - a {placeholder} in the English text is in the Tagalog too, and the other way round;
 *   - no Tagalog entry is empty.
 * Usage: node scripts/check-i18n.cjs        (exit code 1 when something is wrong)
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const SRC = path.join(__dirname, '..', 'src');
const tlSource = fs.readFileSync(path.join(SRC, 'i18n', 'tl.ts'), 'utf8');
const sf = ts.createSourceFile('tl.ts', tlSource, ts.ScriptTarget.Latest, true);

const dict = new Map();
(function find(node) {
  if (ts.isPropertyAssignment(node) && (ts.isStringLiteral(node.name) || ts.isNoSubstitutionTemplateLiteral(node.name)) && ts.isStringLiteral(node.initializer)) {
    dict.set(node.name.text, node.initializer.text);
  }
  ts.forEachChild(node, find);
})(sf);

const problems = [];
const placeholders = (s) => (s.match(/\{[a-zA-Z0-9_]+\}/g) || []).sort().join(',');
for (const [english, tagalog] of dict) {
  if (!tagalog.trim()) problems.push(`empty Tagalog for: ${english}`);
  if (placeholders(english) !== placeholders(tagalog)) problems.push(`placeholders differ: "${english}" vs "${tagalog}"`);
}

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.(tsx?)$/.test(e.name) && e.name !== 'tl.ts' ? [full] : [];
  });

let calls = 0;
for (const file of walk(SRC)) {
  const text = fs.readFileSync(file, 'utf8');
  if (!/\btr\(/.test(text)) continue;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  (function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText() === 'tr' && node.arguments[0]) {
      const arg = node.arguments[0];
      if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
        calls++;
        if (!dict.has(arg.text)) {
          const { line } = source.getLineAndCharacterOfPosition(arg.getStart());
          problems.push(`${path.relative(SRC, file)}:${line + 1}: no Tagalog for tr('${arg.text}')`);
        }
      }
    }
    ts.forEachChild(node, visit);
  })(source);
}

console.log(`${dict.size} Tagalog entries, ${calls} literal tr() calls checked.`);
if (problems.length) {
  problems.forEach((p) => console.log('PROBLEM', p));
  process.exit(1);
}
console.log('OK');
