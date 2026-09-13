# 0003. Immutability of Historical Macro Snapshots in Daily Logs

* Status: accepted
* Date: 2026-09-12

## Context and Problem Statement

If a user logs an item (e.g. 200g of *Peceto*) on Monday, and later on Friday modifies or deletes that custom ingredient definition or portion weight in their catalog, how should past diary logs behave? If past logs dynamically query current ingredient definitions, historical nutrition records will retroactively change, corrupting past macro logs.

## Decision Drivers

* Strict historical accuracy: past consumption records must reflect what was consumed at that moment in time.
* Data integrity across custom catalog edits.

## Decision Outcome

Chosen option: **Hardcoded Macro Snapshot at Logging Time**.

When inserting a document into the `daily_logs` collection, the system calculates macros for the specified quantity and portion, rounds the values, and stores a hardcoded `macros` snapshot object:

```json
{
  "id": "log_1726176000",
  "date": "2026-09-12",
  "meal_type": "meal_lunch",
  "food_reference_id": "ing-peceto",
  "quantity": 1.5,
  "portion_name": "1 porción mediana",
  "macros": {
    "calories": 360.0,
    "protein": 66.0,
    "carbs": 0.0,
    "fats": 10.5
  }
}
```

### Positive Consequences
- Future catalog edits or portion changes NEVER alter past daily macro logs.
- Queries on daily logs compute daily macro totals rapidly without join performance penalties.
