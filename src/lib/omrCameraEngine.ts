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

/**
 * Menghitung peta kecerahan khusus OMR (Blue-Suppressed Luminance):
 * Kertas LJK memiliki kop biru (#1e40af), garis kolom biru, dan lingkaran opsi biru (#2563eb / #60a5fa),
 * sedangkan 4 kotak anchor sudut (#000000) dan arsiran pensil/pulpen siswa bersifat gelap akromatik.
 * Dengan menekan saturasi biru (B > R), elemen cetak biru dianggap terang seperti kertas putih,
 * sedangkan kotak anchor hitam & bulatan jawaban yang dihitamkan siswa tampak sangat kontras.
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
    // Jika piksel berwarna biru cetak (Blue jauh lebih tinggi dari Red), angkat kecerahannya
    const blueExcess = b > r + 25 ? ((b - r - 25) * 3) >> 2 : 0;
    const val = baseGray + blueExcess;
    lum[j] = val > 255 ? 255 : val;
  }
  return lum;
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

  // Ukuran radius jendela kotak anchor (~1.3% dari dimensi terkecil)
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

      // 1. Cek kepadatan hitam di dalam kotak anchor
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

      // 2. Cek apakah dikelilingi kertas terang (white moat) di 8 arah sekitar kotak
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
      // Minimal 5 dari 8 titik sekeliling harus berupa kertas putih terang (bukan meja gelap/blok panjang)
      if (brightSides < 5) continue;

      // Prioritaskan kotak hitam terisolasi yang paling dekat dengan sudut luar kuadran
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

  // Hitung centroid presisi sub-piksel di sekitar kandidat terbaik
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
 * Mendukung estimasi sudut ke-4 secara geometris apabila 1 sudut tertutup bayangan/silau.
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

  // Jika 3 sudut terbaca jelas namun 1 sudut silau/bayangan, estimasi sudut ke-4 dengan aturan jajaran genjang
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

    // Pastikan tidak terbalik dan proporsi sesuai lembar LJK
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
 * yang memetakan titik ideal kanvas LJK (dst) -> titik kamera (src).
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

  return b; // [h0, h1, h2, h3, h4, h5, h6, h7]
}

/**
 * Melakukan pelurusan perspektif 4-titik (True 8-DOF Projective Homography Warp)
 * dari 4 titik anchor yang terdeteksi ke ukuran kanvas standar LJK Setengah A4 (1050 x 742).
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

  // Pusat ideal tiap kotak anchor (6x6 mm) dalam koordinat mm (210 x 148.5 mm)
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
 * Mengukur tingkat penghitaman suatu bulatan jawaban dengan:
 * 1. Blue-Suppressed Luminance (mengabaikan garis biru lingkaran & huruf A-E biru muda)
 * 2. Micro-Search Sliding Window (±0.45 * radius) untuk mencari inti tergelap jika kertas melengkung/miring sedikit
 * 3. Cincin Kertas Lokal (1.25r - 1.65r) sebagai referensi kecerahan kertas di sekitar bulatan tersebut.
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
  paperLum: number;
  darkRatio: number;
  fillScore: number;
} {
  const ringInnerR = radiusPx * 1.2;
  const ringOuterR = radiusPx * 1.65;
  const ringInnerR2 = ringInnerR * ringInnerR;
  const ringOuterR2 = ringOuterR * ringOuterR;

  // 1. Ukur kecerahan kertas lokal di cincin luar bulatan
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

  // Ambil persentil ke-70 dari cincin sekitar agar tidak terpengaruh huruf/garis tetangga
  paperSamples.sort((a, b) => a - b);
  const paperLum =
    paperSamples.length > 0
      ? Math.max(80, paperSamples[Math.floor(paperSamples.length * 0.7)])
      : 235;

  // 2. Micro-Search Sliding Window di sekitar (cx, cy) untuk menemukan pusat bulatan yang dihitamkan
  const coreR = Math.max(2.5, radiusPx * 0.64);
  const coreR2 = coreR * coreR;
  const shiftStep = Math.max(1.5, radiusPx * 0.24);
  const shifts = [-shiftStep * 1.8, -shiftStep * 0.9, 0, shiftStep * 0.9, shiftStep * 1.8];

  let minCoreLum = 255;
  let bestX = cx;
  let bestY = cy;
  let bestDarkRatio = 0;
  const darkPixelThresh = paperLum * 0.78;

  for (let sy = 0; sy < shifts.length; sy++) {
    const testCy = cy + shifts[sy];
    for (let sx = 0; sx < shifts.length; sx++) {
      const testCx = cx + shifts[sx];

      const bx0 = Math.max(0, Math.floor(testCx - coreR));
      const by0 = Math.max(0, Math.floor(testCy - coreR));
      const bx1 = Math.min(width - 1, Math.ceil(testCx + coreR));
      const by1 = Math.min(height - 1, Math.ceil(testCy + coreR));

      let sum = 0;
      let count = 0;
      let darkCount = 0;

      for (let py = by0; py <= by1; py++) {
        const dy = py - testCy;
        const rowOff = py * width;
        for (let px = bx0; px <= bx1; px++) {
          const dx = px - testCx;
          if (dx * dx + dy * dy <= coreR2) {
            const v = lum[rowOff + px];
            sum += v;
            count++;
            if (v < darkPixelThresh) {
              darkCount++;
            }
          }
        }
      }

      if (count > 0) {
        const avgCore = sum / count;
        if (avgCore < minCoreLum) {
          minCoreLum = avgCore;
          bestX = testCx;
          bestY = testCy;
          bestDarkRatio = darkCount / count;
        }
      }
    }
  }

  const contrastDrop = Math.max(0, (paperLum - minCoreLum) / paperLum);
  const fillScore = contrastDrop * 0.62 + bestDarkRatio * 0.38;

  return {
    bestX,
    bestY,
    coreLum: minCoreLum,
    paperLum,
    darkRatio: bestDarkRatio,
    fillScore,
  };
}

/**
 * Kalibrasi otomatis pergeseran grid global (globalDx, globalDy) setelah warp
 * untuk mengkompensasi kemiringan kamera atau lengkungan kertas (±2.5 mm).
 */
