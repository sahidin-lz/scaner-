import jsQR from 'jsqr';
import {
  HALF_W,
  HALF_H,
  HALF_ANCHORS,
  DEFAULT_LJK_CAPACITY,
  OPTIONS,
  getHalfBubblePosition,
} from './ljkLayout';
import { Exam, Student } from './ljkGenerator';

export type OmrSensitivity = 'sangat_peka' | 'tinggi' | 'normal';

export interface ScanResult {
  id?: string;
  examId?: string;
  studentId: string;
  presensi: string;
  nama: string;
  kelas: string;
  mapel: string;
  benar: number;
  salah: number;
  kosong: number;
  skor: number;
  statusRagu: boolean;
  detailJawaban: Record<string, string>;
  previewImage: string;
  anchorsDetected?: boolean;
  qrRead?: boolean;
  detectedMapel?: string;
  detectedExamId?: string;
  detectedJumlahSoal?: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface AnchorDetectionResult {
  locked: boolean;
  corners: {
    tl: Point2D | null;
    tr: Point2D | null;
    bl: Point2D | null;
    br: Point2D | null;
  };
  lockedCount: number;
  qrDetected?: boolean;
  readyToCapture?: boolean;
}

interface QrIdentityPayload {
  sId?: string;
  prs?: string;
  nm?: string;
  kls?: string;
  mpl?: string;
  jml?: number;
  eId?: string;
}

/**
 * Menghitung peta kecerahan khusus OMR (Blue-Suppressed Luminance):
 * Mendukung LJK Hitam Putih maupun LJK Berwarna lama (menekan warna biru cetak agar tidak mengganggu deteksi bulatan).
 */
function buildOmrLuminanceMap(
  imgData: Uint8ClampedArray,
  width: number,
  height: number
): Uint8Array {
  const lum = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < imgData.length; i += 4, j++) {
    const r = imgData[i];
    const g = imgData[i + 1];
    const b = imgData[i + 2];
    const baseGray = (r * 77 + g * 150 + b * 29) >> 8;
    const blueExcess = b > r + 22 ? ((b - r - 22) * 3) >> 2 : 0;
    const val = baseGray + blueExcess;
    lum[j] = val > 255 ? 255 : val;
  }
  return lum;
}

/**
 * Membaca QR Code Identitas Siswa secara agresif:
 * 1. Memotong area QR di kanan atas LJK (x=154..197mm, y=15..48mm), memperbesar 2.5x dengan interpolasi halus
 * 2. Menjalankan multi-pass Contrast Stretching & Adaptive Local Thresholding agar QR code padat/agak buram di HP tetap terbaca.
 */
function decodeLjkQrCode(
  sourceCanvas: HTMLCanvasElement,
  isWarped: boolean
): QrIdentityPayload | null {
  const tryParseQr = (rawText?: string | null): QrIdentityPayload | null => {
    if (!rawText) return null;
    try {
      const parsed = JSON.parse(rawText);
      if (parsed && typeof parsed === 'object') {
        return parsed as QrIdentityPayload;
      }
    } catch {
      // Abaikan jika bukan JSON
    }
    return null;
  };

  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || w === 0 || h === 0) return null;

  // 1. Jika sudah di-warp ke 1050x742, fokus langsung ke koordinat kotak QR (x=154..197mm, y=15..48mm) dengan upscale 2.6x
  const regions = isWarped
    ? [
        {
          sx: Math.floor((154 / HALF_W) * w),
          sy: Math.floor((15 / HALF_H) * h),
          sw: Math.ceil((43 / HALF_W) * w),
          sh: Math.ceil((33 / HALF_H) * h),
          scale: 2.6,
        },
        {
          sx: Math.floor((144 / HALF_W) * w),
          sy: Math.floor((10 / HALF_H) * h),
          sw: Math.ceil((60 / HALF_W) * w),
          sh: Math.ceil((46 / HALF_H) * h),
          scale: 2.2,
        },
      ]
    : [
        {
          sx: Math.floor(w * 0.58),
          sy: Math.floor(h * 0.04),
          sw: Math.floor(w * 0.4),
          sh: Math.floor(h * 0.44),
          scale: 1.8,
        },
      ];

  const cropCanvas = document.createElement('canvas');
  const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });

  if (cropCtx) {
    for (const reg of regions) {
      const targetW = Math.max(120, Math.round(reg.sw * reg.scale));
      const targetH = Math.max(120, Math.round(reg.sh * reg.scale));
      cropCanvas.width = targetW;
      cropCanvas.height = targetH;
      cropCtx.imageSmoothingEnabled = true;
      cropCtx.drawImage(
        sourceCanvas,
        Math.max(0, reg.sx),
        Math.max(0, reg.sy),
        Math.min(w - reg.sx, reg.sw),
        Math.min(h - reg.sy, reg.sh),
        0,
        0,
        targetW,
        targetH
      );

      const baseImg = cropCtx.getImageData(0, 0, targetW, targetH);
      const rawRes = jsQR(baseImg.data, targetW, targetH, {
        inversionAttempts: 'attemptBoth',
      });
      const parsedRaw = tryParseQr(rawRes?.data);
      if (parsedRaw) return parsedRaw;

      // Hitung min/max luminance di area QR untuk peregangan kontras & multi-threshold binarization
      const gray = new Uint8Array(targetW * targetH);
      let minG = 255;
      let maxG = 0;
      for (let i = 0, p = 0; i < baseImg.data.length; i += 4, p++) {
        const g =
          (baseImg.data[i] * 77 + baseImg.data[i + 1] * 150 + baseImg.data[i + 2] * 29) >> 8;
        gray[p] = g;
        if (g < minG) minG = g;
        if (g > maxG) maxG = g;
      }

      const span = Math.max(20, maxG - minG);
      const workData = new Uint8ClampedArray(baseImg.data.length);

      // Multi-threshold passes (0.38, 0.46, 0.53, 0.60, 0.67) untuk mengatasi kamera HP yang agak gelap/silau
      const ratios = [0.48, 0.55, 0.41, 0.62, 0.35];
      for (const ratio of ratios) {
        const thresh = minG + span * ratio;
        for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
          const v = gray[p] < thresh ? 0 : 255;
          workData[i] = v;
          workData[i + 1] = v;
          workData[i + 2] = v;
          workData[i + 3] = 255;
        }
        const binQr = jsQR(workData, targetW, targetH, {
          inversionAttempts: 'dontInvert',
        });
        const parsedBin = tryParseQr(binQr?.data);
        if (parsedBin) return parsedBin;
      }
    }
  }

  // Fallback: coba pada seluruh citra
  const fullData = ctx.getImageData(0, 0, w, h);
  const fullQr = jsQR(fullData.data, w, h, { inversionAttempts: 'dontInvert' });
  return tryParseQr(fullQr?.data);
}

