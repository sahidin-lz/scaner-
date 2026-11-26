import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Camera,
  Zap,
  X,
  Upload,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  Sun,
} from 'lucide-react';
import { Exam, Student } from '../lib/ljkGenerator';
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
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [saving, setSaving] = useState(false);

  // Real-time 4-anchor detection & auto-capture state (Ringan di HP)
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(true);
  const [cornerStatus, setCornerStatus] = useState({
    tl: false,
    tr: false,
    bl: false,
    br: false,
    allLocked: false,
  });

  // Torch / Flash support
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // Tap-to-correct active question number in Bottom Sheet
  const [editingQuestionNo, setEditingQuestionNo] = useState<string | null>(null);

  // Override manual identitas kelas/siswa saat scan agar rekapan rapi per kelas
  const [overrideKelas, setOverrideKelas] = useState<string>(
    activeKelas || exam.kelas || 'Kelas 10'
  );
  const [overridePresensi, setOverridePresensi] = useState<string>('01');
  const [overrideNama, setOverrideNama] = useState<string>('');

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

  useEffect(() => {
    if (classStudents.length > 0 && !overrideNama) {
      const first = classStudents[0];
      setOverridePresensi(first.presensi);
      setOverrideNama(first.nama);
      setOverrideKelas(first.kelas);
    }
  }, [classStudents, overrideNama]);

  // Bunyi Beep & Getar ala EvalBee saat LJK berhasil dikunci & dipotret
  const triggerScanFeedback = useCallback(() => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(70);
      }
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      }
    } catch {
      // Abaikan jika browser membatasi audio sebelum interaksi
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
    setTorchOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCameraStarting(true);
    stopCamera();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraStarting(false);
      setCameraError(
        'Browser ini tidak mendukung akses kamera langsung. Gunakan tombol Upload Foto / Kamera Sistem di bawah.'
      );
      return;
    }

    const constraintCandidates: MediaStreamConstraints[] = [
      {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      },
      {
        video: {
          facingMode: 'environment',
        },
        audio: false,
      },
      {
        video: true,
        audio: false,
      },
    ];

    let acquiredStream: MediaStream | null = null;
    for (const constraints of constraintCandidates) {
      try {
        acquiredStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (acquiredStream) break;
      } catch {
        // Coba fallback constraint berikutnya
      }
    }

    if (!acquiredStream) {
      setCameraStarting(false);
      setCameraError(
        'Izin kamera belum aktif atau kamera tidak ditemukan. Klik Coba Buka Kamera Lagi atau gunakan tombol Ambil Foto Kamera HP di bawah.'
      );
      return;
    }

    streamRef.current = acquiredStream;
    setCameraOn(true);
    setCameraStarting(false);

    if (videoRef.current) {
      videoRef.current.srcObject = acquiredStream;
      try {
        await videoRef.current.play();
      } catch {
        // AutoPlay ditangani oleh atribut autoPlay + playsInline
      }
    }

    const track = acquiredStream.getVideoTracks()[0];
    if (track && 'getCapabilities' in track) {
      try {
        const caps = track.getCapabilities() as MediaTrackCapabilities & {
          torch?: boolean;
        };
        setTorchSupported(Boolean(caps && caps.torch));
      } catch {
        setTorchSupported(false);
      }
    }
  }, [stopCamera]);

  // Pastikan stream terpasang ke elemen <video> begitu videoRef siap di DOM
  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl && streamRef.current && videoEl.srcObject !== streamRef.current) {
      videoEl.srcObject = streamRef.current;
      videoEl.play().catch(() => {});
    }
  }, [cameraOn, lastResult]);

  // Otomatis nyalakan kamera begitu layar scan dibuka
  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
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

      const matchedByPresensi = classStudents.find((s) => s.presensi === cleanPresensi);

      const cleanNama =
        rawResult.nama && !rawResult.nama.includes('Tidak Terbaca')
          ? rawResult.nama
          : matchedByPresensi?.nama ||
            overrideNama.trim() ||
            `Peserta ${chosenKelas} - No. ${cleanPresensi}`;

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
    [activeKelas, classStudents, exam.kelas, overrideNama, overridePresensi]
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

    canvas.width = 900;
    canvas.height = 636;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, startX, startY, cropW, cropH, 0, 0, canvas.width, canvas.height);

    const result = processCameraFrame(canvas, exam, students);
    triggerScanFeedback();
    setEditingQuestionNo(null);
    setLastResult(applyClassAndStudentOverride(result));
  }, [applyClassAndStudentOverride, exam, students, triggerScanFeedback]);

  // Loop Real-Time 4-Anchor Detection Ringan (Resolusi 320x226 tiap 160ms agar hemat CPU & baterai HP)
  useEffect(() => {
    if (!cameraOn || lastResult) return;

    let animId = 0;
    let lastCheck = 0;
    let consecutiveLocked = 0;

    const loop = (timestamp: number) => {
      if (timestamp - lastCheck >= 160) {
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

          probe.width = 320;
          probe.height = 226;
          const pCtx = probe.getContext('2d', { willReadFrequently: true });
          if (pCtx) {
            pCtx.drawImage(video, sx, sy, cropW, cropH, 0, 0, probe.width, probe.height);
            const detection = detectFourAnchors(pCtx, probe.width, probe.height);
            if (detection.locked) {
              consecutiveLocked += 1;
            } else {
              consecutiveLocked = 0;
            }

            const nextCornerState = {
              tl: Boolean(detection.corners.tl),
              tr: Boolean(detection.corners.tr),
              bl: Boolean(detection.corners.bl),
              br: Boolean(detection.corners.br),
              allLocked: detection.locked,
            };

            setCornerStatus((prev) =>
              prev.tl === nextCornerState.tl &&
              prev.tr === nextCornerState.tr &&
              prev.bl === nextCornerState.bl &&
              prev.br === nextCornerState.br &&
              prev.allLocked === nextCornerState.allLocked
                ? prev
                : nextCornerState
            );

            // Jika 4 sudut hijau stabil selama 2 siklus (~320 ms), otomatis jepret!
            if (autoCaptureEnabled && consecutiveLocked >= 2) {
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

    canvas.width = 900;
    canvas.height = 636;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(imgUrl);

    const result = processCameraFrame(canvas, exam, students);
    triggerScanFeedback();
    setEditingQuestionNo(null);
    setLastResult(applyClassAndStudentOverride(result));
    e.target.value = '';
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
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col overflow-hidden select-none">
      {/* Compact Mobile Top Bar (Height ~54px): Info Mapel, Dropdown Kelas, Auto-Scan, Flash & Tutup */}
      <div className="bg-slate-900/95 border-b border-slate-800 px-3 py-2 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0">
            <p className="text-xs font-bold text-white truncate">{exam.mapel}</p>
            <p className="text-[10px] text-slate-400 font-mono tabular-nums truncate">
              {exam.jumlahSoal} Soal · {classResults.length} LJK
            </p>
          </div>

          <select
            value={currentKelasLabel}
            onChange={(e) => {
              onChangeActiveKelas(e.target.value);
              setOverrideKelas(e.target.value);
            }}
            className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2 py-1.5 text-xs font-semibold cursor-pointer shrink-0 min-h-[36px]"
          >
            {classOptions.map((kls) => (
              <option key={kls} value={kls}>
                {kls}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setAutoCaptureEnabled((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap min-h-[36px] ${
              autoCaptureEnabled
                ? 'bg-emerald-600/20 border border-emerald-500/50 text-emerald-300'
                : 'bg-slate-800 border border-slate-700 text-slate-400'
            }`}
          >
            {autoCaptureEnabled ? 'Auto' : 'Manual'}
          </button>

          {torchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`p-2 rounded-lg border transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center ${
                torchOn
                  ? 'bg-amber-500 border-amber-400 text-slate-950'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
              title="Lampu Flash"
            >
              <Sun className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              stopCamera();
              onCloseScanner();
            }}
            className="p-2 bg-slate-800 hover:bg-red-600 border border-slate-700 text-slate-200 hover:text-white rounded-lg transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
            title="Tutup Kamera"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Camera Viewport: Video selalu terpasang di DOM agar stream langsung tampil begitu mulai scan */}
      <div className="flex-1 relative flex flex-col items-center justify-center p-2.5 sm:p-5 overflow-hidden">
        <div className="relative w-full max-w-2xl aspect-[210/148.5] bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center">
          {/* Elemen Video selalu ada di DOM supaya ref tidak pernah null saat startCamera berjalan */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${cameraOn ? 'block' : 'hidden'}`}
          />

          {cameraOn && (
            <div
              className={`pointer-events-none absolute inset-3 sm:inset-5 rounded-xl border-2 transition-colors ${
                cornerStatus.allLocked
                  ? 'border-emerald-400 bg-emerald-500/5'
                  : 'border-white/25'
              }`}
            >
              <div
                className={`absolute -top-1 -left-1 w-7 h-7 sm:w-9 sm:h-9 border-t-4 border-l-4 transition-colors ${
                  cornerStatus.tl ? 'border-emerald-400' : 'border-red-500/85'
                }`}
              />
              <div
                className={`absolute -top-1 -right-1 w-7 h-7 sm:w-9 sm:h-9 border-t-4 border-r-4 transition-colors ${
                  cornerStatus.tr ? 'border-emerald-400' : 'border-red-500/85'
                }`}
              />
              <div
                className={`absolute -bottom-1 -left-1 w-7 h-7 sm:w-9 sm:h-9 border-b-4 border-l-4 transition-colors ${
                  cornerStatus.bl ? 'border-emerald-400' : 'border-red-500/85'
                }`}
              />
              <div
                className={`absolute -bottom-1 -right-1 w-7 h-7 sm:w-9 sm:h-9 border-b-4 border-r-4 transition-colors ${
                  cornerStatus.br ? 'border-emerald-400' : 'border-red-500/85'
                }`}
              />

              <div className="absolute bottom-2.5 inset-x-3 flex items-center justify-center">
                <div
                  className={`px-3 py-1 rounded-lg text-[11px] font-semibold backdrop-blur-xs transition-colors ${
                    cornerStatus.allLocked
                      ? 'bg-emerald-600/95 text-white'
                      : 'bg-slate-950/80 text-slate-200'
                  }`}
                >
                  {cornerStatus.allLocked
                    ? '4 Sudut Terkunci Hijau · Memotret...'
                    : 'Paskan 4 Kotak Hitam Sudut LJK ke Bingkai'}
                </div>
              </div>
            </div>
          )}

          {!cameraOn && (
            <div className="p-5 text-center space-y-3 max-w-xs">
              {cameraStarting ? (
                <p className="text-xs font-semibold text-slate-300">
                  Menghubungkan ke Kamera HP...
                </p>
              ) : (
                <>
                  {cameraError && (
                    <div className="p-2.5 bg-amber-950/90 border border-amber-700/80 rounded-xl text-[11px] text-amber-200 flex items-start gap-2 text-left">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                      <span>{cameraError}</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      type="button"
                      onClick={startCamera}
                      className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-xs inline-flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
                    >
                      <Camera className="w-4 h-4" />
                      Coba Buka Kamera Lagi
                    </button>
                    <label className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold text-xs inline-flex items-center justify-center gap-2 cursor-pointer min-h-[44px]">
                      <Upload className="w-4 h-4" />
                      Ambil Foto Kamera HP / Galeri
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Bottom Thumb-Zone Action Bar di Bawah Kamera */}
        {!lastResult && (
          <div className="mt-3 w-full max-w-md flex items-center gap-2 px-1">
            {cameraOn && (
              <button
                type="button"
                onClick={handleCapture}
                className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white rounded-xl font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[46px]"
              >
                <Zap className="w-4 h-4 shrink-0" />
                Jepret &amp; Koreksi
              </button>
            )}
            <label className="py-3 px-3.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl font-semibold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors min-h-[46px] shrink-0">
              <Upload className="w-4 h-4 shrink-0" />
              <span>Foto / Galeri</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </label>
          </div>
        )}
      </div>

      {/* Bottom Sheet Overlay Hasil Scan Instan + Koreksi Ketuk Nomor (Tap-to-Correct) */}
      {lastResult && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white text-slate-900 w-full max-w-xl sm:rounded-2xl rounded-t-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header Skor & Identitas Siswa */}
            <div className="bg-slate-900 text-white px-4 py-3.5 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                  <span className="truncate">{exam.mapel}</span>
                  <span aria-hidden="true">·</span>
                  <span>{overrideKelas}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">No.{overridePresensi}</span>
                </div>
                <p className="font-bold text-sm sm:text-base truncate">
                  {overrideNama || lastResult.nama}
                </p>
                <div className="flex items-center gap-2.5 text-[11px] font-mono tabular-nums">
                  <span className="text-emerald-400">B:{lastResult.benar}</span>
                  <span className="text-red-400">S:{lastResult.salah}</span>
                  <span className="text-slate-300">K:{lastResult.kosong}</span>
                </div>
              </div>

              <div className="text-right shrink-0 pl-3 border-l border-slate-800">
                <span className="text-[10px] text-slate-400 block">NILAI</span>
                <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-emerald-400">
                  {lastResult.skor}
                </span>
              </div>
            </div>

            {/* Body Scrollable: Edit Identitas + Foto LJK + Ketuk Nomor untuk Koreksi */}
            <div className="p-3.5 sm:p-4 overflow-y-auto space-y-3.5 flex-1">
              <div className="grid grid-cols-12 gap-2 text-xs">
                <div className="col-span-4">
                  <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                    Kelas
                  </label>
                  <select
                    value={overrideKelas}
                    onChange={(e) => setOverrideKelas(e.target.value)}
                    className="w-full border border-slate-300 bg-white rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-900"
                  >
                    {classOptions.map((kls) => (
                      <option key={kls} value={kls}>
                        {kls}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-3">
                  <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                    Presensi
                  </label>
                  <input
                    type="text"
                    value={overridePresensi}
                    onChange={(e) => setOverridePresensi(e.target.value)}
                    className="w-full border border-slate-300 bg-white rounded-lg px-2 py-1.5 text-xs font-mono tabular-nums font-bold text-slate-900"
                  />
                </div>
                <div className="col-span-5">
                  <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                    Nama Siswa
                  </label>
                  <input
                    type="text"
                    value={overrideNama}
                    onChange={(e) => setOverrideNama(e.target.value)}
                    className="w-full border border-slate-300 bg-white rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-900"
                  />
                </div>
              </div>

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

              {/* Fitur Tap-to-Correct */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-800">
                    Ketuk Nomor untuk Koreksi Manual (1–{exam.jumlahSoal})
                  </span>
                  <span className="text-slate-500 font-mono tabular-nums">
                    {lastResult.statusRagu ? 'Cek Jawaban Ragu' : 'Valid'}
                  </span>
                </div>

                {editingQuestionNo && (
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-blue-950">
                      No.{editingQuestionNo.padStart(2, '0')} (Kunci:{' '}
                      {exam.kunciJawaban[editingQuestionNo]?.answers.join('') || '-'}):
                    </span>
                    <div className="flex items-center gap-1">
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
                                : 'bg-white border border-slate-300 text-slate-800'
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => handleTapManualOption(editingQuestionNo, '-')}
                        className="px-2 h-7 rounded-lg bg-white border border-slate-300 text-slate-600 font-semibold cursor-pointer"
                      >
                        Kosong
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingQuestionNo(null)}
                        className="px-2 h-7 rounded-lg bg-slate-900 text-white font-semibold cursor-pointer"
                      >
                        OK
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
                        className={`px-1.5 py-1.5 rounded-lg border text-left flex items-center justify-between gap-1 transition-colors cursor-pointer ${
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

            {/* Footer Aksi Cepat di Thumb Zone */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={saving}
                className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[46px]"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {saving ? 'Menyimpan...' : `Simpan (${overrideKelas}) & Lanjut`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLastResult(null);
                  setEditingQuestionNo(null);
                }}
                className="py-3 px-3.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-semibold text-xs sm:text-sm inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0 min-h-[46px]"
              >
                <RotateCcw className="w-4 h-4" />
                Ulang
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
