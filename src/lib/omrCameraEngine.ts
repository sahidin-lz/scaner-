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
  qrPayload?: QrIdentityPayload | null;
}

export interface QrIdentityPayload {
  sId?: string;
  prs?: string;
  nm?: string;
  kls?: string;
  mpl?: string;
  jml?: number;
  eId?: string;
}

// Reusable histogram buffer (256 bins) to avoid thousands of .sort() allocations per frame
const HIST_BINS = new Uint16Array(256);

export function parseQrIdentityJson(rawText?: string | null): QrIdentityPayload | null {
  if (!rawText) return null;
  try {
    const parsed = JSON.parse(rawText);
    if (parsed && typeof parsed === 'object' && (parsed.nm || parsed.prs || parsed.sId || parsed.kls)) {
      return parsed as QrIdentityPayload;
    }
  } catch {
    // Abaikan jika bukan JSON LJK
  }
  return null;
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
 * Menjalankan dekoder jsQR dengan:
 * 1. Padding Quiet-Zone Putih Bersih (16px) di sekeliling potongan QR agar garis kotak tabel / header "QR IDENTITAS" tidak mengganggu Finder Pattern
 * 2. Local Adaptive Integral-Image Thresholding (tahan terhadap foto kamera HP yang redup, bayangan miring, atau kontras rendah)
 * 3. Multi-pass Global Contrast Stretching
 */
function decodeQrFromCroppedCanvas(cropCanvas: HTMLCanvasElement): QrIdentityPayload | null {
  const w = cropCanvas.width;
  const h = cropCanvas.height;
  const ctx = cropCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || w < 32 || h < 32) return null;

  const baseImg = ctx.getImageData(0, 0, w, h);
  const rawData = baseImg.data;

  // Pass 0: Langsung coba citra asli (sangat cepat < 2ms jika QR sudah tajam)
  const directQr = jsQR(rawData, w, h, { inversionAttempts: 'dontInvert' });
  const parsedDirect = parseQrIdentityJson(directQr?.data);
  if (parsedDirect) return parsedDirect;

  // Bangun peta grayscale + Integral Image (Summed-Area Table) untuk Adaptive Local Thresholding O(1)
  const totalPixels = w * h;
  const gray = new Uint8Array(totalPixels);
  const integral = new Uint32Array((w + 1) * (h + 1));
  let minG = 255;
  let maxG = 0;

  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    const rowOff = y * w;
    const intRowOff = (y + 1) * (w + 1);
    const intPrevRowOff = y * (w + 1);
    for (let x = 0; x < w; x++) {
      const p = rowOff + x;
      const i = p << 2;
      const g = (rawData[i] * 77 + rawData[i + 1] * 150 + rawData[i + 2] * 29) >> 8;
      gray[p] = g;
      if (g < minG) minG = g;
      if (g > maxG) maxG = g;
      rowSum += g;
      integral[intRowOff + x + 1] = integral[intPrevRowOff + x + 1] + rowSum;
    }
  }

  const workData = new Uint8ClampedArray(rawData.length);
  const pad = 12; // Quiet zone putih bersih di tepi luar

  // Pass 1: Local Adaptive Block Thresholding (jendela ~21x21 piksel)
  // Sangat ampuh untuk foto LJK di HP dengan kontras abu-abu / bayangan tangan seperti hasil uji coba
  const winRadius = Math.max(8, Math.round(Math.min(w, h) * 0.055));
  const localBiases = [0.91, 0.85, 0.95];

  for (const bias of localBiases) {
    for (let y = 0; y < h; y++) {
      const rowOff = y * w;
      const y0 = Math.max(0, y - winRadius);
      const y1 = Math.min(h - 1, y + winRadius);
      const iy0 = y0 * (w + 1);
      const iy1 = (y1 + 1) * (w + 1);
      const boxH = y1 - y0 + 1;

      for (let x = 0; x < w; x++) {
        const p = rowOff + x;
        const i = p << 2;
        if (x < pad || x >= w - pad || y < pad || y >= h - pad) {
          workData[i] = 255;
          workData[i + 1] = 255;
          workData[i + 2] = 255;
          workData[i + 3] = 255;
          continue;
        }
        const x0 = Math.max(0, x - winRadius);
        const x1 = Math.min(w - 1, x + winRadius);
        const area = (x1 - x0 + 1) * boxH;
        const sum =
          integral[iy1 + x1 + 1] -
          integral[iy0 + x1 + 1] -
          integral[iy1 + x0] +
          integral[iy0 + x0];
        const localMean = sum / area;
        const v = gray[p] < localMean * bias ? 0 : 255;
        workData[i] = v;
        workData[i + 1] = v;
        workData[i + 2] = v;
        workData[i + 3] = 255;
      }
    }

    const localQr = jsQR(workData, w, h, { inversionAttempts: 'dontInvert' });
    const parsedLocal = parseQrIdentityJson(localQr?.data);
    if (parsedLocal) return parsedLocal;
  }

  // Pass 2: Global Contrast Stretching Thresholds dengan tepi Quiet-Zone putih
  const span = Math.max(20, maxG - minG);
  const globalRatios = [0.48, 0.56, 0.40];
  for (const ratio of globalRatios) {
    const thresh = minG + span * ratio;
    for (let y = 0; y < h; y++) {
      const rowOff = y * w;
      for (let x = 0; x < w; x++) {
        const p = rowOff + x;
        const i = p << 2;
        const isBorder = x < pad || x >= w - pad || y < pad || y >= h - pad;
        const v = isBorder ? 255 : gray[p] < thresh ? 0 : 255;
        workData[i] = v;
        workData[i + 1] = v;
        workData[i + 2] = v;
        workData[i + 3] = 255;
      }
    }
    const binQr = jsQR(workData, w, h, { inversionAttempts: 'dontInvert' });
    const parsedBin = parseQrIdentityJson(binQr?.data);
    if (parsedBin) return parsedBin;
  }

  return null;
}

