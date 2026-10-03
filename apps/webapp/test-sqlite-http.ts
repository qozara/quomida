import { createSQLiteThread } from 'sqlite-wasm-http';

async function run() {
  console.log('Initializing sqlite-wasm-http...');
  try {
    const worker = await createSQLiteThread({
      http: {
        url: 'https://preview.data.quomida.qozara.org/catalog.sqlite',
        maxPageSize: 4096,
        cacheSize: 4096,
        maxConnections: 1
      }
    });

    console.log('Worker initialized. Running count...');
    const countRes = await worker('exec', { sql: 'SELECT count(*) FROM base_ingredients', rowMode: 'array' } as any);
    console.log('Count result:', countRes);

    console.log('Running search for Banana...');
    const searchRes = await worker('exec', { 
      sql: `SELECT id FROM base_ingredients_fts WHERE base_ingredients_fts MATCH 'Banana' LIMIT 10`, 
      rowMode: 'array' 
    } as any);
    console.log('Search result:', searchRes);

    await worker('close', {});
    console.log('Done.');
  } catch (err) {
    console.error('Error in sqlite-wasm-http:', err);
  }
}

run().catch(console.error);
