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
  PauseCircle,
  SlidersHorizontal,
} from 'lucide-react';
import { Exam, Student } from '../lib/ljkGenerator';
import { OPTIONS } from '../lib/ljkLayout';
import {
  processCameraFrame,
  probeLiveFrame,
  probeLiveQrFromVideo,
  parseQrIdentityJson,
  resolveStudentFromQrPayload,
  recalculateResultWithManualAnswers,
  ScanResult,
  OmrSensitivity,
  QrIdentityPayload,
} from '../lib/omrCameraEngine';

interface BarcodeDetectorLike {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
}

interface Props {
  exam: Exam;
  exams?: Exam[];
  onSelectExamId?: (id: string) => void;
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
  exams = [],
  onSelectExamId,
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
  const rawFrameBackupRef = useRef<HTMLCanvasElement | null>(null);
  const probeCanvasRef = useRef<HTMLCanvasElement>(null);
  const qrProbeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const nativeBarcodeDetectorRef = useRef<BarcodeDetectorLike | null>(null);
  const liveQrCacheRef = useRef<{
    payload: QrIdentityPayload;
    student?: Student;
    timestamp: number;
  } | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cooldownUntilRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [saving, setSaving] = useState(false);

  // Siswa yang langsung dikenali secara real-time saat kamera diarahkan ke LJK (sebelum jepret)
  const [liveRecognizedStudent, setLiveRecognizedStudent] = useState<{
    presensi: string;
    nama: string;
    kelas: string;
    mapel?: string;
  } | null>(null);

  // Sensitivitas Pembacaan Jawaban Siswa (Default: Sangat Peka untuk membaca arsiran pensil tipis/silang/centang)
  const [sensitivity, setSensitivity] = useState<OmrSensitivity>('sangat_peka');

  // Mode Otomatis di HP: Auto-Jepret aktif, Hasil Scan TETAP TAMPIL di layar sampai guru mengecek & klik Simpan
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(true);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const [autoSavePaused, setAutoSavePaused] = useState(false);
  const [recentSavedToast, setRecentSavedToast] = useState<{
    nama: string;
    presensi: string;
    kelas: string;
    skor: number;
    benar: number;
  } | null>(null);

  const [cornerStatus, setCornerStatus] = useState({
    tl: false,
    tr: false,
    bl: false,
    br: false,
    allLocked: false,
    qrDetected: false,
    lockedCount: 0,
  });

  // Torch / Flash support
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // Tap-to-correct active question number in Bottom Sheet
  const [editingQuestionNo, setEditingQuestionNo] = useState<string | null>(null);

