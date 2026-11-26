import React, { useRef, useState, useEffect } from 'react';
import {
  Camera,
  Zap,
  X,
  Upload,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  Sparkles,
  Info,
  Users,
} from 'lucide-react';
import { Exam, Student, renderFilledLJKToCanvas } from '../lib/ljkGenerator';
import { DEFAULT_LJK_CAPACITY } from '../lib/ljkLayout';
import { processCameraFrame, ScanResult } from '../lib/omrCameraEngine';

interface Props {
  exam: Exam;
  activeKelas: string;
  classOptions: string[];
  onChangeActiveKelas: (kls: string) => void;
  students: Student[];
  onResultSaved: (res: ScanResult) => Promise<void>;
}

export default function CameraScanner({
  exam,
  activeKelas,
  classOptions,
  onChangeActiveKelas,
  students,
  onResultSaved,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [saving, setSaving] = useState(false);

  // Override manual identitas kelas/siswa saat scan agar rekapan rapi per kelas
  const [overrideKelas, setOverrideKelas] = useState<string>(activeKelas || exam.kelas || 'Kelas 10');
  const [overridePresensi, setOverridePresensi] = useState<string>('01');
  const [overrideNama, setOverrideNama] = useState<string>('');

  const [simStudentId, setSimStudentId] = useState<string>('');
  const [simPreset, setSimPreset] = useState<'high' | 'mixed' | 'double'>('high');

  useEffect(() => {
    if (activeKelas && activeKelas !== 'SEMUA') {
      setOverrideKelas(activeKelas);
    } else if (exam.kelas) {
      setOverrideKelas(exam.kelas);
    }
  }, [activeKelas, exam.kelas]);

  const targetClassForStudents =
    activeKelas && activeKelas !== 'SEMUA' ? activeKelas : exam.kelas;
  const classStudents = students.filter((s) => s.kelas === targetClassForStudents);
  const availableStudents = classStudents.length > 0 ? classStudents : students;

  useEffect(() => {
    if (availableStudents.length > 0) {
      if (!availableStudents.some((s) => s.id === simStudentId)) {
        const first = availableStudents[0];
        setSimStudentId(first.id);
        setOverridePresensi(first.presensi);
        setOverrideNama(first.nama);
        setOverrideKelas(first.kelas);
      }
    }
  }, [availableStudents, simStudentId]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  async function startCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraOn(true);
      }
    } catch {
      setCameraError(
        'Gagal membuka kamera belakang. Pastikan izin kamera browser aktif atau gunakan fitur Upload Foto LJK / Simulasi Uji Coba di bawah.'
      );
    }
  }

  function stopCamera() {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    setCameraOn(false);
  }

  function applyClassAndStudentOverride(rawResult: ScanResult): ScanResult {
    const chosenKelas =
      activeKelas && activeKelas !== 'SEMUA'
        ? activeKelas
        : rawResult.kelas && rawResult.kelas !== '-'
        ? rawResult.kelas
        : exam.kelas || 'Kelas 10';

    const cleanPresensi =
      rawResult.presensi && rawResult.presensi !== '-'
        ? rawResult.presensi
        : overridePresensi.trim() || '01';

    const cleanNama =
      rawResult.nama && !rawResult.nama.includes('Tidak Terbaca')
        ? rawResult.nama
        : overrideNama.trim() || `Siswa Presensi ${cleanPresensi}`;

    setOverrideKelas(chosenKelas);
    setOverridePresensi(cleanPresensi);
    setOverrideNama(cleanNama);

    return {
      ...rawResult,
      kelas: chosenKelas,
      presensi: cleanPresensi,
      nama: cleanNama,
    };
  }

  function handleCapture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const vw = video.videoWidth || 1050;
    const vh = video.videoHeight || 742;
    const targetRatio = 210 / 148.5;

    let cropW = vw;
    let cropH = vw / targetRatio;
    if (cropH > vh) {
      cropH = vh;
      cropW = vh * targetRatio;
    }

    const startX = (vw - cropW) / 2;
    const startY = (vh - cropH) / 2;

    canvas.width = 1050;
    canvas.height = 742;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, startX, startY, cropW, cropH, 0, 0, canvas.width, canvas.height);

    const result = processCameraFrame(canvas, exam, students);
    setLastResult(applyClassAndStudentOverride(result));
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const canvas = canvasRef.current;
    if (!file || !canvas) return;

    const imgUrl = URL.createObjectURL(file);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = imgUrl;
    });

    canvas.width = 1050;
    canvas.height = 742;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(imgUrl);

    const result = processCameraFrame(canvas, exam, students);
    setLastResult(applyClassAndStudentOverride(result));
    e.target.value = '';
  }

  async function handleSimulateScan() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const selectedClass =
      activeKelas && activeKelas !== 'SEMUA' ? activeKelas : exam.kelas || 'Kelas 10';
    const foundStudent = availableStudents.find((s) => s.id === simStudentId);
    const targetStudent: Student = foundStudent
      ? { ...foundStudent, kelas: selectedClass }
      : {
          id: `sim_${selectedClass.replace(/\s+/g, '_')}_${overridePresensi || '01'}`,
          presensi: (overridePresensi || '01').padStart(2, '0'),
          nama: overrideNama.trim() || `Siswa ${selectedClass} (No. ${(overridePresensi || '01').padStart(2, '0')})`,
          kelas: selectedClass,
        };

    await renderFilledLJKToCanvas(canvas, exam, targetStudent, simPreset);
    const result = processCameraFrame(
      canvas,
      exam,
      students.length > 0 ? [...students, targetStudent] : [targetStudent]
    );
    setLastResult(
      applyClassAndStudentOverride({
        ...result,
        kelas: selectedClass,
        presensi: targetStudent.presensi,
        nama: targetStudent.nama,
        studentId: targetStudent.id,
      })
    );
  }

  async function handleConfirmSave() {
    if (!lastResult) return;
    setSaving(true);
    try {
      const finalResult: ScanResult = {
        ...lastResult,
        kelas: (overrideKelas || lastResult.kelas || exam.kelas || 'Kelas 10').trim(),
        presensi: (overridePresensi || lastResult.presensi || '01').trim(),
        nama: (overrideNama || lastResult.nama || 'Siswa').trim(),
      };
      await onResultSaved(finalResult);
      setLastResult(null);
      // Naikkan nomor presensi otomatis untuk memudahkan scan siswa berikutnya di kelas yang sama
      const nextNum = (parseInt(finalResult.presensi, 10) || 1) + 1;
      const nextPresensi = String(nextNum).padStart(2, '0');
      setOverridePresensi(nextPresensi);
      const nextStudent = classStudents.find((s) => s.presensi === nextPresensi);
      if (nextStudent) {
        setSimStudentId(nextStudent.id);
        setOverrideNama(nextStudent.nama);
      } else {
        setOverrideNama('');
      }
    } finally {
      setSaving(false);
    }
  }

  const ignoredCount = Math.max(0, DEFAULT_LJK_CAPACITY - exam.jumlahSoal);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
      {/* Left Zone: Camera Viewport & Half-A4 Simulator */}
      <div className="lg:col-span-6 min-w-0 overflow-hidden bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 truncate">
                Pemindai LJK Setengah A4 · {activeKelas !== 'SEMUA' ? activeKelas : exam.kelas}
              </h3>
              <p className="text-xs text-slate-500 truncate">
                Mapel {exam.mapel} · Dinilai {exam.jumlahSoal} dari 40 Soal Default
              </p>
            </div>
            <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors whitespace-nowrap shrink-0">
              <Upload className="w-3.5 h-3.5" />
              Upload Foto LJK
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </label>
          </div>

          {/* Pengaturan Cepat Kelas & Siswa Sebelum Scan */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-600" />
                Target Kelas &amp; Siswa Saat Scan (Otomatis Masuk Rekap Kelas)
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  KelasRekap
                </label>
                <select
                  value={activeKelas !== 'SEMUA' ? activeKelas : overrideKelas}
                  onChange={(e) => {
                    onChangeActiveKelas(e.target.value);
                    setOverrideKelas(e.target.value);
                  }}
                  className="w-full border border-slate-300 bg-white rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900"
                >
                  {classOptions.map((kls) => (
                    <option key={kls} value={kls}>
                      {kls}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  No. Presensi
                </label>
                <input
                  type="text"
                  value={overridePresensi}
                  onChange={(e) => setOverridePresensi(e.target.value)}
                  placeholder="01"
                  className="w-full border border-slate-300 bg-white rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Nama Siswa (Opsional)
                </label>
                {classStudents.length > 0 ? (
                  <select
                    value={simStudentId}
                    onChange={(e) => {
                      setSimStudentId(e.target.value);
                      const stu = classStudents.find((s) => s.id === e.target.value);
                      if (stu) {
                        setOverridePresensi(stu.presensi);
                        setOverrideNama(stu.nama);
                        setOverrideKelas(stu.kelas);
                      }
                    }}
                    className="w-full border border-slate-300 bg-white rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-900 truncate"
                  >
                    {classStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.presensi} - {s.nama}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={overrideNama}
                    onChange={(e) => setOverrideNama(e.target.value)}
                    placeholder="Otomatis dari QR / Ketik..."
                    className="w-full border border-slate-300 bg-white rounded-lg px-2.5 py-1.5 text-xs text-slate-900"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Info Penyesuaian Jumlah Soal Otomatis */}
          <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold">
                Penyesuaian Jumlah Soal Otomatis ({exam.jumlahSoal} Soal Aktif)
              </p>
              <p className="text-blue-800 leading-relaxed">
                Kertas LJK default 40 soal dinilai otomatis pada <strong>Nomor 1 s.d. {exam.jumlahSoal}</strong>{ignoredCount > 0 ? ` (Nomor ${exam.jumlahSoal + 1}–40 diabaikan)` : ''} dan hasil langsung masuk ke rekap <strong>{activeKelas !== 'SEMUA' ? activeKelas : overrideKelas}</strong>.
              </p>
            </div>
          </div>

          {cameraError && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <span>{cameraError}</span>
            </div>
          )}

          {!cameraOn ? (
            <div className="space-y-4">
              <button
                onClick={startCamera}
                className="w-full py-3.5 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Camera className="w-5 h-5 shrink-0" />
                Buka Kamera HP untuk Scan LJK ({activeKelas !== 'SEMUA' ? activeKelas : overrideKelas})
              </button>

              {/* Simulasi LJK Setengah A4 */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800">
                    Uji Coba / Simulasi Scan LJK ({activeKelas !== 'SEMUA' ? activeKelas : overrideKelas})
                  </span>
                  <span className="text-xs text-slate-500 font-mono shrink-0">
                    Aktif: {exam.jumlahSoal}/40 Soal
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={simPreset}
                    onChange={(e) => setSimPreset(e.target.value as 'high' | 'mixed' | 'double')}
                    className="flex-1 border border-slate-300 bg-white rounded-lg px-2.5 py-2 text-xs font-medium text-slate-800 truncate"
                  >
                    <option value="high">Skenario Nilai Tinggi (~90% Benar)</option>
                    <option value="mixed">Skenario Variasi PG &amp; PGK Parsial</option>
                    <option value="double">Skenario Ada Jawaban Dobel (Kuning / Ragu)</option>
                  </select>
                  <button
                    onClick={handleSimulateScan}
                    className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    Simulasikan Scan
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative w-full aspect-[210/148.5] bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="pointer-events-none absolute inset-0 border-2 border-emerald-400/60">
                  <div className="absolute top-2.5 left-2.5 w-6 h-6 border-4 border-emerald-400" />
                  <div className="absolute top-2.5 right-2.5 w-6 h-6 border-4 border-emerald-400" />
                  <div className="absolute bottom-2.5 left-2.5 w-6 h-6 border-4 border-emerald-400" />
                  <div className="absolute bottom-2.5 right-2.5 w-6 h-6 border-4 border-emerald-400" />
                  <p className="absolute bottom-1.5 inset-x-0 text-center text-[11px] text-white bg-black/65 py-1 px-2">
                    Paskan 4 kotak hitam LJK Setengah A4 pada 4 sudut hijau ({activeKelas !== 'SEMUA' ? activeKelas : overrideKelas})
                  </p>
                </div>
              </div>

              <div className="flex gap-2.5">
                <button
                  onClick={handleCapture}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Zap className="w-4 h-4 shrink-0" />
                  Jepret &amp; Koreksi ({exam.jumlahSoal} Soal)
                </button>
                <button
                  onClick={stopCamera}
                  className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-semibold text-xs sm:text-sm inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <X className="w-4 h-4 shrink-0" />
                  Tutup
                </button>
              </div>
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Right Zone: Hasil Koreksi LJK Preview dengan Konfirmasi Kelas & Siswa */}
      <div className="lg:col-span-6 min-w-0 overflow-hidden bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Lembar Hasil Koreksi LJK</h3>
            <p className="text-xs text-slate-500">
              Hijau = Benar · Merah = Salah · Kuning = Dobel · Abu = Diabaikan ({exam.jumlahSoal + 1}–40)
            </p>
          </div>
          {lastResult && (
            <span className="text-xs font-mono font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg shrink-0">
              {overrideKelas}
            </span>
          )}
        </div>

        {!lastResult ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 px-4 text-center border border-dashed border-slate-200 rounded-xl space-y-2">
            <p className="text-sm font-semibold text-slate-700">Belum Ada LJK yang Dipindai</p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              Pilih <strong>Kelas</strong> di sebelah kiri, lalu gunakan kamera HP, unggah foto LJK, atau klik Simulasikan Scan untuk melihat hasil koreksi detail.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Konfirmasi / Edit Kelas & Nama Siswa sebelum Simpan ke Rekap */}
            <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-blue-900 mb-0.5">
                  Simpan ke Kelas
                </label>
                <select
                  value={overrideKelas}
                  onChange={(e) => setOverrideKelas(e.target.value)}
                  className="w-full border border-blue-300 bg-white rounded-lg px-2 py-1.5 text-xs font-bold text-slate-900"
                >
                  {classOptions.map((kls) => (
                    <option key={kls} value={kls}>
                      {kls}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-blue-900 mb-0.5">
                  No. Presensi
                </label>
                <input
                  type="text"
                  value={overridePresensi}
                  onChange={(e) => setOverridePresensi(e.target.value)}
                  className="w-full border border-blue-300 bg-white rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-blue-900 mb-0.5">
                  Nama Siswa
                </label>
                <input
                  type="text"
                  value={overrideNama}
                  onChange={(e) => setOverrideNama(e.target.value)}
                  className="w-full border border-blue-300 bg-white rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-900"
                />
              </div>
            </div>

            {/* Header Rapor Siswa */}
            <div className="p-4 bg-slate-900 text-white rounded-xl flex items-center justify-between gap-4">
              <div className="min-w-0 space-y-0.5">
                <p className="text-[11px] font-medium text-slate-300">
                  {lastResult.mapel} · {overrideKelas} · Presensi {overridePresensi}
                </p>
                <p className="font-bold text-base sm:text-lg truncate">
                  {overrideNama || lastResult.nama}
                </p>
                <p className="text-xs text-slate-300">
                  Status:{' '}
                  <strong className={lastResult.statusRagu ? 'text-amber-300' : 'text-emerald-300'}>
                    {lastResult.statusRagu ? 'Perlu Cek Manual' : 'Terverifikasi Valid'}
                  </strong>
                </p>
              </div>
              <div className="text-right shrink-0 pl-3 border-l border-slate-700">
                <span className="text-[11px] text-slate-300 block">Nilai Akhir</span>
                <span className="text-3xl font-bold font-mono tabular-nums text-emerald-400">
                  {lastResult.skor}
                </span>
              </div>
            </div>

            {/* 4 Statistik Ringkas */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg min-w-0">
                <span className="text-[11px] text-emerald-700 block truncate">Benar</span>
                <span className="text-base font-bold font-mono tabular-nums text-emerald-800">
                  {lastResult.benar}
                </span>
              </div>
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg min-w-0">
                <span className="text-[11px] text-red-700 block truncate">Salah/Parsial</span>
                <span className="text-base font-bold font-mono tabular-nums text-red-800">
                  {lastResult.salah}
                </span>
              </div>
              <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-lg min-w-0">
                <span className="text-[11px] text-slate-600 block truncate">Kosong</span>
                <span className="text-base font-bold font-mono tabular-nums text-slate-800">
                  {lastResult.kosong}
                </span>
              </div>
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg min-w-0">
                <span className="text-[11px] text-blue-700 block truncate">Soal Aktif</span>
                <span className="text-base font-bold font-mono tabular-nums text-blue-900">
                  {exam.jumlahSoal}/40
                </span>
              </div>
            </div>

            {/* Gambar Bukti Visual LJK Setengah A4 */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-100">
              <img
                src={lastResult.previewImage}
                alt="Pratinjau Hasil Scan LJK Setengah A4"
                referrerPolicy="no-referrer"
                className="w-full h-auto block"
              />
            </div>

            {/* Tabel Perbandingan Jawaban Siswa vs Kunci Guru */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">
                  Peta Jawaban Siswa vs Kunci Guru (1–{exam.jumlahSoal})
                </span>
                <span className="text-slate-500">
                  {ignoredCount > 0 ? `No. ${exam.jumlahSoal + 1}–40 Diabaikan` : '40 Soal Penuh'}
                </span>
              </div>
              <div className="p-2.5 max-h-48 overflow-y-auto grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs font-mono">
                {Array.from({ length: exam.jumlahSoal }, (_, i) => {
                  const qNo = String(i + 1);
                  const ans = lastResult.detailJawaban[qNo] || '-';
                  const keyObj = exam.kunciJawaban[qNo];
                  const expected = keyObj ? keyObj.answers.join('') : '-';
                  const isExact = ans === expected;
                  const isDoubt = ans === 'DOBEL';
                  const isEmpty = ans === '-';

                  return (
                    <div
                      key={qNo}
                      className={`p-1.5 rounded-lg border flex items-center justify-between gap-1 min-w-0 ${
                        isDoubt
                          ? 'bg-amber-50 border-amber-300 text-amber-900'
                          : isExact
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : isEmpty
                          ? 'bg-slate-50 border-slate-200 text-slate-600'
                          : 'bg-red-50 border-red-200 text-red-900'
                      }`}
                    >
                      <span className="text-slate-500 shrink-0">
                        {qNo.padStart(2, '0')}
                        {keyObj?.type === 'PGK' ? '*' : ''}
                      </span>
                      <div className="truncate text-right">
                        <span className="font-bold">{ans}</span>
                        {!isExact && (
                          <span className="text-[10px] opacity-75 ml-1">({expected})</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2.5">
              <button
                onClick={handleConfirmSave}
                disabled={saving}
                className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {saving ? 'Menyimpan...' : `Simpan ke Rekap ${overrideKelas} & Scan Berikutnya`}
              </button>
              <button
                onClick={() => setLastResult(null)}
                className="px-3.5 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg font-semibold text-xs sm:text-sm inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                Ulangi
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
