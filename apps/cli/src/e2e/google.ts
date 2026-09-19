import fs from 'fs/promises';
import { GoogleDriveSheetsCloudSyncProvider } from '@quomida/cloud-providers';
import { CREDENTIALS_PATH } from '../auth.js';

async function main() {
    console.log('====================================================');
    console.log('  🚀 Quomida E2E Test - Google Drive Adapter');
    console.log('====================================================');

    try {
        const credentialsData = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
        const credentials = JSON.parse(credentialsData);

        if (!credentials.access_token) {
            throw new Error("No access_token found in credentials.json. Please run 'npm run login' first.");
        }

        console.log(`✅ Loaded credentials for user: ${credentials.user?.email}`);

        const adapter = new GoogleDriveSheetsCloudSyncProvider();
        console.log('Initializing adapter...');
        
        await adapter.initialize({
            accessToken: credentials.access_token,
            userEmail: credentials.user?.email
        });

        if (!adapter.isInitialized()) {
            throw new Error("Adapter failed to initialize properly.");
        }

        console.log(`✅ Adapter initialized. Status: ${adapter.getStatus()}`);
        console.log(`Connected account: ${adapter.getConnectedAccount()}`);

        const dummyIngredientPayload = {
            collection: 'base_ingredients',
            documents: [
                {
                    id: 'ing-e2e-test-1',
                    name: 'E2E Test Ingredient',
                    source: 'system',
                    lang: 'en',
                    calories_100g: 100,
                    protein_100g: 10,
                    carbs_100g: 10,
                    fats_100g: 5,
                    _updatedAt: Date.now()
                }
            ],
            checkpoint: Date.now().toString()
        };

        const dummyLogPayload = {
            collection: 'daily_logs',
            documents: [
                {
                    id: 'log-e2e-test-1',
                    timestamp: new Date().toISOString(),
                    date: '2026-09-18',
                    meal_type: 'meal_lunch',
                    food_reference_id: 'ing-e2e-test-1',
                    food_name: 'E2E Test Ingredient',
                    quantity: 2,
                    portion_name: '100g serving',
                    macros: {
                        calories: 200,
                        protein: 20,
                        carbs: 20,
                        fats: 10
                    },
                    _updatedAt: Date.now()
                }
            ],
            checkpoint: Date.now().toString()
        };

        console.log('\n📤 Testing PUSH operation (base_ingredients)...');
        await adapter.push(dummyIngredientPayload);
        console.log('✅ Push ingredients completed successfully.');

        console.log('\n📤 Testing PUSH operation (daily_logs)...');
        await adapter.push(dummyLogPayload);
        console.log('✅ Push daily_logs completed successfully.');

        console.log('\n📥 Testing PULL operation...');
        const pullResult = await adapter.pull();
        console.log('Pull result:', JSON.stringify(pullResult, null, 2));
        console.log('✅ Pull completed successfully.');

        console.log('\n🎉 E2E Test Completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('\n❌ E2E Test failed:', err);
        process.exit(1);
    }
}

main();