  // Inisialisasi Hardware BarcodeDetector API (jika didukung Chrome Android/iOS) untuk deteksi QR < 5ms
  useEffect(() => {
    try {
      const Win = window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike;
      };
      if (Win.BarcodeDetector) {
        nativeBarcodeDetectorRef.current = new Win.BarcodeDetector({
          formats: ['qr_code'],
        });
      }
    } catch {
      nativeBarcodeDetectorRef.current = null;
    }
    qrProbeCanvasRef.current = document.createElement('canvas');
  }, []);

  // Cari nama kelas default terbaik dari daftar siswa terdaftar jika exam.kelas hanya berisi "Kelas 10" umum
  const preferredDefaultKelas = React.useMemo(() => {
    if (activeKelas && activeKelas !== 'SEMUA') {
      const exactActive = students.some(
        (s) => s.kelas.trim().toLowerCase() === activeKelas.trim().toLowerCase()
      );
      if (exactActive) return activeKelas;
    }
    const uniqueRosterClasses = Array.from(
      new Set(students.map((s) => s.kelas.trim()).filter(Boolean))
    );
    if (uniqueRosterClasses.length === 1) {
      return uniqueRosterClasses[0];
    }
    if (exam.kelas) {
      const exactExam = uniqueRosterClasses.find(
        (c) => c.toLowerCase() === exam.kelas.trim().toLowerCase()
      );
      if (exactExam) return exactExam;
    }
    return uniqueRosterClasses[0] || (activeKelas !== 'SEMUA' ? activeKelas : exam.kelas) || 'Kelas 10';
  }, [activeKelas, exam.kelas, students]);

  // Identitas kelas/siswa otomatis dari lembar LJK yang sedang di-scan (atau bisa disesuaikan guru)
  const [overrideKelas, setOverrideKelas] = useState<string>(preferredDefaultKelas);
  const [overridePresensi, setOverridePresensi] = useState<string>('01');
  const [overrideNama, setOverrideNama] = useState<string>('');
  const [overrideMapel, setOverrideMapel] = useState<string>(exam.mapel);

  useEffect(() => {
    setOverrideMapel(exam.mapel);
  }, [exam.mapel]);

  const targetClassForStudents =
    overrideKelas && overrideKelas !== 'SEMUA'
      ? overrideKelas
      : preferredDefaultKelas;

  // Daftar siswa untuk kelas aktif (dengan fallback pintar jika nama kelas di paket ujian bersifat umum seperti "Kelas 10")
  const classStudents = React.useMemo(() => {
    const exact = students.filter(
      (s) => s.kelas.trim().toLowerCase() === targetClassForStudents.trim().toLowerCase()
    );
    if (exact.length > 0) {
      return [...exact].sort((a, b) =>
        a.presensi.padStart(2, '0').localeCompare(b.presensi.padStart(2, '0'))
      );
    }
    return [...students].sort((a, b) =>
      a.presensi.padStart(2, '0').localeCompare(b.presensi.padStart(2, '0'))
    );
  }, [students, targetClassForStudents]);

  // Gabungkan daftar kelas agar kelas hasil deteksi QR (misal "10 ALI BIN ABI THALIB") selalu muncul di dropdown
  const mergedClassOptions = React.useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.kelas && s.kelas !== 'SEMUA') set.add(s.kelas);
    });
    classOptions.forEach((c) => {
      if (c && c !== 'SEMUA') set.add(c);
    });
    if (overrideKelas && overrideKelas !== 'SEMUA') set.add(overrideKelas);
    if (lastResult?.kelas && lastResult.kelas !== 'SEMUA') set.add(lastResult.kelas);
    return Array.from(set);
  }, [classOptions, lastResult?.kelas, overrideKelas, students]);

  useEffect(() => {
    if (!lastResult && classStudents.length > 0 && !overrideNama) {
      const first = classStudents[0];
      setOverridePresensi(first.presensi.padStart(2, '0'));
      setOverrideNama(first.nama);
      setOverrideKelas(first.kelas);
    }
  }, [classStudents, lastResult, overrideNama]);

  // Helper pencarian siswa berdasarkan kelas & nomor presensi (dengan fallback 1 rombel)
  const findStudentByClassAndPresensi = useCallback(
    (kls: string, prs: string): Student | undefined => {
      const cleanPrs = prs.trim().padStart(2, '0');
      const cleanKls = kls.trim().toLowerCase();
      return (
        students.find(
          (s) =>
            s.kelas.trim().toLowerCase() === cleanKls &&
            s.presensi.trim().padStart(2, '0') === cleanPrs
        ) ||
        classStudents.find((s) => s.presensi.trim().padStart(2, '0') === cleanPrs) ||
        students.find((s) => s.presensi.trim().padStart(2, '0') === cleanPrs)
      );
    },
    [classStudents, students]
  );

  // Bunyi Beep & Getar ala EvalBee saat LJK berhasil dikunci & dipotret
  const triggerScanFeedback = useCallback(() => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(60);
      }
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          audioCtxRef.current = new AudioCtx();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
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
        'Browser ini membatasi live stream kamera. Gunakan tombol Kamera Sistem / Ambil Foto di bawah.'
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
        const streamPromise = navigator.mediaDevices.getUserMedia(constraints);
        const timeoutPromise = new Promise<null>((resolve) =>
          window.setTimeout(() => resolve(null), 3500)
        );
        const res = await Promise.race([streamPromise, timeoutPromise]);
        if (res) {
          acquiredStream = res;
          break;
        }
      } catch {
        // Coba fallback constraint berikutnya
      }
    }

    if (!acquiredStream) {
      setCameraStarting(false);
      setCameraError(
        'Izin kamera live belum aktif di browser HP ini. Izinkan akses kamera lalu klik Coba Kamera Live Lagi, atau langsung tekan tombol Kamera Sistem di bawah.'
      );
      return;
    }

    streamRef.current = acquiredStream;
    setCameraOn(true);
    setCameraStarting(false);

    if (videoRef.current) {
      videoRef.current.srcObject = acquiredStream;
      videoRef.current.setAttribute('playsinline', 'true');
      videoRef.current.setAttribute('webkit-playsinline', 'true');
      try {
        await videoRef.current.play();
      } catch {
        // AutoPlay ditangani oleh useEffect & onLoadedMetadata
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

  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl && streamRef.current) {
      if (videoEl.srcObject !== streamRef.current) {
        videoEl.srcObject = streamRef.current;
      }
      if (videoEl.paused) {
        videoEl.play().catch(() => {});
      }
    }
  }, [cameraOn, lastResult]);

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

  const advanceToNextPresensi = useCallback(
    (currentPresensi: string, currentKelas: string) => {
      const nextNum = (parseInt(currentPresensi, 10) || 1) + 1;
      const nextPresensi = String(nextNum).padStart(2, '0');
      setOverridePresensi(nextPresensi);
      const nextStudent = findStudentByClassAndPresensi(currentKelas, nextPresensi);
      if (nextStudent) {
        setOverrideNama(nextStudent.nama);
        setOverrideKelas(nextStudent.kelas);
      } else {
        setOverrideNama(`Peserta ${currentKelas} - No. ${nextPresensi}`);
      }
    },
    [findStudentByClassAndPresensi]
  );

  /**
   * PRIORITAS UTAMA: Otomatis mendeteksi Nomor Presensi, Nama Siswa, Kelas, dan Mapel
   * langsung dari lembar jawaban (QR Code / database siswa) yang sedang di-scan!
   */
  const applyClassAndStudentOverride = useCallback(
    (rawResult: ScanResult): ScanResult => {
      const hasScannedClass =
        Boolean(rawResult.qrRead) &&
        Boolean(rawResult.kelas) &&
        rawResult.kelas !== '-';

      const cleanPresensi =
        rawResult.presensi && rawResult.presensi !== '-'
          ? rawResult.presensi.padStart(2, '0')
          : overridePresensi.trim().padStart(2, '0') || '01';

      const candidateKelas = hasScannedClass
        ? rawResult.kelas
        : preferredDefaultKelas;

      // Cari siswa di daftar master data siswa
      const matchedInRoster = findStudentByClassAndPresensi(candidateKelas, cleanPresensi);

      const chosenKelas = hasScannedClass
        ? rawResult.kelas
        : matchedInRoster?.kelas || candidateKelas;

      const cleanNama =
        rawResult.qrRead && rawResult.nama && !rawResult.nama.includes('Tidak Terbaca')
          ? matchedInRoster?.nama || rawResult.nama
          : matchedInRoster?.nama ||
            (overrideNama.trim() && !overrideNama.startsWith('Peserta ')
              ? overrideNama.trim()
              : `Peserta ${chosenKelas} - No. ${cleanPresensi}`);

      const detectedMapelName = rawResult.detectedMapel || rawResult.mapel || exam.mapel;

      setOverrideKelas(chosenKelas);
      setOverridePresensi(cleanPresensi);
      setOverrideNama(cleanNama);
      setOverrideMapel(detectedMapelName);

      // Sinkronkan filter kelas aktif & paket ujian jika lembar LJK memiliki identitas mapel/kelas sendiri
      if (chosenKelas && chosenKelas !== activeKelas) {
        onChangeActiveKelas(chosenKelas);
      }
      if (
        rawResult.detectedExamId &&
        onSelectExamId &&
        rawResult.detectedExamId !== exam.id &&
        exams.some((e) => e.id === rawResult.detectedExamId)
      ) {
        onSelectExamId(rawResult.detectedExamId);
      }

      return {
        ...rawResult,
        studentId: matchedInRoster?.id || rawResult.studentId,
        kelas: chosenKelas,
        presensi: cleanPresensi,
        nama: cleanNama,
        mapel: detectedMapelName,
      };
    },
    [
      activeKelas,
      exam.id,
      exam.mapel,
      exams,
      findStudentByClassAndPresensi,
      onChangeActiveKelas,
      onSelectExamId,
      overrideNama,
      overridePresensi,
      preferredDefaultKelas,
    ]
  );

  // Simpan salinan mentah citra tangkapan agar guru bisa mengubah tingkat sensitivitas secara instan tanpa foto ulang
  const saveRawCanvasBackup = useCallback((srcCanvas: HTMLCanvasElement) => {
    const backup = document.createElement('canvas');
    backup.width = srcCanvas.width;
    backup.height = srcCanvas.height;
    const bCtx = backup.getContext('2d');
    if (bCtx) {
      bCtx.drawImage(srcCanvas, 0, 0);
      rawFrameBackupRef.current = backup;
    }
  }, []);

  // Fungsi proses ulang gambar yang sedang tampil ketika guru mengganti sensitivitas ('sangat_peka' | 'tinggi' | 'normal')
  const handleReprocessWithSensitivity = useCallback(
    (nextSens: OmrSensitivity) => {
      setSensitivity(nextSens);
      if (!rawFrameBackupRef.current || !canvasRef.current) return;
      const workCanvas = canvasRef.current;
      workCanvas.width = rawFrameBackupRef.current.width;
      workCanvas.height = rawFrameBackupRef.current.height;
      const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(rawFrameBackupRef.current, 0, 0);
      const cachedQr = liveQrCacheRef.current?.payload || null;
      const reprocessed = processCameraFrame(workCanvas, exam, students, nextSens, exams, cachedQr);
      setAutoSavePaused(true);
      setLastResult((prev) => ({
        ...reprocessed,
        kelas: overrideKelas || reprocessed.kelas,
        presensi: overridePresensi || reprocessed.presensi,
        nama: overrideNama || reprocessed.nama,
        mapel: overrideMapel || reprocessed.mapel,
        qrRead: prev?.qrRead || reprocessed.qrRead,
      }));
    },
    [exam, exams, overrideKelas, overrideMapel, overrideNama, overridePresensi, students]
  );

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    if (!cameraOn || video.videoWidth === 0 || video.videoHeight === 0) {
      nativeCameraInputRef.current?.click();
      return;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;
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
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(video, startX, startY, cropW, cropH, 0, 0, canvas.width, canvas.height);

    saveRawCanvasBackup(canvas);

    // Gunakan cache Live QR jika baru saja terbaca dalam 3.5 detik terakhir agar pengenalan siswa 0ms
    const freshLiveQr =
      liveQrCacheRef.current && performance.now() - liveQrCacheRef.current.timestamp < 3500
        ? liveQrCacheRef.current.payload
        : null;

    const result = processCameraFrame(canvas, exam, students, sensitivity, exams, freshLiveQr);
    triggerScanFeedback();
    setEditingQuestionNo(null);
    setAutoSavePaused(false);
    setLastResult(applyClassAndStudentOverride(result));
  }, [
    applyClassAndStudentOverride,
    cameraOn,
    exam,
    exams,
    saveRawCanvasBackup,
    sensitivity,
    students,
    triggerScanFeedback,
  ]);

  const handleConfirmSave = useCallback(async () => {
    if (!lastResult || saving) return;
    setSaving(true);
    try {
      const cleanKelas = (overrideKelas || lastResult.kelas || preferredDefaultKelas).trim();
      const cleanPresensi = (overridePresensi || lastResult.presensi || '01')
        .trim()
        .padStart(2, '0');
      const cleanNama = (overrideNama || lastResult.nama || 'Siswa').trim();
      const cleanMapel = (overrideMapel || lastResult.mapel || exam.mapel).trim();
      const matchedRoster = findStudentByClassAndPresensi(cleanKelas, cleanPresensi);

      const finalResult: ScanResult = {
        ...lastResult,
        studentId: matchedRoster?.id || lastResult.studentId,
        kelas: cleanKelas,
        presensi: cleanPresensi,
        nama: cleanNama,
        mapel: cleanMapel,
      };
      await onResultSaved(finalResult);
      setRecentSavedToast({
        nama: finalResult.nama,
        presensi: finalResult.presensi,
        kelas: finalResult.kelas,
        skor: finalResult.skor,
        benar: finalResult.benar,
      });
      liveQrCacheRef.current = null;
      setLiveRecognizedStudent(null);
      cooldownUntilRef.current = performance.now() + 1500;
      setLastResult(null);
      setEditingQuestionNo(null);
      setAutoSavePaused(false);
      advanceToNextPresensi(finalResult.presensi, finalResult.kelas);
    } finally {
      setSaving(false);
    }
  }, [
    advanceToNextPresensi,
    exam.mapel,
    findStudentByClassAndPresensi,
    lastResult,
    onResultSaved,
    overrideKelas,
    overrideMapel,
    overrideNama,
    overridePresensi,
    preferredDefaultKelas,
    saving,
  ]);

  useEffect(() => {
    if (!lastResult || !autoSaveEnabled || autoSavePaused || editingQuestionNo || saving) {
      return;
    }
    const timer = window.setTimeout(() => {
      handleConfirmSave();
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [autoSaveEnabled, autoSavePaused, editingQuestionNo, handleConfirmSave, lastResult, saving]);

  useEffect(() => {
    if (!recentSavedToast) return;
    const t = window.setTimeout(() => setRecentSavedToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [recentSavedToast]);

  // Loop Real-Time Super Cepat (85ms): Deteksi 4 Sudut Anchor + Pre-Dekode QR Identitas Siswa Langsung dari Video
  useEffect(() => {
    if (!cameraOn || lastResult) return;

    let animId = 0;
    let lastCheck = 0;
    let lastQrCheck = 0;
    let consecutiveReady = 0;
    let barcodeBusy = false;

    const updateLiveQrIdentity = (payload: QrIdentityPayload) => {
      const resolved = resolveStudentFromQrPayload(payload, students, preferredDefaultKelas);
      liveQrCacheRef.current = {
        payload,
        student: resolved,
        timestamp: performance.now(),
      };
      if (resolved) {
        setLiveRecognizedStudent((prev) =>
          prev?.presensi === resolved.presensi &&
          prev?.nama === resolved.nama &&
          prev?.kelas === resolved.kelas
            ? prev
            : {
                presensi: resolved.presensi.padStart(2, '0'),
                nama: resolved.nama,
                kelas: resolved.kelas,
                mapel: payload.mpl,
              }
        );
      }
    };

    const loop = (timestamp: number) => {
      if (timestamp - lastCheck >= 85) {
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

          // 1. Pre-dekode QR Siswa dari kuadran kanan-atas video tiap 160ms agar nama siswa langsung muncul
          if (timestamp - lastQrCheck >= 160) {
            lastQrCheck = timestamp;
            if (nativeBarcodeDetectorRef.current && !barcodeBusy) {
              barcodeBusy = true;
              nativeBarcodeDetectorRef.current
                .detect(video)
                .then((codes) => {
                  for (const c of codes) {
                    const parsed = parseQrIdentityJson(c.rawValue);
                    if (parsed) {
                      updateLiveQrIdentity(parsed);
                      break;
                    }
                  }
                })
                .catch(() => {})
                .finally(() => {
                  barcodeBusy = false;
                });
            }
            if (qrProbeCanvasRef.current) {
              const liveQr = probeLiveQrFromVideo(
                video,
                sx,
                sy,
                cropW,
                cropH,
                qrProbeCanvasRef.current
              );
              if (liveQr) {
                updateLiveQrIdentity(liveQr);
              }
            }
          }

          // Bersihkan badge siswa live jika sudah > 2.5 detik tidak terlihat di kamera
          if (
            liveQrCacheRef.current &&
            timestamp - liveQrCacheRef.current.timestamp > 2500
          ) {
            liveQrCacheRef.current = null;
            setLiveRecognizedStudent(null);
          }

          // 2. Deteksi 4 sudut anchor LJK
          probe.width = 420;
          probe.height = 297;
          const pCtx = probe.getContext('2d', { willReadFrequently: true });
          if (pCtx) {
            pCtx.drawImage(video, sx, sy, cropW, cropH, 0, 0, probe.width, probe.height);
            const detection = probeLiveFrame(pCtx, probe.width, probe.height);
            const inCooldown = timestamp < cooldownUntilRef.current;
            const hasFreshLiveQr = Boolean(
              liveQrCacheRef.current && timestamp - liveQrCacheRef.current.timestamp < 2200
            );

            if (detection.readyToCapture && !inCooldown) {
              consecutiveReady += 1;
            } else {
              consecutiveReady = 0;
            }

            const nextCornerState = {
              tl: Boolean(detection.corners.tl),
              tr: Boolean(detection.corners.tr),
              bl: Boolean(detection.corners.bl),
              br: Boolean(detection.corners.br),
              allLocked: Boolean(detection.readyToCapture),
              qrDetected: Boolean(detection.qrDetected || hasFreshLiveQr),
              lockedCount: detection.lockedCount,
            };

            setCornerStatus((prev) =>
              prev.tl === nextCornerState.tl &&
              prev.tr === nextCornerState.tr &&
              prev.bl === nextCornerState.bl &&
              prev.br === nextCornerState.br &&
              prev.allLocked === nextCornerState.allLocked &&
              prev.qrDetected === nextCornerState.qrDetected &&
              prev.lockedCount === nextCornerState.lockedCount
                ? prev
                : nextCornerState
            );

            // Jika QR siswa sudah dikenali, kunci & jepret instan pada frame pertama (consecutiveReady >= 1)!
            const requiredFrames = hasFreshLiveQr ? 1 : 2;
            if (autoCaptureEnabled && !inCooldown && consecutiveReady >= requiredFrames) {
              consecutiveReady = 0;
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
  }, [autoCaptureEnabled, cameraOn, handleCapture, lastResult, preferredDefaultKelas, students]);

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

    const orientations: Array<0 | 90 | 270> =
      img.height > img.width ? [0, 90, 270] : [0, 90];

    let bestResult: ScanResult | null = null;
    let bestRawCanvas: HTMLCanvasElement | null = null;
    let bestScoreRank = -1;

    for (const angle of orientations) {
      const testCanvas = document.createElement('canvas');
      testCanvas.width = 1050;
      testCanvas.height = 742;
      const tCtx = testCanvas.getContext('2d', { willReadFrequently: true })!;

      if (angle === 0) {
        tCtx.drawImage(img, 0, 0, testCanvas.width, testCanvas.height);
      } else if (angle === 90) {
        tCtx.save();
        tCtx.translate(testCanvas.width / 2, testCanvas.height / 2);
        tCtx.rotate(Math.PI / 2);
        tCtx.drawImage(
          img,
          -testCanvas.height / 2,
          -testCanvas.width / 2,
          testCanvas.height,
          testCanvas.width
        );
        tCtx.restore();
      } else {
        tCtx.save();
        tCtx.translate(testCanvas.width / 2, testCanvas.height / 2);
        tCtx.rotate(-Math.PI / 2);
        tCtx.drawImage(
          img,
          -testCanvas.height / 2,
          -testCanvas.width / 2,
          testCanvas.height,
          testCanvas.width
        );
        tCtx.restore();
      }

      const rawCopy = document.createElement('canvas');
      rawCopy.width = 1050;
      rawCopy.height = 742;
      rawCopy.getContext('2d')?.drawImage(testCanvas, 0, 0);

      const candidate = processCameraFrame(testCanvas, exam, students, sensitivity, exams);
      const answeredCount = candidate.benar + candidate.salah;
      const qrBonus = candidate.qrRead ? 600 : 0;
      const anchorBonus = candidate.anchorsDetected ? 350 : 0;
      const rank = qrBonus + anchorBonus + answeredCount * 12 + candidate.benar;

      if (rank > bestScoreRank) {
        bestScoreRank = rank;
        bestResult = candidate;
        bestRawCanvas = rawCopy;
      }
      if (candidate.anchorsDetected && candidate.qrRead) {
        break;
      }
    }

    URL.revokeObjectURL(imgUrl);

    if (bestResult) {
      if (bestRawCanvas) {
        rawFrameBackupRef.current = bestRawCanvas;
      }
      triggerScanFeedback();
      setEditingQuestionNo(null);
      setAutoSavePaused(false);
      setLastResult(applyClassAndStudentOverride(bestResult));
    }
    e.target.value = '';
  }

  // Tap-to-correct: Guru mengetuk nomor soal lalu memilih opsi A/B/C/D/E atau Kosong (-)
  function handleTapManualOption(qNo: string, chosenOpt: string) {
    if (!lastResult) return;
    setAutoSavePaused(true);
    const activeEx =
      (lastResult.examId && exams.find((e) => e.id === lastResult.examId)) || exam;
    const qKey = activeEx.kunciJawaban[qNo];
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
    setLastResult(recalculateResultWithManualAnswers(lastResult, updatedMap, activeEx));
    if (qKey?.type !== 'PGK') {
      setEditingQuestionNo(null);
    }
  }

  const currentKelasLabel =
    overrideKelas && overrideKelas !== 'SEMUA'
      ? overrideKelas
      : activeKelas !== 'SEMUA'
      ? activeKelas
      : exam.kelas;

  const activeGradingExam =
    (lastResult?.examId && exams.find((e) => e.id === lastResult.examId)) || exam;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col overflow-hidden select-none">
      {/* Input Kamera Sistem HP Tersembunyi */}
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleImageUpload}
        className="hidden"
      />

      {/* Compact Mobile Top Bar: Pilih Mapel/Ujian, Kelas, Sensitivitas, Auto-Jepret & Tutup */}
      <div className="bg-slate-900/95 border-b border-slate-800 px-2.5 py-2 flex items-center justify-between gap-1.5 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {exams.length > 1 && onSelectExamId ? (
            <select
              value={exam.id}
              onChange={(e) => onSelectExamId(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2 py-1 text-xs font-bold cursor-pointer max-w-[125px] sm:max-w-[190px] truncate min-h-[34px]"
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.mapel} ({ex.kelas})
                </option>
              ))}
            </select>
          ) : (
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">{exam.mapel}</p>
              <p className="text-[10px] text-slate-400 font-mono tabular-nums truncate">
                {exam.jumlahSoal} Soal · {classResults.length} LJK
              </p>
            </div>
          )}

          <select
            value={currentKelasLabel}
            onChange={(e) => {
              onChangeActiveKelas(e.target.value);
              setOverrideKelas(e.target.value);
            }}
            className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2 py-1 text-xs font-semibold cursor-pointer shrink-0 max-w-[115px] sm:max-w-[160px] truncate min-h-[34px]"
          >
            {mergedClassOptions.map((kls) => (
              <option key={kls} value={kls}>
                {kls}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <select
            value={sensitivity}
            onChange={(e) => setSensitivity(e.target.value as OmrSensitivity)}
            className="bg-emerald-950/80 border border-emerald-600/60 text-emerald-300 rounded-lg px-1.5 py-1 text-[10px] font-bold cursor-pointer min-h-[34px]"
            title="Sensitivitas Deteksi Jawaban Siswa"
          >
            <option value="sangat_peka">Peka: Tinggi+</option>
            <option value="tinggi">Peka: Tinggi</option>
            <option value="normal">Peka: Normal</option>
          </select>

          <button
            type="button"
            onClick={() => setAutoCaptureEnabled((prev) => !prev)}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap min-h-[34px] ${
              autoCaptureEnabled
                ? 'bg-emerald-600/25 border border-emerald-500/60 text-emerald-300'
                : 'bg-slate-800 border border-slate-700 text-slate-400'
            }`}
            title="Otomatis Jepret saat LJK Terdeteksi"
          >
            {autoCaptureEnabled ? 'Auto-Jepret' : 'Manual'}
          </button>

          {torchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer min-h-[34px] min-w-[34px] flex items-center justify-center ${
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
            className="p-1.5 bg-slate-800 hover:bg-red-600 border border-slate-700 text-slate-200 hover:text-white rounded-lg transition-colors cursor-pointer min-h-[34px] min-w-[34px] flex items-center justify-center"
            title="Tutup Kamera"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Notifikasi Lembar Terakhir Tersimpan */}
      {recentSavedToast && !lastResult && (
        <div className="bg-emerald-950/95 border-b border-emerald-700/70 px-3 py-1.5 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-emerald-100 font-semibold truncate">
              Tersimpan: No.{recentSavedToast.presensi} {recentSavedToast.nama} ({recentSavedToast.kelas})
            </span>
          </div>
          <span className="font-mono font-bold text-emerald-300 shrink-0 ml-2">
            Nilai: {recentSavedToast.skor} (B:{recentSavedToast.benar})
          </span>
        </div>
      )}

      {/* Main Camera Viewport */}
      <div className="flex-1 relative flex flex-col items-center justify-center p-2.5 sm:p-5 overflow-hidden">
        <div className="relative w-full max-w-2xl aspect-[210/148.5] bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={() => {
              videoRef.current?.play().catch(() => {});
            }}
            onCanPlay={() => {
              videoRef.current?.play().catch(() => {});
            }}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity ${
              cameraOn ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          />

          {cameraOn && (
            <div
              className={`pointer-events-none absolute inset-2.5 sm:inset-4 rounded-xl border-2 transition-colors ${
                cornerStatus.allLocked
                  ? 'border-emerald-400 bg-emerald-500/10'
                  : cornerStatus.lockedCount >= 2
                  ? 'border-amber-400/80'
                  : 'border-white/30'
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

              {liveRecognizedStudent && (
                <div className="absolute top-2 inset-x-2 flex items-center justify-center">
                  <div className="px-3 py-1 rounded-lg bg-emerald-600/95 border border-emerald-300/60 text-white text-[11px] font-bold shadow-md flex items-center gap-1.5 max-w-full truncate">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-200" />
                    <span className="truncate">
                      Siswa Dikenali: No.{liveRecognizedStudent.presensi}{' '}
                      {liveRecognizedStudent.nama} ({liveRecognizedStudent.kelas})
                    </span>
                  </div>
                </div>
              )}

              <div className="absolute bottom-2 inset-x-2 flex items-center justify-center">
                <div
                  className={`px-3 py-1 rounded-lg text-[11px] font-semibold backdrop-blur-xs transition-colors text-center ${
                    cornerStatus.allLocked
                      ? 'bg-emerald-600/95 text-white'
                      : cornerStatus.lockedCount >= 2 || liveRecognizedStudent
                      ? 'bg-amber-600/90 text-white'
                      : 'bg-slate-950/85 text-slate-200'
                  }`}
                >
                  {cornerStatus.allLocked
                    ? 'LJK Terkunci Otomatis · Memotret...'
                    : cornerStatus.lockedCount > 0
                    ? `Terdeteksi ${cornerStatus.lockedCount}/4 Sudut · Arahkan Kamera ke LJK`
                    : 'Arahkan Kamera HP ke Lembar LJK (Otomatis Deteksi Nama & Jawaban)'}
                </div>
              </div>
            </div>
          )}

          {!cameraOn && (
            <div className="relative z-10 p-5 text-center space-y-3 max-w-xs">
              {cameraStarting && (
                <p className="text-xs font-semibold text-slate-300">
                  Menghubungkan ke Kamera Live HP...
                </p>
              )}
              {cameraError && (
                <div className="p-2.5 bg-amber-950/90 border border-amber-700/80 rounded-xl text-[11px] text-amber-200 flex items-start gap-2 text-left">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                  <span>{cameraError}</span>
                </div>
              )}
              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => nativeCameraInputRef.current?.click()}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs inline-flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
                >
                  <Camera className="w-4 h-4" />
                  Buka Kamera HP / Ambil Foto LJK
                </button>
                <button
                  type="button"
                  onClick={startCamera}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-xs inline-flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
                >
                  <RotateCcw className="w-4 h-4" />
                  Coba Kamera Live Lagi
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Thumb-Zone Action Bar di Bawah Kamera */}
        {!lastResult && (
          <div className="mt-3 w-full max-w-md flex items-center gap-2 px-1">
            <button
              type="button"
              onClick={handleCapture}
              className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white rounded-xl font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[46px]"
            >
              <Zap className="w-4 h-4 shrink-0" />
              {cameraOn ? 'Jepret Sekarang' : 'Scan Kamera HP'}
            </button>

            <button
              type="button"
              onClick={() => nativeCameraInputRef.current?.click()}
              className="py-3 px-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors min-h-[46px] shrink-0"
            >
              <Camera className="w-4 h-4 shrink-0" />
              <span>Kamera Sistem</span>
            </button>

            <label className="py-3 px-3.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl font-semibold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors min-h-[46px] shrink-0">
              <Upload className="w-4 h-4 shrink-0" />
              <span>Galeri</span>
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

      {/* Bottom Sheet Overlay Hasil Scan Instan + Verifikasi Nama, Nomor, Kelas & Nilai */}
      {lastResult && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white text-slate-900 w-full max-w-xl sm:rounded-2xl rounded-t-2xl border border-slate-200 max-h-[92vh] flex flex-col overflow-hidden">
            {/* Header Skor & Identitas Siswa yang Terdeteksi */}
            <div className="bg-slate-900 text-white px-4 py-3.5 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-300 flex-wrap">
                  <span className="font-semibold text-blue-300 truncate">
                    {overrideMapel || activeGradingExam.mapel}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-white">{overrideKelas}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-emerald-300 font-bold">
                    No.{overridePresensi}
                  </span>
                  {lastResult.qrRead && (
                    <span className="px-1.5 py-0.5 bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 rounded text-[9px] font-bold">
                      QR Terbaca Otomatis
                    </span>
                  )}
                </div>
                <p className="font-bold text-sm sm:text-base truncate">
                  {overrideNama || lastResult.nama}
                </p>
                <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                  <span className="text-emerald-400 font-bold">B:{lastResult.benar}</span>
                  <span className="text-red-400 font-bold">S:{lastResult.salah}</span>
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

            {/* Banner Status Auto-Simpan jika diaktifkan */}
            {autoSaveEnabled && !autoSavePaused && !editingQuestionNo && (
              <div className="bg-blue-600 text-white px-3.5 py-2 flex items-center justify-between gap-2 text-xs shrink-0">
                <span className="font-semibold">
                  Menyimpan otomatis &amp; lanjut scan lembar berikutnya...
                </span>
                <button
                  type="button"
                  onClick={() => setAutoSavePaused(true)}
                  className="px-2.5 py-1 bg-white text-blue-700 rounded-lg font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <PauseCircle className="w-3.5 h-3.5" />
                  Tahan / Edit
                </button>
              </div>
            )}

            {/* Body Scrollable: Verifikasi Identitas + Sensitivitas + Foto LJK + Ketuk Nomor */}
            <div className="p-3.5 sm:p-4 overflow-y-auto space-y-3 flex-1">
              {/* Baris Cek & Koreksi Identitas Siswa (Otomatis Terisi dari QR / Daftar Siswa Kelas) */}
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-800">
                    Identitas Lembar Jawaban (Verifikasi Guru)
                  </span>
                  {lastResult.qrRead ? (
                    <span className="text-emerald-700 font-bold">
                      ✓ Siswa Dikenali Otomatis dari QR
                    </span>
                  ) : (
                    <span className="text-slate-500">
                      Pilih Cepat Siswa atau No. Presensi
                    </span>
                  )}
                </div>

                {classStudents.length > 0 && (
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                      Pilih Cepat Siswa Terdaftar ({classStudents.length} Siswa)
                    </label>
                    <select
                      value={`${overrideKelas}::${overridePresensi.trim().padStart(2, '0')}`}
                      onFocus={() => setAutoSavePaused(true)}
                      onChange={(e) => {
                        setAutoSavePaused(true);
                        const [selKelas, selPrs] = e.target.value.split('::');
                        if (!selPrs) return;
                        const found = findStudentByClassAndPresensi(
                          selKelas || overrideKelas,
                          selPrs
                        );
                        if (found) {
                          setOverrideKelas(found.kelas);
                          setOverridePresensi(found.presensi.padStart(2, '0'));
                          setOverrideNama(found.nama);
                        }
                      }}
                      className="w-full border border-blue-300 bg-white rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 cursor-pointer"
                    >
                      {classStudents.map((st) => {
                        const paddedPrs = st.presensi.padStart(2, '0');
                        return (
                          <option key={st.id} value={`${st.kelas}::${paddedPrs}`}>
                            No.{paddedPrs} — {st.nama} ({st.kelas})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-12 gap-2 text-xs">
                  <div className="col-span-4">
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                      Kelas
                    </label>
                    <input
                      type="text"
                      list="scanner-kelas-list"
                      value={overrideKelas}
                      onFocus={() => setAutoSavePaused(true)}
                      onChange={(e) => {
                        setAutoSavePaused(true);
                        const nextKls = e.target.value;
                        setOverrideKelas(nextKls);
                        const matched = findStudentByClassAndPresensi(
                          nextKls,
                          overridePresensi
                        );
                        if (matched) {
                          setOverrideNama(matched.nama);
                        }
                      }}
                      className="w-full border border-slate-300 bg-white rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-900"
                    />
                    <datalist id="scanner-kelas-list">
                      {mergedClassOptions.map((kls) => (
                        <option key={kls} value={kls} />
                      ))}
                    </datalist>
                  </div>

                  <div className="col-span-3">
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                      Presensi
                    </label>
                    <input
                      type="text"
                      value={overridePresensi}
                      onFocus={() => setAutoSavePaused(true)}
                      onChange={(e) => {
                        setAutoSavePaused(true);
                        const rawVal = e.target.value;
                        setOverridePresensi(rawVal);
                        const matched = findStudentByClassAndPresensi(
                          overrideKelas,
                          rawVal
                        );
                        if (matched) {
                          setOverrideNama(matched.nama);
                          setOverrideKelas(matched.kelas);
                        }
                      }}
                      className="w-full border border-slate-300 bg-white rounded-lg px-2 py-1.5 text-xs font-mono tabular-nums font-bold text-slate-900"
                    />
                  </div>

                  <div className="col-span-5">
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                      Nama Siswa
                    </label>
                    <input
                      type="text"
                      value={overrideNama}
                      onFocus={() => setAutoSavePaused(true)}
                      onChange={(e) => {
                        setAutoSavePaused(true);
                        setOverrideNama(e.target.value);
                      }}
                      className="w-full border border-slate-300 bg-white rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Pengatur Sensitivitas Baca Jawaban Langsung pada Gambar Ini */}
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs">
                <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Sensitivitas Jawaban:</span>
                </div>
                <div className="flex items-center gap-1">
                  {(
                    [
                      { id: 'sangat_peka', label: 'Sangat Peka' },
                      { id: 'tinggi', label: 'Tinggi' },
                      { id: 'normal', label: 'Normal' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleReprocessWithSensitivity(opt.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                        sensitivity === opt.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
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
                    Ketuk Nomor untuk Koreksi Manual (1–{activeGradingExam.jumlahSoal})
                  </span>
                  <span className="text-slate-500 font-mono tabular-nums">
                    {lastResult.statusRagu ? 'Cek Jawaban Ragu' : 'Terbaca Valid'}
                  </span>
                </div>

                {editingQuestionNo && (
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-blue-950">
                      No.{editingQuestionNo.padStart(2, '0')} (Kunci:{' '}
                      {activeGradingExam.kunciJawaban[editingQuestionNo]?.answers.join('') ||
                        '-'}
                      ):
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
                  {Array.from({ length: activeGradingExam.jumlahSoal }, (_, i) => {
                    const qNo = String(i + 1);
                    const ans = lastResult.detailJawaban[qNo] || '-';
                    const keyObj = activeGradingExam.kunciJawaban[qNo];
                    const expected = keyObj ? keyObj.answers.join('') : '-';
                    const isExact = ans === expected;
                    const isDoubt = ans === 'DOBEL';
                    const isEmpty = ans === '-';
                    const isActiveEdit = editingQuestionNo === qNo;

                    return (
                      <button
                        key={qNo}
                        type="button"
                        onClick={() => {
                          setAutoSavePaused(true);
                          setEditingQuestionNo((prev) => (prev === qNo ? null : qNo));
                        }}
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
                {saving
                  ? 'Menyimpan...'
                  : `Simpan (No.${overridePresensi} · ${overrideKelas}) & Lanjut`}
              </button>
              <button
                type="button"
                onClick={() => {
                  cooldownUntilRef.current = performance.now() + 1200;
                  setLastResult(null);
                  setEditingQuestionNo(null);
                  setAutoSavePaused(false);
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
