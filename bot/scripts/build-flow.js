// scripts/build-flow.js — writes the two Flow files (WhatsApp Flow JSON v7.3):
//   flows/flow.json       "Laporan Pohon"   opened after a worker sends a tree ID   (env FLOW_ID)
//   flows/flow-farm.json  "Catatan Kebun"   rain and finished work, no tree needed  (env FARM_FLOW_ID)
// Run: npm run build-flow     Then paste each file into its OWN new Flow (a published Flow can't be edited).
// All worker-facing text is Indonesian. Rules and ranges live on the server (lib/rules.js); the Flow only draws.
//
// Two rules learned the hard way (both are checked in test/flow.test.js):
//  * a dynamic property must be the WHOLE value: "${data.title}", never "Pohon ${data.title}" (shows literally);
//  * DatePicker has no label-variant.
const fs = require('fs');
const path = require('path');

// ---------- small builders ----------
const str = (example) => ({ type: 'string', __example__: example });
const bool = (example = false) => ({ type: 'boolean', __example__: example });
const opts = (example) => ({
  type: 'array',
  items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' } } },
  __example__: example,
});
const initObj = (props, example) => ({
  type: 'object',
  properties: Object.fromEntries(props.map((p) => [p, { type: 'string' }])),
  __example__: example,
});

const heading = (text) => ({ type: 'TextHeading', text });
const sub = (text) => ({ type: 'TextSubheading', text });
const body = (text, extra = {}) => ({ type: 'TextBody', text, ...extra });
const caption = (text) => ({ type: 'TextCaption', text });
const form = (name, children, initValues) => ({ type: 'Form', name, children, ...(initValues ? { 'init-values': initValues } : {}) });
const footer = (label, action) => ({ type: 'Footer', label, 'on-click-action': action });
const exchange = (payload) => ({ name: 'data_exchange', payload });
const num = (name, label, helper, required = true) => ({
  type: 'TextInput', name, label, 'label-variant': 'large', 'input-type': 'number', 'helper-text': helper, required,
});
const photoPicker = (label = 'Ambil atau pilih foto') => ({
  type: 'PhotoPicker',
  name: 'photos',
  label,
  'photo-source': 'camera_gallery',
  'max-file-size-kb': 10240,
  'min-uploaded-photos': 0,
  'max-uploaded-photos': 3,
});

const text = (name, label, max = 200) => ({
  type: 'TextInput', name, label, 'label-variant': 'large', 'input-type': 'text', required: false, 'max-chars': max,
});
const date = (name, label, helper, min, max) => ({
  type: 'DatePicker', name, label, required: true, 'helper-text': helper,
  ...(min ? { 'min-date': min } : {}), ...(max ? { 'max-date': max } : {}),
});
const confirmBox = (label) => ({ type: 'OptIn', name: 'confirm', label, required: false, visible: '${data.needs_confirm}' });
const screen = (id, title, data, children, extra = {}) => ({ id, title, ...extra, data, layout: { type: 'SingleColumnLayout', children } });

const CONFIRM_DATA = { needs_confirm: bool(false), warned: str('') };
const DATE_DATA = { min_date: str('2026-08-01'), max_date: str('2026-10-04') };

const DONE = screen(
  'DONE',
  'Selesai',
  { title: str('✅ Laporan tersimpan'), message: str('Laporan untuk A1 tersimpan.'), saved: bool(true), report_id: str('') },
  // `saved` and `report_id` go back with the completion: the chat message that follows can tell "saved" from "not
  // saved", and the bot reads the saved report's photos with Gemini (lib/ai.js) before answering.
  [heading('${data.title}'), body('${data.message}'), footer('Tutup', { name: 'complete', payload: { saved: '${data.saved}', report_id: '${data.report_id}' } })],
  { terminal: true, success: true }
);

// =====================================================================================================
// Flow 1: Laporan Pohon
// =====================================================================================================

