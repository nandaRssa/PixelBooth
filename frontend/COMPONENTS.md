# Panduan Desain & Komponen UI PixelBooth

Dokumen ini menjelaskan struktur visual, tata letak, komponen desain (terutama kartu/*cards*), dan perilaku interaktif pada setiap halaman aplikasi **PixelBooth** (Frontend).

---

## 🎨 Sistem Desain Global (`src/index.css`)
Sebelum melihat komponen per halaman, seluruh UI didasarkan pada variabel CSS yang dapat berganti secara dinamis saat mode siang (*light*) / malam (*dark*) diaktifkan:
*   **Warna Latar Belakang & Permukaan**: 
    *   `--pb-bg` (`#0a0a0a` / `#fafafa`): Background utama halaman.
    *   `--pb-surface` (`#141414` / `#ffffff`): Latar belakang kartu, panel, dan komponen utama.
    *   `--pb-elevated` (`#1e1e1e` / `#f4f4f5`): Latar belakang modal atau elemen melayang (*hover state*).
*   **Warna Aksen Utama**: `--pb-accent` (`#ff5a36` - oranye khas PixelBooth).
*   **Typography**: Menggunakan Google Fonts **Inter** (`font-sans`) dengan variasi ketebalan font dari `300` hingga `800`.
*   **Radius Sudut**: `--radius-card` (`12px`) untuk sudut luar kartu, dan `--radius-btn` (`8px`) untuk tombol.

---

## 🖥️ Layout Global (`src/components/layout/AdminLayout.tsx`)
Membungkus hampir semua halaman admin dengan struktur berikut:
*   **Desktop (Sidebar Kiri - `w-64`)**:
    *   Berwarna dasar `--pb-bg` dengan garis batas kanan tipis (`--pb-border`).
    *   Logo **PixelBooth** dengan huruf oranye ikonik.
    *   *Navigation Links* (`NavLink`): Memiliki efek geser mikro saat di-hover (`hover:translate-x-1.5`) dan latar belakang gradasi oranye-kuning (`from-[#FF5A36] to-[#FF8836]`) berbayang saat aktif.
    *   Tombol toggle tema (ikon Matahari / Bulan) di sebelah logo.
*   **Mobile (Header Atas - `h-14`)**:
    *   Header melayang dengan efek blur semi-transparan (`bg-pb-bg/90 backdrop-blur-md`).
    *   Tombol menu dan toggle tema yang responsif.

---

## 📁 1. Halaman Dashboard (`src/pages/admin/DashboardPage.tsx`)
Halaman sambutan utama bagi admin photobooth setelah login.

### Komponen Utama:
1.  **Header Sambutan Real-time**:
    *   Menampilkan ucapan berdasarkan waktu lokal saat ini (*"Selamat Pagi"*, *"Selamat Siang"*, *"Selamat Malam"*).
    *   Didukung animasi masuk halus (*fade-in / slide-down*) menggunakan `framer-motion`.
2.  **Kartu Menu Utama (Grid 3 Kolom - `menuItems`)**:
    *   **Desain**: Berlatar belakang permukaan (`bg-pb-surface`), garis batas tipis, berbayang lembut (`shadow-xs`).
    *   **Interaksi Hover**: Kartu bergeser ke atas (`y: -6`), membesar sedikit (`scale: 1.02`), garis batas menajam (`hover:border-pb-border-strong`), dan bayangan membesar dramatis (`hover:shadow-xl`).
    *   **Elemen Dalam Kartu**:
        *   *Icon Container*: Kotak abu-abu gelap dengan transisi warna saat hover.
        *   *Teks*: Judul tebal (`font-semibold`) dan deskripsi abu-abu pudar (`text-pb-text-muted`).
        *   *Link Aksi*: Teks *"Buka"* kecil di bawah bersanding dengan ikon panah (`ArrowRight`) yang berubah warna saat di-hover.
3.  **Kartu Statistik Cepat (Grid 3 Kolom - `stats`)**:
    *   **Desain**: Kartu statistik responsif berlatar belakang permukaan.
    *   **Elemen Dalam Kartu**:
        *   *Angka Nilai*: Ukuran teks sangat besar dan tebal (`text-3xl font-extrabold`).
        *   *Label*: Label statistik di bagian atas.
        *   *Subteks*: Teks kecil informatif di bagian bawah.
        *   *Icon*: Berada di sisi kanan dengan warna tematik (Oranye untuk Foto, Cyan untuk Folder, Emerald untuk Template).

---

## 🖼️ 2. Halaman Galeri Admin (`src/pages/admin/GalleryPage.tsx`)
Tempat admin mengelola folder, subfolder, serta berkas foto/video hasil photobooth.

### Komponen Utama:
1.  **Breadcrumb Navigation**:
    *   Baris navigasi folder bertingkat di bagian atas.
    *   Memisahkan setiap folder dengan simbol panah kanan (`ChevronRight`) berwarna redup.
    *   Setiap remah navigasi dapat diklik untuk kembali ke folder sebelumnya.
2.  **Kartu Folder (`src/components/gallery/FolderCard.tsx`)**:
    *   **Desain**: Desain kartu folder vertikal.
    *   **Visual**: Menampilkan ikon folder besar di sebelah kiri atau atas, nama folder tebal, dan jumlah item di dalamnya (misal: *"12 Foto"*).
    *   **Menu Opsi**: Tombol titik tiga di sudut kanan atas kartu folder yang membuka menu *dropdown* untuk mengganti nama, menghapus, melihat QR code folder, atau memindahkan folder.
3.  **Grid Foto (`src/components/gallery/PhotoGrid.tsx` & `PhotoCard.tsx`)**:
    *   Menampilkan deretan foto dalam grid multi-kolom yang responsif.
    *   **Desain Kartu Foto (`PhotoCard.tsx`)**:
        *   Rasio aspek terkunci (seperti `aspect-[3/4]` atau persegi).
        *   **Hover Overlays**: Saat kursor diarahkan ke kartu foto, gradasi gelap (`bg-gradient-to-t from-black/80 to-transparent`) muncul di bagian bawah bersama tombol aksi cepat (Hapus 🗑️, Pindahkan 📁, Detail Preview 👁️).
        *   **Status Seleksi**: Menyediakan lingkaran *checkbox* di sudut kiri atas kartu ketika *Selection Mode* aktif untuk menandai beberapa foto sekaligus (*bulk operation*).
4.  **Modal Preview Foto (`src/components/gallery/PhotoPreviewModal.tsx`)**:
    *   Modal besar (*lightbox*) yang melayang di atas galeri.
    *   Menampilkan foto ukuran penuh di sebelah kiri, dan panel detail di sebelah kanan (Tanggal diambil, nama folder, tombol unduh, tombol print, dan QR code akses cepat).

---

## 📸 3. Halaman Menu Photobooth (`src/pages/admin/PhotoMenuPage.tsx`)
Halaman persiapan sebelum masuk ke sesi pemotretan.

### Komponen Utama:
1.  **Status Perangkat & Kamera (`CameraStatusBadge`)**:
    *   Menampilkan indikator koneksi DSLR (Bridge) dan ketersediaan Webcam browser.
    *   Warna hijau terang (`bg-emerald-500/10 text-emerald-400`) jika terhubung, merah redup (`bg-red-500/10 text-red-400`) jika terputus.
2.  **Dropdown Pemilihan Folder Tujuan**:
    *   Komponen seleksi untuk memilih di folder mana hasil pemotretan sesi ini akan disimpan. Jika kosong, admin dapat langsung membuat folder baru di tempat melalui tombol plus (`FolderPlus`).
3.  **Grid Pilihan Template**:
    *   Daftar kartu template desain aktif yang siap dipilih.
    *   **Desain Kartu Template**:
        *   Menampilkan gambar pratinjau template yang sudah digabungkan dengan bingkai contoh.
        *   Tombol *"Pilih & Mulai"* yang menyala saat di-hover.

---

## 🎥 4. Halaman Sesi Foto Capture (`src/pages/admin/PhotoCapturePage.tsx`)
Halaman pengambilan foto interaktif menggunakan kamera aktif.

### Komponen Utama:
1.  **Frame Template Pratinjau**:
    *   Menampilkan gambar template desain secara utuh di tengah layar.
    *   **Slot Kamera Aktif**: Kamera live (webcam/DSLR) disisipkan secara real-time tepat di dalam kotak lubang (*frame slot*) yang sedang aktif secara berurutan. Kotak slot aktif ini ditandai dengan garis batas menyala (*glowing border*) oranye.
2.  **Overlay Hitung Mundur (*Countdown Overlay*)**:
    *   Angka hitung mundur besar (`3, 2, 1`) yang melayang di atas slot kamera yang aktif sebelum shutter memotret.
    *   Didukung efek animasi memperbesar dan memudar tiap detiknya.
3.  **Flash Simulator**:
    *   Layar putih penuh seketika yang memudar cepat saat kamera mengambil gambar untuk mensimulasikan efek lampu kilat (*flash*).
4.  **Panel Retake Per Frame**:
    *   Jika hasil foto pada salah satu frame kurang memuaskan, admin dapat menekan tombol ulangi (*retake*) khusus pada frame tersebut tanpa perlu mengulang dari frame pertama.
5.  **Modal Hasil Cetak & Share QR**:
    *   Tampil setelah semua frame selesai diambil.
    *   Menampilkan hasil komposit akhir gabungan template dan foto-foto.
    *   Menyediakan QR Code berukuran besar agar pelanggan dapat memindai langsung untuk mengunduh fotonya.

---

## 📺 5. Halaman Sesi Layar Penuh (`src/pages/admin/FullscreenSessionPage.tsx`)
Sama seperti halaman Capture biasa, namun didesain khusus untuk mesin photobooth mandiri (*kiosk mode*).

### Komponen Utama:
*   **Viewport Penuh**: Tidak ada sidebar admin, tidak ada header navigasi, tidak ada tombol pengaturan rumit.
*   **Desain UI Minimalis**: Hanya tombol shutter melayang transparan, tombol keluar di sudut yang tersamar, dan area template yang mendominasi seluruh layar monitor.
*   **QR Pop-up Besar**: Di akhir sesi, QR Code muncul di tengah layar dengan background gelap pekat agar kontras dan mudah dipindai oleh pelanggan.

---

## ⚙️ 6. Halaman Kelola Template (`src/pages/admin/TemplatesPage.tsx`)
Daftar seluruh aset template foto di sistem.

### Komponen Utama:
1.  **Informasi Persyaratan Desain**:
    *   3 kartu horizontal tipis berisi instruksi cepat format yang didukung (PNG, JPG), ukuran canvas, dan alur pembuatan.
2.  **Kartu Aset Template (`TemplateCard`):**
    *   **Visual**: Aspek rasio 3:4 dengan gambar pratinjau penuh.
    *   **Tombol Aksi Terapung (Tampil saat hover/selalu tampil di mobile)**:
        *   Ikon Sliders (`SlidersHorizontal` - Cyan) untuk masuk ke Frame Editor.
        *   Ikon Pensil (`Pencil` - Amber) untuk mengubah nama template.
        *   Ikon Sampah (`Trash2` - Merah) untuk menghapus template.
    *   **Status Tags**:
        *   Tag kuning *"Draft"* di sudut kanan jika template belum dikonfirmasi lubang kameranya (belum aktif).
        *   Tag abu-abu *"X f"* (contoh: *3 f* atau *4 f*) yang menunjukkan jumlah frame lubang kamera di dalam template tersebut.
3.  **Modal Unggah Template (`Upload Modal`)**:
    *   Form isian nama template baru, input file desain PNG/JPG, serta deteksi otomatis resolusi lebar & tinggi piksel canvas asli dari gambar yang diunggah.

---

## 🎨 7. Halaman Editor Frame Template (`src/pages/admin/TemplateFrameEditorPage.tsx`)
Workspace tingkat lanjut untuk melubangi template desain secara manual agar bisa ditembus oleh kamera.

### Komponen Utama:
1.  **Canvas Kerja Utama**:
    *   Menampilkan gambar template orisinal di tengah layar editor.
    *   Menggambar lubang kamera transparan di atas template menggunakan teknik masking canvas.
2.  **Titik Handle Kontrol Bingkai Kamera**:
    *   Setiap bingkai kamera memiliki kotak seleksi berwarna biru/oranye dengan 8 titik handle di sudut dan sisi-sisinya.
    *   **Interaksi**: Admin dapat menyeret (*drag*) badan frame untuk memindahkan posisinya, menyeret titik handle untuk merubah ukuran lebar/tinggi, menyeret tangkai atas untuk memutar sudut rotasi frame secara bebas.
3.  **Panel Brush Masking (Kiri/Kanan Editor)**:
    *   Tombol pilihan kuas kuadrat/lingkaran untuk menghapus sisa piksel latar belakang (*remove seeds*), mempertahankan elemen dekorasi desain agar menimpa foto (*protect seeds*), atau mengembalikan piksel asli.
4.  **Bilah Alat Atas (Toolbar)**:
    *   Pilihan bentuk frame kamera (Persegi, Elips, Poligon bebas).
    *   Tombol Undo (`Undo2`) dan Redo (`Redo2`) untuk membatalkan/mengulang perubahan koordinat frame.
    *   Tombol toggle test kamera langsung untuk melihat hasil tembusan lubang secara langsung di editor.

---

## ⚙️ 8. Halaman Pengaturan (`src/pages/admin/SettingsPage.tsx`)
Tempat mengubah preferensi sistem photobooth.

### Komponen Utama:
*   **Kartu Opsi Mode Tampilan (Grid 2 Kolom)**:
    *   Tombol besar interaktif pilihan mode **Default** (sesi dengan kontrol admin) atau **Fullscreen** (sesi kiosk).
    *   Kartu yang aktif memiliki garis bingkai oranye tebal (`border-[#FF5A36]`), ikon menyala, dan latar belakang permukaan yang lebih terang.
    *   Dilengkapi badge peringatan khusus jika diakses dari smartphone, yang secara otomatis memblokir mode Default ke mode Fullscreen.

---

## 📱 9. Halaman Galeri Pelanggan (`src/pages/customer/CustomerFolderPage.tsx`)
Halaman web responsif (biasanya dibuka di HP) ketika pelanggan memindai QR code folder.

### Komponen Utama:
1.  **Bilah Aksi Atas (*Floating Action Bar*)**:
    *   Tombol *"Pilih"* untuk mengaktifkan fitur multi-download.
    *   Tombol *"Bagikan"* untuk membagikan tautan galeri ke media sosial via Web Share API bawaan HP.
2.  **Grid Foto Responsif**:
    *   Grid dinamis (biasanya 2 kolom di mobile) berlatar belakang gelap pekat agar foto terlihat premium dan tajam.
    *   Dilengkapi efek sentuh instan (*tap active effect*) menggunakan `framer-motion`.
3.  **Lightbox Preview**:
    *   Pratinjau foto satu layar penuh ketika kartu foto disentuh.
    *   Tombol unduh mengambang di bagian bawah untuk langsung menyimpan foto ke galeri lokal handphone pelanggan.
