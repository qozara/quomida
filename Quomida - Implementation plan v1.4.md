> 1. HIGH-LEVEL ARCHITECTURE

**System Context:** Quomida operates entirely on the client, leveraging RxDB for local-first persistence and a decoupled sync adapter pattern to push state to a user's personal storage (e.g., Google Drive). The architecture strictly isolates domain logic within packages/domain-core from the UI in apps/webapp and external dependencies in packages/sync-adapters, following an isomorphic monorepo structure.  
**Design Patterns:**

* **Adapter Pattern:** Enables swapping between a mock storage interface for local testing, Google Drive, or a local filesystem without altering the core application logic.  
* **Repository Pattern:** Wraps RxDB collections to provide a strict, typed internal API, ensuring the UI remains ignorant of the underlying database engine.  
* **Observer Pattern:** Utilizes RxDB's native observables to push state changes to React components seamlessly, creating a reactive UI.  
* **Isomorphic Core:** Pure TypeScript logic containing calculations and schema validators, built to execute consistently across Node environments (ETL/CLI) and the Browser.

Fragmento de código  
sequenceDiagram  
    participant UI as React WebApp  
    participant Repo as Domain Core (Repository)  
    participant DB as RxDB (Local Engine)  
    participant Sync as Sync Adapter (SyncInterface)  
    participant Remote as Remote Storage (BYOS)

    UI-\>\>Repo: queryDailyLogs(date)  
    Repo-\>\>DB: find({ selector: { date } })  
    DB--\>\>Repo: Observable stream  
    Repo--\>\>UI: React state updates via Subscription

    UI-\>\>Repo: insertDailyLog(data)  
    Repo-\>\>DB: insert()  
    DB--\>\>Sync: Trigger replication event  
    Sync-\>\>Remote: Push delta (debounce)  
    Remote--\>\>Sync: Acknowledge

> 2. DATA MODEL & PERSISTENCE

**Schema Definitions:** RxDB relies on JSON Schema definitions.

* **base\_ingredients**: { id: string, name: string, source: string, lang: string, calories\_100g: number, protein\_100g: number, carbs\_100g: number, fats\_100g: number }.  
* **recipes**: { id: string, name: string, ingredients: \[{ ingredient\_id: string, raw\_weight\_g: number }\], yield\_factor: number }.  
* **portions**: { id: string, base\_food\_id: string, name: string, equivalent\_weight\_g: number }.  
* **daily\_logs**: { id: string, timestamp: string, date: string, meal\_type: string, food\_reference\_id: string, quantity: number, portion\_name: string, macros: { calories: number, protein: number, carbs: number, fats: number } }.  
* **user\_settings**: { id: 'global\_settings', locale: string, theme: string, daily\_calorie\_target: number, custom\_macros: { protein: number, carbs: number, fats: number } }.

**Relationships:** daily\_logs.food\_reference\_id loosely links to either base\_ingredients.id or recipes.id. The portions.base\_food\_id explicitly references foods or recipes. There is no strict relational cascading; historical logs maintain a hardcoded snapshot of macros to guarantee the immutability of historical data.  
**Caching Strategy:** RxDB acts as the primary cache and the absolute source of truth for the application. Data is persistent via IndexedDB within the browser environment. The build-time ETL pipeline generates static seed\_vX.json files that are bundled and hydrated into RxDB on the initial load, utilizing a version hash to update silently when new catalog data is published.

> 3. API CONTRACTS (Interface Design)

Because the architecture relies on a local database and BYOS, standard REST contracts are replaced by internal package interfaces.  
**Interface: SyncAdapter (packages/sync-adapters)**

* **Method:** initialize(credentials: AuthToken): Promise\<void\>  
* **Method:** pull(): Promise\<RxDBDump\>  
* **Method:** push(delta: RxDBDelta): Promise\<void\>  
* **Security:** The adapter handles OAuth tokens locally, storing them securely within the browser or CLI environment.

