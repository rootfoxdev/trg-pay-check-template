/* TRG Pay Check app: local-first. Storage: Claude artifact db when present, else IndexedDB on this device. */
(function () {
  "use strict";
  var P = window.TRGPay, D = P.DEFAULTS, BUILD = window.TRG_BUILD || {};
  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var JOBS = [["wharf","Wharf","--wharf"],["rt","Road train","--rt"],["ab","AB triple","--ab"],["chicken","Chicken","--chick"]];
  var KINDS = [["work","Work"],["personal","Personal leave"],["annual","Annual leave"],["lwop","Unpaid"]];

  var PROFILE_DEFAULT = { name: "", position: "Transport Worker - Driver Grade 6", department: "Wharf" };

  // ---------- helpers ----------
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function $(id) { return document.getElementById(id); }
  function money(n) { return (n < 0 ? "−$" : "$") + Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function f2(n) { return (+n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function f4(n) { return n == null ? "" : (+n).toFixed(4); }
  function iso(d) { var z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); }
  function addDays(s, k) { var d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + k); return iso(d); }
  function monday(s) { var d = new Date(s + "T12:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); }
  function nice(s) { var d = new Date(s + "T12:00:00"); return d.getDate() + " " + MONTHS[d.getMonth()]; }
  function dmy(s) { var p = s.split("-"); return +p[2] + "/" + p[1] + "/" + p[0]; }
  function fyOf(weekId) { var pd = addDays(weekId, 7); var y = +pd.slice(0, 4), m = +pd.slice(5, 7); return m >= 7 ? y : y - 1; }
  function span(s) { var d = P.hrs(s.finish) - P.hrs(s.start); return d <= 0 ? d + 24 : d; }
  function jobOf(k) { return JOBS.filter(function (j) { return j[0] === k; })[0] || JOBS[0]; }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) { var v = attrs[k]; if (v == null) continue;
      if (k === "text") e.textContent = v; else if (k === "class") e.className = v; else if (k === "style") e.setAttribute("style", v);
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var shown = {};
  function countUp(node, key, value, fmt) {
    var from = shown[key]; shown[key] = value;
    if (reduce || from == null || from === value) { node.textContent = fmt(value); return; }
    var t0 = performance.now(), dur = 450;
    (function step(t) { var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      node.textContent = fmt(from + (value - from) * e); if (k < 1) requestAnimationFrame(step); })(t0);
  }

  // ---------- storage ----------
  var Store = {
    kind: "none", db: null, uid: null, idb: null,
    init: async function () {
      if (window.claude && window.claude.use) {
        try { var db = await window.claude.use("db"), user = await window.claude.use("user"), uid = user ? await user.id() : null;
          if (db && uid) { this.db = db; this.uid = uid; this.kind = "account"; return; } } catch (e) {}
      }
      try { this.idb = await openIDB(); this.kind = "device";
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); return; } catch (e) {}
      this.kind = "browser";
    },
    loadAll: async function () {
      var out = {};
      if (this.kind === "account") {
        var snap = await this.db.collection("data/users/" + this.uid).get();
        snap.docs.forEach(function (d) { out[d.id] = d.data(); });
      } else if (this.kind === "device") {
        out = await idbAll(this.idb);
      } else {
        try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i);
          if (k.indexOf("trgpay:") === 0) out[k.slice(7)] = JSON.parse(localStorage.getItem(k)); } } catch (e) {}
      }
      return out;
    },
    put: async function (key, val) {
      if (this.kind === "account") { var ref = this.db.collection("data/users/" + this.uid).doc(key); return val == null ? ref.delete() : ref.set(val); }
      if (this.kind === "device") return idbPut(this.idb, key, val);
      try { if (val == null) localStorage.removeItem("trgpay:" + key); else localStorage.setItem("trgpay:" + key, JSON.stringify(val)); } catch (e) { throw e; }
    }
  };
  function openIDB() { return new Promise(function (res, rej) {
    if (!window.indexedDB) return rej(new Error("no idb"));
    var r = indexedDB.open("trg-pay-check", 1);
    r.onupgradeneeded = function () { r.result.createObjectStore("kv"); };
    r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  function idbAll(db) { return new Promise(function (res, rej) {
    var out = {}, tx = db.transaction("kv", "readonly"), st = tx.objectStore("kv"), c = st.openCursor();
    c.onsuccess = function () { var cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } else res(out); };
    c.onerror = function () { rej(c.error); }; }); }
  function idbPut(db, key, val) { return new Promise(function (res, rej) {
    var tx = db.transaction("kv", "readwrite"), st = tx.objectStore("kv");
    if (val == null) st.delete(key); else st.put(val, key);
    tx.oncomplete = function () { res(); }; tx.onerror = function () { rej(tx.error); }; }); }

  // ---------- state ----------
  var S = { weeks: {}, cfg: null, profile: clone(PROFILE_DEFAULT), baseline: null, cur: monday(iso(new Date())), tab: "week", open: null };
  function cfg() { return S.cfg || D; }
  function week(id) { if (!S.weeks[id]) S.weeks[id] = { shifts: [], actual: {} }; return S.weeks[id]; }

  var timers = {};
  function setSave(t, cls) { var s = $("saveState"); s.textContent = t; s.className = "save" + (cls ? " " + cls : ""); }
  function savedLabel() { return Store.kind === "account" ? "Saved to your account" : Store.kind === "device" ? "Saved on this device" : "Saved in this browser"; }
  function persist(key, valFn) {
    clearTimeout(timers[key]); setSave("Saving…", "busy");
    timers[key] = setTimeout(function () {
      Promise.resolve(Store.put(key, valFn())).then(function () { setSave(savedLabel()); },
        function (e) { setSave(e && e.code === "quota_exceeded" ? "Storage full" : "Couldn't save. Try again", "warn"); });
    }, 600);
  }
  function saveWeek(id) { persist("w" + id, function () { var w = S.weeks[id]; return { shifts: w.shifts || [], actual: w.actual || {}, updated: new Date().toISOString() }; }); }
  function saveSettings() { persist("settings", function () { return { cfg: S.cfg ? JSON.stringify(S.cfg) : null, profile: S.profile, baseline: S.baseline }; }); }

  // ---------- YTD ----------
  function figures(id) {
    var w = S.weeks[id] || { shifts: [], actual: {} }, r = P.calcWeek(w.shifts || [], cfg()), a = w.actual || {};
    var taken = (w.shifts || []).filter(function (s) { return s.kind === "annual"; }).reduce(function (t, s) { return t + (+s.hours || 7.5); }, 0);
    var real = a._gross != null;
    return { gross: real ? a._gross : r.gross, payg: real && a._payg != null ? a._payg : r.payg,
      net: real && a._net != null ? a._net : r.net, sup: real && a._super != null ? a._super : r.super,
      accrued: r.alAccrued, taken: taken, real: real, res: r };
  }
  function ytd(id) {
    var B = S.baseline, fy = fyOf(id), weeks = Object.keys(S.weeks).filter(function (k) { return (S.weeks[k].shifts || []).length && fyOf(k) === fy && k <= id; }).sort();
    var t = { gross: 0, payg: 0, net: 0, sup: 0, alOpen: null, complete: false };
    var from = null;
    if (B && B.week && fyOf(B.week) === fy && B.week <= id) {
      t.gross = +B.gross || 0; t.payg = +B.payg || 0; t.net = +B.net || 0; t.sup = +B.super || 0; from = B.week; t.complete = true;
      var al = B.al != null && B.al !== "" ? +B.al : null;
      Object.keys(S.weeks).filter(function (k) { return k > B.week && k < id; }).sort().forEach(function (k) {
        if (al != null) { var f = figures(k); al += f.accrued - f.taken; } });
      t.alOpen = al;
    } else if (B && B.week && B.al != null && B.al !== "" && B.week < id) {
      var a2 = +B.al; Object.keys(S.weeks).filter(function (k) { return k > B.week && k < id; }).forEach(function (k) { var f = figures(k); a2 += f.accrued - f.taken; });
      t.alOpen = a2;
    }
    weeks.forEach(function (k) { if (from && k <= from) return; var f = figures(k); t.gross += f.gross; t.payg += f.payg; t.net += f.net; t.sup += f.sup; });
    if (B && B.week === id && B.al != null && B.al !== "") { var fb = figures(id); t.alOpen = +B.al - fb.accrued + fb.taken; }
    t.ok = t.complete || !B || !B.week || fyOf(id) > fyOf(B.week);
    return t;
  }

  // ---------- render ----------
  function render() {
    ["week", "compare", "setup"].forEach(function (t, i) { var v = $("view-" + t); var on = S.tab === t;
      if (on && v.hidden) { v.hidden = false; v.classList.remove("view"); void v.offsetWidth; v.classList.add("view"); } else v.hidden = !on;
      $("tab-" + t).setAttribute("aria-selected", String(on)); if (on) $("pill").style.transform = "translateX(calc(" + i * 100 + "% + " + i * 4 + "px))"; });
    $("weekbar").hidden = S.tab === "setup";
    var id = S.cur, w = week(id);
    $("weekTitle").textContent = "Week of " + nice(id);
    var thisWk = monday(iso(new Date())); $("thisWeek").hidden = id === thisWk;
    $("weekSub").textContent = nice(id) + " – " + nice(addDays(id, 6)) + " " + addDays(id, 6).slice(0, 4) + " · paid " + nice(addDays(id, 7));
    var res = P.calcWeek(w.shifts, cfg());
    if (S.tab === "week") { renderStrip(id, w, res); renderDays(id, w, res); renderDoc(id, res); }
    if (S.tab === "compare") renderCompare(id, w, res);
    if (S.tab === "setup") renderSetup();
  }

  function shiftOn(w, date) { return (w.shifts || []).filter(function (s) { return s.date === date; })[0]; }

  function renderStrip(id, w, res) {
    var box = $("strip"); box.textContent = "";
    for (var i = 0; i < 7; i++) {
      var date = addDays(id, i), s = shiftOn(w, date), d = res.days.filter(function (x) { return x.date === date; })[0];
      var h = d && d.paid ? d.paid : 0, pct = Math.min(100, h / 14 * 100);
      var cls = !s ? "" : (s.kind && s.kind !== "work") ? "leave" : s.job;
      box.appendChild(el("div", { title: h ? h.toFixed(2) + " h" : "" }, [ el("i", { class: "bar " + cls, style: "height:" + (h ? Math.max(pct, 6) : 3) + "%;animation-delay:" + i * 35 + "ms" }), DAYS[i][0] ]));
    }
  }

  function renderDays(id, w, res) {
    var box = $("days"); box.textContent = ""; var c = cfg();
    for (var i = 0; i < 7; i++) (function (i) {
      var date = addDays(id, i), s = shiftOn(w, date), ph = c.holidays.indexOf(date) >= 0, info, color = null;
      if (!s) info = el("div", { class: "dinfo empty", text: ph ? "Public holiday · tap to add" : "Tap to add" });
      else if (s.kind && s.kind !== "work") { color = "var(--t-leave)";
        info = el("div", { class: "dinfo" }, [ (KINDS.filter(function (k) { return k[0] === s.kind; })[0] || ["", "Leave"])[1] + " · " + (s.hours != null ? s.hours : 7.5) + " h" ]); }
      else { var j = jobOf(s.job); color = "var(" + j[2] + ")";
        info = el("div", { class: "dinfo" }, [ el("span", { class: "t", text: s.start + "–" + s.finish }), " ",
          el("span", { class: "m", text: span(s).toFixed(2) + " h · " + j[1] }),
          s.dg ? el("span", { class: "tag dg", text: "DG" }) : null,
          (function () { var dd = res.days.filter(function (x) { return x.date === date; })[0]; return dd && dd.fatigue ? el("span", { class: "tag", title: "Second 30-min break deducted, 20-min fatigue break paid at base", text: "FB" }) : null; })(),
          (s.ph === true || (s.ph !== false && ph)) ? el("span", { class: "tag ph", text: "PH" }) : null ]); }
      var d = res.days.filter(function (x) { return x.date === date; })[0];
      box.appendChild(el("button", { class: "day" + (date === iso(new Date()) ? " today" : ""), type: "button", style: color ? "--c:" + color : null, "aria-expanded": String(S.open === date),
        onclick: function () { S.open = S.open === date ? null : date; render(); } }, [
        el("div", { class: "dname" }, [ DAYS[i], el("small", { text: nice(date) }) ]), info,
        el("div", { class: "dpay", text: d && d.paid != null ? d.paid.toFixed(2) + " h" : "" }) ]));
      if (S.open === date) box.appendChild(editor(w, date, s, ph));
    })(i);
  }

  function editor(w, date, s, ph) {
    var last = (w.shifts || []).filter(function (x) { return !x.kind || x.kind === "work"; }).slice(-1)[0] || {};
    var d = s ? clone(s) : { date: date, kind: "work", job: last.job || "wharf", start: last.start || "06:00", finish: "16:30", dg: false };
    d.kind = d.kind || "work";
    var ed = el("div", { class: "editor" });
    function seg(opts, val, set, colored) {
      return el("div", { class: "seg" }, opts.map(function (o) { return el("button", { type: "button", "aria-pressed": String(o[0] === val), text: o[1],
        style: colored && o[2] ? "--c:var(" + o[2] + ")" : null, onclick: function () { set(o[0]); draw(); } }); }));
    }
    function draw() {
      ed.textContent = "";
      ed.appendChild(seg(KINDS, d.kind, function (v) { d.kind = v; }));
      if (d.kind === "work") {
        ed.appendChild(seg(JOBS, d.job, function (v) { d.job = v; }, true));
        var st = el("input", { type: "time", id: "st-" + date, value: d.start }); st.addEventListener("input", function () { d.start = st.value; });
        var fi = el("input", { type: "time", id: "fi-" + date, value: d.finish }); fi.addEventListener("input", function () { d.finish = fi.value; });
        ed.appendChild(el("div", { class: "row" }, [ el("label", { class: "f" }, ["Start", st]), el("label", { class: "f" }, ["Finish", fi]) ]));
        var dg = el("input", { type: "checkbox", id: "dg-" + date }); dg.checked = !!d.dg; dg.addEventListener("change", function () { d.dg = dg.checked; });
        var px = el("input", { type: "checkbox", id: "ph-" + date }); px.checked = d.ph === true || (d.ph !== false && ph); px.addEventListener("change", function () { d.ph = px.checked; });
        ed.appendChild(el("div", { class: "checks" }, [ el("label", {}, [dg, "DG day"]), el("label", {}, [px, "Public holiday"]) ]));
      } else {
        var h = el("input", { type: "number", step: "0.25", min: "0", inputmode: "decimal", id: "h-" + date, value: d.hours != null ? d.hours : (d.kind === "lwop" ? "" : 7.5) });
        h.addEventListener("input", function () { d.hours = parseFloat(h.value) || 0; });
        ed.appendChild(el("label", { class: "f" }, ["Hours", h]));
      }
      ed.appendChild(el("div", { class: "btns" }, [
        s ? el("button", { class: "btn danger", type: "button", text: "Clear day", onclick: function () {
          w.shifts = w.shifts.filter(function (x) { return x.date !== date; }); S.open = null; saveWeek(S.cur); render(); } }) : null,
        el("button", { class: "btn", type: "button", text: "Cancel", onclick: function () { S.open = null; render(); } }),
        el("button", { class: "btn primary", type: "button", text: "Save day", onclick: function () {
          if (d.kind === "work" && (!d.start || !d.finish)) { setSave("Enter a start and finish time", "warn"); return; }
          if (d.kind !== "work") { delete d.job; delete d.start; delete d.finish; delete d.dg; delete d.ph; if (d.hours == null && d.kind !== "lwop") d.hours = 7.5; }
          w.shifts = (w.shifts || []).filter(function (x) { return x.date !== date; }).concat([d]); S.open = null; saveWeek(S.cur); render(); } }) ]));
    }
    draw(); return ed;
  }

  function sectionTable(headers, rows, cls) {
    return el("div", { class: "tbl" }, [ el("table", { class: cls || null }, [ el("thead", {}, [ el("tr", {}, headers.map(function (h) { return el("th", { text: h }); })) ]), el("tbody", {}, rows) ]) ]);
  }

  function renderDoc(id, res) {
    var box = $("doc"); box.textContent = "";
    var pr = S.profile, f = figures(id), y = ytd(id);
    box.appendChild(el("div", { class: "hdr" }, [
      el("div", { class: "who" }, [ el("b", { text: pr.name || "Your name" }), el("span", { text: pr.position }), el("span", { text: "Department: " + pr.department }) ]),
      el("div", { class: "meta" }, [ el("span", {}, [ "Pay period ", el("b", { text: dmy(id) + " – " + dmy(addDays(id, 6)) }) ]),
        el("span", {}, [ "Pay date ", el("b", { text: dmy(addDays(id, 7)) }) ]) ]),
      el("div", { class: "stamp", text: "Predicted · not an official payslip" }) ]));
    if (!res.lines.length) { box.appendChild(el("p", { class: "hint pad", text: "Add this week's shifts above and the payslip builds here, line by line, in the same order as your real one." })); return; }

    var gi = res.lines.map(function (l, i) {
      return el("tr", { class: "c-" + l.cat, style: "animation-delay:" + i * 25 + "ms" }, [
        el("td", {}, [ el("i", { class: "dot" }), l.label ]), el("td", { text: l.units == null ? "" : f4(l.units) }),
        el("td", { text: l.type }), el("td", { text: l.rate == null ? "" : f4(l.rate) }), el("td", { text: f2(l.amount) }) ]);
    });
    box.appendChild(sectionTable(["Gross Income", "Units", "Type", "Rate", "Amount"], gi, "gi"));
    box.appendChild(sectionTable(["Total Employer Contributions", "Units", "Amount"], [ el("tr", {}, [
      el("td", { text: "Superannuation Guarantee" }), el("td", { text: (cfg().rules.superRate * 100).toFixed(3) + "%" }), el("td", { text: f2(res.super) }) ]) ]));

    var ytdOk = y.ok;
    function srow(label, now, yv, total) {
      var tdN = el("td"), tdY = el("td");
      countUp(tdN, "n" + label, now, f2);
      if (yv == null) tdY.textContent = "—"; else countUp(tdY, "y" + label, yv, f2);
      return el("tr", { class: total ? "total" : null }, [ el("td", { text: label }), tdN, tdY ]);
    }
    var yg = ytdOk ? y.gross : null;
    box.appendChild(sectionTable(["Pay Summary", "This Pay", "YTD"], [
      srow("Total Gross Income", res.gross, yg), srow("Total Pre Tax Deductions", 0, ytdOk ? 0 : null),
      srow("Total Gross Taxable", res.gross, yg), srow("Total PAYG", res.payg, ytdOk ? y.payg : null),
      srow("Total After Tax Deductions", 0, ytdOk ? 0 : null), srow("Total Net Pay", res.net, ytdOk ? y.net : null, true),
      srow("Total Employer Contributions", res.super, ytdOk ? y.sup : null) ]));
    var netNode = el("b"); countUp(netNode, "netblock", res.net, money);
    box.appendChild(el("div", { class: "netblock" }, [ el("span", { text: "Net pay" }), netNode ]));

    var open = y.alOpen;
    box.appendChild(sectionTable(["Entitlement", "Open", "Accrued", "Taken", "Close"], [ el("tr", {}, [
      el("td", { text: "Annual Leave (h)" }), el("td", { text: open == null ? "—" : open.toFixed(4) }), el("td", { text: res.alAccrued.toFixed(4) }),
      el("td", { text: f.taken.toFixed(4) }), el("td", { text: open == null ? "—" : (open + res.alAccrued - f.taken).toFixed(4) }) ]) ]));
    box.appendChild(el("div", { class: "btns pad" }, [ el("button", { class: "btn primary", type: "button", id: "pdfBtn", text: "Download payslip (PDF)", onclick: function () { makePdf(id); } }) ]));
    if (!S.baseline || !S.baseline.week) box.appendChild(el("p", { class: "hint pad", text: "YTD counts only the weeks logged here. In Setup, enter the YTD figures from a recent real payslip to make YTD and the leave balance match." }));
  }

  // ---------- compare ----------
  function renderCompare(id, w, res) {
    var box = $("cmp"); box.textContent = ""; w.actual = w.actual || {};
    var labels = []; res.lines.forEach(function (l) { if (labels.indexOf(l.label) < 0) labels.push(l.label); });
    Object.keys(w.actual).forEach(function (k) { if (k[0] !== "_" && labels.indexOf(k) < 0) labels.push(k); });
    var pred = {}, cat = {}; res.lines.forEach(function (l) { pred[l.label] = (pred[l.label] || 0) + l.amount; cat[l.label] = l.cat; });
    function row(label, p, key, c) {
      var v = w.actual[key];
      var inp = el("input", { type: "number", step: "0.01", inputmode: "decimal", id: "a-" + key.replace(/[^a-z0-9]/gi, "_"), "aria-label": "Actual " + label, value: v == null ? "" : v });
      var dcell = el("td", { class: "diff" });
      function upd() {
        var a = inp.value === "" ? null : +inp.value;
        if (a == null) { delete w.actual[key]; dcell.textContent = ""; dcell.className = "diff"; return; }
        w.actual[key] = a; var d = Math.round((a - p) * 100) / 100;
        dcell.textContent = Math.abs(d) < 0.005 ? "✓" : (d > 0 ? "+" : "−") + Math.abs(d).toFixed(2);
        dcell.className = "diff " + (Math.abs(d) <= 1 ? "ok" : d < 0 ? "neg" : "pos");
      }
      inp.addEventListener("input", function () { upd(); saveWeek(S.cur); verdict(); });
      upd();
      return el("tr", { class: c ? "c-" + c : null }, [ el("td", {}, [ c ? el("i", { class: "dot" }) : null, label ]), el("td", { text: f2(p) }), el("td", {}, [inp]), dcell ]);
    }
    box.appendChild(sectionTable(["Gross Income", "Predicted", "Actual", "Diff"], labels.map(function (l) { return row(l, pred[l] || 0, l, cat[l]); }), "cmp"));
    box.appendChild(sectionTable(["Pay Summary", "Predicted", "Actual", "Diff"], [ ["Total Gross Income", res.gross, "_gross"], ["Total PAYG", res.payg, "_payg"],
      ["Total Net Pay", res.net, "_net"], ["Super Guarantee", res.super, "_super"] ].map(function (t) { return row(t[0], t[1], t[2]); }), "cmp"));
    var add = el("input", { type: "text", id: "newline", placeholder: "Line name, e.g. Leave Loading" });
    box.appendChild(el("div", { class: "editor", style: "animation:none" }, [ el("label", { class: "f" }, ["Add a line that isn't predicted", add]),
      el("div", { class: "btns" }, [ el("button", { class: "btn", type: "button", text: "Add line", onclick: function () {
        var n = add.value.trim(); if (!n || n[0] === "_") return; if (w.actual[n] == null) w.actual[n] = 0; saveWeek(S.cur); render(); } }) ]) ]));
    verdict();
    function verdict() {
      var v = $("verdict"); v.textContent = "";
      var flagged = 0; labels.forEach(function (l) { if (w.actual[l] != null && Math.abs(w.actual[l] - (pred[l] || 0)) > 1) flagged++; });
      var ga = w.actual._gross, any = Object.keys(w.actual).length;
      if (!res.lines.length) { v.className = "verdict wait"; v.textContent = "No shifts logged for this week yet."; return; }
      if (!any) { v.className = "verdict wait"; v.textContent = "Type the amounts from your real payslip below to check it."; return; }
      var msg, ok;
      if (ga != null) { var gd = Math.round((ga - res.gross) * 100) / 100; ok = Math.abs(gd) <= 1 && !flagged;
        msg = ok ? "Gross matches the prediction at " + money(ga) + "." : (gd < 0 ? "Paid " + money(-gd) + " less" : gd > 0 ? "Paid " + money(gd) + " more" : "Gross matches") + " than predicted · " + flagged + " line" + (flagged === 1 ? "" : "s") + " off by more than $1.";
      } else { ok = !flagged; msg = ok ? "Lines entered so far match." : flagged + " line" + (flagged === 1 ? "" : "s") + " off by more than $1. Add the gross to see the total gap."; }
      v.className = "verdict " + (ok ? "ok" : "bad");
      var pct = ga != null && res.gross ? Math.max(0, 100 - Math.abs(ga - res.gross) / res.gross * 100) : (ok ? 100 : 60);
      var bar = el("i"); v.appendChild(el("div", { text: msg })); v.appendChild(el("div", { class: "meter" }, [bar]));
      requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.width = pct.toFixed(1) + "%"; }); });
    }
  }

  // ---------- setup ----------
  function renderSetup() {
    var box = $("setup"); box.textContent = ""; var c = clone(cfg());
    function inp(id, label, value, onchange, type, step) {
      var i = el("input", { id: id, type: type || "number", step: step || "0.01", value: value == null ? "" : value, inputmode: type === "text" ? null : "decimal" });
      i.addEventListener("change", function () { onchange(type === "text" || type === "date" ? i.value : (i.value === "" ? null : parseFloat(i.value))); });
      return el("label", { class: "f" }, [label, i]);
    }
    function rate(id, label, get, set, step) { return inp(id, label, get(), function (v) { if (v == null || isNaN(v)) return; set(v); S.cfg = c; saveSettings(); }, "number", step); }

    box.appendChild(el("h2", { text: "Payslip details" }));
    box.appendChild(el("div", { class: "grid2" }, [
      inp("p-name", "Name", S.profile.name, function (v) { S.profile.name = v; saveSettings(); }, "text"),
      inp("p-dept", "Department", S.profile.department, function (v) { S.profile.department = v; saveSettings(); }, "text") ]));
    box.appendChild(inp("p-pos", "Position", S.profile.position, function (v) { S.profile.position = v; saveSettings(); }, "text"));

    box.appendChild(el("h2", { text: "YTD starting point" }));
    box.appendChild(el("p", { class: "hint", text: "Copy these from your latest real payslip. Weeks after it add on top, so YTD and your leave balance stay in step with TRG's." }));
    var B = S.baseline || {};
    function bset(k) { return function (v) { S.baseline = S.baseline || {}; S.baseline[k] = v; saveSettings(); }; }
    box.appendChild(el("div", { class: "grid2" }, [
      inp("b-week", "Pay period start (Monday)", B.week, function (v) { bset("week")(v ? monday(v) : null); render(); }, "date"),
      inp("b-al", "Annual leave closing (h)", B.al, bset("al"), "number", "0.0001"),
      inp("b-gross", "YTD gross", B.gross, bset("gross")), inp("b-payg", "YTD PAYG", B.payg, bset("payg")),
      inp("b-net", "YTD net", B.net, bset("net")), inp("b-super", "YTD employer contributions", B.super, bset("super")) ]));

    box.appendChild(el("h2", { text: "Rates" }));
    box.appendChild(el("p", { class: "hint", text: "Change a rate when your payslip shows a new one, like the 1 July increase. Every week recalculates." }));
    JOBS.forEach(function (j) { var J = c.jobs[j[0]];
      box.appendChild(el("h3", { class: "jobhead", style: "--c:var(" + j[2] + ")", text: j[1] }));
      box.appendChild(el("div", { class: "grid3" }, [ rate("r-" + j[0] + "-b", "Base", function () { return J.base; }, function (v) { J.base = v; }),
        rate("r-" + j[0] + "-15", "1.5×", function () { return J.ot15; }, function (v) { J.ot15 = v; }),
        rate("r-" + j[0] + "-2", "2×", function () { return J.ot2; }, function (v) { J.ot2 = v; }),
        rate("r-" + j[0] + "-f", "Fatigue break", function () { return J.fatigue; }, function (v) { J.fatigue = v; }, "0.001") ]));
    });
    box.appendChild(el("h3", { text: "TRG extras per ordinary hour" }));
    box.appendChild(el("div", { class: "grid3" }, [ rate("r-bonus", "Bonus", function () { return c.extras.bonus; }, function (v) { c.extras.bonus = v; }),
      rate("r-skill", "Skill level", function () { return c.extras.skill; }, function (v) { c.extras.skill = v; }),
      rate("r-loy", "Loyalty", function () { return c.extras.loyalty; }, function (v) { c.extras.loyalty = v; }) ]));
    var A = c.allow;
    box.appendChild(el("h3", { text: "Allowances and penalty rates" }));
    box.appendChild(el("div", { class: "grid3" }, [ rate("r-meal", "Meal", function () { return A.meal; }, function (v) { A.meal = v; }),
      rate("r-dg", "DG bulk", function () { return A.dg; }, function (v) { A.dg = v; }), rate("r-night", "Night /h", function () { return A.night; }, function (v) { A.night = v; }),
      rate("r-sun", "Sunday /h", function () { return A.sundayRate; }, function (v) { A.sundayRate = v; }), rate("r-ph", "Public hol /h", function () { return A.phRate; }, function (v) { A.phRate = v; }),
      rate("r-leave", "Leave /h", function () { return A.leaveRate; }, function (v) { A.leaveRate = v; }) ]));
    var R = c.rules;
    box.appendChild(el("h3", { text: "Shift rules (hours)" }));
    box.appendChild(el("div", { class: "grid3" }, [ rate("r-ord", "Ordinary per day", function () { return R.dailyOrd; }, function (v) { R.dailyOrd = v; }, "0.25"),
      rate("r-band", "1.5× band", function () { return R.ot15Band; }, function (v) { R.ot15Band = v; }, "0.25"),
      rate("r-b2", "2nd break after", function () { return R.break2After; }, function (v) { R.break2After = v; }, "0.25"),
      rate("r-mo", "Meal after", function () { return R.mealOver; }, function (v) { R.mealOver = v; }, "0.25"),
      rate("r-fo", "Fatigue after", function () { return R.fatigueOver; }, function (v) { R.fatigueOver = v; }, "0.25"),
      rate("r-top", "Weekly top-up", function () { return R.weeklyTopUp; }, function (v) { R.weeklyTopUp = v; }, "0.25") ]));
    box.appendChild(el("div", { class: "btns" }, [ el("button", { class: "btn", type: "button", text: "Reset rates to July 2026", onclick: function () { S.cfg = null; saveSettings(); render(); } }) ]));

    box.appendChild(el("h2", { text: "Backup" }));
    box.appendChild(el("p", { class: "hint", text: Store.kind === "account" ? "Your weeks are saved to your Claude account. A backup file is still handy before moving to the Rootfox version." :
      "Your weeks live only on this device. Export a backup now and then, and keep the file somewhere safe. Import it on a new phone to restore everything." }));
    var file = el("input", { type: "file", id: "importFile", accept: "application/json,.json", hidden: "" });
    file.addEventListener("change", function () { var fl = file.files && file.files[0]; if (fl) importFile(fl); file.value = ""; });
    box.appendChild(file);
    box.appendChild(el("div", { class: "btns" }, [ el("button", { class: "btn", type: "button", text: "Import backup", onclick: function () { file.click(); } }),
      el("button", { class: "btn primary", type: "button", text: "Export backup", onclick: exportAll }) ]));
    box.appendChild(el("p", { class: "hint", id: "backupMsg", "aria-live": "polite" }));
  }

  function backupData() {
    var weeks = {}; Object.keys(S.weeks).forEach(function (k) { if ((S.weeks[k].shifts || []).length || Object.keys(S.weeks[k].actual || {}).length) weeks[k] = S.weeks[k]; });
    return { app: "trg-pay-check", version: 1, exported: new Date().toISOString(), settings: { cfg: S.cfg, profile: S.profile, baseline: S.baseline }, weeks: weeks };
  }
  // Save a file: Android app -> write to cache and open the share sheet; browser -> normal download
  function isNative() { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
  function plugin(name) { var C = window.Capacitor; return (C.Plugins && C.Plugins[name]) || (C.registerPlugin && C.registerPlugin(name)); }
  async function saveFile(name, base64, mime, title) {
    if (isNative()) {
      var FS = plugin("Filesystem"), SH = plugin("Share");
      var w = await FS.writeFile({ path: name, data: base64, directory: "CACHE" });
      try { await FS.writeFile({ path: "TRG Pay Check/" + name, data: base64, directory: "DOCUMENTS", recursive: true }); } catch (e) {}
      await SH.share({ title: title, files: [w.uri], dialogTitle: title });
      return "Saved " + name + ". Pick where to keep it.";
    }
    var bin = atob(base64), arr = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([arr], { type: mime })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    return "Saved " + name + ".";
  }
  function b64(str) { return btoa(unescape(encodeURIComponent(str))); }

  function makePdf(id) {
    var J = window.jspdf; if (!J || !J.jsPDF) { setSave("PDF tool didn't load", "warn"); return; }
    var w = week(id), res = P.calcWeek(w.shifts, cfg()), y = ytd(id), f = figures(id), pr = S.profile;
    var doc = new J.jsPDF({ unit: "mm", format: "a4" }), L = 14, R = 196, ink = [23, 36, 42], grey = [233, 237, 239], mute = [90, 106, 113];
    doc.setTextColor.apply(doc, ink);
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(pr.name || "Your name", L, 20);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor.apply(doc, mute);
    doc.text("Position: " + pr.position, L, 27); doc.text("Department: " + pr.department, L, 32);
    doc.text("Pay Period:", 128, 27); doc.text("Pay Date:", 128, 32);
    doc.setTextColor.apply(doc, ink); doc.text(dmy(id) + " - " + dmy(addDays(id, 6)), 150, 27); doc.text(dmy(addDays(id, 7)), 150, 32);
    doc.setDrawColor(242, 155, 12); doc.setTextColor(200, 120, 0); doc.setLineWidth(0.6); doc.roundedRect(128, 11, 68, 8, 1.5, 1.5);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("PREDICTED - NOT AN OFFICIAL PAYSLIP", 162, 16.3, { align: "center" });
    doc.setTextColor.apply(doc, ink);
    var base = { theme: "plain", margin: { left: L, right: 210 - R }, styles: { fontSize: 9, cellPadding: 1.6, textColor: ink },
      headStyles: { fillColor: grey, fontStyle: "bold", textColor: ink }, columnStyles: {} };
    function tbl(head, body, right, extra) {
      var cs = {}; right.forEach(function (c) { cs[c] = { halign: "right" }; });
      var o = Object.assign({}, base, { head: [head], body: body, columnStyles: cs, startY: (doc.lastAutoTable ? doc.lastAutoTable.finalY : 38) + 4,
        didParseCell: function (d) { if (d.section === "head" && right.indexOf(d.column.index) >= 0) d.cell.styles.halign = "right"; } }, extra || {});
      doc.autoTable(o);
    }
    tbl(["Gross Income", "Units", "Type", "Rate", "Amount"], res.lines.map(function (l) {
      return [l.label, l.units == null ? "" : f4(l.units), l.type, l.rate == null ? "" : f4(l.rate), f2(l.amount)]; }), [1, 3, 4]);
    tbl(["Total Employer Contributions", "Units", "Amount"], [["Superannuation Guarantee", (cfg().rules.superRate * 100).toFixed(3) + "%", f2(res.super)]], [1, 2]);
    tbl(["Disbursements", "Amount"], [["Net pay to your account", f2(res.net)]], [1]);
    var ok = y.ok, Y = function (v) { return ok ? f2(v) : "-"; };
    tbl(["Pay Summary", "This Pay Amount", "YTD Amount"], [
      ["Total Gross Income", f2(res.gross), Y(y.gross)], ["Total Pre Tax Deductions", "0.00", Y(0)], ["Total Gross Taxable", f2(res.gross), Y(y.gross)],
      ["Total PAYG", f2(res.payg), Y(y.payg)], ["Total After Tax Deductions", "0.00", Y(0)], ["Total After Tax Income", "0.00", Y(0)],
      ["Total Net Pay", f2(res.net), Y(y.net)], ["Total Employer Contributions", f2(res.super), Y(y.sup)]], [1, 2]);
    var op = y.alOpen;
    tbl(["Entitlement", "Opening Balance", "Accrued This Pay", "Taken This Pay", "Closing Balance"], [["Annual Leave (Hours)",
      op == null ? "-" : op.toFixed(4), res.alAccrued.toFixed(4), f.taken.toFixed(4), op == null ? "-" : (op + res.alAccrued - f.taken).toFixed(4)]], [1, 2, 3, 4]);
    var sh = (w.shifts || []).slice().sort(function (a, b) { return a.date.localeCompare(b.date); }).map(function (s) {
      var d = new Date(s.date + "T12:00:00");
      return [DAYS[(d.getDay() + 6) % 7] + " " + dmy(s.date), s.kind && s.kind !== "work" ? (KINDS.filter(function (k) { return k[0] === s.kind; })[0] || ["", ""])[1] : jobOf(s.job)[1],
        s.start || "", s.finish || "", s.kind && s.kind !== "work" ? (s.hours || 0).toFixed(2) : span(s).toFixed(2), s.dg ? "DG" : ""]; });
    tbl(["Shifts logged", "Job", "Start", "Finish", "Hours", ""], sh, [4]);
    doc.setFontSize(7.5); doc.setTextColor.apply(doc, mute);
    doc.text("Generated by TRG Pay Check on " + dmy(iso(new Date())) + " from logged shift times. A prediction to compare against your real payslip.", L, 289);
    var name = "predicted-payslip-" + id + ".pdf", data = doc.output("datauristring").split(",")[1];
    setSave("Making PDF…", "busy");
    saveFile(name, data, "application/pdf", "Predicted payslip").then(function (m) { setSave(m); }, function () { setSave("PDF wasn't saved", "warn"); });
  }

  async function exportAll() {
    var json = JSON.stringify(backupData(), null, 1), name = "trg-pay-backup-" + iso(new Date()) + ".json", msg = $("backupMsg");
    if (isNative()) { try { msg.textContent = await saveFile(name, b64(json), "application/json", "TRG Pay Check backup"); } catch (e) { msg.textContent = "The backup wasn't saved."; } return; }
    try {
      if (window.claude && window.claude.use) { var dl = await window.claude.use("downloads");
        if (dl) { await dl.save({ filename: name, data: json }); msg.textContent = "Backup saved as " + name + "."; return; } }
    } catch (e) { msg.textContent = "The backup wasn't saved."; return; }
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([json], { type: "application/json" })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    msg.textContent = "Backup saved as " + name + ".";
  }
  function importFile(fl) {
    var msg = $("backupMsg"), r = new FileReader();
    r.onload = async function () {
      try {
        var b = JSON.parse(r.result);
        if (!b || b.app !== "trg-pay-check" || typeof b.weeks !== "object") throw new Error("not a backup");
        var n = 0;
        for (var k in b.weeks) { if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue; var w = b.weeks[k];
          S.weeks[k] = { shifts: Array.isArray(w.shifts) ? w.shifts : [], actual: w.actual && typeof w.actual === "object" ? w.actual : {} };
          await Store.put("w" + k, { shifts: S.weeks[k].shifts, actual: S.weeks[k].actual, updated: new Date().toISOString() }); n++; }
        if (b.settings) { S.cfg = b.settings.cfg || null; S.profile = Object.assign(clone(PROFILE_DEFAULT), b.settings.profile || {}); S.baseline = b.settings.baseline || null;
          await Store.put("settings", { cfg: S.cfg ? JSON.stringify(S.cfg) : null, profile: S.profile, baseline: S.baseline }); }
        render(); $("backupMsg").textContent = "Restored " + n + " week" + (n === 1 ? "" : "s") + " from the backup.";
      } catch (e) { msg.textContent = "That file isn't a TRG Pay Check backup. Pick the .json file the Export button made."; }
    };
    r.readAsText(fl);
  }

  // ---------- boot ----------
  $("prevWeek").onclick = function () { S.cur = addDays(S.cur, -7); S.open = null; render(); };
  $("nextWeek").onclick = function () { S.cur = addDays(S.cur, 7); S.open = null; render(); };
  $("thisWeek").onclick = function () { S.cur = monday(iso(new Date())); S.open = null; render(); };
  Array.prototype.forEach.call(document.querySelectorAll(".tabs button"), function (b) { b.onclick = function () { S.tab = b.dataset.tab; S.open = null; render(); }; });

  setSave("Loading…", "busy"); render();
  (async function boot() {
    await Store.init();
    var all = {}; try { all = await Store.loadAll(); } catch (e) { setSave("Couldn't load saved weeks", "warn"); }
    Object.keys(all).forEach(function (k) { var b = all[k];
      if (k === "settings") { try { S.cfg = b.cfg ? JSON.parse(b.cfg) : null; if (S.cfg && (S.cfg.version || 1) < 3) { S.cfg.rules.break2 = 0.5; S.cfg.rules.break2After = 10.75; S.cfg.rules.fatigueOver = 10.75; S.cfg.version = 3; } } catch (e) {} S.profile = Object.assign(clone(PROFILE_DEFAULT), b.profile || {}); S.baseline = b.baseline || null; }
      else if (k[0] === "w") S.weeks[k.slice(1)] = { shifts: b.shifts || [], actual: b.actual || {} }; });
    var bn = null, logged = Object.keys(S.weeks).filter(function (k) { return S.weeks[k].shifts.length; }).sort();
    if (!logged.length && BUILD.starter) {
      var st = BUILD.starter; S.weeks[st.id] = { shifts: clone(st.shifts), actual: clone(st.actual) };
      if (!S.baseline && st.baseline) S.baseline = clone(st.baseline); if (!S.profile.name && st.name) S.profile.name = st.name;
      logged = [st.id]; bn = $("banner"); bn.hidden = false; bn.textContent = "Loaded your 19–25 Oct week and its real payslip to start with. Edit any day to make it yours.";
    }
    if (BUILD.starter && (!S.baseline || !S.baseline.week)) { S.baseline = clone(BUILD.starter.baseline); if (!S.profile.name) S.profile.name = BUILD.starter.name; }
    if (bn) S.cur = BUILD.starter.id;
    setSave(savedLabel()); render();
  })();
})();
