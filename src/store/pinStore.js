// meat-management-fe/src/store/pinStore.js
// Store quản lý mã PIN bảo vệ các thao tác tài chính nhạy cảm
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from './authStore';

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

// Lấy userId hiện tại từ authStore để quản lý PIN độc lập cho từng tài khoản
const getUserId = () => {
  try {
    return useAuthStore.getState().user?.id || 'default';
  } catch (e) {
    return 'default';
  }
};

// Định nghĩa các khoá lưu trữ động theo userId
const getPinHashKey = () => `meat_pin_hash_${getUserId()}`;
const getPinVerifiedAtKey = () => `meat_pin_verified_at_${getUserId()}`;
const getPinSessionHoursKey = () => `meat_pin_session_hours_${getUserId()}`;

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
  const hash = await getItem(getPinHashKey());
  return !!hash;
};

/**
 * Lấy số giờ phiên PIN (mặc định 12 giờ)
 * @returns {Promise<number>}
 */
export const getSessionHours = async () => {
  const raw = await getItem(getPinSessionHoursKey());
  const parsed = parseInt(raw, 10);
  return (!isNaN(parsed) && parsed > 0) ? parsed : 12; // Mặc định 12 giờ
};

/**
 * Cài đặt số giờ phiên PIN
 * @param {number} hours - Số giờ (ví dụ: 12 hoặc 24)
 */
export const setSessionHours = async (hours) => {
  await setItem(getPinSessionHoursKey(), hours.toString());
};

/**
 * Kiểm tra phiên PIN hiện tại còn hiệu lực không
 * @returns {Promise<boolean>}
 */
export const isSessionValid = async () => {
  const verifiedAt = await getItem(getPinVerifiedAtKey());
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
  const storedHash = await getItem(getPinHashKey());
  if (!storedHash) return false;
  return hashPin(pin) === storedHash;
};

/**
 * Lưu mã PIN mới (đã băm)
 * @param {string} pin - Chuỗi 4 số mã PIN mới
 */
export const savePin = async (pin) => {
  const hashed = hashPin(pin);
  await setItem(getPinHashKey(), hashed);
};

/**
 * Đánh dấu thời điểm xác thực PIN thành công → bắt đầu tính phiên
 */
export const markSessionVerified = async () => {
  await setItem(getPinVerifiedAtKey(), new Date().toISOString());
};

/**
 * Xóa toàn bộ dữ liệu PIN (dùng khi reset PIN)
 */
export const clearPin = async () => {
  await deleteItem(getPinHashKey());
  await deleteItem(getPinVerifiedAtKey());
};

/**
 * Xóa phiên PIN hiện tại (buộc nhập lại PIN lần tới, giữ nguyên PIN đã đặt)
 */
export const clearSession = async () => {
  await deleteItem(getPinVerifiedAtKey());
};
