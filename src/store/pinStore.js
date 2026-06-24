// meat-management-fe/src/store/pinStore.js
// Store quản lý mã PIN bảo vệ các thao tác tài chính nhạy cảm
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// ─── Các khóa lưu trữ trong SecureStore / localStorage ──────────────────────
const PIN_HASH_KEY = 'meat_pin_hash';               // Chuỗi hash của mã PIN 4 số
const PIN_VERIFIED_AT_KEY = 'meat_pin_verified_at'; // Thời điểm xác thực PIN gần nhất
const PIN_SESSION_HOURS_KEY = 'meat_pin_session_hours'; // Thời gian phiên PIN (12 hoặc 24)

// ─── Helper: tương thích đa nền tảng (Web vs Native) ─────────────────────────
const isWeb = Platform.OS === 'web';

const setItem = async (key, value) => {
  if (isWeb) {
    localStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
};

const getItem = async (key) => {
  if (isWeb) {
    return localStorage.getItem(key);
  } else {
    return await SecureStore.getItemAsync(key);
  }
};

const deleteItem = async (key) => {
  if (isWeb) {
    localStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
};

// ─── Helper: băm PIN bằng chuỗi đơn giản (PIN chỉ 4 số, lưu trong thiết bị riêng) ───
// Không cần thuật toán mạnh như bcrypt vì PIN lưu trên thiết bị của chính chủ buôn
const hashPin = (pin) => {
  // Thêm salt cố định để tránh so sánh trực tiếp trong bộ nhớ
  const salted = `meat_pin_salt_2026_${pin}_secure`;
  let hash = 0;
  for (let i = 0; i < salted.length; i++) {
    const char = salted.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Chuyển sang 32-bit integer
  }
  return Math.abs(hash).toString(36) + salted.length.toString(36);
};

// ─── Các hàm công khai của pinStore ──────────────────────────────────────────

/**
 * Kiểm tra người dùng đã cài mã PIN chưa
 * @returns {Promise<boolean>}
 */
export const hasPin = async () => {
  const hash = await getItem(PIN_HASH_KEY);
  return !!hash;
};

/**
 * Lấy số giờ phiên PIN (mặc định 12 giờ)
 * @returns {Promise<number>}
 */
export const getSessionHours = async () => {
  const raw = await getItem(PIN_SESSION_HOURS_KEY);
  const parsed = parseInt(raw, 10);
  return (!isNaN(parsed) && parsed > 0) ? parsed : 12; // Mặc định 12 giờ
};

/**
 * Cài đặt số giờ phiên PIN
 * @param {number} hours - Số giờ (ví dụ: 12 hoặc 24)
 */
export const setSessionHours = async (hours) => {
  await setItem(PIN_SESSION_HOURS_KEY, hours.toString());
};

/**
 * Kiểm tra phiên PIN hiện tại còn hiệu lực không
 * @returns {Promise<boolean>}
 */
export const isSessionValid = async () => {
  const verifiedAt = await getItem(PIN_VERIFIED_AT_KEY);
  if (!verifiedAt) return false;

  const sessionHours = await getSessionHours();
  const verifiedTime = new Date(verifiedAt).getTime();
  const nowTime = Date.now();
  const sessionMs = sessionHours * 60 * 60 * 1000;

  return (nowTime - verifiedTime) < sessionMs;
};

/**
 * Xác minh PIN người dùng nhập có khớp không
 * @param {string} pin - Chuỗi 4 số người dùng vừa nhập
 * @returns {Promise<boolean>}
 */
export const verifyPin = async (pin) => {
  const storedHash = await getItem(PIN_HASH_KEY);
  if (!storedHash) return false;
  return hashPin(pin) === storedHash;
};

/**
 * Lưu mã PIN mới (đã băm)
 * @param {string} pin - Chuỗi 4 số mã PIN mới
 */
export const savePin = async (pin) => {
  const hashed = hashPin(pin);
  await setItem(PIN_HASH_KEY, hashed);
};

/**
 * Đánh dấu thời điểm xác thực PIN thành công → bắt đầu tính phiên
 */
export const markSessionVerified = async () => {
  await setItem(PIN_VERIFIED_AT_KEY, new Date().toISOString());
};

/**
 * Xóa toàn bộ dữ liệu PIN (dùng khi reset PIN)
 */
export const clearPin = async () => {
  await deleteItem(PIN_HASH_KEY);
  await deleteItem(PIN_VERIFIED_AT_KEY);
};

/**
 * Xóa phiên PIN hiện tại (buộc nhập lại PIN lần tới, giữ nguyên PIN đã đặt)
 */
export const clearSession = async () => {
  await deleteItem(PIN_VERIFIED_AT_KEY);
};
