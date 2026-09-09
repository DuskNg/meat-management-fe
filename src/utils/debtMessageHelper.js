// meat-management-fe/src/utils/debtMessageHelper.js

/**
 * Kiểm tra xem khách hàng có phải là "Chị Tuyết (Toàn Nga Thái Dũng)" hay không
 */
export const isChiTuyetToanNgaCustomer = (customer) => {
  if (!customer) return false;
  const raw = typeof customer === 'string'
    ? customer
    : `${customer.name || ''} ${customer.customerName || ''} ${customer.label || ''} ${customer.phone || ''} ${customer.note || ''} ${customer.alias || ''}`;

  const norm = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();

  // Nhận diện nếu có "tuyet" và kết hợp các từ khóa liên quan
  const hasTuyet = norm.includes('tuyet');
  const hasKeywords =
    norm.includes('toan') ||
    norm.includes('nga') ||
    norm.includes('thai') ||
    norm.includes('dung');

  if (hasTuyet && hasKeywords) return true;
  if (norm.includes('toan nga') || norm.includes('thai dung')) return true;
  if (norm === 'chi tuyet' || norm === 'tuyet' || norm.startsWith('chi tuyet(') || norm.startsWith('chi tuyet (')) return true;

  return false;
};

/**
 * Chuẩn hóa chuỗi text tiếng Việt không dấu
 */
const normalizeText = (str) => {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();
};

/**
 * Phân loại nhóm sản phẩm riêng cho khách hàng Chị Tuyết:
 * - "bò": gồm các món lạm + chín (+ nạm, vai, bò)
 * - "thăn": gồm các món tái + thăn
 */
export const getChiTuyetProductGroup = (productName) => {
  const norm = normalizeText(productName);
  // 1. Nhóm thăn (tái + thăn)
  if (norm.includes('tai') || norm.includes('than')) {
    return 'thăn';
  }
  // 2. Nhóm bò (lạm + chín + nạm + vai + bò)
  if (
    norm.includes('lam') ||
    norm.includes('chin') ||
    norm.includes('nam') ||
    norm.includes('vai') ||
    norm.includes('bo')
  ) {
    return 'bò';
  }
  // 3. Mặc định vào bò hoặc tên món riêng nếu có
  return productName ? productName.toLowerCase().trim() : 'bò';
};

/**
 * Định dạng số cân gọn gàng (23 thay vì 23.0, 11.8, 2.85, 14.53)
 */
const formatQty = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return parseFloat(Number(num).toFixed(2)).toString();
};

/**
 * Kiểm tra xem một bản ghi payment có phải là trả lại hàng hay không
 */
const isReturnPaymentRecord = (item) => {
  if (!item) return false;
  if (item.type === 'debt') return false;
  const note = item.note || item.rawObj?.note || '';
  const details = item.details || item.rawObj?.details || '';
  return (
    note.includes('Trả hàng') ||
    note.includes('Trả lại') ||
    details.includes('Trả hàng') ||
    details.includes('Trả lại')
  );
};

/**
 * Cấu hình tạo tin nhắn công nợ ĐẶC BIỆT RIÊNG cho khách hàng Chị Tuyết (Toàn Nga Thái Dũng)
 * Định dạng chuẩn theo yêu cầu:
 * 8/9
 * bò: 23+11.8-4.3=4422
 * thăn: 2.85=727
 * tổng 5149
 */
