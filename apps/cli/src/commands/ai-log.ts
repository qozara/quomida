import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { MealService, type BaseIngredient, type Portion, type ICatalogProvider } from '@quomida/domain-core';
import { LlmRecipeDecomposer } from '@quomida/ai-services';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '../../../etl-pipeline/dist-cdn/catalog.sqlite');

/**
 * SQLite Catalog Provider adapter for Node.js CLI runtime.
 */
class NodeSqliteCatalogProvider implements ICatalogProvider {
  private db: DatabaseSync | null = null;

  private getDb(): DatabaseSync | null {
    if (this.db) return this.db;
    try {
      this.db = new DatabaseSync(dbPath);
      return this.db;
    } catch {
      return null;
    }
  }

  async searchIngredients(query: string, limit: number = 10): Promise<BaseIngredient[]> {
    const db = this.getDb();
    if (!db) return [];

    try {
      const searchStmt = db.prepare(`
        SELECT * FROM base_ingredients
        WHERE name LIKE ?
        LIMIT ?
      `);
      const rows = searchStmt.all(`%${query}%`, limit) as any[];
      return rows.map(r => ({
        id: r.id,
        name: r.name,
        source: r.source || 'system',
        lang: r.lang || 'es',
        calories_100g: Number(r.calories_100g) || 0,
        protein_100g: Number(r.protein_100g) || 0,
        carbs_100g: Number(r.carbs_100g) || 0,
        fats_100g: Number(r.fats_100g) || 0,
        contentHash: r.contentHash || ''
      }));
    } catch (e) {
      console.warn('[CLI Catalog] Search error:', e);
      return [];
    }
  }

  async getPortionsForIngredient(ingredientId: string): Promise<Portion[]> {
    const db = this.getDb();
    if (!db) return [];

    try {
      const portionsStmt = db.prepare(`
        SELECT * FROM portions WHERE base_food_id = ?
      `);
      const rows = portionsStmt.all(ingredientId) as any[];
      return rows.map(r => ({
        id: r.id,
        base_food_id: r.base_food_id,
        name: r.name,
        equivalent_weight_g: Number(r.equivalent_weight_g) || 100,
        source: 'system' as const
      }));
    } catch (e) {
      console.warn('[CLI Catalog] Portions error:', e);
      return [];
    }
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

async function runCliAiLog() {
  const query = process.argv.slice(2).join(' ').trim();
  if (!query) {
    console.log('Usage: npm run ai --workspace=@quomida/cli -- "<natural language meal description>"');
    console.log('Example: npm run ai --workspace=@quomida/cli -- "desayuné dos empanadas de carne"');
    process.exit(1);
  }

  console.log(`\n🥗 Quomida AI Meal Logger (Headless CLI)`);
  console.log(`Analyzing: "${query}"...\n`);

  const catalog = new NodeSqliteCatalogProvider();

  // If AI_PROXY_URL is set in environment, use LlmRecipeDecomposer for uncataloged cultural dishes; otherwise runs 100% offline
  const proxyUrl = process.env.AI_PROXY_URL || process.env.VITE_AI_PROXY_URL;
  const decomposer = proxyUrl
    ? new LlmRecipeDecomposer({
        proxyUrl,
        provider: (process.env.AI_PROVIDER as any) || 'qozara-intelligence',
        ciphertext: process.env.AI_CIPHERTEXT,
        ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
        ollamaModel: process.env.OLLAMA_MODEL
      })
    : undefined;

  const service = new MealService({ decomposer });

  try {
    const resolvedMeal = await service.processMeal({
      input: query,
      catalogProvider: catalog
    });

    console.log(`Detected Meal Time: ${resolvedMeal.detectedMealType.toUpperCase()}`);
    console.log(`Identified Foods (${resolvedMeal.items.length}):`);
    console.log(`--------------------------------------------------`);

    for (const item of resolvedMeal.items) {
      const foodName = item.food ? item.food.name : `[Unmatched: ${item.rawQuery}]`;
      console.log(`* ${foodName}`);
      console.log(`  Quantity: ${item.quantity} ${item.selectedPortionName} (~${Math.round(item.calculatedWeightGrams)}g)`);
      console.log(`  Calories: ${Math.round(item.macros.calories)} kcal | Protein: ${item.macros.protein}g | Carbs: ${item.macros.carbs}g | Fats: ${item.macros.fats}g\n`);
    }

    console.log(`==================================================`);
    console.log(`TOTAL MEAL NUTRITION:`);
    console.log(`Calories: ${Math.round(resolvedMeal.totalMacros.calories)} kcal`);
    console.log(`Protein:  ${Math.round(resolvedMeal.totalMacros.protein * 10) / 10} g`);
    console.log(`Carbs:    ${Math.round(resolvedMeal.totalMacros.carbs * 10) / 10} g`);
    console.log(`Fats:     ${Math.round(resolvedMeal.totalMacros.fats * 10) / 10} g`);
    console.log(`==================================================\n`);
  } catch (err: unknown) {
    if (err instanceof AiMealError) {
      switch (err.code) {
        case 'RATE_LIMIT_EXCEEDED':
          console.error(`[Error 429] Daily AI quota exceeded. Provide a personal Gemini API key via GEMINI_API_KEY.`);
          break;
        case 'AI_DISABLED':
          console.error(`[Error] AI is disabled in configuration.`);
          break;
        case 'NO_ITEMS_PARSED':
          console.error(`[Notice] Could not extract any recognizable food items from description.`);
          break;
        default:
          console.error(`[Error ${err.code}] ${err.message}`);
          break;
      }
    } else {
      console.error(`Failed to process meal:`, err);
    }
  } finally {
    catalog.close();
  }
}

runCliAiLog();