function calibrateGlobalGridOffset(
  lum: Uint8Array,
  width: number,
  height: number,
  scaleX: number,
  scaleY: number,
  activeQuestionCount: number
): { dx: number; dy: number } {
  const candidatesX = [-6, -3, 0, 3, 6];
  const candidatesY = [-6, -3, 0, 3, 6];

  let bestOffset = { dx: 0, dy: 0 };
  let bestSharpness = -1;

  // Uji pada sampel soal di 4 kolom
  const sampleQuestions: number[] = [];
  for (let q = 1; q <= activeQuestionCount; q += 2) {
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
          const avg = c > 0 ? s / c : 240;
          if (avg < minLum) minLum = avg;
          if (avg > maxLum) maxLum = avg;
        }
        rowSpreadSum += maxLum - minLum;
      }

      // Sedikit penalti untuk offset jauh agar memilih (0,0) jika kontras setara
      const distPenalty = (Math.abs(dx) + Math.abs(dy)) * 0.4;
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
 * 1. Deteksi 4 Anchor Sudut Otomatis (White-Moat Isolated Black Square) + 8-DOF Projective Homography Warp
 * 2. Pembacaan QR Code Siswa (sebelum & sesudah warp)
 * 3. Kalibrasi Grid Global + Micro-Search per Bulatan + Blue-Suppressed Adaptive Thresholding
 */
