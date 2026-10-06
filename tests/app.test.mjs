// Test logic của index.html bằng Node (không cần cài gói): node --test
// Script trong index.html được chạy trong vm với Date cố định, không có DOM.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const HTML = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const SRC = HTML.match(/<script>\n([\s\S]*?)<\/script>\n<\/body>/)[1];
const FIXTURE = JSON.parse(fs.readFileSync(new URL("./fixtures/tien-do-2026-10-05.json", import.meta.url), "utf8"));
const J = x => JSON.parse(JSON.stringify(x));

const API = `
;render=function(){buildRoll();};
globalThis.__app={
  get SEQ(){return SEQ}, get SLOTS(){return SLOTS}, get SLOTMAP(){return SLOTMAP}, get CUTSET(){return CUTSET},
  get ROLL(){return ROLL}, get ROLL_LEFT(){return ROLL_LEFT}, get END_T(){return END_T},
  get data(){return data}, set data(v){data=v}, get IDX(){return IDX}, get TASKS(){return TASKS},
  buildSeq,buildSlots,buildPlan,buildRoll,buildDay,dayStats,streak,heatCols,migrateV1toV2,v1SlotIndexMap,mergeData,normalize,emptyData,importPayload,
  cutLowPriority,restoreCut,setOff,lagCounts,beFinishDate,aheadTasks,beTotals,scoreCard,seedCards,dueCards,slotIdx,
  DSA2,DSA_Q,COD_ORDER,LC,WEEKS,BUF,PHASE2,FLEX_WEEKS,REBASE,REBASE_ISO,BUFEND,EXT1,isoOf,fromIso,weekOf,dow,DAY
};`;

// Nạp app với "hôm nay" là todayIso (12:00 giờ VN), dữ liệu là file tiến độ v1 đã chuyển sang v2
function load(todayIso, withFixture = true) {
  const [y, m, d] = todayIso.split("-").map(Number);
  const fixed = Date.UTC(y, m - 1, d, 5, 0, 0);
  const ctx = vm.createContext({ console });
  vm.runInContext(`(()=>{const R=Date;const F=${fixed};class D extends R{constructor(...a){if(a.length)super(...a);else super(F);}static now(){return F;}}globalThis.Date=D;})();`, ctx);
  vm.runInContext(SRC + API, ctx);
  const app = ctx.__app;
  app.buildSeq();
  app.buildSlots();
  if (withFixture) app.data = app.mergeData(app.emptyData(), app.migrateV1toV2(J(FIXTURE.done)));
  app.buildPlan();
  app.buildRoll();
  return app;
}
const ids = (app, iso) => J(app.ROLL.be[iso] || []).map(i => app.SEQ[i].task.id);
const lcRoll = (app, iso) => J(app.ROLL.lc[iso] || []).map(i => app.LC[i][0]);
const lcBase = (app, iso) => J(app.DSA2[iso] || []).map(i => app.LC[i][0]);
const beIds = day => day.blocks.flatMap(b => b.items).filter(it => it.kind === "be").map(it => it.id);
// Tích 1 task vào ngày iso (như khi bấm checkbox hôm đó)
const tick = (app, id, iso) => { app.data.done[id] = 1; app.data.at[id] = iso; app.buildRoll(); };

test("nội dung: id duy nhất, task v2 có ưu tiên 1–5 và Đạt khi", () => {
  const app = load("2026-10-06", false);
  const all = [];
  Object.values(app.WEEKS).concat([app.BUF]).forEach(w => w.be.forEach(t => all.push(t)));
  app.PHASE2.forEach(g => g.items.forEach(t => all.push(t)));
  const list = all.map(t => t.id);
  assert.equal(new Set(list).size, list.length, "id bị trùng");
  const v2 = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16].flatMap(w => app.WEEKS[w].be).concat(app.BUF.be);
  assert.equal(v2.length, 103);
  for (const t of v2) {
    assert.ok(t.pri >= 1 && t.pri <= 5, t.id + " thiếu ưu tiên");
    assert.match(t.dod, /^Đạt khi: /, t.id + " thiếu Đạt khi");
  }
});

