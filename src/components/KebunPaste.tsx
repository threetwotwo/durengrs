import React, { useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { type EditField, changesByTree, parsePaste, pasteDiff, treeDraft } from '../lib/kebun';
import { Sheet, fieldLabel } from './Sheet';
import { btnPrimary, btnSecondary } from './PageHeader';

const FIELD_LABEL: Record<EditField, string> = {
  canopySize: 'kebun.col.tajuk',
  trunkSize: 'kebun.col.batang',
  floweringBranches: 'kebun.col.dahan',
  floweringClusters: 'kebun.col.est',
  estimatedFruitCount: 'kebun.col.buah',
  supplier: 'trees.col.supplier',
  notes: 'common.notes',
};

/**
 * Paste rows from Google Sheets: the first row names the columns (Pohon, Tajuk, Batang, Dahan, Bonggol, Est. Butir,
 * Buah, Catatan...). Shows only the cells that would change, then saves them per tree, each change logged.
 */
export const KebunPasteSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useT();
  const { trees, updateTree } = useFarm();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ ok: number; failed: number } | null>(null);

  const parsed = useMemo(() => (text.trim() ? parsePaste(text) : null), [text]);
  const diff = useMemo(() => (parsed && !('error' in parsed) ? pasteDiff(parsed, trees) : null), [parsed, trees]);
  const byId = useMemo(() => new Map(trees.map((x) => [x.id, x])), [trees]);

  const apply = async () => {
    if (!diff) return;
    setBusy(true);
    let ok = 0;
    let failed = 0;
    for (const [id, patch] of changesByTree(diff.changes)) {
      const tree = byId.get(id);
      if (!tree) continue;
      if (await updateTree(tree, treeDraft(tree, patch))) ok++;
      else failed++;
    }
    setBusy(false);
    setDone({ ok, failed });
    setText('');
  };

  const n = diff?.changes.length || 0;
  return (
    <Sheet
      title={t('kebun.paste.title')}
      subtitle={t('kebun.paste.sub')}
      onClose={onClose}
      footer={
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className={btnSecondary}>
            {t('common.close')}
          </button>
          <button type="button" disabled={!n || busy} onClick={apply} className={`${btnPrimary} disabled:opacity-50`}>
            {busy ? t('kebun.paste.saving') : t('kebun.paste.apply', { n })}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {done && (
          <p role="status" className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            {t('kebun.paste.done', { n: done.ok })}
            {done.failed > 0 && <span className="text-rose-700"> {t('kebun.paste.failed', { n: done.failed })}</span>}
          </p>
        )}
        <label className="block">
          <span className={fieldLabel}>{t('kebun.paste.label')}</span>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setDone(null);
            }}
            rows={6}
            placeholder={'Pohon\tTajuk\tBatang\tDahan\tBonggol\tCatatan\nA1\t400\t62\t3\t4\tPp'}
            className="w-full p-2.5 rounded-lg border border-slate-300 font-mono text-xs focus:outline-2 focus:outline-emerald-500"
          />
        </label>
        <p className="text-xs text-slate-600">{t('kebun.paste.help')}</p>

        {parsed && 'error' in parsed && <p className="text-sm text-amber-800">{t(`kebun.paste.err.${parsed.error}`)}</p>}

        {diff && (
          <div className="space-y-2">
            <p className="text-sm text-slate-800">
              {t('kebun.paste.summary', { n, same: diff.same })}
              {diff.ignored.length > 0 && <span className="text-slate-500"> {t('kebun.paste.ignored', { cols: diff.ignored.join(', ') })}</span>}
            </p>
            {diff.unknown.length > 0 && <p className="text-xs text-amber-800">{t('kebun.paste.unknown', { ids: diff.unknown.slice(0, 20).join(', ') })}</p>}
            {diff.errors.length > 0 && (
              <ul className="text-xs text-rose-700 space-y-0.5">
                {diff.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>
                    {e.treeId} · {t(FIELD_LABEL[e.field])} “{e.raw}”: {t(e.error.key, e.error.vars)}
                  </li>
                ))}
              </ul>
            )}
            {n > 0 && (
              <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-600 sticky top-0">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-semibold">{t('common.tree')}</th>
                      <th className="px-3 py-1.5 text-left font-semibold">{t('kebun.paste.col')}</th>
                      <th className="px-3 py-1.5 text-right font-semibold">{t('kebun.paste.now')}</th>
                      <th className="px-3 py-1.5 text-right font-semibold">{t('kebun.paste.new')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {diff.changes.map((c, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 font-mono font-bold">{c.treeId}</td>
                        <td className="px-3 py-1.5">{t(FIELD_LABEL[c.field])}</td>
                        <td className="px-3 py-1.5 text-right text-slate-500 tabular max-w-[160px] truncate">{c.from || '—'}</td>
                        <td className="px-3 py-1.5 text-right font-semibold tabular max-w-[160px] truncate">{c.to ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
};
