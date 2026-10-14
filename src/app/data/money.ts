/** Multiply decimal inputs exactly and round the resulting line amount to cents. */
export const amountCents = (quantity: number, unitPrice: number) => {
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return NaN;
  const decimal = (value: number) => {
    const [mantissa, exponent = '0'] = Math.abs(value).toString().toLowerCase().split('e');
    const [integer, fraction = ''] = mantissa.split('.');
    return { coefficient: BigInt(`${integer}${fraction}`) * (value < 0 ? -1n : 1n), exponent: Number(exponent) - fraction.length };
  };
  const first = decimal(quantity);
  const second = decimal(unitPrice);
  const product = first.coefficient * second.coefficient;
  const shift = first.exponent + second.exponent + 2;
  if (shift >= 0) return Number(product * 10n ** BigInt(shift));
  const divisor = 10n ** BigInt(-shift);
  const magnitude = product < 0n ? -product : product;
  const rounded = (magnitude + divisor / 2n) / divisor;
  return Number(product < 0n ? -rounded : rounded);
};

export const lineValue = (quantity: number, unitPrice: number) => amountCents(quantity, unitPrice) / 100;

export const hasTwoDecimalPlaces = (value: number) =>
  Number.isFinite(value) && Number(value.toFixed(2)) === value;

export const sumMoney = (values: Iterable<number>) => {
  let cents = 0;
  for (const value of values) cents += amountCents(value, 1);
  return cents / 100;
};