/**
 * Mencari titik pusat blok hitam anchor (kotak hitam 6x6 mm) di suatu kuadran sudut.
 * Memverifikasi adanya "cincin kertas putih" (white moat) di sekeliling kotak hitam
 * agar tidak salah mengunci meja gelap di luar kertas atau banner kop ujian.
 */
function findDarkSquareInRegion(
  lum: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cornerType: 'tl' | 'tr' | 'bl' | 'br'
): Point2D | null {
  let sum = 0;
  let count = 0;
  let minVal = 255;

  const step = 2;
  for (let y = y0; y < y1; y += step) {
    const rowOffset = y * width;
    for (let x = x0; x < x1; x += step) {
      const v = lum[rowOffset + x];
      sum += v;
      count++;
      if (v < minVal) minVal = v;
    }
  }
  if (count === 0) return null;
  const avg = sum / count;
  if (avg - minVal < 22) return null;

  const darkThresh = Math.min(160, minVal + (avg - minVal) * 0.44);
  const brightMoatThresh = Math.max(darkThresh + 18, avg * 0.82);

  const winRadius = Math.max(2, Math.round(Math.min(width, height) * 0.013));
  const moatRadius = Math.max(winRadius + 3, Math.round(winRadius * 2.2));

  let bestScore = -1;
  let bestX = -1;
  let bestY = -1;

  const maxDist = Math.hypot(x1 - x0, y1 - y0) || 1;
  const cornerX = cornerType === 'tl' || cornerType === 'bl' ? x0 : x1;
  const cornerY = cornerType === 'tl' || cornerType === 'tr' ? y0 : y1;

  const searchX0 = Math.max(moatRadius, x0);
  const searchY0 = Math.max(moatRadius, y0);
  const searchX1 = Math.min(width - 1 - moatRadius, x1);
  const searchY1 = Math.min(height - 1 - moatRadius, y1);

  for (let y = searchY0; y < searchY1; y += 2) {
    for (let x = searchX0; x < searchX1; x += 2) {
      if (lum[y * width + x] > darkThresh) continue;

      let darkPixels = 0;
      let totalWin = 0;
      for (let dy = -winRadius; dy <= winRadius; dy++) {
        const rOff = (y + dy) * width;
        for (let dx = -winRadius; dx <= winRadius; dx++) {
          totalWin++;
          if (lum[rOff + x + dx] <= darkThresh) {
            darkPixels++;
          }
        }
      }

      const fillRatio = darkPixels / totalWin;
      if (fillRatio < 0.42) continue;

      const moatOffsets = [
        [-moatRadius, 0],
        [moatRadius, 0],
        [0, -moatRadius],
        [0, moatRadius],
        [-moatRadius, -moatRadius],
        [moatRadius, -moatRadius],
        [-moatRadius, moatRadius],
        [moatRadius, moatRadius],
      ];
      let brightSides = 0;
      for (let m = 0; m < moatOffsets.length; m++) {
        const mx = x + moatOffsets[m][0];
        const my = y + moatOffsets[m][1];
        if (lum[my * width + mx] >= brightMoatThresh) {
          brightSides++;
        }
      }
      if (brightSides < 5) continue;

      const distToCorner = Math.hypot(x - cornerX, y - cornerY);
      const cornerProximity = 1 - Math.min(1, distToCorner / maxDist);
      const moatBonus = brightSides / 8;
      const totalScore = fillRatio * 0.55 + moatBonus * 0.2 + cornerProximity * 0.25;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestX = x;
        bestY = y;
      }
    }
  }

  if (bestX < 0 || bestY < 0) return null;

  let cxSum = 0;
  let cySum = 0;
  let cWeight = 0;
  const refineR = winRadius + 2;
  for (let dy = -refineR; dy <= refineR; dy++) {
    const py = bestY + dy;
    if (py < 0 || py >= height) continue;
    for (let dx = -refineR; dx <= refineR; dx++) {
      const px = bestX + dx;
      if (px < 0 || px >= width) continue;
      const v = lum[py * width + px];
      if (v <= darkThresh) {
        const w = darkThresh - v + 1;
        cxSum += px * w;
        cySum += py * w;
        cWeight += w;
      }
    }
  }

  if (cWeight === 0) return { x: bestX, y: bestY };
  return {
    x: cxSum / cWeight,
    y: cySum / cWeight,
  };
}

