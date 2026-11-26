import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection,
  setDoc,
  deleteDoc,
  doc,
  onSnapshot,
  writeBatch,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  FileSpreadsheet,
  FileDown,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  LogIn,
  LogOut,
  Users,
  FileText,
  ScanLine,
  BarChart3,
  Download,
  Search,
  Printer,
  Scissors,
  BookOpen,
  Eye,
  X,
  ShieldCheck,
  GraduationCap,
  Pencil,
  Check,
  Lock,
  RotateCcw,
} from 'lucide-react';
import {
  db,
  auth,
  OperationType,
  handleFirestoreError,
} from './lib/firebase';
import {
  generateTwoInOneLJKPdf,
  Student,
  Subject,
  Exam,
  QuestionKey,
} from './lib/ljkGenerator';
import { DEFAULT_LJK_CAPACITY } from './lib/ljkLayout';
import { ScanResult } from './lib/omrCameraEngine';
import {
  parseStudentsExcel,
  parseAnswerKeyExcel,
  exportResultsToExcel,
  downloadStudentTemplateExcel,
  downloadAnswerKeyTemplateExcel,
} from './lib/excelHelper';
import CameraScanner from './components/CameraScanner';

const SCHOOL_ID = 'school_main';
const ADMIN_EMAIL = 'sahidin30@gmail.com';
const ADMIN_PASSWORD = '123456';

export const JENJANG_OPTIONS = [
  'Kelas 10',
  'Kelas 11',
  'Kelas 12',
  'Kelas 10, 11 & 12',
] as const;

