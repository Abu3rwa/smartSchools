const DIGIT_GROUP = /^\d{1,3}(?:,\d{3})+$/;

const gcd = (left, right) => (right === 0n ? left : gcd(right, left % right));

export const makeRational = (numerator, denominator = 1n) => {
  if (denominator === 0n) return null;
  let num = BigInt(numerator);
  let den = BigInt(denominator);
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const divisor = gcd(num < 0n ? -num : num, den);
  if (divisor === 0n) return { num, den };
  return { num: num / divisor, den: den / divisor };
};

export const rationalCompare = (left, right) => {
  const lhs = left.num * right.den;
  const rhs = right.num * left.den;
  if (lhs === rhs) return 0;
  return lhs < rhs ? -1 : 1;
};

export const rationalSubtract = (left, right) => makeRational(
  left.num * right.den - right.num * left.den,
  left.den * right.den
);

export const rationalAbs = (value) => makeRational(value.num < 0n ? -value.num : value.num, value.den);

export const rationalToNumber = (value) => Number(value.num) / Number(value.den);

export const rationalToText = (value, maxDigits = 12) => {
  const factor = 10n ** BigInt(maxDigits);
  const magnitude = value.num < 0n ? -value.num : value.num;
  const scaled = magnitude * factor / value.den;
  const whole = scaled / factor;
  const fraction = scaled % factor;
  const sign = value.num < 0n && scaled !== 0n ? '-' : '';
  if (fraction === 0n) return `${sign}${whole}`;
  const digits = String(fraction).padStart(maxDigits, '0').replace(/0+$/, '');
  return `${sign}${whole}.${digits}`;
};

export const roundRational = (value, decimalPlaces) => {
  const scale = 10n ** BigInt(decimalPlaces);
  const scaledNum = value.num * scale;
  const quotient = scaledNum / value.den;
  const remainder = scaledNum % value.den;
  const isNegative = value.num < 0n;
  const rounded = isNegative
    ? (remainder <= -value.den / 2n ? quotient : quotient - 1n)
    : (remainder * 2n >= value.den ? quotient + 1n : quotient);
  return makeRational(rounded, scale);
};

const parseDecimal = (rawDigits) => {
  const match = /^(\d*)(?:\.(\d+))?$/.exec(rawDigits);
  if (!match) return null;
  const integerPart = match[1] || '';
  const fractionPart = match[2] || '';
  if (!integerPart && !fractionPart) return null;
  const digits = `${integerPart}${fractionPart}` || '0';
  return makeRational(BigInt(digits), 10n ** BigInt(fractionPart.length));
};

/**
 * Parse one authored value or student entry into an exact rational.
 * Options: allowFractions, allowPercent, thousands ('allow' | 'reject').
 */
export const parseNumericValue = (rawInput, options = {}) => {
  const {
    allowFractions = false,
    allowPercent = false,
    thousands = 'allow'
  } = options;

  const raw = String(rawInput ?? '').trim();
  if (!raw) return null;

  let working = raw.replace(/[\u00A0\u2007\u202F]/g, ' ').trim();
  let isPercent = false;
  if (allowPercent && /%$/.test(working)) {
    isPercent = true;
    working = working.slice(0, -1).trim();
  }

  let sign = 1n;
  if (working.startsWith('+')) working = working.slice(1).trim();
  else if (working.startsWith('-')) {
    sign = -1n;
    working = working.slice(1).trim();
  }
  if (working.startsWith('\u2212')) {
    sign = -1n;
    working = working.slice(1).trim();
  }

  let value = null;
  const fractionMatch = /^(\d+)\s*\/\s*(\d+)$/.exec(working);
  const plainDecimal = /^-?\d*\.?\d+$/.test(working.replace(/,/g, ''));

  if (allowFractions && fractionMatch) {
    const denominator = BigInt(fractionMatch[2]);
    if (denominator === 0n) return null;
    value = makeRational(BigInt(fractionMatch[1]), denominator);
  } else if (DIGIT_GROUP.test(working) && thousands === 'allow') {
    value = parseDecimal(working.replace(/,/g, ''));
  } else if (working.includes(',') ) {
    if (thousands === 'allow') value = parseDecimal(working.replace(/,/g, ''));
  } else if (plainDecimal) {
    value = parseDecimal(working);
  }

  if (!value) return null;
  const signed = makeRational(sign * value.num, value.den);
  return isPercent ? makeRational(signed.num, signed.den * 100n) : signed;
};

export const normalizeUnit = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, '')
  .replace(/\u00B0/g, 'deg')
  .replace(/[\u2032\uFF07]/g, "'")
  .replace(/[\u2033\uFF22]/g, '"');