/**
 * Deteksi 4 kotak hitam sudut (HALF_ANCHORS) secara real-time ala EvalBee.
 */
export function detectFourAnchors(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): AnchorDetectionResult {
  const imgData = ctx.getImageData(0, 0, width, height).data;
  const lum = buildOmrLuminanceMap(imgData, width, height);

  const qW = Math.floor(width * 0.36);
  const qH = Math.floor(height * 0.38);

  let tl = findDarkSquareInRegion(lum, width, height, 2, 2, qW, qH, 'tl');
  let tr = findDarkSquareInRegion(lum, width, height, width - qW, 2, width - 2, qH, 'tr');
  let bl = findDarkSquareInRegion(lum, width, height, 2, height - qH, qW, height - 2, 'bl');
  let br = findDarkSquareInRegion(
    lum,
    width,
    height,
    width - qW,
    height - qH,
    width - 2,
    height - 2,
    'br'
  );

  const rawCount = [tl, tr, bl, br].filter(Boolean).length;

  if (rawCount === 3) {
    if (!br && tl && tr && bl) {
      br = { x: tr.x + (bl.x - tl.x), y: tr.y + (bl.y - tl.y) };
    } else if (!bl && tl && tr && br) {
      bl = { x: tl.x + (br.x - tr.x), y: tl.y + (br.y - tr.y) };
    } else if (!tr && tl && bl && br) {
      tr = { x: tl.x + (br.x - bl.x), y: tl.y + (br.y - bl.y) };
    } else if (!tl && tr && bl && br) {
      tl = { x: tr.x + (bl.x - br.x), y: tr.y + (bl.y - br.y) };
    }
  }

  let geometryValid = false;

  if (tl && tr && bl && br) {
    const topW = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const botW = Math.hypot(br.x - bl.x, br.y - bl.y);
    const leftH = Math.hypot(bl.x - tl.x, bl.y - tl.y);
    const rightH = Math.hypot(br.x - tr.x, br.y - tr.y);

    const isConvexOrder =
      tr.x > tl.x + width * 0.25 &&
      br.x > bl.x + width * 0.25 &&
      bl.y > tl.y + height * 0.25 &&
      br.y > tr.y + height * 0.25;

    if (
      isConvexOrder &&
      topW > width * 0.35 &&
      botW > width * 0.35 &&
      leftH > height * 0.35 &&
      rightH > height * 0.35 &&
      Math.abs(topW - botW) < width * 0.32 &&
      Math.abs(leftH - rightH) < height * 0.32
    ) {
      geometryValid = true;
    }
  }

  return {
    locked: geometryValid,
    corners: { tl, tr, bl, br },
    lockedCount: rawCount,
  };
}

/**
 * Probe frame kamera HP secara real-time:
 * Mengunci jika 4 sudut anchor valid (atau 3 sudut + QR code terbaca).
 */
export function probeLiveFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): AnchorDetectionResult {
  const anchorRes = detectFourAnchors(ctx, width, height);
  if (anchorRes.locked && anchorRes.lockedCount >= 4) {
    return {
      ...anchorRes,
      qrDetected: false,
      readyToCapture: true,
    };
  }

  let qrDetected = false;
  if (anchorRes.lockedCount >= 2) {
    try {
      const imgData = ctx.getImageData(0, 0, width, height);
      const qr = jsQR(imgData.data, width, height, {
        inversionAttempts: 'dontInvert',
      });
      if (qr && qr.data) {
        qrDetected = true;
      }
    } catch {
      qrDetected = false;
    }
  }

  const readyToCapture =
    anchorRes.locked && (anchorRes.lockedCount >= 4 || qrDetected);

  return {
    ...anchorRes,
    qrDetected,
    readyToCapture,
  };
}

/**
 * Menyelesaikan sistem persamaan linear 8x8 (Eliminasi Gauss) untuk matriks Homografi Perspektif 3x3
 */
function solveHomographyMatrix(
  dstPts: [Point2D, Point2D, Point2D, Point2D],
  srcPts: [Point2D, Point2D, Point2D, Point2D]
): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const x = dstPts[i].x;
    const y = dstPts[i].y;
    const u = srcPts[i].x;
    const v = srcPts[i].y;

    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    b.push(v);
  }

  const n = 8;
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(A[col][col]);
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(A[row][col]);
      if (val > maxVal) {
        maxVal = val;
        pivotRow = row;
      }
    }
    if (maxVal < 1e-10) return null;

    if (pivotRow !== col) {
      const tmpRow = A[col];
      A[col] = A[pivotRow];
      A[pivotRow] = tmpRow;
      const tmpB = b[col];
      b[col] = b[pivotRow];
      b[pivotRow] = tmpB;
    }

    const pivot = A[col][col];
    for (let j = col; j < n; j++) {
      A[col][j] /= pivot;
    }
    b[col] /= pivot;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = A[row][col];
      for (let j = col; j < n; j++) {
        A[row][j] -= factor * A[col][j];
      }
      b[row] -= factor * b[col];
    }
  }

  return b;
}

/**
 * Melakukan pelurusan perspektif 4-titik (True 8-DOF Projective Homography Warp)
 */
