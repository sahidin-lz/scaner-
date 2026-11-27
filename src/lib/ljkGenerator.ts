import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import {
  A4_W,
  HALF_W,
  HALF_H,
  DEFAULT_LJK_CAPACITY,
  HALF_ANCHORS,
  OPTIONS,
  getHalfBubblePosition,
} from './ljkLayout';

export interface Student {
  id: string;
  schoolId?: string;
  ownerId?: string;
  presensi: string;
  nama: string;
  kelas: string;
}

export interface Subject {
  id: string;
  schoolId?: string;
  ownerId?: string;
  kode: string;
  namaMapel: string;
  jenjang?: string;
  defaultSoal: number;
}

export interface QuestionKey {
  type: 'PG' | 'PGK';
  answers: string[]; // PG: ["A"] | PGK: ["A", "C", "E"]
  weight: number;    // Misal PG: 2, PGK: 6
}

export interface Exam {
  id: string;
  schoolId?: string;
  ownerId?: string;
  namaUjian: string;
  mapel: string;
  kelas: string;
  jumlahSoal: number;
  kapasitasLjk?: number;
  kunciJawaban: Record<string, QuestionKey>;
}

/**
 * Memotong teks secara presisi berdasarkan lebar maksimum (dalam mm) pada jsPDF
 * hanya jika teks benar-benar melebihi batas kolom.
 */
function fitPdfText(doc: jsPDF, text: string, maxWidthMm: number): string {
  const clean = (text || '-').trim();
  if (doc.getTextWidth(clean) <= maxWidthMm) return clean;
  let result = clean;
  while (result.length > 1 && doc.getTextWidth(result + '...') > maxWidthMm) {
    result = result.slice(0, -1);
  }
  return result.trim() + '...';
}

/**
 * Memotong teks secara presisi berdasarkan lebar maksimum (dalam px) pada HTMLCanvasElement.
 */
function fitCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidthPx: number
): string {
  const clean = (text || '-').trim();
  if (ctx.measureText(clean).width <= maxWidthPx) return clean;
  let result = clean;
  while (result.length > 1 && ctx.measureText(result + '...').width > maxWidthPx) {
    result = result.slice(0, -1);
  }
  return result.trim() + '...';
}

/**
 * Menggambar 1 unit LJK Setengah A4 Hitam Putih Kontras Tinggi (210 x 148.5 mm)
 * pada posisi vertikal offsetY (0 atau 148.5 mm).
 * Tabel Identitas 4 Baris Lebar (78mm) menjamin NAMA SISWA dan KELAS / ROMBEL tampil LENGKAP tanpa terpotong.
 */
