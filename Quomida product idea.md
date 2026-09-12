### **Calorie Counter App Inspired by Fitia**

### **Performance of Open Databases for Latin American Food**

|  |  |  |  |  |
| :---- | :---- | :---- | :---- | :---- |
| **Source** | **Base Foods & Ingredients** | **Prepared / Regional Dishes** | **Local Meat Cuts** | **API Status** |
| **USDA / FoodData Central** | **Excellent (10/10)** Laboratory analytical values. | **Null (1/10)** Only standard US preparations. | **Low (3/10)** US nomenclature and cuts (sirloin, ribeye, etc.). | Public REST API and JSON/CSV dumps. |
| **Open Food Facts** | **Good (7/10)** Focused on packaged products. | **Poor (3/10)** Incomplete and noisy data for home-cooked meals. | **Null (1/10)** Does not model fresh butchery. | Public REST API and Parquet/JSONL dumps. |
| **LATINFOODS / ARGENFOODS / TBCA** | **Excellent (9/10)** Data validated by INTA, UBA, UNLu, etc. | **Very Good (8/10)** Typical recipes and traditional preparations. | **Excellent (10/10)** Specific cuts (vacío, asado de tira, matambre, entraña, etc.). | No modern REST API (datasets in CSV, Excel, Access). |

### **Is it possible to build a solution like Fitia?**

**Yes, it is totally viable.** Fitia did not discover new nutritional biochemistry; its true value lies in how it structured its data model:

> 1. **Curated catalog:** They did not allow users to pollute the database with duplicates (the problem that ruined MyFitnessPal).  
> 2. **Compound recipe model:** They modeled typical dishes from base ingredients by applying cooking factors.  
> 3. **Household portion units:** They mapped practical measurements (*1 unit*, *1 medium serving*, *1 tablespoon*) instead of always forcing weighing in grams.

### **Recommended architecture to build your own database**

$$ARGENFOODS / LATINFOODS$$  
\--\>

$$ETL Pipeline / Clean$$

$$USDA FoodData Central$$  
\--\>

$$Normalization to 100g$$  
\---\>

$$Relational DB: Base Ingredients$$  
│  
▼

$$Entity: Recipes / Dishes$$  
(Ingredients \+ Yield Factors)  
│  
▼

$$Search Layer / LLM Parser$$

#### **1\. Ingestion and base ingredient layer (Seeds)**

* Import **ARGENFOODS / LATINFOODS** datasets for regional meat cuts, legumes, and vegetables.  
* Complement with **USDA FoodData Central** for universal generic ingredients (oils, flours, seasonings, basic dairy).  
* Normalize all records to a base table per 100 edible grams (Calories, Proteins, Carbohydrates, Fats, Fiber).

#### **2\. Domain model for prepared dishes**

For home-cooked meals (e.g., *Baked silverside milanesa*, *Beef empanadas*, *Shepherd's pie*), it is better not to store arbitrary static values, but rather a recipe structure:

* **Ingredient**: Atomic food (e.g., Raw silverside, Breadcrumbs, Egg, Oil).  
* **Dish / Recipe**: Collection of ingredients with their raw quantities.  
* **CookingFactor (Yield & Retention)**: Water/fat loss factor according to the cooking method (boiled, baked, fried), following FAO/INFOODS standard guidelines.  
* **PortionUnit**: Mapping to human portions (e.g., 1 medium milanesa \= 120 g cooked).

#### **3\. Query and text parsing layer**

Instead of relying on rigid SQL searches via text matching:

* **Embeddings / Semantic search:** Allows automatic association of regional synonyms (*palta* / *aguacate*, *frutilla* / *fresa*, *choclo* / *elote*).  
* **LLM as an input parser:** If the user enters *"I had 2 baked beef empanadas and a mixed salad for lunch"*, a lightweight model extracts the entities, quantities, and directly queries your curated database IDs.

Regarding reuse with Quozen: **Quozen** is your decentralized application for splitting and managing shared expenses (*expense-sharing*), designed under the **BYOS (Bring Your Own Storage)** model: it decouples business logic into its own core and uses the user's own cloud storage (Google Drive / Docs with structured schemas) as a persistent database. Reusing that same architectural philosophy for the calorie counter is an excellent idea, especially for an audience that values privacy, data portability, and the ability to audit or edit their records without depending on a closed SaaS.

### **Recommended architecture: Local-First \+ Google Sheets as Storage**

To make the user experience instantaneous (without suffering the 300–800 ms latency of the Google Sheets API or hitting its *rate limits*), the ideal pattern is:

$$UI / Client App$$  
│ (Instant Read / Write)  
▼

$$Local Cache / SQLite / IndexedDB$$  
\<───\>

$$Core Engine (Macros/recipes calculation)$$  
│ (Background Synchronization / Queue)  
▼

$$Google Sheets API$$  
──\>

$$User Spreadsheet (Google Drive)$$

> 1. **Local-first persistence (Offline-first):** The app reads and writes immediately to a local database (IndexedDB on web or SQLite on mobile/desktop).  
> 2. **Asynchronous synchronization:** A worker syncs pending changes against the user's spreadsheet tabs.  
> 3. **Structured schema and validation:** Define a strict schema specification to prevent manual user edits in the sheet from breaking the app parser.

### **Spreadsheet Design (Tables / Tabs)**

* **Base\_Ingredients:** Personal catalog of foods and raw cuts normalized every 100 g (Calories, Proteins, Fats, Carbohydrates).  
* **Recipes / Dishes:** Definition of compound meals (recipe ID, ingredient ID, quantity in raw grams, cooking/yield factor).  
* **Portions:** Mapping of household units (e.g., 1 cup, 1 unit, 1 portion).  
* **Daily\_Log:** Transactional record by date, meal type (Breakfast, Lunch, etc.), food/recipe ID, and quantity consumed.

### **Advantages and Technical Challenges**

|  |  |  |
| :---- | :---- | :---- |
| **Aspect** | **Benefit with Google Sheets** | **Challenge and Mitigation** |
| **Infrastructure** | **Zero server and DB costs**; the infrastructure runs on the user's Drive. | Google API quotas (60 req/min per user); resolved using local cache and *batch updates*. |
| **Portability** | The user can open their Excel/Sheets, enter formulas, export, or build their own dashboards. | If the user edits columns manually, a schema validator resilient to order changes is needed. |
| **Privacy** | Total privacy; no intermediary servers storing health/habit data. | The user must grant OAuth permissions (drive.file / spreadsheets). |

The decoupling between the domain engine and the persistence adapter that you implemented in Quozen applies identically here, replacing expense and participant entities with ingredients, recipes, and diary entries.