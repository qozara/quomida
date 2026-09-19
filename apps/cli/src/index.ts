import { calculateItemMacros } from '@quomida/domain-core';
import { MockCloudSyncProvider } from '@quomida/cloud-providers';

console.log('====================================================');
console.log('  🥗 Quomida CLI Admin & Domain Core Test Tool');
console.log('====================================================');

const sampleCut = {
  id: 'ing-vacambre',
  name: 'Vacío vacuno (crudo)',
  source: 'system' as const,
  lang: 'es',
  calories_100g: 175,
  protein_100g: 20.5,
  carbs_100g: 0,
  fats_100g: 10.5
};

const macros200g = calculateItemMacros(sampleCut, 200);
console.log(`\nSample Item: ${sampleCut.name}`);
console.log(`Weight: 200g`);
console.log(`Calculated Macros: ${macros200g.calories} kcal | Protein: ${macros200g.protein}g | Carbs: ${macros200g.carbs}g | Fats: ${macros200g.fats}g`);

async function testSync() {
  const adapter = new MockCloudSyncProvider();
  await adapter.initialize('cli-mock-auth');
  console.log(`\nMock Sync Status: ${adapter.getStatus()}`);
  console.log('====================================================\n');
}

testSync();
