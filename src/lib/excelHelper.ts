import * as XLSX from 'xlsx';
import { Student, QuestionKey } from './ljkGenerator';
import { ScanResult } from './omrCameraEngine';

// 1. Import Daftar Siswa (Kolom Excel: Presensi, Nama, Kelas)
export async function parseStudentsExcel(file: File): Promise<Omit<Student, 'id'>[]> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  return rows.map((row, idx) => ({
    presensi: String(row.Presensi || row.PRESENSI || row.No || row.NO || idx + 1)
      .trim()
      .padStart(2, '0')
      .slice(0, 20),
    nama: String(row.Nama || row.NAMA || 'Tanpa Nama')
      .trim()
      .slice(0, 120),
    kelas: String(row.Kelas || row.KELAS || 'XI-A')
      .trim()
      .slice(0, 50),
  }));
}

// 2. Upload Kunci Jawaban dari Excel (Kolom Excel: No, Kunci, Bobot)
export async function parseAnswerKeyExcel(
  file: File,
  defaultWeightPG = 2,
  defaultWeightPGK = 6
): Promise<{ kunciMap: Record<string, QuestionKey>; jumlahSoal: number }> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  const kunciMap: Record<string, QuestionKey> = {};
  rows.slice(0, 40).forEach((row, idx) => {
    const no = String(row.No || row.NO || idx + 1);
    const raw = String(row.Kunci || row.KUNCI || 'A')
      .toUpperCase()
      .replace(/[^A-E]/g, '');
    const answers = Array.from(new Set(raw.split('')));
    const isPgk = answers.length > 1;
    const customWeight = Number(row.Bobot || row.BOBOT);

    kunciMap[no] = {
      type: isPgk ? 'PGK' : 'PG',
      answers: answers.length > 0 ? answers : ['A'],
      weight: customWeight > 0 ? customWeight : isPgk ? defaultWeightPGK : defaultWeightPG,
    };
  });

  return { kunciMap, jumlahSoal: Object.keys(kunciMap).length };
}

// 3. Download Rekap Nilai ke Excel (.xlsx) lengkap dengan rincian per butir soal
export function exportResultsToExcel(
  examName: string,
  results: ScanResult[],
  jumlahSoal?: number
) {
  const totalQ = jumlahSoal || 20;
  const rows = [...results]
    .sort((a, b) => {
      const klsCmp = a.kelas.localeCompare(b.kelas);
      return klsCmp !== 0 ? klsCmp : a.presensi.localeCompare(b.presensi);
    })
    .map((r) => {
      const base: Record<string, string | number> = {
        'No. Presensi': r.presensi,
        'Nama Siswa': r.nama,
        Kelas: r.kelas,
        'Mata Pelajaran': r.mapel || examName,
        'Benar Penuh': r.benar,
        'Salah / Parsial': r.salah,
        Kosong: r.kosong,
        'Nilai Akhir': r.skor,
        Status: r.statusRagu ? 'Perlu Cek Manual' : 'Valid',
      };
      for (let q = 1; q <= totalQ; q++) {
        base[`Soal ${q}`] = r.detailJawaban?.[String(q)] || '-';
      }
      return base;
    });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rekap Nilai LJK');
  XLSX.writeFile(wb, `Rekap_Nilai_${examName.replace(/\s+/g, '_')}.xlsx`);
}

// 4. Download Template Excel Daftar Siswa (.xlsx)
export function downloadStudentTemplateExcel() {
  const sampleRows = [
    { Presensi: '01', Nama: 'Aditya Pratama', Kelas: 'XI-A' },
    { Presensi: '02', Nama: 'Bunga Citra Lestari', Kelas: 'XI-A' },
    { Presensi: '03', Nama: 'Cahyo Nugroho', Kelas: 'XI-A' },
    { Presensi: '04', Nama: 'Dinda Kirana Putri', Kelas: 'XI-A' },
    { Presensi: '05', Nama: 'Eko Prasetyo', Kelas: 'XI-B' },
    { Presensi: '06', Nama: 'Farhan Maulana', Kelas: 'XI-B' },
  ];
  const ws = XLSX.utils.json_to_sheet(sampleRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Daftar Siswa');
  XLSX.writeFile(wb, 'Template_Daftar_Siswa.xlsx');
}

// 5. Download Template Excel Kunci Jawaban PG & PGK (.xlsx)
export function downloadAnswerKeyTemplateExcel() {
  const sampleRows = [
    { No: 1, Kunci: 'A', Bobot: 2 },
    { No: 2, Kunci: 'C', Bobot: 2 },
    { No: 3, Kunci: 'B', Bobot: 2 },
    { No: 4, Kunci: 'D', Bobot: 2 },
    { No: 5, Kunci: 'E', Bobot: 2 },
    { No: 6, Kunci: 'A', Bobot: 2 },
    { No: 7, Kunci: 'B', Bobot: 2 },
    { No: 8, Kunci: 'C', Bobot: 2 },
    { No: 9, Kunci: 'D', Bobot: 2 },
    { No: 10, Kunci: 'E', Bobot: 2 },
    { No: 11, Kunci: 'AC', Bobot: 6 },
    { No: 12, Kunci: 'BDE', Bobot: 6 },
    { No: 13, Kunci: 'ABD', Bobot: 6 },
    { No: 14, Kunci: 'CE', Bobot: 6 },
    { No: 15, Kunci: 'ACE', Bobot: 6 },
  ];
  const ws = XLSX.utils.json_to_sheet(sampleRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Kunci Jawaban');
  XLSX.writeFile(wb, 'Template_Kunci_Jawaban_PG_PGK.xlsx');
}