export const buildChiTuyetDailyMessage = (dateKey, transList = [], payList = []) => {
  if (!dateKey) return '';

  const dayTrans = (transList || []).filter((t) => {
    const d = new Date(t.date);
    const dd = d.getDate().toString().padStart(2, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}` === dateKey;
  });

  const dayPays = (payList || []).filter((p) => {
    const d = new Date(p.paidAt);
    const dd = d.getDate().toString().padStart(2, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}` === dateKey;
  });

  if (dayTrans.length === 0 && dayPays.length === 0) {
    return `${dateKey}\n(Không có phát sinh giao dịch công nợ)`;
  }

  const [dStr, mStr] = dateKey.split('/');
  const dayHeader = `${parseInt(dStr, 10)}/${parseInt(mStr, 10)}`;

  // Bảng gom nhóm các món: 'bò' và 'thăn'
  const groups = {
    'bò': { posQuantities: [], retQuantities: [], amount: 0 },
    'thăn': { posQuantities: [], retQuantities: [], amount: 0 },
  };

  let totalPayment = 0;

  // 1. Gom các món từ đơn hàng trong ngày
  dayTrans.forEach((t) => {
    const transTotal = parseFloat(t.amount || t.totalAmount || 0);

    if (t.items && t.items.length > 0) {
      t.items.forEach((item) => {
        const q = parseFloat(item.quantity || 0);
        const p = parseFloat(item.price || 0);
        const amt = parseFloat(item.amount !== undefined && item.amount !== null ? item.amount : q * p);
        const name = item.product?.name || item.productName || 'Thịt';

        const groupKey = getChiTuyetProductGroup(name);
        if (!groups[groupKey]) {
          groups[groupKey] = { posQuantities: [], retQuantities: [], amount: 0 };
        }

        if (q < 0) {
          groups[groupKey].retQuantities.push(Math.abs(q));
          groups[groupKey].amount -= Math.abs(amt);
        } else {
          groups[groupKey].posQuantities.push(q);
          groups[groupKey].amount += amt;
        }
      });
    } else {
      // Nếu không có items chi tiết, mặc định vào nhóm bò
      groups['bò'].amount += transTotal;
    }
  });

  // 2. Gom các khoản trả lại hàng từ danh sách thanh toán trong ngày
  dayPays.forEach((p) => {
    const amt = parseFloat(p.amount || 0);
    if (isReturnPaymentRecord(p)) {
      const note = p.note || '';
      const clean = note.replace(/\[Trả lại hàng\]|\[Trả hàng nhanh\]/gi, '').trim();

      // Tách theo các món nếu ghi chú có nhiều món phân tách bằng dấu phẩy
      const parts = clean ? clean.split(/,\s*(?=\d)/) : [];
      let parsedAny = false;

      parts.forEach((part) => {
        // Lấy số lượng ở đầu chuỗi (ví dụ: "4.59kg" hoặc "4.59")
        const qtyMatch = part.match(/^([\d.,]+)\s*(?:kg)?/i);
        const qty = qtyMatch ? parseFloat(qtyMatch[1].replace(',', '.')) : null;

        // Lấy thành tiền ở dấu ngoặc đơn cuối cùng (ví dụ: "(665.550 đ)")
        const amtMatch = part.match(/\(\s*([\d.,]+)\s*(?:đ|₫|VND)?\s*\)\s*$/i);
        const itemAmt = amtMatch
          ? parseFloat(amtMatch[1].replace(/\./g, '').replace(/,/g, ''))
          : (parts.length === 1 ? amt : 0);

        // Tên món thịt (loại bỏ phần số lượng và số tiền ở ngoặc cuối)
        let prodName = part;
        if (qtyMatch) prodName = prodName.slice(qtyMatch[0].length);
        if (amtMatch) prodName = prodName.slice(0, prodName.lastIndexOf(amtMatch[0]));
        prodName = prodName.trim();

        const groupKey = prodName ? getChiTuyetProductGroup(prodName) : 'bò';
        if (!groups[groupKey]) {
          groups[groupKey] = { posQuantities: [], retQuantities: [], amount: 0 };
        }

        if (qty && qty > 0) {
          groups[groupKey].retQuantities.push(qty);
        }
        groups[groupKey].amount -= itemAmt;
        parsedAny = true;
      });

      if (!parsedAny) {
        // Nếu không tách được số cân từ ghi chú, trừ thẳng vào tiền nhóm bò
        groups['bò'].amount -= amt;
      }
    } else {
      totalPayment += amt;
    }
  });

  const lines = [];
  lines.push(dayHeader);

  // Thứ tự hiển thị ưu tiên: 'bò' trước, 'thăn' sau, rồi đến các nhóm khác nếu có
  const orderedKeys = Object.keys(groups).sort((a, b) => {
    if (a === 'bò') return -1;
    if (b === 'bò') return 1;
    if (a === 'thăn') return -1;
    if (b === 'thăn') return 1;
    return a.localeCompare(b);
  });

  let sumDisplayedK = 0;

  orderedKeys.forEach((key) => {
    const g = groups[key];
    const hasData = g.posQuantities.length > 0 || g.retQuantities.length > 0 || g.amount !== 0;
    if (!hasData) return;

    const posStr = g.posQuantities.map(formatQty).join('+');
    const retStr = g.retQuantities.map((q) => `-${formatQty(q)}`).join('');
    let formula = '';

    if (posStr && retStr) {
      formula = `${posStr}${retStr}`;
    } else if (posStr) {
      formula = posStr;
    } else if (retStr) {
      formula = retStr;
    }

    const groupAmountK = Math.round(g.amount / 1000);
    sumDisplayedK += groupAmountK;

    if (formula) {
      lines.push(`${key}: ${formula}=${groupAmountK}`);
    } else if (groupAmountK !== 0) {
      lines.push(`${key}: ${groupAmountK}`);
    }
  });

  // Hàng tổng tiền: 'tổng [tiền_nghìn_đồng]'
  const paymentK = Math.round(totalPayment / 1000);
  const totalK = sumDisplayedK - paymentK;
  lines.push(`tổng ${totalK}`);

  return lines.join('\n');
};