export function warpPerspectiveFromAnchors(
  sourceCanvas: HTMLCanvasElement,
  corners: { tl: Point2D; tr: Point2D; bl: Point2D; br: Point2D },
  targetW = 1050,
  targetH = 742
): HTMLCanvasElement {
  const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true })!;
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;
  const srcData = srcCtx.getImageData(0, 0, sw, sh).data;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = targetW;
  outCanvas.height = targetH;
  const outCtx = outCanvas.getContext('2d', { willReadFrequently: true })!;
  const outImg = outCtx.createImageData(targetW, targetH);
  const dstData = outImg.data;

  const halfSize = HALF_ANCHORS.size / 2;
  const idealTL: Point2D = {
    x: ((HALF_ANCHORS.tl.x + halfSize) / HALF_W) * targetW,
    y: ((HALF_ANCHORS.tl.y + halfSize) / HALF_H) * targetH,
  };
  const idealTR: Point2D = {
    x: ((HALF_ANCHORS.tr.x + halfSize) / HALF_W) * targetW,
    y: ((HALF_ANCHORS.tr.y + halfSize) / HALF_H) * targetH,
  };
  const idealBR: Point2D = {
    x: ((HALF_ANCHORS.br.x + halfSize) / HALF_W) * targetW,
    y: ((HALF_ANCHORS.br.y + halfSize) / HALF_H) * targetH,
  };
  const idealBL: Point2D = {
    x: ((HALF_ANCHORS.bl.x + halfSize) / HALF_W) * targetW,
    y: ((HALF_ANCHORS.bl.y + halfSize) / HALF_H) * targetH,
  };

  const H = solveHomographyMatrix(
    [idealTL, idealTR, idealBR, idealBL],
    [corners.tl, corners.tr, corners.br, corners.bl]
  );

  const anchorSpanW = idealTR.x - idealTL.x;
  const anchorSpanH = idealBL.y - idealTL.y;

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      let srcX: number;
      let srcY: number;

      if (H) {
        const denom = H[6] * x + H[7] * y + 1;
        srcX = (H[0] * x + H[1] * y + H[2]) / denom;
        srcY = (H[3] * x + H[4] * y + H[5]) / denom;
      } else {
        const u = (x - idealTL.x) / anchorSpanW;
        const v = (y - idealTL.y) / anchorSpanH;
        srcX =
          (1 - u) * (1 - v) * corners.tl.x +
          u * (1 - v) * corners.tr.x +
          (1 - u) * v * corners.bl.x +
          u * v * corners.br.x;
        srcY =
          (1 - u) * (1 - v) * corners.tl.y +
          u * (1 - v) * corners.tr.y +
          (1 - u) * v * corners.bl.y +
          u * v * corners.br.y;
      }

      const ix = Math.min(sw - 1, Math.max(0, Math.round(srcX)));
      const iy = Math.min(sh - 1, Math.max(0, Math.round(srcY)));
      const srcIdx = (iy * sw + ix) * 4;
      const dstIdx = (y * targetW + x) * 4;

      dstData[dstIdx] = srcData[srcIdx];
      dstData[dstIdx + 1] = srcData[srcIdx + 1];
      dstData[dstIdx + 2] = srcData[srcIdx + 2];
      dstData[dstIdx + 3] = 255;
    }
  }

  outCtx.putImageData(outImg, 0, 0);
  return outCanvas;
}

/**
 * Mengukur tingkat penghitaman bulatan jawaban dengan sensitivitas tinggi:
 * - Menghitung meanCoreLum (rata-rata lingkaran dalam) DAN darkest35PctLum (rata-rata 35% piksel tergelap di dalam bulatan).
 * - Mengapa darkest35PctLum sangat penting?
 *   Ketika siswa mengisi jawaban dengan pensil tipis, arsiran tidak penuh, tanda silang (X), atau centang (✓),
 *   piksel gelap hanya menempati 30-50% luas bulatan. Dengan menggabungkan darkest35PctLum (58%) + meanCoreLum (42%),
 *   jawaban siswa tetap terdeteksi sangat tajam meskipun di bawah pencahayaan ruangan yang redup.
 */