test("migration v1 → v2: task backend đã làm đổi đúng sang id", () => {
  const app = load("2026-10-06");
  const be = Object.keys(app.data.done).filter(id => /^w\d\d-|^b-/.test(id)).sort();
  assert.deepEqual(be, [
    "w00-baseline-db", "w00-baseline-java", "w00-hello-boot", "w00-minipay-readme", "w00-setup",
    "w01-effective-java-ch3", "w01-equals-hashcode", "w01-equals-pass-by-value", "w01-immutable-record", "w01-integer-cache",
    "w01-multimodule-junit", "w01-notes", "w01-oop", "w01-readme-qa", "w01-string-pool",
    "w02-collections", "w02-generics", "w02-hashmap-internals", "w02-myhashmap"
  ]);
  // EJ ch.3 được tích cả 20/9 và 24/9 ở v1: giữ ngày sớm nhất
  assert.equal(app.data.at["w01-effective-java-ch3"], "2026-09-20");
  for (const k of ["lc-1", "cod-2", "2026-09-12|en", "2026-09-27|mock", "2026-10-01|sch-15:45"]) assert.ok(app.data.done[k], k);
  // Mỗi task đã làm có bằng chứng "từ v1"; task học Tuần 1–2 (không tính setup Tuần 0) có 1 thẻ ôn, giãn 2 thẻ/ngày từ 6/10
  assert.equal(Object.keys(app.data.proof).length, 19);
  const cards = Object.values(J(app.data.reviews));
  assert.ok(cards.every(c => !c.task.startsWith("w00-")));
  const dues = cards.map(c => c.due).sort();
  assert.equal(dues.length, 14);
  assert.equal(dues[0], "2026-10-06");
  assert.equal(dues[13], "2026-10-12");
});

test("lịch sử trước 6/10 giữ nguyên như v1", () => {
  const app = load("2026-10-06");
  const v1 = J(app.v1SlotIndexMap([]));
  let n = 0;
  for (const sl of J(app.SLOTS)) {
    if (sl.t >= app.REBASE) continue;
    const key = sl.iso + "|" + sl.slot;
    assert.equal(app.SLOTMAP[key], v1[key], key);
    n++;
  }
  assert.ok(n > 30);
  assert.equal(app.SEQ[app.slotIdx("2026-09-26", "be1")].task.id, "w02-hashmap-internals");
  assert.deepEqual(J(beIds(app.buildDay(app.fromIso("2026-09-26")))), ["w02-hashmap-internals"]);
});

test("migration chạy lại và gộp nhiều lần cho cùng kết quả", () => {
  const app = load("2026-10-06", false);
  const a = J(app.migrateV1toV2(J(FIXTURE.done)));
  assert.deepEqual(a, J(app.migrateV1toV2(J(FIXTURE.done))));
  const m1 = J(app.mergeData(app.emptyData(), a));
  assert.deepEqual(J(app.mergeData(m1, a)), m1);
});

test("import: nhận file v1 lẫn v2, luật gộp, lần dời tay cũ chuyển thành cut", () => {
  const app = load("2026-10-06", false);
  assert.deepEqual(J(app.importPayload(J(FIXTURE))), J(app.migrateV1toV2(J(FIXTURE.done))));
  const v2 = J(app.mergeData(app.emptyData(), app.migrateV1toV2(J(FIXTURE.done))));
  assert.deepEqual(J(app.importPayload({ app: "hoang-backend-tracker", version: 2, data: v2 })), v2);

  const a = app.emptyData(), b = app.emptyData();
  a.done.x = 1; a.notes["2026-10-06"] = "dòng A"; a.reviews["x#0"] = { task: "x", step: 0, due: "2026-10-07" };
  b.notes["2026-10-06"] = "dòng A\ndòng B"; b.done.y = 1; b.off["2026-10-09"] = 1;
  b.reviews["x#0"] = { task: "x", step: 0, due: "2026-10-07", score: 3, doneAt: "2026-10-07" };
  const m = J(app.mergeData(a, b));
  assert.ok(m.done.x && m.done.y, "done = true thắng");
  assert.equal(m.notes["2026-10-06"], "dòng A\ndòng B", "ghi chú nối không trùng");
  assert.equal(m.reviews["x#0"].score, 3, "thẻ ôn lấy bản đã chấm");
  assert.equal(m.off["2026-10-09"], 1, "ngày nghỉ được gộp");
  assert.deepEqual(J(app.mergeData(m, b)), m);
  assert.throws(() => app.importPayload("không phải object"));

  // Bản đã deploy trước đó có nút dời lịch tay: lần dời từ 6/10 bị bỏ (lịch cuộn thay thế), task đã cắt giữ lại
  const n = J(app.normalize({ shifts: [
    { date: "2026-09-30", startId: "w02-treeify", skip: [], cut: [] },
    { date: "2026-10-20", startId: "w04-hashmap-note", skip: ["w04-lambda"], cut: ["w12-lambda"] }
  ] }));
  assert.deepEqual(n.shifts.map(s => s.date), ["2026-09-30"]);
  assert.deepEqual(n.cut, ["w12-lambda"]);
});

