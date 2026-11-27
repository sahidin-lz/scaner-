import React, { useState } from 'react';
import {
  FileDown,
  Trash2,
  BarChart3,
  Search,
  Eye,
  X,
  ScanLine,
  Plus,
  CheckSquare,
} from 'lucide-react';
import { Exam, Student, generateTwoInOneLJKPdf } from '../lib/ljkGenerator';
import { ScanResult } from '../lib/omrCameraEngine';
import { exportResultsToExcel } from '../lib/excelHelper';

interface ClassSummaryRow {
  kelas: string;
  count: number;
  avg: number;
  max: number;
  min: number;
  pass: number;
  passPct: number;
  rows: ScanResult[];
}

interface Props {
  exams: Exam[];
  selectedExam: Exam | null;
  results: ScanResult[];
  filteredResults: ScanResult[];
  filterKelasRekap: string;
  onChangeFilterKelasRekap: (kls: string) => void;
  filterMapelRekap: string;
  onChangeFilterMapelRekap: (m: string) => void;
  searchRekap: string;
  onChangeSearchRekap: (s: string) => void;
  allClassOptions: string[];
  classSummaryBreakdown: ClassSummaryRow[];
  avgScore: number;
  maxScore: number;
  minScore: number;
  passCount: number;
  passRate: number;
  inspectedResult: ScanResult | null;
  onSelectInspectedResult: (res: ScanResult | null) => void;
  inspectedExam: Exam | null;
  onDeleteResult: (id?: string) => Promise<void>;
  onClearAllResults?: () => Promise<void>;
  onGoToExamPage: () => void;
  onOpenFullscreenScan: (targetKelas?: string) => void;
  showNotification: (text: string, type?: 'success' | 'warning') => void;
}