function measureBubbleFill(
  lum: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radiusPx: number
): {
  bestX: number;
  bestY: number;
  coreLum: number;
  darkest35Lum: number;
  effLum: number;
  paperLum: number;
  darkRatio: number;
  fillScore: number;
} {
  const ringInnerR = radiusPx * 1.18;
  const ringOuterR = radiusPx * 1.65;
  const ringInnerR2 = ringInnerR * ringInnerR;
  const ringOuterR2 = ringOuterR * ringOuterR;

  const rx0 = Math.max(0, Math.floor(cx - ringOuterR));
  const ry0 = Math.max(0, Math.floor(cy - ringOuterR));
  const rx1 = Math.min(width - 1, Math.ceil(cx + ringOuterR));
  const ry1 = Math.min(height - 1, Math.ceil(cy + ringOuterR));

  const paperSamples: number[] = [];
  for (let py = ry0; py <= ry1; py += 2) {
    const dy = py - cy;
    const rowOff = py * width;
    for (let px = rx0; px <= rx1; px += 2) {
      const dx = px - cx;
      const d2 = dx * dx + dy * dy;
      if (d2 >= ringInnerR2 && d2 <= ringOuterR2) {
        paperSamples.push(lum[rowOff + px]);
      }
    }
  }

  paperSamples.sort((a, b) => a - b);
  const paperLum =
    paperSamples.length > 0
      ? Math.max(70, paperSamples[Math.floor(paperSamples.length * 0.72)])
      : 225;

  // Micro-search sliding window di sekitar pusat bulatan (±0.42 * radius)
  const coreR = Math.max(2.8, radiusPx * 0.72);
  const coreR2 = coreR * coreR;
  const shiftStep = Math.max(1.2, radiusPx * 0.22);
  const shifts = [-shiftStep * 1.6, -shiftStep * 0.8, 0, shiftStep * 0.8, shiftStep * 1.6];

  let minEffLum = 255;
  let bestCoreLum = 255;
  let bestDarkest35Lum = 255;
  let bestX = cx;
  let bestY = cy;
  let bestDarkRatio = 0;
  const darkPixelThresh = paperLum * 0.86;

  for (let sy = 0; sy < shifts.length; sy++) {
    const testCy = cy + shifts[sy];
    for (let sx = 0; sx < shifts.length; sx++) {
      const testCx = cx + shifts[sx];

      const bx0 = Math.max(0, Math.floor(testCx - coreR));
      const by0 = Math.max(0, Math.floor(testCy - coreR));
      const bx1 = Math.min(width - 1, Math.ceil(testCx + coreR));
      const by1 = Math.min(height - 1, Math.ceil(testCy + coreR));

      const corePixels: number[] = [];
      let sum = 0;
      let darkCount = 0;

      for (let py = by0; py <= by1; py++) {
        const dy = py - testCy;
        const rowOff = py * width;
        for (let px = bx0; px <= bx1; px++) {
          const dx = px - testCx;
          if (dx * dx + dy * dy <= coreR2) {
            const v = lum[rowOff + px];
            corePixels.push(v);
            sum += v;
            if (v < darkPixelThresh) {
              darkCount++;
            }
          }
        }
      }

      const count = corePixels.length;
      if (count > 0) {
        corePixels.sort((a, b) => a - b);
        const k35 = Math.max(1, Math.floor(count * 0.35));
        let sum35 = 0;
        for (let i = 0; i < k35; i++) {
          sum35 += corePixels[i];
        }
        const avgCore = sum / count;
        const avg35 = sum35 / k35;
        const effLum = avgCore * 0.42 + avg35 * 0.58;

        if (effLum < minEffLum) {
          minEffLum = effLum;
          bestCoreLum = avgCore;
          bestDarkest35Lum = avg35;
          bestX = testCx;
          bestY = testCy;
          bestDarkRatio = darkCount / count;
        }
      }
    }
  }

  const contrastDrop = Math.max(0, (paperLum - minEffLum) / Math.max(50, paperLum));
  const fillScore = contrastDrop * 0.65 + bestDarkRatio * 0.35;

  return {
    bestX,
    bestY,
    coreLum: bestCoreLum,
    darkest35Lum: bestDarkest35Lum,
    effLum: minEffLum,
    paperLum,
    darkRatio: bestDarkRatio,
    fillScore,
  };
}

/**
 * Kalibrasi otomatis pergeseran grid global (globalDx, globalDy) setelah warp
 */
function calibrateGlobalGridOffset(
  lum: Uint8Array,
  width: number,
  height: number,
  scaleX: number,
  scaleY: number,
  activeQuestionCount: number
): { dx: number; dy: number } {
  const candidatesX = [-6, -4, -2, 0, 2, 4, 6];
  const candidatesY = [-6, -4, -2, 0, 2, 4, 6];

  let bestOffset = { dx: 0, dy: 0 };
  let bestSharpness = -1;

  const sampleQuestions: number[] = [];
  for (let q = 1; q <= activeQuestionCount; q++) {
    sampleQuestions.push(q);
  }

  for (const dy of candidatesY) {
    for (const dx of candidatesX) {
      let rowSpreadSum = 0;
      for (const q of sampleQuestions) {
        let minLum = 255;
        let maxLum = 0;
        for (let optIdx = 0; optIdx < OPTIONS.length; optIdx++) {
          const pos = getHalfBubblePosition(q, optIdx, 0);
          const cx = Math.round(pos.x * scaleX + dx);
          const cy = Math.round(pos.y * scaleY + dy);
          const r = Math.max(2, Math.round(pos.radius * scaleX * 0.6));

          let s = 0;
          let c = 0;
          for (let py = Math.max(0, cy - r); py <= Math.min(height - 1, cy + r); py += 2) {
            const rowOff = py * width;
            for (let px = Math.max(0, cx - r); px <= Math.min(width - 1, cx + r); px += 2) {
              s += lum[rowOff + px];
              c++;
            }
          }
          const avg = c > 0 ? s / c : 240;
          if (avg < minLum) minLum = avg;
          if (avg > maxLum) maxLum = avg;
        }
        rowSpreadSum += maxLum - minLum;
      }

      const distPenalty = (Math.abs(dx) + Math.abs(dy)) * 0.35;
      const score = rowSpreadSum - distPenalty;
      if (score > bestSharpness) {
        bestSharpness = score;
        bestOffset = { dx, dy };
      }
    }
  }

  return bestOffset;
}

/**
 * Menghitung ulang skor ketika guru mengetuk bulatan/nomor jawaban secara manual (Tap-to-Correct).
 */
