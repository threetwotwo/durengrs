import type { Bundle } from './index';

/**
 * Shared vocabulary. Terms match the WhatsApp Flow (flow.json / index.js) exactly, so the owner
 * sees the same words the workers use:
 *   Pohon = tree, Blok = block, Laporan = report, Foto = photo, Keterangan = what the worker wrote,
 *   Catatan = notes, Kondisi pohon = tree condition, Hijau / Kuning / Merah / Belum dinilai (the owner's sheet; the
 *   current WhatsApp flow still says Sehat / Masalah ringan / Darurat until the bot moves into this repo),
 *   Tidak ada perubahan, Kondisi berubah, Laporan terakhir, Belum ada laporan,
 *   Lebar kanopi (cm), Lingkar batang (cm), Dahan berbunga, Tandan bunga, Perkiraan jumlah buah,
 *   Ubah data, Simpan Perubahan, Pengukuran.
 */
export const common: Bundle = {
  id: {
    'common.tree': 'Pohon',
    'common.trees': 'Pohon',
    'common.block': 'Blok',
    'common.blockN': 'Blok {n}',
    'common.blocks': 'Blok',
    'common.variant': 'Varietas',
    'common.reports': 'Laporan',
    'common.photo': 'Foto',
    'common.notes': 'Catatan',
    'common.condition': 'Kondisi pohon',
    'common.cancel': 'Batal',
    'common.close': 'Tutup',
    'common.yes': 'Ya',
    'common.no': 'Tidak',
    'common.done': 'Selesai',
    'common.clear': 'Hapus filter',
    'common.all': 'Semua',
    'common.allBlocks': 'Semua blok',
    'common.allConditions': 'Semua kondisi',
    'common.back': 'Kembali',
    'common.unknown': 'Tidak diketahui',
    'common.today': 'Hari ini',
    'common.yesterday': 'Kemarin',

    // Condition labels = the Flow's radio options
    'cond.healthy': 'Hijau',
    'cond.minor': 'Kuning',
    'cond.emergency': 'Merah',
    'cond.not_assessed': 'Belum dinilai',
    'cond.healthy.meaning': 'Sehat',
    'cond.minor.meaning': 'Ada masalah, pantau',
    'cond.emergency.meaning': 'Darurat, tangani segera',
    'cond.improving': 'Membaik',
    'cond.unchanged': 'Tidak ada perubahan',
    'cond.changed': 'Kondisi berubah',

    // Measurements = the Flow's "Pengukuran" screen
    'field.canopy': 'Lebar kanopi (cm)',
    'field.trunk': 'Lingkar batang (cm)',
    'field.branches': 'Dahan berbunga',
    'field.clusters': 'Tandan bunga',
    'field.fruits': 'Perkiraan jumlah buah',
    'field.lastReport': 'Laporan terakhir',

    // time
    'time.hAgo': '{n} jam lalu',
    'time.dAgo': '{n} hari lalu',
  },
  en: {
    'common.tree': 'Tree',
    'common.trees': 'Trees',
    'common.block': 'Block',
    'common.blockN': 'Block {n}',
    'common.blocks': 'Blocks',
    'common.variant': 'Variant',
    'common.reports': 'Reports',
    'common.photo': 'Photo',
    'common.notes': 'Notes',
    'common.condition': 'Tree condition',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.done': 'Done',
    'common.clear': 'Clear filters',
    'common.all': 'All',
    'common.allBlocks': 'All blocks',
    'common.allConditions': 'All conditions',
    'common.back': 'Back',
    'common.unknown': 'Unknown',
    'common.today': 'Today',
    'common.yesterday': 'Yesterday',

    'cond.healthy': 'Green',
    'cond.minor': 'Yellow',
    'cond.emergency': 'Red',
    'cond.not_assessed': 'Not assessed',
    'cond.healthy.meaning': 'Healthy',
    'cond.minor.meaning': 'Has a problem, watch it',
    'cond.emergency.meaning': 'Emergency, act now',
    'cond.improving': 'Improving',
    'cond.unchanged': 'No change',
    'cond.changed': 'Condition changed',

    'field.canopy': 'Canopy width (cm)',
    'field.trunk': 'Trunk girth (cm)',
    'field.branches': 'Flowering branches',
    'field.clusters': 'Flower clusters',
    'field.fruits': 'Estimated fruit count',
    'field.lastReport': 'Last report',

    'time.hAgo': '{n}h ago',
    'time.dAgo': '{n}d ago',
  },
};
