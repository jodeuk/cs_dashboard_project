// utils/date.js
export const toKST = (s) => new Date(String(s).replace(/Z?$/, "+09:00"));

export const rangeKST = (start, end) => ({
  startKST: new Date(`${start}T00:00:00.000+09:00`),
  endKST: new Date(`${end}T23:59:59.999+09:00`),
});
