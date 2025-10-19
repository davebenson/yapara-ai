

// Values are single letters to interpolate.
// Some letters are modifiers for numbers:
//    digits can be used to left-pad to that width
//    digits starting with 0 left-pad with 0.
//    x, X - convert to hex (uppercase X for uppercase hex chars)
//    o - octal
//    ^  - add one to the number (convert 0 to 1-based numbering)
//
//
function isdigit(c) {
  return c >= '0' && c <= '9';
}

String.prototype.padStr = function(width, padChar) {
  return this.padStart(width, padChar);
};

const DEBUG_EVALUATION = false;

export function parseFormat(fmt, fmtConf) {
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
      let nTransform = 0;
      let transform = x => x;
      if (fmt[i + 1 + numDigits + nBaseMod] === '^') {
        nTransform = 1;
        transform = x => x+1;
      }
      const finalC = fmt[i + 1 + numDigits + nBaseMod + nTransform];
      i += numDigits + nBaseMod + nTransform + 1;

      if (fmtConf && !(finalC in fmtConf)) {
        throw new Error(`unexpected char ${finalC} in format string`);
      }

      if (literal !== '') {
        pieces.push(literal);
        literal = '';
      }

      if (DEBUG_EVALUATION) {
        pieces.push((params) => {
          const rawValue = params[finalC];
          console.log(`0: ${finalC} => ${rawValue}`);
          const xformedValue = transform(rawValue);
          console.log(`1: ${rawValue} => ${xformedValue}`);
          const formattedValue = numFormat(xformedValue);
          console.log(`2: => ${formattedValue}`);
          const rv = padder(formattedValue);
          console.log(`3: => ${rv}`);
          return rv;
        });
      } else {
        pieces.push((params) => padder(numFormat(transform(params[finalC]))));
      }
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