const TREE_LOOKUP = screen(
  'TREE_LOOKUP',
  'Info Pohon',
  {
    title: str('Pohon A1 · MK'),
    status: str('🟢 Sehat'),
    measurements: str('- Lebar kanopi: **520 cm**\n- Lingkar batang: **43 cm**'),
    notes: str('—'),
    last_meta: str('2 Okt 11.54'),
    last_text: str('Daun terlihat baik'),
    last_photos: str('📷 [Foto 1](https://example.com/1.jpg)'),
    menu_title: str('Pohon A1 · MK · Blok A'),
    suggestion: str('Saran: hitung buah di pohon (terakhir dihitung 16 hari lalu). Pilih Panen & Data Pohon.'),
    has_suggestion: bool(true),
    can_edit: bool(true),
  },
  [
    heading('${data.title}'),
    body('${data.status}', { 'font-weight': 'bold' }),
    sub('📏 Pengukuran'),
    body('${data.measurements}', { markdown: true }),
    sub('📝 Catatan pohon'),
    body('${data.notes}'),
    // A link, not a second button: a screen has one Footer ("Buat Laporan"). The server answers with the edit
    // screen filled with the tree's current values.
    { type: 'EmbeddedLink', text: 'Ubah data pohon', 'on-click-action': exchange({ open: 'edit_tree' }), visible: '${data.can_edit}' },
    sub('🕒 Laporan terakhir'),
    caption('${data.last_meta}'),
    body('${data.last_text}'),
    body('${data.last_photos}', { markdown: true }),
    footer('Buat Laporan', {
      name: 'navigate',
      next: { type: 'screen', name: 'MENU' },
      payload: { menu_title: '${data.menu_title}', suggestion: '${data.suggestion}', has_suggestion: '${data.has_suggestion}' },
    }),
  ]
);

const MENU = screen(
  'MENU',
  'Laporan Pohon',
  { menu_title: str('Pohon A1 · MK · Blok A'), suggestion: str('Saran: hitung buah di pohon.'), has_suggestion: bool(true) },
  [
    form('menu_form', [
      heading('${data.menu_title}'),
      body('${data.suggestion}', { visible: '${data.has_suggestion}' }),
      {
        type: 'RadioButtonsGroup',
        name: 'choice',
        label: 'Apa yang ingin Anda laporkan?',
        required: true,
        'data-source': [
          { id: 'issue', title: 'Laporan Masalah', description: 'Daun, batang, hama, atau kondisi pohon. Bisa dengan foto.' },
          { id: 'harvest', title: 'Panen & Data Pohon', description: 'Bunga, hitung buah, dan catat panen.' },
        ],
      },
      footer('Lanjut', exchange({ choice: '${form.choice}' })),
    ]),
  ]
);

// Photo + words, both required; no lists to choose from. The server reads the words (lib/shared.js triageText),
// answers the worker on the DONE screen and puts the report in the owner's "Perlu dicek" inbox.
const REPORT = screen(
  'REPORT',
  'Laporan Masalah',
  { report_title: str('Laporan untuk A1'), condition_caption: str('Kondisi saat ini: Hijau') },
  [
    form('report_form', [
      heading('${data.report_title}'),
      caption('${data.condition_caption}'),
      body('Kirim foto dan tulis apa yang Anda lihat. Admin akan mengecek laporan Anda.'),
      sub('1. Foto'),
      caption('Satu foto dari dekat, satu foto seluruh pohon.'),
      {
        type: 'PhotoPicker',
        name: 'photos',
        label: 'Ambil atau pilih foto',
        description: 'Minimal 1 foto',
        'photo-source': 'camera_gallery',
        'max-file-size-kb': 10240,
        'min-uploaded-photos': 1,
        'max-uploaded-photos': 3,
      },
      sub('2. Apa yang Anda lihat?'),
      {
        type: 'TextArea',
        name: 'description',
        label: 'Tulis dengan kata-kata Anda',
        'label-variant': 'large',
        'helper-text': 'Contoh: daun kuning di dahan bawah; getah merah di batang; buah sebesar telor',
        required: true,
        'max-length': 600,
      },
      footer('Kirim Laporan', exchange({ description: '${form.description}', photos: '${form.photos}' })),
    ]),
  ]
);

