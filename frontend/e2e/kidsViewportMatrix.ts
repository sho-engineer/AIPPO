// CSS viewport sizes, not claims of physical-device or iOS Safari coverage.
export const kidsPhonePairs = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];
export const kidsTabletViewports = [
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
];
export const kidsViewports = [
  ...kidsPhonePairs,
  ...kidsPhonePairs.map(({ width, height }) => ({ width: height, height: width })),
  ...kidsTabletViewports,
];