export default function RecapPage({
  exams,
  selectedExam,
  results,
  filteredResults,
  filterKelasRekap,
  onChangeFilterKelasRekap,
  filterMapelRekap,
  onChangeFilterMapelRekap,
  searchRekap,
  onChangeSearchRekap,
  allClassOptions,
  classSummaryBreakdown,
  avgScore,
  maxScore,
  minScore,
  passCount,
  passRate,
  inspectedResult,
  onSelectInspectedResult,
  inspectedExam,
  onDeleteResult,
  onClearAllResults,
  onGoToExamPage,
  onOpenFullscreenScan,
  showNotification,
}: Props) {
  const [rekapSubTab, setRekapSubTab] = useState<'siswa' | 'kelas' | 'analisis'>('siswa');

  // Kelompokkan hasil nilai LJK berdasarkan kombinasi Mata Pelajaran & Kelas agar tidak keluar bercampur semua
  const groupedByMapelAndKelas = React.useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        mapel: string;
        kelas: string;
        examObj: Exam | null;
        rows: ScanResult[];
        avg: number;
        max: number;
        min: number;
        passCount: number;
        passPct: number;
      }
    >();

    filteredResults.forEach((r) => {
      const matchedEx =
        (r.examId && exams.find((e) => e.id === r.examId)) ||
        (r.mapel
          ? exams.find((e) => e.mapel.toLowerCase() === r.mapel.toLowerCase())
          : null) ||
        selectedExam;
      const mpl = (r.mapel || matchedEx?.mapel || 'Mata Pelajaran').trim();
      const kls = (r.kelas || matchedEx?.kelas || 'Kelas 10').trim();
      const groupKey = `${mpl.toLowerCase()}::${kls.toLowerCase()}`;

      const existing = map.get(groupKey);
      if (existing) {
        existing.rows.push(r);
      } else {
        map.set(groupKey, {
          key: groupKey,
          mapel: mpl,
          kelas: kls,
          examObj: matchedEx || null,
          rows: [r],
          avg: 0,
          max: 0,
          min: 0,
          passCount: 0,
          passPct: 0,
        });
      }
    });

    const groups = Array.from(map.values()).map((grp) => {
      const sortedRows = [...grp.rows].sort((a, b) =>
        a.presensi.padStart(2, '0').localeCompare(b.presensi.padStart(2, '0'))
      );
      const count = sortedRows.length;
      const sum = sortedRows.reduce((acc, item) => acc + item.skor, 0);
      const avg = count > 0 ? Number((sum / count).toFixed(1)) : 0;
      const max =
        count > 0 ? Math.max(...sortedRows.map((item) => item.skor)) : 0;
      const min =
        count > 0 ? Math.min(...sortedRows.map((item) => item.skor)) : 0;
      const passCount = sortedRows.filter((item) => item.skor >= 75).length;
      const passPct = count > 0 ? Math.round((passCount / count) * 100) : 0;

      return {
        ...grp,
        rows: sortedRows,
        avg,
        max,
        min,
        passCount,
        passPct,
      };
    });

    return groups.sort((a, b) => {
      const mCmp = a.mapel.localeCompare(b.mapel);
      return mCmp !== 0 ? mCmp : a.kelas.localeCompare(b.kelas);
    });
  }, [exams, filteredResults, selectedExam]);

  const [selectedGroupKey, setSelectedGroupKey] = useState<string>('ALL_GROUPS');

  const visibleGroups = React.useMemo(() => {
    if (
      selectedGroupKey === 'ALL_GROUPS' ||
      !groupedByMapelAndKelas.some((g) => g.key === selectedGroupKey)
    ) {
      return groupedByMapelAndKelas;
    }
    return groupedByMapelAndKelas.filter((g) => g.key === selectedGroupKey);
  }, [groupedByMapelAndKelas, selectedGroupKey]);

  const handleDownloadGroupExcel = (grp: (typeof groupedByMapelAndKelas)[number]) => {
    const soalCount = grp.examObj?.jumlahSoal || selectedExam?.jumlahSoal || 25;
    exportResultsToExcel(`${grp.mapel}_${grp.kelas}`, grp.rows, soalCount);
    showNotification(
      `Daftar Nilai Excel (${grp.mapel} - ${grp.kelas}) berhasil diunduh!`
    );
  };

  const handleDownloadGroupShadedPdf = (grp: (typeof groupedByMapelAndKelas)[number]) => {
    const studentsList: Student[] = [];
    const answersByStudentId: Record<string, Record<string, string>> = {};
    grp.rows.forEach((r, idx) => {
      const sId = r.id || `${r.studentId}_${idx}`;
      studentsList.push({
        id: sId,
        presensi: r.presensi,
        nama: r.nama,
        kelas: r.kelas,
      });
      answersByStudentId[sId] = r.detailJawaban || {};
    });

    generateTwoInOneLJKPdf({
      mapel: grp.mapel,
      kelasLabel: grp.kelas,
      namaUjian: grp.examObj?.namaUjian || 'HASIL REKAP LJK',
      students: studentsList,
      exam: grp.examObj || selectedExam,
      answersByStudentId,
      filePrefix: `LJK_Arsiran_${grp.mapel.replace(/\s+/g, '_')}`,
    }).then((ok) => {
      if (ok) {
        showNotification(
          `PDF LJK Arsiran (${grp.mapel} - ${grp.kelas}) berhasil diunduh!`
        );
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Header & Filter Bar yang Rapi (Judul di Atas, Baris Filter 3 Kolom di Bawah agar Tidak Pernah Terhimpit) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
        {/* Baris 1: Judul Halaman & Tombol Aksi Utama */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                Daftar Nilai LJK Dikelompokkan per Mapel &amp; Kelas (
                {groupedByMapelAndKelas.length} Kelompok)
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Setiap kelompok Mata Pelajaran &amp; Kelas terpisah rapi dan dapat diunduh Excel maupun PDF LJK Arsirannya masing-masing
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (filteredResults.length === 0) {
                  showNotification(
                    'Belum ada data hasil LJK untuk dicetak arsirannya.',
                    'warning'
                  );
                  return;
                }
                const targetRows =
                  visibleGroups.length === 1
                    ? visibleGroups[0].rows
                    : filteredResults;
                const activeExamObj =
                  (visibleGroups.length === 1 && visibleGroups[0].examObj) ||
                  (filterMapelRekap !== 'SEMUA' &&
                    exams.find((e) => e.id === filterMapelRekap)) ||
                  selectedExam;
                const labelMapel =
                  (visibleGroups.length === 1 && visibleGroups[0].mapel) ||
                  activeExamObj?.mapel ||
                  targetRows[0]?.mapel ||
                  'Penilaian';
                const labelKelas =
                  (visibleGroups.length === 1 && visibleGroups[0].kelas) ||
                  (filterKelasRekap === 'SEMUA'
                    ? targetRows[0]?.kelas || 'Semua_Kelas'
                    : filterKelasRekap);

                const studentsList: Student[] = [];
                const answersByStudentId: Record<string, Record<string, string>> = {};
                targetRows.forEach((r, idx) => {
                  const sId = r.id || `${r.studentId}_${idx}`;
                  studentsList.push({
                    id: sId,
                    presensi: r.presensi,
                    nama: r.nama,
                    kelas: r.kelas,
                  });
                  answersByStudentId[sId] = r.detailJawaban || {};
                });

                generateTwoInOneLJKPdf({
                  mapel: labelMapel,
                  kelasLabel: labelKelas,
                  namaUjian: activeExamObj?.namaUjian || 'HASIL REKAP LJK',
                  students: studentsList,
                  exam: activeExamObj,
                  answersByStudentId,
                  filePrefix: 'LJK_Arsiran_Rekap',
                }).then((ok) => {
                  if (ok) {
                    showNotification(
                      `PDF LJK Berarsir Jawaban (${targetRows.length} Siswa) berhasil diunduh!`
                    );
                  }
                });
              }}
              className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              title="Cetak PDF LJK Hitam Putih lengkap dengan arsiran jawaban tiap siswa"
            >
              <CheckSquare className="w-3.5 h-3.5 shrink-0" />
              Cetak LJK Arsiran
            </button>

            <button
              type="button"
              onClick={() => {
                if (filteredResults.length === 0) {
                  showNotification(
                    'Belum ada data hasil LJK untuk diunduh.',
                    'warning'
                  );
                  return;
                }
                if (visibleGroups.length === 1) {
                  handleDownloadGroupExcel(visibleGroups[0]);
                  return;
                }
                const activeExamObj =
                  (filterMapelRekap !== 'SEMUA' &&
                    exams.find((e) => e.id === filterMapelRekap)) ||
                  selectedExam;
                const soalCount = activeExamObj?.jumlahSoal || 25;
                const labelMapel = activeExamObj?.mapel || 'Semua_Mapel';
                const labelKelas =
                  filterKelasRekap === 'SEMUA' ? 'Semua_Kelas' : filterKelasRekap;
                exportResultsToExcel(`${labelMapel}_${labelKelas}`, filteredResults, soalCount);
                showNotification(
                  `Daftar Nilai Excel (dikelompokkan per sheet Mapel & Kelas) berhasil diunduh!`
                );
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileDown className="w-3.5 h-3.5 shrink-0" />
              Download Excel
            </button>

            {onClearAllResults && results.length > 0 && (
              <button
                type="button"
                onClick={onClearAllResults}
                className="px-3 py-2 bg-red-50 hover:bg-red-600 text-red-700 hover:text-white border border-red-200 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                title="Bersihkan seluruh data rekap nilai"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                Reset Rekap
              </button>
            )}
          </div>
        </div>

        {/* Baris 2: Grid Filter 3 Kolom (Pilih Kelas, Pilih Mapel, Cari Siswa) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Filter Kelas / Rombel
            </label>
            <select
              value={filterKelasRekap}
              onChange={(e) => {
                onChangeFilterKelasRekap(e.target.value);
                setSelectedGroupKey('ALL_GROUPS');
              }}
              className="w-full border border-slate-300 bg-white px-3 py-2 rounded-xl text-xs font-semibold text-slate-800"
            >
              <option value="SEMUA">Semua Kelas ({results.length} LJK)</option>
              {allClassOptions.map((kls) => {
                const count =
                  classSummaryBreakdown.find((c) => c.kelas === kls)?.count || 0;
                return (
                  <option key={kls} value={kls}>
                    {kls} ({count} Siswa)
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Filter Mata Pelajaran
            </label>
            <select
              value={filterMapelRekap}
              onChange={(e) => {
                onChangeFilterMapelRekap(e.target.value);
                setSelectedGroupKey('ALL_GROUPS');
              }}
              className="w-full border border-slate-300 bg-white px-3 py-2 rounded-xl text-xs font-semibold text-slate-800 truncate"
            >
              <option value="SEMUA">Semua Mata Pelajaran ({results.length})</option>
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.mapel} — {ex.kelas} ({ex.jumlahSoal} Soal)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Cari Siswa / Presensi
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchRekap}
                onChange={(e) => onChangeSearchRekap(e.target.value)}
                placeholder="Ketik nama atau no. presensi..."
                className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-xl text-xs"
              />
            </div>
          </div>
        </div>

        {/* Baris 3: 4 Summary Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-xs text-slate-500 block truncate">
              Rata-Rata ({filterKelasRekap === 'SEMUA' ? 'Semua Kelas' : filterKelasRekap})
            </span>
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {avgScore}
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              Dari {filteredResults.length} LJK Siswa
            </span>
          </div>
          <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl">
            <span className="text-xs text-emerald-700 block">Nilai Tertinggi</span>
            <span className="text-2xl font-bold font-mono tabular-nums text-emerald-800">
              {maxScore}
            </span>
            <span className="text-[11px] text-emerald-700 block mt-0.5">
              Skala 0 – 100
            </span>
          </div>
          <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl">
            <span className="text-xs text-amber-800 block">Nilai Terendah</span>
            <span className="text-2xl font-bold font-mono tabular-nums text-amber-900">
              {minScore}
            </span>
            <span className="text-[11px] text-amber-700 block mt-0.5">
              Batas KKM: 75.0
            </span>
          </div>
          <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl">
            <span className="text-xs text-blue-700 block">Ketuntasan (&ge;75)</span>
            <span className="text-2xl font-bold font-mono tabular-nums text-blue-900">
              {passRate}%
            </span>
            <span className="text-[11px] text-blue-700 block mt-0.5">
              {passCount} dari {filteredResults.length} Siswa Tuntas
            </span>
          </div>
        </div>

        {/* Sub-Navigasi Rapi agar Tabel Tidak Menumpuk */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setRekapSubTab('siswa')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              rekapSubTab === 'siswa'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            1. Daftar Nilai per Mapel &amp; Kelas ({groupedByMapelAndKelas.length} Kelompok)
          </button>
          <button
            type="button"
            onClick={() => setRekapSubTab('kelas')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              rekapSubTab === 'kelas'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            2. Ringkasan Antar Kelas ({classSummaryBreakdown.length})
          </button>
          <button
            type="button"
            onClick={() => setRekapSubTab('analisis')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              rekapSubTab === 'analisis'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            3. Analisis Ketepatan Butir Soal
          </button>
        </div>

        {/* Tabel Ringkasan Perbandingan Antar Kelas (Hanya tampil jika tab 'kelas' dipilih) */}
        {rekapSubTab === 'kelas' && (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                Ringkasan Perbandingan Nilai Antar Kelas
              </span>
              <span className="text-[11px] text-slate-500">
                Klik baris kelas untuk membuka kelompok nilai kelas tersebut
              </span>
            </div>
            <div className="overflow-x-auto max-h-56 overflow-y-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-white border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2 px-3 text-left font-semibold">Kelas</th>
                    <th className="py-2 px-3 text-right font-semibold">LJK Terkoreksi</th>
                    <th className="py-2 px-3 text-right font-semibold">Rata-Rata</th>
                    <th className="py-2 px-3 text-right font-semibold">Tertinggi</th>
                    <th className="py-2 px-3 text-right font-semibold">Terendah</th>
                    <th className="py-2 px-3 text-right font-semibold">Ketuntasan (&ge;75)</th>
                    <th className="py-2 px-3 text-right font-semibold">Aksi Kelas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {classSummaryBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-500">
                        Belum ada kelas terdaftar.
                      </td>
                    </tr>
                  ) : (
                    classSummaryBreakdown.map((item) => (
                      <tr
                        key={item.kelas}
                        onClick={() => {
                          onChangeFilterKelasRekap(item.kelas);
                          setRekapSubTab('siswa');
                        }}
                        className={`cursor-pointer transition-colors ${
                          filterKelasRekap === item.kelas
                            ? 'bg-blue-50/70 font-semibold'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-2 px-3 font-bold text-slate-900">{item.kelas}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {item.count} Siswa
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-blue-700">
                          {item.avg}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-emerald-700">
                          {item.max}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-amber-700">
                          {item.min}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {item.passPct}% ({item.pass}/{item.count})
                        </td>
                        <td className="py-2 px-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenFullscreenScan(item.kelas);
                              }}
                              className="px-2 py-1 bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 rounded font-semibold transition-colors cursor-pointer"
                            >
                              Scan
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (item.rows.length === 0) {
                                  showNotification(
                                    `Belum ada hasil scan pada ${item.kelas} untuk dicetak LJK arsirannya.`,
                                    'warning'
                                  );
                                  return;
                                }
                                const studentsList: Student[] = [];
                                const answersByStudentId: Record<
                                  string,
                                  Record<string, string>
                                > = {};
                                item.rows.forEach((r, idx) => {
                                  const sId = r.id || `${r.studentId}_${idx}`;
                                  studentsList.push({
                                    id: sId,
                                    presensi: r.presensi,
                                    nama: r.nama,
                                    kelas: r.kelas,
                                  });
                                  answersByStudentId[sId] = r.detailJawaban || {};
                                });
                                generateTwoInOneLJKPdf({
                                  mapel:
                                    inspectedExam?.mapel ||
                                    item.rows[0]?.mapel ||
                                    'Penilaian',
                                  kelasLabel: item.kelas,
                                  namaUjian:
                                    inspectedExam?.namaUjian || 'HASIL REKAP LJK',
                                  students: studentsList,
                                  exam: inspectedExam,
                                  answersByStudentId,
                                  filePrefix: 'LJK_Arsiran_Kelas',
                                }).then((ok) => {
                                  if (ok) {
                                    showNotification(
                                      `PDF LJK Berarsir Jawaban ${item.kelas} berhasil diunduh!`
                                    );
                                  }
                                });
                              }}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-900 text-slate-800 hover:text-white border border-slate-300 rounded font-semibold transition-colors cursor-pointer"
                              title="Cetak LJK Berarsir Jawaban untuk kelas ini"
                            >
                              LJK Arsiran
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (item.rows.length === 0) {
                                  showNotification(
                                    `Belum ada hasil scan pada ${item.kelas}.`,
                                    'warning'
                                  );
                                  return;
                                }
                                exportResultsToExcel(
                                  `Rekap_${item.kelas}`,
                                  item.rows,
                                  inspectedExam?.jumlahSoal || 25
                                );
                                showNotification(
                                  `Rekap Excel ${item.kelas} berhasil diunduh!`
                                );
                              }}
                              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 rounded font-semibold transition-colors cursor-pointer"
                            >
                              Excel
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Daftar Nilai LJK Siswa yang Dikelompokkan per Mata Pelajaran & Kelas + Panel Rapor Individual */}
      {rekapSubTab === 'siswa' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div
            className={`${
              inspectedResult ? 'lg:col-span-7' : 'lg:col-span-12'
            } space-y-4`}
          >
            {/* Bar Pilihan Kelompok Mapel & Kelas (Jika ada > 1 kelompok agar tidak menumpuk) */}
            {groupedByMapelAndKelas.length > 1 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">
                    Pilih Kelompok Mata Pelajaran &amp; Kelas:
                  </span>
                  <span className="text-slate-500">
                    {groupedByMapelAndKelas.length} Kelompok Tersedia
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedGroupKey('ALL_GROUPS')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                      selectedGroupKey === 'ALL_GROUPS'
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Tampilkan Semua Kelompok ({groupedByMapelAndKelas.length})
                  </button>
                  {groupedByMapelAndKelas.map((grp) => (
                    <button
                      key={grp.key}
                      type="button"
                      onClick={() => setSelectedGroupKey(grp.key)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                        selectedGroupKey === grp.key
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {grp.mapel} — {grp.kelas} ({grp.rows.length})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {visibleGroups.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3 shadow-xs">
                <p className="text-sm font-semibold text-slate-700">
                  Belum Ada Hasil Koreksi LJK Tersimpan
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Mulai pemindaian kamera untuk mata pelajaran dan kelas ini, maka daftar nilai akan otomatis dikelompokkan per Mapel &amp; Kelas.
                </p>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={onGoToExamPage}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Daftar Paket Ujian
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenFullscreenScan(
                        filterKelasRekap !== 'SEMUA' ? filterKelasRekap : undefined
                      )
                    }
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ScanLine className="w-3.5 h-3.5" />
                    Mulai Scan Sekarang
                  </button>
                </div>
              </div>
            ) : (
              visibleGroups.map((grp) => (
                <div
                  key={grp.key}
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs"
                >
                  {/* Header Kelompok: Nama Mata Pelajaran, Kelas, Statistik & Tombol Download Khusus Kelompok Ini */}
                  <div className="bg-slate-900 text-white px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 bg-blue-500/20 border border-blue-400/40 text-blue-200 rounded-lg text-[11px] font-bold">
                          MAPEL: {grp.mapel.toUpperCase()}
                        </span>
                        <span className="px-2.5 py-0.5 bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 rounded-lg text-[11px] font-bold">
                          KELAS: {grp.kelas.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 font-mono tabular-nums pt-0.5">
                        <span>
                          Jumlah: <strong className="text-white">{grp.rows.length} Siswa</strong>
                        </span>
                        <span>·</span>
                        <span>
                          Rata-Rata: <strong className="text-emerald-300">{grp.avg}</strong>
                        </span>
                        <span>·</span>
                        <span>
                          Tertinggi: <strong className="text-blue-300">{grp.max}</strong>
                        </span>
                        <span>·</span>
                        <span>
                          Tuntas: <strong className="text-white">{grp.passPct}%</strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDownloadGroupShadedPdf(grp)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                        title={`Cetak PDF LJK Arsiran khusus ${grp.mapel} - ${grp.kelas}`}
                      >
                        <CheckSquare className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        LJK Arsiran ({grp.kelas})
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadGroupExcel(grp)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                        title={`Download Daftar Nilai Excel khusus ${grp.mapel} - ${grp.kelas}`}
                      >
                        <FileDown className="w-3.5 h-3.5 shrink-0" />
                        Download Excel ({grp.mapel})
                      </button>
                    </div>
                  </div>

                  {/* Tabel Daftar Nilai Siswa untuk Kelompok Mapel & Kelas Ini */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                          <th className="py-2.5 px-3 text-left font-semibold w-16">No</th>
                          <th className="py-2.5 px-3 text-left font-semibold">Nama Siswa</th>
                          <th className="py-2.5 px-3 text-left font-semibold">Mata Pelajaran</th>
                          <th className="py-2.5 px-3 text-left font-semibold w-36">Kelas</th>
                          <th className="py-2.5 px-3 text-right font-semibold w-14">B</th>
                          <th className="py-2.5 px-3 text-right font-semibold w-14">S</th>
                          <th className="py-2.5 px-3 text-right font-semibold w-14">K</th>
                          <th className="py-2.5 px-3 text-right font-semibold w-20">Nilai</th>
                          <th className="py-2.5 px-3 text-right font-semibold w-28">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {grp.rows.map((r, i) => {
                          const isInspected =
                            inspectedResult &&
                            (inspectedResult.id === r.id ||
                              (inspectedResult.presensi === r.presensi &&
                                inspectedResult.kelas === r.kelas &&
                                inspectedResult.mapel === r.mapel));
                          const isPass = r.skor >= 75;
                          return (
                            <tr
                              key={r.id || `${grp.key}_${i}`}
                              onClick={() => onSelectInspectedResult(r)}
                              className={`cursor-pointer transition-colors ${
                                isInspected
                                  ? 'bg-blue-50/70'
                                  : r.statusRagu
                                  ? 'bg-amber-50/50 hover:bg-amber-50'
                                  : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="py-2.5 px-3 font-mono tabular-nums font-semibold text-slate-800">
                                {r.presensi.padStart(2, '0')}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-slate-900">
                                <div>{r.nama}</div>
                                <span
                                  className={`text-[10px] font-semibold ${
                                    isPass ? 'text-emerald-700' : 'text-amber-700'
                                  }`}
                                >
                                  {isPass ? 'Tuntas' : 'Perlu Remedial'}
                                  {r.statusRagu ? ' · Cek Manual' : ''}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-xs font-semibold text-blue-700">
                                {grp.mapel}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                                  {grp.kelas}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                                {r.benar}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-red-600">
                                {r.salah}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-500">
                                {r.kosong}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-blue-600">
                                {r.skor}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectInspectedResult(r);
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 rounded text-xs font-semibold transition-colors cursor-pointer"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    LJK
                                  </button>
                                  {r.id && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteResult(r.id);
                                      }}
                                      title="Hapus hasil scan ini"
                                      className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Kartu Rapor Detail Hasil LJK Siswa Terpilih */}
          {inspectedResult && inspectedExam && (
            <div className="lg:col-span-5 bg-white border-2 border-blue-600 rounded-2xl p-5 space-y-4 flex flex-col justify-between shadow-xs">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <span className="text-xs font-bold text-blue-600 block">
                      Rapor Detail Jawaban LJK Siswa
                    </span>
                    <h3 className="text-base font-bold text-slate-900">
                      {inspectedResult.nama}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {inspectedResult.kelas} · No. Presensi {inspectedResult.presensi} ·{' '}
                      {inspectedResult.mapel || inspectedExam.mapel}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const sId =
                          inspectedResult.id || inspectedResult.studentId || 'stu_1';
                        const singleStudent: Student = {
                          id: sId,
                          presensi: inspectedResult.presensi,
                          nama: inspectedResult.nama,
                          kelas: inspectedResult.kelas,
                        };
                        generateTwoInOneLJKPdf({
                          mapel: inspectedResult.mapel || inspectedExam.mapel,
                          kelasLabel: `${inspectedResult.kelas}_No_${inspectedResult.presensi}`,
                          namaUjian: inspectedExam.namaUjian,
                          students: [singleStudent],
                          exam: inspectedExam,
                          answersByStudentId: {
                            [sId]: inspectedResult.detailJawaban || {},
                          },
                          filePrefix: 'LJK_Arsiran_Siswa',
                        }).then((ok) => {
                          if (ok) {
                            showNotification(
                              `PDF LJK Berarsir Jawaban ${inspectedResult.nama} berhasil diunduh!`
                            );
                          }
                        });
                      }}
                      className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                      title="Cetak LJK dengan Arsiran Jawaban Siswa Ini"
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      Cetak LJK Arsiran
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectInspectedResult(null)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-900 text-white rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs">
                    <div>
                      <span className="text-slate-400 block">Benar</span>
                      <strong className="text-emerald-400 font-mono text-sm">
                        {inspectedResult.benar}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Salah</span>
                      <strong className="text-red-400 font-mono text-sm">
                        {inspectedResult.salah}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Kosong</span>
                      <strong className="text-slate-200 font-mono text-sm">
                        {inspectedResult.kosong}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Soal Aktif</span>
                      <strong className="text-blue-300 font-mono text-sm">
                        {inspectedExam.jumlahSoal}/40
                      </strong>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block">Nilai Akhir</span>
                    <span className="text-2xl font-bold font-mono tabular-nums text-emerald-400">
                      {inspectedResult.skor}
                    </span>
                  </div>
                </div>

                {inspectedResult.previewImage && (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <img
                      src={inspectedResult.previewImage}
                      alt="Bukti Scan LJK Siswa"
                      referrerPolicy="no-referrer"
                      className="w-full h-auto block"
                    />
                  </div>
                )}

                {/* Rincian Jawaban Per Nomor Soal */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">
                      Perbandingan Jawaban Siswa vs Kunci (1–{inspectedExam.jumlahSoal})
                    </span>
                    <span className="text-slate-500">Kertas Default 40 Soal</span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-64 overflow-y-auto text-xs font-mono pr-1">
                    {Array.from({ length: inspectedExam.jumlahSoal }, (_, idx) => {
                      const qNo = String(idx + 1);
                      const studentAns = inspectedResult.detailJawaban?.[qNo] || '-';
                      const keyObj = inspectedExam.kunciJawaban[qNo];
                      const keyStr = keyObj ? keyObj.answers.join('') : '-';
                      const isCorrect = studentAns === keyStr;
                      const isDoubt = studentAns === 'DOBEL';

                      return (
                        <div
                          key={qNo}
                          className={`p-2 rounded-lg border flex flex-col justify-between ${
                            isDoubt
                              ? 'bg-amber-50 border-amber-300 text-amber-900'
                              : isCorrect
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                              : 'bg-red-50 border-red-200 text-red-900'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] opacity-75">
                            <span>
                              No.{qNo.padStart(2, '0')}
                              {keyObj?.type === 'PGK' ? '*' : ''}
                            </span>
                            <span>{isCorrect ? 'Benar' : isDoubt ? 'Dobel' : 'Salah'}</span>
                          </div>
                          <div className="flex items-baseline justify-between mt-1">
                            <span className="font-bold text-xs">{studentAns}</span>
                            {!isCorrect && (
                              <span className="text-[10px] text-slate-600">
                                Kunci: {keyStr}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Analisis Ketepatan Per Butir Soal (Hanya tampil jika tab 'analisis' dipilih) */}
      {rekapSubTab === 'analisis' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-xs">
          {!inspectedExam || filteredResults.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Belum ada data hasil scan untuk dianalisis.
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Analisis Tingkat Ketepatan per Nomor Soal (
                    {filterKelasRekap === 'SEMUA' ? 'Semua Kelas' : filterKelasRekap} · No. 1 s.d.{' '}
                    {inspectedExam.jumlahSoal})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Memudahkan guru melihat nomor soal yang paling banyak dijawab benar atau salah pada kelas terpilih
                  </p>
                </div>
                <span className="text-xs text-slate-500 font-mono">
                  Nomor {inspectedExam.jumlahSoal + 1}–40 pada LJK Tidak Digunakan
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 md:grid-cols-8 gap-2 text-xs">
                {Array.from({ length: inspectedExam.jumlahSoal }, (_, idx) => {
                  const qNo = String(idx + 1);
                  const keyObj = inspectedExam.kunciJawaban[qNo];
                  const keyStr = keyObj ? keyObj.answers.join('') : '';
                  const correctStudents = filteredResults.filter(
                    (r) => (r.detailJawaban?.[qNo] || '-') === keyStr
                  ).length;
                  const accuracy = Math.round(
                    (correctStudents / filteredResults.length) * 100
                  );

                  return (
                    <div
                      key={qNo}
                      className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5"
                    >
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-bold text-slate-800">
                          No.{qNo.padStart(2, '0')}
                          {keyObj?.type === 'PGK' ? '*' : ''}
                        </span>
                        <span className="text-[11px] font-semibold text-blue-700">
                          {keyStr}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            accuracy >= 75
                              ? 'bg-emerald-500'
                              : accuracy >= 50
                              ? 'bg-amber-500'
                              : 'bg-red-500'
                          }`}
                          style={{ width: `${accuracy}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                        <span>{accuracy}% Benar</span>
                        <span>
                          {correctStudents}/{filteredResults.length}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
