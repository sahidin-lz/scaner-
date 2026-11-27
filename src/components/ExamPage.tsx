import React, { useState } from 'react';
import {
  FileSpreadsheet,
  FileDown,
  Trash2,
  ScanLine,
  Download,
  Plus,
  X,
  KeyRound,
  CheckSquare,
  Users,
  SlidersHorizontal,
  Printer,
} from 'lucide-react';
import {
  generateTwoInOneLJKPdf,
  generateShadedExamLJKPdf,
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
  onImportStudents?: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onDownloadStudentTemplate?: () => void;
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
  onImportStudents,
  onDownloadStudentTemplate,
  onStartFullscreenScan,
  buildFallbackClassStudents,
  showNotification,
}: Props) {
  // Modal membuat / mengedit paket ujian & upload kunci otomatis
  const [showKeyFormModal, setShowKeyFormModal] = useState(false);
  // Modal menu kelola & cetak LJK per paket ujian (agar halaman depan tetap bersih & tidak menumpuk)
  const [managedExam, setManagedExam] = useState<Exam | null>(null);
  const [manageTab, setManageTab] = useState<'cetak' | 'kunci'>('cetak');

  const [filterKelasCard, setFilterKelasCard] = useState<string>('SEMUA');
  const [printClassOverrideByExam, setPrintClassOverrideByExam] = useState<Record<string, string>>({});

  const registeredStudentClasses = React.useMemo(() => {
    return Array.from(new Set(students.map((s) => s.kelas.trim()).filter(Boolean))).sort();
  }, [students]);

  const visibleExams =
    filterKelasCard === 'SEMUA'
      ? exams
      : exams.filter((e) => e.kelas === filterKelasCard);

  function resolveStudentsForExamPrint(ex: Exam): {
    targetKelasLabel: string;
    targetStudents: Student[];
    hasRegisteredRoster: boolean;
  } {
    const overrideKelas = printClassOverrideByExam[ex.id];
    const requestedKelas = (overrideKelas || ex.kelas || 'Kelas 10').trim();

    const exactMatch = students.filter(
      (s) => s.kelas.trim().toLowerCase() === requestedKelas.toLowerCase()
    );
    if (exactMatch.length > 0) {
      return {
        targetKelasLabel: exactMatch[0].kelas,
        targetStudents: exactMatch.map((s) => ({
          ...s,
          nama: s.nama.trim(),
          kelas: s.kelas.trim(),
        })),
        hasRegisteredRoster: true,
      };
    }

    const gradeNumberMatch = requestedKelas.match(/\b(10|11|12|X|XI|XII)\b/i);
    if (gradeNumberMatch && !overrideKelas) {
      const gradeToken = gradeNumberMatch[1].toUpperCase();
      const matchingRombelStudents = students.filter((s) =>
        s.kelas.toUpperCase().includes(gradeToken)
      );
      if (matchingRombelStudents.length > 0) {
        const firstRombel = matchingRombelStudents[0].kelas;
        const rombelList = matchingRombelStudents.filter((s) => s.kelas === firstRombel);
        return {
          targetKelasLabel: firstRombel,
          targetStudents: rombelList,
          hasRegisteredRoster: true,
        };
      }
    }

    return {
      targetKelasLabel: requestedKelas,
      targetStudents: buildFallbackClassStudents(requestedKelas, guruPrintJumlahSiswa),
      hasRegisteredRoster: false,
    };
  }

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
    setManagedExam(null);
    setShowKeyFormModal(true);
  }

  function openManageExamModal(ex: Exam, initialTab: 'cetak' | 'kunci' = 'cetak') {
    onSelectExamId(ex.id);
    setManagedExam(ex);
    setManageTab(initialTab);
  }

  // Pastikan managedExam selalu sinkron dengan state exams terbaru
  const activeManagedExam =
    (managedExam && exams.find((e) => e.id === managedExam.id)) || managedExam;

  return (
    <div className="space-y-4">
      {/* HALAMAN AWAL: Ringkas, Fokus Hanya pada Scan & Daftar Paket Ujian */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-slate-900">
            Daftar Paket Ujian ({visibleExams.length})
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Pilih paket ujian untuk langsung memindai LJK atau buka menu <strong>Cetak &amp; Kunci</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {allClassOptions.length > 1 && (
            <select
              value={filterKelasCard}
              onChange={(e) => setFilterKelasCard(e.target.value)}
              className="border border-slate-300 bg-white rounded-xl px-3 py-2 text-xs font-semibold text-slate-800"
            >
              <option value="SEMUA">Semua Kelas ({exams.length})</option>
              {allClassOptions.map((kls) => (
                <option key={kls} value={kls}>
                  {kls}
                </option>
              ))}
            </select>
          )}

          {selectedExam && (
            <button
              type="button"
              onClick={() => {
                const { targetKelasLabel } = resolveStudentsForExamPrint(selectedExam);
                onStartFullscreenScan(selectedExam, targetKelasLabel);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <ScanLine className="w-4 h-4 shrink-0" />
              <span>Scan LJK Sekarang</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowKeyFormModal(true)}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>Paket Ujian Baru</span>
          </button>
        </div>
      </div>

      {/* DAFTAR KARTU PAKET UJIAN: Bersih, Ringan, Tidak Menumpuk */}
      {visibleExams.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl py-12 px-4 text-center space-y-3 shadow-xs">
          <p className="text-sm font-bold text-slate-800">
            Belum Ada Paket Ujian Tersimpan
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            Buat paket ujian baru atau upload file Excel kunci jawaban LJK otomatis untuk mulai memindai.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowKeyFormModal(true)}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Buat Paket Ujian / Upload Kunci
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {visibleExams.map((ex) => {
            const { targetKelasLabel, targetStudents, hasRegisteredRoster } =
              resolveStudentsForExamPrint(ex);
            const targetTotal = targetStudents.length;
            const scannedCount =
              resultsCountByExamAndClass(ex.id, targetKelasLabel) ||
              resultsCountByExamAndClass(ex.id, ex.kelas);
            const isSelected = selectedExam?.id === ex.id;

            return (
              <div
                key={ex.id}
                onClick={() => onSelectExamId(ex.id)}
                className={`bg-white border rounded-2xl p-4 flex flex-col justify-between gap-4 transition-all cursor-pointer shadow-xs ${
                  isSelected
                    ? 'border-blue-600 ring-2 ring-blue-600/10'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <strong className="text-blue-700 font-semibold">
                          {targetKelasLabel}
                        </strong>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{ex.namaUjian}</span>
                      </div>
                      <h2 className="text-base font-bold text-slate-900 truncate mt-0.5">
                        {ex.mapel}
                      </h2>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteExam(ex.id);
                      }}
                      title="Hapus paket ujian ini"
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 font-mono tabular-nums pt-1">
                    <span>{ex.jumlahSoal} Soal</span>
                    <span>
                      Terkoreksi:{' '}
                      <strong className="text-slate-900">
                        {scannedCount}/{targetTotal}
                      </strong>
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 truncate">
                    {hasRegisteredRoster
                      ? `✓ ${targetStudents.length} Nama Siswa Lengkap (${targetKelasLabel})`
                      : `• ${targetStudents.length} LJK Presensi (${targetKelasLabel})`}
                  </div>
                </div>

                {/* Hanya 2 Tombol Rapi di Kartu Depan: Mulai Scan & Menu Cetak/Kunci */}
                <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartFullscreenScan(ex, targetKelasLabel);
                    }}
                    className="flex-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <ScanLine className="w-3.5 h-3.5 shrink-0" />
                    Mulai Scan
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openManageExamModal(ex, 'cetak');
                    }}
                    className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                    title="Menu Cetak LJK, Lihat Kunci Jawaban & Pilih Kelas Siswa"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                    Cetak &amp; Kunci
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: MENU KELOLA PAKET UJIAN (CETAK LJK, PILIH KELAS SISWA & PETA KUNCI JAWABAN) */}
      {activeManagedExam && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="min-w-0">
                <span className="text-xs font-semibold text-blue-600 block">
                  {activeManagedExam.namaUjian} · {activeManagedExam.kelas}
                </span>
                <h3 className="text-base font-bold text-slate-900 truncate">
                  {activeManagedExam.mapel} ({activeManagedExam.jumlahSoal} Soal)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setManagedExam(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sub-Tab di dalam Modal: 1. Cetak LJK & Kelas Siswa | 2. Kunci Jawaban */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setManageTab('cetak')}
                className={`py-2 rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  manageTab === 'cetak'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Printer className="w-3.5 h-3.5" />
                Cetak LJK &amp; Siswa
              </button>
              <button
                type="button"
                onClick={() => setManageTab('kunci')}
                className={`py-2 rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  manageTab === 'kunci'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                Kunci Jawaban ({activeManagedExam.jumlahSoal})
              </button>
            </div>

            {manageTab === 'cetak' ? (
              (() => {
                const { targetKelasLabel, targetStudents, hasRegisteredRoster } =
                  resolveStudentsForExamPrint(activeManagedExam);
                return (
                  <div className="space-y-4">
                    {/* Pengaturan Kelas / Rombel untuk Identitas LJK Lengkap */}
                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <span className="font-bold text-slate-800 block">
                            Kelas / Rombel pada Identitas LJK
                          </span>
                          <span className="text-slate-500">
                            {hasRegisteredRoster
                              ? `Terhubung dengan ${targetStudents.length} nama siswa terdaftar`
                              : `Menggunakan ${targetStudents.length} nomor presensi cadangan`}
                          </span>
                        </div>

                        {registeredStudentClasses.length > 0 && (
                          <select
                            value={
                              printClassOverrideByExam[activeManagedExam.id] ||
                              targetKelasLabel
                            }
                            onChange={(e) =>
                              setPrintClassOverrideByExam((prev) => ({
                                ...prev,
                                [activeManagedExam.id]: e.target.value,
                              }))
                            }
                            className="border border-slate-300 bg-white rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900"
                          >
                            {!registeredStudentClasses.includes(
                              activeManagedExam.kelas
                            ) && (
                              <option value={activeManagedExam.kelas}>
                                {activeManagedExam.kelas} (Default)
                              </option>
                            )}
                            {registeredStudentClasses.map((kls) => (
                              <option key={kls} value={kls}>
                                {kls} (
                                {students.filter((s) => s.kelas === kls).length}{' '}
                                Siswa)
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      {!hasRegisteredRoster && (
                        <div className="flex items-center justify-between pt-2 border-t border-slate-200/80">
                          <span className="text-slate-600">
                            Jumlah Lembar Siswa (Jika belum upload daftar siswa):
                          </span>
                          <input
                            type="number"
                            min={2}
                            max={60}
                            value={guruPrintJumlahSiswa}
                            onChange={(e) =>
                              onChangeGuruPrintJumlahSiswa(Number(e.target.value))
                            }
                            className="w-16 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono font-bold text-center"
                          />
                        </div>
                      )}

                      {onImportStudents && (
                        <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-slate-600 inline-flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-blue-600" />
                            Ingin nama siswa &amp; kelas tercetak lengkap?
                          </span>
                          <div className="flex items-center gap-1.5">
                            {onDownloadStudentTemplate && (
                              <button
                                type="button"
                                onClick={onDownloadStudentTemplate}
                                className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Download className="w-3 h-3" />
                                Template
                              </button>
                            )}
                            <label className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer">
                              <FileSpreadsheet className="w-3 h-3" />
                              <span>Upload Excel Siswa</span>
                              <input
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={onImportStudents}
                                disabled={loading}
                                className="hidden"
                              />
                            </label>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 2 Pilihan Cetak LJK PDF (Hitam Putih 2-in-1) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          const examForPrint: Exam = {
                            ...activeManagedExam,
                            kelas: targetKelasLabel,
                          };
                          generateTwoInOneLJKPdf({
                            mapel: activeManagedExam.mapel,
                            kelasLabel: targetKelasLabel,
                            namaUjian: activeManagedExam.namaUjian,
                            students: targetStudents,
                            exam: examForPrint,
                            onNotify: (msg) => showNotification(msg, 'warning'),
                          }).then((ok) => {
                            if (ok) {
                              showNotification(
                                `PDF LJK Hitam Putih 2-in-1 ${activeManagedExam.mapel} (${targetKelasLabel} · ${targetStudents.length} Siswa) berhasil diunduh!`
                              );
                            }
                          });
                        }}
                        className="p-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-left space-y-1 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 text-xs font-bold">
                          <FileDown className="w-4 h-4 shrink-0" />
                          <span>Cetak LJK Kosong (2-in-1)</span>
                        </div>
                        <p className="text-[11px] text-emerald-100 leading-snug">
                          PDF Hitam Putih (1 A4 = 2 Siswa) lengkap Nama Siswa, Kelas &amp; QR
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const examForPrint: Exam = {
                            ...activeManagedExam,
                            kelas: targetKelasLabel,
                          };
                          generateShadedExamLJKPdf({
                            exam: examForPrint,
                            students: targetStudents,
                            onNotify: (msg) => showNotification(msg, 'warning'),
                          }).then((ok) => {
                            if (ok) {
                              showNotification(
                                `PDF LJK Berarsir Jawaban ${activeManagedExam.mapel} (${targetKelasLabel} · ${targetStudents.length} Siswa) berhasil diunduh!`
                              );
                            }
                          });
                        }}
                        className="p-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-left space-y-1 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 text-xs font-bold">
                          <CheckSquare className="w-4 h-4 shrink-0" />
                          <span>Cetak LJK Arsiran Jawaban</span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-snug">
                          PDF LJK dengan bulatan terarsir otomatis sesuai kunci jawaban
                        </p>
                      </button>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-500">
                    Nomor 01 s.d. {String(activeManagedExam.jumlahSoal).padStart(2, '0')} aktif dinilai
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={onDownloadKeyTemplate}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Template Kunci (.xlsx)
                    </button>
                    <label className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer">
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Upload Kunci Otomatis</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={onUploadKeyExcel}
                        disabled={loading}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => openEditExamModal(activeManagedExam)}
                      className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      Edit Manual
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-5 sm:grid-cols-8 gap-1.5 text-xs font-mono tabular-nums max-h-60 overflow-y-auto p-1">
                  {Array.from({ length: activeManagedExam.jumlahSoal }, (_, i) => {
                    const qNo = String(i + 1);
                    const k = activeManagedExam.kunciJawaban[qNo];
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

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  const idToRemove = activeManagedExam.id;
                  setManagedExam(null);
                  onDeleteExam(idToRemove);
                }}
                className="px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hapus Paket PAS Ini
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setManagedExam(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const { targetKelasLabel } =
                      resolveStudentsForExamPrint(activeManagedExam);
                    setManagedExam(null);
                    onStartFullscreenScan(activeManagedExam, targetKelasLabel);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ScanLine className="w-3.5 h-3.5" />
                  Mulai Scan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: BUAT / EDIT PAKET UJIAN & UPLOAD KUNCI JAWABAN OTOMATIS */}
      {showKeyFormModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Buat / Edit Paket Ujian &amp; Kunci Jawaban LJK
                </h3>
                <p className="text-xs text-slate-500">
                  Upload template Excel kunci jawaban otomatis atau isi manual di bawah
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

            {/* Opsi A: Upload Excel Kunci Otomatis (Paling Atas agar Cepat & Ringkas) */}
            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-emerald-950 block">
                    Cara Cepat — Upload Kunci Jawaban LJK Otomatis (.xlsx)
                  </span>
                  <span className="text-[11px] text-emerald-800">
                    Otomatis membaca Mata Pelajaran, Kelas, Nama Ujian, Jumlah Soal &amp; Kunci
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onDownloadKeyTemplate}
                  className="px-2.5 py-1.5 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Template Kunci (.xlsx)
                </button>
              </div>
              <label className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors">
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                <span>Pilih &amp; Upload File Excel Kunci Jawaban LJK (.xlsx)</span>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">1. Kelas / Rombel Ujian</label>
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
                    placeholder="Mis: 10 ALI BIN ABI THALIB / XI IPA 1"
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
                  Nama Kegiatan Ujian / PAS
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

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">
                Ketik Kunci Manual ({jumlahSoal} Soal · Pisahkan dengan spasi)
              </label>
              <textarea
                rows={2}
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
