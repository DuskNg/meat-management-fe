// meat-management-fe/src/utils/deviceDetector.js

/**
 * Nhận diện chi tiết model thiết bị đang sử dụng dựa trên kích thước màn hình, tỉ lệ DPR và User-Agent
 * @returns {string} - Tên thiết bị chi tiết (ví dụ: 'iPhone 11', 'iPhone 12 / 13', 'PC Windows'...)
 */
export const getClientDeviceInfo = () => {
  if (typeof window === 'undefined') return '';

  const ua = navigator.userAgent || '';
  const screenW = window.screen?.width || 0;
  const screenH = window.screen?.height || 0;
  const dpr = Math.round((window.devicePixelRatio || 1) * 10) / 10;

  // Lấy kích thước chuẩn (min = chiều ngang dọc, max = chiều dài bất kể xoay máy)
  const minDim = Math.min(screenW, screenH);
  const maxDim = Math.max(screenW, screenH);

  // 1. NHẬN DIỆN CHI TIẾT TỪNG ĐỜI IPHONE
  if (/iPhone/i.test(ua)) {
    // iPhone 11 / XR: Màn hình 414x896 với DPR 2 (Độ phân giải vật lý 828x1792)
    if (minDim === 414 && maxDim === 896 && dpr === 2) {
      return 'iPhone 11';
    }

    // iPhone X / XS / 11 Pro: Màn hình 375x812 với DPR 3
    if (minDim === 375 && maxDim === 812 && dpr === 3) {
      return 'iPhone 11 Pro / X';
    }

    // iPhone 11 Pro Max / XS Max: Màn hình 414x896 với DPR 3
    if (minDim === 414 && maxDim === 896 && dpr === 3) {
      return 'iPhone 11 Pro Max';
    }

    // iPhone 12 / 12 Pro / 13 / 13 Pro / 14: Màn hình 390x844 với DPR 3
    if (minDim === 390 && maxDim === 844) {
      return 'iPhone 12 / 13 / 14';
    }

    // iPhone 12 Pro Max / 13 Pro Max / 14 Plus: Màn hình 428x926 với DPR 3
    if (minDim === 428 && maxDim === 926) {
      return 'iPhone 12/13/14 Pro Max';
    }

    // iPhone 12 mini / 13 mini: Màn hình 360x780 hoặc 375x812 với DPR 3
    if (minDim === 360 && maxDim === 780) {
      return 'iPhone 12/13 mini';
    }

    // iPhone 14 Pro / 15 / 15 Pro / 16 (Dynamic Island tiêu chuẩn): Màn hình 393x852
    if (minDim === 393 && maxDim === 852) {
      return 'iPhone 15 / 16';
    }

    // iPhone 14 Pro Max / 15 Plus / 15 Pro Max / 16 Plus (Dynamic Island lớn): Màn hình 430x932
    if (minDim === 430 && maxDim === 932) {
      return 'iPhone 15/16 Pro Max';
    }

    // iPhone 16 Pro (Màn hình 402x874 mới)
    if (minDim === 402 && maxDim === 874) {
      return 'iPhone 16 Pro';
    }

    // iPhone 16 Pro Max (Màn hình 440x956 mới)
    if (minDim === 440 && maxDim === 956) {
      return 'iPhone 16 Pro Max';
    }

    // iPhone 6 / 6s / 7 / 8 / SE (2020/2022): Màn hình 375x667 với DPR 2
    if (minDim === 375 && maxDim === 667) {
      return 'iPhone SE / 8';
    }

    // iPhone 6 Plus / 7 Plus / 8 Plus: Màn hình 414x736 với DPR 3
    if (minDim === 414 && maxDim === 736) {
      return 'iPhone 8 Plus';
    }

    return 'iPhone';
  }

  // 2. NHẬN DIỆN MÁY TÍNH BẢNG IPAD
  if (/iPad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'iPad';
  }

  // 3. NHẬN DIỆN MÁY ANDROID (Samsung, Xiaomi, Oppo, Vivo...)
  if (/Android/i.test(ua)) {
    const match = ua.match(/\(([^;]+);\s*([^;]+);\s*([^;)]+)\s*Build/i);
    if (match && match[3]) {
      const model = match[3].trim();
      return `Android (${model})`;
    }
    return 'Điện thoại Android';
  }

  // 4. NHẬN DIỆN MÁY TÍNH (PC / Mac)
  if (/Windows/i.test(ua)) {
    return 'PC Windows';
  }

  if (/Macintosh|Mac OS/i.test(ua)) {
    return 'MacBook';
  }

  if (/Linux/i.test(ua)) {
    return 'PC Linux';
  }

  return 'Trình duyệt Web';
};