export function recalculateResultWithManualAnswers(
  prevResult: ScanResult,
  updatedDetailJawaban: Record<string, string>,
  exam: Exam
): ScanResult {
  const activeQuestionCount = Math.min(
    DEFAULT_LJK_CAPACITY,
    Math.max(1, exam.jumlahSoal)
  );
  let benar = 0;
  let salah = 0;
  let kosong = 0;
  let totalPoin = 0;
  let maxPoin = 0;
  let statusRagu = false;

  for (let q = 1; q <= activeQuestionCount; q++) {
    const qKey = exam.kunciJawaban[String(q)];
    if (!qKey) continue;
    maxPoin += qKey.weight;

    const ans = (updatedDetailJawaban[String(q)] || '-').toUpperCase().trim();
    if (!ans || ans === '-') {
      kosong++;
      continue;
    }

    if (ans === 'DOBEL') {
      salah++;
      statusRagu = true;
      continue;
    }

    if (qKey.type === 'PG') {
      if (ans.length > 1) {
        salah++;
        statusRagu = true;
      } else if (qKey.answers.includes(ans)) {
        benar++;
        totalPoin += qKey.weight;
      } else {
        salah++;
      }
    } else {
      const chosen = ans.split('').filter((c) => OPTIONS.includes(c as typeof OPTIONS[number]));
      let bCount = 0;
      let sCount = 0;
      chosen.forEach((c) => {
        if (qKey.answers.includes(c)) bCount++;
        else sCount++;
      });
      const kCount = qKey.answers.length;
      const poinSoal = Math.max(0, (bCount - sCount) / kCount) * qKey.weight;
      totalPoin += poinSoal;
      if (bCount === kCount && sCount === 0) benar++;
      else salah++;
    }
  }

  const skor = maxPoin > 0 ? Number(((totalPoin / maxPoin) * 100).toFixed(1)) : 0;

  return {
    ...prevResult,
    examId: exam.id,
    mapel: exam.mapel,
    benar,
    salah,
    kosong,
    skor,
    statusRagu,
    detailJawaban: updatedDetailJawaban,
  };
}

/**
 * Memproses frame kamera / foto LJK Setengah A4 (Default 40 Soal) dengan:
 * 1. Deteksi 4 Anchor Sudut Otomatis + 8-DOF Projective Homography Warp
 * 2. Pembacaan QR Code Multi-Pass Cropped & Upscaled (Nama, Presensi, Kelas, Mapel, Jumlah Soal)
 * 3. Deteksi Jawaban Siswa Sensitivitas Tinggi berbasis Darkest-35% Core Luminance & Row-Relative Signal-to-Noise
 */
