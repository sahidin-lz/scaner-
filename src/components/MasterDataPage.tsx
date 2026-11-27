import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Trash2,
  Users,
  Download,
  Search,
  BookOpen,
  X,
  Pencil,
  Check,
  RotateCcw,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { Student, Subject, Exam } from '../lib/ljkGenerator';
import { ScanResult } from '../lib/omrCameraEngine';

interface Props {
  exams: Exam[];
  results: ScanResult[];
  onDeleteExam: (id: string) => Promise<void>;
  onClearAllExams: () => Promise<void>;
  onClearAllResults: () => Promise<void>;
  allSubjects: Subject[];
  dbSubjects: Subject[];
  filteredSubjectsCatalog: Subject[];
  jenjangOptions: readonly string[];
  filterJenjangAdmin: string;
  onChangeFilterJenjangAdmin: (v: string) => void;
  searchMapel: string;
  onChangeSearchMapel: (v: string) => void;
  newKodeMapel: string;
  onChangeNewKodeMapel: (v: string) => void;
  newNamaMapel: string;
  onChangeNewNamaMapel: (v: string) => void;
  newJenjangMapel: string;
  onChangeNewJenjangMapel: (v: string) => void;
  editingSubjectId: string | null;
  onSetEditingSubjectId: (id: string | null) => void;
  editKodeMapel: string;
  onChangeEditKodeMapel: (v: string) => void;
  editNamaMapel: string;
  onChangeEditNamaMapel: (v: string) => void;
  editJenjangMapel: string;
  onChangeEditJenjangMapel: (v: string) => void;
  onAddSubject: (e: React.FormEvent) => Promise<void>;
  onStartEditSubject: (sub: Subject) => void;
  onSaveEditSubject: (sub: Subject) => Promise<void>;
  onDeleteSubject: (sub: Subject) => Promise<void>;
  onRestoreDefaultSubjects: () => Promise<void>;
  students: Student[];
  filteredStudents: Student[];
  uniqueClasses: string[];
  filterKelasSiswa: string;
  onChangeFilterKelasSiswa: (v: string) => void;
  newPresensi: string;
  onChangeNewPresensi: (v: string) => void;
  newNama: string;
  onChangeNewNama: (v: string) => void;
  newKelas: string;
  onChangeNewKelas: (v: string) => void;
  loading: boolean;
  onImportStudents: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onAddStudentManual: (e: React.FormEvent) => Promise<void>;
  onDeleteStudent: (id: string) => Promise<void>;
  onDeleteClassStudents?: (kelas: string) => Promise<void>;
  onClearAllStudents: () => Promise<void>;
  onDownloadStudentTemplate: () => void;
}

