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

// 2. Upload Kunci Jawaban dari Excel (Otomatis deteksi Mapel, Kelas, Nama Ujian, No, Kunci, Bobot)
export async function parseAnswerKeyExcel(
  file: File,
  defaultWeightPG = 2,
  defaultWeightPGK = 6
): Promise<{
  kunciMap: Record<string, QuestionKey>;
  jumlahSoal: number;
  detectedMapel?: string;
  detectedKelas?: string;
  detectedNamaUjian?: string;
}> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  let detectedMapel: string | undefined;
  let detectedKelas: string | undefined;
  let detectedNamaUjian: string | undefined;

  const kunciMap: Record<string, QuestionKey> = {};
  rows.slice(0, 40).forEach((row, idx) => {
    if (!detectedMapel) {
      const rawMapel =
        row['Mata Pelajaran'] ||
        row['MATA PELAJARAN'] ||
        row.Mapel ||
        row.MAPEL ||
        row.Pelajaran ||
        row.PELAJARAN;
      if (rawMapel && String(rawMapel).trim()) {
        detectedMapel = String(rawMapel).trim();
      }
    }
    if (!detectedKelas) {
      const rawKelas = row.Kelas || row.KELAS || row['Kelas / Rombel'] || row.Rombel || row.ROMBEL;
      if (rawKelas && String(rawKelas).trim()) {
        detectedKelas = String(rawKelas).trim();
      }
    }
    if (!detectedNamaUjian) {
      const rawUjian =
        row['Nama Ujian'] ||
        row['NAMA UJIAN'] ||
        row['Paket Ujian'] ||
        row['PAKET UJIAN'] ||
        row.Ujian ||
        row.UJIAN;
      if (rawUjian && String(rawUjian).trim()) {
        detectedNamaUjian = String(rawUjian).trim();
      }
    }

    const no = String(
      row.No || row.NO || row.Nomor || row.NOMOR || row['No Soal'] || row['No. Soal'] || idx + 1
    ).trim();
    const raw = String(
      row.Kunci ||
        row.KUNCI ||
        row['Kunci Jawaban'] ||
        row['KUNCI JAWABAN'] ||
        row.Jawaban ||
        row.JAWABAN ||
        'A'
    )
      .toUpperCase()
      .replace(/[^A-E]/g, '');
    const answers = Array.from(new Set(raw.split('')));
    const isPgk = answers.length > 1;
    const customWeight = Number(row.Bobot || row.BOBOT || row.Skor || row.SKOR);

    kunciMap[no] = {
      type: isPgk ? 'PGK' : 'PG',
      answers: answers.length > 0 ? answers : ['A'],
      weight: customWeight > 0 ? customWeight : isPgk ? defaultWeightPGK : defaultWeightPG,
    };
  });

  return {
    kunciMap,
    jumlahSoal: Object.keys(kunciMap).length,
    detectedMapel,
    detectedKelas,
    detectedNamaUjian,
  };
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

// 5. Download Template Excel Kunci Jawaban LJK Otomatis PG & PGK (.xlsx)
export function downloadAnswerKeyTemplateExcel() {
  const sampleRows = [
    { No: 1, Kunci: 'A', Bobot: 2, 'Mata Pelajaran': 'Matematika', Kelas: 'Kelas 10', 'Nama Ujian': 'PAS Semester Ganjil' },
    { No: 2, Kunci: 'C', Bobot: 2, 'Mata Pelajaran': '', Kelas: '', 'Nama Ujian': '' },
    { No: 3, Kunci: 'B', Bobot: 2, 'Mata Pelajaran': '', Kelas: '', 'Nama Ujian': '' },
    { No: 4, Kunci: 'D', Bobot: 2, 'Mata Pelajaran': '', Kelas: '', 'Nama Ujian': '' },
    { No: 5, Kunci: 'E', Bobot: 2, 'Mata Pelajaran': '', Kelas: '', 'Nama Ujian': '' },
    { No: 6, Kunci: 'A', Bobot: 2, 'Mata Pelajaran': '', Kelas: '', 'Nama Ujian': '' },
    { No: 7, Kunci: 'B', Bobot: 2, 'Mata Pelajaran': '', Kelas: '', 'Nama Ujian': '' },
    { No: 8, Kunci: 'C', Bobot: 2, 'Mata Pelajaran': '', Kelas: '', 'Nama Ujian': '' },
    { No: 9, Kunci: 'D', Bobot: 2, 'Mata Pelajaran': '', Kelas: '', 'Nama Ujian': '' },
    { No: 10, Kunci: 'E', Bobot: 2, 'Mata Pelajaran': '', Kelas: '', 'Nama Ujian': '' },
    { No: 11, Kunci: 'A', Bobot: 2, 'Mata Pelajaran': '', Kelas: '', 'Nama Ujian': '' },
    { No: 12, Kunci: 'B', Bobot: 2, 'Mata Pelajaran': '', Kelas: '', 'Nama Ujian': '' },
    { No: 13, Kunci: 'C', Bobot: 2, 'Mata Pelajaran': '', Kelas: '', 'Nama Ujian': '' },
    { No: 14, Kunci: 'D', Bobot: 2, 'Mata Pelajaran': '', Kelas: '', 'Nama Ujian': '' },
    { No: 15, Kunci: 'E', Bobot: 2, 'Mata Pelajaran': '', Kelas: '', 'Nama Ujian': '' },
    { No: 16, Kunci: 'A', Bobot: 2, 'Mata Pelajaran': '', Kelas: '', 'Nama Ujian': '' },
    { No: 17, Kunci: 'B', Bobot: 2, 'Mata Pelajaran': '', Kelas: '', 'Nama Ujian': '' },
    { No: 18, Kunci: 'C', Bobot: 2, 'Mata Pelajaran': '', Kelas: '', 'Nama Ujian': '' },
    { No: 19, Kunci: 'D', Bobot: 2, 'Mata Pelajaran': '', Kelas: '', 'Nama Ujian': '' },
    { No: 20, Kunci: 'E', Bobot: 2, 'Mata Pelajaran': '', Kelas: '', 'Nama Ujian': '' },
    { No: 21, Kunci: 'AC', Bobot: 6, 'Mata Pelajaran': '', Kelas: '', 'Nama Ujian': '' },
    { No: 22, Kunci: 'BDE', Bobot: 6, 'Mata Pelajaran': '', Kelas: '', 'Nama Ujian': '' },
    { No: 23, Kunci: 'ABD', Bobot: 6, 'Mata Pelajaran': '', Kelas: '', 'Nama Ujian': '' },
    { No: 24, Kunci: 'CE', Bobot: 6, 'Mata Pelajaran': '', Kelas: '', 'Nama Ujian': '' },
    { No: 25, Kunci: 'ACE', Bobot: 6, 'Mata Pelajaran': '', Kelas: '', 'Nama Ujian': '' },
  ];
  const ws = XLSX.utils.json_to_sheet(sampleRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Kunci Jawaban LJK');
  XLSX.writeFile(wb, 'Template_Kunci_Jawaban_LJK.xlsx');
}