export function processCameraFrame(
  canvas: HTMLCanvasElement,
  exam: Exam,
  students: Student[],
  sensitivity: OmrSensitivity = 'sangat_peka',
  allExams: Exam[] = []
): ScanResult {
  const rawCtx = canvas.getContext('2d', { willReadFrequently: true })!;

  // 1. Coba baca QR pada citra asli sebelum warp
  let qrPayload = decodeLjkQrCode(canvas, false);

  const anchorCheck = detectFourAnchors(rawCtx, canvas.width, canvas.height);

  // 2. Jika 4 anchor sudut terdeteksi, luruskan perspektif otomatis dengan matriks Homografi 8-DOF ke ukuran 1050x742
  if (
    anchorCheck.locked &&
    anchorCheck.corners.tl &&
    anchorCheck.corners.tr &&
    anchorCheck.corners.bl &&
    anchorCheck.corners.br
  ) {
    const warped = warpPerspectiveFromAnchors(
      canvas,
      {
        tl: anchorCheck.corners.tl,
        tr: anchorCheck.corners.tr,
        bl: anchorCheck.corners.bl,
        br: anchorCheck.corners.br,
      },
      1050,
      742
    );
    canvas.width = 1050;
    canvas.height = 742;
    rawCtx.drawImage(warped, 0, 0);
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const w = canvas.width;
  const h = canvas.height;

  // 3. Baca QR Code pada citra yang sudah diluruskan (Multi-Pass Upscaled QR Decoder)
  if (!qrPayload) {
    qrPayload = decodeLjkQrCode(canvas, true);
  }

  let student: Student | undefined;
  let qrRead = false;
  let detectedMapel: string | undefined;
  let detectedExamId: string | undefined;
  let detectedJumlahSoal: number | undefined;

  if (qrPayload) {
    qrRead = true;
    detectedMapel = qrPayload.mpl ? String(qrPayload.mpl).trim() : undefined;
    detectedExamId = qrPayload.eId ? String(qrPayload.eId).trim() : undefined;
    if (qrPayload.jml && Number(qrPayload.jml) >= 1 && Number(qrPayload.jml) <= 40) {
      detectedJumlahSoal = Number(qrPayload.jml);
    }

    const rawPrs = qrPayload.prs ? String(qrPayload.prs).trim().padStart(2, '0') : '';
    const rawKls = qrPayload.kls ? String(qrPayload.kls).trim() : '';
    const rawNm = qrPayload.nm ? String(qrPayload.nm).trim() : '';

    // Cari di database siswa berdasarkan ID, atau kombinasi Kelas + Presensi, atau Nama
    student =
      (qrPayload.sId ? students.find((s) => s.id === qrPayload.sId) : undefined) ||
      (rawKls && rawPrs
        ? students.find(
            (s) =>
              s.kelas.toLowerCase() === rawKls.toLowerCase() &&
              s.presensi.padStart(2, '0') === rawPrs
          )
        : undefined) ||
      (rawNm
        ? students.find((s) => s.nama.toLowerCase() === rawNm.toLowerCase())
        : undefined) ||
      (rawNm || rawPrs
        ? {
            id:
              qrPayload.sId ||
              `stu_${(rawKls || exam.kelas).replace(/[^a-zA-Z0-9]/g, '_')}_${rawPrs || '01'}`,
            presensi: rawPrs || '01',
            nama: rawNm || `Siswa Presensi ${rawPrs || '01'}`,
            kelas: rawKls || exam.kelas,
          }
        : undefined);
  }

  // Cocokkan paket ujian secara otomatis jika QR lembar LJK menyebutkan Mapel / Exam ID berbeda dari dropdown awal
  let gradingExam: Exam = exam;
  if (allExams.length > 0 && (detectedExamId || detectedMapel)) {
    const byId = detectedExamId ? allExams.find((e) => e.id === detectedExamId) : undefined;
    const byMapelAndClass =
      !byId && detectedMapel && student?.kelas
        ? allExams.find(
            (e) =>
              e.mapel.toLowerCase() === detectedMapel!.toLowerCase() &&
              e.kelas.toLowerCase() === student!.kelas.toLowerCase()
          )
        : undefined;
    const byMapelOnly =
      !byId && !byMapelAndClass && detectedMapel
        ? allExams.find((e) => e.mapel.toLowerCase() === detectedMapel!.toLowerCase())
        : undefined;

    if (byId || byMapelAndClass || byMapelOnly) {
      gradingExam = (byId || byMapelAndClass || byMapelOnly)!;
    }
  }

  const fullImage = ctx.getImageData(0, 0, w, h);
  const lumMap = buildOmrLuminanceMap(fullImage.data, w, h);

  const scaleX = w / HALF_W;
  const scaleY = h / HALF_H;

  const activeQuestionCount = Math.min(
    DEFAULT_LJK_CAPACITY,
    Math.max(1, gradingExam.jumlahSoal)
  );

  // Kalibrasi pergeseran halus grid bulatan
  const gridOffset = calibrateGlobalGridOffset(
    lumMap,
    w,
    h,
    scaleX,
    scaleY,
    activeQuestionCount
  );

  // Gambar penanda hijau pada 4 kotak anchor sudut di previewImage
  if (anchorCheck.locked) {
    const halfSize = HALF_ANCHORS.size;
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    [HALF_ANCHORS.tl, HALF_ANCHORS.tr, HALF_ANCHORS.bl, HALF_ANCHORS.br].forEach((pt) => {
      ctx.strokeRect(
        (pt.x - 0.8) * scaleX,
        (pt.y - 0.8) * scaleY,
        (halfSize + 1.6) * scaleX,
        (halfSize + 1.6) * scaleY
      );
    });
  }

  // Ambang sensitivitas berdasarkan tingkat kepekaan yang dipilih guru
  const minDropRatio =
    sensitivity === 'sangat_peka' ? 0.036 : sensitivity === 'tinggi' ? 0.052 : 0.075;
  const minDropAbs =
    sensitivity === 'sangat_peka' ? 4.2 : sensitivity === 'tinggi' ? 6.2 : 9.0;
  const noiseMultiplier =
    sensitivity === 'sangat_peka' ? 1.32 : sensitivity === 'tinggi' ? 1.55 : 1.85;
  const minFillScoreDiff =
    sensitivity === 'sangat_peka' ? 0.042 : sensitivity === 'tinggi' ? 0.062 : 0.09;

  let benar = 0;
  let salah = 0;
  let kosong = 0;
  let totalPoin = 0;
  let maxPoin = 0;
  let statusRagu = false;
  const detailJawaban: Record<string, string> = {};

  for (let q = 1; q <= DEFAULT_LJK_CAPACITY; q++) {
    if (q > activeQuestionCount) {
      const firstPos = getHalfBubblePosition(q, 0, 0);
      const lastPos = getHalfBubblePosition(q, 4, 0);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(
        (firstPos.x - firstPos.radius) * scaleX + gridOffset.dx,
        (firstPos.y - firstPos.radius) * scaleY + gridOffset.dy,
        (lastPos.x - firstPos.x + firstPos.radius * 2) * scaleX,
        firstPos.radius * 2 * scaleY
      );
      continue;
    }

    const qKey = gradingExam.kunciJawaban[String(q)] || {
      type: 'PG' as const,
      answers: ['A'],
      weight: 2,
    };
    maxPoin += qKey.weight;

    const rowScores = OPTIONS.map((opt, optIdx) => {
      const pos = getHalfBubblePosition(q, optIdx, 0);
      const expectedCx = pos.x * scaleX + gridOffset.dx;
      const expectedCy = pos.y * scaleY + gridOffset.dy;
      const r = pos.radius * scaleX;
      const sample = measureBubbleFill(lumMap, w, h, expectedCx, expectedCy, r);
      return {
        opt,
        cx: sample.bestX,
        cy: sample.bestY,
        r,
        coreLum: sample.coreLum,
        darkest35Lum: sample.darkest35Lum,
        effLum: sample.effLum,
        paperLum: sample.paperLum,
        darkRatio: sample.darkRatio,
        fillScore: sample.fillScore,
        dropAbs: 0,
        dropRatio: 0,
      };
    });

    // Urutkan dari paling terang (kosong) ke paling gelap (terisi) berdasarkan effLum
    const sortedByBrightest = [...rowScores].sort((a, b) => b.effLum - a.effLum);
    // 3 bulatan paling terang di baris ini menjadi referensi bulatan kosong lokal
    const emptyRefLum =
      (sortedByBrightest[0].effLum +
        sortedByBrightest[1].effLum +
        sortedByBrightest[2].effLum) /
      3;
    const emptyNoise = Math.max(
      1.6,
      sortedByBrightest[0].effLum - sortedByBrightest[2].effLum
    );

    const sortedByFillAsc = [...rowScores].sort((a, b) => a.fillScore - b.fillScore);
    const baselineEmptyScore =
      (sortedByFillAsc[0].fillScore +
        sortedByFillAsc[1].fillScore +
        sortedByFillAsc[2].fillScore) /
      3;

    rowScores.forEach((b) => {
      b.dropAbs = Math.max(0, emptyRefLum - b.effLum);
      b.dropRatio = b.dropAbs / Math.max(45, emptyRefLum);
    });

    let filled = rowScores.filter(
      (b) =>
        (b.dropRatio >= minDropRatio &&
          b.dropAbs >= minDropAbs &&
          b.dropAbs >= emptyNoise * noiseMultiplier) ||
        (b.fillScore >= baselineEmptyScore + minFillScoreDiff &&
          b.fillScore >= minFillScoreDiff * 1.35) ||
        b.fillScore >= 0.22 ||
        (b.darkest35Lum < b.paperLum * 0.78 && b.dropAbs >= minDropAbs * 0.9)
    );

    // Disambiguasi cerdas untuk soal Pilihan Ganda tunggal (PG):
    // Apabila sensitivitas tinggi mendeteksi >1 bulatan (misal karena bayangan jari atau bekas hapusan pensil),
    // pilih bulatan yang paling gelap jika dominansinya jelas di atas kandidat kedua.
    if (qKey.type === 'PG' && filled.length > 1) {
      const ranked = [...filled].sort((a, b) => b.dropAbs - a.dropAbs);
      const top1 = ranked[0];
      const top2 = ranked[1];
      if (
        top1.dropAbs >= top2.dropAbs * 1.28 ||
        top1.dropAbs - top2.dropAbs >= 4.8 ||
        top1.fillScore >= top2.fillScore + 0.065
      ) {
        filled = [top1];
      }
    }

    if (filled.length === 0) {
      kosong++;
      detailJawaban[String(q)] = '-';
      rowScores.forEach((b) => {
        if (qKey.answers.includes(b.opt)) {
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2.2;
          ctx.strokeRect(b.cx - b.r, b.cy - b.r, b.r * 2, b.r * 2);
        }
      });
      continue;
    }

    if (qKey.type === 'PG') {
      if (filled.length > 1) {
        salah++;
        statusRagu = true;
        detailJawaban[String(q)] = 'DOBEL';
        filled.forEach((f) => {
          ctx.strokeStyle = '#eab308';
          ctx.lineWidth = 3.5;
          ctx.strokeRect(f.cx - f.r, f.cy - f.r, f.r * 2, f.r * 2);
        });
      } else {
        const chosen = filled[0];
        detailJawaban[String(q)] = chosen.opt;
        if (qKey.answers.includes(chosen.opt)) {
          benar++;
          totalPoin += qKey.weight;
          ctx.strokeStyle = '#22c55e';
        } else {
          salah++;
          ctx.strokeStyle = '#ef4444';
        }
        ctx.lineWidth = 3.5;
        ctx.strokeRect(chosen.cx - chosen.r, chosen.cy - chosen.r, chosen.r * 2, chosen.r * 2);
      }
    } else {
      const chosenOpts = filled.map((f) => f.opt);
      detailJawaban[String(q)] = chosenOpts.join('');

      if (filled.length === OPTIONS.length) {
        salah++;
        filled.forEach((f) => {
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 3.5;
          ctx.strokeRect(f.cx - f.r, f.cy - f.r, f.r * 2, f.r * 2);
        });
        continue;
      }

      let bCount = 0;
      let sCount = 0;
      filled.forEach((f) => {
        if (qKey.answers.includes(f.opt)) {
          bCount++;
          ctx.strokeStyle = '#22c55e';
        } else {
          sCount++;
          ctx.strokeStyle = '#ef4444';
        }
        ctx.lineWidth = 3.5;
        ctx.strokeRect(f.cx - f.r, f.cy - f.r, f.r * 2, f.r * 2);
      });

      const kCount = qKey.answers.length;
      const poinSoal = Math.max(0, (bCount - sCount) / kCount) * qKey.weight;
      totalPoin += poinSoal;

      if (bCount === kCount && sCount === 0) benar++;
      else salah++;
    }
  }

  const skor = maxPoin > 0 ? Number(((totalPoin / maxPoin) * 100).toFixed(1)) : 0;

  return {
    examId: gradingExam.id,
    studentId: student?.id || `unknown_${Date.now()}`,
    presensi: student?.presensi || '-',
    nama: student?.nama || 'QR Tidak Terbaca',
    kelas: student?.kelas || gradingExam.kelas,
    mapel: detectedMapel || gradingExam.mapel,
    benar,
    salah,
    kosong,
    skor,
    statusRagu: statusRagu || !student,
    detailJawaban,
    previewImage: canvas.toDataURL('image/jpeg', 0.86),
    anchorsDetected: anchorCheck.locked,
    qrRead,
    detectedMapel,
    detectedExamId: gradingExam.id,
    detectedJumlahSoal,
  };
}
