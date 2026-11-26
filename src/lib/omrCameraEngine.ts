import jsQR from 'jsqr';
import {
  HALF_W,
  HALF_H,
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
}

function getBubbleBrightness(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radiusPx: number
): number {
  const r = Math.max(2, Math.floor(radiusPx * 0.7));
  const imgData = ctx.getImageData(cx - r, cy - r, r * 2, r * 2).data;
  let total = 0;
  let count = 0;
  for (let i = 0; i < imgData.length; i += 4) {
    total += (imgData[i] + imgData[i + 1] + imgData[i + 2]) / 3;
    count++;
  }
  return count > 0 ? total / count : 255;
}

/**
 * Memproses frame kamera / foto LJK Setengah A4 (Default 40 Soal).
 * Otomatis menyesuaikan jumlah soal yang dinilai dengan `exam.jumlahSoal` dari Kunci Jawaban Guru,
 * sehingga meskipun kertas LJK memiliki default 40 soal, soal di luar `exam.jumlahSoal` diabaikan.
 */
export function processCameraFrame(
  canvas: HTMLCanvasElement,
  exam: Exam,
  students: Student[]
): ScanResult {
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
    // Jika nomor soal melebihi jumlah soal yang dipakai Guru, tandai diabaikan dan lanjut
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
      return { opt, cx, cy, r, brightness: getBubbleBrightness(ctx, cx, cy, r) };
    });

    const sorted = [...rowScores].sort((a, b) => b.brightness - a.brightness);
    const paperAvg = (sorted[0].brightness + sorted[1].brightness) / 2;
    const threshold = paperAvg * 0.72;
    const filled = rowScores.filter((b) => b.brightness < threshold);

    if (filled.length === 0) {
      kosong++;
      detailJawaban[String(q)] = '-';
      // Tandai kunci seharusnya dengan lingkaran biru putus-putus
      rowScores.forEach((b) => {
        if (qKey.answers.includes(b.opt)) {
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2;
          ctx.strokeRect(b.cx - b.r, b.cy - b.r, b.r * 2, b.r * 2);
        }
      });
      continue;
    }

    // MODE PG BIASA
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
    }
    // MODE PG KOMPLEKS (PGK)
    else {
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
    previewImage: canvas.toDataURL('image/jpeg', 0.8),
  };
}
