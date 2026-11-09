# TRG pay rules (reverse-engineered)

How TRG Transport Solutions appears to pay its drivers, worked out from one driver's FY2026-27 payslips and the Fair Work pay guide for the Road Transport and Distribution Award 2020 (MA000038), effective 1 July 2026.

**Your pay may differ.** Grade, department, loyalty year, and which allowances you get all vary from person to person. Check each rate against your own payslip and change it in the app's Setup screen. If a rule doesn't match your payslips, update this file in your copy.

Each rule is marked:
- **Confirmed**: reproduces the payslips to the cent
- **Likely**: fits the evidence but has been tested on few weeks
- **Unconfirmed**: an open question

The app engine (`www/engine.js`) implements every rule below. Rates and thresholds are editable in the app's Setup screen.

---

## 1. Agreement and classification

- **Confirmed.** No registered enterprise agreement was found for TRG on the Fair Work Commission register (searched TRG Transport Pty Ltd, TRG Transport Solutions, T.R.G. Transport and the director's name).
- **Confirmed.** The base and overtime rates equal the award minimums exactly, so TRG pays the award plus its own extras.

## 2. Hourly rates by job (from 1 July 2026)

| Job | Award grade | Base | 1.5× | 2× | Payslip line names |
|---|---|---|---|---|---|
| Wharf (sideloader) | 6 | $29.00 | $43.50 | $58.00 | Base Hourly / Overtime 1.5x / Overtime 2x |
| Road train | 8 | $30.28 | $45.42 | $60.56 | Road Train (G8) Base Hourly / RT (G8) 1.5x / RT (G8) 2x |
| AB triple | 9 | $30.78 | $46.17 | $61.56 | AB Triple Shift (G9) / AB Triple (G9) 1.5x / AB Triple (G9) 2x |
| Chicken | 6 | $29.00 | $43.50 | $58.00 | Base Hourly / CHICAR 1.5x Time & Half / CHICAR 2.0x Double Time |

All **Confirmed** against the award pay guide and the payslips.

## 3. TRG extras (over-award, not in the award)

Paid per ordinary hour, up to 38 a week:

| Line | Rate | Status |
|---|---|---|
| Bonus Agreement | $7.20/h (38 h = $273.60) | Confirmed |
| Skill Level 3A | $6.75/h | Confirmed |
| Loyalty Year 2 | $0.80/h | Confirmed |
| Loyalty Year 3 | $1.20/h | Confirmed |
| Other loyalty years | Unknown, check your payslip | Unconfirmed |

- **Confirmed.** When a Sunday or public holiday shift counts toward the 38 hours, the extras are paid as a fixed 38-hour amount, and the payslip shows an odd per-hour rate (e.g. 1.4951) over the weekday hours.
- **Confirmed.** Bonus is lost for a day with unpaid leave, while loyalty and skill are still paid on those hours.
- **Confirmed.** A personal leave day is paid at base only, with no bonus, loyalty or skill.
- **Likely.** Loyalty years seem to count from when you went permanent, not from a casual start.

## 4. Daily hours

| Rule | Status |
|---|---|
| First 30-min break is unpaid on any shift over 5.5 h | Likely (5.5 h cut-off not tested; every weekday shift is longer) |
| Ordinary time: first 7.5 paid hours each weekday | Confirmed |
| 1.5×: next 2 paid hours | Confirmed (12 h of 1.5× in a 5 weekday + Saturday week) |
| 2×: everything after that | Confirmed |
| Weekly top-up: 0.5 h added to Base Hourly to bring ordinary time to 38 (5 × 7.5 + 0.5) | Confirmed |
| Saturday: no ordinary time, first 2 h at 1.5×, rest at 2× | Confirmed |
| Sunday (chicken): first 7.5 h "CHICAR Sunday Shift" at $58, rest "CHICAR 2.0x Double Time", 30-min break paid as "CHICAR FT Sunday Paid Break" ($29) | Confirmed from payslips, not tested against logged times |
| Public holiday (chicken): all hours at $72.50 "CHICAR Public Holiday (2.5x)", 30-min break paid as "Public Holiday Paid Break" ($36.25) | Confirmed from one payslip |

## 5. Second break and fatigue break

- **Likely.** On shifts **longer than about 10 h 45 min** (clock-on to clock-off), TRG deducts a **second unpaid 30-min break** and pays a **Fatigue Break** of 20 min at that job's base rate (wharf $9.657, road train $10.08, AB triple $10.25).
- Evidence: a 10 h 35 min shift got no fatigue break and a 10 h 53 min shift did, so the real cut-off is somewhere between those. The app uses 10 h 45 min.
- **Cost if worked through:** 30 min at 2× ($29.00) deducted, $9.66 paid back, so **about $19.34 a day**.
- **Award note:** MA000038 pays "working through a meal break" at 200% ($58.00/h for Grade 6).

## 6. Allowances and loadings

| Line | Rule | Status |
|---|---|---|
| Meal Allowance (Wharf) $21.15 | One per shift longer than 10 h (clock-on to clock-off). Equals the award overtime meal allowance | Confirmed on 2 weeks of logged times |
| DG Bulk Allowance | One unit per DG day. Award rate $25.07 from 1/7/2026 | Confirmed |
| Night Shift Loading $8.70/h (30% of $29) | Wharf and road train: hours worked before 05:00. A 05:00 start gets none. Chicken: weekday start before 05:00 → first 7.5 h loaded, plus "Paid Break Night Shift" 0.5 h at $37.70 = $18.85 | Wharf: Confirmed. Chicken: from payslips only |

## 7. Super, tax and leave

- **Super (Confirmed):** 12% of ordinary pay plus extras, DG, night loading, Sunday ordinary shift pay and personal leave. Excludes overtime, meal, fatigue, paid breaks and public holiday pay.
- **PAYG (Confirmed):** ATO Schedule 1, Scale 2 (tax-free threshold claimed), weekly, 2026-27 coefficients. Formula: x = floor(gross) + 0.99, tax = round(a·x − b).

  | Weekly x less than | a | b |
  |---|---|---|
  | 362 | 0 | 0 |
  | 538 | 0.15 | 54.3462 |
  | 673 | 0.25 | 108.2135 |
  | 721 | 0.17 | 54.3473 |
  | 865 | 0.179 | 60.8377 |
  | 1282 | 0.3227 | 185.1935 |
  | 2596 | 0.32 | 181.7319 |
  | 3653 | 0.39 | 363.4627 |
  | above | 0.47 | 655.7704 |

- **Annual leave (Confirmed):** accrues at 4/52 of weekday ordinary hours plus personal or annual leave hours (38 h → 2.9231 h). Sunday and public holiday hours don't accrue it.
- **YTD (Confirmed):** each payslip's YTD is the previous YTD plus this pay.

## 8. Rounding

- **Likely.** Every 2× overtime figure on the payslips checked is a multiple of 5 minutes (e.g. 13.418 h = 13 h 25 min; the extra .001 is the software's decimal rounding).
- **Unconfirmed:** whether TRG rounds each clock time or the weekly total, and whether to the nearest 5 minutes or down.
  - One week fitted rounding the weekly total to the nearest 5 minutes (13 h 23 min → 13 h 25 min).
- **Test:** knock off on times ending in 3 or 8 for a few weeks. Under nearest-5 rounding per clock time, those round up 2 minutes.

## 9. Open items

1. Narrow the fatigue / second break cut-off (somewhere between 10 h 35 min and 10 h 53 min).
2. Confirm the 5-minute rounding method.
3. Test chicken weekday, Sunday, public holiday and road train shifts against logged times.
4. Rounding setting, and a green banner for gaps under about $5 (planned).
