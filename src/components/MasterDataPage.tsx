import React from 'react';
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
} from 'lucide-react';
import { Student, Subject } from '../lib/ljkGenerator';

interface Props {
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
  onClearAllStudents: () => Promise<void>;
  onDownloadStudentTemplate: () => void;
}

export default function MasterDataPage({
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
  onClearAllStudents,
  onDownloadStudentTemplate,
}: Props) {
  return (
    <div className="space-y-5">
      {/* Section 1: MANAJEMEN DAFTAR MATA PELAJARAN & JENJANG KELAS 10, 11, 12 */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                Master Mata Pelajaran &amp; Jenjang ({filteredSubjectsCatalog.length} dari {allSubjects.length} Mapel)
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              Kelola daftar mata pelajaran beserta pilihan Jenjang (<strong>Kelas 10</strong>, <strong>Kelas 11</strong>, dan <strong>Kelas 12</strong>): Tambah, Edit, atau Hapus.
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

        {/* Tabel Daftar Mapel dengan Kolom Jenjang Kelas 10/11/12 serta Fitur Edit & Hapus */}
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

      {/* Section 2: Master Data Siswa & Kelas (Bundel 1 Dokumen = 1 Kelas Penuh) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-5 min-w-0 flex flex-col justify-between gap-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 flex-1 flex flex-col justify-between">
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

              <p className="text-xs text-slate-500">
                Data siswa disimpan dalam bundel 1 dokumen per kelas (24 kelas hanya memakai 24 dokumen Firestore).
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
                  className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono"
                  value={newPresensi}
                  onChange={(e) => onChangeNewPresensi(e.target.value)}
                  placeholder="No. Presensi"
                />
                <input
                  list="jenjang-kelas-list"
                  className="col-span-2 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs"
                  value={newKelas}
                  onChange={(e) => onChangeNewKelas(e.target.value)}
                  placeholder="Kelas (mis: Kelas 10 / 10-A)"
                />
                <datalist id="jenjang-kelas-list">
                  <option value="Kelas 10" />
                  <option value="Kelas 11" />
                  <option value="Kelas 12" />
                </datalist>
              </div>
              <div className="flex gap-2">
                <input
                  className="flex-1 min-w-0 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs"
                  value={newNama}
                  onChange={(e) => onChangeNewNama(e.target.value)}
                  placeholder="Nama Lengkap Siswa"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shrink-0 cursor-pointer"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Tabel Database Induk Siswa */}
        <div className="lg:col-span-7 min-w-0 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Database Induk Siswa ({filteredStudents.length} Siswa)</span>
              </h3>
              <p className="text-xs text-slate-500">
                Terdaftar pada {uniqueClasses.length || 0} rombel kelas
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={filterKelasSiswa}
                onChange={(e) => onChangeFilterKelasSiswa(e.target.value)}
                className="border border-slate-300 bg-white px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-800"
              >
                <option value="SEMUA">Semua Kelas ({students.length})</option>
                {uniqueClasses.map((kls) => (
                  <option key={kls} value={kls}>
                    {kls}
                  </option>
                ))}
              </select>

              {students.length > 0 && (
                <button
                  type="button"
                  onClick={onClearAllStudents}
                  disabled={loading}
                  className="px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                >
                  Kosongkan
                </button>
              )}
            </div>
          </div>

          {filteredStudents.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-center border border-dashed border-slate-200 rounded-xl space-y-1.5">
              <p className="text-sm font-semibold text-slate-700">
                Belum Ada Data Siswa Terdaftar
              </p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Unggah file Excel daftar siswa di sebelah kiri atau tambahkan siswa secara manual.
              </p>
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <tr>
                    <th className="py-2.5 px-3 text-left font-semibold w-20">Presensi</th>
                    <th className="py-2.5 px-3 text-left font-semibold">Nama Siswa</th>
                    <th className="py-2.5 px-3 text-left font-semibold w-28">Kelas</th>
                    <th className="py-2.5 px-3 text-right font-semibold w-16">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3 font-mono tabular-nums font-semibold text-slate-800">
                        {s.presensi}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">{s.nama}</td>
                      <td className="py-2.5 px-3 text-slate-600 text-xs font-semibold">
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
    </div>
  );
}