// Daftar Lengkap Mata Pelajaran di Indonesia beserta Jenjang Kelas (Kelas 10, 11, 12)
const INDONESIAN_SUBJECTS: Subject[] = [
  // Kelompok Umum & Nasional (Kelas 10, 11 & 12)
  { id: 'sub_pai', kode: 'PAI', namaMapel: 'Pendidikan Agama Islam dan Budi Pekerti', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_pakris', kode: 'PAKRIS', namaMapel: 'Pendidikan Agama Kristen dan Budi Pekerti', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_pakat', kode: 'PAKAT', namaMapel: 'Pendidikan Agama Katolik dan Budi Pekerti', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_pahin', kode: 'PAHIN', namaMapel: 'Pendidikan Agama Hindu dan Budi Pekerti', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_pabud', kode: 'PABUD', namaMapel: 'Pendidikan Agama Buddha dan Budi Pekerti', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_pakhong', kode: 'PAKHONG', namaMapel: 'Pendidikan Agama Khonghucu dan Budi Pekerti', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_ppkn', kode: 'PPKN', namaMapel: 'Pendidikan Pancasila (PPKn)', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_bind', kode: 'BIND', namaMapel: 'Bahasa Indonesia', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_mtk', kode: 'MTK', namaMapel: 'Matematika', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_mtk_tl', kode: 'MTK-TL', namaMapel: 'Matematika Tingkat Lanjut', jenjang: 'Kelas 11', defaultSoal: 40 },
  { id: 'sub_mtk_tl12', kode: 'MTK-TL12', namaMapel: 'Matematika Tingkat Lanjut (Kelas 12)', jenjang: 'Kelas 12', defaultSoal: 40 },
  { id: 'sub_bing', kode: 'BING', namaMapel: 'Bahasa Inggris', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_bing_tl', kode: 'BING-TL', namaMapel: 'Bahasa Inggris Tingkat Lanjut', jenjang: 'Kelas 11', defaultSoal: 40 },
  { id: 'sub_bing_tl12', kode: 'BING-TL12', namaMapel: 'Bahasa Inggris Tingkat Lanjut (Kelas 12)', jenjang: 'Kelas 12', defaultSoal: 40 },
  { id: 'sub_ipas', kode: 'IPAS', namaMapel: 'Projek Ilmu Pengetahuan Alam dan Sosial (IPAS)', jenjang: 'Kelas 10', defaultSoal: 40 },
  { id: 'sub_ipa', kode: 'IPA', namaMapel: 'Ilmu Pengetahuan Alam (IPA)', jenjang: 'Kelas 10', defaultSoal: 40 },
  { id: 'sub_ips', kode: 'IPS', namaMapel: 'Ilmu Pengetahuan Sosial (IPS)', jenjang: 'Kelas 10', defaultSoal: 40 },

  // Kelompok MIPA (SMA/MA Kelas 10, 11, 12)
  { id: 'sub_fis', kode: 'FIS', namaMapel: 'Fisika', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_kim', kode: 'KIM', namaMapel: 'Kimia', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_bio', kode: 'BIO', namaMapel: 'Biologi', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_inf', kode: 'INF', namaMapel: 'Informatika (TIK)', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },

  // Kelompok IPS & Humaniora (SMA/MA Kelas 10, 11, 12)
  { id: 'sub_sos', kode: 'SOS', namaMapel: 'Sosiologi', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_eko', kode: 'EKO', namaMapel: 'Ekonomi', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_geo', kode: 'GEO', namaMapel: 'Geografi', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_sej', kode: 'SEJ', namaMapel: 'Sejarah', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_sej_tl', kode: 'SEJ-TL', namaMapel: 'Sejarah Tingkat Lanjut', jenjang: 'Kelas 11', defaultSoal: 40 },
  { id: 'sub_sej_tl12', kode: 'SEJ-TL12', namaMapel: 'Sejarah Tingkat Lanjut (Kelas 12)', jenjang: 'Kelas 12', defaultSoal: 40 },
  { id: 'sub_ant', kode: 'ANT', namaMapel: 'Antropologi', jenjang: 'Kelas 11', defaultSoal: 40 },

  // Kelompok Seni, Olahraga & Prakarya
  { id: 'sub_pjok', kode: 'PJOK', namaMapel: 'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_sbk', kode: 'SBK', namaMapel: 'Seni Budaya', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_smus', kode: 'SMUS', namaMapel: 'Seni Musik', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_srup', kode: 'SRUP', namaMapel: 'Seni Rupa', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_star', kode: 'STAR', namaMapel: 'Seni Tari', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_stea', kode: 'STEA', namaMapel: 'Seni Teater', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_pkwu', kode: 'PKWU', namaMapel: 'Prakarya dan Kewirausahaan (PKWU)', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },

  // Kelompok Bahasa Asing & Daerah (Muatan Lokal)
  { id: 'sub_barab', kode: 'BARAB', namaMapel: 'Bahasa Arab', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_bjep', kode: 'BJEP', namaMapel: 'Bahasa Jepang', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_bman', kode: 'BMAN', namaMapel: 'Bahasa Mandarin', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_bjer', kode: 'BJER', namaMapel: 'Bahasa Jerman', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_bpra', kode: 'BPRA', namaMapel: 'Bahasa Prancis', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_bkor', kode: 'BKOR', namaMapel: 'Bahasa Korea', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_bjawa', kode: 'BJAWA', namaMapel: 'Bahasa Jawa', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_bsunda', kode: 'BSUNDA', namaMapel: 'Bahasa Sunda', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_mulok', kode: 'MULOK', namaMapel: 'Muatan Lokal (Bahasa Daerah)', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },

  // Kelompok Madrasah (MA) & Keagamaan
  { id: 'sub_qh', kode: 'QH', namaMapel: "Al-Qur'an Hadis", jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_aa', kode: 'AA', namaMapel: 'Akidah Akhlak', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_fik', kode: 'FIK', namaMapel: 'Fikih', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },
  { id: 'sub_ski', kode: 'SKI', namaMapel: 'Sejarah Kebudayaan Islam (SKI)', jenjang: 'Kelas 10, 11 & 12', defaultSoal: 40 },

  // Kelompok Kejuruan SMK
  { id: 'sub_dasar_smk', kode: 'DDPK', namaMapel: 'Dasar-Dasar Program Keahlian (SMK)', jenjang: 'Kelas 10', defaultSoal: 40 },
  { id: 'sub_kk_smk11', kode: 'KONS-11', namaMapel: 'Konsentrasi Keahlian SMK (Kelas 11)', jenjang: 'Kelas 11', defaultSoal: 40 },
  { id: 'sub_kk_smk12', kode: 'KONS-12', namaMapel: 'Konsentrasi Keahlian SMK (Kelas 12)', jenjang: 'Kelas 12', defaultSoal: 40 },
];

function isSubjectMatchingJenjang(sub: Subject, selectedJenjang: string): boolean {
  if (selectedJenjang === 'SEMUA') return true;
  const subJenjang = sub.jenjang || 'Kelas 10, 11 & 12';
  if (subJenjang === 'Kelas 10, 11 & 12') return true;
  return subJenjang === selectedJenjang;
}

/**
 * Menghasilkan daftar siswa otomatis untuk suatu kelas jika di database belum ada daftar siswa pada kelas tersebut,
 * sehingga Operator maupun Guru tetap dapat langsung mencetak LJK per Kelas (misal Kelas 10, 11, 12).
 */
function buildFallbackClassStudents(kelasLabel: string, count: number): Student[] {
  const safeCount = Math.min(60, Math.max(2, count || 30));
  const cleanKelas = kelasLabel === 'SEMUA' ? 'Kelas 10' : kelasLabel;
  return Array.from({ length: safeCount }, (_, i) => {
    const pres = String(i + 1).padStart(2, '0');
    return {
      id: `ljk_${cleanKelas.replace(/\s+/g, '_')}_${pres}`,
      presensi: pres,
      nama: `Peserta ${cleanKelas} - No. ${pres}`,
      kelas: cleanKelas,
    };
  });
}

function sortStudentsList(list: Student[]): Student[] {
  return [...list].sort((a, b) => {
    const k = a.kelas.localeCompare(b.kelas);
    return k !== 0 ? k : a.presensi.localeCompare(b.presensi);
  });
}

function sortResultsList(list: ScanResult[]): ScanResult[] {
  return [...list].sort((a, b) => {
    const k = a.kelas.localeCompare(b.kelas);
    return k !== 0 ? k : a.presensi.localeCompare(b.presensi);
  });
}

function getRosterDocId(kelas: string): string {
  return `roster_${kelas.trim().replace(/[^a-zA-Z0-9]/g, '_')}`.slice(0, 120);
}

function getClassResultBundleId(examId: string, kelas: string): string {
  return `rekap_${examId}_${kelas.trim().replace(/[^a-zA-Z0-9]/g, '_')}`.slice(0, 120);
}

interface ClassRosterDoc {
  schoolId: string;
  ownerId: string;
  kelas: string;
  siswaMap: Record<string, Student>;
}

type StoredStudentResult = Omit<ScanResult, 'previewImage'>;

interface ClassResultBundleDoc {
  schoolId: string;
  ownerId: string;
  examId: string;
  kelas: string;
  mapel: string;
  hasilMap: Record<string, StoredStudentResult>;
}

export default function App() {
  // Mode awal adalah Mode Guru (Tanpa Login) dan langsung menampilkan Hasil Ujian & Rekap
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(() => {
    return sessionStorage.getItem('evalscan_admin_auth') === 'true';
  });
  const [roleMode, setRoleMode] = useState<'guru' | 'operator'>(() => {
    return sessionStorage.getItem('evalscan_admin_auth') === 'true' ? 'operator' : 'guru';
  });
  const [tab, setTab] = useState<'operator' | 'ujian' | 'scan' | 'rekap'>(() => {
    return sessionStorage.getItem('evalscan_admin_auth') === 'true' ? 'operator' : 'rekap';
  });

  // Modal Login Admin (sahidin30@gmail.com / 123456)
  const [showAdminLoginModal, setShowAdminLoginModal] = useState(false);
  const [adminEmailInput, setAdminEmailInput] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminLoginError, setAdminLoginError] = useState('');

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Data Real-Time dengan Firestore Persistent IndexedDB Cache (Hanya dokumen yang berubah di server yang memakai kuota Read)
  const [students, setStudents] = useState<Student[]>([]);
  const [dbSubjects, setDbSubjects] = useState<Subject[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [results, setResults] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'warning'; text: string } | null>(null);

  // Gabungkan Mapel Nasional dengan Mapel di Database
  const allSubjects: Subject[] = React.useMemo(() => {
    const map = new Map<string, Subject>();
    INDONESIAN_SUBJECTS.forEach((s) => map.set(s.id, s));
    dbSubjects.forEach((s) => {
      if (s.defaultSoal === 0) {
        map.delete(s.id);
      } else {
        const fallbackJenjang = map.get(s.id)?.jenjang || 'Kelas 10, 11 & 12';
        map.set(s.id, { ...s, jenjang: s.jenjang || fallbackJenjang });
      }
    });
    return Array.from(map.values());
  }, [dbSubjects]);

  // Operator Quick LJK Print State (1 A4 = 2 Siswa, Default 40 Soal)
  const [printJenjangFilter, setPrintJenjangFilter] = useState<string>('Kelas 10');
  const [printMapel, setPrintMapel] = useState<string>('Matematika');
  const [isCustomPrintMapel, setIsCustomPrintMapel] = useState(false);
  const [customPrintMapelText, setCustomPrintMapelText] = useState('');
  const [printKelas, setPrintKelas] = useState<string>('Kelas 10');
  const [isCustomPrintKelas, setIsCustomPrintKelas] = useState(false);
  const [customPrintKelasText, setCustomPrintKelasText] = useState('');
  const [printJumlahSiswaDefault, setPrintJumlahSiswaDefault] = useState<number>(30);
  const [printJudulUjian, setPrintJudulUjian] = useState<string>('PENILAIAN AKHIR SEMESTER');

  // Admin Master Mapel Input & Edit State
  const [newKodeMapel, setNewKodeMapel] = useState('');
  const [newNamaMapel, setNewNamaMapel] = useState('');
  const [newJenjangMapel, setNewJenjangMapel] = useState<string>('Kelas 10, 11 & 12');
  const [filterJenjangAdmin, setFilterJenjangAdmin] = useState<string>('SEMUA');
  const [searchMapel, setSearchMapel] = useState('');
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [editKodeMapel, setEditKodeMapel] = useState('');
  const [editNamaMapel, setEditNamaMapel] = useState('');
  const [editJenjangMapel, setEditJenjangMapel] = useState<string>('Kelas 10, 11 & 12');

  // Admin Master Student Input
  const [newPresensi, setNewPresensi] = useState('');
  const [newNama, setNewNama] = useState('');
  const [newKelas, setNewKelas] = useState('Kelas 10');
  const [filterKelasSiswa, setFilterKelasSiswa] = useState('SEMUA');

  // Guru Form Ujian & Kunci + Cetak LJK per Kelas
  const [namaUjian, setNamaUjian] = useState('PAS Semester Ganjil');
  const [jenjangGuruFilter, setJenjangGuruFilter] = useState<string>('Kelas 10');
  const [mapelGuru, setMapelGuru] = useState('Matematika');
  const [isCustomGuruMapel, setIsCustomGuruMapel] = useState(false);
  const [customGuruMapelText, setCustomGuruMapelText] = useState('');
  const [kelasGuru, setKelasGuru] = useState('Kelas 10');
  const [isCustomGuruKelas, setIsCustomGuruKelas] = useState(false);
  const [customGuruKelasText, setCustomGuruKelasText] = useState('');
  const [jumlahSoal, setJumlahSoal] = useState(25);
  const [bobotPG, setBobotPG] = useState(2);
  const [bobotPGK, setBobotPGK] = useState(6);
  const [kunciText, setKunciText] = useState('');
  const [guruPrintJumlahSiswa, setGuruPrintJumlahSiswa] = useState<number>(30);

  // Scan Kamera HP: Filter Kelas Saat Scan
  const [scanKelasFilter, setScanKelasFilter] = useState<string>('Kelas 10');

  // Rekap & Detail Hasil LJK Modal/Panel (Default per Kelas agar saat 24 kelas ujian dalam 1 hari hanya membaca kelas yang dipilih)
  const [searchRekap, setSearchRekap] = useState('');
  const [filterKelasRekap, setFilterKelasRekap] = useState('Kelas 10');
  const [filterMapelRekap, setFilterMapelRekap] = useState('SEMUA');
  const [inspectedResult, setInspectedResult] = useState<ScanResult | null>(null);

  const activeOwnerId = user ? user.uid : 'public_school';

  // Ref penyimpanan Bundel Per Kelas (1 Dokumen = 1 Kelas Siswa & 1 Dokumen = 1 Kelas x 1 Mapel Hasil Scan)
  const rosterBundlesRef = useRef<Map<string, ClassRosterDoc>>(new Map());
  const resultBundlesRef = useRef<Map<string, ClassResultBundleDoc>>(new Map());
  const previewImagesRef = useRef<Map<string, string>>(new Map());
  const pendingBundleIdsRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<number | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  const rebuildStudentsFromBundles = useCallback(() => {
    const map = new Map<string, Student>();
    for (const bundle of rosterBundlesRef.current.values()) {
      for (const st of Object.values(bundle.siswaMap || {})) {
        if (st && st.id) {
          map.set(st.id, st);
        }
      }
    }
    setStudents(sortStudentsList(Array.from(map.values())));
  }, []);

  const rebuildResultsFromBundles = useCallback(() => {
    const map = new Map<string, ScanResult>();
    for (const bundle of resultBundlesRef.current.values()) {
      for (const item of Object.values(bundle.hasilMap || {})) {
        if (item && item.id) {
          map.set(item.id, {
            ...item,
            previewImage: previewImagesRef.current.get(item.id) || '',
          });
        }
      }
    }
    setResults(sortResultsList(Array.from(map.values())));
  }, []);

  // Fungsi Flush Antrean Bundel Hasil Scan Kelas ke Cloud Firestore (Hemat 97% Kuota Write)
  const flushPendingResultBundles = useCallback(async () => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const dirtyIds = Array.from(pendingBundleIdsRef.current);
    if (dirtyIds.length === 0) return;

    pendingBundleIdsRef.current.clear();
    setPendingSyncCount(0);

    try {
      const batch = writeBatch(db);
      for (const bId of dirtyIds) {
        const bundle = resultBundlesRef.current.get(bId);
        if (bundle) {
          batch.set(doc(db, 'class_results', bId), {
            schoolId: SCHOOL_ID,
            ownerId: bundle.ownerId || activeOwnerId,
            examId: bundle.examId,
            kelas: bundle.kelas,
            mapel: bundle.mapel,
            hasilMap: bundle.hasilMap,
            updatedAt: serverTimestamp(),
          });
        }
      }
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'class_results');
    }
  }, [activeOwnerId]);

  // Pastikan antrean tersimpan otomatis saat berpindah tab
  useEffect(() => {
    if (pendingBundleIdsRef.current.size > 0) {
      flushPendingResultBundles();
    }
  }, [tab, flushPendingResultBundles]);

  function showNotification(text: string, type: 'success' | 'warning' = 'success') {
    setBanner({ text, type });
    setTimeout(() => {
      setBanner((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Real-time Firestore listeners dengan Bundel Kelas (/class_rosters, /subjects, /exams, /class_results)
  // 24 Kelas Siswa = 24 Dokumen, 24 Kelas x 13 Mapel Hasil Scan = 312 Dokumen (Hemat 97% Kuota Read & Write!)
  useEffect(() => {
    if (!authReady) return;

    const rostersQuery = query(
      collection(db, 'class_rosters'),
      where('schoolId', '==', SCHOOL_ID)
    );
    const unsubRosters = onSnapshot(
      rostersQuery,
      { includeMetadataChanges: false },
      (snap) => {
        for (const change of snap.docChanges()) {
          if (change.type === 'removed') {
            rosterBundlesRef.current.delete(change.doc.id);
          } else {
            const data = change.doc.data() as ClassRosterDoc;
            rosterBundlesRef.current.set(change.doc.id, {
              schoolId: data.schoolId || SCHOOL_ID,
              ownerId: data.ownerId || 'public_school',
              kelas: data.kelas,
              siswaMap: data.siswaMap || {},
            });
          }
        }
        rebuildStudentsFromBundles();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'class_rosters')
    );

    const subjectsQuery = query(
      collection(db, 'subjects'),
      where('schoolId', '==', SCHOOL_ID)
    );
    const unsubSubjects = onSnapshot(
      subjectsQuery,
      { includeMetadataChanges: false },
      (snap) => {
        setDbSubjects((prev) => {
          const map = new Map<string, Subject>(prev.map((item) => [item.id, item]));
          for (const change of snap.docChanges()) {
            if (change.type === 'removed') {
              map.delete(change.doc.id);
            } else {
              map.set(change.doc.id, {
                id: change.doc.id,
                ...(change.doc.data() as Omit<Subject, 'id'>),
              });
            }
          }
          return Array.from(map.values());
        });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'subjects')
    );

    const examsQuery = query(
      collection(db, 'exams'),
      where('schoolId', '==', SCHOOL_ID)
    );
    const unsubExams = onSnapshot(
      examsQuery,
      { includeMetadataChanges: false },
      (snap) => {
        setExams((prev) => {
          const map = new Map<string, Exam>(prev.map((item) => [item.id, item]));
          for (const change of snap.docChanges()) {
            if (change.type === 'removed') {
              map.delete(change.doc.id);
            } else {
              map.set(change.doc.id, {
                id: change.doc.id,
                ...(change.doc.data() as Omit<Exam, 'id'>),
              });
            }
          }
          const list = Array.from(map.values());
          if (list.length > 0) {
            setSelectedExamId((curr) => (list.some((e) => e.id === curr) ? curr : list[0].id));
          } else {
            setSelectedExamId('');
          }
          return list;
        });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'exams')
    );

    const classResultsQuery = query(
      collection(db, 'class_results'),
      where('schoolId', '==', SCHOOL_ID)
    );
    const unsubClassResults = onSnapshot(
      classResultsQuery,
      { includeMetadataChanges: false },
      (snap) => {
        for (const change of snap.docChanges()) {
          if (change.type === 'removed') {
            resultBundlesRef.current.delete(change.doc.id);
          } else {
            const serverBundle = change.doc.data() as ClassResultBundleDoc;
            const localBundle = resultBundlesRef.current.get(change.doc.id);
            // Gabungkan dengan hasil scan lokal yang masih dalam antrean simpan
            const mergedHasilMap = pendingBundleIdsRef.current.has(change.doc.id) && localBundle
              ? { ...(serverBundle.hasilMap || {}), ...localBundle.hasilMap }
              : serverBundle.hasilMap || {};
            resultBundlesRef.current.set(change.doc.id, {
              schoolId: serverBundle.schoolId || SCHOOL_ID,
              ownerId: serverBundle.ownerId || 'public_school',
              examId: serverBundle.examId,
              kelas: serverBundle.kelas,
              mapel: serverBundle.mapel,
              hasilMap: mergedHasilMap,
            });
          }
        }
        rebuildResultsFromBundles();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'class_results')
    );

    return () => {
      unsubRosters();
      unsubSubjects();
      unsubExams();
      unsubClassResults();
    };
  }, [authReady, rebuildStudentsFromBundles, rebuildResultsFromBundles]);

  const selectedExam = exams.find((e) => e.id === selectedExamId) || exams[0] || null;
  const uniqueClasses = Array.from(new Set(students.map((s) => s.kelas))).sort();

  // Gabungan pilihan kelas lengkap (Kelas 10, 11, 12 + kelas dari siswa, ujian, dan hasil scan)
  const allClassOptions = React.useMemo(() => {
    const set = new Set<string>(['Kelas 10', 'Kelas 11', 'Kelas 12']);
    students.forEach((s) => {
      if (s.kelas) set.add(s.kelas);
    });
    exams.forEach((e) => {
      if (e.kelas) set.add(e.kelas);
    });
    results.forEach((r) => {
      if (r.kelas) set.add(r.kelas);
    });
    return Array.from(set);
  }, [students, exams, results]);

  // Daftar mapel terfilter sesuai pilihan Jenjang (Kelas 10, Kelas 11, Kelas 12)
  const printSubjectsByJenjang = React.useMemo(
    () => allSubjects.filter((s) => isSubjectMatchingJenjang(s, printJenjangFilter)),
    [allSubjects, printJenjangFilter]
  );

  const guruSubjectsByJenjang = React.useMemo(
    () => allSubjects.filter((s) => isSubjectMatchingJenjang(s, jenjangGuruFilter)),
    [allSubjects, jenjangGuruFilter]
  );

  useEffect(() => {
    if (printSubjectsByJenjang.length > 0) {
      if (!printSubjectsByJenjang.some((s) => s.namaMapel === printMapel)) {
        setPrintMapel(printSubjectsByJenjang[0].namaMapel);
      }
    }
  }, [printSubjectsByJenjang, printMapel]);

  useEffect(() => {
    if (guruSubjectsByJenjang.length > 0) {
      if (!guruSubjectsByJenjang.some((s) => s.namaMapel === mapelGuru)) {
        setMapelGuru(guruSubjectsByJenjang[0].namaMapel);
      }
    }
  }, [guruSubjectsByJenjang, mapelGuru]);

  // Sinkronkan filter kelas scan saat paket ujian diganti
  useEffect(() => {
    if (selectedExam?.kelas) {
      setScanKelasFilter(selectedExam.kelas);
    }
  }, [selectedExam?.id, selectedExam?.kelas]);

  // LOGIN ADMIN (sahidin30@gmail.com / 123456)
  function handleAdminLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = adminEmailInput.trim().toLowerCase();
    const cleanPass = adminPasswordInput.trim();

    if (cleanEmail === ADMIN_EMAIL && cleanPass === ADMIN_PASSWORD) {
      setIsAdminLoggedIn(true);
      sessionStorage.setItem('evalscan_admin_auth', 'true');
      setRoleMode('operator');
      setTab('operator');
      setShowAdminLoginModal(false);
      setAdminPasswordInput('');
      setAdminLoginError('');
      showNotification('Login Admin berhasil! Anda kini berada di Panel Admin & Operator.');
    } else {
      setAdminLoginError('Email atau password Admin salah. Gunakan email Admin yang terdaftar.');
    }
  }

  function handleAdminLogout() {
    setIsAdminLoggedIn(false);
    sessionStorage.removeItem('evalscan_admin_auth');
    setRoleMode('guru');
    setTab('rekap');
    showNotification('Keluar dari Mode Admin. Kembali ke Mode Guru (Tanpa Login).');
  }

  function handleRequestAdminMode() {
    if (isAdminLoggedIn) {
      setRoleMode('operator');
      setTab('operator');
    } else {
      setAdminLoginError('');
      setShowAdminLoginModal(true);
    }
  }

  // Simpan Mapel Baru ke Daftar & Cloud Firestore beserta Jenjang (Hemat Kuota: Cegah duplikat jika mapel sudah ada)
  async function saveNewSubjectRecord(
    namaMapelInput: string,
    kodeInput?: string,
    jenjangInput?: string
  ) {
    const cleanNama = namaMapelInput.trim().slice(0, 100);
    if (!cleanNama) return null;

    // Cek apakah mapel dengan nama yang sama sudah ada (0 Write jika sudah ada)
    const existing = allSubjects.find(
      (s) => s.namaMapel.toLowerCase() === cleanNama.toLowerCase()
    );
    if (existing && !kodeInput) {
      return existing.namaMapel;
    }

    const cleanKode = (
      kodeInput?.trim() ||
      cleanNama
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .slice(0, 6) ||
      cleanNama.slice(0, 4)
    )
      .toUpperCase()
      .slice(0, 20);
    const cleanJenjang = (
      jenjangInput && jenjangInput !== 'SEMUA' ? jenjangInput : 'Kelas 10, 11 & 12'
    ).slice(0, 40);

    const subId =
      existing?.id ||
      `sub_custom_${cleanKode.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now().toString(36)}`;

    await setDoc(doc(db, 'subjects', subId), {
      schoolId: SCHOOL_ID,
      ownerId: activeOwnerId,
      kode: cleanKode,
      namaMapel: cleanNama,
      jenjang: cleanJenjang,
      defaultSoal: 40,
      createdAt: serverTimestamp(),
    });

    const newSubObj: Subject = {
      id: subId,
      kode: cleanKode,
      namaMapel: cleanNama,
      jenjang: cleanJenjang,
      defaultSoal: 40,
    };

    setDbSubjects((prev) => {
      const filtered = prev.filter((item) => item.id !== subId);
      return [...filtered, newSubObj];
    });

    return cleanNama;
  }

  // ADMIN: Tambah Mata Pelajaran Baru beserta Pilihan Jenjang
  async function handleAddSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!newNamaMapel.trim()) {
      showNotification('Masukkan nama mata pelajaran baru.', 'warning');
      return;
    }
    setLoading(true);
    try {
      const savedName = await saveNewSubjectRecord(
        newNamaMapel,
        newKodeMapel || newNamaMapel.slice(0, 4),
        newJenjangMapel
      );
      if (savedName) {
        setPrintMapel(savedName);
        setMapelGuru(savedName);
        setNewKodeMapel('');
        setNewNamaMapel('');
        showNotification(
          `Mata pelajaran "${savedName}" (${newJenjangMapel}) berhasil ditambahkan!`
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'subjects');
    } finally {
      setLoading(false);
    }
  }

  // ADMIN: Mulai Edit Mapel (Kode, Nama Mapel, & Jenjang Kelas 10/11/12)
  function handleStartEditSubject(sub: Subject) {
    setEditingSubjectId(sub.id);
    setEditKodeMapel(sub.kode);
    setEditNamaMapel(sub.namaMapel);
    setEditJenjangMapel(sub.jenjang || 'Kelas 10, 11 & 12');
  }

  // ADMIN: Simpan Edit Mapel (Optimistic Update)
  async function handleSaveEditSubject(sub: Subject) {
    const cleanNama = editNamaMapel.trim().slice(0, 100);
    const cleanKode = (editKodeMapel.trim() || sub.kode).toUpperCase().slice(0, 20);
    const cleanJenjang = (editJenjangMapel || 'Kelas 10, 11 & 12').slice(0, 40);
    if (!cleanNama) {
      showNotification('Nama mata pelajaran tidak boleh kosong.', 'warning');
      return;
    }

    setLoading(true);
    try {
      await setDoc(doc(db, 'subjects', sub.id), {
        schoolId: SCHOOL_ID,
        ownerId: activeOwnerId,
        kode: cleanKode,
        namaMapel: cleanNama,
        jenjang: cleanJenjang,
        defaultSoal: 40,
        createdAt: serverTimestamp(),
      });

      const updatedSub: Subject = {
        id: sub.id,
        kode: cleanKode,
        namaMapel: cleanNama,
        jenjang: cleanJenjang,
        defaultSoal: 40,
      };
      setDbSubjects((prev) => [...prev.filter((item) => item.id !== sub.id), updatedSub]);

      if (printMapel === sub.namaMapel) setPrintMapel(cleanNama);
      if (mapelGuru === sub.namaMapel) setMapelGuru(cleanNama);
      setEditingSubjectId(null);
      showNotification(
        `Mata pelajaran berhasil diperbarui menjadi "${cleanNama} (${cleanKode}) — ${cleanJenjang}".`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `subjects/${sub.id}`);
    } finally {
      setLoading(false);
    }
  }

  // ADMIN: Hapus Mapel (Optimistic Update)
  async function handleDeleteSubject(sub: Subject) {
    const isBuiltIn = INDONESIAN_SUBJECTS.some((b) => b.id === sub.id);
    setLoading(true);
    try {
      if (isBuiltIn) {
        await setDoc(doc(db, 'subjects', sub.id), {
          schoolId: SCHOOL_ID,
          ownerId: activeOwnerId,
          kode: sub.kode,
          namaMapel: sub.namaMapel,
          jenjang: sub.jenjang || 'Kelas 10, 11 & 12',
          defaultSoal: 0,
          createdAt: serverTimestamp(),
        });
        setDbSubjects((prev) => [
          ...prev.filter((item) => item.id !== sub.id),
          { ...sub, defaultSoal: 0 },
        ]);
      } else {
        await deleteDoc(doc(db, 'subjects', sub.id));
        setDbSubjects((prev) => prev.filter((item) => item.id !== sub.id));
      }
      if (editingSubjectId === sub.id) {
        setEditingSubjectId(null);
      }
      showNotification(`Mata pelajaran "${sub.namaMapel}" telah dihapus dari daftar.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `subjects/${sub.id}`);
    } finally {
      setLoading(false);
    }
  }

  // ADMIN: Pulihkan Mapel Nasional Bawaan yang Terhapus (Batch Delete Hemat Kuota)
  async function handleRestoreDefaultSubjects() {
    const deletedDocs = dbSubjects.filter((s) => s.defaultSoal === 0);
    if (deletedDocs.length === 0) {
      showNotification('Seluruh mata pelajaran nasional sudah aktif.');
      return;
    }
    setLoading(true);
    try {
      const batch = writeBatch(db);
      for (const d of deletedDocs) {
        batch.delete(doc(db, 'subjects', d.id));
      }
      await batch.commit();
      const deletedIds = new Set(deletedDocs.map((d) => d.id));
      setDbSubjects((prev) => prev.filter((item) => !deletedIds.has(item.id)));
      showNotification(`${deletedDocs.length} mata pelajaran nasional berhasil dipulihkan.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'subjects');
    } finally {
      setLoading(false);
    }
  }

  // OPERATOR/ADMIN: Cetak Massal LJK Hemat Kertas Sesuai Kelas (1 Halaman A4 = 2 Siswa, Default 40 Soal)
  async function handleOperatorPrintLJK() {
    let activeMapel = printMapel;
    if (isCustomPrintMapel) {
      if (!customPrintMapelText.trim()) {
        showNotification('Mohon ketik nama mata pelajaran yang ingin dicetak.', 'warning');
        return;
      }
      const saved = await saveNewSubjectRecord(
        customPrintMapelText,
        undefined,
        printJenjangFilter
      );
      if (saved) {
        activeMapel = saved;
        setPrintMapel(saved);
        setIsCustomPrintMapel(false);
        setCustomPrintMapelText('');
      }
    }

    const chosenKelas = isCustomPrintKelas
      ? customPrintKelasText.trim() || 'Kelas 10'
      : printKelas;

    const dbClassStudents =
      chosenKelas === 'SEMUA'
        ? students
        : students.filter((s) => s.kelas === chosenKelas);

    const targetStudents =
      dbClassStudents.length > 0
        ? dbClassStudents
        : buildFallbackClassStudents(chosenKelas, printJumlahSiswaDefault);

    const matchingExam = exams.find(
      (ex) => ex.mapel === activeMapel && (chosenKelas === 'SEMUA' || ex.kelas === chosenKelas)
    );

    const ok = await generateTwoInOneLJKPdf({
      mapel: activeMapel,
      kelasLabel: chosenKelas,
      namaUjian: printJudulUjian.trim() || 'PENILAIAN SEKOLAH',
      students: targetStudents,
      exam: matchingExam || null,
      onNotify: (msg) => showNotification(msg, 'warning'),
    });

    if (ok) {
      const sheetCount = Math.ceil(targetStudents.length / 2);
      showNotification(
        `LJK PDF ${activeMapel} (${chosenKelas}) berhasil diunduh: ${targetStudents.length} LJK Siswa dalam ${sheetCount} Lembar A4!`
      );
    }
  }

  // ADMIN: Import Siswa dari Excel (1 Dokumen = 1 Kelas Penuh via /class_rosters — 24 Kelas hanya 24 Write!)
  async function handleImportStudents(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const parsed = await parseStudentsExcel(file);
      if (parsed.length === 0) {
        showNotification('File Excel kosong atau format kolom tidak sesuai.', 'warning');
        return;
      }

      const touchedRosterIds = new Set<string>();
      let importedCount = 0;

      for (const s of parsed) {
        const cleanPresensi = s.presensi.trim().padStart(2, '0').slice(0, 20);
        const cleanNama = s.nama.trim().slice(0, 120);
        const cleanKelas = s.kelas.trim().slice(0, 50);
        const rosterId = getRosterDocId(cleanKelas);
        const deterministicId = `stu_${cleanKelas.replace(/[^a-zA-Z0-9]/g, '_')}_${cleanPresensi.replace(/[^a-zA-Z0-9]/g, '_')}`;

        const existingBundle = rosterBundlesRef.current.get(rosterId) || {
          schoolId: SCHOOL_ID,
          ownerId: activeOwnerId,
          kelas: cleanKelas,
          siswaMap: {},
        };

        if (Object.keys(existingBundle.siswaMap).length < 115) {
          existingBundle.siswaMap[cleanPresensi] = {
            id: deterministicId,
            presensi: cleanPresensi,
            nama: cleanNama,
            kelas: cleanKelas,
          };
          rosterBundlesRef.current.set(rosterId, existingBundle);
          touchedRosterIds.add(rosterId);
          importedCount++;
        }
      }

      const batch = writeBatch(db);
      for (const rId of touchedRosterIds) {
        const bundle = rosterBundlesRef.current.get(rId);
        if (bundle) {
          batch.set(doc(db, 'class_rosters', rId), {
            schoolId: SCHOOL_ID,
            ownerId: activeOwnerId,
            kelas: bundle.kelas,
            siswaMap: bundle.siswaMap,
            updatedAt: serverTimestamp(),
          });
        }
      }

      await batch.commit();
      rebuildStudentsFromBundles();
      showNotification(
        `${importedCount} siswa dari ${touchedRosterIds.size} kelas berhasil diimpor hanya dengan ${touchedRosterIds.size} dokumen kelas (Hemat 97% Kuota)!`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'class_rosters');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  }

  // ADMIN: Tambah Siswa Manual ke Bundel Kelas (/class_rosters)
  async function handleAddStudentManual(e: React.FormEvent) {
    e.preventDefault();
    if (!newNama.trim() || !newKelas.trim()) {
      showNotification('Mohon lengkapi nama dan kelas siswa.', 'warning');
      return;
    }
    const cleanKelas = newKelas.trim().slice(0, 50);
    const rosterId = getRosterDocId(cleanKelas);
    const existingBundle = rosterBundlesRef.current.get(rosterId) || {
      schoolId: SCHOOL_ID,
      ownerId: activeOwnerId,
      kelas: cleanKelas,
      siswaMap: {},
    };

    const classStudentCount = Object.keys(existingBundle.siswaMap).length;
    const cleanPresensi = (newPresensi.trim() || String(classStudentCount + 1))
      .padStart(2, '0')
      .slice(0, 20);
    const cleanNama = newNama.trim().slice(0, 120);
    const deterministicId = `stu_${cleanKelas.replace(/[^a-zA-Z0-9]/g, '_')}_${cleanPresensi.replace(/[^a-zA-Z0-9]/g, '_')}`;

    const updatedSiswaMap: Record<string, Student> = {
      ...existingBundle.siswaMap,
      [cleanPresensi]: {
        id: deterministicId,
        presensi: cleanPresensi,
        nama: cleanNama,
        kelas: cleanKelas,
      },
    };

    setLoading(true);
    try {
      await setDoc(doc(db, 'class_rosters', rosterId), {
        schoolId: SCHOOL_ID,
        ownerId: activeOwnerId,
        kelas: cleanKelas,
        siswaMap: updatedSiswaMap,
        updatedAt: serverTimestamp(),
      });

      rosterBundlesRef.current.set(rosterId, {
        schoolId: SCHOOL_ID,
        ownerId: activeOwnerId,
        kelas: cleanKelas,
        siswaMap: updatedSiswaMap,
      });
      rebuildStudentsFromBundles();
      setNewPresensi('');
      setNewNama('');
      showNotification(`Siswa ${cleanNama} (${cleanKelas}) berhasil disimpan ke bundel kelas.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `class_rosters/${rosterId}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteStudent(id: string) {
    const target = students.find((s) => s.id === id);
    if (!target) return;
    const rosterId = getRosterDocId(target.kelas);
    const bundle = rosterBundlesRef.current.get(rosterId);
    if (!bundle) return;

    const updatedSiswaMap = { ...bundle.siswaMap };
    delete updatedSiswaMap[target.presensi];

    try {
      if (Object.keys(updatedSiswaMap).length === 0) {
        await deleteDoc(doc(db, 'class_rosters', rosterId));
        rosterBundlesRef.current.delete(rosterId);
      } else {
        await setDoc(doc(db, 'class_rosters', rosterId), {
          schoolId: SCHOOL_ID,
          ownerId: activeOwnerId,
          kelas: bundle.kelas,
          siswaMap: updatedSiswaMap,
          updatedAt: serverTimestamp(),
        });
        rosterBundlesRef.current.set(rosterId, {
          ...bundle,
          siswaMap: updatedSiswaMap,
        });
      }
      rebuildStudentsFromBundles();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `class_rosters/${rosterId}`);
    }
  }

  async function handleClearAllStudents() {
    if (rosterBundlesRef.current.size === 0) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      for (const rId of rosterBundlesRef.current.keys()) {
        batch.delete(doc(db, 'class_rosters', rId));
      }
      await batch.commit();
      rosterBundlesRef.current.clear();
      setStudents([]);
      setFilterKelasSiswa('SEMUA');
      showNotification('Seluruh daftar siswa kelas telah dikosongkan.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'class_rosters');
    } finally {
      setLoading(false);
    }
  }

  // GURU: Upload Kunci Jawaban dari Excel (ID Deterministik Mapel + Kelas agar memperbarui kunci tanpa duplikat)
  async function handleUploadKeyExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      let activeMapel = mapelGuru;
      if (isCustomGuruMapel) {
        if (!customGuruMapelText.trim()) {
          showNotification('Mohon ketik nama mata pelajaran terlebih dahulu.', 'warning');
          return;
        }
        const saved = await saveNewSubjectRecord(
          customGuruMapelText,
          undefined,
          jenjangGuruFilter
        );
        if (saved) {
          activeMapel = saved;
          setMapelGuru(saved);
          setIsCustomGuruMapel(false);
          setCustomGuruMapelText('');
        }
      }

      const rawKelas = isCustomGuruKelas ? customGuruKelasText.trim() : kelasGuru.trim();
      const targetKelas = (
        rawKelas ||
        (jenjangGuruFilter !== 'SEMUA' ? jenjangGuruFilter : uniqueClasses[0] || 'Kelas 10')
      ).slice(0, 50);

      const { kunciMap, jumlahSoal: total } = await parseAnswerKeyExcel(file, bobotPG, bobotPGK);
      if (total < 1 || total > 40) {
        showNotification('Jumlah soal pada Excel harus antara 1 sampai 40 soal.', 'warning');
        return;
      }
      const cleanNamaUjian = (namaUjian.trim() || 'Penilaian Sekolah').slice(0, 120);
      const cleanMapel = activeMapel.trim().slice(0, 100);
      const examDocId = `ex_${cleanMapel.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_${targetKelas.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;

      await setDoc(doc(db, 'exams', examDocId), {
        schoolId: SCHOOL_ID,
        ownerId: activeOwnerId,
        namaUjian: cleanNamaUjian,
        mapel: cleanMapel,
        kelas: targetKelas,
        jumlahSoal: total,
        kapasitasLjk: DEFAULT_LJK_CAPACITY,
        kunciJawaban: kunciMap,
        createdAt: serverTimestamp(),
      });

      const newExamObj: Exam = {
        id: examDocId,
        namaUjian: cleanNamaUjian,
        mapel: cleanMapel,
        kelas: targetKelas,
        jumlahSoal: total,
        kapasitasLjk: DEFAULT_LJK_CAPACITY,
        kunciJawaban: kunciMap,
      };
      setExams((prev) => [newExamObj, ...prev.filter((item) => item.id !== examDocId)]);
      setSelectedExamId(examDocId);
      setJumlahSoal(total);
      setIsCustomGuruKelas(false);
      showNotification(
        `Kunci jawaban ${cleanMapel} (${targetKelas} · ${total} soal aktif) berhasil disimpan!`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'exams');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  }

  // GURU: Simpan Kunci Jawaban Manual (ID Deterministik Mapel + Kelas agar Hemat Kuota)
  async function handleSaveExamManual() {
    let activeMapel = mapelGuru;
    if (isCustomGuruMapel) {
      if (!customGuruMapelText.trim()) {
        showNotification('Mohon ketik nama mata pelajaran terlebih dahulu.', 'warning');
        return;
      }
      const saved = await saveNewSubjectRecord(
        customGuruMapelText,
        undefined,
        jenjangGuruFilter
      );
      if (saved) {
        activeMapel = saved;
        setMapelGuru(saved);
        setIsCustomGuruMapel(false);
        setCustomGuruMapelText('');
      }
    }

    const rawKelas = isCustomGuruKelas ? customGuruKelasText.trim() : kelasGuru.trim();
    const targetKelas = (
      rawKelas ||
      (jenjangGuruFilter !== 'SEMUA' ? jenjangGuruFilter : uniqueClasses[0] || 'Kelas 10')
    ).slice(0, 50);
    if (!targetKelas) {
      showNotification('Mohon isi atau pilih Kelas terlebih dahulu.', 'warning');
      return;
    }

    const clampedSoal = Math.min(40, Math.max(1, Number(jumlahSoal) || 1));
    const tokens = kunciText.toUpperCase().split(/[\s,]+/).filter(Boolean);
    const kunciMap: Record<string, QuestionKey> = {};

    for (let i = 0; i < clampedSoal; i++) {
      const raw = (tokens[i] || 'A').replace(/[^A-E]/g, '');
      const answers = Array.from(new Set(raw.split('')));
      const isPgk = answers.length > 1;
      kunciMap[String(i + 1)] = {
        type: isPgk ? 'PGK' : 'PG',
        answers: answers.length > 0 ? answers : ['A'],
        weight: isPgk ? Math.max(1, Number(bobotPGK) || 6) : Math.max(1, Number(bobotPG) || 2),
      };
    }

    const cleanNamaUjian = (namaUjian.trim() || 'Penilaian Sekolah').slice(0, 120);
    const cleanMapel = activeMapel.trim().slice(0, 100);
    const examDocId = `ex_${cleanMapel.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_${targetKelas.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;

    setLoading(true);
    try {
      await setDoc(doc(db, 'exams', examDocId), {
        schoolId: SCHOOL_ID,
        ownerId: activeOwnerId,
        namaUjian: cleanNamaUjian,
        mapel: cleanMapel,
        kelas: targetKelas,
        jumlahSoal: clampedSoal,
        kapasitasLjk: DEFAULT_LJK_CAPACITY,
        kunciJawaban: kunciMap,
        createdAt: serverTimestamp(),
      });

      const newExamObj: Exam = {
        id: examDocId,
        namaUjian: cleanNamaUjian,
        mapel: cleanMapel,
        kelas: targetKelas,
        jumlahSoal: clampedSoal,
        kapasitasLjk: DEFAULT_LJK_CAPACITY,
        kunciJawaban: kunciMap,
      };
      setExams((prev) => [newExamObj, ...prev.filter((item) => item.id !== examDocId)]);
      setSelectedExamId(examDocId);
      setKelasGuru(targetKelas);
      setIsCustomGuruKelas(false);
      showNotification(
        `Kunci ${cleanMapel} (${targetKelas} · ${clampedSoal} soal aktif) tersimpan! Mesin scan otomatis menilai nomor 1–${clampedSoal}.`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'exams');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteExam(id: string) {
    try {
      await deleteDoc(doc(db, 'exams', id));
      setExams((prev) => {
        const next = prev.filter((e) => e.id !== id);
        if (selectedExamId === id) {
          setSelectedExamId(next[0]?.id || '');
        }
        return next;
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `exams/${id}`);
    }
  }

  async function handleDeleteResult(id?: string) {
    if (!id) return;
    const target = results.find((r) => r.id === id);
    if (!target) return;

    const bundleId = getClassResultBundleId(target.examId || '', target.kelas);
    const bundle = resultBundlesRef.current.get(bundleId);
    if (!bundle) return;

    const updatedHasilMap = { ...bundle.hasilMap };
    delete updatedHasilMap[target.presensi];

    try {
      if (Object.keys(updatedHasilMap).length === 0) {
        await deleteDoc(doc(db, 'class_results', bundleId));
        resultBundlesRef.current.delete(bundleId);
      } else {
        await setDoc(doc(db, 'class_results', bundleId), {
          schoolId: SCHOOL_ID,
          ownerId: activeOwnerId,
          examId: bundle.examId,
          kelas: bundle.kelas,
          mapel: bundle.mapel,
          hasilMap: updatedHasilMap,
          updatedAt: serverTimestamp(),
        });
        resultBundlesRef.current.set(bundleId, {
          ...bundle,
          hasilMap: updatedHasilMap,
        });
      }
      rebuildResultsFromBundles();
      if (inspectedResult?.id === id) {
        setInspectedResult(null);
      }
      showNotification('Data hasil LJK siswa telah dihapus dari bundel rekap kelas.');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `class_results/${bundleId}`);
    }
  }

  const filteredStudents =
    filterKelasSiswa === 'SEMUA'
      ? students
      : students.filter((s) => s.kelas === filterKelasSiswa);

  const activePrintClassLabel = isCustomPrintKelas
    ? customPrintKelasText.trim() || 'Kelas 10'
    : printKelas;

  const dbPrintTargetStudents =
    activePrintClassLabel === 'SEMUA'
      ? students
      : students.filter((s) => s.kelas === activePrintClassLabel);

  const printTargetCount =
    dbPrintTargetStudents.length > 0 ? dbPrintTargetStudents.length : printJumlahSiswaDefault;

  const filteredSubjectsCatalog = allSubjects.filter((s) => {
    const matchJenjang = isSubjectMatchingJenjang(s, filterJenjangAdmin);
    const matchSearch =
      s.namaMapel.toLowerCase().includes(searchMapel.toLowerCase()) ||
      s.kode.toLowerCase().includes(searchMapel.toLowerCase()) ||
      (s.jenjang || '').toLowerCase().includes(searchMapel.toLowerCase());
    return matchJenjang && matchSearch;
  });

  // Filter Hasil LJK di Tab Rekap berdasarkan Kelas, Mapel/Ujian, dan Pencarian
  const filteredResults = results.filter((r) => {
    const matchKelas = filterKelasRekap === 'SEMUA' || r.kelas === filterKelasRekap;
    const matchMapel =
      filterMapelRekap === 'SEMUA'
        ? true
        : r.examId === filterMapelRekap || r.mapel === filterMapelRekap;
    const matchSearch =
      r.nama.toLowerCase().includes(searchRekap.toLowerCase()) ||
      r.presensi.toLowerCase().includes(searchRekap.toLowerCase()) ||
      r.kelas.toLowerCase().includes(searchRekap.toLowerCase()) ||
      (r.mapel || '').toLowerCase().includes(searchRekap.toLowerCase());
    return matchKelas && matchMapel && matchSearch;
  });

  // Rekapitulasi Per Kelas (Ringkasan Kelas 10, Kelas 11, Kelas 12, dst.)
  const classSummaryBreakdown = React.useMemo(() => {
    return allClassOptions.map((kls) => {
      const classRows = results.filter(
        (r) =>
          r.kelas === kls &&
          (filterMapelRekap === 'SEMUA' ||
            r.examId === filterMapelRekap ||
            r.mapel === filterMapelRekap)
      );
      const count = classRows.length;
      const avg =
        count > 0
          ? Number((classRows.reduce((a, c) => a + c.skor, 0) / count).toFixed(1))
          : 0;
      const max = count > 0 ? Math.max(...classRows.map((c) => c.skor)) : 0;
      const min = count > 0 ? Math.min(...classRows.map((c) => c.skor)) : 0;
      const pass = classRows.filter((c) => c.skor >= 75).length;
      const passPct = count > 0 ? Math.round((pass / count) * 100) : 0;
      return {
        kelas: kls,
        count,
        avg,
        max,
        min,
        pass,
        passPct,
        rows: classRows,
      };
    });
  }, [allClassOptions, results, filterMapelRekap]);

  // Statistik Hasil LJK untuk Filter Aktif di Tab Rekap
  const avgScore =
    filteredResults.length > 0
      ? Number(
          (
            filteredResults.reduce((acc, curr) => acc + curr.skor, 0) /
            filteredResults.length
          ).toFixed(1)
        )
      : 0;
  const maxScore =
    filteredResults.length > 0
      ? Math.max(...filteredResults.map((r) => r.skor))
      : 0;
  const minScore =
    filteredResults.length > 0
      ? Math.min(...filteredResults.map((r) => r.skor))
      : 0;
  const passCount = filteredResults.filter((r) => r.skor >= 75).length;
  const passRate =
    filteredResults.length > 0
      ? Math.round((passCount / filteredResults.length) * 100)
      : 0;

  // Exam referensi untuk detail jawaban siswa
  const inspectedExam =
    (inspectedResult && exams.find((e) => e.id === inspectedResult.examId)) ||
    (filterMapelRekap !== 'SEMUA' && exams.find((e) => e.id === filterMapelRekap)) ||
    selectedExam;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 overflow-x-hidden">
      {/* Top Bar Contract: 3 Zones separated by gap-8 */}
      <div className="w-full bg-white border-b border-slate-200">
        <header className="max-w-5xl w-full mx-auto flex items-center justify-between gap-8 px-4 sm:px-6 py-3.5">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setTab(isAdminLoggedIn && roleMode === 'operator' ? 'operator' : 'rekap');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            EvalScan LJK
          </a>

          {/* Zone 2: Clean single-line text navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              onClick={() => setTab('rekap')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
                tab === 'rekap'
                  ? 'border-blue-600 text-slate-900 font-semibold'
                  : 'border-transparent'
              }`}
            >
              1. Hasil Ujian &amp; Rekap Kelas
            </button>
            <button
              onClick={() => setTab('ujian')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
                tab === 'ujian'
                  ? 'border-blue-600 text-slate-900 font-semibold'
                  : 'border-transparent'
              }`}
            >
              2. Kunci Soal &amp; Cetak LJK
            </button>
            <button
              onClick={() => setTab('scan')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
                tab === 'scan'
                  ? 'border-blue-600 text-slate-900 font-semibold'
                  : 'border-transparent'
              }`}
            >
              3. Scan Kamera HP
            </button>
            {isAdminLoggedIn && (
              <button
                onClick={() => {
                  setRoleMode('operator');
                  setTab('operator');
                }}
                className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
                  tab === 'operator'
                    ? 'border-slate-900 text-slate-900 font-semibold'
                    : 'border-transparent'
                }`}
              >
                4. Panel Admin &amp; Mapel
              </button>
            )}
          </nav>

          {/* Zone 3: 1 primary action (Login Admin / Keluar Admin) */}
          <div className="flex items-center gap-3 shrink-0">
            {isAdminLoggedIn ? (
              <button
                onClick={handleAdminLogout}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                Keluar Admin ({ADMIN_EMAIL.split('@')[0]})
              </button>
            ) : (
              <button
                onClick={() => {
                  setAdminLoginError('');
                  setShowAdminLoginModal(true);
                }}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 shrink-0" />
                Login Admin
              </button>
            )}
          </div>
        </header>
      </div>

      {/* Modal Login Admin (sahidin30@gmail.com / 123456) */}
      {showAdminLoginModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-900" />
                <h2 className="text-base font-bold text-slate-900">
                  Login Administrator / Operator
                </h2>
              </div>
              <button
                onClick={() => setShowAdminLoginModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Mode Guru dapat digunakan langsung tanpa login. Silakan masuk sebagai Admin untuk mengelola daftar mata pelajaran beserta jenjang (Kelas 10, 11, 12), data siswa, dan cetak massal LJK.
            </p>

            {adminLoginError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{adminLoginError}</span>
              </div>
            )}

            <form onSubmit={handleAdminLoginSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Admin
                </label>
                <input
                  type="email"
                  required
                  value={adminEmailInput}
                  onChange={(e) => setAdminEmailInput(e.target.value)}
                  placeholder="sahidin30@gmail.com"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Password Admin
                </label>
                <input
                  type="password"
                  required
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  placeholder="Masukkan password..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdminLoginModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Masuk Panel Admin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Content Container aligned flush with Header (max-w-5xl) */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Role & Workflow Banner */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-semibold text-blue-600">
              {roleMode === 'guru'
                ? 'Mode Guru Aktif (Tanpa Perlu Login) · Pilih Kelas Saat Cetak LJK, Scan Kamera HP & Rekap Nilai'
                : `Mode Admin Aktif (${ADMIN_EMAIL}) · Kelola Mapel Jenjang Kelas 10/11/12, Data Siswa & Cetak LJK Per Kelas`}
            </p>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {roleMode === 'guru'
                ? 'Portal Guru Mapel: Rekap Nilai Per Kelas, Kunci Soal & Scan LJK'
                : 'Panel Admin & Operator: Kelola Mapel (Kelas 10, 11, 12) & Cetak LJK'}
            </h1>
          </div>

          {/* Interactive Role Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl shrink-0">
            <button
              onClick={() => {
                setRoleMode('guru');
                if (tab === 'operator') setTab('rekap');
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                roleMode === 'guru'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5 shrink-0" />
              Mode Guru (Tanpa Login)
            </button>
            <button
              onClick={handleRequestAdminMode}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                roleMode === 'operator' && isAdminLoggedIn
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              {isAdminLoggedIn ? 'Panel Admin' : 'Login Admin'}
            </button>
          </div>
        </div>

        {/* Mobile Tab Switcher */}
        <div
          className={`grid ${
            isAdminLoggedIn ? 'grid-cols-4' : 'grid-cols-3'
          } gap-1.5 p-1 bg-slate-200/70 rounded-xl md:hidden text-xs`}
        >
          <button
            onClick={() => setTab('rekap')}
            className={`py-2 px-2 rounded-lg font-semibold whitespace-nowrap truncate transition-colors ${
              tab === 'rekap' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            1. Rekap Kelas
          </button>
          <button
            onClick={() => setTab('ujian')}
            className={`py-2 px-2 rounded-lg font-semibold whitespace-nowrap truncate transition-colors ${
              tab === 'ujian' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            2. Kunci &amp; LJK
          </button>
          <button
            onClick={() => setTab('scan')}
            className={`py-2 px-2 rounded-lg font-semibold whitespace-nowrap truncate transition-colors ${
              tab === 'scan' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            3. Scan HP
          </button>
          {isAdminLoggedIn && (
            <button
              onClick={() => {
                setRoleMode('operator');
                setTab('operator');
              }}
              className={`py-2 px-2 rounded-lg font-semibold whitespace-nowrap truncate transition-colors ${
                tab === 'operator' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              4. Admin
            </button>
          )}
        </div>

        {/* Notification Toast Banner */}
        {banner && (
          <div
            className={`p-3.5 rounded-xl border text-xs sm:text-sm font-medium flex items-center justify-between gap-3 ${
              banner.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {banner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              )}
              <span className="truncate">{banner.text}</span>
            </div>
            <button
              onClick={() => setBanner(null)}
              className="text-xs font-semibold underline opacity-75 hover:opacity-100 shrink-0"
            >
              Tutup
            </button>
          </div>
        )}

        {/* =====================================================================
            PANEL ADMIN / OPERATOR (SETELAH LOGIN ADMIN sahidin30@gmail.com)
           ===================================================================== */}
        {tab === 'operator' && isAdminLoggedIn && (
          <div className="space-y-5">
            {/* Section 1: MANAJEMEN DAFTAR MATA PELAJARAN & JENJANG KELAS 10, 11, 12 */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-blue-600 shrink-0" />
                    Manajemen Daftar Mata Pelajaran &amp; Jenjang ({filteredSubjectsCatalog.length} dari {allSubjects.length} Mapel)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Kelola mata pelajaran beserta pilihan Jenjang (<strong>Kelas 10</strong>, <strong>Kelas 11</strong>, dan <strong>Kelas 12</strong>): Tambah, Edit, atau Hapus.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {(['SEMUA', 'Kelas 10', 'Kelas 11', 'Kelas 12'] as const).map((jnj) => (
                    <button
                      key={jnj}
                      onClick={() => setFilterJenjangAdmin(jnj)}
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
                      onClick={handleRestoreDefaultSubjects}
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
                  onSubmit={handleAddSubject}
                  className="lg:col-span-9 grid grid-cols-1 sm:grid-cols-12 gap-2"
                >
                  <input
                    type="text"
                    value={newKodeMapel}
                    onChange={(e) => setNewKodeMapel(e.target.value)}
                    placeholder="Kode (mis: MTK)"
                    className="sm:col-span-2 border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-mono"
                  />
                  <input
                    type="text"
                    value={newNamaMapel}
                    onChange={(e) => setNewNamaMapel(e.target.value)}
                    placeholder="Ketik Nama Mata Pelajaran Baru..."
                    className="sm:col-span-5 min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-xs"
                  />
                  <select
                    value={newJenjangMapel}
                    onChange={(e) => setNewJenjangMapel(e.target.value)}
                    className="sm:col-span-3 border border-slate-300 bg-white rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-800"
                  >
                    {JENJANG_OPTIONS.map((j) => (
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
                    onChange={(e) => setSearchMapel(e.target.value)}
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
                                    onChange={(e) => setEditKodeMapel(e.target.value)}
                                    className="w-20 border border-blue-500 rounded px-2 py-1 text-xs font-mono font-semibold"
                                  />
                                ) : (
                                  <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                                    {sub.kode}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editNamaMapel}
                                    onChange={(e) => setEditNamaMapel(e.target.value)}
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
                                    onChange={(e) => setEditJenjangMapel(e.target.value)}
                                    className="w-full border border-blue-500 bg-white rounded px-2 py-1 text-xs font-semibold text-slate-800"
                                  >
                                    {JENJANG_OPTIONS.map((j) => (
                                      <option key={j} value={j}>
                                        {j}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md whitespace-nowrap">
                                    {jenjangLabel}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right">
                                {isEditing ? (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      onClick={() => handleSaveEditSubject(sub)}
                                      disabled={loading}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      Simpan
                                    </button>
                                    <button
                                      onClick={() => setEditingSubjectId(null)}
                                      className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                                      title="Batal"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      onClick={() => handleStartEditSubject(sub)}
                                      className="px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded inline-flex items-center gap-1 cursor-pointer"
                                      title="Edit mapel & jenjang"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleDeleteSubject(sub)}
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

            {/* Section 2: Cetak LJK Massal Hemat Kertas Per Kelas (1 Halaman A4 = 2 Siswa, Default 40 Soal) */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Printer className="w-4 h-4 text-blue-600 shrink-0" />
                    Cetak LJK Hemat Kertas Per Kelas (1 Halaman A4 = 2 Siswa · Default 40 Soal)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Pilih Kelas (Kelas 10, 11, 12 atau rombel) dan Mata Pelajaran untuk mengunduh PDF LJK siap cetak.
                  </p>
                </div>
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg whitespace-nowrap shrink-0 inline-flex items-center gap-1">
                  <Scissors className="w-3.5 h-3.5" />
                  Hemat 50% Kertas A4
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                {/* Form Pilih Kelas, Jenjang & Mapel */}
                <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
                  {/* Tombol Cepat Pilih Kelas Cetak LJK */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-800">
                        1. Pilih Kelas yang Akan Dicetak LJK-nya
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsCustomPrintKelas((prev) => !prev)}
                        className="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
                      >
                        {isCustomPrintKelas ? 'Pilih Tombol Kelas' : '+ Ketik Nama Kelas Lain'}
                      </button>
                    </div>

                    {isCustomPrintKelas ? (
                      <input
                        type="text"
                        value={customPrintKelasText}
                        onChange={(e) => setCustomPrintKelasText(e.target.value)}
                        placeholder="Ketik nama kelas (mis: Kelas 10-A / XI IPA 1 / XII IPS 2)..."
                        className="w-full border-2 border-blue-500 bg-blue-50/20 rounded-lg px-3 py-2 text-sm font-semibold text-slate-900"
                      />
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {allClassOptions.map((kls) => (
                          <button
                            key={kls}
                            type="button"
                            onClick={() => {
                              setPrintKelas(kls);
                              if (kls.includes('10')) setPrintJenjangFilter('Kelas 10');
                              else if (kls.includes('11')) setPrintJenjangFilter('Kelas 11');
                              else if (kls.includes('12')) setPrintJenjangFilter('Kelas 12');
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                              printKelas === kls
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {kls}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-slate-700">
                          2. Mata Pelajaran ({printSubjectsByJenjang.length})
                        </label>
                        <button
                          type="button"
                          onClick={() => setIsCustomPrintMapel((prev) => !prev)}
                          className="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
                        >
                          {isCustomPrintMapel ? 'Pilih Daftar' : '+ Ketik Sendiri'}
                        </button>
                      </div>
                      {isCustomPrintMapel ? (
                        <input
                          type="text"
                          value={customPrintMapelText}
                          onChange={(e) => setCustomPrintMapelText(e.target.value)}
                          placeholder="Ketik nama mapel..."
                          className="w-full border-2 border-blue-500 bg-blue-50/20 rounded-lg px-3 py-2 text-sm font-semibold text-slate-900"
                        />
                      ) : (
                        <select
                          value={printMapel}
                          onChange={(e) => setPrintMapel(e.target.value)}
                          className="w-full border border-slate-300 bg-white rounded-lg px-3 py-2 text-sm font-semibold text-slate-900"
                        >
                          {printSubjectsByJenjang.map((sub) => (
                            <option key={sub.id} value={sub.namaMapel}>
                              {sub.namaMapel} ({sub.kode})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="min-w-0">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        3. Jumlah Siswa Kelas {activePrintClassLabel}
                      </label>
                      {dbPrintTargetStudents.length > 0 ? (
                        <div className="w-full border border-emerald-200 bg-emerald-50/60 rounded-lg px-3 py-2 text-xs font-semibold text-emerald-900">
                          Terdaftar {dbPrintTargetStudents.length} Siswa di Database
                        </div>
                      ) : (
                        <input
                          type="number"
                          min={2}
                          max={60}
                          value={printJumlahSiswaDefault}
                          onChange={(e) => setPrintJumlahSiswaDefault(Number(e.target.value))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono font-semibold"
                        />
                      )}
                    </div>

                    <div className="sm:col-span-2 min-w-0">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        4. Judul Kegiatan Ujian pada Header LJK
                      </label>
                      <input
                        type="text"
                        value={printJudulUjian}
                        onChange={(e) => setPrintJudulUjian(e.target.value)}
                        placeholder="PENILAIAN AKHIR SEMESTER"
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  {/* Ringkasan Kertas */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-3 gap-3 text-xs">
                    <div className="min-w-0">
                      <span className="text-slate-500 block">Mapel &amp; Kelas</span>
                      <strong className="text-slate-900 text-sm truncate block">
                        {isCustomPrintMapel
                          ? customPrintMapelText || 'Mapel Baru'
                          : printMapel}{' '}
                        ({activePrintClassLabel})
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Jumlah LJK Siswa</span>
                      <strong className="text-slate-900 text-sm font-mono tabular-nums">
                        {printTargetCount} Siswa
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Kebutuhan Kertas A4</span>
                      <strong className="text-emerald-700 text-sm font-mono tabular-nums">
                        {Math.ceil(printTargetCount / 2)} Lembar A4
                      </strong>
                    </div>
                  </div>

                  <button
                    onClick={handleOperatorPrintLJK}
                    className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <FileDown className="w-4 h-4 shrink-0" />
                    Download LJK PDF:{' '}
                    {isCustomPrintMapel ? customPrintMapelText || 'Mapel' : printMapel} —{' '}
                    {activePrintClassLabel} (1 A4 = 2 Siswa)
                  </button>
                </div>

                {/* Visualisasi Tata Letak 1 Halaman A4 = 2 LJK Siswa Berwarna & Anti-Tabrakan */}
                <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">
                      Preview LJK Berwarna 2-in-1 A4 (Anti-Tabrakan)
                    </span>
                    <span className="font-mono text-slate-500">210 × 297 mm</span>
                  </div>

                  <div className="bg-white border border-slate-300 rounded-lg p-3 space-y-2.5 text-[11px]">
                    {/* Preview LJK 1 */}
                    <div className="border border-blue-200 rounded-lg overflow-hidden bg-white">
                      <div className="bg-blue-700 text-white px-2.5 py-1 flex items-center justify-between border-b-2 border-emerald-500">
                        <span className="font-bold text-[10px] tracking-wide">
                          LEMBAR JAWABAN KOMPUTER (LJK)
                        </span>
                        <span className="text-[9px] font-mono text-emerald-200">
                          40 SOAL · QR
                        </span>
                      </div>
                      <div className="p-2 grid grid-cols-12 gap-1.5 text-[10px] bg-blue-50/30">
                        <div className="col-span-8 border border-blue-100 bg-white rounded px-1.5 py-1 truncate">
                          <span className="text-[8px] font-bold text-blue-700 block">NAMA SISWA</span>
                          <strong className="text-slate-900 truncate block">
                            {dbPrintTargetStudents[0]?.nama || `Peserta ${activePrintClassLabel} - No. 01`}
                          </strong>
                        </div>
                        <div className="col-span-4 border border-blue-100 bg-white rounded px-1.5 py-1 truncate">
                          <span className="text-[8px] font-bold text-blue-700 block">KELAS / NO</span>
                          <strong className="text-slate-900 font-mono truncate block">
                            {activePrintClassLabel} · 01
                          </strong>
                        </div>
                        <div className="col-span-12 border border-blue-100 bg-white rounded px-1.5 py-1 flex items-center justify-between gap-2">
                          <span className="text-[8px] font-bold text-blue-700 shrink-0">MAPEL:</span>
                          <strong className="text-blue-900 truncate">
                            {isCustomPrintMapel ? customPrintMapelText || 'MAPEL' : printMapel}
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-slate-400 py-0.5">
                      <div className="flex-1 border-t border-dashed border-slate-300" />
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Scissors className="w-3 h-3" /> Garis Potong Tengah A4
                      </span>
                      <div className="flex-1 border-t border-dashed border-slate-300" />
                    </div>

                    {/* Preview LJK 2 */}
                    <div className="border border-blue-200 rounded-lg overflow-hidden bg-white">
                      <div className="bg-blue-700 text-white px-2.5 py-1 flex items-center justify-between border-b-2 border-emerald-500">
                        <span className="font-bold text-[10px] tracking-wide">
                          LEMBAR JAWABAN KOMPUTER (LJK)
                        </span>
                        <span className="text-[9px] font-mono text-emerald-200">
                          40 SOAL · QR
                        </span>
                      </div>
                      <div className="p-2 grid grid-cols-12 gap-1.5 text-[10px] bg-blue-50/30">
                        <div className="col-span-8 border border-blue-100 bg-white rounded px-1.5 py-1 truncate">
                          <span className="text-[8px] font-bold text-blue-700 block">NAMA SISWA</span>
                          <strong className="text-slate-900 truncate block">
                            {dbPrintTargetStudents[1]?.nama || `Peserta ${activePrintClassLabel} - No. 02`}
                          </strong>
                        </div>
                        <div className="col-span-4 border border-blue-100 bg-white rounded px-1.5 py-1 truncate">
                          <span className="text-[8px] font-bold text-blue-700 block">KELAS / NO</span>
                          <strong className="text-slate-900 font-mono truncate block">
                            {activePrintClassLabel} · 02
                          </strong>
                        </div>
                        <div className="col-span-12 border border-blue-100 bg-white rounded px-1.5 py-1 flex items-center justify-between gap-2">
                          <span className="text-[8px] font-bold text-blue-700 shrink-0">MAPEL:</span>
                          <strong className="text-blue-900 truncate">
                            {isCustomPrintMapel ? customPrintMapelText || 'MAPEL' : printMapel}
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Master Data Siswa & Kelas */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
              <div className="lg:col-span-5 min-w-0 flex flex-col justify-between gap-5">
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-blue-600 shrink-0" />
                        Input Data Siswa &amp; Kelas
                      </h3>
                      <button
                        onClick={downloadStudentTemplateExcel}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Template Excel
                      </button>
                    </div>

                    <label className="flex items-center justify-center gap-2 w-full py-3 px-3 border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/40 rounded-xl cursor-pointer transition-colors text-xs font-semibold text-slate-700">
                      <FileSpreadsheet className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>Upload Excel Daftar Siswa (.xlsx)</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleImportStudents}
                        disabled={loading}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <form
                    onSubmit={handleAddStudentManual}
                    className="space-y-2.5 pt-3 border-t border-slate-100"
                  >
                    <p className="text-xs font-bold text-slate-700">Atau Tambah Siswa Manual:</p>
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono"
                        value={newPresensi}
                        onChange={(e) => setNewPresensi(e.target.value)}
                        placeholder="No. Presensi"
                      />
                      <input
                        list="jenjang-kelas-list"
                        className="col-span-2 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs"
                        value={newKelas}
                        onChange={(e) => setNewKelas(e.target.value)}
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
                        onChange={(e) => setNewNama(e.target.value)}
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
              <div className="lg:col-span-7 min-w-0 overflow-hidden bg-white border border-slate-200 rounded-xl p-5 flex flex-col space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Users className="w-4 h-4 text-blue-600 shrink-0" />
                      Database Induk Siswa ({filteredStudents.length})
                    </h3>
                    <p className="text-xs text-slate-500">
                      Daftar kelas otomatis terbentuk sesuai data siswa yang diinput Admin
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {students.length > 0 && (
                      <>
                        <button
                          onClick={() => setFilterKelasSiswa('SEMUA')}
                          className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                            filterKelasSiswa === 'SEMUA'
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Semua
                        </button>
                        {uniqueClasses.map((kls) => (
                          <button
                            key={kls}
                            onClick={() => setFilterKelasSiswa(kls)}
                            className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                              filterKelasSiswa === kls
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {kls}
                          </button>
                        ))}
                        <button
                          onClick={handleClearAllStudents}
                          disabled={loading}
                          className="px-2.5 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors cursor-pointer"
                          title="Kosongkan seluruh data siswa"
                        >
                          Kosongkan
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {filteredStudents.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-14 px-4 text-center border border-dashed border-slate-200 rounded-xl space-y-2">
                    <Users className="w-8 h-8 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-700">
                      Belum Ada Data Siswa &amp; Kelas
                    </p>
                    <p className="text-xs text-slate-500 max-w-sm">
                      Silakan upload file Excel daftar siswa sekolah Anda (<span className="font-mono">Presensi | Nama | Kelas</span>) atau tambahkan siswa secara manual di sebelah kiri.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto flex-1">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50">
                          <th className="py-2.5 px-3 text-left font-semibold w-20">Presensi</th>
                          <th className="py-2.5 px-3 text-left font-semibold">Nama Siswa</th>
                          <th className="py-2.5 px-3 text-left font-semibold w-24">Kelas</th>
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
                            <td className="py-2.5 px-3 text-slate-600">{s.kelas}</td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                onClick={() => handleDeleteStudent(s.id)}
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
        )}

        {/* =====================================================================
            TAB GURU 2: KUNCI SOAL GURU & CETAK LJK PER KELAS
           ===================================================================== */}
        {tab === 'ujian' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Left Column: Guru Input Soal, Kelas & Kunci */}
            <div className="lg:col-span-6 min-w-0 overflow-hidden bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-slate-900 truncate">
                      Pengaturan Kelas, Mapel &amp; Kunci Soal Guru
                    </h2>
                    <p className="text-xs text-slate-500">
                      Pilih Kelas (Kelas 10, 11, 12 atau rombel) &amp; Mata Pelajaran, lalu atur jumlah soal aktif
                    </p>
                  </div>
                  <button
                    onClick={downloadAnswerKeyTemplateExcel}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 shrink-0 cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    Template Kunci
                  </button>
                </div>

                {/* 1. Pilihan Cepat Kelas (Kelas 10, 11, 12 atau Ketik Rombel) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-800">
                      1. Pilih Kelas Ujian &amp; Cetak LJK
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCustomGuruKelas((prev) => !prev)}
                      className="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
                    >
                      {isCustomGuruKelas ? 'Pilih Tombol Kelas' : '+ Ketik Nama Kelas / Rombel'}
                    </button>
                  </div>
                  {isCustomGuruKelas ? (
                    <input
                      type="text"
                      value={customGuruKelasText}
                      onChange={(e) => setCustomGuruKelasText(e.target.value)}
                      placeholder="Ketik kelas (mis: Kelas 10-A / XI MIPA 1 / XII IPS 2)..."
                      className="w-full border-2 border-blue-500 bg-blue-50/20 rounded-lg px-3 py-2 text-sm font-semibold text-slate-900"
                    />
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {allClassOptions.map((kls) => (
                        <button
                          key={kls}
                          type="button"
                          onClick={() => {
                            setKelasGuru(kls);
                            if (kls.includes('10')) setJenjangGuruFilter('Kelas 10');
                            else if (kls.includes('11')) setJenjangGuruFilter('Kelas 11');
                            else if (kls.includes('12')) setJenjangGuruFilter('Kelas 12');
                          }}
                          className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                            kelasGuru === kls
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {kls}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="col-span-2 sm:col-span-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        2. Mata Pelajaran ({guruSubjectsByJenjang.length})
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsCustomGuruMapel((prev) => !prev)}
                        className="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
                      >
                        {isCustomGuruMapel ? 'Pilih Daftar' : '+ Ketik Sendiri'}
                      </button>
                    </div>
                    {isCustomGuruMapel ? (
                      <input
                        type="text"
                        value={customGuruMapelText}
                        onChange={(e) => setCustomGuruMapelText(e.target.value)}
                        placeholder="Ketik nama mapel..."
                        className="w-full border-2 border-blue-500 bg-blue-50/20 rounded-lg px-3 py-2 text-sm font-semibold text-slate-900"
                      />
                    ) : (
                      <select
                        className="w-full border border-slate-300 bg-white rounded-lg px-3 py-2 text-sm font-semibold text-slate-900"
                        value={mapelGuru}
                        onChange={(e) => setMapelGuru(e.target.value)}
                      >
                        {guruSubjectsByJenjang.map((sub) => (
                          <option key={sub.id} value={sub.namaMapel}>
                            {sub.namaMapel}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="col-span-2 sm:col-span-1 min-w-0">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Filter Jenjang Mapel
                    </label>
                    <select
                      className="w-full border border-slate-300 bg-white rounded-lg px-3 py-2 text-sm font-semibold text-slate-900"
                      value={jenjangGuruFilter}
                      onChange={(e) => setJenjangGuruFilter(e.target.value)}
                    >
                      <option value="Kelas 10">Mapel Jenjang Kelas 10</option>
                      <option value="Kelas 11">Mapel Jenjang Kelas 11</option>
                      <option value="Kelas 12">Mapel Jenjang Kelas 12</option>
                      <option value="SEMUA">Semua Jenjang (10, 11, 12)</option>
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Nama Ujian
                    </label>
                    <input
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                      value={namaUjian}
                      onChange={(e) => setNamaUjian(e.target.value)}
                      placeholder="PAS Semester Ganjil"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-xs font-bold text-blue-700 mb-1">
                      Jumlah Soal Dipakai (dari 40)
                    </label>
                    <input
                      className="w-full border-2 border-blue-500 bg-blue-50/30 rounded-lg px-3 py-1.5 text-sm font-bold font-mono tabular-nums text-slate-900"
                      type="number"
                      min={1}
                      max={40}
                      value={jumlahSoal}
                      onChange={(e) => setJumlahSoal(Number(e.target.value))}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Bobot Poin PG
                    </label>
                    <input
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                      type="number"
                      min={1}
                      value={bobotPG}
                      onChange={(e) => setBobotPG(Number(e.target.value))}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Bobot Poin PGK
                    </label>
                    <input
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                      type="number"
                      min={1}
                      value={bobotPGK}
                      onChange={(e) => setBobotPGK(Number(e.target.value))}
                    />
                  </div>
                </div>

                {/* Opsi A: Upload Excel Kunci */}
                <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2.5">
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-blue-950">
                      Opsi A — Upload Excel Kunci Jawaban Guru (.xlsx)
                    </p>
                    <p className="text-xs text-blue-800 leading-relaxed">
                      Jumlah baris soal di Excel Anda otomatis menjadi batas soal aktif saat pemindaian kamera.
                    </p>
                  </div>
                  <label className="inline-flex items-center justify-center gap-2 w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors">
                    <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                    <span>Pilih File Excel Kunci Jawaban (.xlsx)</span>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleUploadKeyExcel}
                      disabled={loading}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Opsi B: Ketik Manual */}
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <label className="block text-xs font-bold text-slate-800">
                    Opsi B — Ketik Kunci Jawaban ({jumlahSoal} Soal Aktif · 1 huruf = PG, &gt;1 huruf = PGK)
                  </label>
                  <textarea
                    className="w-full border border-slate-300 p-2.5 rounded-lg font-mono text-xs leading-relaxed resize-none"
                    rows={3}
                    value={kunciText}
                    onChange={(e) => setKunciText(e.target.value)}
                    placeholder="Ketik kunci dipisah spasi, misal: A C B D E ... AC BDE"
                  />
                </div>
              </div>

              <button
                onClick={handleSaveExamManual}
                disabled={loading}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white py-2.5 px-4 rounded-lg font-semibold text-xs sm:text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                Simpan Kunci{' '}
                {isCustomGuruMapel ? customGuruMapelText || 'Mapel Baru' : mapelGuru} —{' '}
                {isCustomGuruKelas ? customGuruKelasText || 'Kelas Baru' : kelasGuru} ({jumlahSoal}{' '}
                Soal Aktif)
              </button>
            </div>

            {/* Right Column: Daftar Kunci Mapel & Cetak LJK 2-in-1 Sesuai Kelas */}
            <div className="lg:col-span-6 min-w-0 flex flex-col justify-between gap-5">
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className="truncate">
                        Daftar Kunci Mapel &amp; Cetak LJK Per Kelas ({exams.length})
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500">
                      Unduh LJK PDF (1 A4 = 2 Siswa) sesuai kelas yang dipilih
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs shrink-0">
                    <span className="text-slate-500">Jml Siswa/Kelas:</span>
                    <input
                      type="number"
                      min={2}
                      max={60}
                      value={guruPrintJumlahSiswa}
                      onChange={(e) => setGuruPrintJumlahSiswa(Number(e.target.value))}
                      className="w-16 border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono font-bold text-center"
                      title="Jumlah LJK siswa jika kelas belum memiliki daftar siswa di database"
                    />
                  </div>
                </div>

                {exams.length === 0 ? (
                  <div className="py-10 text-center border border-dashed border-slate-200 rounded-xl space-y-1.5">
                    <p className="text-sm font-semibold text-slate-700">
                      Belum Ada Kunci Jawaban Tersimpan
                    </p>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto">
                      Silakan pilih Kelas (Kelas 10, 11, atau 12) dan Mata Pelajaran di sebelah kiri, lalu simpan kunci jawaban.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {exams.map((ex) => {
                      const dbClassStudents = students.filter((s) => s.kelas === ex.kelas);
                      const studentCountLabel =
                        dbClassStudents.length > 0
                          ? `${dbClassStudents.length} Siswa DB`
                          : `${guruPrintJumlahSiswa} LJK`;
                      const pgkCount = Object.values(ex.kunciJawaban || {}).filter(
                        (k) => k.type === 'PGK'
                      ).length;
                      const isSelected = selectedExam?.id === ex.id;

                      return (
                        <div
                          key={ex.id}
                          onClick={() => setSelectedExamId(ex.id)}
                          className={`p-3.5 border rounded-xl transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0 ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50/30'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-900 rounded text-xs font-bold shrink-0">
                                {ex.kelas}
                              </span>
                              <p className="font-bold text-sm text-slate-900 truncate">
                                {ex.mapel}
                              </p>
                            </div>
                            <p className="text-xs text-slate-500 truncate">
                              {ex.namaUjian} · <strong>{ex.jumlahSoal} Soal Aktif</strong> (dari 40 Default LJK) · {pgkCount} PGK* · {studentCountLabel}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
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
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                            >
                              <FileDown className="w-3.5 h-3.5 shrink-0" />
                              Cetak LJK ({ex.kelas})
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteExam(ex.id);
                              }}
                              title="Hapus paket ujian"
                              className="p-2 text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Rincian Kunci Jawaban Paket Terpilih */}
              {selectedExam && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 flex-1">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 truncate">
                        Kunci Aktif: {selectedExam.mapel} ({selectedExam.kelas})
                      </h3>
                      <p className="text-xs text-slate-500">
                        Dinilai Nomor 01 s.d. {String(selectedExam.jumlahSoal).padStart(2, '0')} · Nomor {selectedExam.jumlahSoal + 1}–40 pada LJK otomatis diabaikan saat scan
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 text-xs font-mono">
                    {Array.from({ length: selectedExam.jumlahSoal }, (_, i) => {
                      const qNo = String(i + 1);
                      const k = selectedExam.kunciJawaban[qNo];
                      if (!k) return null;
                      const isPgk = k.type === 'PGK';
                      return (
                        <div
                          key={qNo}
                          className={`px-2 py-1.5 rounded-lg border flex items-center justify-between gap-1 min-w-0 overflow-hidden ${
                            isPgk
                              ? 'bg-blue-50/60 border-blue-200 text-blue-950'
                              : 'bg-slate-50 border-slate-200 text-slate-800'
                          }`}
                        >
                          <span className="text-slate-500 shrink-0">
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
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB GURU 3: SCANNER KAMERA HP (PILIH KELAS & MAPEL AGAR REKAPAN RAPI)
           ===================================================================== */}
        {tab === 'scan' && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <ScanLine className="w-5 h-5 text-blue-600 shrink-0" />
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-slate-900">
                      Pilih Kelas &amp; Mata Pelajaran yang Akan Dipindai
                    </h2>
                    <p className="text-xs text-slate-500">
                      Pilih kelas terlebih dahulu agar setiap LJK yang dipindai otomatis tersusun rapi di Rekap Kelas
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                {/* Langkah 1: Pilih Kelas Scan */}
                <div className="lg:col-span-6 space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    1. Pilih Kelas yang Sedang Dipindai
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {allClassOptions.map((kls) => (
                      <button
                        key={kls}
                        type="button"
                        onClick={() => {
                          setScanKelasFilter(kls);
                          const matchingExam = exams.find((e) => e.kelas === kls);
                          if (matchingExam) {
                            setSelectedExamId(matchingExam.id);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                          scanKelasFilter === kls
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {kls}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Langkah 2: Pilih Paket Kunci Soal / Mapel */}
                <div className="lg:col-span-6 space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    2. Pilih Kunci Mata Pelajaran Aktif
                  </label>
                  {exams.length > 0 ? (
                    <select
                      className="w-full border border-slate-300 bg-white px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold text-slate-900 truncate"
                      value={selectedExam?.id || ''}
                      onChange={(e) => {
                        setSelectedExamId(e.target.value);
                        const found = exams.find((ex) => ex.id === e.target.value);
                        if (found?.kelas) setScanKelasFilter(found.kelas);
                      }}
                    >
                      {exams.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          {ex.mapel} — Kunci {ex.kelas} (Dinilai {ex.jumlahSoal} dari 40 Soal)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Belum ada kunci soal. Buat kunci soal terlebih dahulu di tab 2.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {selectedExam ? (
              <CameraScanner
                exam={selectedExam}
                activeKelas={scanKelasFilter}
                classOptions={allClassOptions}
                onChangeActiveKelas={(kls) => setScanKelasFilter(kls)}
                students={students}
                onResultSaved={async (res) => {
                  const cleanStudentId = res.studentId
                    .replace(/[^a-zA-Z0-9_\-]/g, '_')
                    .slice(0, 128);
                  const targetSavedKelas = (res.kelas || scanKelasFilter || selectedExam.kelas).slice(
                    0,
                    50
                  );
                  const cleanPresensi = res.presensi.slice(0, 20);
                  const resultDocId = `res_${selectedExam.id}_${targetSavedKelas.replace(/[^a-zA-Z0-9]/g, '_')}_${cleanPresensi.replace(/[^a-zA-Z0-9]/g, '_')}`;
                  const bundleId = getClassResultBundleId(selectedExam.id, targetSavedKelas);

                  // 1. Tampilkan nilai siswa seketika di layar & siap di-download ke Excel (0 ms delay)
                  const storedEntry: StoredStudentResult = {
                    id: resultDocId,
                    examId: selectedExam.id,
                    studentId: cleanStudentId,
                    presensi: cleanPresensi,
                    nama: res.nama.slice(0, 120),
                    kelas: targetSavedKelas,
                    mapel: selectedExam.mapel.slice(0, 100),
                    benar: res.benar,
                    salah: res.salah,
                    kosong: res.kosong,
                    skor: res.skor,
                    statusRagu: res.statusRagu,
                    detailJawaban: res.detailJawaban,
                  };

                  if (res.previewImage) {
                    previewImagesRef.current.set(resultDocId, res.previewImage);
                  }

                  const existingBundle = resultBundlesRef.current.get(bundleId) || {
                    schoolId: SCHOOL_ID,
                    ownerId: activeOwnerId,
                    examId: selectedExam.id,
                    kelas: targetSavedKelas,
                    mapel: selectedExam.mapel.slice(0, 100),
                    hasilMap: {},
                  };

                  resultBundlesRef.current.set(bundleId, {
                    ...existingBundle,
                    ownerId: activeOwnerId,
                    hasilMap: {
                      ...existingBundle.hasilMap,
                      [cleanPresensi]: storedEntry,
                    },
                  });

                  rebuildResultsFromBundles();
                  setFilterKelasRekap(targetSavedKelas);

                  // 2. Masukkan ke Antrean Bundel Kelas-Mapel (Otomatis digabung dalam 1 Write per Kelas setelah jeda 1.5 detik)
                  pendingBundleIdsRef.current.add(bundleId);
                  setPendingSyncCount(pendingBundleIdsRef.current.size);
                  if (flushTimerRef.current !== null) {
                    window.clearTimeout(flushTimerRef.current);
                  }
                  flushTimerRef.current = window.setTimeout(() => {
                    flushPendingResultBundles();
                  }, 1500);

                  showNotification(
                    `Nilai LJK ${res.nama} (${targetSavedKelas} • ${selectedExam.mapel} • Skor: ${res.skor}) langsung terekap di layar & bundel kelas!`
                  );
                }}
              />
            ) : (
              <div className="p-10 bg-white border border-slate-200 rounded-xl text-center space-y-3">
                <p className="text-sm font-semibold text-slate-800">
                  Belum Ada Kunci Jawaban Mata Pelajaran untuk Dipindai
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Silakan buat kunci jawaban terlebih dahulu pada tab <strong>2. Kunci Soal &amp; Cetak LJK</strong> agar pemindai kamera mengetahui jumlah soal aktif dan kunci jawabannya.
                </p>
                <button
                  onClick={() => setTab('ujian')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Buat Kunci Soal Guru Sekarang
                </button>
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            TAB GURU 1 (MODE AWAL TANPA LOGIN): HASIL UJIAN & REKAP PER KELAS
           ===================================================================== */}
        {tab === 'rekap' && (
          <div className="space-y-5">
            {/* Top Filter Kelas, Mapel & Export Bar */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="truncate">
                      Rekapitulasi Hasil Ujian LJK Per Kelas ({filterKelasRekap === 'SEMUA' ? 'Semua Kelas' : filterKelasRekap})
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Pilih tombol Kelas di bawah untuk menyaring rekap nilai, melihat rapor LJK tiap siswa, atau mengunduh Excel per kelas
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={filterMapelRekap}
                    onChange={(e) => setFilterMapelRekap(e.target.value)}
                    className="border border-slate-300 bg-white px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-800"
                  >
                    <option value="SEMUA">Semua Mata Pelajaran ({results.length} Hasil)</option>
                    {exams.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.mapel} — {ex.kelas} ({ex.jumlahSoal} Soal)
                      </option>
                    ))}
                  </select>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchRekap}
                      onChange={(e) => setSearchRekap(e.target.value)}
                      placeholder="Cari nama/presensi..."
                      className="w-36 sm:w-44 pl-8 pr-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>

                  <button
                    onClick={() => {
                      if (filteredResults.length === 0) {
                        showNotification('Belum ada data hasil LJK pada kelas ini untuk diunduh.', 'warning');
                        return;
                      }
                      const activeExamObj =
                        (filterMapelRekap !== 'SEMUA' &&
                          exams.find((e) => e.id === filterMapelRekap)) ||
                        selectedExam;
                      const soalCount = activeExamObj?.jumlahSoal || 25;
                      const labelMapel = activeExamObj?.mapel || 'Semua_Mapel';
                      const labelKelas = filterKelasRekap === 'SEMUA' ? 'Semua_Kelas' : filterKelasRekap;
                      exportResultsToExcel(`${labelMapel}_${labelKelas}`, filteredResults, soalCount);
                      showNotification(
                        `Rekap Nilai Excel (${labelKelas}) lengkap dengan rincian jawaban berhasil diunduh!`
                      );
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <FileDown className="w-3.5 h-3.5 shrink-0" />
                    Download Excel ({filterKelasRekap === 'SEMUA' ? 'Semua Kelas' : filterKelasRekap})
                  </button>
                </div>
              </div>

              {/* Tombol Cepat Filter Per Kelas */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setFilterKelasRekap('SEMUA')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    filterKelasRekap === 'SEMUA'
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Semua Kelas ({results.length})
                </button>
                {classSummaryBreakdown.map((item) => (
                  <button
                    key={item.kelas}
                    onClick={() => setFilterKelasRekap(item.kelas)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                      filterKelasRekap === item.kelas
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>{item.kelas}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                        filterKelasRekap === item.kelas
                          ? 'bg-blue-800 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {item.count}
                    </span>
                  </button>
                ))}
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

              {/* Tabel Ringkasan Rekap Per Kelas (Kelas 10, Kelas 11, Kelas 12, dst.) */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">
                    Ringkasan Perbandingan Nilai Antar Kelas
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Klik baris kelas untuk menyaring tabel siswa di bawah
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 bg-white">
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
                          onClick={() => setFilterKelasRekap(item.kelas)}
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
                            <button
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
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 rounded font-semibold transition-colors cursor-pointer"
                            >
                              Excel {item.kelas}
                            </button>
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
                      Silakan pilih kelas saat memindai di tab <strong>3. Scan Kamera HP</strong> atau buat kunci soal di tab <strong>2. Kunci Soal &amp; Cetak LJK</strong>.
                    </p>
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <button
                        onClick={() => setTab('ujian')}
                        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        Buka Kunci Soal &amp; Cetak LJK
                      </button>
                      <button
                        onClick={() => {
                          if (filterKelasRekap !== 'SEMUA') setScanKelasFilter(filterKelasRekap);
                          setTab('scan');
                        }}
                        className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        Scan LJK {filterKelasRekap !== 'SEMUA' ? filterKelasRekap : 'Sekarang'}
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
                              onClick={() => setInspectedResult(r)}
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
                                <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-800 rounded text-xs font-semibold whitespace-nowrap">
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
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setInspectedResult(r);
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 rounded text-xs font-semibold transition-colors cursor-pointer"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    LJK
                                  </button>
                                  {r.id && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteResult(r.id);
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
                          LEMBAR DETAIL HASIL LJK SISWA
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
                        onClick={() => setInspectedResult(null)}
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
                        <span className="text-[10px] text-slate-400 block">NILAI AKHIR</span>
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
        )}
      </main>
    </div>
  );
}
