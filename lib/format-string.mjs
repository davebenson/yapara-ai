

// Values are single letters to interpolate.
// Some letters are modifiers for numbers:
//    digits can be used to left-pad to that width
//    digits starting with 0 left-pad with 0.
//    x, X - convert to hex (uppercase X for uppercase hex chars)
//    o - octal
//
//
function isdigit(c) {
  return c >= '0' && c <= '9';
}

String.prototype.padStr = function(width, padChar) {
  return this.padStart(width, padChar);
};

export function parseFormat(fmt) {
  let literal = '';
  const pieces = [];
  for (let i = 0; i < fmt.length; i++) {
    if (fmt[i] !== '%') {
      literal += fmt[i];
    } else if (fmt[i+1] === '%') {
      literal += '%';
      i++;
    } else {
      let numDigits = 0;
      while (isdigit(fmt[i+1+numDigits])) {
        numDigits++;
      }
      let padder = (s) => s;
      if (numDigits > 0) {
        const n = parseInt(fmt.slice(i+1, i+1+numDigits), 10);
        const padChar = fmt[i+1] === '0' ? '0' : ' ';
        padder = (s) => s.padStr(n, padChar);
      }
      let numFormat = (x) => x.toString();
      let nBaseMod = 0;
      if (fmt[i+1+numDigits] === 'x') {
        numFormat = (x) => x.toString(16);
        nBaseMod = 1;
      } else if (fmt[i+1+numDigits] === 'X') {
        numFormat = (x) => x.toString(16).toUpperCase();
        nBaseMod = 1;
      } else if (fmt[i+1+numDigits] === 'o') {
        numFormat = (x) => x.toString(8);
        nBaseMod = 1;
      }
      const finalC = fmt[i + 1 + numDigits + nBaseMod];
      i += numDigits + nBaseMod + 1;

      if (literal !== '') {
        pieces.push(literal);
        literal = '';
      }

      pieces.push((params) => padder(numFormat(params[finalC])));
    }
  }
  if (literal !== '') {
    pieces.push(literal);
  }
  return pieces;
}

export function evaluateFormat(fmt, params) {
  const evalPiece = (x) => (typeof(x) === 'string')
                           ? x
                           : x(params);
  return fmt.map(evalPiece).join('');
}