**Interface: LLMEngine (packages/llm-engine)**

* **Method:** parseNaturalLanguageLog(input: string): Promise\<ParsedLog null |\>  
* **Response Success:** { success: true, foodQuery: "olive oil", quantity: 15, unit: "grams" }  
* **Fallback Strategy:** Return null to gracefully degrade to the traditional search bar without blocking the user interface.  
> 4. ENGINEER TASK BREAKDOWN

This breakdown is structured into checkpoints designed for iterative execution and testing via autonomous agents.  
**Checkpoint 1: Monorepo Foundation & Isomorphic Core**

* **Task \[CORE-1\]: Initialize Workspace Structure**  
  * **Description:** Set up the monorepo directory layout (packages/domain-core, apps/webapp) utilizing pure TypeScript and Vitest.  
  * **Technical Definition of Done:** Scaffolded directories exist, shared tsconfig.json is configured, and pnpm-workspace.yaml is active.  
* **Task \[CORE-2\]: Define RxDB Schemas**  
  * **Description:** Implement JSON schemas for base\_ingredients, recipes, portions, daily\_logs, and user\_settings within packages/domain-core.  
  * **Technical Definition of Done:** Type-safe schemas are exported with zero DOM dependencies, accompanied by unit tests validating all schema constraints.

**Checkpoint 2: Mock Persistence & UI Skeleton**

* **Task \[SYNC-1\]: Develop Mock Sync Adapter**  
  * **Description:** Create an in-memory sync adapter inside packages/sync-adapters that strictly conforms to the generic SyncInterface.  
  * **Technical Definition of Done:** The application can successfully simulate pulling and pushing data payloads without executing external network calls.  
* **Task \[WEB-1\]: Setup Application Shell**  
  * **Description:** Initialize standard, lightweight React UI components and basic routing within apps/webapp. Build the Authentication and Profile settings empty states.  
  * **Technical Definition of Done:** The application compiles locally and renders the structural wireframes in the browser.

**Checkpoint 3: Core Features (Local-First Execution)**

* **Task \[DOMAIN-1\]: RxDB Provider Integration**  
  * **Description:** Instantiate the RxDB database inside apps/webapp using the compiled schemas from domain-core. Inject the Mock Sync Adapter built in \[SYNC-1\].  
  * **Technical Definition of Done:** The database initializes successfully within the browser's IndexedDB upon load.  
* **Task \[WEB-2\]: Daily Dashboard UI**  
  * **Description:** Build the daily dashboard featuring dynamic Macro Summary Cards wired to user\_settings and the foundational Food Input field.  
  * **Dependencies:** Blocked by \[WEB-1\].  
  * **Technical Definition of Done:** The static UI successfully maps to the wireframe requirements and incorporates i18n translation keys.  
* **Task \[WEB-3\]: Transactional Logging Flow**  
  * **Description:** Implement the search mechanism, the Portion Selection Bottom Sheet, and the write operation directed at the daily\_logs collection.  
  * **Dependencies:** Blocked by \[DOMAIN-1\] and \[WEB-2\].  
  * **Technical Definition of Done:** A user can insert a mock food log and observe the Macro Summary rings update reactively without a page refresh.

**Checkpoint 4: Offline Pipelines & Interfaces**

* **Task \[ETL-1\]: Scaffold Build-Time ETL**  
  * **Description:** Create a Node.js script in apps/etl-pipeline to read a mock dataset and generate a seed\_v1.json payload mapped to the base\_ingredients schema.  
  * **Technical Definition of Done:** Executing the script outputs a valid JSON array matching the schema requirements.  
* **Task \[LLM-1\]: Abstract Fallback Handlers**  
  * **Description:** Define the natural language prompt structure and configure the fallback degradation handler within packages/llm-engine. Implement a dummy responder for local unit testing.  
  * **Technical Definition of Done:** The interface functions gracefully return null on timeout simulation.