test("lịch cuộn: 6/10 bắt đầu Tuần 4, 103 task xếp hết tới 8/1", () => {
  const app = load("2026-10-06");
  assert.deepEqual(ids(app, "2026-10-06"), ["w04-hashmap-note"]);
  assert.deepEqual(ids(app, "2026-10-08"), ["w04-stream-lab", "w04-stream-advanced"]);
  assert.deepEqual(ids(app, "2026-10-10"), [], "thứ Bảy không nhận việc");
  assert.deepEqual(ids(app, "2026-10-12"), ["w05-race-lab"]);
  assert.deepEqual(ids(app, "2026-10-19"), ["w06-di-from-scratch"]);
  assert.deepEqual(ids(app, "2026-12-28"), ["w16-m8-k6"]);
  assert.deepEqual(ids(app, "2027-01-08"), ["b-fpt-starcamp", "b-plan-phase2"]);
  const all = Object.values(J(app.ROLL.be)).flat();
  assert.equal(all.length, 103);
  assert.equal(new Set(all).size, 103);
  assert.equal(app.ROLL_LEFT.be.length, 0);
  assert.equal(app.isoOf(app.beFinishDate()), "2027-01-08");
  // Kế hoạch gốc (để đo độ chậm) vẫn xếp như cũ
  assert.equal(app.SEQ[app.slotIdx("2026-10-06", "be1")].task.id, "w04-hashmap-note");
  assert.deepEqual(J(app.lagCounts()), { be: 0, lc: 0 });
  assert.deepEqual(J(app.beTotals()), { tot: 122, dn: 19 });
});

test("việc chưa làm tự sang hôm nay, không dồn", () => {
  // 6/10 và 7/10 dành cả ngày cho việc khác
  const app = load("2026-10-08");
  assert.deepEqual(ids(app, "2026-10-06"), [], "ngày đã qua chỉ hiện việc đã làm");
  assert.deepEqual(ids(app, "2026-10-07"), []);
  assert.deepEqual(ids(app, "2026-10-08"), ["w04-hashmap-note", "w04-lambda"], "hôm nay nhận việc của 6/10 và 7/10, chỉ đủ 2 ô");
  assert.deepEqual(ids(app, "2026-10-09"), ["w04-stream-lab", "w04-stream-advanced"]);
  assert.deepEqual(J(app.lagCounts()), { be: 2, lc: 4 });
  // DSA cũng cuộn: thứ Năm làm Codility, bài 6/10–7/10 sang thứ Sáu (2 bài/ngày ở Tuần 4)
  assert.deepEqual(J(app.ROLL.cod["2026-10-08"]), [3]);
  assert.deepEqual(lcRoll(app, "2026-10-08"), []);
  assert.deepEqual(lcRoll(app, "2026-10-09"), [153, 33]);
  // Ngày đã qua vẫn tính phần chưa làm (để chuỗi ngày và bản đồ trung thực)
  const st = J(app.dayStats(app.fromIso("2026-10-07")));
  assert.equal(st.beTot, 1); assert.equal(st.beDone, 0);
  assert.equal(st.dsTot, 2); assert.equal(st.dsDone, 0);
});