async function drawSingleHalfLJKPdf(
  doc: jsPDF,
  student: Student,
  mapelName: string,
  examTitle: string,
  offsetY: number,
  exam?: Exam | null,
  shadedAnswers?: Record<string, string> | null
) {
  const kapasitas = DEFAULT_LJK_CAPACITY; // Default 40 soal
  const cleanNamaSiswa = (student.nama || `PESERTA NO. ${student.presensi || '01'}`).trim();
  const cleanKelasSiswa = (student.kelas || exam?.kelas || 'KELAS 10').trim();
  const cleanPresensiSiswa = (student.presensi || '01').trim().padStart(2, '0');
  const cleanMapel = (mapelName || exam?.mapel || 'MATA PELAJARAN').trim();
  const cleanExamTitle = (examTitle || exam?.namaUjian || 'PENILAIAN SEKOLAH').trim();

  // 1. 4 Kotak Hitam Sudut OMR (Anchor Markers) — Koordinat presisi tetap
  doc.setFillColor(0, 0, 0);
  [HALF_ANCHORS.tl, HALF_ANCHORS.tr, HALF_ANCHORS.bl, HALF_ANCHORS.br].forEach((pt) => {
    doc.rect(pt.x, pt.y + offsetY, HALF_ANCHORS.size, HALF_ANCHORS.size, 'F');
  });

  // 2. Kop LJK Hitam Putih Resmi (x=18..190, y=7..17.2)
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(18, 7 + offsetY, 172, 10.2, 'FD');

  // Garis aksen ganda tipis di bagian bawah Kop
  doc.setLineWidth(0.22);
  doc.line(18, 16.3 + offsetY, 190, 16.3 + offsetY);

  // Teks Judul Kop Hitam Tegas
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.4);
  doc.setTextColor(0, 0, 0);
  doc.text('LEMBAR JAWABAN KOMPUTER (LJK)', 20.5, 11.2 + offsetY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.1);
  doc.setTextColor(35, 35, 35);
  const headerSub = fitPdfText(
    doc,
    `${cleanExamTitle.toUpperCase()}  •  FORMULIR OMR STANDAR`,
    108
  );
  doc.text(headerSub, 20.5, 14.9 + offsetY);

  // Kotak Kelas & Presensi Lebar di Kanan Kop (x=131..188.5, lebar 57.5mm agar nama kelas panjang tampil utuh)
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.38);
  doc.rect(131, 8.3 + offsetY, 57.5, 7.0, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.3);
  doc.setTextColor(0, 0, 0);
  const badgeText = fitPdfText(
    doc,
    `${cleanKelasSiswa.toUpperCase()}  •  NO. ${cleanPresensiSiswa}`,
    54.5
  );
  doc.text(badgeText, 159.75, 12.8 + offsetY, { align: 'center' });

  // 3. Tabel Identitas Siswa Lengkap 4 Baris (x=18..162, y=18.6..43.6, lebar=144mm, tinggi=25mm)
  // Kolom Label Kiri: 27mm (x=18..45)
  // Kolom Isi Utama Lebar: 78mm (x=45..123) -> Nama Siswa & Kelas tampil sangat lega dan lengkap!
  // Kolom Label Kanan: 20mm (x=123..143)
  // Kolom Isi Kanan: 19mm (x=143..162)
  const tableX = 18;
  const tableY = 18.6 + offsetY;
  const tableW = 144;
  const rowH = 4.9;
  const footerH = 5.4;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.rect(tableX, tableY, tableW, rowH * 4 + footerH, 'FD');

  // Garis Horizontal antar baris (4 baris identitas + 1 baris petunjuk)
  doc.setLineWidth(0.24);
  doc.line(tableX, tableY + rowH, tableX + tableW, tableY + rowH);
  doc.line(tableX, tableY + rowH * 2, tableX + tableW, tableY + rowH * 2);
  doc.line(tableX, tableY + rowH * 3, tableX + tableW, tableY + rowH * 3);
  doc.line(tableX, tableY + rowH * 4, tableX + tableW, tableY + rowH * 4);

  // Garis Vertikal pemisah kolom identitas
  doc.line(tableX + 27, tableY, tableX + 27, tableY + rowH * 4);
  doc.line(tableX + 105, tableY, tableX + 105, tableY + rowH * 4);
  doc.line(tableX + 125, tableY, tableX + 125, tableY + rowH * 4);

  // BARIS 1: NAMA SISWA LENGKAP & NO. PRESENSI
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.0);
  doc.setTextColor(0, 0, 0);
  doc.text('NAMA SISWA', tableX + 2, tableY + 3.4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.text(fitPdfText(doc, cleanNamaSiswa.toUpperCase(), 74.5), tableX + 29, tableY + 3.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('PRESENSI', tableX + 107, tableY + 3.4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.6);
  doc.text(fitPdfText(doc, cleanPresensiSiswa, 16), tableX + 134.5, tableY + 3.5, {
    align: 'center',
  });

  // BARIS 2: KELAS / ROMBEL LENGKAP & JUMLAH SOAL
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.0);
  doc.text('KELAS / ROMBEL', tableX + 2, tableY + rowH + 3.4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.0);
  doc.text(
    fitPdfText(doc, cleanKelasSiswa.toUpperCase(), 74.5),
    tableX + 29,
    tableY + rowH + 3.5
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('JML SOAL', tableX + 107, tableY + rowH + 3.4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const activeSoalNum = exam?.jumlahSoal || 40;
  const soalInfo = exam ? `${exam.jumlahSoal} / 40` : '40 SOAL';
  doc.text(soalInfo, tableX + 134.5, tableY + rowH + 3.4, { align: 'center' });

  // BARIS 3: MATA PELAJARAN LENGKAP & KODE MAPEL
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.0);
  doc.text('MATA PELAJARAN', tableX + 2, tableY + rowH * 2 + 3.4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.text(
    fitPdfText(doc, cleanMapel.toUpperCase(), 74.5),
    tableX + 29,
    tableY + rowH * 2 + 3.4
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('STATUS', tableX + 107, tableY + rowH * 2 + 3.4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text(shadedAnswers ? 'TERARSIR' : 'UTAMA', tableX + 134.5, tableY + rowH * 2 + 3.4, {
    align: 'center',
  });

  // BARIS 4: PAKET UJIAN & PARAF SISWA
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.0);
  doc.text('PAKET UJIAN', tableX + 2, tableY + rowH * 3 + 3.4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.text(
    fitPdfText(doc, cleanExamTitle.toUpperCase(), 74.5),
    tableX + 29,
    tableY + rowH * 3 + 3.4
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('PARAF', tableX + 107, tableY + rowH * 3 + 3.4);

  // BARIS 5: Petunjuk Pengisian Hitam Putih
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.4);
  doc.setTextColor(15, 15, 15);
  doc.text(
    'PETUNJUK: Hitamkan bulatan jawaban secara penuh & rapi. Kamera otomatis membaca QR Identitas (Nama, Kelas, Presensi) & Jawaban.',
    tableX + 2.2,
    tableY + rowH * 4 + 3.6
  );

  // 4. Kotak QR Code Hitam Putih Kontras Tinggi di Kanan (x=164..190, y=18.6..43.6)
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.rect(164, tableY, 26, rowH * 4 + footerH, 'FD');

  doc.setLineWidth(0.24);
  doc.line(164, tableY + 3.8, 190, tableY + 3.8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.7);
  doc.setTextColor(0, 0, 0);
  doc.text('QR IDENTITAS', 177, tableY + 2.7, { align: 'center' });

  const qrPayload = JSON.stringify({
    sId: student.id,
    prs: cleanPresensiSiswa,
    nm: cleanNamaSiswa.slice(0, 48),
    kls: cleanKelasSiswa.slice(0, 45),
    mpl: cleanMapel,
    jml: activeSoalNum,
    eId: exam?.id || '',
  });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    errorCorrectionLevel: 'L',
    margin: 1,
    width: 220,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
  doc.addImage(qrDataUrl, 'PNG', 166.5, tableY + 4.3, 21, 20.2);

  // 5. Header & Bingkai 4 Kolom Jawaban Hitam Putih Tanpa Zebra Abu-abu (01-10, 11-20, 21-30, 31-40)
  const colStartX = [27, 70, 113, 156];
  const colBoxLeft = [18, 61, 104, 147];
  const colBoxW = 38.5;

  colBoxLeft.forEach((boxX, colIdx) => {
    const baseX = colStartX[colIdx];

    // Bingkai Luar Kolom Putih Bersih
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    doc.rect(boxX, 46.5 + offsetY, colBoxW, 84.5, 'FD');

    // Garis Bawah Header Kolom
    doc.setLineWidth(0.32);
    doc.line(boxX, 52.3 + offsetY, boxX + colBoxW, 52.3 + offsetY);

    // Garis Pemisah Halus antara Soal ke-5 dan ke-6 di tiap kolom (y = 91.75mm, aman di luar bulatan)
    doc.setDrawColor(170, 170, 170);
    doc.setLineWidth(0.18);
    doc.setLineDashPattern([1.2, 1.2], 0);
    doc.line(boxX + 1.5, 91.75 + offsetY, boxX + colBoxW - 1.5, 91.75 + offsetY);
    doc.setLineDashPattern([], 0);
    doc.setDrawColor(0, 0, 0);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(0, 0, 0);
    doc.text('NO', baseX - 6.8, 50.4 + offsetY);
    OPTIONS.forEach((opt, idx) => {
      doc.text(opt, baseX + idx * 6.2, 50.4 + offsetY, { align: 'center' });
    });
  });

  // 6. Grid 40 Soal (4 Kolom x 10 Baris) — Mendukung LJK Kosong maupun LJK dengan Arsiran per Jawaban
  for (let q = 1; q <= kapasitas; q++) {
    const firstBubble = getHalfBubblePosition(q, 0, offsetY);
    const isPgk = exam?.kunciJawaban?.[String(q)]?.type === 'PGK';
    const isExceeded = exam ? q > exam.jumlahSoal : false;
    const labelNo = String(q).padStart(2, '0') + (isPgk ? '*' : '');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    if (isExceeded) {
      doc.setTextColor(150, 150, 150);
    } else {
      doc.setTextColor(0, 0, 0);
    }
    doc.text(labelNo, firstBubble.x - 7.0, firstBubble.y + 1);

    const rawAnsForQ = !isExceeded && shadedAnswers ? (shadedAnswers[String(q)] || '') : '';

    OPTIONS.forEach((opt, optIdx) => {
      const pos = getHalfBubblePosition(q, optIdx, offsetY);
      const isBubbleShaded = rawAnsForQ !== '-' && rawAnsForQ.includes(opt);

      if (isBubbleShaded) {
        // Bulatan terarsir hitam pekat (siap dipindai kamera OMR atau sebagai arsip fisik)
        doc.setFillColor(0, 0, 0);
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.3);
        doc.circle(pos.x, pos.y, pos.radius, 'FD');
      } else {
        // Bulatan kosong putih murni
        doc.setFillColor(255, 255, 255);
        if (isExceeded) {
          doc.setDrawColor(190, 190, 190);
          doc.setLineWidth(0.22);
        } else {
          doc.setDrawColor(50, 50, 50);
          doc.setLineWidth(0.28);
        }
        doc.circle(pos.x, pos.y, pos.radius, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.3);
        if (isExceeded) {
          doc.setTextColor(195, 195, 195);
        } else {
          doc.setTextColor(120, 120, 120);
        }
        doc.text(opt, pos.x, pos.y + 0.72, { align: 'center' });
      }
    });
  }

  doc.setTextColor(0, 0, 0);
}

/**
 * Cetak LJK PDF Hitam Putih Hemat Kertas: 1 Halaman A4 = 2 Siswa (Atas & Bawah) dengan Default 40 Soal.
 * Mendukung LJK Kosong maupun LJK dengan Arsiran per Jawaban (via answersByStudentId).
 */
export async function generateTwoInOneLJKPdf(params: {
  mapel: string;
  kelasLabel: string;
  namaUjian?: string;
  students: Student[];
  exam?: Exam | null;
  answersByStudentId?: Record<string, Record<string, string>>;
  filePrefix?: string;
  onNotify?: (msg: string) => void;
}): Promise<boolean> {
  const {
    mapel,
    kelasLabel,
    namaUjian = 'PENILAIAN SEKOLAH',
    students,
    exam,
    answersByStudentId,
    filePrefix = 'LJK_BW_2in1',
    onNotify,
  } = params;

  if (students.length === 0) {
    if (onNotify) {
      onNotify(`Belum ada data siswa untuk kelas ${kelasLabel}.`);
    }
    return false;
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  for (let i = 0; i < students.length; i += 2) {
    if (i > 0) doc.addPage();

    const studentTop = students[i];
    const shadedTop = answersByStudentId?.[studentTop.id] || null;

    // LJK Atas (Siswa ke-i)
    await drawSingleHalfLJKPdf(doc, studentTop, mapel, namaUjian, 0, exam, shadedTop);

    // Garis Potong Tengah Halaman A4 Hitam Putih (y = 148.5 mm)
    doc.setDrawColor(80, 80, 80);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([2.5, 2], 0);
    doc.line(8, HALF_H, A4_W - 8, HALF_H);
    doc.setLineDashPattern([], 0);

    doc.setFillColor(255, 255, 255);
    doc.rect(70, HALF_H - 2.3, 70, 4.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(60, 60, 60);
    doc.text('✂ GARIS POTONG TENGAH A4 (1 HALAMAN = 2 LJK)', 105, HALF_H + 0.5, {
      align: 'center',
    });
    doc.setTextColor(0);

    // LJK Bawah (Siswa ke-(i+1) jika ada)
    if (i + 1 < students.length) {
      const studentBottom = students[i + 1];
      const shadedBottom = answersByStudentId?.[studentBottom.id] || null;
      await drawSingleHalfLJKPdf(
        doc,
        studentBottom,
        mapel,
        namaUjian,
        HALF_H,
        exam,
        shadedBottom
      );
    }
  }

  const safeMapel = mapel.replace(/\s+/g, '_');
  const safeKelas = kelasLabel.replace(/\s+/g, '_');
  doc.save(`${filePrefix}_${safeMapel}_${safeKelas}.pdf`);
  return true;
}

/**
 * Cetak LJK PDF dengan Arsiran Per Jawaban (Cadangan & Uji Scan / Master Kunci & Siswa):
 * Menghasilkan LJK Hitam Putih 2-in-1 yang sudah memiliki arsiran hitam pada bulatan jawaban tiap nomor soal.
 */
export async function generateShadedExamLJKPdf(params: {
  exam: Exam;
  students: Student[];
  existingAnswersByPresensi?: Record<string, Record<string, string>>;
  onNotify?: (msg: string) => void;
}): Promise<boolean> {
  const { exam, students, existingAnswersByPresensi = {}, onNotify } = params;
  if (students.length === 0) {
    if (onNotify) onNotify(`Belum ada data siswa untuk kelas ${exam.kelas}.`);
    return false;
  }

  const answersByStudentId: Record<string, Record<string, string>> = {};
  const activeCount = Math.min(DEFAULT_LJK_CAPACITY, Math.max(1, exam.jumlahSoal));

  students.forEach((st, sIdx) => {
    const existing = existingAnswersByPresensi[st.presensi];
    if (existing && Object.keys(existing).length > 0) {
      answersByStudentId[st.id] = existing;
      return;
    }

    const map: Record<string, string> = {};
    for (let q = 1; q <= activeCount; q++) {
      const qKey = exam.kunciJawaban[String(q)];
      if (!qKey || qKey.answers.length === 0) {
        map[String(q)] = 'A';
        continue;
      }
      if (sIdx === 0) {
        map[String(q)] = qKey.answers.join('');
      } else {
        if (qKey.type === 'PG') {
          const keyOpt = qKey.answers[0] || 'A';
          const keyIdx = Math.max(0, OPTIONS.indexOf(keyOpt as typeof OPTIONS[number]));
          const shouldVary = (q + sIdx) % 7 === 0;
          const chosenOpt = shouldVary
            ? OPTIONS[(keyIdx + (sIdx % 4) + 1) % OPTIONS.length]
            : keyOpt;
          map[String(q)] = chosenOpt;
        } else {
          map[String(q)] = qKey.answers.join('');
        }
      }
    }
    answersByStudentId[st.id] = map;
  });

  return generateTwoInOneLJKPdf({
    mapel: exam.mapel,
    kelasLabel: exam.kelas,
    namaUjian: exam.namaUjian,
    students,
    exam,
    answersByStudentId,
    filePrefix: 'LJK_Arsiran_Jawaban',
    onNotify,
  });
}

/**
 * Wrapper kompatibilitas untuk cetak LJK dari paket ujian
 */
export async function generateClassLJKPdf(
  exam: Exam,
  students: Student[],
  onNotify?: (msg: string) => void
): Promise<boolean> {
  return generateTwoInOneLJKPdf({
    mapel: exam.mapel,
    kelasLabel: exam.kelas,
    namaUjian: exam.namaUjian,
    students,
    exam,
    onNotify,
  });
}

/**
 * Render 1 lembar LJK Setengah A4 Hitam Putih Lengkap (Default 40 Soal) ke Canvas (1050 x 742 px)
 */
export async function renderFilledLJKToCanvas(
  canvas: HTMLCanvasElement,
  exam: Exam,
  student: Student,
  preset: 'high' | 'mixed' | 'double' = 'high'
): Promise<void> {
  canvas.width = 1050;
  canvas.height = 742; // Proporsi Setengah A4 (210 : 148.5)
  const ctx = canvas.getContext('2d')!;
  const scaleX = canvas.width / HALF_W;
  const scaleY = canvas.height / HALF_H;

  const cleanNamaSiswa = (student.nama || `PESERTA NO. ${student.presensi || '01'}`).trim();
  const cleanKelasSiswa = (student.kelas || exam.kelas || 'KELAS 10').trim();
  const cleanPresensiSiswa = (student.presensi || '01').trim().padStart(2, '0');

  // Latar kertas putih bersih
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 1. 4 Kotak Hitam Sudut OMR
  ctx.fillStyle = '#000000';
  [HALF_ANCHORS.tl, HALF_ANCHORS.tr, HALF_ANCHORS.bl, HALF_ANCHORS.br].forEach((pt) => {
    ctx.fillRect(
      pt.x * scaleX,
      pt.y * scaleY,
      HALF_ANCHORS.size * scaleX,
      HALF_ANCHORS.size * scaleY
    );
  });

  // 2. Kop Hitam Putih
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.strokeRect(18 * scaleX, 7 * scaleY, 172 * scaleX, 10.2 * scaleY);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 17px sans-serif';
  ctx.fillText('LEMBAR JAWABAN KOMPUTER (LJK)', 20.5 * scaleX, 11.2 * scaleY);

  ctx.fillStyle = '#262626';
  ctx.font = '12px sans-serif';
  ctx.fillText(
    fitCanvasText(ctx, `${exam.namaUjian.toUpperCase()}  •  FORMULIR OMR STANDAR`, 108 * scaleX),
    20.5 * scaleX,
    14.9 * scaleY
  );

  // Badge Kelas Lebar di Kanan Kop
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(131 * scaleX, 8.3 * scaleY, 57.5 * scaleX, 7 * scaleY);
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 12.5px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    fitCanvasText(
      ctx,
      `${cleanKelasSiswa.toUpperCase()}  •  NO. ${cleanPresensiSiswa}`,
      54.5 * scaleX
    ),
    159.75 * scaleX,
    12.9 * scaleY
  );

  // 3. Tabel Identitas Siswa 4 Baris Lengkap (Nama Siswa & Kelas Lebar 78mm)
  const tableX = 18;
  const tableY = 18.6;
  const tableW = 144;
  const rowH = 4.9;
  const footerH = 5.4;

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(
    tableX * scaleX,
    tableY * scaleY,
    tableW * scaleX,
    (rowH * 4 + footerH) * scaleY
  );

  [1, 2, 3, 4].forEach((r) => {
    ctx.beginPath();
    ctx.moveTo(tableX * scaleX, (tableY + rowH * r) * scaleY);
    ctx.lineTo((tableX + tableW) * scaleX, (tableY + rowH * r) * scaleY);
    ctx.stroke();
  });
  [27, 105, 125].forEach((offsetX) => {
    ctx.beginPath();
    ctx.moveTo((tableX + offsetX) * scaleX, tableY * scaleY);
    ctx.lineTo((tableX + offsetX) * scaleX, (tableY + rowH * 4) * scaleY);
    ctx.stroke();
  });

  // Baris 1: Nama Siswa Lengkap & Presensi
  ctx.textAlign = 'left';
  ctx.font = 'bold 11.5px sans-serif';
  ctx.fillStyle = '#000000';
  ctx.fillText('NAMA SISWA', (tableX + 2) * scaleX, (tableY + 3.5) * scaleY);

  ctx.font = 'bold 13.5px sans-serif';
  ctx.fillText(
    fitCanvasText(ctx, cleanNamaSiswa.toUpperCase(), 74.5 * scaleX),
    (tableX + 29) * scaleX,
    (tableY + 3.5) * scaleY
  );

  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('PRESENSI', (tableX + 107) * scaleX, (tableY + 3.5) * scaleY);

  ctx.textAlign = 'center';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(
    fitCanvasText(ctx, cleanPresensiSiswa, 16 * scaleX),
    (tableX + 134.5) * scaleX,
    (tableY + 3.5) * scaleY
  );

  // Baris 2: Kelas / Rombel Lengkap & Jml Soal
  ctx.textAlign = 'left';
  ctx.font = 'bold 11.5px sans-serif';
  ctx.fillText('KELAS / ROMBEL', (tableX + 2) * scaleX, (tableY + rowH + 3.5) * scaleY);

  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(
    fitCanvasText(ctx, cleanKelasSiswa.toUpperCase(), 74.5 * scaleX),
    (tableX + 29) * scaleX,
    (tableY + rowH + 3.5) * scaleY
  );

  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('JML SOAL', (tableX + 107) * scaleX, (tableY + rowH + 3.5) * scaleY);

  ctx.textAlign = 'center';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText(
    `${exam.jumlahSoal} / 40`,
    (tableX + 134.5) * scaleX,
    (tableY + rowH + 3.5) * scaleY
  );

  // Baris 3: Mata Pelajaran & Status
  ctx.textAlign = 'left';
  ctx.font = 'bold 11.5px sans-serif';
  ctx.fillText('MATA PELAJARAN', (tableX + 2) * scaleX, (tableY + rowH * 2 + 3.5) * scaleY);

  ctx.font = 'bold 12.5px sans-serif';
  ctx.fillText(
    fitCanvasText(ctx, exam.mapel.toUpperCase(), 74.5 * scaleX),
    (tableX + 29) * scaleX,
    (tableY + rowH * 2 + 3.5) * scaleY
  );

  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('STATUS', (tableX + 107) * scaleX, (tableY + rowH * 2 + 3.5) * scaleY);

  ctx.textAlign = 'center';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('UTAMA', (tableX + 134.5) * scaleX, (tableY + rowH * 2 + 3.5) * scaleY);

  // Baris 4: Paket Ujian & Paraf
  ctx.textAlign = 'left';
  ctx.font = 'bold 11.5px sans-serif';
  ctx.fillText('PAKET UJIAN', (tableX + 2) * scaleX, (tableY + rowH * 3 + 3.5) * scaleY);

  ctx.font = '12px sans-serif';
  ctx.fillText(
    fitCanvasText(ctx, exam.namaUjian.toUpperCase(), 74.5 * scaleX),
    (tableX + 29) * scaleX,
    (tableY + rowH * 3 + 3.5) * scaleY
  );

  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('PARAF', (tableX + 107) * scaleX, (tableY + rowH * 3 + 3.5) * scaleY);

  // Baris 5: Petunjuk
  ctx.textAlign = 'left';
  ctx.font = 'bold 10.5px sans-serif';
  ctx.fillText(
    'PETUNJUK: Hitamkan bulatan jawaban secara penuh & rapi. Kamera otomatis membaca QR Identitas (Nama, Kelas, Presensi) & Jawaban.',
    (tableX + 2.2) * scaleX,
    (tableY + rowH * 4 + 3.7) * scaleY
  );

  // 4. QR Code Box Hitam Putih
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(164 * scaleX, tableY * scaleY, 26 * scaleX, (rowH * 4 + footerH) * scaleY);
  ctx.beginPath();
  ctx.moveTo(164 * scaleX, (tableY + 3.8) * scaleY);
  ctx.lineTo(190 * scaleX, (tableY + 3.8) * scaleY);
  ctx.stroke();

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('QR IDENTITAS', 177 * scaleX, (tableY + 2.8) * scaleY);

  const qrPayload = JSON.stringify({
    sId: student.id,
    prs: cleanPresensiSiswa,
    nm: cleanNamaSiswa.slice(0, 48),
    kls: cleanKelasSiswa.slice(0, 45),
    mpl: exam.mapel,
    jml: exam.jumlahSoal,
    eId: exam.id,
  });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    errorCorrectionLevel: 'L',
    margin: 1,
    width: 220,
  });
  const qrImg = new Image();
  await new Promise<void>((resolve) => {
    qrImg.onload = () => resolve();
    qrImg.src = qrDataUrl;
  });
  ctx.drawImage(qrImg, 166.5 * scaleX, (tableY + 4.3) * scaleY, 21 * scaleX, 20.2 * scaleY);

  // 5. Header 4 Kolom Hitam Putih Tanpa Zebra
  const colStartX = [27, 70, 113, 156];
  const colBoxLeft = [18, 61, 104, 147];
  const colBoxW = 38.5;

  colBoxLeft.forEach((boxX, colIdx) => {
    const baseX = colStartX[colIdx];
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(boxX * scaleX, 46.5 * scaleY, colBoxW * scaleX, 84.5 * scaleY);

    ctx.beginPath();
    ctx.moveTo(boxX * scaleX, 52.3 * scaleY);
    ctx.lineTo((boxX + colBoxW) * scaleX, 52.3 * scaleY);
    ctx.stroke();

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('NO', (baseX - 6.8) * scaleX, 50.5 * scaleY);
    ctx.textAlign = 'center';
    OPTIONS.forEach((opt, idx) => {
      ctx.fillText(opt, (baseX + idx * 6.2) * scaleX, 50.5 * scaleY);
    });
  });

  // 6. Grid 40 Soal Default Hitam Putih
  for (let q = 1; q <= DEFAULT_LJK_CAPACITY; q++) {
    const firstBubble = getHalfBubblePosition(q, 0, 0);
    const qKey = exam.kunciJawaban[String(q)];
    const isActiveQuestion = q <= exam.jumlahSoal && Boolean(qKey);
    const isPgk = isActiveQuestion && qKey?.type === 'PGK';
    const labelNo = String(q).padStart(2, '0') + (isPgk ? '*' : '');

    ctx.fillStyle = isActiveQuestion ? '#000000' : '#9ca3af';
    ctx.font = 'bold 12.5px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(labelNo, (firstBubble.x - 7.0) * scaleX, (firstBubble.y + 1) * scaleY);

    let chosenOptions: string[] = [];
    if (isActiveQuestion && qKey) {
      if (preset === 'high') {
        if (q % 10 === 0) {
          chosenOptions = [OPTIONS[(OPTIONS.indexOf(qKey.answers[0] as any) + 1) % 5]];
        } else {
          chosenOptions = [...qKey.answers];
        }
      } else if (preset === 'mixed') {
        if (q % 4 === 0) {
          chosenOptions = [OPTIONS[(OPTIONS.indexOf(qKey.answers[0] as any) + 2) % 5]];
        } else if (q % 7 === 0 && isPgk) {
          chosenOptions = [qKey.answers[0]];
        } else if (q % 11 === 0) {
          chosenOptions = [];
        } else {
          chosenOptions = [...qKey.answers];
        }
      } else if (preset === 'double') {
        if (q === 3 || q === 12) {
          chosenOptions = ['A', 'C'];
        } else if (q % 5 === 0) {
          chosenOptions = [OPTIONS[(OPTIONS.indexOf(qKey.answers[0] as any) + 1) % 5]];
        } else {
          chosenOptions = [...qKey.answers];
        }
      }
    }

    OPTIONS.forEach((opt, optIdx) => {
      const pos = getHalfBubblePosition(q, optIdx, 0);
      const cx = pos.x * scaleX;
      const cy = pos.y * scaleY;
      const r = pos.radius * scaleX;

      const isFilled = chosenOptions.includes(opt);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      if (isFilled) {
        ctx.fillStyle = '#000000';
        ctx.fill();
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = isActiveQuestion ? '#374151' : '#d1d5db';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.fillStyle = isActiveQuestion ? '#737373' : '#d1d5db';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(opt, cx, cy + 3.5);
      }
    });
  }
}
