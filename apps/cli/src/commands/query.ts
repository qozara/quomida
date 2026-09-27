import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '../../../webapp/public/catalog.sqlite');

function searchCatalog(query: string) {
  try {
    const db = new DatabaseSync(dbPath);
    
    console.log(`Searching for: "${query}" in ${dbPath}...`);
    const searchStmt = db.prepare(`
      SELECT * FROM base_ingredients 
      WHERE name LIKE ? 
      LIMIT 10
    `);
    const results = searchStmt.all(`%${query}%`) as any[];
    
    if (results.length === 0) {
      console.log('No ingredients found.');
      return;
    }
    
    const getPortionsStmt = db.prepare(`
      SELECT * FROM portions WHERE base_food_id = ?
    `);

    for (const item of results) {
      console.log(`\n- [${item.id}] ${item.name} (Source: ${item.source}, Lang: ${item.lang})`);
      console.log(`  Macros/100g: Calories: ${item.calories_100g}, Protein: ${item.protein_100g}g, Carbs: ${item.carbs_100g}g, Fats: ${item.fats_100g}g`);
      
      const portions = getPortionsStmt.all(item.id) as any[];
      if (portions.length > 0) {
        console.log(`  Portions:`);
        for (const p of portions) {
          console.log(`    * ${p.name}: ${p.equivalent_weight_g}g`);
        }
      } else {
        console.log(`  Portions: None`);
      }
    }
    
    db.close();
  } catch (err: any) {
    console.error(`Error querying catalog: ${err.message}`);
  }
}

function countPortionLinkedIngredients() {
  try {
    const db = new DatabaseSync(dbPath);
    
    console.log(`Counting ingredients with specific portions...`);
    const countStmt = db.prepare(`
      SELECT COUNT(DISTINCT base_food_id) as count FROM portions
    `);
    const result = countStmt.get() as any;
    
    console.log(`Total ingredients with specific portions: ${result.count}`);
    
    db.close();
  } catch (err: any) {
    console.error(`Error querying catalog: ${err.message}`);
  }
}

const args = process.argv.slice(2);
const command = args[0];

if (command === 'search') {
  const query = args[1];
  if (!query) {
    console.error('Please provide a search term.');
    process.exit(1);
  }
  searchCatalog(query);
} else if (command === 'count-portions') {
  countPortionLinkedIngredients();
} else {
  console.log(`Usage:`);
  console.log(`  npm run query search "apple"    # Search ingredients by name`);
  console.log(`  npm run query count-portions    # Count how many ingredients have specific portions`);
}
