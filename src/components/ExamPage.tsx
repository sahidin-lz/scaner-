import React, { useState } from 'react';
import {
  FileSpreadsheet,
  FileDown,
  Trash2,
  FileText,
  ScanLine,
  Download,
  Plus,
  X,
  KeyRound,
} from 'lucide-react';
import {
  generateTwoInOneLJKPdf,
  Student,
  Subject,
  Exam,
} from '../lib/ljkGenerator';

interface Props {
  exams: Exam[];
  selectedExam: Exam | null;
  onSelectExamId: (id: string) => void;
  students: Student[];
  resultsCountByExamAndClass: (examId: string, kelas: string) => number;
  allClassOptions: string[];
  guruSubjectsByJenjang: Subject[];
  jenjangGuruFilter: string;
  onChangeJenjangGuruFilter: (v: string) => void;
  mapelGuru: string;
  onChangeMapelGuru: (v: string) => void;
  isCustomGuruMapel: boolean;
  onToggleCustomGuruMapel: () => void;
  customGuruMapelText: string;
  onChangeCustomGuruMapelText: (v: string) => void;
  kelasGuru: string;
  onChangeKelasGuru: (v: string) => void;
  isCustomGuruKelas: boolean;
  onToggleCustomGuruKelas: () => void;
  customGuruKelasText: string;
  onChangeCustomGuruKelasText: (v: string) => void;
  namaUjian: string;
  onChangeNamaUjian: (v: string) => void;
  jumlahSoal: number;
  onChangeJumlahSoal: (v: number) => void;
  bobotPG: number;
  onChangeBobotPG: (v: number) => void;
  bobotPGK: number;
  onChangeBobotPGK: (v: number) => void;
  kunciText: string;
  onChangeKunciText: (v: string) => void;
  guruPrintJumlahSiswa: number;
  onChangeGuruPrintJumlahSiswa: (v: number) => void;
  loading: boolean;
  onUploadKeyExcel: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onSaveExamManual: () => Promise<void>;
  onDeleteExam: (id: string) => Promise<void>;
  onDownloadKeyTemplate: () => void;
  onStartFullscreenScan: (exam: Exam, targetKelas: string) => void;
  buildFallbackClassStudents: (kelasLabel: string, count: number) => Student[];
  showNotification: (text: string, type?: 'success' | 'warning') => void;
}

