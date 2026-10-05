/**
 * A number typed or pasted the Indonesian or the English way: "12,5" and "12.5" are both twelve and a half;
 * "1.000", "1,000" and "1 000" are all one thousand; "1.234,5" and "1,234.5" both work. A single separator followed
 * by exactly three digits (and not after a lone 0) is read as thousands. NaN when the text is not a number.
 * For tree measurements and counts; amounts that are usually small decimals (kg, doses, lab values) keep the plain
 * comma-or-dot reading.
 */
export function parseNum(raw: string): number {
  let s = String(raw ?? '')
    .trim()
    .replace(/(\d)[\s ](?=\d{3}(?:\D|$))/g, '$1');
  if (!s) return NaN;
  const dot = s.lastIndexOf('.');
  const comma = s.lastIndexOf(',');
  if (dot >= 0 && comma >= 0) {
    const dec = dot > comma ? '.' : ',';
    const grp = dec === '.' ? ',' : '.';
    const shape = new RegExp(`^-?\\d{1,3}(?:\\${grp}\\d{3})+\\${dec}\\d+$`);
    if (!shape.test(s)) return NaN;
    s = s.split(grp).join('').replace(dec, '.');
  } else if (/^-?[1-9]\d{0,2}([.,])\d{3}(?:\1\d{3})*$/.test(s)) {
    s = s.replace(/[.,]/g, '');
  } else {
    s = s.replace(',', '.');
  }
  return /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s) ? Number(s) : NaN;
}
