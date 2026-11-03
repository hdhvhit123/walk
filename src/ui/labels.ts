import type { WindowClass } from '../core/verify';

export const CLASS_LABEL: Record<WindowClass, { text: string; tone: 'good' | 'info' | 'warn' }> = {
  WALK: { text: 'Đang đi bộ', tone: 'good' },
  STATIONARY: { text: 'Đang nghỉ', tone: 'info' },
  RUN: { text: 'Đang chạy bộ (không tính)', tone: 'warn' },
  VEHICLE: { text: 'Nghi đi phương tiện', tone: 'warn' },
  UNKNOWN: { text: 'Chưa đủ tín hiệu', tone: 'warn' },
};

export const fmtM = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
export const HABITAT_LABEL: Record<string, string> = {
  plaza: 'quảng trường', pond: 'bờ hồ', tree: 'gốc cây', garden: 'vườn', pavilion: 'mái đình, chòi',
};
