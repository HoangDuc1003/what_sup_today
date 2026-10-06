# Hôm nay làm gì – Lộ trình Backend (NAB 2026–2027)

Web tĩnh một file (`index.html`), không cần build, không cần backend. Tiến độ lưu bền trong trình duyệt bằng `localStorage`, không mất khi tải lại trang hay đóng/mở lại.

## Lộ trình v2 (từ T3 6/10/2026)

Từ 6/10, nội dung từ Tuần 4 được làm lại theo chuẩn 2026 và theo các cổng tuyển của NAB (Codility, tiếng Anh, Java/JVM/DB):

- **Tuần 4–5:** Java Core III thành 3 sản phẩm (Stream lab, note HashMap, note JVM có 3 lệnh docker), Concurrency gồm 3 lab (race, deadlock chuyển tiền + virtual threads sau JEP 491, CompletableFuture).
- **Tuần 6–13:** MiniPay, một modular monolith (Java 25, Spring Boot 4.1, Spring Modulith). Mỗi tuần một mốc:
  - M0: khung dự án, CI.
  - M1: ledger kép bất biến.
  - M2: security, BOLA.
  - M3: chứng minh concurrency (10.000 lệnh / 64 virtual threads).
  - M4: idempotency, payment state machine, webhook HMAC.
  - M5: outbox → SQS (ElasticMQ), consumer idempotent, DLQ.
  - M6: AWS (Terraform, ECS, RDS, OIDC).
  - M7: observability, reconciliation.
- **Tuần 14–15:** thi, lịch cố định.
- **Tuần 16 + tuần đệm:** M8 (k6, flame graph, JMH, PIT), CV, STAR, final mock, hỏi lịch OJT/StarCamp.
- **Thứ Bảy là Buffer:** không nhận task mới.
- **DSA từ 6/10:** chỉ xếp bài Easy/Medium (Codility ra đề Easy–Medium), 1 bài/ngày, thứ Năm làm Codility lesson, thứ Bảy làm lại bài ☆. 20 bài Hard nằm trong Kho Hard (tuỳ chọn).

Lịch trước 6/10 giữ nguyên để xem lại. Task v1 chưa làm được gộp vào v2, vẫn xem được trong mục Lưu trữ.

## Lịch cuộn (từ 6/10)

Không cần dời lịch bằng tay.

- **Việc chưa làm tự sang ngày hôm sau:** task backend, bài NeetCode và lesson Codility. Codility sang thứ Năm kế tiếp.
- **Không dồn:** mỗi ngày chỉ nhận đủ số ô của ngày đó. Ví dụ hôm qua bỏ cả ngày thì hôm nay hiện việc của hôm qua, việc của hôm nay lùi sang mai, cả lịch lùi theo và **kéo dài qua 8/1 nếu cần** (Tuần 17, 18… "nối dài", tối đa tới 29/8/2027).
- **Đã tích là xong hẳn:** lưu theo id, không quay lại, không phải tích lại. Tích sớm task của ngày sau thì nó hiện ở hôm nay, ngày sau nhận task kế tiếp.
- **Ngày đã qua** hiện những gì đã làm hôm đó. Phần còn thiếu so với số ô vẫn tính vào bản đồ tiến độ và chuỗi ngày.
- **Ngày ôn thi:** nút "Nghỉ backend ngày …" / "Nghỉ tới hết CN" ở mục Hàng đợi. Ngày nghỉ không nhận việc mới, việc tự lùi, chuỗi ngày không đứt. Đặt trước được cho ngày tới bằng cách chọn ngày đó rồi bấm.
- **Mục Hàng đợi:**
  - Độ chậm so với kế hoạch gốc.
  - Ngày dự kiến xong backend.
  - "Rảnh thì làm trước" 5 task kế tiếp.
  - Nút cắt task tuỳ chọn (P4/P5) để rút ngắn lịch, có khôi phục.
  - Lưu trữ.

## Tính năng

