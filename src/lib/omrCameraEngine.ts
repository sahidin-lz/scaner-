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
 * Mencari titik pusat blok hitam anchor (kotak hitam 6x6 mm) di suatu kuadran citra.
 * Disesuaikan agar adaptif terhadap auto-exposure kamera HP dan pencahayaan ruangan.
 */
function findDarkSquareInRegion(
  gray: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): Point2D | null {
  let sum = 0;
  let count = 0;
  let minVal = 255;

  const step = 2;
  for (let y = y0; y < y1; y += step) {
    const rowOffset = y * width;
    for (let x = x0; x < x1; x += step) {
      const v = gray[rowOffset + x];
      sum += v;
      count++;
      if (v < minVal) minVal = v;
    }
  }
  if (count === 0) return null;
  const avg = sum / count;
  // Toleransi kontras lebih adaptif untuk kamera HP di dalam ruangan
  if (avg - minVal < 22) return null;

  const darkThresh = Math.min(155, minVal + (avg - minVal) * 0.45);
  const winRadius = Math.max(2, Math.round(Math.min(width, height) * 0.013));

  let bestScore = -1;
  let bestX = -1;
  let bestY = -1;

  for (let y = y0 + winRadius; y < y1 - winRadius; y += 2) {
    for (let x = x0 + winRadius; x < x1 - winRadius; x += 2) {
      if (gray[y * width + x] > darkThresh) continue;

      let darkPixels = 0;
      let totalWin = 0;
      for (let dy = -winRadius; dy <= winRadius; dy += 1) {
        const rOff = (y + dy) * width;
        for (let dx = -winRadius; dx <= winRadius; dx += 1) {
          totalWin++;
          if (gray[rOff + x + dx] <= darkThresh) {
            darkPixels++;
          }
        }
      }

      const fillRatio = darkPixels / totalWin;
      // Kotak anchor hitam pada kamera HP (termasuk sedikit blur fokus) memiliki fillRatio > 0.36
      if (fillRatio > 0.36 && fillRatio > bestScore) {
        bestScore = fillRatio;
        bestX = x;
        bestY = y;
      }
    }
  }

  if (bestX < 0 || bestY < 0) return null;

  // Hitung centroid presisi di sekitar kandidat terbaik
  let cxSum = 0;
  let cySum = 0;
  let cWeight = 0;
  const refineR = winRadius + 2;
  for (let dy = -refineR; dy <= refineR; dy++) {
    const py = bestY + dy;
    if (py < y0 || py >= y1) continue;
    for (let dx = -refineR; dx <= refineR; dx++) {
      const px = bestX + dx;
      if (px < x0 || px >= x1) continue;
      const v = gray[py * width + px];
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
 * Mendukung estimasi sudut ke-4 secara geometris apabila 1 sudut tertutup bayangan/silau di HP.
 */
export function detectFourAnchors(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): AnchorDetectionResult {
  const imgData = ctx.getImageData(0, 0, width, height).data;
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < imgData.length; i += 4, j++) {
    gray[j] = (imgData[i] * 77 + imgData[i + 1] * 150 + imgData[i + 2] * 29) >> 8;
  }

  // Area kuadran diperluas (38% x 40%) agar kamera HP vertikal maupun horizontal mudah menangkap sudut LJK
  const qW = Math.floor(width * 0.38);
  const qH = Math.floor(height * 0.40);

  let tl = findDarkSquareInRegion(gray, width, height, 2, 2, qW, qH);
  let tr = findDarkSquareInRegion(gray, width, height, width - qW, 2, width - 2, qH);
  let bl = findDarkSquareInRegion(gray, width, height, 2, height - qH, qW, height - 2);
  let br = findDarkSquareInRegion(
    gray,
    width,
    height,
    width - qW,
    height - qH,
    width - 2,
    height - 2
  );

  const rawCount = [tl, tr, bl, br].filter(Boolean).length;

  // Jika 3 sudut sudah terbaca jelas namun 1 sudut silau/bayangan, estimasi sudut ke-4 dengan aturan jajaran genjang
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

    // Validasi proporsi persegi panjang LJK yang toleran terhadap jarak kamera HP
    if (
      topW > width * 0.32 &&
      botW > width * 0.32 &&
      leftH > height * 0.32 &&
      rightH > height * 0.32 &&
      Math.abs(topW - botW) < width * 0.34 &&
      Math.abs(leftH - rightH) < height * 0.34
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
 * Menggabungkan deteksi 4 sudut hitam + pembacaan cepat QR Code LJK
 * agar auto-scan di HP langsung menjepret otomatis tanpa harus sangat presisi.
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

  // Cek QR code pada frame probe jika minimal 2 sudut terlihat atau untuk membantu pemicu otomatis di HP
  let qrDetected = false;
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

  const readyToCapture =
    anchorRes.locked || (qrDetected && anchorRes.lockedCount >= 2);

  return {
    ...anchorRes,
    qrDetected,
    readyToCapture,
  };
}

/**
 * Melakukan pelurusan perspektif 4-titik (Bilinear Homography Warp)
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
  const idealTL = {
    x: ((HALF_ANCHORS.tl.x + halfSize) / HALF_W) * targetW,
    y: ((HALF_ANCHORS.tl.y + halfSize) / HALF_H) * targetH,
  };
  const idealTR = {
    x: ((HALF_ANCHORS.tr.x + halfSize) / HALF_W) * targetW,
    y: ((HALF_ANCHORS.tr.y + halfSize) / HALF_H) * targetH,
  };
  const idealBL = {
    x: ((HALF_ANCHORS.bl.x + halfSize) / HALF_W) * targetW,
    y: ((HALF_ANCHORS.bl.y + halfSize) / HALF_H) * targetH,
  };
  const anchorSpanW = idealTR.x - idealTL.x;
  const anchorSpanH = idealBL.y - idealTL.y;

  for (let y = 0; y < targetH; y++) {
    const v = (y - idealTL.y) / anchorSpanH;
    for (let x = 0; x < targetW; x++) {
      const u = (x - idealTL.x) / anchorSpanW;

      // Interpolasi bilinear 4 sudut anchor
      const srcX =
        (1 - u) * (1 - v) * corners.tl.x +
        u * (1 - v) * corners.tr.x +
        (1 - u) * v * corners.bl.x +
        u * v * corners.br.x;
      const srcY =
        (1 - u) * (1 - v) * corners.tl.y +
        u * (1 - v) * corners.tr.y +
        (1 - u) * v * corners.bl.y +
        u * v * corners.br.y;

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
 * Mengukur tingkat kegelapan bulatan bagian dalam (radius * 0.55)
 * dibandingkan dengan tingkat kecerahan kertas lokal (cincin luar radius * 1.15 - 1.45)
 * sehingga tahan terhadap bayangan HP/tangan dan tidak terganggu garis tepi lingkaran.
 */
function sampleBubbleContrast(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radiusPx: number
): { innerBrightness: number; localPaperBrightness: number; contrastRatio: number } {
  const outerR = Math.max(4, Math.ceil(radiusPx * 1.45));
  const innerR = Math.max(2, radiusPx * 0.55);
  const ringInnerR = radiusPx * 1.15;

  const x0 = Math.max(0, Math.floor(cx - outerR));
  const y0 = Math.max(0, Math.floor(cy - outerR));
  const w = Math.min(ctx.canvas.width - x0, outerR * 2);
  const h = Math.min(ctx.canvas.height - y0, outerR * 2);
  const data = ctx.getImageData(x0, y0, w, h).data;

  let innerSum = 0;
  let innerCount = 0;
  let paperSum = 0;
  let paperCount = 0;

  const innerR2 = innerR * innerR;
  const ringInnerR2 = ringInnerR * ringInnerR;
  const outerR2 = outerR * outerR;

  for (let py = 0; py < h; py++) {
    const dy = y0 + py - cy;
    for (let px = 0; px < w; px++) {
      const dx = x0 + px - cx;
      const d2 = dx * dx + dy * dy;
      const idx = (py * w + px) * 4;
      const lum = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

      if (d2 <= innerR2) {
        innerSum += lum;
        innerCount++;
      } else if (d2 >= ringInnerR2 && d2 <= outerR2) {
        paperSum += lum;
        paperCount++;
      }
    }
  }

  const innerBrightness = innerCount > 0 ? innerSum / innerCount : 255;
  const localPaperBrightness = paperCount > 0 ? paperSum / paperCount : 240;
  const contrastRatio =
    localPaperBrightness > 10 ? innerBrightness / localPaperBrightness : 1;

  return {
    innerBrightness,
    localPaperBrightness,
    contrastRatio,
  };
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
 * 1. Deteksi 4 Anchor Sudut Otomatis + Perspective Homography Warp
 * 2. Pembacaan QR Code Siswa
 * 3. Pembacaan Bulatan Tahan Bayangan (Inner Circle vs Local Paper Contrast)
 */
export function processCameraFrame(
  canvas: HTMLCanvasElement,
  exam: Exam,
  students: Student[]
): ScanResult {
  const rawCtx = canvas.getContext('2d', { willReadFrequently: true })!;
  const anchorCheck = detectFourAnchors(rawCtx, canvas.width, canvas.height);

  // Jika 4 anchor sudut terdeteksi, luruskan perspektif otomatis ke kanvas standar
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
      canvas.width,
      canvas.height
    );
    rawCtx.drawImage(warped, 0, 0);
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const w = canvas.width;
  const h = canvas.height;

  // 1. Baca QR Code Siswa
  const fullImage = ctx.getImageData(0, 0, w, h);
  const qr = jsQR(fullImage.data, w, h);

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

  const scaleX = w / HALF_W;
  const scaleY = h / HALF_H;

  let benar = 0;
  let salah = 0;
  let kosong = 0;
  let totalPoin = 0;
  let maxPoin = 0;
  let statusRagu = false;
  const detailJawaban: Record<string, string> = {};

  const activeQuestionCount = Math.min(DEFAULT_LJK_CAPACITY, Math.max(1, exam.jumlahSoal));

  // 2. Periksa tiap nomor soal aktif (1 s.d. activeQuestionCount)
  for (let q = 1; q <= DEFAULT_LJK_CAPACITY; q++) {
    if (q > activeQuestionCount) {
      const firstPos = getHalfBubblePosition(q, 0, 0);
      const lastPos = getHalfBubblePosition(q, 4, 0);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        (firstPos.x - firstPos.radius) * scaleX,
        (firstPos.y - firstPos.radius) * scaleY,
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
      const cx = pos.x * scaleX;
      const cy = pos.y * scaleY;
      const r = pos.radius * scaleX;
      const sample = sampleBubbleContrast(ctx, cx, cy, r);
      return {
        opt,
        cx,
        cy,
        r,
        brightness: sample.innerBrightness,
        contrastRatio: sample.contrastRatio,
      };
    });

    const sortedByBright = [...rowScores].sort((a, b) => b.brightness - a.brightness);
    const rowBrightAvg = (sortedByBright[0].brightness + sortedByBright[1].brightness) / 2;
    const absThreshold = rowBrightAvg * 0.74;

    // Bulatan dianggap dihitamkan jika lebih gelap dari ambang baris ATAU rasio kontras terhadap kertas lokal < 0.72
    const filled = rowScores.filter(
      (b) => b.brightness < absThreshold || b.contrastRatio < 0.72
    );

    if (filled.length === 0) {
      kosong++;
      detailJawaban[String(q)] = '-';
      rowScores.forEach((b) => {
        if (qKey.answers.includes(b.opt)) {
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2;
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
    previewImage: canvas.toDataURL('image/jpeg', 0.82),
    anchorsDetected: anchorCheck.locked,
  };
}
