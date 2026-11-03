export type ReasonCode =
  | 'VEHICLE_CONFIRMED' | 'LONG_GAP' | 'INSUFFICIENT_WALK' | 'INSUFFICIENT_PROGRESS'
  | 'LOW_COVERAGE' | 'NOT_AT_TARGET' | 'DEVICE_LIMITED' | 'CLOCK_TAMPER'
  | 'ALREADY_CLAIMED' | 'DAILY_LIMIT' | 'MOCK_LOCATION'
  | 'START_NO_FIX' | 'START_LOW_ACCURACY' | 'START_TOO_FAR';

export const REASONS: Record<ReasonCode, { title: string; hint: string }> = {
  VEHICLE_CONFIRMED: {
    title: 'Hành trình có đoạn di chuyển bằng phương tiện',
    hint: 'Nhiệm vụ này không thể nhận thưởng. Hãy bắt đầu nhiệm vụ khác và đi bộ toàn bộ tuyến.',
  },
  LONG_GAP: {
    title: 'Chưa đủ dữ liệu để xác nhận hành trình',
    hint: 'Có khoảng mất dữ liệu quá 5 phút (tắt màn hình, mất quyền hoặc tạm dừng quá lâu). Hãy bắt đầu lại và giữ app mở.',
  },
  INSUFFICIENT_WALK: {
    title: 'Quãng đi bộ được xác nhận còn thiếu',
    hint: 'Cần đi bộ ít nhất 70% chiều dài tuyến. Đoạn chạy bộ, đứng yên hoặc thiếu tín hiệu không được tính.',
  },
  INSUFFICIENT_PROGRESS: {
    title: 'Bạn chưa đi hết tuyến',
    hint: 'Hãy đi theo tuyến trên bản đồ tới điểm đến.',
  },
  LOW_COVERAGE: {
    title: 'Chưa đủ dữ liệu để xác nhận hành trình',
    hint: 'Quá 30% thời gian không đủ tín hiệu. Hãy giữ màn hình sáng và đi nơi thoáng.',
  },
  NOT_AT_TARGET: {
    title: 'Chưa tới vùng điểm đến',
    hint: 'Hãy tới gần điểm đến hơn và đợi vài giây để vị trí ổn định.',
  },
  DEVICE_LIMITED: {
    title: 'Thiết bị đang ở chế độ theo dõi hạn chế',
    hint: 'Không đọc được cảm biến chuyển động nên không thể xác minh đi bộ. Chế độ này không nhận thưởng.',
  },
  CLOCK_TAMPER: {
    title: 'Đồng hồ thiết bị bị lùi',
    hint: 'Hãy đặt lại ngày giờ tự động rồi mở lại app.',
  },
  ALREADY_CLAIMED: {
    title: 'Nhiệm vụ này đã nhận thưởng',
    hint: 'Mỗi nhiệm vụ chỉ nhận thưởng một lần.',
  },
  DAILY_LIMIT: {
    title: 'Đã đủ lượt thưởng hôm nay',
    hint: 'Bạn đã nhận 3 phần thưởng hôm nay. Quay lại vào ngày mai nhé!',
  },
  MOCK_LOCATION: {
    title: 'Phát hiện vị trí giả lập',
    hint: 'Thiết bị đang dùng ứng dụng giả vị trí. Hãy tắt nó và bắt đầu lại nhiệm vụ.',
  },
  START_NO_FIX: { title: 'Chưa có vị trí', hint: 'Đợi app lấy vị trí GPS rồi thử lại.' },
  START_LOW_ACCURACY: { title: 'Vị trí chưa đủ chính xác', hint: 'Ra chỗ thoáng, đợi vài giây cho GPS ổn định.' },
  START_TOO_FAR: { title: 'Bạn chưa ở điểm xuất phát', hint: 'Hãy đến cổng xuất phát (trong vòng 80 m) để bắt đầu.' },
};
