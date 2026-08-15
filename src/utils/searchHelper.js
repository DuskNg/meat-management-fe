// meat-management-fe/src/utils/searchHelper.js

/**
 * Loại bỏ dấu tiếng Việt toàn diện, chuyển đ/Đ thành d/D và đưa về chữ thường
 * @param {string} str - Chuỗi cần chuẩn hóa
 * @returns {string} Chuỗi không dấu viết thường
 */
export const removeDiacritics = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
};

/**
 * Lấy các ký tự đầu của từng từ (Viết tắt/Initials)
 * Ví dụ: "Sản phẩm 1" -> "sp1", "Thịt Bò Úc" -> "tbu"
 * @param {string} str - Chuỗi nguồn
 * @returns {string} Chuỗi viết tắt không dấu
 */
export const getInitials = (str) => {
  if (!str || typeof str !== 'string') return '';
  const cleanStr = removeDiacritics(str);
  const words = cleanStr.split(/[\s\-_/.,+*]+/);
  return words.map((w) => w.charAt(0)).join('');
};

/**
 * Kiểm tra xem chuỗi target có khớp với từ khóa tìm kiếm query hay không.
 * Hỗ trợ:
 * 1. Tìm không phân biệt hoa thường và không phân biệt dấu tiếng Việt ("sa" khớp "Sản phẩm 1")
 * 2. Tìm theo chữ viết tắt ("sp1" khớp "Sản phẩm 1", "tbu" khớp "Thịt Bò Úc")
 * 3. Tìm theo nhiều từ khóa cách nhau bởi khoảng trắng ("san 1" khớp "Sản phẩm 1")
 * 
 * @param {string} target - Văn bản mục tiêu cần tìm (Tên sản phẩm, Tên bàn, Tên khách...)
 * @param {string} query - Từ khóa người dùng nhập vào ô tìm kiếm
 * @returns {boolean} true nếu khớp
 */
export const matchSearch = (target, query) => {
  if (!query || typeof query !== 'string' || !query.trim()) return true;
  if (!target || typeof target !== 'string') return false;

  const targetNorm = removeDiacritics(target);
  const queryNorm = removeDiacritics(query);

  if (!queryNorm) return true;

  // 1. Khớp chuỗi trực tiếp không dấu (Ví dụ: "sa" nằm trong "san pham 1")
  if (targetNorm.includes(queryNorm)) {
    return true;
  }

  // 2. Khớp theo ký tự đầu viết tắt (Ví dụ: "sp1" khớp "Sản phẩm 1")
  const initials = getInitials(target);
  if (initials && initials.includes(queryNorm)) {
    return true;
  }

  // 3. Khớp tất cả các từ khóa rời rạc (Ví dụ: "san 1" -> cả "san" và "1" đều nằm trong targetNorm)
  const queryTokens = queryNorm.split(/\s+/).filter(Boolean);
  if (queryTokens.length > 1) {
    const isAllTokensMatched = queryTokens.every(
      (token) => targetNorm.includes(token) || (initials && initials.includes(token))
    );
    if (isAllTokensMatched) {
      return true;
    }
  }

  return false;
};

/**
 * Kiểm tra xem một đối tượng có khớp với từ khóa tìm kiếm qua các trường chỉ định hay không.
 * @param {object} item - Đối tượng cần tìm (Product, Customer, Table...)
 * @param {string} query - Từ khóa tìm kiếm
 * @param {string[]} fields - Danh sách các trường cần kiểm tra (mặc định: ['name', 'phone', 'barcode', 'sku'])
 * @returns {boolean} true nếu khớp bất kỳ trường nào
 */
export const matchItemSearch = (item, query, fields = ['name', 'phone', 'barcode', 'sku', 'role', 'note']) => {
  if (!query || !query.trim()) return true;
  if (!item || typeof item !== 'object') return false;

  for (const field of fields) {
    const val = item[field];
    if (val !== undefined && val !== null) {
      const strVal = typeof val === 'string' ? val : String(val);
      if (matchSearch(strVal, query)) {
        return true;
      }
    }
  }

  return false;
};

export default {
  removeDiacritics,
  getInitials,
  matchSearch,
  matchItemSearch,
};