const PANEN_MENU = screen(
  'PANEN_MENU',
  'Panen & Data Pohon',
  {
    panen_title: str('Panen & Data Pohon · A1 · MK · Blok A'),
    panen_hint: str('Saran: hitung buah di pohon.'),
    has_hint: bool(true),
    // Numbered by the server in season order (1. Mulai berbunga ... 6. Catat panen).
    stage_options: opts([
      { id: 'bloom', title: '1. Mulai berbunga', description: 'Bunga pertama mekar.' },
      { id: 'harvest', title: '2. Catat panen', description: 'Jumlah buah, berat, dan kelas mutu.' },
    ]),
  },
  [
    form('panen_form', [
      heading('${data.panen_title}'),
      body('${data.panen_hint}', { visible: '${data.has_hint}' }),
      { type: 'RadioButtonsGroup', name: 'stage', label: 'Pilih laporan', required: true, 'data-source': '${data.stage_options}' },
      footer('Lanjut', exchange({ stage: '${form.stage}' })),
    ]),
  ]
);

const BLOOM = screen(
  'BLOOM',
  'Mulai Berbunga',
  { bloom_title: str('Mulai berbunga · A1'), ...DATE_DATA, ...CONFIRM_DATA },
  [
    form('bloom_form', [
      heading('${data.bloom_title}'),
      body('Catat tanggal bunga pertama mekar. Tanggal ini dipakai untuk menghitung kapan buah siap dipanen.'),
      date('date', 'Tanggal bunga mekar', 'Pilih hari bunga mulai mekar, bukan saat kuncup.', '${data.min_date}', '${data.max_date}'),
      {
        type: 'RadioButtonsGroup',
        name: 'part',
        label: 'Bagian pohon yang berbunga',
        description: 'Jika hanya sebagian dahan yang berbunga, pilih bagiannya. Dahan lain yang berbunga di hari berbeda dilaporkan lagi nanti.',
        required: true,
        'data-source': [
          { id: 'whole', title: 'Seluruh pohon' },
          { id: 'lower', title: 'Dahan bawah' },
          { id: 'middle', title: 'Dahan tengah' },
          { id: 'upper', title: 'Dahan atas' },
          { id: 'some', title: 'Sebagian dahan' },
        ],
      },
      caption('Foto bunga, boleh kosong. Maksimal 3 foto.'),
      photoPicker('Foto bunga (boleh kosong)'),
      text('note', 'Catatan (boleh kosong)'),
      confirmBox('Ya, sudah benar'),
      footer('Simpan', exchange({ date: '${form.date}', part: '${form.part}', photos: '${form.photos}', note: '${form.note}', confirm: '${form.confirm}', warned: '${data.warned}' })),
    ]),
  ]
);

const COUNT = screen(
  'COUNT',
  'Hitung',
  {
    count_title: str('Hitung Buah di Pohon · A1'),
    count_help: str('Hitung buah yang masih menggantung di pohon.'),
    count_label: str('Jumlah buah di pohon'),
    stage: str('onTree'),
    wave_options: opts([{ id: '2026-06-10', title: '10 Jun 2026 · Seluruh pohon' }]),
    init_values: initObj(['wave'], { wave: '2026-06-10' }),
    ...CONFIRM_DATA,
  },
  [
    form(
      'count_form',
      [
        heading('${data.count_title}'),
        body('${data.count_help}'),
        { type: 'Dropdown', name: 'wave', label: 'Gelombang bunga', required: true, 'data-source': '${data.wave_options}' },
        num('count', '${data.count_label}', 'Tulis angka bulat, contoh: 120. Perkiraan boleh.'),
        caption('Foto pohon atau buah, boleh kosong. Maksimal 3 foto.'),
        photoPicker('Foto (boleh kosong)'),
        text('note', 'Catatan (boleh kosong)'),
        confirmBox('Ya, angka sudah benar'),
        footer('Simpan Hitungan', exchange({
          stage: '${data.stage}', wave: '${form.wave}', count: '${form.count}', photos: '${form.photos}', note: '${form.note}',
          confirm: '${form.confirm}', warned: '${data.warned}',
        })),
      ],
      '${data.init_values}'
    ),
  ]
);

