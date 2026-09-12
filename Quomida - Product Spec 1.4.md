# **Product Specification: Quomida**

**Version:** 1.4 (Final Draft)  
**Type:** Privacy-First, Local-First Web Application (BYOS Architecture)

## **1\. Product Vision & Core Principles**

Quomida is a mobile-first, privacy-centric calorie and macro tracker. It operates on a **BYOS (Bring Your Own Storage)** paradigm, fundamentally decoupling the application logic from the persistence layer.

* **Local-First Engine (RxDB):** The core database, schema definition, and state management run entirely within the client application using RxDB. This ensures a zero-latency UX, robust offline capabilities, and built-in support for automatic schema migrations.  
* **Config-Level Backend Agnosticism:** Google Drive/Sheets serves as the default synchronization adapter. Alternative storage providers are supported at the architectural level via build-time or deployment configuration, but backend-switching is not a user-facing feature.  
* **Seamless Cross-Device Synchronization:** Once authenticated, the application seamlessly persists and retrieves both transactional data and application settings. Moving between devices requires zero manual intervention.  
* **i18n-First:** Native support for English and Spanish, separating UI localization strings from user-generated database content.

## **2\. Monorepo Architecture Specification (IA & Code Organization)**

To ensure the separation of concerns, Quomida utilizes a monorepo structure. This decouples the core domain logic from the UI and persistence layers, allowing ETL pipelines and LLM features to evolve independently.

Plaintext  
Quomida/  
├── packages/                       
│   ├── domain-core/              \# Pure business logic, RxDB schemas, yield calculation rules  
│   ├── sync-adapters/            \# Google Sheets API adapter, CouchDB adapter interfaces  
│   ├── llm-engine/               \# Entity extraction logic, LLM prompts, fallback handlers  
│   └── i18n-locales/             \# Centralized JSON dictionaries (es.json, en.json)  
├── apps/                           
│   ├── webapp/                   \# Privacy-first, offline PWA (User-facing UI)  
│   ├── etl-pipeline/             \# Build-time ingestion for LATINFOODS/ARGENFOODS/USDA  
│   ├── cli/                      \# Console app for local DB admin and sync testing  
│   └── scripts/                  \# Ad-hoc utilities (deployments, local dev setup)

* **Dependency Rule:** packages/domain-core must have zero dependencies on the DOM, UI frameworks, or specific database drivers.  
* **Swappability:** The webapp strictly communicates with a generic SyncInterface from packages/sync-adapters.

## **3\. Information Architecture & RxDB Schema**

The application dictates the schema locally via RxDB, allowing for independent versioning and automatic migrations. The sync adapter translates these JSON documents to the remote provider.

### **Collection: base\_ingredients**

Stores normalized atomic ingredients and raw meats. All nutritional values are normalized to a 100-gram edible portion.

* **id** (String) \- Primary Key  
* **name** (String) \- E.g., "Peceto crudo", "Olive Oil"  
* **source** (String) \- Enum: 'system' or 'custom'  
* **lang** (String) \- ISO 639-1 code (e.g., 'es', 'en').  
* **calories\_100g, protein\_100g, carbs\_100g, fats\_100g** (Float)

### **Collection: recipes**

Maps ingredients to a recipe using cooking yield factors (FAO/INFOODS standard).

* **id** (String) \- Primary Key  
* **name** (String) \- User-defined string  
* **ingredients** (Array of Objects) \- Embedded array containing:  
  * ingredient\_id (String) \- Reference to base\_ingredients  
  * raw\_weight\_g (Float)  
* **yield\_factor** (Float) \- Default is 1.0 (no loss).

### **Collection: portions**

Maps domestic household measurements to absolute gram weights.

* **id** (String) \- Primary Key  
* **base\_food\_id** (String) \- Reference to base\_ingredients or recipes  
* **name** (String) \- User-defined (e.g., "1 rebanada", "1 slice")  
* **equivalent\_weight\_g** (Float)

### **Collection: daily\_logs**

The transactional ledger of user consumption. Macros are hardcoded at logging time to ensure historical immutability.

* **id** (String) \- Primary Key  
* **timestamp** (String) \- ISO 8601 UTC.  
* **date** (String) \- YYYY-MM-DD for localized UI querying.  
* **meal\_type** (String) \- Enum: meal\_breakfast, meal\_lunch, etc.  
* **food\_reference\_id** (String)  
* **quantity** (Float)  
* **portion\_name** (String)  
* **macros** (Object) \- { calories: Float, protein: Float, carbs: Float, fats: Float }

### **Collection: user\_settings**

Global application state ensuring seamless cross-device continuity.

* **id** (String) \- Primary Key ('global\_settings')  
* **locale** (String) \- User's selected language (e.g., es-AR, en-US).  
* **theme** (String) \- Enum: 'light', 'dark', 'system'.  
* **daily\_calorie\_target** (Float)  
* **custom\_macros** (Object) \- Target splits for protein, carbs, fats.

## **4\. Regional Data Ingestion Pipeline (Build-Time ETL)**

To ensure Quomida effectively targets the Latin American market without degrading client-side performance, the application relies on a decoupled, build-time ETL strategy.