export function processCameraFrame(
  canvas: HTMLCanvasElement,
  exam: Exam,
  students: Student[]
): ScanResult {
  const rawCtx = canvas.getContext('2d', { willReadFrequently: true })!;

  // Coba baca QR pada citra asli sebelum warp (jika sudut kertas terpotong)
  const preWarpImg = rawCtx.getImageData(0, 0, canvas.width, canvas.height);
  let qr = jsQR(preWarpImg.data, canvas.width, canvas.height);

  const anchorCheck = detectFourAnchors(rawCtx, canvas.width, canvas.height);

  // Jika 4 anchor sudut terdeteksi, luruskan perspektif otomatis dengan matriks Homografi 8-DOF ke ukuran 1050x742
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

  // Baca QR Code pada citra yang sudah diluruskan jika belum terbaca
  const fullImage = ctx.getImageData(0, 0, w, h);
  if (!qr || !qr.data) {
    qr = jsQR(fullImage.data, w, h);
  }

  let student: Student | undefined;
  if (qr?.data) {
    try {
      const parsed = JSON.parse(qr.data);
      student =
        students.find((s) => s.id === parsed.sId) ||
        (parsed.nm || parsed.prs
          ? {
              id: parsed.sId || `qr_${parsed.prs || '01'}`,
              presensi: parsed.prs || '01',
              nama: parsed.nm || `Siswa Presensi ${parsed.prs || '01'}`,
              kelas: parsed.kls || exam.kelas,
            }
          : undefined);
    } catch {
      // QR payload bukan JSON valid
    }
  }

  // Bangun peta kecerahan Blue-Suppressed untuk pembacaan bulatan jawaban yang akurat
  const lumMap = buildOmrLuminanceMap(fullImage.data, w, h);

  const scaleX = w / HALF_W;
  const scaleY = h / HALF_H;

  const activeQuestionCount = Math.min(DEFAULT_LJK_CAPACITY, Math.max(1, exam.jumlahSoal));

  // Kalibrasi pergeseran halus grid bulatan
  const gridOffset = calibrateGlobalGridOffset(
    lumMap,
    w,
    h,
    scaleX,
    scaleY,
    activeQuestionCount
  );

  // Gambar penanda hijau pada 4 kotak anchor sudut di previewImage agar guru yakin LJK sudah lurus
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

  let benar = 0;
  let salah = 0;
  let kosong = 0;
  let totalPoin = 0;
  let maxPoin = 0;
  let statusRagu = false;
  const detailJawaban: Record<string, string> = {};

  // Periksa tiap nomor soal aktif (1 s.d. activeQuestionCount)
  for (let q = 1; q <= DEFAULT_LJK_CAPACITY; q++) {
    if (q > activeQuestionCount) {
      const firstPos = getHalfBubblePosition(q, 0, 0);
      const lastPos = getHalfBubblePosition(q, 4, 0);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        (firstPos.x - firstPos.radius) * scaleX + gridOffset.dx,
        (firstPos.y - firstPos.radius) * scaleY + gridOffset.dy,
        (lastPos.x - firstPos.x + firstPos.radius * 2) * scaleX,
        firstPos.radius * 2 * scaleY
      );
      continue;
    }

    const qKey = exam.kunciJawaban[String(q)];
    if (!qKey) continue;
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
        paperLum: sample.paperLum,
        darkRatio: sample.darkRatio,
        fillScore: sample.fillScore,
      };
    });

    // Urutkan dari fillScore terendah (bulatan kosong) ke tertinggi (bulatan dihitamkan)
    const sortedByFill = [...rowScores].sort((a, b) => a.fillScore - b.fillScore);
    // Rata-rata 2 bulatan paling bersih di baris soal ini sebagai baseline kosong
    const baselineEmpty = (sortedByFill[0].fillScore + sortedByFill[1].fillScore) / 2;

    // Bulatan terdeteksi dihitamkan jika:
    // - fillScore menonjol signifikan di atas bulatan kosong sebaris (baselineEmpty + 0.11) & minimal 0.15
    // - ATAU fillScore absolut >= 0.27 (untuk PGK di mana banyak bulatan dihitamkan sekaligus)
    let filled = rowScores.filter(
      (b) =>
        (b.fillScore >= baselineEmpty + 0.11 && b.fillScore >= 0.15) ||
        b.fillScore >= 0.27 ||
        (b.coreLum < b.paperLum * 0.77 && b.darkRatio >= 0.25)
    );

    // Filter cerdas untuk soal Pilihan Ganda tunggal (PG):
    // Jika ada bekas hapusan tipis (2 kandidat), namun kandidat terkuat jauh lebih pekat dari kandidat ke-2,
    // ambil kandidat terkuat agar tidak salah menjadi DOBEL.
    if (qKey.type === 'PG' && filled.length > 1) {
      const rankedFilled = [...filled].sort((a, b) => b.fillScore - a.fillScore);
      const top1 = rankedFilled[0];
      const top2 = rankedFilled[1];
      if (top1.fillScore >= top2.fillScore + 0.13 && top2.fillScore < baselineEmpty + 0.20) {
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
    studentId: student?.id || `unknown_${Date.now()}`,
    presensi: student?.presensi || '-',
    nama: student?.nama || 'QR Tidak Terbaca',
    kelas: student?.kelas || exam.kelas,
    mapel: exam.mapel,
    benar,
    salah,
    kosong,
    skor,
    statusRagu: statusRagu || !student,
    detailJawaban,
    previewImage: canvas.toDataURL('image/jpeg', 0.85),
    anchorsDetected: anchorCheck.locked,
  };
}