const HARVEST_A = screen(
  'HARVEST_A',
  'Catat Panen',
  { harvest_title: str('Catat panen · A1'), ...DATE_DATA, init_values: initObj(['date'], { date: '2026-10-04' }), ...CONFIRM_DATA },
  [
    form(
      'harvest_a_form',
      [
        heading('${data.harvest_title}'),
        body('Langkah 1 dari 2: berapa buah yang dipanen dari pohon ini?'),
        date('date', 'Tanggal panen', 'Pilih hari buah dipanen.', '${data.min_date}', '${data.max_date}'),
        num('fruits', 'Jumlah buah dipanen', 'Angka bulat 1 sampai 500, contoh: 12.'),
        num('weight', 'Berat total (kg), boleh kosong', 'Timbang semua buah sekaligus. Contoh: 24,5.', false),
        confirmBox('Ya, sudah benar'),
        footer('Lanjut', exchange({
          date: '${form.date}', fruits: '${form.fruits}', weight: '${form.weight}', confirm: '${form.confirm}', warned: '${data.warned}',
        })),
      ],
      '${data.init_values}'
    ),
  ]
);

const HARVEST_B = screen(
  'HARVEST_B',
  'Mutu Panen',
  {
    harvest_b_title: str('Mutu panen · A1'),
    harvest_summary: str('Panen: 12 buah · 24 kg · 4 Okt 2026'),
    grade_help: str('Extra = bentuk dan matang sempurna. Jumlah semua kelas tidak boleh melebihi 12 buah.'),
    date: str('2026-10-04'),
    fruits: str('12'),
    weight: str('24'),
  },
  [
    form('harvest_b_form', [
      heading('${data.harvest_b_title}'),
      caption('${data.harvest_summary}'),
      body('Langkah 2 dari 2: kelas mutu. Boleh dilewati, tetapi sangat membantu pemilik.'),
      caption('${data.grade_help}'),
      num('extra', 'Extra (buah)', 'Kosongkan jika 0', false),
      num('class1', 'Kelas I (buah)', 'Kosongkan jika 0', false),
      num('class2', 'Kelas II (buah)', 'Kosongkan jika 0', false),
      num('reject', 'Afkir (buah)', 'Kosongkan jika 0', false),
      {
        type: 'CheckboxGroup',
        name: 'problems',
        label: 'Masalah mutu yang ditemukan',
        description: 'Pilih semua yang sesuai. Kosongkan jika tidak ada.',
        required: false,
        'data-source': [
          { id: 'wet_core', title: 'Inti basah' },
          { id: 'uneven', title: 'Tidak merata' },
          { id: 'rot', title: 'Busuk' },
          { id: 'crack', title: 'Retak' },
          { id: 'borer', title: 'Penggerek' },
        ],
      },
      num('problem_fruits', 'Berapa buah yang bermasalah?', 'Isi jika memilih masalah di atas.', false),
      sub('Foto (boleh dilewati)'),
      caption('Foto buah yang dipanen, atau buah yang bermasalah. Maksimal 3 foto.'),
      {
        type: 'PhotoPicker',
        name: 'photos',
        label: 'Ambil atau pilih foto',
        'photo-source': 'camera_gallery',
        'max-file-size-kb': 10240,
        'min-uploaded-photos': 0,
        'max-uploaded-photos': 3,
      },
      text('note', 'Catatan (boleh kosong)'),
      footer('Kirim Panen', exchange({
        date: '${data.date}', fruits: '${data.fruits}', weight: '${data.weight}',
        extra: '${form.extra}', class1: '${form.class1}', class2: '${form.class2}', reject: '${form.reject}',
        problems: '${form.problems}', problem_fruits: '${form.problem_fruits}', photos: '${form.photos}', note: '${form.note}',
      })),
    ]),
  ]
);

