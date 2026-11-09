/* TRG pay engine: shift times -> predicted payslip lines, super, PAYG, leave.
   Rules reverse-engineered from FY2026-27 payslips (Road Transport and Distribution Award MA000038 + TRG extras). */
(function (root) {
  "use strict";

  var DEFAULTS = {
    version: 3,
    jobs: {
      wharf:   { name: "Wharf",      base: 29.00, ot15: 43.50, ot2: 58.00, fatigue: 9.657,
                 L: { ord: "Base Hourly", ot15: "Overtime 1.5x", ot2: "Overtime 2x", fat: "Fatigue Break" } },
      rt:      { name: "Road train", base: 30.28, ot15: 45.42, ot2: 60.56, fatigue: 10.08,
                 L: { ord: "Road Train (G8) Base Hourly", ot15: "RT (G8) 1.5x", ot2: "RT (G8) 2x", fat: "RT (G8) Fatigue Break Cas" } },
      ab:      { name: "AB triple",  base: 30.78, ot15: 46.17, ot2: 61.56, fatigue: 10.25,
                 L: { ord: "AB Triple Shift (G9)", ot15: "AB Triple (G9) 1.5x", ot2: "AB Triple (G9) 2x", fat: "AB Triple (G9) Fatigue Break" } },
      chicken: { name: "Chicken",    base: 29.00, ot15: 43.50, ot2: 58.00, fatigue: 9.657,
                 L: { ord: "Base Hourly", ot15: "CHICAR 1.5x Time & Half", ot2: "CHICAR 2.0x Double Time", fat: "Fatigue Break" } }
    },
    extras: { bonus: 7.20, skill: 6.75, loyalty: 1.20,
              bonusLabel: "Bonus Agreement", skillLabel: "Skill Level 3A", loyaltyLabel: "Loyalty Year 3" },
    allow: { meal: 21.15, dg: 25.07, night: 8.70, nightBreak: 18.85,
             sundayRate: 58.00, sundayBreak: 29.00, phRate: 72.50, phBreak: 36.25, leaveRate: 29.00 },
    rules: { dailyOrd: 7.5, ot15Band: 2, break1After: 5.5, break1: 0.5, break2After: 10.75, break2: 0.5,
             mealOver: 10, fatigueOver: 10.75, weeklyTopUp: 0.5, weekOrd: 38, nightBefore: "05:00",
             satOt15: 2, alWeeks: 4, superRate: 0.12 },
    // ATO Schedule 1, scale 2 (tax-free threshold claimed), weekly, from 1 July 2026: [less than, a, b]
    tax: [[362, 0, 0], [538, 0.15, 54.3462], [673, 0.25, 108.2135], [721, 0.17, 54.3473], [865, 0.179, 60.8377],
          [1282, 0.3227, 185.1935], [2596, 0.32, 181.7319], [3653, 0.39, 363.4627], [1e12, 0.47, 655.7704]],
    // SA full-day public holidays (SafeWork SA)
    holidays: ["2026-01-01","2026-01-26","2026-03-09","2026-04-03","2026-04-04","2026-04-05","2026-04-06",
               "2026-04-25","2026-06-08","2026-10-05","2026-12-25","2026-12-26","2026-12-28",
               "2027-01-01","2027-01-26","2027-03-08","2027-03-26","2027-03-27","2027-03-28","2027-03-29",
               "2027-04-25","2027-06-14","2027-10-04","2027-12-25","2027-12-26","2027-12-27","2027-12-28"]
  };

  function r2(n) { return Math.round((n + 1e-9) * 100) / 100; }
  function r4(n) { return Math.round((n + 1e-12) * 10000) / 10000; }
  function hrs(t) { var p = String(t).split(":"); return (+p[0]) + (+p[1] || 0) / 60; }
  function dow(date) { var d = new Date(date + "T12:00:00"); return d.getDay(); }

  function weekStart(date) { // Monday of the pay week
    var d = new Date(date + "T12:00:00"); var k = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - k); return d.toISOString().slice(0, 10);
  }

  function payg(gross, table) {
    var x = Math.floor(gross) + 0.99;
    for (var i = 0; i < table.length; i++) {
      if (x < table[i][0]) { var y = table[i][1] * x - table[i][2]; return Math.max(0, Math.round(y)); }
    }
    return 0;
  }

  function calcWeek(shifts, cfg) {
    cfg = cfg || DEFAULTS;
    var R = cfg.rules, A = cfg.allow, E = cfg.extras;
    var lines = {}, order = 0;
    function add(label, units, rate, type, ote, cat, fixedAmount) {
      if (!units && fixedAmount == null) return;
      var key = label + "|" + rate;
      if (!lines[key]) lines[key] = { label: label, units: 0, rate: rate, type: type, ote: ote, cat: cat, order: order++, fixed: null };
      lines[key].units += units || 0;
      if (fixedAmount != null) lines[key].fixed = (lines[key].fixed || 0) + fixedAmount;
    }

    var weekdayOrd = 0, fullDays = 0, leaveOrd = 0, lwop = 0, sunEq = 0, phEq = 0, notes = [];
    var days = [];

    shifts.slice().sort(function (a, b) { return (a.date + a.start).localeCompare(b.date + b.start); }).forEach(function (s) {
      if (s.kind === "personal" || s.kind === "annual") {
        var h = +s.hours || R.dailyOrd;
        add(s.kind === "personal" ? "Personal Leave Taken" : "Annual Leave Taken", h, A.leaveRate, "Hours", true, "leave");
        leaveOrd += h; days.push({ date: s.date, kind: s.kind, paid: h }); return;
      }
      if (s.kind === "lwop") { var lh = +s.hours || 0; add("Leave Without Pay", lh, 0, "Hours", false, "leave"); lwop += lh; return; }

      var job = cfg.jobs[s.job] || cfg.jobs.wharf, isChicken = s.job === "chicken";
      var st = hrs(s.start), fi = hrs(s.finish), D = fi - st; if (D <= 0) D += 24;
      var wd = dow(s.date);
      var ph = s.ph === true || (s.ph !== false && cfg.holidays.indexOf(s.date) >= 0);
      var b1 = D > R.break1After, b2 = D > R.break2After;
      var day = { date: s.date, job: s.job, span: D, ph: ph, wd: wd };

      if (ph) {
        var hp = D - (b1 ? R.break1 : 0) - (b2 ? R.break2 : 0);
        add(isChicken ? "CHICAR Public Holiday (2.5x)" : "Public Holiday (2.5x)", hp, A.phRate, "Hours", false, "ph");
        if (b1) add("Public Holiday Paid Break", 1, A.phBreak, "Units", false, "break");
        phEq += Math.min(hp, R.dailyOrd); day.paid = hp;
      } else if (wd === 0) {
        var hs = D - (b1 ? R.break1 : 0) - (b2 ? R.break2 : 0), so = Math.min(hs, R.dailyOrd);
        add(isChicken ? "CHICAR Sunday Shift" : "Sunday Shift", so, A.sundayRate, "Hours", true, "sun");
        add(isChicken ? "CHICAR 2.0x Double Time" : "Sunday Overtime 2x", hs - so, A.sundayRate, "Hours", false, "ot2");
        if (b1) add(isChicken ? "CHICAR FT Sunday Paid Break" : "Sunday Paid Break", 1, A.sundayBreak, "Units", false, "break");
        sunEq += so; day.paid = hs;
      } else if (wd === 6) {
        var ht = D - (b1 ? R.break1 : 0) - (b2 ? R.break2 : 0), s15 = Math.min(ht, R.satOt15);
        add(job.L.ot15, s15, job.ot15, "Hours", false, "ot15");
        add(job.L.ot2, ht - s15, job.ot2, "Hours", false, "ot2");
        day.paid = ht; day.fatigue = b2;
      } else {
        var nightShift = isChicken && st < hrs(R.nightBefore), hw, nl;
        if (nightShift) {
          hw = D - (b2 ? R.break2 : 0);
          if (b1) add("Paid Break Night Shift", 1, A.nightBreak, "Units", false, "break");
          nl = Math.min(hw, R.dailyOrd);
        } else {
          hw = D - (b1 ? R.break1 : 0) - (b2 ? R.break2 : 0);
          nl = Math.max(0, Math.min(fi > st ? fi : 24, hrs(R.nightBefore)) - st);
        }
        var o = Math.min(hw, R.dailyOrd), o15 = Math.min(Math.max(hw - R.dailyOrd, 0), R.ot15Band),
            o2 = Math.max(hw - R.dailyOrd - R.ot15Band, 0);
        add(job.L.ord, o, job.base, "Hours", true, "ord");
        add(job.L.ot15, o15, job.ot15, "Hours", false, "ot15");
        add(job.L.ot2, o2, job.ot2, "Hours", false, "ot2");
        if (nl > 0) add("Night Shift Loading", nl, A.night, "Hours", true, "night");
        weekdayOrd += o; if (o >= R.dailyOrd - 1e-9) fullDays++;
        day.paid = hw; day.fatigue = b2;
      }
      if (!ph && D > R.mealOver) add("Meal Allowance (Wharf)", 1, A.meal, "Units", false, "allow");
      if (!ph && D > R.fatigueOver) add(job.L.fat, 1, job.fatigue, "Units", false, "allow");
      if (s.dg) add("DG Bulk Allowance", 1, A.dg, "Units", true, "allow");
      days.push(day);
    });

    // Weekly top-up of ordinary time (payroll adds 0.5 h to reach 38)
    var topUp = 0;
    if (weekdayOrd > 0) {
      var room = R.weekOrd - weekdayOrd - leaveOrd - lwop - sunEq - phEq;
      topUp = Math.min(R.weeklyTopUp, Math.max(0, room));
      if (topUp > 0) { add(cfg.jobs.wharf.L.ord, topUp, cfg.jobs.wharf.base, "Hours", true, "ord"); weekdayOrd += topUp; }
    }

    // TRG extras
    var fixed = (sunEq + phEq) > 0, ex = [];
    if (weekdayOrd > 0 || fixed) {
      var bonusAmt, loyAmt, skAmt;
      if (fixed) { var full = Math.min(R.weekOrd, weekdayOrd + sunEq + phEq);
        bonusAmt = r2(E.bonus * full); loyAmt = r2(E.loyalty * full); skAmt = r2(E.skill * full);
      } else {
        bonusAmt = r2(E.bonus * (fullDays * R.dailyOrd + topUp));
        loyAmt = r2(E.loyalty * weekdayOrd); skAmt = r2(E.skill * weekdayOrd);
      }
      var u = weekdayOrd || 1;
      ex.push({ label: E.loyaltyLabel, units: weekdayOrd, rate: r4(loyAmt / u), type: "Hours", amount: loyAmt, ote: true, cat: "extra" });
      ex.push({ label: E.skillLabel, units: weekdayOrd, rate: r4(skAmt / u), type: "Hours", amount: skAmt, ote: true, cat: "extra" });
      ex.push({ label: E.bonusLabel, units: null, rate: null, type: "", amount: bonusAmt, ote: true, cat: "extra" });
    }

    var catOrder = { ord: 0, extra: 1, leave: 2, sun: 3, ph: 3, ot15: 4, ot2: 5, allow: 6, night: 7, break: 8 };
    var out = Object.keys(lines).map(function (k) {
      var l = lines[k]; l.units = r4(l.units);
      l.amount = l.fixed != null ? r2(l.fixed) : r2(l.units * l.rate); return l;
    }).filter(function (l) { return l.units > 0 || l.amount !== 0 || l.cat === "leave"; });
    out = out.concat(ex).sort(function (a, b) { return (catOrder[a.cat] - catOrder[b.cat]) || ((a.order || 0) - (b.order || 0)); });

    var gross = r2(out.reduce(function (s, l) { return s + l.amount; }, 0));
    var ote = r2(out.reduce(function (s, l) { return s + (l.ote ? l.amount : 0); }, 0));
    var sup = r2(ote * R.superRate), tax = payg(gross, cfg.tax);
    var al = r4((weekdayOrd + leaveOrd) * R.alWeeks / 52);
    return { lines: out, gross: gross, ote: ote, super: sup, payg: tax, net: r2(gross - tax), alAccrued: al,
             ordinaryHours: r4(weekdayOrd + leaveOrd + sunEq + phEq), days: days, notes: notes };
  }

  // Totals from a list of already-known line amounts (used to check real payslips)
  function totalsFromLines(lines, cfg) {
    cfg = cfg || DEFAULTS;
    var gross = r2(lines.reduce(function (s, l) { return s + l.amount; }, 0));
    var ote = r2(lines.reduce(function (s, l) { return s + (l.ote ? l.amount : 0); }, 0));
    var tax = payg(gross, cfg.tax);
    return { gross: gross, ote: ote, super: r2(ote * cfg.rules.superRate), payg: tax, net: r2(gross - tax) };
  }

  var api = { DEFAULTS: DEFAULTS, hrs: hrs, calcWeek: calcWeek, totalsFromLines: totalsFromLines, payg: payg, weekStart: weekStart, r2: r2 };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.TRGPay = api;
})(this);
