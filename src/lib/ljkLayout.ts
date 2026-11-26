export const A4_W = 210;
export const A4_H = 297;

// Ukuran 1 LJK Hemat Kertas (1 Halaman A4 dibagi 2: Atas & Bawah)
export const HALF_W = 210;
export const HALF_H = 148.5;
export const DEFAULT_LJK_CAPACITY = 40;

export const HALF_ANCHORS = {
  tl: { x: 10, y: 7 },
  tr: { x: 194, y: 7 },
  bl: { x: 10, y: 135.5 },
  br: { x: 194, y: 135.5 },
  size: 6,
};

export const FULL_ANCHORS = {
  tl: { x: 12, y: 12 },
  tr: { x: 190, y: 12 },
  bl: { x: 12, y: 277 },
  br: { x: 190, y: 277 },
  size: 8,
};

export const OPTIONS = ['A', 'B', 'C', 'D', 'E'] as const;

/**
 * Koordinat bulatan untuk LJK Hemat Kertas (Setengah A4: 210 x 148.5 mm)
 * Kapasitas Default 40 Soal (4 Kolom x 10 Baris: 1-10, 11-20, 21-30, 31-40)
 */
export function getHalfBubblePosition(questionNumber: number, optionIndex: number, offsetY = 0) {
  const col = Math.floor((questionNumber - 1) / 10); // 0, 1, 2, 3
  const row = (questionNumber - 1) % 10;             // 0..9

  const colStartX = [27, 70, 113, 156];
  const startX = colStartX[col] ?? 27;
  const startY = 58 + offsetY;
  const rowGap = 7.5;
  const colGap = 6.2;

  return {
    x: startX + optionIndex * colGap,
    y: startY + row * rowGap,
    radius: 2.25,
  };
}

/**
 * Koordinat bulatan untuk LJK 1 Halaman Penuh A4 (1-50 soal)
 */
export function getBubblePosition(questionNumber: number, optionIndex: number) {
  const isRightCol = questionNumber > 25;
  const row = isRightCol ? questionNumber - 26 : questionNumber - 1;

  const startX = isRightCol ? 124 : 34;
  const startY = 82;
  const rowGap = 7.4;
  const colGap = 9.5;

  return {
    x: startX + optionIndex * colGap,
    y: startY + row * rowGap,
    radius: 2.8,
  };
}
