import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Camera,
  Zap,
  X,
  Upload,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  Sparkles,
  Sun,
  MoreHorizontal,
} from 'lucide-react';
import { Exam, Student, renderFilledLJKToCanvas } from '../lib/ljkGenerator';
import { OPTIONS } from '../lib/ljkLayout';
import {
  processCameraFrame,
  detectFourAnchors,
  recalculateResultWithManualAnswers,
  ScanResult,
} from '../lib/omrCameraEngine';

interface Props {
  exam: Exam;
  activeKelas: string;
  classOptions: string[];
  onChangeActiveKelas: (kls: string) => void;
  students: Student[];
  classResults: ScanResult[];
  onResultSaved: (res: ScanResult) => Promise<void>;
  onCloseScanner: () => void;
}

export default function CameraScanner({
  exam,
  activeKelas,
  classOptions,
  onChangeActiveKelas,
  students,
  classResults,
  onResultSaved,
  onCloseScanner,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const probeCanvasRef = useRef<HTMLCanvasElement>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [saving, setSaving] = useState(false);

  // EvalBee-style real-time anchor detection & auto-capture state
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(true);
  const [cornerStatus, setCornerStatus] = useState<{
    tl: boolean;
    tr: boolean;
    bl: boolean;
    br: boolean;
    allLocked: boolean;
    stableFrames: number;
  }>({
    tl: false,
    tr: false,
    bl: false,
    br: false,
    allLocked: false,
    stableFrames: 0,
  });

  // Torch / Flash support
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // Secondary menu (⋯) for Simulasi Uji Coba & Override Manual
  const [showToolsMenu, setShowToolsMenu] = useState(false);

  // Tap-to-correct active question number in Bottom Sheet
  const [editingQuestionNo, setEditingQuestionNo] = useState<string | null>(null);

  // Override manual identitas kelas/siswa saat scan agar rekapan rapi per kelas
  const [overrideKelas, setOverrideKelas] = useState<string>(
    activeKelas || exam.kelas || 'Kelas 10'
  );
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

  // Bunyi Beep & Getar ala EvalBee saat LJK berhasil dikunci & dipotret
  const triggerScanFeedback = useCallback(() => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(80);
      }
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // Nada C6 jernih
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.14);
      }
    } catch {
      // Abaikan jika browser membatasi audio sebelum interaksi
    }
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

      const track = stream.getVideoTracks()[0];
      if (track && 'getCapabilities' in track) {
        const caps = track.getCapabilities() as MediaTrackCapabilities & {
          torch?: boolean;
        };
        if (caps && caps.torch) {
          setTorchSupported(true);
        }
      }
    } catch {
      setCameraError(
        'Kamera belakang tidak dapat diakses di perangkat ini. Gunakan tombol Upload Foto LJK atau buka menu (⋯) untuk Simulasi Scan.'
      );
    }
  }

  function stopCamera() {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    setCameraOn(false);
    setTorchOn(false);
  }

  // Otomatis coba nyalakan kamera saat layar Fullscreen Scanner dibuka
  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  async function toggleTorch() {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextTorch = !torchOn;
      await track.applyConstraints({
        advanced: [{ torch: nextTorch } as MediaTrackConstraintSet],
      });
      setTorchOn(nextTorch);
    } catch {
      // Torch tidak didukung pada perangkat ini
    }
  }

  function advanceToNextPresensi(currentPresensi: string) {
    const nextNum = (parseInt(currentPresensi, 10) || 1) + 1;
    const nextPresensi = String(nextNum).padStart(2, '0');
    setOverridePresensi(nextPresensi);
    const nextStudent = classStudents.find((s) => s.presensi === nextPresensi);
    if (nextStudent) {
      setSimStudentId(nextStudent.id);
      setOverrideNama(nextStudent.nama);
    } else {
      setOverrideNama(`Peserta ${targetClassForStudents} - No. ${nextPresensi}`);
    }
  }

  const applyClassAndStudentOverride = useCallback(
    (rawResult: ScanResult): ScanResult => {
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
          : overrideNama.trim() || `Peserta ${chosenKelas} - No. ${cleanPresensi}`;

      setOverrideKelas(chosenKelas);
      setOverridePresensi(cleanPresensi);
      setOverrideNama(cleanNama);

      return {
        ...rawResult,
        kelas: chosenKelas,
        presensi: cleanPresensi,
        nama: cleanNama,
      };
    },
    [activeKelas, exam.kelas, overrideNama, overridePresensi]
  );

  const handleCapture = useCallback(() => {
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
    triggerScanFeedback();
    setEditingQuestionNo(null);
    setLastResult(applyClassAndStudentOverride(result));
  }, [applyClassAndStudentOverride, exam, students, triggerScanFeedback]);

  // Loop Real-Time 4-Anchor Detection & Auto-Capture (~300ms stabil) ala EvalBee
  useEffect(() => {
    if (!cameraOn || lastResult) return;

    let animId = 0;
    let lastCheck = 0;
    let consecutiveLocked = 0;

    const loop = (timestamp: number) => {
      if (timestamp - lastCheck >= 95) {
        lastCheck = timestamp;
        const video = videoRef.current;
        const probe = probeCanvasRef.current;
        if (video && probe && video.readyState >= 2 && video.videoWidth > 0) {
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          const targetRatio = 210 / 148.5;
          let cropW = vw;
          let cropH = vw / targetRatio;
          if (cropH > vh) {
            cropH = vh;
            cropW = vh * targetRatio;
          }
          const sx = (vw - cropW) / 2;
          const sy = (vh - cropH) / 2;

          probe.width = 420;
          probe.height = 297;
          const pCtx = probe.getContext('2d', { willReadFrequently: true });
          if (pCtx) {
            pCtx.drawImage(video, sx, sy, cropW, cropH, 0, 0, probe.width, probe.height);
            const detection = detectFourAnchors(pCtx, probe.width, probe.height);
            if (detection.locked) {
              consecutiveLocked += 1;
            } else {
              consecutiveLocked = 0;
            }

            setCornerStatus({
              tl: Boolean(detection.corners.tl),
              tr: Boolean(detection.corners.tr),
              bl: Boolean(detection.corners.bl),
              br: Boolean(detection.corners.br),
              allLocked: detection.locked,
              stableFrames: consecutiveLocked,
            });

            // Jika 4 sudut hijau stabil selama 3 frame berturut-turut (~300 ms), otomatis jepret!
            if (autoCaptureEnabled && consecutiveLocked >= 3) {
              consecutiveLocked = 0;
              handleCapture();
              return;
            }
          }
        }
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [autoCaptureEnabled, cameraOn, handleCapture, lastResult]);

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
    triggerScanFeedback();
    setEditingQuestionNo(null);
    setLastResult(applyClassAndStudentOverride(result));
    e.target.value = '';
  }

  async function handleSimulateScan() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const selectedClass =
      activeKelas && activeKelas !== 'SEMUA' ? activeKelas : exam.kelas || 'Kelas 10';
    const foundStudent = availableStudents.find((s) => s.id === simStudentId);
    const cleanPres = (overridePresensi || '01').padStart(2, '0');
    const targetStudent: Student =
      foundStudent && foundStudent.presensi === cleanPres
        ? { ...foundStudent, kelas: selectedClass }
        : {
            id: `sim_${selectedClass.replace(/\s+/g, '_')}_${cleanPres}`,
            presensi: cleanPres,
            nama:
              overrideNama.trim() || `Peserta ${selectedClass} - No. ${cleanPres}`,
            kelas: selectedClass,
          };

    await renderFilledLJKToCanvas(canvas, exam, targetStudent, simPreset);
    const result = processCameraFrame(
      canvas,
      exam,
      students.length > 0 ? [...students, targetStudent] : [targetStudent]
    );
    triggerScanFeedback();
    setEditingQuestionNo(null);
    setShowToolsMenu(false);
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

  // Tap-to-correct: Guru mengetuk nomor soal lalu memilih opsi A/B/C/D/E atau Kosong (-)
  function handleTapManualOption(qNo: string, chosenOpt: string) {
    if (!lastResult) return;
    const qKey = exam.kunciJawaban[qNo];
    let nextAns = chosenOpt;

    if (qKey?.type === 'PGK' && chosenOpt !== '-') {
      const current = (lastResult.detailJawaban[qNo] || '').replace(/[^A-E]/g, '');
      if (current.includes(chosenOpt)) {
        nextAns = current.replace(chosenOpt, '') || '-';
      } else {
        nextAns = (current + chosenOpt).split('').sort().join('');
      }
    }

    const updatedMap = {
      ...lastResult.detailJawaban,
      [qNo]: nextAns,
    };
    setLastResult(recalculateResultWithManualAnswers(lastResult, updatedMap, exam));
    if (qKey?.type !== 'PGK') {
      setEditingQuestionNo(null);
    }
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
      setEditingQuestionNo(null);
      advanceToNextPresensi(finalResult.presensi);
    } finally {
      setSaving(false);
    }
  }

  const currentKelasLabel = activeKelas !== 'SEMUA' ? activeKelas : overrideKelas;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col overflow-hidden">
      {/* Slim Top Bar ala EvalBee: Info Mapel, Dropdown Kelas, Counter Scan, Auto-Lock, Flash & Tutup */}
      <div className="bg-slate-900/95 border-b border-slate-800 px-3 sm:px-5 py-2.5 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-bold text-white truncate">
              {exam.mapel}
            </p>
            <p className="text-[11px] text-slate-400 font-mono tabular-nums truncate">
              {exam.jumlahSoal} Soal Aktif · Tersimpan: {classResults.length} LJK
            </p>
          </div>

          {/* Dropdown Ringkas Pilih Kelas (Menggantikan 22 tombol kelas di layar scan) */}
          <select
            value={currentKelasLabel}
            onChange={(e) => {
              onChangeActiveKelas(e.target.value);
              setOverrideKelas(e.target.value);
            }}
            className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer shrink-0"
          >
            {classOptions.map((kls) => (
              <option key={kls} value={kls}>
                {kls}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Toggle Auto-Lock / Auto-Capture */}
          <button
            type="button"
            onClick={() => setAutoCaptureEnabled((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              autoCaptureEnabled
                ? 'bg-emerald-600/20 border border-emerald-500/50 text-emerald-300'
                : 'bg-slate-800 border border-slate-700 text-slate-400'
            }`}
            title="Otomatis memotret saat 4 kotak sudut LJK terkunci hijau"
          >
            {autoCaptureEnabled ? 'Auto-Scan: ON' : 'Auto-Scan: OFF'}
          </button>

          {/* Tombol Flash / Torch (jika kamera HP mendukung) */}
          {torchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                torchOn
                  ? 'bg-amber-500 border-amber-400 text-slate-950'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title="Nyalakan Lampu Flash Kamera"
            >
              <Sun className="w-4 h-4" />
            </button>
          )}

          {/* Upload Foto LJK */}
          <label
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
            title="Upload Foto LJK dari Galeri"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Upload Foto</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </label>

          {/* Menu Lainnya (⋯) untuk Simulasi & Pengaturan Siswa Manual */}
          <button
            type="button"
            onClick={() => setShowToolsMenu((prev) => !prev)}
            className={`p-2 rounded-lg border transition-colors cursor-pointer ${
              showToolsMenu
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
            }`}
            title="Menu Simulasi & Identitas Manual"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {/* Tombol Tutup Fullscreen Scanner */}
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onCloseScanner();
            }}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-red-600 border border-slate-700 hover:border-red-500 text-slate-200 hover:text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Tutup</span>
          </button>
        </div>
      </div>

      {/* Popover Menu (⋯): Simulasi Uji Coba & Target Siswa Manual (Tersembunyi agar kamera bersih 100%) */}
      {showToolsMenu && (
        <div className="bg-slate-900 border-b border-slate-800 px-4 py-3.5 z-30">
          <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-3">
              <label className="block text-[11px] text-slate-400 mb-1">
                No. Presensi Target
              </label>
              <input
                type="text"
                value={overridePresensi}
                onChange={(e) => setOverridePresensi(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-white"
              />
            </div>

            <div className="md:col-span-4">
              <label className="block text-[11px] text-slate-400 mb-1">
                Pilih / Ketik Siswa ({currentKelasLabel})
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
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                >
                  {classStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.presensi} · {s.nama}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={overrideNama}
                  onChange={(e) => setOverrideNama(e.target.value)}
                  placeholder="Nama siswa..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              )}
            </div>

            <div className="md:col-span-3">
              <label className="block text-[11px] text-slate-400 mb-1">
                Skenario Simulasi LJK
              </label>
              <select
                value={simPreset}
                onChange={(e) => setSimPreset(e.target.value as 'high' | 'mixed' | 'double')}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
              >
                <option value="high">Nilai Tinggi (~90% Benar)</option>
                <option value="mixed">Variasi PG &amp; PGK Parsial</option>
                <option value="double">Ada Jawaban Dobel (Kuning)</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <button
                type="button"
                onClick={handleSimulateScan}
                className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                Simulasi Scan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main 85% Viewport: Live Camera Feed + 4 Corner Anchor Guides (Merah -> Hijau) */}
      <div className="flex-1 relative flex flex-col items-center justify-center p-3 sm:p-6 overflow-hidden">
        {cameraError && (
          <div className="mb-3 max-w-lg w-full p-3 bg-amber-950/90 border border-amber-700/80 rounded-xl text-xs text-amber-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>{cameraError}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowToolsMenu(true)}
              className="px-2.5 py-1 bg-amber-500 text-slate-950 font-bold rounded-lg shrink-0 cursor-pointer"
            >
              Buka Simulasi
            </button>
          </div>
        )}

        <div className="relative w-full max-w-3xl aspect-[210/148.5] bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center">
          {cameraOn ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Bingkai Penuntun 4 Sudut Anchor LJK Setengah A4 (Berubah Merah -> Hijau saat Anchor Terdeteksi) */}
              <div
                className={`pointer-events-none absolute inset-4 sm:inset-6 rounded-xl border-2 transition-colors ${
                  cornerStatus.allLocked
                    ? 'border-emerald-400 bg-emerald-500/5'
                    : 'border-white/25'
                }`}
              >
                {/* Top-Left Anchor Box */}
                <div
                  className={`absolute -top-1 -left-1 w-8 h-8 sm:w-10 sm:h-10 border-t-4 border-l-4 transition-colors ${
                    cornerStatus.tl ? 'border-emerald-400' : 'border-red-500/80'
                  }`}
                />
                {/* Top-Right Anchor Box */}
                <div
                  className={`absolute -top-1 -right-1 w-8 h-8 sm:w-10 sm:h-10 border-t-4 border-r-4 transition-colors ${
                    cornerStatus.tr ? 'border-emerald-400' : 'border-red-500/80'
                  }`}
                />
                {/* Bottom-Left Anchor Box */}
                <div
                  className={`absolute -bottom-1 -left-1 w-8 h-8 sm:w-10 sm:h-10 border-b-4 border-l-4 transition-colors ${
                    cornerStatus.bl ? 'border-emerald-400' : 'border-red-500/80'
                  }`}
                />
                {/* Bottom-Right Anchor Box */}
                <div
                  className={`absolute -bottom-1 -right-1 w-8 h-8 sm:w-10 sm:h-10 border-b-4 border-r-4 transition-colors ${
                    cornerStatus.br ? 'border-emerald-400' : 'border-red-500/80'
                  }`}
                />

                {/* Bar Status Penguncian Anchor di Bagian Bawah Viewfinder */}
                <div className="absolute bottom-3 inset-x-4 flex items-center justify-center">
                  <div
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-xs transition-colors ${
                      cornerStatus.allLocked
                        ? 'bg-emerald-600/90 text-white'
                        : 'bg-slate-950/80 text-slate-200'
                    }`}
                  >
                    {cornerStatus.allLocked
                      ? '4 Titik Sudut Terkunci Hijau · Memotret Otomatis...'
                      : 'Paskan 4 Kotak Hitam Sudut LJK ke Sudut Bingkai'}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-6 text-center space-y-4 max-w-sm">
              <p className="text-sm font-semibold text-white">
                Kamera Siap Memindai LJK {currentKelasLabel}
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Arahkan kamera ke kertas LJK Setengah A4. Saat 4 kotak hitam sudut terdeteksi, bingkai otomatis berubah hijau dan memotret sendiri.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={startCamera}
                  className="py-2.5 px-5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-xs sm:text-sm inline-flex items-center gap-2 cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  Nyalakan Kamera HP
                </button>
                <button
                  type="button"
                  onClick={handleSimulateScan}
                  className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl font-semibold text-xs sm:text-sm inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  Uji Simulasi LJK
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tombol Jepret Manual di Bawah Viewfinder */}
        {cameraOn && !lastResult && (
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={handleCapture}
              className="py-3 px-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Zap className="w-4 h-4" />
              Jepret &amp; Koreksi Sekarang
            </button>
          </div>
        )}
      </div>

      {/* Bottom Sheet Overlay Hasil Scan Instan + Koreksi Ketuk Nomor (Tap-to-Correct) */}
      {lastResult && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white text-slate-900 w-full max-w-2xl sm:rounded-2xl rounded-t-2xl border border-slate-200 max-h-[92vh] flex flex-col overflow-hidden">
            {/* Header Skor & Identitas Siswa */}
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between gap-4 shrink-0">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs text-slate-300">
                  <span>{exam.mapel}</span>
                  <span aria-hidden="true">·</span>
                  <span>{overrideKelas}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">No. {overridePresensi}</span>
                </div>
                <p className="font-bold text-base sm:text-lg truncate">
                  {overrideNama || lastResult.nama}
                </p>
                <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                  <span className="text-emerald-400">Benar: {lastResult.benar}</span>
                  <span className="text-red-400">Salah: {lastResult.salah}</span>
                  <span className="text-slate-300">Kosong: {lastResult.kosong}</span>
                </div>
              </div>

              <div className="text-right shrink-0 pl-4 border-l border-slate-800">
                <span className="text-[11px] text-slate-400 block">NILAI AKHIR</span>
                <span className="text-3xl font-bold font-mono tabular-nums text-emerald-400">
                  {lastResult.skor}
                </span>
              </div>
            </div>

            {/* Body Scrollable: Edit Identitas + Foto LJK + Ketuk Nomor untuk Koreksi */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              {/* Baris Koreksi Identitas Cepat */}
              <div className="grid grid-cols-12 gap-2 text-xs">
                <div className="col-span-4">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Simpan ke Kelas
                  </label>
                  <select
                    value={overrideKelas}
                    onChange={(e) => setOverrideKelas(e.target.value)}
                    className="w-full border border-slate-300 bg-white rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900"
                  >
                    {classOptions.map((kls) => (
                      <option key={kls} value={kls}>
                        {kls}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-3">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Presensi
                  </label>
                  <input
                    type="text"
                    value={overridePresensi}
                    onChange={(e) => setOverridePresensi(e.target.value)}
                    className="w-full border border-slate-300 bg-white rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums font-bold text-slate-900"
                  />
                </div>
                <div className="col-span-5">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Nama Siswa
                  </label>
                  <input
                    type="text"
                    value={overrideNama}
                    onChange={(e) => setOverrideNama(e.target.value)}
                    className="w-full border border-slate-300 bg-white rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900"
                  />
                </div>
              </div>

              {/* Gambar Bukti Scan LJK yang Sudah Diluruskan (Perspective Warped) */}
              {lastResult.previewImage && (
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-100">
                  <img
                    src={lastResult.previewImage}
                    alt="Hasil Koreksi LJK"
                    referrerPolicy="no-referrer"
                    className="w-full h-auto block"
                  />
                </div>
              )}

              {/* Fitur Tap-to-Correct: Ketuk nomor soal untuk mengoreksi bulatan yang ragu/dobel */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">
                    Ketuk Nomor Soal untuk Koreksi Manual (1–{exam.jumlahSoal})
                  </span>
                  <span className="text-slate-500 font-mono tabular-nums">
                    {lastResult.statusRagu ? 'Ada Jawaban Ragu/Dobel' : 'Terverifikasi Valid'}
                  </span>
                </div>

                {/* Picker Opsi A/B/C/D/E saat suatu nomor soal diketuk */}
                {editingQuestionNo && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-blue-950">
                      Ubah Jawaban No. {editingQuestionNo.padStart(2, '0')} (Kunci:{' '}
                      {exam.kunciJawaban[editingQuestionNo]?.answers.join('') || '-'}):
                    </span>
                    <div className="flex items-center gap-1.5">
                      {OPTIONS.map((opt) => {
                        const curr = lastResult.detailJawaban[editingQuestionNo] || '-';
                        const isChosen = curr.includes(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => handleTapManualOption(editingQuestionNo, opt)}
                            className={`w-7 h-7 rounded-lg font-mono font-bold transition-colors cursor-pointer ${
                              isChosen
                                ? 'bg-blue-600 text-white'
                                : 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-100'
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => handleTapManualOption(editingQuestionNo, '-')}
                        className="px-2 h-7 rounded-lg bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                      >
                        Kosong
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingQuestionNo(null)}
                        className="px-2 h-7 rounded-lg bg-slate-900 text-white font-semibold cursor-pointer"
                      >
                        Selesai
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-5 sm:grid-cols-8 gap-1.5 text-xs font-mono tabular-nums">
                  {Array.from({ length: exam.jumlahSoal }, (_, i) => {
                    const qNo = String(i + 1);
                    const ans = lastResult.detailJawaban[qNo] || '-';
                    const keyObj = exam.kunciJawaban[qNo];
                    const expected = keyObj ? keyObj.answers.join('') : '-';
                    const isExact = ans === expected;
                    const isDoubt = ans === 'DOBEL';
                    const isEmpty = ans === '-';
                    const isActiveEdit = editingQuestionNo === qNo;

                    return (
                      <button
                        key={qNo}
                        type="button"
                        onClick={() =>
                          setEditingQuestionNo((prev) => (prev === qNo ? null : qNo))
                        }
                        className={`px-2 py-1.5 rounded-lg border text-left flex items-center justify-between gap-1 transition-colors cursor-pointer ${
                          isActiveEdit
                            ? 'ring-2 ring-blue-600 bg-blue-50 border-blue-500 text-blue-950'
                            : isDoubt
                            ? 'bg-amber-50 border-amber-300 text-amber-900'
                            : isExact
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : isEmpty
                            ? 'bg-slate-50 border-slate-200 text-slate-600'
                            : 'bg-red-50 border-red-200 text-red-900'
                        }`}
                        title={`Ketuk untuk mengoreksi jawaban nomor ${qNo}`}
                      >
                        <span className="text-slate-500 text-[10px]">
                          {qNo.padStart(2, '0')}
                        </span>
                        <span className="font-bold truncate">{ans}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer Aksi Cepat: Simpan & Lanjut Scan Berikutnya */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={saving}
                className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {saving
                  ? 'Menyimpan...'
                  : `Simpan ke ${overrideKelas} & Scan Siswa Berikutnya`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLastResult(null);
                  setEditingQuestionNo(null);
                }}
                className="py-3 px-4 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-semibold text-xs sm:text-sm inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                <RotateCcw className="w-4 h-4" />
                Scan Ulang
              </button>
            </div>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={probeCanvasRef} className="hidden" />
    </div>
  );
}
