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
 * agar nama siswa, nama mata pelajaran, kelas, dan judul ujian tidak pernah bertabrakan.
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
 * Menggambar 1 unit LJK Setengah A4 Berwarna & Anti-Tabrakan (210 x 148.5 mm)
 * pada posisi vertikal offsetY (0 atau 148.5 mm).
 */
async function drawSingleHalfLJKPdf(
  doc: jsPDF,
  student: Student,
  mapelName: string,
  examTitle: string,
  offsetY: number,
  exam?: Exam | null
) {
  const kapasitas = DEFAULT_LJK_CAPACITY; // Default 40 soal

  // 1. 4 Kotak Hitam Sudut OMR (Anchor Markers) — Jangan diubah posisinya
  doc.setFillColor(0, 0, 0);
  [HALF_ANCHORS.tl, HALF_ANCHORS.tr, HALF_ANCHORS.bl, HALF_ANCHORS.br].forEach((pt) => {
    doc.rect(pt.x, pt.y + offsetY, HALF_ANCHORS.size, HALF_ANCHORS.size, 'F');
  });

  // 2. Banner Kop Berwarna Biru Royal (x=18..190, y=7..17.2)
  doc.setFillColor(30, 64, 175); // #1e40af (Royal Blue)
  doc.rect(18, 7 + offsetY, 172, 9.6, 'F');

  // Garis Aksen Hijau Emerald di bawah Kop
  doc.setFillColor(16, 185, 129); // #10b981 (Emerald)
  doc.rect(18, 16.6 + offsetY, 172, 0.9, 'F');

  // Teks Judul Kop Putih
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text('LEMBAR JAWABAN KOMPUTER (LJK)', 21, 11.2 + offsetY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(219, 234, 254);
  const headerSub = fitPdfText(
    doc,
    `${examTitle.toUpperCase()}  •  SISTEM PEMINDAI OMR KAMERA`,
    122
  );
  doc.text(headerSub, 21, 15 + offsetY);

  // Badge Kelas & Presensi di Kanan Kop (x=148..188)
  doc.setFillColor(255, 255, 255);
  doc.rect(148, 8.3 + offsetY, 40, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 58, 138);
  const badgeText = fitPdfText(
    doc,
    `${student.kelas.toUpperCase()} • NO. ${student.presensi}`,
    37
  );
  doc.text(badgeText, 168, 12.8 + offsetY, { align: 'center' });

  // 3. Tabel Identitas Siswa Berwarna & Terkotak Rapi (x=18..162, y=19..43.5)
  // Kolom Kiri Label (x=18..48, lebar 30mm)
  // Kolom Nilai Utama (x=48..118, lebar 70mm)
  // Kolom Label Kanan (x=118..139, lebar 21mm)
  // Kolom Nilai Kanan (x=139..162, lebar 23mm)
  const tableX = 18;
  const tableY = 19 + offsetY;
  const tableW = 144;
  const rowH = 6.2;

  // Latar Kolom Label Kiri (Biru Muda)
  doc.setFillColor(239, 246, 255); // #eff6ff
  doc.rect(tableX, tableY, 30, rowH * 3, 'F');

  // Latar Kolom Nilai Utama (Putih Bersih)
  doc.setFillColor(255, 255, 255);
  doc.rect(tableX + 30, tableY, 70, rowH * 3, 'F');

  // Latar Kolom Label Kanan (Hijau Emerald Muda)
  doc.setFillColor(236, 253, 245); // #ecfdf5
  doc.rect(tableX + 100, tableY, 21, rowH * 3, 'F');

  // Latar Kolom Nilai Kanan (Putih)
  doc.setFillColor(255, 255, 255);
  doc.rect(tableX + 121, tableY, 23, rowH * 3, 'F');

  // Baris ke-4: Bar Petunjuk (Kuning Amber Muda)
  doc.setFillColor(254, 252, 232); // #fefce8
  doc.rect(tableX, tableY + rowH * 3, tableW, 5.8, 'F');

  // Garis Grid Tabel Identitas
  doc.setDrawColor(147, 197, 253); // #93c5fd
  doc.setLineWidth(0.3);
  doc.rect(tableX, tableY, tableW, rowH * 3 + 5.8);
  // Garis Horizontal antar baris
  doc.line(tableX, tableY + rowH, tableX + tableW, tableY + rowH);
  doc.line(tableX, tableY + rowH * 2, tableX + tableW, tableY + rowH * 2);
  doc.line(tableX, tableY + rowH * 3, tableX + tableW, tableY + rowH * 3);
  // Garis Vertikal pemisah kolom
  doc.line(tableX + 30, tableY, tableX + 30, tableY + rowH * 3);
  doc.line(tableX + 100, tableY, tableX + 100, tableY + rowH * 3);
  doc.line(tableX + 121, tableY, tableX + 121, tableY + rowH * 3);

  // Isi Teks Baris 1: NAMA PESERTA & NO. PRESENSI
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.4);
  doc.setTextColor(30, 58, 138); // Navy
  doc.text('NAMA SISWA', tableX + 2, tableY + 4.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42); // Slate 900
  doc.text(fitPdfText(doc, student.nama.toUpperCase(), 66), tableX + 32, tableY + 4.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(6, 95, 70); // Emerald dark
  doc.text('PRESENSI', tableX + 102, tableY + 4.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(15, 23, 42);
  doc.text(fitPdfText(doc, student.presensi, 19), tableX + 132.5, tableY + 4.2, {
    align: 'center',
  });

  // Isi Teks Baris 2: MATA PELAJARAN & KELAS
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.4);
  doc.setTextColor(30, 58, 138);
  doc.text('MATA PELAJARAN', tableX + 2, tableY + rowH + 4.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(29, 78, 216); // Blue 700
  doc.text(fitPdfText(doc, mapelName.toUpperCase(), 66), tableX + 32, tableY + rowH + 4.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(6, 95, 70);
  doc.text('KELAS', tableX + 102, tableY + rowH + 4.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(15, 23, 42);
  doc.text(fitPdfText(doc, student.kelas.toUpperCase(), 20), tableX + 132.5, tableY + rowH + 4.2, {
    align: 'center',
  });

  // Isi Teks Baris 3: NAMA UJIAN & KAPASITAS SOAL
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.4);
  doc.setTextColor(30, 58, 138);
  doc.text('PAKET UJIAN', tableX + 2, tableY + rowH * 2 + 4.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.setTextColor(51, 65, 85);
  doc.text(fitPdfText(doc, examTitle.toUpperCase(), 66), tableX + 32, tableY + rowH * 2 + 4.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(6, 95, 70);
  doc.text('JML SOAL', tableX + 102, tableY + rowH * 2 + 4.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.4);
  doc.setTextColor(15, 23, 42);
  const soalInfo = exam ? `${exam.jumlahSoal} / 40` : '40 SOAL';
  doc.text(soalInfo, tableX + 132.5, tableY + rowH * 2 + 4.2, { align: 'center' });

  // Isi Teks Baris 4: Petunjuk Pengisian
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(146, 64, 14); // Amber 800
  doc.text(
    'PETUNJUK: Hitamkan bulatan jawaban secara penuh. Kamera otomatis menilai sejumlah soal aktif yang ditentukan guru.',
    tableX + 2.5,
    tableY + rowH * 3 + 3.8
  );

  // 4. Kotak QR Code Berwarna di Kanan (x=164..190, y=19..43.4)
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(147, 197, 253);
  doc.setLineWidth(0.3);
  doc.rect(164, tableY, 26, rowH * 3 + 5.8, 'FD');

  doc.setFillColor(30, 64, 175);
  doc.rect(164, tableY, 26, 3.8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.setTextColor(255, 255, 255);
  doc.text('QR IDENTITAS', 177, tableY + 2.7, { align: 'center' });

  const qrPayload = JSON.stringify({
    sId: student.id,
    prs: student.presensi,
    nm: student.nama.slice(0, 36),
    kls: student.kelas,
    mpl: mapelName,
    eId: exam?.id || '',
  });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 140 });
  doc.addImage(qrDataUrl, 'PNG', 167, tableY + 4.3, 20, 19.8);

  // 5. Header & Bingkai 4 Kolom Jawaban (01-10, 11-20, 21-30, 31-40)
  const colStartX = [27, 70, 113, 156];
  const colBoxLeft = [18, 61, 104, 147];
  const colBoxW = 38.5;

  colBoxLeft.forEach((boxX, colIdx) => {
    const baseX = colStartX[colIdx];

    // Bingkai Luar Kolom
    doc.setDrawColor(191, 219, 254); // #bfdbfe
    doc.setLineWidth(0.28);
    doc.rect(boxX, 46.5 + offsetY, colBoxW, 84.5);

    // Header Kolom Berwarna Biru
    doc.setFillColor(30, 64, 175);
    doc.rect(boxX, 46.5 + offsetY, colBoxW, 5.8, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(255, 255, 255);
    doc.text('NO', baseX - 6.8, 50.4 + offsetY);
    OPTIONS.forEach((opt, idx) => {
      doc.text(opt, baseX + idx * 6.2, 50.4 + offsetY, { align: 'center' });
    });

    // Zebra Striping lembut per baris soal di dalam kolom
    for (let r = 0; r < 10; r++) {
      if (r % 2 === 1) {
        const rowCenterY = 58 + offsetY + r * 7.5;
        doc.setFillColor(241, 245, 249); // #f1f5f9
        doc.rect(boxX + 0.3, rowCenterY - 3.6, colBoxW - 0.6, 7.2, 'F');
      }
    }
  });

  // 6. Grid 40 Soal (4 Kolom x 10 Baris) — Koordinat Bulatan Tetap Presisi
  for (let q = 1; q <= kapasitas; q++) {
    const firstBubble = getHalfBubblePosition(q, 0, offsetY);
    const isPgk = exam?.kunciJawaban?.[String(q)]?.type === 'PGK';
    const isExceeded = exam ? q > exam.jumlahSoal : false;
    const labelNo = String(q).padStart(2, '0') + (isPgk ? '*' : '');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    if (isExceeded) {
      doc.setTextColor(148, 163, 184); // Slate 400
    } else {
      doc.setTextColor(30, 58, 138); // Navy
    }
    doc.text(labelNo, firstBubble.x - 7.0, firstBubble.y + 1);

    OPTIONS.forEach((opt, optIdx) => {
      const pos = getHalfBubblePosition(q, optIdx, offsetY);
      // Isi lingkaran dengan warna putih murni agar deteksi kecerahan OMR 100% akurat
      doc.setFillColor(255, 255, 255);
      if (isExceeded) {
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.22);
      } else {
        doc.setDrawColor(37, 99, 235); // Biru tegas khas LJK resmi
        doc.setLineWidth(0.32);
      }
      doc.circle(pos.x, pos.y, pos.radius, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.4);
      if (isExceeded) {
        doc.setTextColor(203, 213, 225);
      } else {
        doc.setTextColor(96, 165, 250);
      }
      doc.text(opt, pos.x, pos.y + 0.72, { align: 'center' });
    });
  }

  doc.setTextColor(0, 0, 0);
}

/**
 * Cetak LJK PDF Hemat Kertas: 1 Halaman A4 = 2 Siswa (Atas & Bawah) dengan Default 40 Soal.
 */
export async function generateTwoInOneLJKPdf(params: {
  mapel: string;
  kelasLabel: string;
  namaUjian?: string;
  students: Student[];
  exam?: Exam | null;
  onNotify?: (msg: string) => void;
}): Promise<boolean> {
  const {
    mapel,
    kelasLabel,
    namaUjian = 'PENILAIAN SEKOLAH',
    students,
    exam,
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

    // LJK Atas (Siswa ke-i)
    await drawSingleHalfLJKPdf(doc, students[i], mapel, namaUjian, 0, exam);

    // Garis Potong Tengah Halaman A4 (y = 148.5 mm)
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([2.5, 2], 0);
    doc.line(8, HALF_H, A4_W - 8, HALF_H);
    doc.setLineDashPattern([], 0);

    doc.setFillColor(241, 245, 249);
    doc.rect(70, HALF_H - 2.3, 70, 4.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(100, 116, 139);
    doc.text('✂ GARIS POTONG TENGAH A4 (1 HALAMAN = 2 LJK)', 105, HALF_H + 0.5, {
      align: 'center',
    });
    doc.setTextColor(0);

    // LJK Bawah (Siswa ke-(i+1) jika ada)
    if (i + 1 < students.length) {
      await drawSingleHalfLJKPdf(doc, students[i + 1], mapel, namaUjian, HALF_H, exam);
    }
  }

  const safeMapel = mapel.replace(/\s+/g, '_');
  const safeKelas = kelasLabel.replace(/\s+/g, '_');
  doc.save(`LJK_2in1_${safeMapel}_${safeKelas}.pdf`);
  return true;
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
 * Render simulasi 1 lembar LJK Setengah A4 Berwarna (Default 40 Soal) ke Canvas (1050 x 742 px)
 * tanpa ada teks yang bertabrakan.
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

  // Latar kertas putih
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

  // 2. Banner Kop Biru Royal & Aksen Emerald
  ctx.fillStyle = '#1e40af';
  ctx.fillRect(18 * scaleX, 7 * scaleY, 172 * scaleX, 9.6 * scaleY);
  ctx.fillStyle = '#10b981';
  ctx.fillRect(18 * scaleX, 16.6 * scaleY, 172 * scaleX, 0.9 * scaleY);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 17px sans-serif';
  ctx.fillText('LEMBAR JAWABAN KOMPUTER (LJK)', 21 * scaleX, 11.3 * scaleY);

  ctx.fillStyle = '#dbeafe';
  ctx.font = '12.5px sans-serif';
  ctx.fillText(
    fitCanvasText(ctx, `${exam.namaUjian.toUpperCase()}  •  SISTEM PEMINDAI OMR KAMERA`, 122 * scaleX),
    21 * scaleX,
    15.1 * scaleY
  );

  // Badge Kelas di Kanan Kop
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(148 * scaleX, 8.3 * scaleY, 40 * scaleX, 7 * scaleY);
  ctx.fillStyle = '#1e3a8a';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    fitCanvasText(ctx, `${student.kelas.toUpperCase()} • NO. ${student.presensi}`, 37 * scaleX),
    168 * scaleX,
    13 * scaleY
  );

  // 3. Tabel Identitas Siswa Berwarna & Terkotak Rapi
  const tableX = 18;
  const tableY = 19;
  const tableW = 144;
  const rowH = 6.2;

  ctx.fillStyle = '#eff6ff';
  ctx.fillRect(tableX * scaleX, tableY * scaleY, 30 * scaleX, rowH * 3 * scaleY);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect((tableX + 30) * scaleX, tableY * scaleY, 70 * scaleX, rowH * 3 * scaleY);

  ctx.fillStyle = '#ecfdf5';
  ctx.fillRect((tableX + 100) * scaleX, tableY * scaleY, 21 * scaleX, rowH * 3 * scaleY);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect((tableX + 121) * scaleX, tableY * scaleY, 23 * scaleX, rowH * 3 * scaleY);

  ctx.fillStyle = '#fefce8';
  ctx.fillRect(tableX * scaleX, (tableY + rowH * 3) * scaleY, tableW * scaleX, 5.8 * scaleY);

  ctx.strokeStyle = '#93c5fd';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(
    tableX * scaleX,
    tableY * scaleY,
    tableW * scaleX,
    (rowH * 3 + 5.8) * scaleY
  );

  // Garis Horizontal & Vertikal Tabel Identitas
  [1, 2, 3].forEach((r) => {
    ctx.beginPath();
    ctx.moveTo(tableX * scaleX, (tableY + rowH * r) * scaleY);
    ctx.lineTo((tableX + tableW) * scaleX, (tableY + rowH * r) * scaleY);
    ctx.stroke();
  });
  [30, 100, 121].forEach((offsetX) => {
    ctx.beginPath();
    ctx.moveTo((tableX + offsetX) * scaleX, tableY * scaleY);
    ctx.lineTo((tableX + offsetX) * scaleX, (tableY + rowH * 3) * scaleY);
    ctx.stroke();
  });

  // Baris 1: Nama Siswa & Presensi
  ctx.textAlign = 'left';
  ctx.font = 'bold 12.5px sans-serif';
  ctx.fillStyle = '#1e3a8a';
  ctx.fillText('NAMA SISWA', (tableX + 2) * scaleX, (tableY + 4.3) * scaleY);

  ctx.font = 'bold 13.5px sans-serif';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(
    fitCanvasText(ctx, student.nama.toUpperCase(), 66 * scaleX),
    (tableX + 32) * scaleX,
    (tableY + 4.3) * scaleY
  );

  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#065f46';
  ctx.fillText('PRESENSI', (tableX + 102) * scaleX, (tableY + 4.3) * scaleY);

  ctx.textAlign = 'center';
  ctx.font = 'bold 13.5px sans-serif';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(
    fitCanvasText(ctx, student.presensi, 19 * scaleX),
    (tableX + 132.5) * scaleX,
    (tableY + 4.3) * scaleY
  );

  // Baris 2: Mata Pelajaran & Kelas
  ctx.textAlign = 'left';
  ctx.font = 'bold 12.5px sans-serif';
  ctx.fillStyle = '#1e3a8a';
  ctx.fillText('MATA PELAJARAN', (tableX + 2) * scaleX, (tableY + rowH + 4.3) * scaleY);

  ctx.font = 'bold 13.5px sans-serif';
  ctx.fillStyle = '#1d4ed8';
  ctx.fillText(
    fitCanvasText(ctx, exam.mapel.toUpperCase(), 66 * scaleX),
    (tableX + 32) * scaleX,
    (tableY + rowH + 4.3) * scaleY
  );

  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#065f46';
  ctx.fillText('KELAS', (tableX + 102) * scaleX, (tableY + rowH + 4.3) * scaleY);

  ctx.textAlign = 'center';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(
    fitCanvasText(ctx, student.kelas.toUpperCase(), 20 * scaleX),
    (tableX + 132.5) * scaleX,
    (tableY + rowH + 4.3) * scaleY
  );

  // Baris 3: Paket Ujian & Jumlah Soal
  ctx.textAlign = 'left';
  ctx.font = 'bold 12.5px sans-serif';
  ctx.fillStyle = '#1e3a8a';
  ctx.fillText('PAKET UJIAN', (tableX + 2) * scaleX, (tableY + rowH * 2 + 4.3) * scaleY);

  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText(
    fitCanvasText(ctx, exam.namaUjian.toUpperCase(), 66 * scaleX),
    (tableX + 32) * scaleX,
    (tableY + rowH * 2 + 4.3) * scaleY
  );

  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#065f46';
  ctx.fillText('JML SOAL', (tableX + 102) * scaleX, (tableY + rowH * 2 + 4.3) * scaleY);

  ctx.textAlign = 'center';
  ctx.font = 'bold 12.5px sans-serif';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(
    `${exam.jumlahSoal} / 40`,
    (tableX + 132.5) * scaleX,
    (tableY + rowH * 2 + 4.3) * scaleY
  );

  // Baris 4: Petunjuk
  ctx.textAlign = 'left';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = '#92400e';
  ctx.fillText(
    'PETUNJUK: Hitamkan bulatan jawaban secara penuh. Kamera otomatis menilai sejumlah soal aktif yang ditentukan guru.',
    (tableX + 2.5) * scaleX,
    (tableY + rowH * 3 + 3.9) * scaleY
  );

  // 4. QR Code Box
  ctx.fillStyle = '#eff6ff';
  ctx.strokeStyle = '#93c5fd';
  ctx.fillRect(164 * scaleX, tableY * scaleY, 26 * scaleX, (rowH * 3 + 5.8) * scaleY);
  ctx.strokeRect(164 * scaleX, tableY * scaleY, 26 * scaleX, (rowH * 3 + 5.8) * scaleY);

  ctx.fillStyle = '#1e40af';
  ctx.fillRect(164 * scaleX, tableY * scaleY, 26 * scaleX, 3.8 * scaleY);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('QR IDENTITAS', 177 * scaleX, (tableY + 2.8) * scaleY);

  const qrPayload = JSON.stringify({
    sId: student.id,
    prs: student.presensi,
    nm: student.nama.slice(0, 36),
    kls: student.kelas,
    mpl: exam.mapel,
    eId: exam.id,
  });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 180 });
  const qrImg = new Image();
  await new Promise<void>((resolve) => {
    qrImg.onload = () => resolve();
    qrImg.src = qrDataUrl;
  });
  ctx.drawImage(qrImg, 167 * scaleX, (tableY + 4.3) * scaleY, 20 * scaleX, 19.8 * scaleY);

  // 5. Header 4 Kolom Berwarna
  const colStartX = [27, 70, 113, 156];
  const colBoxLeft = [18, 61, 104, 147];
  const colBoxW = 38.5;

  colBoxLeft.forEach((boxX, colIdx) => {
    const baseX = colStartX[colIdx];
    ctx.strokeStyle = '#bfdbfe';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(boxX * scaleX, 46.5 * scaleY, colBoxW * scaleX, 84.5 * scaleY);

    ctx.fillStyle = '#1e40af';
    ctx.fillRect(boxX * scaleX, 46.5 * scaleY, colBoxW * scaleX, 5.8 * scaleY);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('NO', (baseX - 6.8) * scaleX, 50.5 * scaleY);
    ctx.textAlign = 'center';
    OPTIONS.forEach((opt, idx) => {
      ctx.fillText(opt, (baseX + idx * 6.2) * scaleX, 50.5 * scaleY);
    });

    for (let r = 0; r < 10; r++) {
      if (r % 2 === 1) {
        const rowCenterY = 58 + r * 7.5;
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(
          (boxX + 0.3) * scaleX,
          (rowCenterY - 3.6) * scaleY,
          (colBoxW - 0.6) * scaleX,
          7.2 * scaleY
        );
      }
    }
  });

  // 6. Grid 40 Soal Default
  for (let q = 1; q <= DEFAULT_LJK_CAPACITY; q++) {
    const firstBubble = getHalfBubblePosition(q, 0, 0);
    const qKey = exam.kunciJawaban[String(q)];
    const isActiveQuestion = q <= exam.jumlahSoal && Boolean(qKey);
    const isPgk = isActiveQuestion && qKey?.type === 'PGK';
    const labelNo = String(q).padStart(2, '0') + (isPgk ? '*' : '');

    ctx.fillStyle = isActiveQuestion ? '#1e3a8a' : '#94a3b8';
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
        ctx.fillStyle = '#18181b';
        ctx.fill();
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = isActiveQuestion ? '#2563eb' : '#cbd5e1';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.fillStyle = isActiveQuestion ? '#60a5fa' : '#cbd5e1';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(opt, cx, cy + 3.5);
      }
    });
  }
}
