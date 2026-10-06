// Test logic của index.html bằng Node (không cần cài gói): node --test tests/
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
;render=function(){};
globalThis.__app={
  get SEQ(){return SEQ}, get SLOTS(){return SLOTS}, get SLOTMAP(){return SLOTMAP}, get UNSCHED(){return UNSCHED}, get CUTSET(){return CUTSET},
  get data(){return data}, set data(v){data=v}, get IDX(){return IDX}, get TASKS(){return TASKS},
  buildSeq,buildSlots,buildPlan,buildDay,migrateV1toV2,v1SlotIndexMap,mergeData,normalize,emptyData,importPayload,
  planShift,shiftToToday,cutLowPriority,undoShift,debtList,beTotals,scoreCard,seedCards,dueCards,codOf,slotIdx,
  DSA2,DSA_Q,LC,WEEKS,BUF,PHASE2,FLEX_WEEKS,REBASE,REBASE_ISO,isoOf,fromIso,weekOf,dow,DAY
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
  return app;
}
const lcNums = (app, iso) => J(app.DSA2[iso] || []).map(i => app.LC[i][0]);
const beIds = day => day.blocks.flatMap(b => b.items).filter(it => it.kind === "be").map(it => it.id);

test("nội dung: id duy nhất, task v2 có ưu tiên 1–5 và Đạt khi", () => {
  const app = load("2026-10-06", false);
  const all = [];
  Object.values(app.WEEKS).concat([app.BUF]).forEach(w => w.be.forEach(t => all.push(t)));
  app.PHASE2.forEach(g => g.items.forEach(t => all.push(t)));
  const ids = all.map(t => t.id);
  assert.equal(new Set(ids).size, ids.length, "id bị trùng");
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
  // Các mục không phải backend giữ nguyên id
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
});

test("migration chạy lại và gộp nhiều lần cho cùng kết quả", () => {
  const app = load("2026-10-06", false);
  const a = J(app.migrateV1toV2(J(FIXTURE.done)));
  const b = J(app.migrateV1toV2(J(FIXTURE.done)));
  assert.deepEqual(a, b);
  const m1 = J(app.mergeData(app.emptyData(), a));
  const m2 = J(app.mergeData(m1, a));
  assert.deepEqual(m1, m2);
});

test("import: nhận file v1 lẫn v2, luật gộp", () => {
  const app = load("2026-10-06", false);
  assert.deepEqual(J(app.importPayload(J(FIXTURE))), J(app.migrateV1toV2(J(FIXTURE.done))));
  const v2 = J(app.mergeData(app.emptyData(), app.migrateV1toV2(J(FIXTURE.done))));
  assert.deepEqual(J(app.importPayload({ app: "hoang-backend-tracker", version: 2, data: v2 })), v2);

  const a = app.emptyData(), b = app.emptyData();
  a.done.x = 1; a.notes["2026-10-06"] = "dòng A"; a.reviews["x#0"] = { task: "x", step: 0, due: "2026-10-07" };
  b.notes["2026-10-06"] = "dòng A\ndòng B"; b.done.y = 1;
  b.reviews["x#0"] = { task: "x", step: 0, due: "2026-10-07", score: 3, doneAt: "2026-10-07" };
  const m = J(app.mergeData(a, b));
  assert.ok(m.done.x && m.done.y, "done = true thắng");
  assert.equal(m.notes["2026-10-06"], "dòng A\ndòng B", "ghi chú nối không trùng");
  assert.equal(m.reviews["x#0"].score, 3, "thẻ ôn lấy bản đã chấm");
  assert.deepEqual(J(app.mergeData(m, b)), m);
  assert.throws(() => app.importPayload("không phải object"));
});

test("lịch v2: 6/10 bắt đầu Tuần 4, 103 ô vừa khít, không tràn", () => {
  const app = load("2026-10-06");
  assert.equal(app.SEQ[app.slotIdx("2026-10-06", "be1")].task.id, "w04-hashmap-note");
  assert.equal(app.SEQ[app.slotIdx("2026-10-12", "be1")].task.id, "w05-race-lab");
  assert.equal(app.SEQ[app.slotIdx("2026-10-19", "be1")].task.id, "w06-di-from-scratch");
  assert.equal(app.SEQ[app.slotIdx("2026-12-28", "be1")].task.id, "w16-m8-k6");
  assert.equal(app.SEQ[app.slotIdx("2027-01-08", "be2")].task.id, "b-plan-phase2");
  const v2Slots = J(app.SLOTS).filter(sl => sl.t >= app.REBASE);
  assert.equal(v2Slots.length, 103);
  for (const sl of v2Slots) assert.ok(app.slotIdx(sl.iso, sl.slot) >= 0, sl.iso);
  assert.equal(app.UNSCHED.length, 0);
  // Không còn nợ trước mốc rebase
  assert.equal(J(app.debtList()).length, 0);
  // Tiến độ cả lộ trình: 19 đã làm / (19 + 103)
  assert.deepEqual(J(app.beTotals()), { tot: 122, dn: 19 });
});