/**
 * Split a student entry into the numeric part and a trailing unit. Only alphabetic and
 * common symbol suffixes are treated as units so the number itself stays intact.
 */
export const splitNumericAndUnit = (rawInput) => {
  const raw = String(rawInput ?? '').trim();
  const match = /^(-?\s*\+?\s*[\d,.]+\s*(?:\/\s*[\d,.]+)?\s*%?)\s*(.*)$/.exec(raw);
  if (!match) return { numericText: raw, unitText: '' };
  return { numericText: match[1].trim(), unitText: match[2].trim() };
};

export const gradeNumericAgainstRule = (rawInput, rule = {}) => {
  const mode = String(rule.mode || 'exact').trim().toLowerCase();
  const parsedInput = splitNumericAndUnit(rawInput);
  const value = parseNumericValue(parsedInput.numericText, {
    allowFractions: Boolean(rule.allowFractions),
    allowPercent: Boolean(rule.allowPercent)
  });
  if (!value) {
    return { matched: false, reason: 'not_a_number', raw: String(rawInput ?? '').trim() };
  }

  const requiredUnit = normalizeUnit(rule.unit);
  const givenUnit = normalizeUnit(parsedInput.unitText);
  if (requiredUnit) {
    if (!givenUnit) return { matched: false, reason: 'missing_unit', value, unit: givenUnit };
    if (givenUnit !== requiredUnit) return { matched: false, reason: 'wrong_unit', value, unit: givenUnit };
  } else if (givenUnit && rule.rejectUnits !== false) {
    return { matched: false, reason: 'unexpected_unit', value, unit: givenUnit };
  }

  const decimalPlaces = Number.isFinite(Number(rule.decimalPlaces)) && rule.decimalPlaces !== null && rule.decimalPlaces !== ''
    ? Math.max(0, Math.floor(Number(rule.decimalPlaces)))
    : null;

  const compareWithin = (target, tolerance) => {
    const left = decimalPlaces === null ? value : roundRational(value, decimalPlaces);
    const difference = rationalAbs(rationalSubtract(left, target));
    if (tolerance === null) return rationalCompare(difference, { num: 0n, den: 1n }) === 0;
    return rationalCompare(difference, tolerance) <= 0;
  };

  if (mode === 'range') {
    const min = parseNumericValue(rule.min, { allowFractions: true });
    const max = parseNumericValue(rule.max, { allowFractions: true });
    if (!min || !max) return { matched: false, reason: 'invalid_rule', value };
    const matched = rationalCompare(value, min) >= 0 && rationalCompare(value, max) <= 0;
    return { matched, reason: matched ? 'in_range' : 'out_of_range', value };
  }

  const target = parseNumericValue(rule.value, {
    allowFractions: Boolean(rule.allowFractions),
    allowPercent: true
  });
  if (!target) return { matched: false, reason: 'invalid_rule', value };

  const absoluteTolerance = rule.tolerance === undefined || rule.tolerance === null || rule.tolerance === ''
    ? null
    : parseNumericValue(rule.tolerance, { allowFractions: true });
  if (rule.tolerance && !absoluteTolerance) return { matched: false, reason: 'invalid_rule', value };

  if (mode === 'relative' && absoluteTolerance) {
    // Teachers author the window as a whole percent (25 means 25%), so the number is a
    // proportion only after dividing by 100.
    const tolerance = makeRational(target.num * absoluteTolerance.num, target.den * absoluteTolerance.den * 100n);
    return {
      matched: compareWithin(target, rationalAbs(tolerance)),
      reason: 'relative_tolerance',
      value
    };
  }

  const matched = compareWithin(target, mode === 'exact' && !absoluteTolerance ? null : absoluteTolerance);
  return {
    matched,
    reason: matched ? 'exact' : (absoluteTolerance ? 'outside_tolerance' : 'not_equal'),
    value
  };
};

export const describeNumericRule = (rule = {}) => {
  const parts = [];
  const mode = String(rule.mode || 'exact').toLowerCase();
  if (mode === 'range') parts.push(`between ${rule.min} and ${rule.max}`);
  else parts.push(`${rule.value}${mode === 'relative' ? ' (relative)' : ''}`);
  if (rule.tolerance) parts.push(`tolerance ${rule.tolerance}`);
  if (rule.unit) parts.push(`unit ${rule.unit}`);
  if (rule.decimalPlaces !== null && rule.decimalPlaces !== undefined && rule.decimalPlaces !== '') {
    parts.push(`${rule.decimalPlaces} decimal places`);
  }
  return parts.join(', ');
};
