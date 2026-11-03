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

## Chế độ mô phỏng

Không ra đường được? Vào **Cài đặt → Bật mô phỏng**, chọn nhiệm vụ, chọn kịch bản (đi bộ, đi ô tô rồi đi bộ, xe buýt kẹt, GPS nhảy, mất tín hiệu…) và tốc độ tua. Mô phỏng dùng cơ sở dữ liệu riêng (`walk-sim.db`), không lẫn vào bộ sưu tập thật.

## Kiểm thử

```bash
npm run typecheck
npm test            # lõi xác minh: 221 test (15 kịch bản × nhiều tuyến × seed, nhiệm vụ, sổ thưởng…)
npm run test:app    # cả app: 14 test trên màn hình thật, SQL thật, service Android giả lập
npm run test:native # biên dịch Kotlin + 14 test EventLog trên JVM (không cần Android SDK)
```

`test:app` mô phỏng các tình huống khó: app bị vuốt tắt giữa chừng (service vẫn ghi), hệ điều hành giết tiến trình (gián đoạn, khoảng mất không được tính), tạm dừng/tiếp tục, vị trí giả lập, dòng log ghi dở, máy không có cảm biến bước chân, xóa log quá hạn.

## Cấu trúc

| Thư mục | Nội dung |
| --- | --- |
| `src/core` | Thuần TypeScript, dùng chung với bản web: quy tắc (`rules.ts`), bộ xác minh (`verify.ts`), nhiệm vụ, sổ thưởng, gói khu vực, mô phỏng |
| `src/platform` | SQLite (`store.ts`), bộ ghi native / mô phỏng (`recorder.ts`), điều phối phiên và khôi phục (`session.ts`), quyền thiết bị, xuất log / dọn dẹp |
| `src/ui` | 7 màn hình React Native; `src/App.tsx` là máy trạng thái gốc |
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