graph TD  
    subgraph External Regional Sources  
    A\[ARGENFOODS / LATINFOODS \- CSV/Excel\] \--\> C  
    B\[TBCA / USDA FoodData \- CSV/JSON\] \--\> C  
    end  
      
    subgraph Build-Time ETL Pipeline (apps/etl-pipeline)  
    C\[Extract: Read raw static files\] \--\> D\[Transform: Normalize macros to 100g base\]  
    D \--\> E\[Transform: Apply i18n tags e.g., 'es-AR'\]  
    E \--\> F\[Transform: Map to RxDB 'base\_ingredients' Schema\]  
    F \--\> G\[Load: Generate versioned seed.json / SQLite dump\]  
    end  
      
    subgraph Client Application Build  
    G \--\> H\[Bundle with App\]  
    H \--\> I\[RxDB Initial Sync / Cache Hydration\]  
    end

* **Schema Enforcement:** The ETL script enforces the base\_ingredients RxDB schema. Missing macros default to 0.0.  
* **Versioning:** The generated seed file includes a version hash (e.g., seed\_v1.2.json). The client application detects version bumps to silently update its local cache.  
* **Conflict Resolution:** Custom user ingredients natively override ingested system ingredients in UI search results if naming conflicts occur.

## **5\. Storage & Sync Architecture Flow**

graph TD  
    A\[New Device / Browser\] \--\> B\[Authenticate to Configured Backend e.g., Google\]  
    B \--\> C\[Establish RxDB Sync Replication\]  
      
    subgraph Cross-Device Rehydration  
    C \--\> D\[Pull 'user\_settings' Collection\]  
    D \--\> E\[Set UI Locale, Theme, and Targets\]  
    C \--\> F\[Pull 'daily\_logs' & Custom Catalogs\]  
    end  
      
    F \--\> G(Daily Dashboard Ready)  
      
    subgraph Active Usage  
    G \--\>|User Logs Food| H(Local RxDB Update)  
    H \--\>|Instant UI Update| I(Dashboard)  
    H \--\>|Background Replication| J\[(Remote Backend / Sheets)\]  
    end

## **6\. UI/UX Wireframe Specifications**

### **\[Authentication & Profile Settings\] \- Wireframe Specification**

* **Header:** \[Back Arrow\] (left), "Profile & Settings" (center).  
* **Primary Content Area:**  
  * \[Authentication Card\]:  
    * *State 1 (Logged Out):* Title "Sync Your Data". Button: \[Continue with Auth Provider\].  
    * *State 2 (Logged In):* Title "Connected as \[Email\]". Button: \[Log Out\]. Status text: "Last synced: \[Time\]".  
  * \[Preferences Accordion\]: Language Dropdown ("English", "Español"), Theme Segmented Control ("Light", "Dark", "System").  
  * \[Nutritional Goals Accordion\]: Inputs for Daily Calorie and Macro targets.  
* **UX/UI Logic:** Changes to settings immediately update the local RxDB user\_settings collection and queue a background sync. On a new device, these settings overwrite local defaults.

### **\[Daily Dashboard & Food Logger\] \- Wireframe Specification**

* **Header:** \[Profile/Settings Icon\] (left), \[Date Selector\] (center \- formatted via Intl.DateTimeFormat), \[Sync Status Icon\] (right).  
* **Primary Content Area:**  
  * \[Macro Summary Cards\]: Organism containing four visual rings. Text labels map to i18n translation files. Data feeds dynamically from user\_settings.  
  * \[Input Switcher\]: Segmented control (Search / AI Log).  
  * \[Food Input Field\]: Text input. *Placeholder:* Maps to ui.search.placeholder.  
  * \[Meal Categories\]: Accordion list for Breakfast, Lunch, Dinner, Snacks.  
* **Action Bar/Footer:** \[FAB: "+"\] (bottom right) to focus the input field.

### **\[Portion Selection Bottom Sheet\] \- Wireframe Specification**

* **Header:** \[Drag Handle\] (center), \[Food Name\] (title).  
* **Primary Content Area:**  
  * \[Quantity Stepper\]: Numeric input with '-' and '+' buttons. Defaults to 1\.  
  * \[Portion Dropdown\]: Defaults to the most common domestic portion. Must always include "Grams" as an immutable fallback option.  
  * \[Calculated Summary\]: Dynamic text showing calculated calories and macros.  
* **Action Bar/Footer:** \[Log Item\] (Primary Button).

### **\[Custom Catalog Manager\] \- Wireframe Specification**

* **Header:** \[Back Arrow\] (left), "My Foods & Portions" (center), \["+" Add Icon\] (right).  
* **Primary Content Area:**  
  * \[Segmented Tabs\]: "Ingredients", "Recipes", "Portions".  
  * \[List Organism\]: Displays user-created entities.  
* **UX/UI Logic:** Tapping the "+" icon opens a modal to select the creation type (New Ingredient, New Recipe, New Portion).

## **7\. Non-Functional UX & Accessibility Requirements**

> 1. **Immutability of Historical Data:** Modifications to custom ingredients, recipes, or portions must not retroactively alter nutritional values in the daily\_logs.  
> 2. **State Rehydration:** When authenticating on a secondary device, the UI must strictly wait for the user\_settings collection to sync before rendering the dashboard to prevent flashes of incorrect languages or themes.  
> 3. **Silent Migrations:** When a new RxDB schema version is detected, data migration must run locally and silently during the initial load state.  
> 4. **Graceful LLM Degradation:** If the LLM endpoint times out, the UI must seamlessly default to the traditional search bar without blocking the user.  
> 5. **Accessibility (WCAG 2.2):**  
   * Dynamic changes to the Sync Status or Migrations must be announced to screen readers using aria-live="polite".  
   * The root \<html\> tag must dynamically update its lang attribute (lang="es" or lang="en") when the user switches languages.  
   * All interactive elements in list organisms must have a minimum touch target size of 44x44 CSS pixels.

