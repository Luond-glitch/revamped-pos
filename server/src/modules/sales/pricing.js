// Pure money rules (no database). All amounts are whole cents.
const { AppError } = require('../../errors');
const DISCOUNT_LIMIT_PCT = 5; // cashiers may discount up to this share of the sale; more needs 'sales.discount_large'

function priceLines(rows, discount) { // rows: [{ lt: line total before discount, rate: VAT % included in the price }]
  const sub = rows.reduce((t, r) => t + r.lt, 0);
  if (discount > sub) throw new AppError(400, 'Discount is more than the sale total.');
  let left = discount, total = 0, tax = 0;
  const lines = rows.map((r, i) => {
    const share = i === rows.length - 1 ? left : sub ? Math.round(r.lt * discount / sub) : 0; left -= share; // last line takes the rounding remainder
    const lt = r.lt - share, r100 = Math.round(r.rate * 100), lx = Math.round(lt * r100 / (10000 + r100)); // VAT is inside the price, on the discounted amount
    total += lt; tax += lx; return { lineTotal: lt, tax: lx, discount: share };
  });
  return { sub, total, tax, lines };
}

function settle(total, payments) { // change only ever comes from cash
  const cash = payments.filter(p => p.method === 'CASH').reduce((t, p) => t + p.amount, 0), other = payments.filter(p => p.method !== 'CASH');
  const paid = cash + other.reduce((t, p) => t + p.amount, 0);
  if (paid < total) throw new AppError(400, 'Payment is less than the amount due.');
  if (paid - cash > total) throw new AppError(400, 'Card and M-Pesa payments cannot be more than the amount due.');
  if (other.some(p => !p.reference)) throw new AppError(400, 'Enter the M-Pesa code or card reference.');
  const change = paid - total;
  return { paid, change, recorded: [...(cash - change > 0 ? [{ method: 'CASH', amount: cash - change, reference: '' }] : []), ...other] };
}
module.exports = { priceLines, settle, DISCOUNT_LIMIT_PCT };
