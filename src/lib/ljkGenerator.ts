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
 * Menggambar 1 unit LJK Setengah A4 Hitam Putih Kontras Tinggi (210 x 148.5 mm)
 * pada posisi vertikal offsetY (0 atau 148.5 mm).
 * Desain Hitam Putih Murni: hemat tinta, tajam saat difotokopi, dan membuat kontras arsiran jawaban siswa sangat tinggi.
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

  // 1. 4 Kotak Hitam Sudut OMR (Anchor Markers) — Koordinat presisi tetap
  doc.setFillColor(0, 0, 0);
  [HALF_ANCHORS.tl, HALF_ANCHORS.tr, HALF_ANCHORS.bl, HALF_ANCHORS.br].forEach((pt) => {
    doc.rect(pt.x, pt.y + offsetY, HALF_ANCHORS.size, HALF_ANCHORS.size, 'F');
  });

  // 2. Kop LJK Hitam Putih Tegas (x=18..190, y=7..17.2)
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.45);
  doc.rect(18, 7 + offsetY, 172, 10.2, 'FD');

  // Garis pemisah tipis di bawah Kop
  doc.setLineWidth(0.25);
  doc.line(18, 16.4 + offsetY, 190, 16.4 + offsetY);

  // Teks Judul Kop Hitam Tegas
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text('LEMBAR JAWABAN KOMPUTER (LJK)', 21, 11.2 + offsetY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(40, 40, 40);
  const headerSub = fitPdfText(
    doc,
    `${examTitle.toUpperCase()}  •  SISTEM PEMINDAI OMR KAMERA`,
    122
  );
  doc.text(headerSub, 21, 15 + offsetY);

  // Badge Kelas & Presensi di Kanan Kop (x=147..188) Hitam Putih
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.35);
  doc.rect(147, 8.4 + offsetY, 41, 6.8, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.4);
  doc.setTextColor(0, 0, 0);
  const badgeText = fitPdfText(
    doc,
    `${student.kelas.toUpperCase()} • NO. ${student.presensi}`,
    38
  );
  doc.text(badgeText, 167.5, 12.8 + offsetY, { align: 'center' });

  // 3. Tabel Identitas Siswa Hitam Putih Bersih (x=18..162, y=19..43.5)
  const tableX = 18;
  const tableY = 19 + offsetY;
  const tableW = 144;
  const rowH = 6.2;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.35);
  doc.rect(tableX, tableY, tableW, rowH * 3 + 5.8, 'FD');

  // Garis Horizontal antar baris
  doc.setLineWidth(0.25);
  doc.line(tableX, tableY + rowH, tableX + tableW, tableY + rowH);
  doc.line(tableX, tableY + rowH * 2, tableX + tableW, tableY + rowH * 2);
  doc.line(tableX, tableY + rowH * 3, tableX + tableW, tableY + rowH * 3);
  // Garis Vertikal pemisah kolom
  doc.line(tableX + 30, tableY, tableX + 30, tableY + rowH * 3);
  doc.line(tableX + 100, tableY, tableX + 100, tableY + rowH * 3);
  doc.line(tableX + 121, tableY, tableX + 121, tableY + rowH * 3);

  // Isi Teks Baris 1: NAMA SISWA & PRESENSI
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.3);
  doc.setTextColor(0, 0, 0);
  doc.text('NAMA SISWA', tableX + 2, tableY + 4.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.1);
  doc.text(fitPdfText(doc, student.nama.toUpperCase(), 66), tableX + 32, tableY + 4.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.text('PRESENSI', tableX + 102, tableY + 4.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.4);
  doc.text(fitPdfText(doc, student.presensi, 19), tableX + 132.5, tableY + 4.2, {
    align: 'center',
  });

  // Isi Teks Baris 2: MATA PELAJARAN & KELAS
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.3);
  doc.text('MATA PELAJARAN', tableX + 2, tableY + rowH + 4.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.0);
  doc.text(fitPdfText(doc, mapelName.toUpperCase(), 66), tableX + 32, tableY + rowH + 4.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.text('KELAS', tableX + 102, tableY + rowH + 4.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  doc.text(fitPdfText(doc, student.kelas.toUpperCase(), 20), tableX + 132.5, tableY + rowH + 4.2, {
    align: 'center',
  });

  // Isi Teks Baris 3: PAKET UJIAN & JML SOAL
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.3);
  doc.text('PAKET UJIAN', tableX + 2, tableY + rowH * 2 + 4.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.text(fitPdfText(doc, examTitle.toUpperCase(), 66), tableX + 32, tableY + rowH * 2 + 4.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.text('JML SOAL', tableX + 102, tableY + rowH * 2 + 4.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const activeSoalNum = exam?.jumlahSoal || 40;
  const soalInfo = exam ? `${exam.jumlahSoal} / 40` : '40 SOAL';
  doc.text(soalInfo, tableX + 132.5, tableY + rowH * 2 + 4.2, { align: 'center' });

  // Isi Teks Baris 4: Petunjuk Pengisian Hitam Putih
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(20, 20, 20);
  doc.text(
    'PETUNJUK: Hitamkan bulatan jawaban secara penuh. Kamera otomatis mendeteksi nama, kelas, nomor & jawaban.',
    tableX + 2.5,
    tableY + rowH * 3 + 3.8
  );

  // 4. Kotak QR Code Hitam Putih Kontras Tinggi di Kanan (x=164..190, y=19..43.4)
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.35);
  doc.rect(164, tableY, 26, rowH * 3 + 5.8, 'FD');

  doc.setLineWidth(0.25);
  doc.line(164, tableY + 3.8, 190, tableY + 3.8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.setTextColor(0, 0, 0);
  doc.text('QR IDENTITAS', 177, tableY + 2.7, { align: 'center' });

  const qrPayload = JSON.stringify({
    sId: student.id,
    prs: student.presensi,
    nm: student.nama.slice(0, 34),
    kls: student.kelas,
    mpl: mapelName,
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
  doc.addImage(qrDataUrl, 'PNG', 166.5, tableY + 4.1, 21, 20.1);

  // 5. Header & Bingkai 4 Kolom Jawaban Hitam Putih Tanpa Zebra Abu-abu (01-10, 11-20, 21-30, 31-40)
  const colStartX = [27, 70, 113, 156];
  const colBoxLeft = [18, 61, 104, 147];
  const colBoxW = 38.5;

  colBoxLeft.forEach((boxX, colIdx) => {
    const baseX = colStartX[colIdx];

    // Bingkai Luar Kolom Putih Bersih (membuat kontras bulatan 100% murni)
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.32);
    doc.rect(boxX, 46.5 + offsetY, colBoxW, 84.5, 'FD');

    // Garis Bawah Header Kolom
    doc.setLineWidth(0.3);
    doc.line(boxX, 52.3 + offsetY, boxX + colBoxW, 52.3 + offsetY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(0, 0, 0);
    doc.text('NO', baseX - 6.8, 50.4 + offsetY);
    OPTIONS.forEach((opt, idx) => {
      doc.text(opt, baseX + idx * 6.2, 50.4 + offsetY, { align: 'center' });
    });
  });

  // 6. Grid 40 Soal (4 Kolom x 10 Baris) — Koordinat Bulatan Tetap Presisi & Hitam Putih
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

    OPTIONS.forEach((opt, optIdx) => {
      const pos = getHalfBubblePosition(q, optIdx, offsetY);
      // Isi lingkaran dengan warna putih murni agar deteksi kecerahan OMR sangat sensitif
      doc.setFillColor(255, 255, 255);
      if (isExceeded) {
        doc.setDrawColor(190, 190, 190);
        doc.setLineWidth(0.22);
      } else {
        doc.setDrawColor(55, 55, 55);
        doc.setLineWidth(0.28);
      }
      doc.circle(pos.x, pos.y, pos.radius, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.3);
      if (isExceeded) {
        doc.setTextColor(195, 195, 195);
      } else {
        doc.setTextColor(125, 125, 125);
      }
      doc.text(opt, pos.x, pos.y + 0.72, { align: 'center' });
    });
  }

  doc.setTextColor(0, 0, 0);
}

/**
 * Cetak LJK PDF Hitam Putih Hemat Kertas: 1 Halaman A4 = 2 Siswa (Atas & Bawah) dengan Default 40 Soal.
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
      await drawSingleHalfLJKPdf(doc, students[i + 1], mapel, namaUjian, HALF_H, exam);
    }
  }

  const safeMapel = mapel.replace(/\s+/g, '_');
  const safeKelas = kelasLabel.replace(/\s+/g, '_');
  doc.save(`LJK_BW_2in1_${safeMapel}_${safeKelas}.pdf`);
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
 * Render 1 lembar LJK Setengah A4 Hitam Putih (Default 40 Soal) ke Canvas (1050 x 742 px)
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
  ctx.fillText('LEMBAR JAWABAN KOMPUTER (LJK)', 21 * scaleX, 11.3 * scaleY);

  ctx.fillStyle = '#262626';
  ctx.font = '12.5px sans-serif';
  ctx.fillText(
    fitCanvasText(ctx, `${exam.namaUjian.toUpperCase()}  •  SISTEM PEMINDAI OMR KAMERA`, 122 * scaleX),
    21 * scaleX,
    15.1 * scaleY
  );

  // Badge Kelas di Kanan Kop
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(147 * scaleX, 8.4 * scaleY, 41 * scaleX, 6.8 * scaleY);
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    fitCanvasText(ctx, `${student.kelas.toUpperCase()} • NO. ${student.presensi}`, 38 * scaleX),
    167.5 * scaleX,
    13 * scaleY
  );

  // 3. Tabel Identitas Siswa Hitam Putih
  const tableX = 18;
  const tableY = 19;
  const tableW = 144;
  const rowH = 6.2;

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.5;
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
  ctx.fillStyle = '#000000';
  ctx.fillText('NAMA SISWA', (tableX + 2) * scaleX, (tableY + 4.3) * scaleY);

  ctx.font = 'bold 13.5px sans-serif';
  ctx.fillText(
    fitCanvasText(ctx, student.nama.toUpperCase(), 66 * scaleX),
    (tableX + 32) * scaleX,
    (tableY + 4.3) * scaleY
  );

  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('PRESENSI', (tableX + 102) * scaleX, (tableY + 4.3) * scaleY);

  ctx.textAlign = 'center';
  ctx.font = 'bold 13.5px sans-serif';
  ctx.fillText(
    fitCanvasText(ctx, student.presensi, 19 * scaleX),
    (tableX + 132.5) * scaleX,
    (tableY + 4.3) * scaleY
  );

  // Baris 2: Mata Pelajaran & Kelas
  ctx.textAlign = 'left';
  ctx.font = 'bold 12.5px sans-serif';
  ctx.fillText('MATA PELAJARAN', (tableX + 2) * scaleX, (tableY + rowH + 4.3) * scaleY);

  ctx.font = 'bold 13.5px sans-serif';
  ctx.fillText(
    fitCanvasText(ctx, exam.mapel.toUpperCase(), 66 * scaleX),
    (tableX + 32) * scaleX,
    (tableY + rowH + 4.3) * scaleY
  );

  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('KELAS', (tableX + 102) * scaleX, (tableY + rowH + 4.3) * scaleY);

  ctx.textAlign = 'center';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(
    fitCanvasText(ctx, student.kelas.toUpperCase(), 20 * scaleX),
    (tableX + 132.5) * scaleX,
    (tableY + rowH + 4.3) * scaleY
  );

  // Baris 3: Paket Ujian & Jumlah Soal
  ctx.textAlign = 'left';
  ctx.font = 'bold 12.5px sans-serif';
  ctx.fillText('PAKET UJIAN', (tableX + 2) * scaleX, (tableY + rowH * 2 + 4.3) * scaleY);

  ctx.font = '13px sans-serif';
  ctx.fillText(
    fitCanvasText(ctx, exam.namaUjian.toUpperCase(), 66 * scaleX),
    (tableX + 32) * scaleX,
    (tableY + rowH * 2 + 4.3) * scaleY
  );

  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('JML SOAL', (tableX + 102) * scaleX, (tableY + rowH * 2 + 4.3) * scaleY);

  ctx.textAlign = 'center';
  ctx.font = 'bold 12.5px sans-serif';
  ctx.fillText(
    `${exam.jumlahSoal} / 40`,
    (tableX + 132.5) * scaleX,
    (tableY + rowH * 2 + 4.3) * scaleY
  );

  // Baris 4: Petunjuk
  ctx.textAlign = 'left';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText(
    'PETUNJUK: Hitamkan bulatan jawaban secara penuh. Kamera otomatis mendeteksi nama, kelas, nomor & jawaban.',
    (tableX + 2.5) * scaleX,
    (tableY + rowH * 3 + 3.9) * scaleY
  );

  // 4. QR Code Box Hitam Putih
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(164 * scaleX, tableY * scaleY, 26 * scaleX, (rowH * 3 + 5.8) * scaleY);
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
    prs: student.presensi,
    nm: student.nama.slice(0, 34),
    kls: student.kelas,
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
  ctx.drawImage(qrImg, 166.5 * scaleX, (tableY + 4.1) * scaleY, 21 * scaleX, 20.1 * scaleY);

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