/**
 * Membaca QR Code Identitas Siswa secara cepat & akurat pada kanvas LJK:
 * - Memotong tepat di dalam kotak QR (membuang garis bingkai luar & judul hitam "QR IDENTITAS")
 * - Menambahkan quiet-zone putih bersih 14px di sekeliling potongan QR
 */
function decodeLjkQrCode(
  sourceCanvas: HTMLCanvasElement,
  isWarped: boolean
): QrIdentityPayload | null {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  if (w === 0 || h === 0) return null;

  // Koordinat ketat area QR di kanan atas LJK (x=165..189mm, y=22..43.8mm pada citra warp 210x148.5mm)
  const regions = isWarped
    ? [
        {
          // Potongan ketat langsung pada modul QR (menghindari garis kotak & bar hitam "QR IDENTITAS")
          sx: Math.floor((165.0 / HALF_W) * w),
          sy: Math.floor((22.0 / HALF_H) * h),
          sw: Math.ceil((23.8 / HALF_W) * w),
          sh: Math.ceil((21.6 / HALF_H) * h),
          scale: 2.4,
        },
        {
          // Potongan medium (kompatibel dengan cetakan LJK versi lama maupun sedikit miring)
          sx: Math.floor((160.5 / HALF_W) * w),
          sy: Math.floor((18.5 / HALF_H) * h),
          sw: Math.ceil((30.5 / HALF_W) * w),
          sh: Math.ceil((27.5 / HALF_H) * h),
          scale: 2.2,
        },
        {
          // Potongan lebar area kanan atas
          sx: Math.floor((150.0 / HALF_W) * w),
          sy: Math.floor((13.0 / HALF_H) * h),
          sw: Math.ceil((46.0 / HALF_W) * w),
          sh: Math.ceil((36.0 / HALF_H) * h),
          scale: 2.0,
        },
      ]
    : [
        {
          sx: Math.floor(w * 0.64),
          sy: Math.floor(h * 0.08),
          sw: Math.floor(w * 0.30),
          sh: Math.floor(h * 0.32),
          scale: 1.9,
        },
        {
          sx: Math.floor(w * 0.56),
          sy: Math.floor(h * 0.04),
          sw: Math.floor(w * 0.41),
          sh: Math.floor(h * 0.42),
          scale: 1.6,
        },
      ];

  const cropCanvas = document.createElement('canvas');
  const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
  if (!cropCtx) return null;

  const quietPad = 14;

  for (const reg of regions) {
    const innerW = Math.max(120, Math.round(reg.sw * reg.scale));
    const innerH = Math.max(120, Math.round(reg.sh * reg.scale));
    const targetW = innerW + quietPad * 2;
    const targetH = innerH + quietPad * 2;

    cropCanvas.width = targetW;
    cropCanvas.height = targetH;
    cropCtx.fillStyle = '#ffffff';
    cropCtx.fillRect(0, 0, targetW, targetH);
    cropCtx.imageSmoothingEnabled = true;

    const safeSx = Math.max(0, reg.sx);
    const safeSy = Math.max(0, reg.sy);
    const safeSw = Math.min(w - safeSx, reg.sw);
    const safeSh = Math.min(h - safeSy, reg.sh);
    if (safeSw <= 10 || safeSh <= 10) continue;

    cropCtx.drawImage(
      sourceCanvas,
      safeSx,
      safeSy,
      safeSw,
      safeSh,
      quietPad,
      quietPad,
      innerW,
      innerH
    );

    const decoded = decodeQrFromCroppedCanvas(cropCanvas);
    if (decoded) return decoded;
  }

  return null;
}

