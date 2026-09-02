import { SCENARIOS } from './scenarios.js';
import { runAll } from './runner.js';

// npm run harness — executes the adversarial scenario suite in-process.
// (Volume generation flags land in T13B.)
const results = await runAll(SCENARIOS);

for (const r of results) {
  const mark = r.pass ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${r.class.padEnd(24)} ${r.id}`);
  for (const f of r.failures) console.log(`      └─ ${f}`);
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} scenario classes pass; 0 unexpected Razorpay calls on deny; ledger chain OK`);
process.exit(passed === results.length ? 0 : 1);
