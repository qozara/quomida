# 0004. Compound Recipe Yield & Retention Factors (FAO/INFOODS Standard)

* Status: accepted
* Date: 2026-09-12

## Context and Problem Statement

When food is cooked (baking, frying, boiling), raw ingredients change weight due to moisture loss or oil absorption. Storing static cooked values for home-cooked prepared dishes (e.g. *milanesas*, *empanadas*, *asado*) leads to inaccurate macro counts because cooking methods alter yield weight.

## Decision Outcome

Chosen option: **FAO/INFOODS Compound Recipe Model with Yield Factors**.

Recipes store raw ingredient components and a `yield_factor` (e.g., `0.85` for 15% moisture loss during baking):

$$\text{Cooked Weight} = \text{Raw Weight Total} \times \text{Yield Factor}$$

Total recipe macros sum the raw ingredient macros while mapping portion servings against the resulting cooked weight.

### Positive Consequences
- Follows international FAO/INFOODS nutritional standards.
- Enables accurate calculation of home-cooked regional meals.