test("đã tích là xong hẳn, làm trước được, không phải tích lại", () => {
  const app = load("2026-10-08");
  tick(app, "w04-stream-lab", "2026-10-07");   // hôm qua làm trước 1 task
  tick(app, "w04-lambda", "2026-10-08");       // hôm nay làm 1 task
  assert.deepEqual(ids(app, "2026-10-07"), ["w04-stream-lab"], "ngày đã qua hiện việc đã làm hôm đó");
  assert.deepEqual(ids(app, "2026-10-08"), ["w04-lambda", "w04-hashmap-note"]);
  assert.deepEqual(ids(app, "2026-10-09"), ["w04-stream-advanced", "w04-errors-money"]);
  const later = Object.entries(J(app.ROLL.be)).filter(([iso]) => iso > "2026-10-08").flatMap(([, l]) => l).map(i => app.SEQ[i].task.id);
  assert.ok(!later.includes("w04-lambda") && !later.includes("w04-stream-lab"), "task đã tích không quay lại");
  assert.equal(J(app.aheadTasks(1))[0].i, app.IDX["w04-stream-advanced"]);
  // Tích task của ngày mai ngay hôm nay: nó hiện ở hôm nay, mai nhận task kế tiếp
  tick(app, "w04-stream-advanced", "2026-10-08");
  assert.deepEqual(ids(app, "2026-10-08"), ["w04-lambda", "w04-stream-advanced"]);
  assert.deepEqual(ids(app, "2026-10-09"), ["w04-hashmap-note", "w04-errors-money"]);
});

test("ngày nghỉ ôn thi: không nhận việc, việc lùi sang ngày sau", () => {
  const app = load("2026-10-08");
  app.setOff(app.fromIso("2026-10-08"), false, true);
  assert.deepEqual(ids(app, "2026-10-08"), []);
  assert.deepEqual(J(app.ROLL.cod["2026-10-08"]), []);
  assert.deepEqual(ids(app, "2026-10-09"), ["w04-hashmap-note", "w04-lambda"]);
  const day = app.buildDay(app.fromIso("2026-10-08"));
  assert.ok(day.off && day.blocks.some(b => b.title === "Nghỉ backend (ôn thi)"));
  assert.equal(J(app.dayStats(app.fromIso("2026-10-08"))).beTot, 0, "ngày nghỉ không tính thiếu");
  // Nghỉ tới hết Chủ nhật
  app.setOff(app.fromIso("2026-10-09"), true, true);
  for (const iso of ["2026-10-09", "2026-10-10", "2026-10-11"]) assert.deepEqual(ids(app, iso), [], iso);
  assert.deepEqual(ids(app, "2026-10-12"), ["w04-hashmap-note"]);
  // Bỏ nghỉ
  app.setOff(app.fromIso("2026-10-09"), false, false);
  assert.deepEqual(ids(app, "2026-10-09"), ["w04-hashmap-note", "w04-lambda"]);
});

test("chậm nhiều tuần: lịch kéo dài qua 8/1, tuần thi giữ trống, cắt và khôi phục task tuỳ chọn", () => {
  const app = load("2026-11-16");
  assert.deepEqual(ids(app, "2026-11-16"), ["w04-hashmap-note"]);
  assert.equal(app.ROLL_LEFT.be.length, 0);
  const fin = app.beFinishDate();
  assert.ok(fin > app.BUFEND, "dự kiến xong sau 8/1");
  assert.equal(app.weekOf(app.fromIso("2027-01-11")), 17);
  assert.ok(app.END_T >= fin);
  assert.ok(J(app.heatCols()).includes(17));
  assert.ok(app.buildDay(fin), "ngày nối dài dựng được");
  for (let t = app.fromIso("2026-12-14"); t <= app.fromIso("2026-12-27"); t += app.DAY) assert.deepEqual(ids(app, app.isoOf(t)), []);
  app.cutLowPriority();
  assert.deepEqual(J(app.data.cut).sort(), ["w05-scoped-structured", "w12-lambda"]);
  const all = Object.values(J(app.ROLL.be)).flat().map(i => app.SEQ[i].task.id);
  assert.ok(!all.includes("w12-lambda"));
  assert.ok(app.beFinishDate() < fin, "cắt xong thì lịch ngắn lại");
  app.restoreCut();
  assert.equal(app.isoOf(app.beFinishDate()), app.isoOf(fin));
});

