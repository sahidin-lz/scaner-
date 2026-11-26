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
  CheckCircle2,
  AlertTriangle,
  LogIn,
  LogOut,
  ScanLine,
  X,
  ShieldCheck,
  GraduationCap,
  Lock,
} from 'lucide-react';
import {
  db,
  auth,
  OperationType,
  handleFirestoreError,
} from './lib/firebase';
import {
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
  downloadStudentTemplateExcel,
  downloadAnswerKeyTemplateExcel,
} from './lib/excelHelper';
import CameraScanner from './components/CameraScanner';
import ExamPage from './components/ExamPage';
import RecapPage from './components/RecapPage';
import MasterDataPage from './components/MasterDataPage';

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
  // Mode awal adalah Mode Guru (Tanpa Login) dengan 3 Menu Inti + Fullscreen Scanner Terpisah
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(() => {
    return sessionStorage.getItem('evalscan_admin_auth') === 'true';
  });
  const [roleMode, setRoleMode] = useState<'guru' | 'operator'>(() => {
    return sessionStorage.getItem('evalscan_admin_auth') === 'true' ? 'operator' : 'guru';
  });
  const [tab, setTab] = useState<'ujian' | 'rekap' | 'master'>(() => {
    return sessionStorage.getItem('evalscan_admin_auth') === 'true' ? 'master' : 'ujian';
  });

  // Fullscreen Scanner Overlay (Terpisah dari navbar & halaman rekap)
  const [scannerFullscreenOpen, setScannerFullscreenOpen] = useState(false);

  // Modal Login Admin (sahidin30@gmail.com / 123456)
  const [showAdminLoginModal, setShowAdminLoginModal] = useState(false);
  const [adminEmailInput, setAdminEmailInput] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminLoginError, setAdminLoginError] = useState('');

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Data Real-Time dengan Firestore Persistent IndexedDB Cache
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

  // Rekap & Detail Hasil LJK
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

  // Pastikan antrean tersimpan otomatis saat berpindah tab atau menutup scanner
  useEffect(() => {
    if (pendingBundleIdsRef.current.size > 0) {
      flushPendingResultBundles();
    }
  }, [tab, scannerFullscreenOpen, flushPendingResultBundles]);

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
            const mergedHasilMap =
              pendingBundleIdsRef.current.has(change.doc.id) && localBundle
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

  const guruSubjectsByJenjang = React.useMemo(
    () => allSubjects.filter((s) => isSubjectMatchingJenjang(s, jenjangGuruFilter)),
    [allSubjects, jenjangGuruFilter]
  );

  useEffect(() => {
    if (guruSubjectsByJenjang.length > 0) {
      if (!guruSubjectsByJenjang.some((s) => s.namaMapel === mapelGuru)) {
        setMapelGuru(guruSubjectsByJenjang[0].namaMapel);
      }
    }
  }, [guruSubjectsByJenjang, mapelGuru]);

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
      setTab('master');
      setShowAdminLoginModal(false);
      setAdminPasswordInput('');
      setAdminLoginError('');
      showNotification('Login Admin berhasil! Anda kini berada di halaman Master Data.');
    } else {
      setAdminLoginError('Email atau password Admin salah. Gunakan email Admin yang terdaftar.');
    }
  }

  function handleAdminLogout() {
    setIsAdminLoggedIn(false);
    sessionStorage.removeItem('evalscan_admin_auth');
    setRoleMode('guru');
    setTab('ujian');
    showNotification('Keluar dari Mode Admin. Kembali ke Mode Guru (Tanpa Login).');
  }

  function handleRequestAdminMode() {
    if (isAdminLoggedIn) {
      setRoleMode('operator');
      setTab('master');
    } else {
      setAdminLoginError('');
      setShowAdminLoginModal(true);
    }
  }

  async function saveNewSubjectRecord(
    namaMapelInput: string,
    kodeInput?: string,
    jenjangInput?: string
  ) {
    const cleanNama = namaMapelInput.trim().slice(0, 100);
    if (!cleanNama) return null;

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

  function handleStartEditSubject(sub: Subject) {
    setEditingSubjectId(sub.id);
    setEditKodeMapel(sub.kode);
    setEditNamaMapel(sub.namaMapel);
    setEditJenjangMapel(sub.jenjang || 'Kelas 10, 11 & 12');
  }

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

  // ADMIN: Import Siswa dari Excel (1 Dokumen = 1 Kelas Penuh via /class_rosters)
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
        `Kunci ${cleanMapel} (${targetKelas} · ${clampedSoal} soal aktif) tersimpan!`
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

  const filteredSubjectsCatalog = allSubjects.filter((s) => {
    const matchJenjang = isSubjectMatchingJenjang(s, filterJenjangAdmin);
    const matchSearch =
      s.namaMapel.toLowerCase().includes(searchMapel.toLowerCase()) ||
      s.kode.toLowerCase().includes(searchMapel.toLowerCase()) ||
      (s.jenjang || '').toLowerCase().includes(searchMapel.toLowerCase());
    return matchJenjang && matchSearch;
  });

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

  const inspectedExam =
    (inspectedResult && exams.find((e) => e.id === inspectedResult.examId)) ||
    (filterMapelRekap !== 'SEMUA' && exams.find((e) => e.id === filterMapelRekap)) ||
    selectedExam;

  function openFullscreenScannerForExam(targetExam?: Exam | null, targetKelas?: string) {
    const activeEx = targetExam || selectedExam;
    if (!activeEx) {
      showNotification(
        'Silakan buat paket ujian & kunci jawaban terlebih dahulu sebelum memulai scan.',
        'warning'
      );
      setTab('ujian');
      return;
    }
    setSelectedExamId(activeEx.id);
    setScanKelasFilter(targetKelas || activeEx.kelas || 'Kelas 10');
    setScannerFullscreenOpen(true);
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 overflow-x-hidden">
      {/* Top Bar Contract: 3 Zones separated by gap-8 (1-line Brand, 3-4 clean nav links, 1 primary action) */}
      <div className="w-full bg-white border-b border-slate-200">
        <header className="max-w-5xl w-full mx-auto flex items-center justify-between gap-8 px-4 sm:px-6 py-3.5">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setTab('ujian');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            EvalScan LJK
          </a>

          {/* Zone 2: 3 Menu Inti + Tombol Buka Scanner Fullscreen */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => setTab('ujian')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
                tab === 'ujian'
                  ? 'border-blue-600 text-slate-900 font-semibold'
                  : 'border-transparent'
              }`}
            >
              1. Paket Ujian &amp; LJK
            </button>
            <button
              type="button"
              onClick={() => setTab('rekap')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
                tab === 'rekap'
                  ? 'border-blue-600 text-slate-900 font-semibold'
                  : 'border-transparent'
              }`}
            >
              2. Rekap &amp; Analisis
            </button>
            <button
              type="button"
              onClick={() => openFullscreenScannerForExam(selectedExam, scanKelasFilter)}
              className="hover:text-blue-600 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent cursor-pointer"
            >
              Scan LJK
            </button>
            {isAdminLoggedIn && (
              <button
                type="button"
                onClick={() => {
                  setRoleMode('operator');
                  setTab('master');
                }}
                className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
                  tab === 'master'
                    ? 'border-slate-900 text-slate-900 font-semibold'
                    : 'border-transparent'
                }`}
              >
                3. Master Data
              </button>
            )}
          </nav>

          {/* Zone 3: 1 primary action (Login Admin / Keluar Admin) */}
          <div className="flex items-center gap-3 shrink-0">
            {isAdminLoggedIn ? (
              <button
                type="button"
                onClick={handleAdminLogout}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                Keluar Admin ({ADMIN_EMAIL.split('@')[0]})
              </button>
            ) : (
              <button
                type="button"
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
                type="button"
                onClick={() => setShowAdminLoginModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Mode Guru dapat digunakan langsung tanpa login. Silakan masuk sebagai Admin untuk mengelola daftar mata pelajaran beserta jenjang (Kelas 10, 11, 12) dan database induk siswa.
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
                  Masuk Master Data
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Role & Quick Fullscreen Scan Banner */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-600">
              <span>
                {roleMode === 'guru'
                  ? 'Mode Guru Aktif (Tanpa Perlu Login)'
                  : `Mode Admin Aktif (${ADMIN_EMAIL})`}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-slate-500">
                {pendingSyncCount > 0 ? 'Menyimpan Bundel...' : 'Real-Time Bundel Hemat 97% Kuota'}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {tab === 'ujian'
                ? 'Beranda Paket Ujian, Kunci Soal & Cetak LJK 2-in-1'
                : tab === 'rekap'
                ? 'Rekapitulasi Nilai, Rapor Siswa & Analisis Butir Soal'
                : 'Master Data Mata Pelajaran (Kelas 10/11/12) & Database Siswa'}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Tombol Utama Buka Fullscreen Scanner ala EvalBee */}
            <button
              type="button"
              onClick={() => openFullscreenScannerForExam(selectedExam, scanKelasFilter)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <ScanLine className="w-4 h-4 shrink-0" />
              Mulai Scan Fullscreen
            </button>

            <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setRoleMode('guru');
                  if (tab === 'master') setTab('ujian');
                }}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                  roleMode === 'guru'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                Guru
              </button>
              <button
                type="button"
                onClick={handleRequestAdminMode}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                  roleMode === 'operator' && isAdminLoggedIn
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                {isAdminLoggedIn ? 'Master Data' : 'Admin'}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Tab Switcher (3 Menu Inti + Scan Fullscreen) */}
        <div
          className={`grid ${
            isAdminLoggedIn ? 'grid-cols-4' : 'grid-cols-3'
          } gap-1.5 p-1 bg-slate-200/70 rounded-xl md:hidden text-xs`}
        >
          <button
            type="button"
            onClick={() => setTab('ujian')}
            className={`py-2 px-2 rounded-lg font-semibold whitespace-nowrap truncate transition-colors ${
              tab === 'ujian' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            1. Ujian &amp; LJK
          </button>
          <button
            type="button"
            onClick={() => setTab('rekap')}
            className={`py-2 px-2 rounded-lg font-semibold whitespace-nowrap truncate transition-colors ${
              tab === 'rekap' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            2. Rekap Nilai
          </button>
          <button
            type="button"
            onClick={() => openFullscreenScannerForExam(selectedExam, scanKelasFilter)}
            className="py-2 px-2 rounded-lg font-bold whitespace-nowrap truncate bg-blue-600 text-white"
          >
            Scan LJK
          </button>
          {isAdminLoggedIn && (
            <button
              type="button"
              onClick={() => {
                setRoleMode('operator');
                setTab('master');
              }}
              className={`py-2 px-2 rounded-lg font-semibold whitespace-nowrap truncate transition-colors ${
                tab === 'master' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              3. Master
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
              type="button"
              onClick={() => setBanner(null)}
              className="text-xs font-semibold underline opacity-75 hover:opacity-100 shrink-0"
            >
              Tutup
            </button>
          </div>
        )}

        {/* MENU 1: BERANDA PAKET UJIAN, KUNCI SOAL & CETAK LJK */}
        {tab === 'ujian' && (
          <ExamPage
            exams={exams}
            selectedExam={selectedExam}
            onSelectExamId={setSelectedExamId}
            students={students}
            resultsCountByExamAndClass={(examId, kls) =>
              results.filter((r) => r.examId === examId && r.kelas === kls).length
            }
            allClassOptions={allClassOptions}
            guruSubjectsByJenjang={guruSubjectsByJenjang}
            jenjangGuruFilter={jenjangGuruFilter}
            onChangeJenjangGuruFilter={setJenjangGuruFilter}
            mapelGuru={mapelGuru}
            onChangeMapelGuru={setMapelGuru}
            isCustomGuruMapel={isCustomGuruMapel}
            onToggleCustomGuruMapel={() => setIsCustomGuruMapel((p) => !p)}
            customGuruMapelText={customGuruMapelText}
            onChangeCustomGuruMapelText={setCustomGuruMapelText}
            kelasGuru={kelasGuru}
            onChangeKelasGuru={setKelasGuru}
            isCustomGuruKelas={isCustomGuruKelas}
            onToggleCustomGuruKelas={() => setIsCustomGuruKelas((p) => !p)}
            customGuruKelasText={customGuruKelasText}
            onChangeCustomGuruKelasText={setCustomGuruKelasText}
            namaUjian={namaUjian}
            onChangeNamaUjian={setNamaUjian}
            jumlahSoal={jumlahSoal}
            onChangeJumlahSoal={setJumlahSoal}
            bobotPG={bobotPG}
            onChangeBobotPG={setBobotPG}
            bobotPGK={bobotPGK}
            onChangeBobotPGK={setBobotPGK}
            kunciText={kunciText}
            onChangeKunciText={setKunciText}
            guruPrintJumlahSiswa={guruPrintJumlahSiswa}
            onChangeGuruPrintJumlahSiswa={setGuruPrintJumlahSiswa}
            loading={loading}
            onUploadKeyExcel={handleUploadKeyExcel}
            onSaveExamManual={handleSaveExamManual}
            onDeleteExam={handleDeleteExam}
            onDownloadKeyTemplate={downloadAnswerKeyTemplateExcel}
            onStartFullscreenScan={(ex, kls) => openFullscreenScannerForExam(ex, kls)}
            buildFallbackClassStudents={buildFallbackClassStudents}
            showNotification={showNotification}
          />
        )}

        {/* MENU 2: REKAP & ANALISIS NILAI (TERPISAH DARI LAYAR KAMERA) */}
        {tab === 'rekap' && (
          <RecapPage
            exams={exams}
            selectedExam={selectedExam}
            results={results}
            filteredResults={filteredResults}
            filterKelasRekap={filterKelasRekap}
            onChangeFilterKelasRekap={setFilterKelasRekap}
            filterMapelRekap={filterMapelRekap}
            onChangeFilterMapelRekap={setFilterMapelRekap}
            searchRekap={searchRekap}
            onChangeSearchRekap={setSearchRekap}
            allClassOptions={allClassOptions}
            classSummaryBreakdown={classSummaryBreakdown}
            avgScore={avgScore}
            maxScore={maxScore}
            minScore={minScore}
            passCount={passCount}
            passRate={passRate}
            inspectedResult={inspectedResult}
            onSelectInspectedResult={setInspectedResult}
            inspectedExam={inspectedExam}
            onDeleteResult={handleDeleteResult}
            onGoToExamPage={() => setTab('ujian')}
            onOpenFullscreenScan={(kls) => openFullscreenScannerForExam(selectedExam, kls)}
            showNotification={showNotification}
          />
        )}

        {/* MENU 3: MASTER DATA (ADMIN: MAPEL JENJANG KELAS 10/11/12 & DAFTAR SISWA) */}
        {tab === 'master' && isAdminLoggedIn && (
          <MasterDataPage
            allSubjects={allSubjects}
            dbSubjects={dbSubjects}
            filteredSubjectsCatalog={filteredSubjectsCatalog}
            jenjangOptions={JENJANG_OPTIONS}
            filterJenjangAdmin={filterJenjangAdmin}
            onChangeFilterJenjangAdmin={setFilterJenjangAdmin}
            searchMapel={searchMapel}
            onChangeSearchMapel={setSearchMapel}
            newKodeMapel={newKodeMapel}
            onChangeNewKodeMapel={setNewKodeMapel}
            newNamaMapel={newNamaMapel}
            onChangeNewNamaMapel={setNewNamaMapel}
            newJenjangMapel={newJenjangMapel}
            onChangeNewJenjangMapel={setNewJenjangMapel}
            editingSubjectId={editingSubjectId}
            onSetEditingSubjectId={setEditingSubjectId}
            editKodeMapel={editKodeMapel}
            onChangeEditKodeMapel={setEditKodeMapel}
            editNamaMapel={editNamaMapel}
            onChangeEditNamaMapel={setEditNamaMapel}
            editJenjangMapel={editJenjangMapel}
            onChangeEditJenjangMapel={setEditJenjangMapel}
            onAddSubject={handleAddSubject}
            onStartEditSubject={handleStartEditSubject}
            onSaveEditSubject={handleSaveEditSubject}
            onDeleteSubject={handleDeleteSubject}
            onRestoreDefaultSubjects={handleRestoreDefaultSubjects}
            students={students}
            filteredStudents={filteredStudents}
            uniqueClasses={uniqueClasses}
            filterKelasSiswa={filterKelasSiswa}
            onChangeFilterKelasSiswa={setFilterKelasSiswa}
            newPresensi={newPresensi}
            onChangeNewPresensi={setNewPresensi}
            newNama={newNama}
            onChangeNewNama={setNewNama}
            newKelas={newKelas}
            onChangeNewKelas={setNewKelas}
            loading={loading}
            onImportStudents={handleImportStudents}
            onAddStudentManual={handleAddStudentManual}
            onDeleteStudent={handleDeleteStudent}
            onClearAllStudents={handleClearAllStudents}
            onDownloadStudentTemplate={downloadStudentTemplateExcel}
          />
        )}
      </main>

      {/* FULLSCREEN SCANNER OVERLAY ALA EVALBEE (TERPISAH DARI NAVBAR & REKAP) */}
      {scannerFullscreenOpen && selectedExam && (
        <CameraScanner
          exam={selectedExam}
          activeKelas={scanKelasFilter}
          classOptions={allClassOptions}
          onChangeActiveKelas={(kls) => setScanKelasFilter(kls)}
          students={students}
          classResults={results.filter(
            (r) =>
              r.kelas === (scanKelasFilter || selectedExam.kelas) &&
              (r.examId === selectedExam.id || r.mapel === selectedExam.mapel)
          )}
          onCloseScanner={() => setScannerFullscreenOpen(false)}
          onResultSaved={async (res) => {
            const cleanStudentId = res.studentId
              .replace(/[^a-zA-Z0-9_\-]/g, '_')
              .slice(0, 128);
            const targetSavedKelas = (
              res.kelas ||
              scanKelasFilter ||
              selectedExam.kelas
            ).slice(0, 50);
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
              `Nilai LJK ${res.nama} (${targetSavedKelas} · ${selectedExam.mapel} · Skor: ${res.skor}) langsung tersimpan ke bundel kelas!`
            );
          }}
        />
      )}
    </div>
  );
}