/**
 * Pre-dekode QR Siswa secara super cepat langsung dari frame video live (sebelum tombol jepret ditekan!):
 * Memotong hanya kuadran kanan-atas video pada resolusi asli kamera HP sehingga siswa langsung dikenali dalam < 12ms.
 */
export function probeLiveQrFromVideo(
  video: HTMLVideoElement,
  cropStartX: number,
  cropStartY: number,
  cropW: number,
  cropH: number,
  workCanvas: HTMLCanvasElement
): QrIdentityPayload | null {
  if (cropW <= 0 || cropH <= 0) return null;
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // Area QR berada di kanan-atas bingkai LJK (x: 68%..94%, y: 10%..36%)
  const qx = cropStartX + cropW * 0.67;
  const qy = cropStartY + cropH * 0.09;
  const qw = cropW * 0.27;
  const qh = cropH * 0.28;

  const pad = 12;
  const innerW = 240;
  const innerH = 220;
  workCanvas.width = innerW + pad * 2;
  workCanvas.height = innerH + pad * 2;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, workCanvas.width, workCanvas.height);
  ctx.drawImage(video, qx, qy, qw, qh, pad, pad, innerW, innerH);

  return decodeQrFromCroppedCanvas(workCanvas);
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
  if (avg - minVal < 18) return null;

  const darkThresh = Math.min(168, minVal + (avg - minVal) * 0.46);
  const brightMoatThresh = Math.max(darkThresh + 15, avg * 0.78);

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
      if (fillRatio < 0.36) continue;

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
      if (brightSides < 4) continue;

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

  const qW = Math.floor(width * 0.38);
  const qH = Math.floor(height * 0.40);

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
      tr.x > tl.x + width * 0.22 &&
      br.x > bl.x + width * 0.22 &&
      bl.y > tl.y + height * 0.22 &&
      br.y > tr.y + height * 0.22;

    if (
      isConvexOrder &&
      topW > width * 0.32 &&
      botW > width * 0.32 &&
      leftH > height * 0.32 &&
      rightH > height * 0.32 &&
      Math.abs(topW - botW) < width * 0.36 &&
      Math.abs(leftH - rightH) < height * 0.36
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
 * Mengunci secara cepat jika 4 sudut anchor valid (atau 3 sudut valid dengan rekonstruksi paralelogram).
 */
export function probeLiveFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): AnchorDetectionResult {
  const anchorRes = detectFourAnchors(ctx, width, height);
  if (anchorRes.locked && anchorRes.lockedCount >= 3) {
    return {
      ...anchorRes,
      qrDetected: anchorRes.lockedCount >= 4,
      readyToCapture: true,
    };
  }

  return {
    ...anchorRes,
    qrDetected: false,
    readyToCapture: false,
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
 * Mengukur tingkat penghitaman bulatan jawaban secara super cepat (Zero-Allocation Histogram) & akurat:
 * - Sampling interior bulatan (coreR = 0.68 * radiusPx = 7.65px) dengan micro-shift ketat [-1.5, 0, 1.5]px
 *   sehingga lingkaran sampel berada 100% di dalam bulatan (7.65 + 1.5 = 9.15px < 11.25px garis tepi bulatan).
 * - Kotak indikator biru/hijau/merah tidak akan pernah bergeser keluar dari pusat bulatan!
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
  const ringOuterR = radiusPx * 1.62;
  const ringInnerR2 = ringInnerR * ringInnerR;
  const ringOuterR2 = ringOuterR * ringOuterR;

  const rx0 = Math.max(0, Math.floor(cx - ringOuterR));
  const ry0 = Math.max(0, Math.floor(cy - ringOuterR));
  const rx1 = Math.min(width - 1, Math.ceil(cx + ringOuterR));
  const ry1 = Math.min(height - 1, Math.ceil(cy + ringOuterR));

  HIST_BINS.fill(0);
  let paperCount = 0;
  for (let py = ry0; py <= ry1; py += 2) {
    const dy = py - cy;
    const rowOff = py * width;
    for (let px = rx0; px <= rx1; px += 2) {
      const dx = px - cx;
      const d2 = dx * dx + dy * dy;
      if (d2 >= ringInnerR2 && d2 <= ringOuterR2) {
        HIST_BINS[lum[rowOff + px]]++;
        paperCount++;
      }
    }
  }

  let paperLum = 225;
  if (paperCount > 0) {
    const targetRank = Math.floor(paperCount * 0.72);
    let acc = 0;
    for (let b = 0; b < 256; b++) {
      acc += HIST_BINS[b];
      if (acc >= targetRank) {
        paperLum = Math.max(70, b);
        break;
      }
    }
  }

  // Lingkaran inti di dalam bulatan (tidak menyentuh garis cincin luar bulatan)
  const coreR = Math.max(2.6, radiusPx * 0.68);
  const coreR2 = coreR * coreR;
  const shifts = [-1.5, 0, 1.5];

  let minEffLum = 255;
  let bestCoreLum = 255;
  let bestDarkest35Lum = 255;
  let bestX = cx;
  let bestY = cy;
  let bestDarkRatio = 0;
  const darkPixelThresh = paperLum * 0.86;

  for (let sy = 0; sy < 3; sy++) {
    const testCy = cy + shifts[sy];
    for (let sx = 0; sx < 3; sx++) {
      const testCx = cx + shifts[sx];

      const bx0 = Math.max(0, Math.floor(testCx - coreR));
      const by0 = Math.max(0, Math.floor(testCy - coreR));
      const bx1 = Math.min(width - 1, Math.ceil(testCx + coreR));
      const by1 = Math.min(height - 1, Math.ceil(testCy + coreR));

      HIST_BINS.fill(0);
      let count = 0;
      let sum = 0;
      let darkCount = 0;

      for (let py = by0; py <= by1; py++) {
        const dy = py - testCy;
        const rowOff = py * width;
        for (let px = bx0; px <= bx1; px++) {
          const dx = px - testCx;
          if (dx * dx + dy * dy <= coreR2) {
            const v = lum[rowOff + px];
            HIST_BINS[v]++;
            count++;
            sum += v;
            if (v < darkPixelThresh) {
              darkCount++;
            }
          }
        }
      }

      if (count > 0) {
        const k35 = Math.max(1, Math.floor(count * 0.35));
        let rem = k35;
        let sum35 = 0;
        for (let b = 0; b < 256 && rem > 0; b++) {
          const c = HIST_BINS[b];
          if (c > 0) {
            const take = c < rem ? c : rem;
            sum35 += take * b;
            rem -= take;
          }
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
 * Kalibrasi halus grid global (±3px maksimum) yang HANYA menghitung baris dengan bulatan terarsir nyata.
 * Mencegah grid tertarik ke sela putih antar-baris ketika banyak soal kosong.
 */
function calibrateGlobalGridOffset(
  lum: Uint8Array,
  width: number,
  height: number,
  scaleX: number,
  scaleY: number,
  activeQuestionCount: number
): { dx: number; dy: number } {
  const candidates = [-3, -1.5, 0, 1.5, 3];
  let bestOffset = { dx: 0, dy: 0 };
  let bestScore = -1;

  const maxSample = Math.min(activeQuestionCount, 20);

  for (const dy of candidates) {
    for (const dx of candidates) {
      let validFilledRows = 0;
      let contrastSum = 0;

      for (let q = 1; q <= maxSample; q++) {
        let minLum = 255;
        let secondMaxLum = 0;
        let maxLum = 0;

        for (let optIdx = 0; optIdx < OPTIONS.length; optIdx++) {
          const pos = getHalfBubblePosition(q, optIdx, 0);
          const cx = Math.round(pos.x * scaleX + dx);
          const cy = Math.round(pos.y * scaleY + dy);
          const r = Math.max(2, Math.round(pos.radius * scaleX * 0.55));

          let s = 0;
          let c = 0;
          for (let py = Math.max(0, cy - r); py <= Math.min(height - 1, cy + r); py += 2) {
            const rowOff = py * width;
            for (let px = Math.max(0, cx - r); px <= Math.min(width - 1, cx + r); px += 2) {
              s += lum[rowOff + px];
              c++;
            }
          }
          const avg = c > 0 ? s / c : 230;
          if (avg < minLum) minLum = avg;
          if (avg > maxLum) {
            secondMaxLum = maxLum;
            maxLum = avg;
          } else if (avg > secondMaxLum) {
            secondMaxLum = avg;
          }
        }

        // Hanya hitung baris yang benar-benar memiliki bulatan yang dihitamkan siswa
        const spread = secondMaxLum - minLum;
        if (spread >= 14) {
          validFilledRows++;
          contrastSum += spread;
        }
      }

      const penalty = (Math.abs(dx) + Math.abs(dy)) * 1.8;
      const score = validFilledRows >= 2 ? contrastSum - penalty : -penalty;
      if (score > bestScore) {
        bestScore = score;
        bestOffset = { dx, dy };
      }
    }
  }

  return bestOffset;
}

/**
 * Mencocokkan identitas siswa dari QR Code terhadap daftar siswa terdaftar secara cerdas & instan:
 * Mendukung pencocokan via ID, Kelas+Presensi, Kelas Fuzzy (misal "Kelas 10" -> "10 ALI BIN ABI THALIB")+Presensi, atau Nama.
 */
export function resolveStudentFromQrPayload(
  qrPayload: QrIdentityPayload,
  students: Student[],
  defaultKelas: string
): Student | undefined {
  const rawPrs = qrPayload.prs ? String(qrPayload.prs).trim().padStart(2, '0') : '';
  const rawKls = qrPayload.kls ? String(qrPayload.kls).trim() : '';
  const rawNm = qrPayload.nm ? String(qrPayload.nm).trim() : '';

  const normKls = rawKls.toLowerCase();
  const normNm = rawNm.toLowerCase();

  // 1. Cari berdasarkan ID siswa eksak
  if (qrPayload.sId) {
    const byId = students.find((s) => s.id === qrPayload.sId);
    if (byId) return byId;
  }

  // 2. Cari berdasarkan Kelas eksak + Nomor Presensi
  if (rawKls && rawPrs) {
    const byExactClassAndPrs = students.find(
      (s) =>
        s.kelas.trim().toLowerCase() === normKls &&
        s.presensi.trim().padStart(2, '0') === rawPrs
    );
    if (byExactClassAndPrs) return byExactClassAndPrs;
  }

  // 3. Cari berdasarkan Nama Siswa (eksak atau prefix jika nama panjang terpotong di QR)
  if (rawNm) {
    const byName = students.find((s) => {
      const sName = s.nama.trim().toLowerCase();
      return sName === normNm || sName.startsWith(normNm) || normNm.startsWith(sName);
    });
    if (byName) return byName;
  }

  // 4. Cari berdasarkan Kelas Fuzzy + Nomor Presensi (atau jika di database hanya ada 1 rombel aktif)
  if (rawPrs) {
    const uniqueClasses = Array.from(new Set(students.map((s) => s.kelas.trim().toLowerCase())));
    const byFuzzyClassAndPrs = students.find((s) => {
      if (s.presensi.trim().padStart(2, '0') !== rawPrs) return false;
      if (uniqueClasses.length === 1) return true;
      const sKls = s.kelas.trim().toLowerCase();
      return (
        (normKls && (sKls.includes(normKls) || normKls.includes(sKls))) ||
        sKls === defaultKelas.trim().toLowerCase()
      );
    });
    if (byFuzzyClassAndPrs) return byFuzzyClassAndPrs;
  }

  // 5. Jika siswa belum ada di master data tetapi QR memuat Nama/Presensi/Kelas lengkap dari lembar LJK
  if (rawNm || rawPrs) {
    const resolvedKls = rawKls || defaultKelas;
    return {
      id:
        qrPayload.sId ||
        `stu_${resolvedKls.replace(/[^a-zA-Z0-9]/g, '_')}_${rawPrs || '01'}`,
      presensi: rawPrs || '01',
      nama: rawNm || `Siswa Presensi ${rawPrs || '01'}`,
      kelas: resolvedKls,
    };
  }

  return undefined;
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
 * Memproses frame kamera / foto LJK Setengah A4 (Default 40 Soal) secara cepat (< 80ms):
 * 1. Deteksi 4 Anchor Sudut Otomatis + 8-DOF Projective Homography Warp terlebih dahulu
 * 2. Pembacaan QR Code pada citra Warped (dengan Quiet-Zone Padding + Local Adaptive Integral Thresholding + Fallback Live QR)
 * 3. Deteksi Jawaban Siswa Sensitivitas Tinggi dengan Zero-Allocation Histogram
 */
export function processCameraFrame(
  canvas: HTMLCanvasElement,
  exam: Exam,
  students: Student[],
  sensitivity: OmrSensitivity = 'sangat_peka',
  allExams: Exam[] = [],
  fallbackQrPayload?: QrIdentityPayload | null
): ScanResult {
  const rawCtx = canvas.getContext('2d', { willReadFrequently: true })!;
  const anchorCheck = detectFourAnchors(rawCtx, canvas.width, canvas.height);

  // Simpan salinan sebelum warp hanya jika anchorCheck.locked bernilai true dan kita butuh fallback QR
  let unwarpedQrCandidate: QrIdentityPayload | null = fallbackQrPayload || null;

  // 1. Jika 4 anchor sudut terdeteksi, luruskan perspektif terlebih dahulu ke 1050x742 agar posisi QR & bulatan 100% presisi
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
  } else if (!unwarpedQrCandidate) {
    unwarpedQrCandidate = decodeLjkQrCode(canvas, false);
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const w = canvas.width;
  const h = canvas.height;

  // 2. Baca QR Code langsung pada koordinat kotak QR yang sudah diluruskan (atau gunakan hasil Live QR)
  const qrPayload = decodeLjkQrCode(canvas, anchorCheck.locked) || unwarpedQrCandidate;

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
    student = resolveStudentFromQrPayload(qrPayload, students, exam.kelas);
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

  // Kalibrasi pergeseran halus grid bulatan (anti-drift)
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