- **Lịch từng ngày** theo khung giờ, tự đánh dấu khối "Đang diễn ra" / "Tiếp theo". Mỗi task backend có mức ưu tiên P1–P5, phần **Đạt khi** và nguồn tham khảo.
- **Bằng chứng khi tích:** tích task backend phải dán link (commit / PR / note) hoặc ghi lý do, kèm tối đa 2 câu hỏi ôn.
- **Ôn ngắt quãng:** tích xong, app xếp thẻ ôn ở +1 / +3 / +7 / +21 ngày. Mục "Ôn hôm nay" nằm ở đầu khối Backend, tối đa 5 thẻ/ngày, có ô giải thích từ trí nhớ và nút tự chấm 0–3. Chấm dưới 2 thì ôn lại hôm sau.
- **Retro Chủ nhật** (3 câu + số liệu tuần), **Ngày tối thiểu** (1 thẻ ôn + 1 bài DSA + 1 dòng ghi chú để giữ chuỗi ngày), bộ đếm Codility timed set và mock tiếng Anh.
- **Thẻ Cách học:** luật dùng AI, định nghĩa xong, nút sao chép prompt F2 (gia sư Socratic), F3 (mock interview NAB), F4 (review PR kiểu ngân hàng).
- Bố cục ngang cho PC, giao diện sáng / tối, hẹn giờ tập trung, ghi chú trong ngày, bản đồ tiến độ, phím tắt (`←` `→` `T` `F` `N` `D` `?`).

## Lưu trữ tiến độ

- Dữ liệu v2 nằm ở khoá `hoang-backend-tracker-v2`: `{schemaVersion: 2, done, at, proof, notes, shifts, cut, off, reviews, retro, mvd, archive}`. `at` là ngày tích, lịch cuộn dựa vào nó để biết việc nào làm hôm nào. `off` là các ngày nghỉ, `cut` là task đã cắt. Mọi thứ lưu theo **id cố định** của task (ví dụ `w05-deadlock-lab`), không theo vị trí, nên sửa nội dung không làm lệch tiến độ.
- Lần đầu mở bản v2, app tự chuyển dữ liệu từ khoá `hoang-backend-tracker-v1`. **Khoá v1 không bao giờ bị ghi đè**, đó chính là bản sao lưu; có nút "Tải bản sao lưu v1".
- Xuất file ra định dạng v2. Nhập được cả file v1 lẫn v2. Luật gộp: việc đã làm thắng, ghi chú nối lại không trùng, thẻ ôn và lần dời lịch hợp nhất theo id.
- Dữ liệu chỉ nằm trên thiết bị đó (không đồng bộ). Nên xuất file định kỳ.
- Hẹn giờ lưu ở `hoang-timer-v1`, giao diện ở `hoang-theme`.

**Rollback:** revert commit lộ trình v2 rồi deploy lại. Bản cũ vẫn đọc khoá v1 còn nguyên. Những gì tích sau khi lên v2 chỉ nằm trong khoá v2.

## Test

Logic (chuyển v1 → v2, lịch cuộn, ngày nghỉ, lịch nối dài, DSA, thẻ ôn, gộp file) được test bằng Node, không cần cài gói nào:

```bash
node --test
```

Fixture `tests/fixtures/` là một file tiến độ v1 thật (chỉ có id các ô đã tích). Thư mục `tests/` không được deploy (`.vercelignore`).

## Chạy thử ở máy

Mở `index.html` bằng trình duyệt, hoặc chạy một web server tĩnh:

```bash
npx serve .
```

## Deploy lên Vercel

Repo nối với Vercel qua GitHub: mỗi lần push lên `main`, Vercel tự deploy (Framework Preset: Other, không có build command, output là thư mục gốc). Deploy tay bằng CLI:

```bash
npx vercel --prod
```

## Cấu trúc

| File | Vai trò |
|------|---------|
| `index.html` | Toàn bộ ứng dụng (HTML + CSS + JS trong một file) |
| `tests/` | Test logic bằng `node --test` |
| `vercel.json` | Cấu hình Vercel (clean URLs, cache) |
| `.vercelignore` | Không deploy thư mục test |