test("thứ Bảy là Buffer, tuần thi không có task trong hàng đợi", () => {
  const app = load("2026-10-06");
  for (let t = app.REBASE; t <= app.fromIso("2027-01-08"); t += app.DAY) {
    const day = app.buildDay(t);
    const ids = beIds(day);
    if (app.dow(t) === 6 && app.FLEX_WEEKS.includes(day.w)) {
      assert.equal(ids.length, 0, day.iso);
      assert.ok(day.blocks.some(b => b.slot === "buffer" && b.s === "13:30"), day.iso);
    }
    if (day.w === 14 || day.w === 15) for (const id of ids) assert.equal(app.IDX[id], undefined, id);
  }
});

test("DSA v2: trả nợ tuần 4, chỉ Easy/Medium, Codility L3 ngày 8/10", () => {
  const app = load("2026-10-06");
  assert.deepEqual(lcNums(app, "2026-10-06"), [153, 33]);
  assert.deepEqual(lcNums(app, "2026-10-07"), [981, 206]);
  assert.deepEqual(lcNums(app, "2026-10-09"), [21, 141]);
  assert.deepEqual(lcNums(app, "2026-10-12"), [143]);
  assert.equal(app.codOf(app.fromIso("2026-10-08")), 3);
  assert.equal(app.codOf(app.fromIso("2026-12-10")), 16);
  assert.equal(app.codOf(app.fromIso("2026-12-17")), 0);
  assert.equal(app.codOf(app.fromIso("2026-12-31")), 17);
  for (const i of J(app.DSA_Q)) assert.notEqual(app.LC[i][3], "H");
  const sat = app.buildDay(app.fromIso("2026-10-10")).blocks.find(b => b.slot === "dsa");
  assert.equal(sat.items[0].kind, "rev");
  const exam = app.buildDay(app.fromIso("2026-12-16")).blocks.find(b => b.slot === "dsa");
  assert.equal(exam.items[0].kind, "rev");
  // Mỗi bài trong hàng đợi xuất hiện đúng 1 lần
  const all = Object.values(J(app.DSA2)).flat();
  assert.equal(new Set(all).size, all.length);
  assert.equal(all.length, 49);
});

test("dời lịch về hôm nay, cắt task ưu tiên thấp, hoàn tác", () => {
  const app = load("2026-10-20");
  const late = J(app.debtList()).filter(it => it.kind === "be");
  assert.ok(late.length >= 10);
  const sh = J(app.planShift());
  assert.equal(sh.date, "2026-10-20");
  assert.equal(sh.startId, "w04-hashmap-note");
  app.shiftToToday();
  assert.equal(app.SEQ[app.slotIdx("2026-10-20", "be1")].task.id, "w04-hashmap-note");
  assert.equal(J(app.debtList()).filter(it => it.kind === "be").length, 0);
  const overflow = app.UNSCHED.length;
  assert.ok(overflow > 0);
  app.cutLowPriority();
  const cut = [...app.CUTSET];
  assert.deepEqual(cut.sort(), ["w05-scoped-structured", "w12-lambda"]);
  assert.equal(app.UNSCHED.length, overflow - 2);
  // Từ ngày dời trở đi không còn ô nào nhận task đã cắt (ô trước đó là lịch sử, giữ nguyên)
  for (const [key, k] of Object.entries(J(app.SLOTMAP))) if (key >= "2026-10-20" && k >= 0) assert.ok(!cut.includes(app.SEQ[k].task.id), key);
  app.undoShift();
  assert.equal(app.SEQ[app.slotIdx("2026-10-20", "be1")].task.id, app.SEQ[app.IDX["w06-di-from-scratch"] + 1].task.id);
  assert.equal(app.UNSCHED.length, 0);
});

test("dời lịch bỏ qua task đã làm", () => {
  const app = load("2026-10-08");
  // Làm task 7/10 (w04-lambda) nhưng chưa làm task 6/10
  app.data.done["w04-lambda"] = 1;
  const sh = J(app.planShift());
  assert.equal(sh.startId, "w04-hashmap-note");
  assert.ok(sh.skip.includes("w04-lambda"));
  app.shiftToToday();
  assert.equal(app.SEQ[app.slotIdx("2026-10-08", "be1")].task.id, "w04-hashmap-note");
  assert.equal(app.SEQ[app.slotIdx("2026-10-08", "be2")].task.id, "w04-stream-lab");
});

test("ôn ngắt quãng: +1/+3/+7/+21, chấm dưới 2 thì ôn lại hôm sau", () => {
  const app = load("2026-10-06", false);
  const t = s => app.fromIso(s);
  app.data.done["w04-lambda"] = 1;
  app.seedCards("w04-lambda", t("2026-10-06"));
  let r = J(app.data.reviews);
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
  // Task bị bỏ tích thì thẻ ôn không hiện
  app.data.reviews["x#0"] = { task: "x", step: 0, due: "2026-10-07" };
  assert.ok(!J(app.dueCards(t("2026-10-30"))).includes("x#0"));
});
