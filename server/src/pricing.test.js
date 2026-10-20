// No database needed: node src/pricing.test.js
const assert = require('assert'); const { priceLines, settle } = require('./modules/sales/pricing');
const t = (name, fn) => { try { fn(); console.log('PASS', name); } catch (e) { console.log('FAIL', name, e.message); process.exitCode = 1; } };
t('discount spreads over lines and VAT follows the discounted price', () => {
  const p = priceLines([{ lt: 64000, rate: 16 }], 3000); assert.deepStrictEqual([p.sub, p.total, p.tax], [64000, 61000, 8414]);
});
t('discount split across two lines adds up exactly', () => {
  const p = priceLines([{ lt: 10000, rate: 0 }, { lt: 20001, rate: 16 }], 1001); assert.strictEqual(p.lines.reduce((s, l) => s + l.discount, 0), 1001); assert.strictEqual(p.total, 30001 - 1001);
});
t('discount larger than the sale is refused', () => assert.throws(() => priceLines([{ lt: 100, rate: 0 }], 101), /more than the sale total/));
t('exempt items carry no VAT', () => assert.strictEqual(priceLines([{ lt: 21000, rate: 0 }], 0).tax, 0));
t('split payment: M-Pesa plus cash gives change from cash only', () => {
  const s = settle(61000, [{ method: 'MPESA', amount: 30000, reference: 'QWE123' }, { method: 'CASH', amount: 50000, reference: '' }]);
  assert.strictEqual(s.change, 19000); assert.deepStrictEqual(s.recorded.map(p => [p.method, p.amount]), [['CASH', 31000], ['MPESA', 30000]]);
  assert.strictEqual(s.recorded.reduce((a, p) => a + p.amount, 0), 61000);
});
t('short payment is refused', () => assert.throws(() => settle(1000, [{ method: 'CASH', amount: 999, reference: '' }]), /less than the amount due/));
t('M-Pesa and card cannot overpay', () => assert.throws(() => settle(1000, [{ method: 'MPESA', amount: 1500, reference: 'X1' }]), /cannot be more/));
t('M-Pesa needs a code', () => assert.throws(() => settle(1000, [{ method: 'MPESA', amount: 1000, reference: '' }]), /code or card reference/));
t('two cash rows are combined before change is taken', () => {
  const s = settle(1000, [{ method: 'CASH', amount: 600, reference: '' }, { method: 'CASH', amount: 600, reference: '' }]); assert.deepStrictEqual(s.recorded, [{ method: 'CASH', amount: 1000, reference: '' }]);
});
