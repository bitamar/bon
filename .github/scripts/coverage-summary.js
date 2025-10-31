import fs from 'node:fs';
import path from 'node:path';

const [, , dir = 'api', label = 'Coverage'] = process.argv;
const file = path.join(process.cwd(), dir, 'coverage', 'coverage-summary.json');

if (!fs.existsSync(file)) process.exit(0);

const summary = JSON.parse(fs.readFileSync(file, 'utf8'));
const t = summary.total || {};
const pct = (n) => (typeof n === 'number' ? n.toFixed(2) : String(n ?? '0'));

const out = [
  `## ${label}`,
  `- Lines: ${pct(t.lines?.pct)}%`,
  `- Statements: ${pct(t.statements?.pct)}%`,
  `- Functions: ${pct(t.functions?.pct)}%`,
  `- Branches: ${pct(t.branches?.pct)}%`,
].join('\n');

console.log(out);