const EDIT_TREE = screen(
  'EDIT_TREE',
  'Ubah Data Pohon',
  {
    edit_title: str('Ubah data A1 · MK · Blok A'),
    init_values: initObj(['canopy', 'trunk', 'branches', 'notes'], {
      canopy: '520', trunk: '43', branches: '2', notes: 'Catatan pohon',
    }),
  },
  [
    form(
      'edit_form',
      [
        heading('${data.edit_title}'),
        body('Nilai saat ini sudah terisi. Ubah hanya yang berbeda; yang lain tetap tersimpan.'),
        num('canopy', 'Lebar kanopi (cm)', 'Ukur sisi terlebar, 50-2500 cm. Contoh: 520', false),
        num('trunk', 'Lingkar batang (cm)', 'Ukur setinggi dada, 1-600 cm. Contoh: 43', false),
        num('branches', 'Dahan berbunga', 'Jumlah dahan yang sedang berbunga. Contoh: 3', false),
        caption('Tandan bunga dan jumlah buah dicatat lewat menu hitung, supaya riwayatnya tersimpan.'),
        {
          type: 'TextArea', name: 'notes', label: 'Catatan', 'label-variant': 'large',
          'helper-text': 'Kosongkan untuk menghapus catatan', required: false, 'max-length': 500,
        },
        footer('Simpan Perubahan', exchange({
          canopy: '${form.canopy}', trunk: '${form.trunk}', branches: '${form.branches}', notes: '${form.notes}',
        })),
      ],
      '${data.init_values}'
    ),
  ]
);

const treeFlow = {
  version: '7.3',
  data_api_version: '3.0',
  routing_model: {
    // DONE is also where a step ends when the tree has gone (archived or removed) while the Flow was open.
    TREE_LOOKUP: ['MENU', 'EDIT_TREE', 'DONE'],
    MENU: ['REPORT', 'PANEN_MENU', 'DONE'],
    REPORT: ['DONE'],
    PANEN_MENU: ['BLOOM', 'COUNT', 'HARVEST_A', 'DONE'],
    BLOOM: ['DONE'],
    COUNT: ['DONE'],
    HARVEST_A: ['HARVEST_B', 'DONE'],
    HARVEST_B: ['DONE'],
    EDIT_TREE: ['DONE'],
    DONE: [],
  },
  screens: [TREE_LOOKUP, MENU, REPORT, PANEN_MENU, BLOOM, COUNT, HARVEST_A, HARVEST_B, EDIT_TREE, DONE],
};

// =====================================================================================================
// Flow 2: Catatan Kebun (rain and finished work, per block, no tree)
// =====================================================================================================

const FARM_HOME = screen(
  'FARM_HOME',
  'Catatan Kebun',
  {},
  [
    form('farm_form', [
      heading('Catatan Kebun'),
      body('Catat hujan atau pekerjaan yang sudah selesai di kebun. Tidak perlu memilih pohon.'),
      {
        type: 'RadioButtonsGroup',
        name: 'choice',
        label: 'Apa yang ingin dicatat?',
        required: true,
        'data-source': [
          { id: 'rain', title: '🌧️ Curah Hujan', description: 'Angka dari penakar hujan, dalam milimeter (mm).' },
          { id: 'work', title: '✅ Pekerjaan Selesai', description: 'Penyerbukan, buang buah berlebih, brongsong, dll. per blok.' },
        ],
      },
      footer('Lanjut', exchange({ choice: '${form.choice}' })),
    ]),
  ]
);

const KERJA = screen(
  'KERJA',
  'Pekerjaan Selesai',
  {
    work_title: str('Pekerjaan Selesai'),
    block_options: opts([{ id: 'A', title: 'Blok A' }]),
    ...DATE_DATA,
    init_values: initObj(['date'], { date: '2026-10-04' }),
  },
  [
    form(
      'work_form',
      [
        heading('${data.work_title}'),
        body('Catat pekerjaan yang sudah selesai di satu blok. Cukup sekali per pekerjaan untuk musim ini.'),
        { type: 'Dropdown', name: 'block', label: 'Blok', required: true, 'data-source': '${data.block_options}' },
        {
          type: 'CheckboxGroup',
          name: 'tasks',
          label: 'Pekerjaan yang selesai',
          required: true,
          'min-selected-items': 1,
          'data-source': [
            { id: 'hand_pollination', title: 'Penyerbukan tangan' },
            { id: 'fruit_thinning', title: 'Buang buah berlebih' },
            { id: 'bagging', title: 'Brongsong buah' },
            { id: 'ca_mg_spray', title: 'Semprot Ca + Mg' },
            { id: 'fruit_tying', title: 'Ikat tangkai buah' },
          ],
        },
        date('date', 'Tanggal selesai', 'Boleh sampai 30 hari ke belakang.', '${data.min_date}', '${data.max_date}'),
        footer('Simpan', exchange({ block: '${form.block}', tasks: '${form.tasks}', date: '${form.date}' })),
      ],
      '${data.init_values}'
    ),
  ]
);

