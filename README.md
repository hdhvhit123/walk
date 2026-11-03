# Đi bộ khám phá (Android, React Native / Expo)

Mỗi ngày app gợi ý 2–3 điểm đến theo thời lượng 10/20/30 phút. Người chơi phải **đi bộ cả hành trình** từ cổng xuất phát tới điểm đến. App xác minh bằng cảm biến bước chân phần cứng, GPS và nhận diện hoạt động của Android rồi mới mở phần thưởng (sinh vật, vật phẩm). Tắt màn hình, cất máy vào túi vẫn được: một foreground service ghi bằng chứng suốt phiên.

## Lấy file APK

Cách dễ nhất là để GitHub build:

1. Đẩy thư mục này lên một repo GitHub.
2. Workflow `.github/workflows/android.yml` tự chạy: kiểm thử, rồi build `app-release.apk`.
3. Mở tab **Actions** → lần chạy mới nhất → tải artifact `di-bo-kham-pha-apk`, giải nén, cài lên máy Android (cho phép "cài từ nguồn không xác định").

APK này ký bằng khóa debug của template: dùng để thử nghiệm, chưa dùng để đưa lên Google Play.

### Build trên máy của bạn

Cần Node 22, JDK 17 và Android Studio (Android SDK).

```bash
npm ci
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

Hoặc chạy thẳng lên máy đang cắm cáp: `npm run android`.

## Ngôi làng

Phần thưởng của mỗi chuyến đi bộ hợp lệ được mang về làng (tab **Làng**). Xây dựng cần nhiều loại vật phẩm:

| Loại | Gồm | Lấy ở đâu |
| --- | --- | --- |
| Vật liệu thô | 🪵 Gỗ, 🪨 Đá, 🎋 Tre, 🟤 Đất sét, 🌾 Cỏ tranh | Mỗi chuyến: 4 + 1 mỗi 100 m đi bộ được xác nhận. Một nửa là vật liệu của nơi đến (gốc cây → gỗ, bờ hồ → đất sét, vườn → cỏ tranh, quảng trường → đá, mái đình → tre), phần còn lại chia cho các loại khác. Gặp sinh vật mới +2. |
| Vật liệu chế tạo | 🟫 Ván gỗ, 🪜 Khung tre (Xưởng mộc) · 🧱 Gạch, 🔶 Ngói (Lò gạch) | Làm từ vật liệu thô, sau khi đã xây xưởng tương ứng |
| Báu vật | Lá bàng đỏ, Hạt sen, Lồng đèn giấy, Vỏ ốc xoắn, Cánh hoa giấy, Sỏi cuội | Nhặt ở các dấu vết dọc tuyến; hiếm, dùng cho nhà ở và nâng cấp |

- **14 loại công trình** qua 5 cấp mở khóa: lối sỏi, nhà tranh, xưởng mộc, đèn lồng, lò gạch, cây đa, vườn hoa giấy, ghế đá, ao sen, quảng trường, giếng, đình, cầu tre, nhà rông. Nhà ở có 2–3 bậc nâng cấp (thêm chỗ ở, thêm độ đẹp); mỗi loại có giới hạn số lượng để không thể dồn đồ trang trí rẻ lấy điểm.
- **Độ đẹp** đưa làng lên cấp (tối đa 6), mỗi cấp mở thêm đất (4×4 → 9×9).
- **Chợ phiên**: đổi 3 vật liệu thô lấy 1 loại khác, để người có tuyến đi bộ không qua gốc cây vẫn có gỗ.
- **Cư dân**: sinh vật đã gặp chuyển đến công trình hợp môi trường sống. Ngày nào có chuyến đi bộ hợp lệ, mỗi cư dân mang về 1 vật liệu của môi trường của nó.
- Màn hình Hôm nay ghi vật liệu chính của từng điểm đến, nên người chơi chọn nơi đi theo thứ mình đang thiếu. Thiếu gì, màn hình Làng chỉ rõ cần đi đâu hoặc làm ở xưởng nào.

Kho luôn được tính lại từ sổ nhận thưởng và những gì người chơi đã làm (xây, nâng cấp, chế tạo, đổi chợ), nên không thể lệch hay bị cộng hai lần; mỗi thao tác được kiểm tra lại trong một giao dịch SQLite.

### Kiểm tra nhịp chơi

`tests/unit/village-pacing.test.ts` cho một người chơi tự động chơi 70–120 ngày với nhiệm vụ thật của gói khu vực:

| Kiểu người chơi | Cấp 2 | Cấp 3 | Cấp 4 | Cấp 5 | Cấp 6 |
| --- | --- | --- | --- | --- | --- |
| Đều đặn (~1,5 chuyến/ngày, đủ 10/20/30 phút) | ngày 2 | ngày 5–6 | ngày 11–12 | ngày 17–18 | ngày 26 |
| Thong thả (1 chuyến 10 phút mỗi 3 ngày) | chuyến 3–4 | chuyến 8–17 | chuyến 15–25 | chuyến 22–36 | chuyến 33+ |

Test khẳng định: không có chặng nào quá 2 tuần, người chơi đều đặn hiếm khi đi xong một chuyến mà không xây được gì, cấp 6 cần ít nhất 3 tuần. Mô phỏng này đã phát hiện người chơi có tuyến không qua gốc cây bị kẹt vì thiếu gỗ, từ đó có chợ phiên.

## Chế độ mô phỏng

Không ra đường được? Vào **Cài đặt → Bật mô phỏng**, chọn nhiệm vụ, chọn kịch bản (đi bộ, đi ô tô rồi đi bộ, xe buýt kẹt, GPS nhảy, mất tín hiệu…) và tốc độ tua. Mô phỏng dùng cơ sở dữ liệu riêng (`walk-sim.db`), không lẫn vào bộ sưu tập thật.

## Kiểm thử

```bash
npm run typecheck
npm test            # lõi xác minh + làng + mô phỏng nhịp chơi: 243 test (15 kịch bản × nhiều tuyến × seed, nhiệm vụ, sổ thưởng…)
npm run test:app    # cả app: 18 test trên màn hình thật, SQL thật, service Android giả lập
npm run test:native # biên dịch Kotlin + 14 test EventLog trên JVM (không cần Android SDK)
```

`test:app` mô phỏng các tình huống khó: app bị vuốt tắt giữa chừng (service vẫn ghi), hệ điều hành giết tiến trình (gián đoạn, khoảng mất không được tính), tạm dừng/tiếp tục, vị trí giả lập, dòng log ghi dở, máy không có cảm biến bước chân, xóa log quá hạn.

## Cấu trúc

| Thư mục | Nội dung |
| --- | --- |
| `src/core` | Thuần TypeScript, dùng chung với bản web: quy tắc (`rules.ts`), bộ xác minh (`verify.ts`), nhiệm vụ, sổ thưởng, ngôi làng (`village.ts`), gói khu vực, mô phỏng |
| `src/platform` | SQLite (`store.ts`), bộ ghi native / mô phỏng (`recorder.ts`), điều phối phiên và khôi phục (`session.ts`), quyền thiết bị, xuất log / dọn dẹp |
| `src/ui` | 8 màn hình React Native; `src/App.tsx` là máy trạng thái gốc |
| `modules/walk-sensors` | Module Expo viết bằng Kotlin: `WalkTrackingService` (foreground service loại location), `EventLog` (log JSON-lines theo phiên), `ActivityTransitionReceiver` |
| `tests/unit`, `tests/app`, `tests/native` | Vitest, Jest + Testing Library, kiểm tra Kotlin |

### Luồng dữ liệu khi đi bộ

Service Android ghi từng sự kiện (bước chân, vị trí GPS mỗi giây, nhịp "còn sống" 2 giây, chuyển trạng thái hoạt động) vào `files/walk-sessions/<phiên>.jsonl`. JS đọc tiếp từ vị trí byte đã đọc mỗi giây và đưa vào bộ xác minh. Sự kiện phía JS (tạm dừng, chốt phiên) cũng ghi vào cùng file trước, nên thứ tự trong file luôn là thứ tự phát lại. Khi mở lại app, phiên được dựng lại bằng cách phát lại file.

## Giả định và giới hạn

- **iOS chưa có bộ ghi native**: bản iOS hiện chỉ chạy chế độ mô phỏng. Lõi và giao diện đã dùng chung; phần còn thiếu là module Swift (CoreMotion + CoreLocation chạy nền).
- **Tọa độ gói khu vực là dữ liệu mẫu** quanh một công viên ở Quận 1; phải khảo sát thực địa trước khi dùng thật.
- Mọi ngưỡng trong `rules.ts` là cấu hình khởi đầu, cần hiệu chỉnh bằng nhật ký thực địa (**Cài đặt → Xuất nhật ký phiên**).
- Phát hiện vị trí giả lập dựa vào cờ của Android (API 31+); máy đã root vẫn có thể lách.
- Chưa có backend: tiến độ chỉ nằm trên máy. Mã nhận thưởng = mã nhiệm vụ, sẵn sàng cho đồng bộ idempotent sau này.
- Một số hãng (Xiaomi, Oppo…) tắt service chạy nền mạnh tay. Khi đó phiên bị gián đoạn và app báo rõ; người chơi có thể cần tắt "tối ưu pin" cho app.
