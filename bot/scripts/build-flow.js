// scripts/build-flow.js — writes the two Flow files (WhatsApp Flow JSON v7.3):
//   flows/flow.json       "Laporan Pohon"   one screen: photos + words; opened after a worker sends a tree ID  (env FLOW_ID)
//   flows/flow-farm.json  "Catatan Kebun"   rain and finished work, no tree needed                             (env FARM_FLOW_ID)
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

// DONE is also where the Flow ends when the tree has gone (archived or removed) while it was open.
const treeFlow = { version: '7.3', data_api_version: '3.0', routing_model: { REPORT: ['DONE'], DONE: [] }, screens: [REPORT, DONE] };

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
fs.writeFileSync(path.join(root, 'flows', 'flow.json'), JSON.stringify(treeFlow, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'flows', 'flow-farm.json'), JSON.stringify(farmFlow, null, 2) + '\n');
console.log(`flow.json: ${treeFlow.screens.length} screens, flow-farm.json: ${farmFlow.screens.length} screens`);
