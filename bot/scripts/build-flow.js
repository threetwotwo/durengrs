// scripts/build-flow.js — writes the two Flow files (WhatsApp Flow JSON v7.3):
//   flows/flow.json       "Laporan Pohon"   both buttons under a tree ID (env FLOW_ID):
//                                           Laporan KESEHATAN: REPORT (photos + words);
//                                           Laporan PANEN: PANEN (fruits picked up today) -> BUAH_A.. (each weighed and scored)
//   flows/flow-farm.json  "Catatan Kebun"   rain and finished work, no tree needed (env FARM_FLOW_ID)
// Run: npm run build-flow     Then paste each file into its OWN new Flow (a published Flow can't be edited).
// All worker-facing text is Indonesian. Rules and ranges live on the server (lib/rules.js); the Flow only draws.
//
// Two rules learned the hard way (both are checked in test/flow.test.js):
//  * a dynamic property must be the WHOLE value: "${data.title}", never "Pohon ${data.title}" (shows literally);
//  * DatePicker has no label-variant;
//  * ids (screens) and names may hold letters and underscores only: BUAH_A, berat_a (no digits).
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
const date = (name, label, helper, min, max) => ({
  type: 'DatePicker', name, label, required: true, 'helper-text': helper,
  ...(min ? { 'min-date': min } : {}), ...(max ? { 'max-date': max } : {}),
});
const confirmBox = (label) => ({ type: 'OptIn', name: 'confirm', label, required: false, visible: '${data.needs_confirm}' });
const screen = (id, title, data, children, extra = {}) => ({ id, title, ...extra, data, layout: { type: 'SingleColumnLayout', children } });

const CONFIRM_DATA = { needs_confirm: bool(false), warned: str('') };
const DATE_DATA = { min_date: str('2026-08-01'), max_date: str('2026-10-04') };

// `message` also goes back in the tree Flow (the harvest summary for the chat); the farm Flow keeps its published DONE.
const doneScreen = (withMessage) => screen(
  'DONE',
  'Selesai',
  { title: str('✅ Laporan tersimpan'), message: str('Laporan untuk A1 tersimpan.'), saved: bool(true), report_id: str('') },
  // `saved` and `report_id` go back with the completion: the chat message that follows can tell "saved" from "not
  // saved", and the bot reads the saved report's photos with Gemini (lib/ai.js) before answering.
  [
    heading('${data.title}'),
    body('${data.message}'),
    footer('Tutup', { name: 'complete', payload: { saved: '${data.saved}', report_id: '${data.report_id}', ...(withMessage ? { message: '${data.message}' } : {}) } }),
  ],
  { terminal: true, success: true }
);
const DONE = doneScreen(true);
const FARM_DONE = doneScreen(false);

// =====================================================================================================
// Flow 1: Laporan Pohon — photos + words on one screen, nothing to choose. The server saves the report
// (lib/flowScreens.js handleReport); when the Flow completes, Gemini reads it and the bot replies in the chat (lib/ai.js).
// =====================================================================================================

const REPORT = screen(
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


// =====================================================================================================
// Laporan PANEN (same Flow): how many fruits were picked up from the tree today, then each fruit: weight in grams and
// aroma, kulit (skin) and bentuk (shape) 1-5, all typed. Flows have no table or repeating field, so the fruits come
// five per screen; the server shows only as many slots as fruits and carries what earlier screens held
// (lib/flowScreens.js handlePanen / handleFruits). 8 screens: up to 40 fruits per report.
// =====================================================================================================

const SLOTS = ['a', 'b', 'c', 'd', 'e']; // lib/rules.js FRUITS_PER_SCREEN
const PAGES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']; // rules.js LIMITS.harvestReportFruits = 5 x 8
const numIn = (name, label, helper, slot) => ({
  type: 'TextInput', name, label, 'input-type': 'number', ...(helper ? { 'helper-text': helper } : {}), required: false, visible: `\${data.show_${slot}}`,
});

const PANEN = screen(
  'PANEN',
  'Laporan Panen',
  { panen_title: str('Panen A1 · MK · Blok A'), today_caption: str('Hari ini, 21 Okt 2026') },
  [
    form('panen_form', [
      heading('${data.panen_title}'),
      caption('${data.today_caption}'),
      body('Hitung semua buah dari pohon ini yang dipungut hari ini. Setelah itu, isi berat dan nilai tiap buah.'),
      num('count', 'Berapa buah dipungut hari ini?', 'Satu laporan paling banyak 40 buah.'),
      footer('Lanjut', exchange({ count: '${form.count}' })),
    ]),
  ]
);

function fruitScreen(page) {
  const data = {
    fruits_title: str('Buah 1–5 dari 6'),
    next_label: str('Lanjut'),
    count: str('6'),
    collected: str('[]'),
    ...Object.fromEntries(SLOTS.flatMap((x, i) => [[`show_${x}`, bool(true)], [`label_${x}`, str(`Buah ${i + 1}`)]])),
  };
  const children = [
    heading('${data.fruits_title}'),
    body('Timbang tiap buah. Lalu beri nilai 1 sampai 5:'),
    caption('Aroma: 5 = wangi kuat & segar, 1 = tidak wangi'),
    caption('Kulit: 5 = mulus sempurna, 1 = cacat (bolong, retak)'),
    caption('Bentuk: 5 = bulat sempurna, 1 = peyang beberapa ruas'),
  ];
  const payload = { count: '${data.count}', collected: '${data.collected}' };
  for (const x of SLOTS) {
    children.push(
      { type: 'TextSubheading', text: `\${data.label_${x}}`, visible: `\${data.show_${x}}` },
      numIn(`berat_${x}`, 'Berat (gram)', 'Contoh: 2350 untuk 2,35 kg', x),
      numIn(`aroma_${x}`, 'Aroma (1-5)', '', x),
      numIn(`kulit_${x}`, 'Kulit (1-5)', '', x),
      numIn(`bentuk_${x}`, 'Bentuk (1-5)', '', x)
    );
    for (const f of ['berat', 'aroma', 'kulit', 'bentuk']) payload[`${f}_${x}`] = `\${form.${f}_${x}}`;
  }
  children.push(footer('${data.next_label}', exchange(payload)));
  return screen(`BUAH_${page}`, 'Berat & Nilai Buah', data, [form(`fruit_form_${page.toLowerCase()}`, children)]);
}
const FRUITS = PAGES.map(fruitScreen);

// One Flow for both buttons: the server opens REPORT or PANEN (the flow token says which). REPORT -> PANEN is never
// taken; it keeps one entry screen. DONE is also where the Flow ends when the tree has gone while it was open.
const treeFlow = {
  version: '7.3',
  data_api_version: '3.0',
  routing_model: {
    REPORT: ['DONE', 'PANEN'],
    PANEN: ['BUAH_A', 'DONE'],
    ...Object.fromEntries(PAGES.map((p, i) => [`BUAH_${p}`, i < PAGES.length - 1 ? [`BUAH_${PAGES[i + 1]}`, 'DONE'] : ['DONE']])),
    DONE: [],
  },
  screens: [REPORT, PANEN, ...FRUITS, DONE],
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
  screens: [FARM_HOME, KERJA, HUJAN, FARM_DONE],
};

const root = path.join(__dirname, '..');
fs.writeFileSync(path.join(root, 'flows', 'flow.json'), JSON.stringify(treeFlow, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'flows', 'flow-farm.json'), JSON.stringify(farmFlow, null, 2) + '\n');
console.log(`flow.json: ${treeFlow.screens.length} screens, flow-farm.json: ${farmFlow.screens.length} screens`);