export default function MasterDataPage({
  exams,
  results,
  onDeleteExam,
  onClearAllExams,
  onClearAllResults,
  allSubjects,
  dbSubjects,
  filteredSubjectsCatalog,
  jenjangOptions,
  filterJenjangAdmin,
  onChangeFilterJenjangAdmin,
  searchMapel,
  onChangeSearchMapel,
  newKodeMapel,
  onChangeNewKodeMapel,
  newNamaMapel,
  onChangeNewNamaMapel,
  newJenjangMapel,
  onChangeNewJenjangMapel,
  editingSubjectId,
  onSetEditingSubjectId,
  editKodeMapel,
  onChangeEditKodeMapel,
  editNamaMapel,
  onChangeEditNamaMapel,
  editJenjangMapel,
  onChangeEditJenjangMapel,
  onAddSubject,
  onStartEditSubject,
  onSaveEditSubject,
  onDeleteSubject,
  onRestoreDefaultSubjects,
  students,
  filteredStudents,
  uniqueClasses,
  filterKelasSiswa,
  onChangeFilterKelasSiswa,
  newPresensi,
  onChangeNewPresensi,
  newNama,
  onChangeNewNama,
  newKelas,
  onChangeNewKelas,
  loading,
  onImportStudents,
  onAddStudentManual,
  onDeleteStudent,
  onDeleteClassStudents,
  onClearAllStudents,
  onDownloadStudentTemplate,
}: Props) {
  const [masterSubTab, setMasterSubTab] = useState<'siswa' | 'pas' | 'mapel'>('siswa');

  return (
    <div className="space-y-4">
      {/* Sub-Navigasi Master Data agar Tidak Menumpuk */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMasterSubTab('siswa')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              masterSubTab === 'siswa'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            1. Database Siswa &amp; Kelas ({students.length})
          </button>
          <button
            type="button"
            onClick={() => setMasterSubTab('pas')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              masterSubTab === 'pas'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            2. Hapus Data PAS &amp; Rekap ({exams.length} Paket)
          </button>
          <button
            type="button"
            onClick={() => setMasterSubTab('mapel')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              masterSubTab === 'mapel'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            3. Master Mata Pelajaran ({allSubjects.length})
          </button>
        </div>
      </div>

      {/* Section 0: MANAJEMEN & HAPUS DATA PAS / PAKET UJIAN & REKAP NILAI (KHUSUS ADMIN) */}
      {masterSubTab === 'pas' && (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                Manajemen &amp; Hapus Data PAS / Paket Ujian ({exams.length} Paket · {results.length} Rekap LJK)
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Admin dapat menghapus data ujian PAS lama, mereset paket ujian tertentu, atau mengosongkan seluruh rekap nilai ujian.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {results.length > 0 && (
              <button
                type="button"
                onClick={onClearAllResults}
                disabled={loading}
                className="px-3 py-2 bg-amber-50 hover:bg-amber-600 text-amber-800 hover:text-white border border-amber-200 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                Hapus Semua Rekap Nilai ({results.length})
              </button>
            )}

            {exams.length > 0 && (
              <button
                type="button"
                onClick={onClearAllExams}
                disabled={loading}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                Hapus Semua Data PAS / Ujian ({exams.length})
              </button>
            )}
          </div>
        </div>

        {exams.length === 0 ? (
          <div className="py-6 px-4 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
            <p className="text-xs font-semibold text-slate-600">
              Seluruh data PAS / Paket Ujian telah bersih (0 Paket Ujian).
            </p>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <tr>
                    <th className="py-2.5 px-3.5 text-left font-semibold">Nama Kegiatan / PAS</th>
                    <th className="py-2.5 px-3.5 text-left font-semibold">Mata Pelajaran</th>
                    <th className="py-2.5 px-3.5 text-left font-semibold">Kelas</th>
                    <th className="py-2.5 px-3.5 text-right font-semibold">Jml Soal</th>
                    <th className="py-2.5 px-3.5 text-right font-semibold">Rekap Tersimpan</th>
                    <th className="py-2.5 px-3.5 text-right font-semibold">Aksi Hapus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {exams.map((ex) => {
                    const examResultCount = results.filter(
                      (r) => r.examId === ex.id || (r.mapel === ex.mapel && r.kelas === ex.kelas)
                    ).length;
                    return (
                      <tr key={ex.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3.5 font-semibold text-slate-900 text-xs sm:text-sm">
                          {ex.namaUjian}
                        </td>
                        <td className="py-2.5 px-3.5 font-medium text-blue-700 text-xs sm:text-sm">
                          {ex.mapel}
                        </td>
                        <td className="py-2.5 px-3.5 text-xs font-semibold text-slate-700">
                          {ex.kelas}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono tabular-nums text-xs text-slate-600">
                          {ex.jumlahSoal} Soal
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono tabular-nums text-xs text-slate-600">
                          {examResultCount} LJK
                        </td>
                        <td className="py-2.5 px-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => onDeleteExam(ex.id)}
                            disabled={loading}
                            className="px-2.5 py-1 bg-red-50 hover:bg-red-600 text-red-700 hover:text-white border border-red-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Hapus PAS Ini
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Section 1: Database Induk Siswa & Kelas (Penting untuk Nama & Kelas Lengkap di LJK) */}
      {masterSubTab === 'siswa' && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-5 min-w-0 flex flex-col justify-between gap-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Input Master Siswa &amp; Kelas</span>
                </h3>
                <button
                  type="button"
                  onClick={onDownloadStudentTemplate}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Template Excel
                </button>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                Nama siswa dan kelas/rombel yang terdaftar di sini otomatis tercetak lengkap pada <strong>Tabel Identitas LJK</strong> serta dikenali kamera saat pemindaian.
              </p>

              <label className="flex items-center justify-center gap-2 w-full py-3 px-3 border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/40 rounded-xl cursor-pointer transition-colors text-xs font-semibold text-slate-700">
                <FileSpreadsheet className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Upload Excel Daftar Siswa (.xlsx)</span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={onImportStudents}
                  disabled={loading}
                  className="hidden"
                />
              </label>
            </div>

            <form
              onSubmit={onAddStudentManual}
              className="space-y-2.5 pt-3 border-t border-slate-100"
            >
              <p className="text-xs font-bold text-slate-700">Atau Tambah Siswa Manual:</p>
              <div className="grid grid-cols-3 gap-2">
                <input
                  className="border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-mono"
                  value={newPresensi}
                  onChange={(e) => onChangeNewPresensi(e.target.value)}
                  placeholder="No. Presensi"
                />
                <input
                  list="jenjang-kelas-list"
                  className="col-span-2 border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-semibold"
                  value={newKelas}
                  onChange={(e) => onChangeNewKelas(e.target.value)}
                  placeholder="Kelas Lengkap (mis: 10 ALI BIN ABI THALIB)"
                />
                <datalist id="jenjang-kelas-list">
                  {uniqueClasses.map((kls) => (
                    <option key={kls} value={kls} />
                  ))}
                  <option value="Kelas 10" />
                  <option value="Kelas 11" />
                  <option value="Kelas 12" />
                </datalist>
              </div>
              <div className="flex gap-2">
                <input
                  className="flex-1 min-w-0 border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-medium"
                  value={newNama}
                  onChange={(e) => onChangeNewNama(e.target.value)}
                  placeholder="Nama Lengkap Siswa (mis: ARIF ASKAR MAULANA)"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shrink-0 cursor-pointer"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Tabel Database Induk Siswa */}
        <div className="lg:col-span-7 min-w-0 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Database Induk Siswa ({filteredStudents.length} Siswa)</span>
              </h3>
              <p className="text-xs text-slate-500">
                Terdaftar pada {uniqueClasses.length || 0} rombel kelas · Siap cetak ke LJK PDF
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterKelasSiswa}
                onChange={(e) => onChangeFilterKelasSiswa(e.target.value)}
                className="border border-slate-300 bg-white px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-800"
              >
                <option value="SEMUA">Semua Kelas ({students.length})</option>
                {uniqueClasses.map((kls) => (
                  <option key={kls} value={kls}>
                    {kls} ({students.filter((s) => s.kelas === kls).length})
                  </option>
                ))}
              </select>

              {filterKelasSiswa !== 'SEMUA' && onDeleteClassStudents && (
                <button
                  type="button"
                  onClick={() => onDeleteClassStudents(filterKelasSiswa)}
                  disabled={loading}
                  className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  Hapus Kelas ({filterKelasSiswa})
                </button>
              )}

              {students.length > 0 && (
                <button
                  type="button"
                  onClick={onClearAllStudents}
                  disabled={loading}
                  className="px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  Kosongkan Semua
                </button>
              )}
            </div>
          </div>

          {filteredStudents.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-center border border-dashed border-slate-200 rounded-xl space-y-1.5">
              <AlertTriangle className="w-5 h-5 text-amber-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">
                Belum Ada Data Siswa Terdaftar
              </p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Unggah file Excel daftar siswa di sebelah kiri atau tambahkan siswa manual agar Nama Siswa &amp; Kelas tercetak lengkap di LJK.
              </p>
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <tr>
                    <th className="py-2.5 px-3 text-left font-semibold w-20">Presensi</th>
                    <th className="py-2.5 px-3 text-left font-semibold">Nama Lengkap Siswa</th>
                    <th className="py-2.5 px-3 text-left font-semibold w-44">Kelas / Rombel</th>
                    <th className="py-2.5 px-3 text-right font-semibold w-16">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3 font-mono tabular-nums font-semibold text-slate-800">
                        {s.presensi}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{s.nama}</td>
                      <td className="py-2.5 px-3 text-slate-700 text-xs font-semibold">
                        {s.kelas}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => onDeleteStudent(s.id)}
                          title="Hapus siswa"
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-md transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Section 2: MANAJEMEN DAFTAR MATA PELAJARAN & JENJANG KELAS 10, 11, 12 */}
      {masterSubTab === 'mapel' && (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                Master Mata Pelajaran &amp; Jenjang ({filteredSubjectsCatalog.length} dari {allSubjects.length} Mapel)
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              Kelola daftar mata pelajaran beserta pilihan Jenjang (<strong>Kelas 10</strong>, <strong>Kelas 11</strong>, dan <strong>Kelas 12</strong>).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(['SEMUA', 'Kelas 10', 'Kelas 11', 'Kelas 12'] as const).map((jnj) => (
              <button
                key={jnj}
                type="button"
                onClick={() => onChangeFilterJenjangAdmin(jnj)}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  filterJenjangAdmin === jnj
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                {jnj === 'SEMUA' ? 'Semua Jenjang' : jnj}
              </button>
            ))}

            {dbSubjects.some((s) => s.defaultSoal === 0) && (
              <button
                type="button"
                onClick={onRestoreDefaultSubjects}
                disabled={loading}
                className="px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg inline-flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Pulihkan Mapel
              </button>
            )}
          </div>
        </div>

        {/* Form Tambah Mapel Baru + Pilihan Jenjang Kelas 10, 11, 12 & Pencarian */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
          <form
            onSubmit={onAddSubject}
            className="lg:col-span-9 grid grid-cols-1 sm:grid-cols-12 gap-2"
          >
            <input
              type="text"
              value={newKodeMapel}
              onChange={(e) => onChangeNewKodeMapel(e.target.value)}
              placeholder="Kode (mis: MTK)"
              className="sm:col-span-2 border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-mono"
            />
            <input
              type="text"
              value={newNamaMapel}
              onChange={(e) => onChangeNewNamaMapel(e.target.value)}
              placeholder="Ketik Nama Mata Pelajaran Baru..."
              className="sm:col-span-5 min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-xs"
            />
            <select
              value={newJenjangMapel}
              onChange={(e) => onChangeNewJenjangMapel(e.target.value)}
              className="sm:col-span-3 border border-slate-300 bg-white rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-800"
            >
              {jenjangOptions.map((j) => (
                <option key={j} value={j}>
                  Jenjang: {j}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={loading}
              className="sm:col-span-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shrink-0 cursor-pointer whitespace-nowrap"
            >
              + Tambah Mapel
            </button>
          </form>

          <div className="lg:col-span-3 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchMapel}
              onChange={(e) => onChangeSearchMapel(e.target.value)}
              placeholder="Cari nama/kode mapel..."
              className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50"
            />
          </div>
        </div>

        {/* Tabel Daftar Mapel */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="py-2.5 px-3 text-left font-semibold w-12">No</th>
                  <th className="py-2.5 px-3 text-left font-semibold w-24">Kode</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Nama Mata Pelajaran</th>
                  <th className="py-2.5 px-3 text-left font-semibold w-44">Jenjang Kelas</th>
                  <th className="py-2.5 px-3 text-right font-semibold w-36">Aksi Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSubjectsCatalog.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                      Tidak ada mata pelajaran untuk filter ini.
                    </td>
                  </tr>
                ) : (
                  filteredSubjectsCatalog.map((sub, idx) => {
                    const isEditing = editingSubjectId === sub.id;
                    const jenjangLabel = sub.jenjang || 'Kelas 10, 11 & 12';
                    return (
                      <tr key={sub.id} className="hover:bg-slate-50/80">
                        <td className="py-2 px-3 font-mono tabular-nums text-xs text-slate-500">
                          {String(idx + 1).padStart(2, '0')}
                        </td>
                        <td className="py-2 px-3">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editKodeMapel}
                              onChange={(e) => onChangeEditKodeMapel(e.target.value)}
                              className="w-20 border border-blue-500 rounded px-2 py-1 text-xs font-mono font-semibold"
                            />
                          ) : (
                            <span className="font-mono text-xs font-semibold text-slate-700">
                              {sub.kode}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editNamaMapel}
                              onChange={(e) => onChangeEditNamaMapel(e.target.value)}
                              className="w-full border border-blue-500 rounded px-2.5 py-1 text-xs font-semibold"
                            />
                          ) : (
                            <span className="font-medium text-slate-900 text-xs sm:text-sm">
                              {sub.namaMapel}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {isEditing ? (
                            <select
                              value={editJenjangMapel}
                              onChange={(e) => onChangeEditJenjangMapel(e.target.value)}
                              className="w-full border border-blue-500 bg-white rounded px-2 py-1 text-xs font-semibold text-slate-800"
                            >
                              {jenjangOptions.map((j) => (
                                <option key={j} value={j}>
                                  {j}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs font-semibold text-blue-700 whitespace-nowrap">
                              {jenjangLabel}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {isEditing ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => onSaveEditSubject(sub)}
                                disabled={loading}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Simpan
                              </button>
                              <button
                                type="button"
                                onClick={() => onSetEditingSubjectId(null)}
                                className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                                title="Batal"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => onStartEditSubject(sub)}
                                className="px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded inline-flex items-center gap-1 cursor-pointer"
                                title="Edit mapel & jenjang"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteSubject(sub)}
                                disabled={loading}
                                className="px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 rounded inline-flex items-center gap-1 cursor-pointer"
                                title="Hapus mapel"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Hapus
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
