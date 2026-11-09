import { useMemo } from 'react';
import { useFarm } from '../context/FarmContext';
import { type FruitRow, fruitRows, withTreeGrades } from '../lib/fruits';

/** Every fruit the farm loaded (this season's harvests), with the tree's variety when the harvest has none. */
export function useFruits(): FruitRow[] {
  const { harvests, allTrees, treeGrades } = useFarm();
  return useMemo(() => {
    const variety = new Map(allTrees.map((x) => [x.id, x.variant]));
    return withTreeGrades(fruitRows(harvests, (id) => variety.get(id)), treeGrades);
  }, [harvests, allTrees, treeGrades]);
}

export const useVarietyName = () => {
  const { variants } = useFarm();
  return useMemo(() => {
    const names = new Map(variants.map((v) => [v.code, v.name]));
    return (code?: string) => (code ? names.get(code) || code : '');
  }, [variants]);
};
