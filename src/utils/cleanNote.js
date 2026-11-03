// meat-management-fe/src/utils/cleanNote.js

/**
 * Lọc sạch các tag kỹ thuật hệ thống (offset IDs) khỏi ghi chú để người dùng
 * chỉ thấy thông tin nghiệp vụ đẹp mắt, ngắn gọn và trực quan.
 * Ví dụ:
 * "[Chuyển thẳng NCC: Đăng] [offsetSupplierPaymentId:3bc3...] [offsetPairId:5ca2...]"
 * ➔ "[Chuyển thẳng NCC: Đăng]"
 */
export const cleanDisplayNote = (note) => {
  if (!note || typeof note !== 'string') return '';
  return note
    .replace(/\[offset[a-zA-Z0-9_-]*\s*:\s*[^\]]+\]/gi, '')
    .replace(/\[offsetSupplierPaymentId:[a-f0-9\-]+\]/gi, '')
    .replace(/\[offsetPaymentId:[a-f0-9\-]+\]/gi, '')
    .replace(/\[offsetPairId:[a-f0-9\-]+\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
};

export default cleanDisplayNote;