const HUJAN = screen(
  'HUJAN',
  'Curah Hujan',
  { rain_title: str('Curah Hujan'), ...DATE_DATA, init_values: initObj(['date'], { date: '2026-10-04' }), ...CONFIRM_DATA },
  [
    form(
      'rain_form',
      [
        heading('${data.rain_title}'),
        body('Baca penakar hujan, lalu tulis angkanya dalam milimeter (mm). Isi 0 jika tidak hujan.'),
        date('date', 'Tanggal', 'Boleh sampai 7 hari ke belakang.', '${data.min_date}', '${data.max_date}'),
        num('mm', 'Curah hujan (mm)', 'Angka 0 sampai 400. Contoh: 12,5.'),
        confirmBox('Ya, angka sudah benar'),
        footer('Simpan', exchange({ date: '${form.date}', mm: '${form.mm}', confirm: '${form.confirm}', warned: '${data.warned}' })),
      ],
      '${data.init_values}'
    ),
  ]
);

const farmFlow = {
  version: '7.3',
  data_api_version: '3.0',
  routing_model: { FARM_HOME: ['KERJA', 'HUJAN'], KERJA: ['DONE'], HUJAN: ['DONE'], DONE: [] },
  screens: [FARM_HOME, KERJA, HUJAN, DONE],
};

const root = path.join(__dirname, '..');
// =====================================================================================================
// Flow 3: Laporan (unified): photos + words, one screen. Gemini reads it after saving (lib/ai.js). Use as FLOW_ID.
// =====================================================================================================
const LAPOR = screen(
  'REPORT',
  'Laporan Pohon',
  { report_title: str('Laporan untuk A1 · MK · Blok A'), condition_caption: str('Kondisi saat ini: Hijau') },
  [
    form('report_form', [
      heading('${data.report_title}'),
      caption('${data.condition_caption}'),
      body('Foto pohon, lalu tulis apa yang Anda lihat: bunga, buah, hama, penyakit, atau panen. Sistem membaca foto dan tulisan Anda.'),
      sub('1. Foto'),
      caption('Satu foto dari dekat, satu foto seluruh pohon. Terang dan tidak buram.'),
      {
        type: 'PhotoPicker',
        name: 'photos',
        label: 'Ambil atau pilih foto',
        description: 'Minimal 1 foto',
        'photo-source': 'camera_gallery',
        'max-file-size-kb': 10240,
        'min-uploaded-photos': 1,
        'max-uploaded-photos': 3,
      },
      sub('2. Apa yang Anda lihat?'),
      {
        type: 'TextArea',
        name: 'description',
        label: 'Tulis dengan kata-kata Anda',
        'label-variant': 'large',
        'helper-text': 'Contoh: bunga mulai mekar; 40 buah sebesar telor; getah di batang',
        required: true,
        'max-length': 600,
      },
      footer('Kirim Laporan', exchange({ description: '${form.description}', photos: '${form.photos}' })),
    ]),
  ]
);
const reportFlow = { version: '7.3', data_api_version: '3.0', routing_model: { REPORT: ['DONE'], DONE: [] }, screens: [LAPOR, DONE] };

fs.writeFileSync(path.join(root, 'flows', 'flow.json'), JSON.stringify(treeFlow, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'flows', 'flow-lapor.json'), JSON.stringify(reportFlow, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'flows', 'flow-farm.json'), JSON.stringify(farmFlow, null, 2) + '\n');
console.log(`flow.json: ${treeFlow.screens.length} screens, flow-farm.json: ${farmFlow.screens.length} screens`);
