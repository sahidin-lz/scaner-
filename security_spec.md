# Security Specification: Scanner LJK Kamera HP

## 1. Data Invariants

1. **Authentication & Verification Gate**: Every read and write operation across `/students/{studentId}`, `/exams/{examId}`, and `/results/{resultId}` requires an authenticated user with `request.auth != null` and `request.auth.token.email_verified == true`.
2. **Ownership Isolation**: Every document in `students`, `exams`, and `results` must contain an `ownerId` field matching `request.auth.uid`. Users can only read (`get`, `list`), create, update, or delete documents where `resource.data.ownerId == request.auth.uid`.
3. **Relational Integrity (`results` -> `exams`)**: A `ScanResult` document in `/results/{resultId}` cannot be created unless `/exams/$(request.resource.data.examId)` exists and its `ownerId` equals `request.auth.uid`.
4. **Strict Key & Volumetric Boundaries**:
   - `Student`: Only keys `['ownerId', 'presensi', 'nama', 'kelas', 'createdAt']` are allowed.
   - `Exam`: Only keys `['ownerId', 'namaUjian', 'mapel', 'kelas', 'jumlahSoal', 'kunciJawaban', 'createdAt']` are allowed, with `jumlahSoal >= 1 && jumlahSoal <= 50` and `kunciJawaban.size() <= 50`.
   - `ScanResult`: Only keys `['ownerId', 'examId', 'studentId', 'presensi', 'nama', 'kelas', 'benar', 'salah', 'kosong', 'skor', 'statusRagu', 'detailJawaban', 'createdAt']` are allowed, with `detailJawaban.size() <= 50` and `skor >= 0 && skor <= 100`.
5. **Temporal Integrity & Immutability**: `createdAt` must equal `request.time` on creation and remain immutable (`incoming().createdAt == existing().createdAt`) on update, alongside `ownerId`.

## 2. The "Dirty Dozen" Payloads

1. **Identity Spoofing on Student Creation**: Creating `/students/stu_1` with `ownerId: "victim_uid"` while authenticated as `"attacker_uid"`.
2. **Unverified Email Write**: Creating `/students/stu_1` with `request.auth.token.email_verified == false`.
3. **Shadow Field Injection on Student**: Creating `/students/stu_1` with an undeclared field `isAdmin: true`.
4. **Denial of Wallet Oversized String**: Creating `/students/stu_1` with `nama` of length 5,000 characters (`> 120`).
5. **ID Poisoning Attack**: Creating `/students/invalid$id!with*spaces` that violates `^[a-zA-Z0-9_\-]+$`.
6. **Out-of-Bounds Exam Question Count**: Creating `/exams/ex_1` with `jumlahSoal: 500` (`> 50`).
7. **Orphaned ScanResult Write**: Creating `/results/res_1` referencing a non-existent `examId: "non_existent_exam"`.
8. **Cross-Tenant Exam Reference**: Creating `/results/res_1` referencing an `examId` owned by another teacher (`ownerId != request.auth.uid`).
9. **Client Timestamp Forgery**: Creating `/exams/ex_1` with a past or forged timestamp instead of `request.time`.
10. **Owner Hijack on Update**: Updating `/students/stu_1` to change `ownerId` from `"teacher_1"` to `"teacher_2"`.
11. **Value Poisoning on Score Update**: Updating `/results/res_1` with `skor: 9999` (`> 100`) or `skor: "A+"` (non-number).
12. **Blanket List Query Scraping**: Listing `/results` without filtering by `ownerId == request.auth.uid`.
