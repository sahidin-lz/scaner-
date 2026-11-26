import React from 'react';
import {
  FileDown,
  Trash2,
  BarChart3,
  Search,
  Eye,
  X,
  ScanLine,
  Plus,
} from 'lucide-react';
import { Exam } from '../lib/ljkGenerator';
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
  onGoToExamPage,
  onOpenFullscreenScan,
  showNotification,
}: Props) {
  return (
    <div className="space-y-5">
      {/* Top Filter Kelas (Dropdown Ringkas), Mapel & Export Excel Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="truncate">
                Rekapitulasi &amp; Analisis Nilai Ujian ({filterKelasRekap === 'SEMUA' ? 'Semua Kelas' : filterKelasRekap})
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pilih Kelas dan Mata Pelajaran melalui dropdown di kanan untuk melihat daftar nilai, rapor LJK tiap siswa, atau mengunduh Excel
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Dropdown Pilih Kelas Ringkas (Menggantikan 22 tombol pill kelas) */}
            <select
              value={filterKelasRekap}
              onChange={(e) => onChangeFilterKelasRekap(e.target.value)}
              className="border border-slate-300 bg-white px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-800"
            >
              <option value="SEMUA">Semua Kelas ({results.length} LJK)</option>
              {allClassOptions.map((kls) => {
                const count = classSummaryBreakdown.find((c) => c.kelas === kls)?.count || 0;
                return (
                  <option key={kls} value={kls}>
                    {kls} ({count} Siswa)
                  </option>
                );
              })}
            </select>

            {/* Dropdown Pilih Mata Pelajaran */}
            <select
              value={filterMapelRekap}
              onChange={(e) => onChangeFilterMapelRekap(e.target.value)}
              className="border border-slate-300 bg-white px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-800 max-w-[220px] truncate"
            >
              <option value="SEMUA">Semua Mapel ({results.length})</option>
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.mapel} — {ex.kelas} ({ex.jumlahSoal} Soal)
                </option>
              ))}
            </select>

            {/* Pencarian Siswa */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchRekap}
                onChange={(e) => onChangeSearchRekap(e.target.value)}
                placeholder="Cari siswa..."
                className="w-36 sm:w-40 pl-8 pr-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
              />
            </div>

            {/* Download Excel */}
            <button
              type="button"
              onClick={() => {
                if (filteredResults.length === 0) {
                  showNotification(
                    'Belum ada data hasil LJK pada kelas ini untuk diunduh.',
                    'warning'
                  );
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
                  `Rekap Nilai Excel (${labelKelas}) lengkap dengan rincian jawaban berhasil diunduh!`
                );
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileDown className="w-3.5 h-3.5 shrink-0" />
              Download Excel
            </button>
          </div>
        </div>

        {/* 4 Summary Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-xs text-slate-500 block">
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

        {/* Tabel Ringkasan Perbandingan Antar Kelas */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">
              Ringkasan Perbandingan Nilai Antar Kelas
            </span>
            <span className="text-[11px] text-slate-500">
              Klik baris kelas untuk menyaring daftar siswa di bawah
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
                {classSummaryBreakdown.map((item) => (
                  <tr
                    key={item.kelas}
                    onClick={() => onChangeFilterKelasRekap(item.kelas)}
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
                            showNotification(`Rekap Excel ${item.kelas} berhasil diunduh!`);
                          }}
                          className="px-2 py-1 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 rounded font-semibold transition-colors cursor-pointer"
                        >
                          Excel
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Tabel Hasil LJK Siswa + Panel Rapor LJK Individual */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div
          className={`${
            inspectedResult ? 'lg:col-span-7' : 'lg:col-span-12'
          } bg-white border border-slate-200 rounded-xl p-5 space-y-4 overflow-hidden`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">
              Daftar Nilai LJK Siswa ({filterKelasRekap === 'SEMUA' ? 'Semua Kelas' : filterKelasRekap} · {filteredResults.length} Siswa)
            </h3>
            <span className="text-xs text-slate-500">
              Klik baris siswa untuk membuka Rapor Detail Jawaban LJK
            </span>
          </div>

          {filteredResults.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-200 rounded-xl space-y-3">
              <p className="text-sm font-semibold text-slate-700">
                Belum Ada Hasil Koreksi LJK untuk {filterKelasRekap === 'SEMUA' ? 'Sekolah Ini' : filterKelasRekap}
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Mulai pemindaian kamera untuk kelas ini atau kelola kunci soal ujian pada menu Paket Ujian.
              </p>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={onGoToExamPage}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Kelola Paket Ujian
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onOpenFullscreenScan(
                      filterKelasRekap !== 'SEMUA' ? filterKelasRekap : undefined
                    )
                  }
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ScanLine className="w-3.5 h-3.5" />
                  Mulai Scan {filterKelasRekap !== 'SEMUA' ? filterKelasRekap : 'Sekarang'}
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2.5 px-3 text-left font-semibold w-16">No</th>
                    <th className="py-2.5 px-3 text-left font-semibold">Nama Siswa</th>
                    <th className="py-2.5 px-3 text-left font-semibold w-28">Kelas</th>
                    <th className="py-2.5 px-3 text-left font-semibold">Mapel</th>
                    <th className="py-2.5 px-3 text-right font-semibold w-14">B</th>
                    <th className="py-2.5 px-3 text-right font-semibold w-14">S</th>
                    <th className="py-2.5 px-3 text-right font-semibold w-14">K</th>
                    <th className="py-2.5 px-3 text-right font-semibold w-20">Nilai</th>
                    <th className="py-2.5 px-3 text-right font-semibold w-28">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredResults.map((r, i) => {
                    const isInspected =
                      inspectedResult &&
                      (inspectedResult.id === r.id ||
                        (inspectedResult.presensi === r.presensi &&
                          inspectedResult.kelas === r.kelas));
                    const isPass = r.skor >= 75;
                    return (
                      <tr
                        key={r.id || i}
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
                          {r.presensi}
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
                        <td className="py-2.5 px-3">
                          <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                            {r.kelas}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-xs text-slate-600 truncate max-w-[140px]">
                          {r.mapel || selectedExam?.mapel || '-'}
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
          )}
        </div>

        {/* Kartu Rapor Detail Hasil LJK Siswa Terpilih */}
        {inspectedResult && inspectedExam && (
          <div className="lg:col-span-5 bg-white border-2 border-blue-600 rounded-xl p-5 space-y-4 flex flex-col justify-between">
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
                <button
                  type="button"
                  onClick={() => onSelectInspectedResult(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
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

      {/* Analisis Ketepatan Per Butir Soal */}
      {inspectedExam && filteredResults.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Analisis Tingkat Ketepatan per Nomor Soal ({filterKelasRekap === 'SEMUA' ? 'Semua Kelas' : filterKelasRekap} · No. 1 s.d. {inspectedExam.jumlahSoal})
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
        </div>
      )}
    </div>
  );
}