test("DSA: chỉ Easy/Medium, Codility chưa làm sang thứ Năm kế tiếp, xếp hết hàng đợi", () => {
  const app = load("2026-10-06");
  // Kế hoạch gốc (đo độ chậm)
  assert.deepEqual(lcBase(app, "2026-10-06"), [153, 33]);
  assert.deepEqual(lcBase(app, "2026-10-12"), [143]);
  assert.equal(Object.values(J(app.DSA2)).flat().length, 49);
  for (const i of J(app.DSA_Q)) assert.notEqual(app.LC[i][3], "H");
  // Lịch cuộn: toàn bộ 98 bài và 15 lesson được xếp, mỗi bài 1 lần
  assert.deepEqual(lcRoll(app, "2026-10-06"), [153, 33]);
  const lc = Object.values(J(app.ROLL.lc)).flat();
  assert.equal(lc.length, 98); assert.equal(new Set(lc).size, 98);
  assert.equal(app.ROLL_LEFT.lc.length, 0);
  const cod = Object.entries(J(app.ROLL.cod)).filter(([, l]) => l.length);
  assert.deepEqual(cod.map(([, l]) => l[0]), J(app.COD_ORDER));
  assert.ok(cod.every(([iso]) => app.dow(app.fromIso(iso)) === 4));
  assert.ok(cod.every(([iso]) => iso < "2026-12-14" || iso > "2026-12-27"), "tuần thi không có Codility");
  // Thứ Bảy và tuần thi: làm lại bài ☆
  assert.equal(app.buildDay(app.fromIso("2026-10-10")).blocks.find(b => b.slot === "dsa").items[0].kind, "rev");
  assert.equal(app.buildDay(app.fromIso("2026-12-16")).blocks.find(b => b.slot === "dsa").items[0].kind, "rev");
  // Bỏ lỡ Codility L3 thứ Năm 8/10 → thứ Năm 15/10 vẫn là L3
  const late = load("2026-10-15");
  assert.deepEqual(J(late.ROLL.cod["2026-10-15"]), [3]);
  assert.deepEqual(J(late.ROLL.cod["2026-10-22"]), [4]);
});

test("thứ Bảy là Buffer, tuần thi không có task trong hàng đợi", () => {
  const app = load("2026-10-06");
  for (let t = app.REBASE; t <= app.fromIso("2027-01-10"); t += app.DAY) {
    const day = app.buildDay(t);
    const list = beIds(day);
    if (app.dow(t) === 6 && day.roll) {
      assert.equal(list.length, 0, day.iso);
      assert.ok(day.blocks.some(b => b.slot === "buffer" && b.s === "13:30"), day.iso);
    }
    if (day.w === 14 || day.w === 15) for (const id of list) assert.equal(app.IDX[id], undefined, id);
  }
});

test("ôn ngắt quãng: +1/+3/+7/+21, chấm dưới 2 thì ôn lại hôm sau", () => {
  const app = load("2026-10-06", false);
  const t = s => app.fromIso(s);
  app.data.done["w04-lambda"] = 1;
  app.seedCards("w04-lambda", t("2026-10-06"));
  const r = J(app.data.reviews);
  assert.deepEqual(r["w04-lambda#0"], { task: "w04-lambda", step: 0, due: "2026-10-07" });
  assert.deepEqual(J(app.dueCards(t("2026-10-07"))), ["w04-lambda#0"]);
  app.scoreCard("w04-lambda#0", 3, "", t("2026-10-07"));
  assert.equal(app.data.reviews["w04-lambda#1"].due, "2026-10-09");
  app.scoreCard("w04-lambda#1", 1, "quên mất", t("2026-10-09"));
  assert.equal(app.data.reviews["w04-lambda#1r2026-10-09"].due, "2026-10-10");
  app.scoreCard("w04-lambda#1r2026-10-09", 2, "", t("2026-10-10"));
  assert.equal(app.data.reviews["w04-lambda#2"].due, "2026-10-14");
  app.scoreCard("w04-lambda#2", 3, "", t("2026-10-14"));
  assert.equal(app.data.reviews["w04-lambda#3"].due, "2026-10-28");
  app.scoreCard("w04-lambda#3", 3, "", t("2026-10-28"));
  assert.equal(Object.keys(app.data.reviews).length, 5, "hết thang thì không tạo thêm thẻ");
  app.data.reviews["x#0"] = { task: "x", step: 0, due: "2026-10-07" };
  assert.ok(!J(app.dueCards(t("2026-10-30"))).includes("x#0"), "task bị bỏ tích thì thẻ ôn không hiện");
});