export default function ExamPage({
  exams,
  selectedExam,
  onSelectExamId,
  students,
  resultsCountByExamAndClass,
  allClassOptions,
  guruSubjectsByJenjang,
  jenjangGuruFilter,
  onChangeJenjangGuruFilter,
  mapelGuru,
  onChangeMapelGuru,
  isCustomGuruMapel,
  onToggleCustomGuruMapel,
  customGuruMapelText,
  onChangeCustomGuruMapelText,
  kelasGuru,
  onChangeKelasGuru,
  isCustomGuruKelas,
  onToggleCustomGuruKelas,
  customGuruKelasText,
  onChangeCustomGuruKelasText,
  namaUjian,
  onChangeNamaUjian,
  jumlahSoal,
  onChangeJumlahSoal,
  bobotPG,
  onChangeBobotPG,
  bobotPGK,
  onChangeBobotPGK,
  kunciText,
  onChangeKunciText,
  guruPrintJumlahSiswa,
  onChangeGuruPrintJumlahSiswa,
  loading,
  onUploadKeyExcel,
  onSaveExamManual,
  onDeleteExam,
  onDownloadKeyTemplate,
  onStartFullscreenScan,
  buildFallbackClassStudents,
  showNotification,
}: Props) {
  const [showKeyFormModal, setShowKeyFormModal] = useState(false);
  const [filterKelasCard, setFilterKelasCard] = useState<string>('SEMUA');

  const visibleExams =
    filterKelasCard === 'SEMUA'
      ? exams
      : exams.filter((e) => e.kelas === filterKelasCard);

  function openEditExamModal(ex: Exam) {
    onSelectExamId(ex.id);
    onChangeKelasGuru(ex.kelas);
    onChangeMapelGuru(ex.mapel);
    onChangeNamaUjian(ex.namaUjian);
    onChangeJumlahSoal(ex.jumlahSoal);
    const orderedKeys = Array.from({ length: ex.jumlahSoal }, (_, idx) => {
      const k = ex.kunciJawaban[String(idx + 1)];
      return k ? k.answers.join('') : 'A';
    });
    onChangeKunciText(orderedKeys.join(' '));
    setShowKeyFormModal(true);
  }

  return (
    <div className="space-y-5">
      {/* Header Beranda Paket Ujian: Ringkas & Fokus pada Kartu Ujian + Tombol Mulai Scan */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900">
            Daftar Paket Ujian, Kunci Soal &amp; Cetak LJK ({visibleExams.length})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Pilih kartu ujian untuk langsung menekan <strong>Mulai Scan</strong>, mengunduh <strong>LJK PDF (1 A4 = 2 Siswa)</strong>, atau mengedit kunci jawaban
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Dropdown Filter Kelas Ringkas (Menggantikan deretan 22 tombol kelas) */}
          <select
            value={filterKelasCard}
            onChange={(e) => setFilterKelasCard(e.target.value)}
            className="border border-slate-300 bg-white rounded-lg px-3 py-2 text-xs font-semibold text-slate-800"
          >
            <option value="SEMUA">Semua Kelas ({exams.length} Paket)</option>
            {allClassOptions.map((kls) => (
              <option key={kls} value={kls}>
                {kls}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
            <span className="text-slate-500">LJK/Kelas:</span>
            <input
              type="number"
              min={2}
              max={60}
              value={guruPrintJumlahSiswa}
              onChange={(e) => onChangeGuruPrintJumlahSiswa(Number(e.target.value))}
              className="w-12 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-center"
              title="Jumlah LJK siswa jika kelas belum memiliki daftar siswa di database"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowKeyFormModal(true)}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Buat / Edit Kunci Ujian
          </button>
        </div>
      </div>

      {/* Grid Kartu Paket Ujian ala EvalBee */}
      {visibleExams.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl py-12 px-4 text-center space-y-3">
          <p className="text-sm font-semibold text-slate-800">
            Belum Ada Paket Ujian Tersimpan
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            Buat paket ujian baru beserta kunci jawabannya (via upload Excel atau ketik manual) untuk mencetak LJK 2-in-1 dan memulai pemindaian kamera.
          </p>
          <button
            type="button"
            onClick={() => setShowKeyFormModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Buat Paket Ujian Pertama
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleExams.map((ex) => {
            const dbClassStudents = students.filter((s) => s.kelas === ex.kelas);
            const targetTotal =
              dbClassStudents.length > 0 ? dbClassStudents.length : guruPrintJumlahSiswa;
            const scannedCount = resultsCountByExamAndClass(ex.id, ex.kelas);
            const pgkCount = Object.values(ex.kunciJawaban || {}).filter(
              (k) => k.type === 'PGK'
            ).length;
            const isSelected = selectedExam?.id === ex.id;

            return (
              <div
                key={ex.id}
                onClick={() => onSelectExamId(ex.id)}
                className={`bg-white border rounded-xl p-5 flex flex-col justify-between gap-4 transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-blue-600'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <strong className="text-blue-700">{ex.kelas}</strong>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{ex.namaUjian}</span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 truncate mt-0.5">
                        {ex.mapel}
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteExam(ex.id);
                      }}
                      title="Hapus paket ujian"
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Metadata Tanpa Pill */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 font-mono tabular-nums">
                    <span>{ex.jumlahSoal}/40 Soal Aktif</span>
                    <span aria-hidden="true">·</span>
                    <span>{pgkCount} PGK</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Terkoreksi: <strong className="text-slate-900">{scannedCount}/{targetTotal}</strong> LJK
                    </span>
                  </div>
                </div>

                {/* 3 Tombol Aksi Utama per Kartu Ujian: Mulai Scan, Cetak LJK, Edit Kunci */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartFullscreenScan(ex, ex.kelas);
                    }}
                    className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <ScanLine className="w-3.5 h-3.5 shrink-0" />
                    Mulai Scan ({ex.kelas})
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const targetStudents =
                        dbClassStudents.length > 0
                          ? dbClassStudents
                          : buildFallbackClassStudents(ex.kelas, guruPrintJumlahSiswa);
                      generateTwoInOneLJKPdf({
                        mapel: ex.mapel,
                        kelasLabel: ex.kelas,
                        namaUjian: ex.namaUjian,
                        students: targetStudents,
                        exam: ex,
                        onNotify: (msg) => showNotification(msg, 'warning'),
                      }).then((ok) => {
                        if (ok) {
                          showNotification(
                            `PDF LJK 2-in-1 ${ex.mapel} (${ex.kelas} · ${targetStudents.length} Siswa) berhasil diunduh!`
                          );
                        }
                      });
                    }}
                    className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <FileDown className="w-3.5 h-3.5 shrink-0" />
                    Cetak LJK
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditExamModal(ex);
                    }}
                    className="py-2 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <KeyRound className="w-3.5 h-3.5 shrink-0" />
                    Kunci
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Ringkasan Kunci Jawaban untuk Paket Terpilih */}
      {selectedExam && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  Peta Kunci Jawaban Aktif: {selectedExam.mapel} ({selectedExam.kelas})
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Nomor 01 s.d. {String(selectedExam.jumlahSoal).padStart(2, '0')} dinilai otomatis · Nomor {selectedExam.jumlahSoal + 1}–40 pada kertas LJK diabaikan
              </p>
            </div>

            <button
              type="button"
              onClick={() => openEditExamModal(selectedExam)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Ubah Kunci Jawaban
            </button>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-8 md:grid-cols-10 gap-1.5 text-xs font-mono tabular-nums">
            {Array.from({ length: selectedExam.jumlahSoal }, (_, i) => {
              const qNo = String(i + 1);
              const k = selectedExam.kunciJawaban[qNo];
              if (!k) return null;
              const isPgk = k.type === 'PGK';
              return (
                <div
                  key={qNo}
                  className={`px-2 py-1.5 rounded-lg border flex items-center justify-between gap-1 ${
                    isPgk
                      ? 'bg-blue-50/60 border-blue-200 text-blue-950'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <span className="text-slate-500 text-[10px]">
                    {qNo.padStart(2, '0')}
                    {isPgk ? '*' : ''}
                  </span>
                  <span className="font-bold truncate">{k.answers.join('')}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal Buat / Edit Paket Ujian & Kunci Jawaban (Tidak menumpuk di halaman utama) */}
      {showKeyFormModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Pengaturan Paket Ujian &amp; Kunci Jawaban Guru
                </h3>
                <p className="text-xs text-slate-500">
                  Pilih Kelas &amp; Mata Pelajaran, lalu unggah Excel kunci atau ketik manual
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowKeyFormModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Pilih Kelas dengan Dropdown Ringkas atau Ketik Manual */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">1. Kelas Ujian</label>
                  <button
                    type="button"
                    onClick={onToggleCustomGuruKelas}
                    className="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
                  >
                    {isCustomGuruKelas ? 'Pilih Daftar' : '+ Ketik Rombel'}
                  </button>
                </div>
                {isCustomGuruKelas ? (
                  <input
                    type="text"
                    value={customGuruKelasText}
                    onChange={(e) => onChangeCustomGuruKelasText(e.target.value)}
                    placeholder="Mis: Kelas 10-A / XI IPA 1"
                    className="w-full border border-blue-500 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900"
                  />
                ) : (
                  <select
                    value={kelasGuru}
                    onChange={(e) => {
                      const kls = e.target.value;
                      onChangeKelasGuru(kls);
                      if (kls.includes('10')) onChangeJenjangGuruFilter('Kelas 10');
                      else if (kls.includes('11')) onChangeJenjangGuruFilter('Kelas 11');
                      else if (kls.includes('12')) onChangeJenjangGuruFilter('Kelas 12');
                    }}
                    className="w-full border border-slate-300 bg-white rounded-lg px-3 py-2 text-xs font-semibold text-slate-900"
                  >
                    {allClassOptions.map((kls) => (
                      <option key={kls} value={kls}>
                        {kls}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Filter Jenjang */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  2. Filter Jenjang Mapel
                </label>
                <select
                  value={jenjangGuruFilter}
                  onChange={(e) => onChangeJenjangGuruFilter(e.target.value)}
                  className="w-full border border-slate-300 bg-white rounded-lg px-3 py-2 text-xs font-semibold text-slate-900"
                >
                  <option value="Kelas 10">Mapel Jenjang Kelas 10</option>
                  <option value="Kelas 11">Mapel Jenjang Kelas 11</option>
                  <option value="Kelas 12">Mapel Jenjang Kelas 12</option>
                  <option value="SEMUA">Semua Jenjang (10, 11, 12)</option>
                </select>
              </div>

              {/* Pilih Mapel */}
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">
                    3. Mata Pelajaran ({guruSubjectsByJenjang.length})
                  </label>
                  <button
                    type="button"
                    onClick={onToggleCustomGuruMapel}
                    className="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
                  >
                    {isCustomGuruMapel ? 'Pilih Daftar' : '+ Ketik Mapel Baru'}
                  </button>
                </div>
                {isCustomGuruMapel ? (
                  <input
                    type="text"
                    value={customGuruMapelText}
                    onChange={(e) => onChangeCustomGuruMapelText(e.target.value)}
                    placeholder="Ketik nama mata pelajaran..."
                    className="w-full border border-blue-500 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900"
                  />
                ) : (
                  <select
                    value={mapelGuru}
                    onChange={(e) => onChangeMapelGuru(e.target.value)}
                    className="w-full border border-slate-300 bg-white rounded-lg px-3 py-2 text-xs font-semibold text-slate-900"
                  >
                    {guruSubjectsByJenjang.map((sub) => (
                      <option key={sub.id} value={sub.namaMapel}>
                        {sub.namaMapel}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nama Kegiatan Ujian
                </label>
                <input
                  type="text"
                  value={namaUjian}
                  onChange={(e) => onChangeNamaUjian(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-blue-700 mb-1">
                  Jumlah Soal Aktif (dari 40)
                </label>
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={jumlahSoal}
                  onChange={(e) => onChangeJumlahSoal(Number(e.target.value))}
                  className="w-full border border-blue-500 bg-blue-50/30 rounded-lg px-3 py-2 text-xs font-bold font-mono tabular-nums text-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-600 mb-1">
                  Bobot Poin PG
                </label>
                <input
                  type="number"
                  min={1}
                  value={bobotPG}
                  onChange={(e) => onChangeBobotPG(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono tabular-nums"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-600 mb-1">
                  Bobot Poin PGK
                </label>
                <input
                  type="number"
                  min={1}
                  value={bobotPGK}
                  onChange={(e) => onChangeBobotPGK(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono tabular-nums"
                />
              </div>
            </div>

            {/* Opsi A: Upload Excel Kunci */}
            <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-950">
                  Opsi A — Upload Excel Kunci Jawaban (.xlsx)
                </span>
                <button
                  type="button"
                  onClick={onDownloadKeyTemplate}
                  className="text-xs font-semibold text-blue-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Template Excel
                </button>
              </div>
              <label className="inline-flex items-center justify-center gap-2 w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors">
                <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                <span>Pilih File Excel Kunci Jawaban (.xlsx)</span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={async (e) => {
                    await onUploadKeyExcel(e);
                    setShowKeyFormModal(false);
                  }}
                  disabled={loading}
                  className="hidden"
                />
              </label>
            </div>

            {/* Opsi B: Ketik Manual */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">
                Opsi B — Ketik Kunci Manual ({jumlahSoal} Soal · Pisahkan dengan spasi)
              </label>
              <textarea
                rows={3}
                value={kunciText}
                onChange={(e) => onChangeKunciText(e.target.value)}
                placeholder="Misal: A C B D E ... AC BDE"
                className="w-full border border-slate-300 p-2.5 rounded-lg font-mono text-xs leading-relaxed resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowKeyFormModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={async () => {
                  await onSaveExamManual();
                  setShowKeyFormModal(false);
                }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Simpan Paket Ujian
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
