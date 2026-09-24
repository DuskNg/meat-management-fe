// meat-management-fe/src/utils/debtImageDrawer.js
import { Platform } from 'react-native';

/**
 * Chuyển đổi chuỗi DD/MM/YYYY thành đối tượng Date
 */
export const parseDDMMYYYY = (str, isEndOfDay = false) => {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  if (isEndOfDay) {
    return new Date(y, m - 1, d, 23, 59, 59, 999);
  }
  return new Date(y, m - 1, d, 0, 0, 0, 0);
};

/**
 * Xác định tháng mục tiêu của khoản thanh toán
 */
export const getPaymentTargetMonth = (p) => {
  const trimNote = (p.note || '').trim();
  const monthMatch = trimNote.match(/^Thanh toán (?:nợ|hóa đơn) [Tt]háng (\d{1,2})\/(\d{4})/i) ||
                     trimNote.match(/Thanh toán (?:nợ|hóa đơn) [Tt]háng (\d{1,2})\/(\d{4})/i);
  const dateMatch = trimNote.match(/^Thanh toán nợ ngày (\d{1,2})\/(\d{1,2})\/(\d{4})/i);

  if (monthMatch) {
    const mm = monthMatch[1].padStart(2, '0');
    return `${mm}/${monthMatch[2]}`;
  }
  if (dateMatch) {
    const mm = dateMatch[2].padStart(2, '0');
    return `${mm}/${dateMatch[3]}`;
  }
  const d = new Date(p.paidAt);
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${yyyy}`;
};

/**
 * Kiểm tra xem một giao dịch/khoản thanh toán có phải là "Trả hàng" hay không
 */
export const isReturnPayment = (p) => {
  if (!p) return false;
  const trimNote = (p.note || '').trim();
  return (
    trimNote.includes('Trả lại hàng') ||
    trimNote.includes('Trả hàng') ||
    trimNote.includes('Trả lại')
  );
};

/**
 * Phân tích danh sách các món thịt trả lại từ ghi chú
 */
export const parseReturnItems = (note, defaultAmount) => {
  if (!note) return [{ type: 'RETURN', name: '[TRẢ HÀNG]', quantity: null, price: null, amount: defaultAmount }];

  const isNoteLevelImport = /\b(nhập hàng|nhập thịt|nhập kho|nhập lô|mua thịt|mua hàng|nhap hang|nhap thit)\b/i.test(note || '');

  // Loại bỏ các tag hệ thống và tiền tố
  let text = note.replace(/\[Trả lại hàng\]|\[Trả hàng nhanh\]|\[Trả hàng\]|\[Nhập hàng\]/gi, '').trim();
  text = text.replace(/^(?:Trả hàng nhanh|Trả lại hàng|Trả hàng|Nhập hàng)\s*[:-]?\s*/gi, '').trim();
  if (!text) {
    return [{
      type: 'RETURN',
      name: isNoteLevelImport ? '[NHẬP HÀNG]' : '[TRẢ HÀNG]',
      quantity: null,
      price: null,
      amount: defaultAmount,
    }];
  }

  // Hàm phụ chuẩn hóa tên món và gắn tiền tố tương ứng [NHẬP HÀNG] hoặc [TRẢ HÀNG]
  const formatReturnItemName = (rawName, isPartImport) => {
    let clean = (rawName || '').trim();
    // 1. Xóa số tiền nằm trong ngoặc đơn: ví dụ (1.288.000), (986.400 Đ)
    clean = clean.replace(/\(\s*[\d.,]+\s*[đ₫kKVND]?\s*\)/gi, ' ').trim();
    // 2. Xóa các tiền tố trả hàng / nhập hàng
    clean = clean.replace(/^(TRẢ HÀNG NHANH|TRẢ LẠI HÀNG|TRẢ HÀNG|TRẢ LẠI|TRẢ|NHẬP HÀNG|NHẬP THỊT|NHẬP)\s*[:-]?\s*/gi, ' ').trim();
    // 3. Xóa các hậu tố nhập hàng hoặc số lượng lặp lại ở đuôi: ví dụ "- - NHẬP HÀNG", "- NHẬP TÁI 240", "- 6.57KG GẦU BÒ"
    clean = clean.replace(/[-–—:]*\s*(?:NHẬP HÀNG|NHẬP THỊT|NHẬP TÁI(?:\s*\d+)?|NHẬP GẦU(?:\s*\d+)?|NHẬP\s+[a-zA-ZÀ-ỹ]+(?:\s*\d+)?)\s*$/gi, ' ').trim();
    clean = clean.replace(/[-–—:]*\s*\d+(?:[.,]\d+)?\s*(?:kg|kilo)?\s+[a-zA-ZÀ-ỹ\s()]+\s*$/gi, ' ').trim();
    // 4. Xóa dấu gạch nối hoặc khoảng trắng thừa ở đầu/cuối
    clean = clean.replace(/^[-–—:\s]+|[-–—:\s]+$/g, '').trim().toUpperCase();

    if (isPartImport || isNoteLevelImport) {
      return clean ? `[NHẬP HÀNG] ${clean}` : '[NHẬP HÀNG]';
    }
    return clean ? `[TRẢ HÀNG] ${clean}` : '[TRẢ HÀNG]';
  };

  // Tách nhiều món nếu phân tách bởi dấu phẩy
  const parts = text.split(/,\s*(?=[a-zA-Z\d\u00C0-\u1EF9])/);
  const results = [];

  for (let part of parts) {
    part = part.trim();
    if (!part) continue;

    const isPartImport = /\b(nhập hàng|nhập thịt|nhập tái|nhập gầu|nhập kho|nhập lô|mua thịt|mua hàng|nhap hang|nhap thit|nhap)\b/i.test(part) || isNoteLevelImport;

    // 1. Kiểm tra định dạng cũ: <số lượng><đơn vị> <tên thịt> (<thành tiền>)
    // Ví dụ: '2.61kg Tái (bò) (626.400 đ)' hoặc '6.44kg gầu bò (1.288.000) - - NHẬP HÀNG'
    const oldFormatRegex = /^(\d+(?:[.,]\d+)?)\s*(?:kg|kilo)?\s+(.+?)(?:\s*\(\s*([\d.,]+)[\s\u00a0]*[đ₫VND]?\s*\))?(?:\s*[-–—:]\s*(.*))?$/i;
    const oldMatch = part.match(oldFormatRegex);
    if (oldMatch) {
      const tokenAfter = oldMatch[2].trim();
      const startsWithNumber = /^\d+/.test(tokenAfter);
      if (!startsWithNumber) {
        const qty = parseFloat(oldMatch[1].replace(',', '.'));
        let rawProdName = oldMatch[2].trim();
        const amtStr = oldMatch[3] ? oldMatch[3].replace(/\./g, '').replace(/,/g, '') : null;
        let amt = amtStr ? parseFloat(amtStr) : 0;
        if (!amt) {
          const innerParen = part.match(/\(\s*([\d.,]+)[\s\u00a0]*[đ₫kKVND]?\s*\)/i);
          if (innerParen) amt = parseFloat(innerParen[1].replace(/\./g, '').replace(/,/g, ''));
        }
        if (!amt && parts.length === 1) amt = defaultAmount;
        const price = (qty && qty > 0 && amt > 0) ? Math.round(amt / qty) : null;
        results.push({
          type: 'RETURN',
          name: formatReturnItemName(rawProdName, isPartImport),
          quantity: !isNaN(qty) ? qty : null,
          price: price,
          amount: amt,
        });
        continue;
      }
    }

    // 2. Kiểm tra định dạng nhập nhanh: <tên thịt> <đơn giá> <số lượng>[kg][(ghi chú)]
    // Ví dụ: 'gầu 210 13.87kg', 'gầu 210 13.87(C)', 'gầu 210 7.42', 'lạm 145 6.69kg'
    let amtFromParen = null;
    const parenAmtMatch = part.match(/\(\s*([\d.,]+)[\s\u00a0]*[đ₫VND]?\s*\)\s*$/i);
    if (parenAmtMatch) {
      amtFromParen = parseFloat(parenAmtMatch[1].replace(/\./g, '').replace(/,/g, ''));
      part = part.slice(0, part.lastIndexOf(parenAmtMatch[0])).trim();
    }

    const quickMatch = part.match(/^([a-zA-ZÀ-ỹ\s()+-]+?)\s+(\d+(?:[.,]\d+)?\s*[kK]?)\s+([\d]+(?:[.,]\d+)?)\s*(?:kg|kilo)?\s*(\([a-zA-Z0-9\s]+\))?$/i);
    if (quickMatch) {
      let rawProdName = quickMatch[1].trim();
      const extraNote = quickMatch[4] ? ` ${quickMatch[4].trim()}` : '';
      if (extraNote) rawProdName += extraNote;

      const num1Str = quickMatch[2].trim().toLowerCase().replace('k', '');
      const num2Str = quickMatch[3].trim().replace(',', '.');

      let num1 = parseFloat(num1Str.replace(',', '.'));
      let num2 = parseFloat(num2Str);

      let price = null;
      let qty = null;

      if (num1 >= 50 && num2 < 50) {
        price = num1 < 1000 ? num1 * 1000 : num1;
        qty = num2;
      } else if (num2 >= 50 && num1 < 50) {
        price = num2 < 1000 ? num2 * 1000 : num2;
        qty = num1;
      } else {
        if (num1 >= 50) {
          price = num1 < 1000 ? num1 * 1000 : num1;
          qty = num2;
        } else {
          qty = num1;
          price = num2 < 1000 ? num2 * 1000 : num2;
        }
      }

      let amt = amtFromParen;
      if (!amt && qty && price) {
        amt = Math.round(qty * price);
      }
      if (!amt && parts.length === 1 && defaultAmount) {
        amt = defaultAmount;
      }

      results.push({
        type: 'RETURN',
        name: formatReturnItemName(rawProdName, isPartImport),
        quantity: qty,
        price: price,
        amount: amt || 0,
      });
      continue;
    }

    // 3. Nếu chỉ có <tên thịt> <số lượng>kg (không có đơn giá ghi trong ghi chú)
    const nameQtyMatch = part.match(/^([a-zA-ZÀ-ỹ\s()+-]+?)\s+(\d+(?:[.,]\d+)?)\s*(?:kg|kilo)\s*(\([a-zA-Z0-9\s]+\))?$/i);
    if (nameQtyMatch) {
      let rawProdName = nameQtyMatch[1].trim();
      if (nameQtyMatch[3]) rawProdName += ` ${nameQtyMatch[3].trim()}`;
      const qty = parseFloat(nameQtyMatch[2].replace(',', '.'));
      let amt = amtFromParen;
      if (!amt) {
        const innerParen = part.match(/\(\s*([\d.,]+)[\s\u00a0]*[đ₫kKVND]?\s*\)/i);
        if (innerParen) amt = parseFloat(innerParen[1].replace(/\./g, '').replace(/,/g, ''));
      }
      if (!amt && parts.length === 1) amt = defaultAmount;
      const price = (qty && qty > 0 && amt > 0) ? Math.round(amt / qty) : null;
      results.push({
        type: 'RETURN',
        name: formatReturnItemName(rawProdName, isPartImport),
        quantity: !isNaN(qty) ? qty : null,
        price: price,
        amount: amt || 0,
      });
      continue;
    }

    // 4. Fallback không tách được số: Giữ tên gốc
    results.push({
      type: 'RETURN',
      name: formatReturnItemName(part, isPartImport),
      quantity: null,
      price: null,
      amount: parts.length === 1 ? defaultAmount : 0,
    });
  }

  return results.length > 0 ? results : [{
    type: 'RETURN',
    name: isNoteLevelImport ? '[NHẬP HÀNG]' : '[TRẢ HÀNG]',
    quantity: null,
    price: null,
    amount: defaultAmount,
  }];
};

/**
 * Hàm vẽ ảnh bảng kê công nợ Canvas chất lượng cao Retina 2x
 * @param {Object} params
 * @param {Array} params.transList - Danh sách giao dịch
 * @param {Array} params.payList - Danh sách thanh toán
 * @param {Object} params.cust - Thông tin khách hàng
 * @param {string} params.fromDate - Từ ngày (DD/MM/YYYY)
 * @param {string} params.toDate - Đến ngày (DD/MM/YYYY)
 * @returns {Promise<{ imageUri: string, totalMeatAmount: number, totalPaymentAmount: number, totalReturnAmount: number, finalDebt: number, rowsCount: number, hasTransactions: boolean }>}
 */
export const drawDebtImageCanvas = async ({
  transList = [],
  payList = [],
  cust,
  fromDate,
  toDate,
}) => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return { imageUri: null, totalMeatAmount: 0, totalPaymentAmount: 0, totalReturnAmount: 0, finalDebt: 0, rowsCount: 0, hasTransactions: false };
  }

  if (!cust) {
    return { imageUri: null, totalMeatAmount: 0, totalPaymentAmount: 0, totalReturnAmount: 0, finalDebt: 0, rowsCount: 0, hasTransactions: false };
  }

  const activeFrom = fromDate;
  const activeTo = toDate;

  const fromD = parseDDMMYYYY(activeFrom, false);
  const toD = parseDDMMYYYY(activeTo, true);

  const isFullMonth = fromD && toD &&
    fromD.getDate() === 1 &&
    fromD.getMonth() === toD.getMonth() &&
    fromD.getFullYear() === toD.getFullYear() &&
    toD.getDate() === new Date(toD.getFullYear(), toD.getMonth() + 1, 0).getDate();

  const mm = fromD ? (fromD.getMonth() + 1) : (new Date().getMonth() + 1);
  const yyyy = fromD ? fromD.getFullYear() : new Date().getFullYear();
  const monthStr = `${mm.toString().padStart(2, '0')}/${yyyy}`;

  // Lọc giao dịch phát sinh trong khoảng ngày
  const filteredTrans = (transList || []).filter(t => {
    const d = new Date(t.date);
    if (isNaN(d.getTime())) return false;
    if (fromD && toD) {
      return d >= fromD && d <= toD;
    }
    return true;
  });

  // Lọc các khoản thanh toán trong khoảng ngày
  const filteredPays = (payList || []).filter(p => {
    const pDate = new Date(p.paidAt);
    if (fromD && toD) {
      const trimNote = (p.note || '').trim();
      const hasExplicitTargetMonth = Boolean(
        trimNote.match(/^Thanh toán (?:nợ|hóa đơn) [Tt]háng (\d{1,2})\/(\d{4})/i) ||
        trimNote.match(/Thanh toán (?:nợ|hóa đơn) [Tt]háng (\d{1,2})\/(\d{4})/i)
      );

      if (hasExplicitTargetMonth) {
        const targetMonth = getPaymentTargetMonth(p);
        if (isFullMonth) {
          return targetMonth === monthStr;
        }
        return pDate >= fromD && pDate <= toD;
      }

      const dateMatch = trimNote.match(/^Thanh toán nợ ngày (\d{1,2})\/(\d{1,2})\/(\d{4})/i);
      let effDate = pDate;
      if (dateMatch) {
        effDate = new Date(Number(dateMatch[3]), Number(dateMatch[2]) - 1, Number(dateMatch[1]), 12, 0, 0);
      }
      const inRange = effDate >= fromD && effDate <= toD;
      const isTarget = isFullMonth && getPaymentTargetMonth(p) === monthStr;
      return inRange || isTarget;
    }
    return true;
  });

  const daysInMonth = new Date(yyyy, mm, 0).getDate();
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  const currentDay = currentDate.getDate();

  const isCurrentMonth = (mm === currentMonth && yyyy === currentYear);
  const maxDay = isCurrentMonth ? Math.min(daysInMonth, currentDay) : daysInMonth;

  const dayMap = {};
  let totalMeatAmount = 0;
  let totalReturnAmount = 0;
  let totalPaymentAmount = 0;

  // 1. Thêm giao dịch thịt
  filteredTrans.forEach(t => {
    const d = new Date(t.date);
    const dayNum = d.getDate().toString().padStart(2, '0');
    const monthNum = (d.getMonth() + 1).toString().padStart(2, '0');
    const dateKey = `${dayNum}/${monthNum}/${d.getFullYear()}`;
    const displayDate = `${dayNum}/${monthNum}`;

    if (!dayMap[dateKey]) {
      dayMap[dateKey] = {
        date: t.date,
        dateKey,
        displayDate,
        entries: [],
      };
    }

    const amt = parseFloat(t.totalAmount || 0);

    if (t.items && t.items.length > 0) {
      t.items.forEach(item => {
        const q = parseFloat(item.quantity);
        const p = parseFloat(item.price);
        const itemAmt = parseFloat(item.amount) || Math.round((q || 0) * (p || 0));
        const rawName = item.product?.name || item.productName || 'Thịt';
        const isQuick = rawName === 'Tiền hàng' || rawName.toLowerCase().startsWith('tiền') || t.note === 'Ghi nợ nhanh';

        totalMeatAmount += itemAmt;
        dayMap[dateKey].entries.push({
          type: 'DELIVERY',
          name: isQuick ? 'TIỀN HÀNG' : rawName.toUpperCase(),
          quantity: isQuick ? null : (isNaN(q) ? null : q),
          price: isQuick ? null : (isNaN(p) ? null : p),
          amount: itemAmt,
        });
      });
    } else {
      totalMeatAmount += amt;
      const noteName = (t.note && t.note !== 'Ghi nợ nhanh') ? t.note : 'TIỀN HÀNG';
      dayMap[dateKey].entries.push({
        type: 'DELIVERY',
        name: noteName.toUpperCase(),
        quantity: null,
        price: null,
        amount: amt,
      });
    }
  });

  // 2. Thêm thanh toán & trả hàng
  filteredPays.forEach(p => {
    const d = new Date(p.paidAt);
    const dayNum = d.getDate().toString().padStart(2, '0');
    const monthNum = (d.getMonth() + 1).toString().padStart(2, '0');
    const dateKey = `${dayNum}/${monthNum}/${d.getFullYear()}`;
    const displayDate = `${dayNum}/${monthNum}`;

    if (!dayMap[dateKey]) {
      dayMap[dateKey] = {
        date: p.paidAt,
        dateKey,
        displayDate,
        entries: [],
      };
    }

    const amt = parseFloat(p.amount || 0);
    const isReturn = isReturnPayment(p);

    if (isReturn) {
      totalReturnAmount += amt;
      const returnItems = parseReturnItems(p.note, amt);
      returnItems.forEach(ritem => {
        dayMap[dateKey].entries.push(ritem);
      });
    } else {
      totalPaymentAmount += amt;
      dayMap[dateKey].entries.push({
        type: 'PAYMENT',
        name: 'ĐÃ THU',
        quantity: null,
        price: null,
        amount: amt,
      });
    }
  });

  const activeDays = Object.values(dayMap).filter(d => d.entries && d.entries.length > 0);
  const sortedDays = activeDays.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Chuẩn hóa thứ tự các món trong ngày: DELIVERY -> RETURN -> TỔNG (đã trừ trả hàng) -> PAYMENT
  sortedDays.forEach((day) => {
    const deliveries = (day.entries || []).filter((e) => e.type === 'DELIVERY');
    const returns = (day.entries || []).filter((e) => e.type === 'RETURN');
    const payments = (day.entries || []).filter((e) => e.type === 'PAYMENT');
    const others = (day.entries || []).filter((e) => e.type !== 'DELIVERY' && e.type !== 'RETURN' && e.type !== 'PAYMENT' && e.type !== 'DAY_TOTAL');

    const newEntries = [...deliveries, ...returns];

    // Hiển thị dòng TỔNG nếu có từ 2 món thịt trở lên hoặc có cả thịt và trả hàng
    if (deliveries.length > 1 || (deliveries.length >= 1 && returns.length > 0)) {
      const dayMeatTotal = deliveries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
      const dayReturnTotal = returns.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
      // Phần tổng trừ đi cả phần trả hàng nếu có
      const dayFinalTotal = dayMeatTotal - dayReturnTotal;

      newEntries.push({
        type: 'DAY_TOTAL',
        name: 'TỔNG',
        quantity: null,
        price: null,
        amount: dayFinalTotal,
      });
    }

    day.entries = [...newEntries, ...payments, ...others];
  });

  // Tính ngày không phát sinh công nợ
  const deliveryDateKeys = new Set(
    sortedDays.filter(d => (d.entries || []).some(e => e.type === 'DELIVERY')).map(d => d.dateKey)
  );
  const emptyDays = [];
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  if (fromD && toD) {
    if (fromD <= today) {
      const cur = new Date(fromD);
      cur.setHours(0, 0, 0, 0);
      const endLimit = toD < today ? new Date(toD) : today;
      endLimit.setHours(23, 59, 59, 999);

      while (cur <= endLimit) {
        const dStr = cur.getDate().toString().padStart(2, '0');
        const mStr = (cur.getMonth() + 1).toString().padStart(2, '0');
        const yStr = cur.getFullYear();
        const dateKey = `${dStr}/${mStr}/${yStr}`;
        if (!deliveryDateKeys.has(dateKey)) {
          emptyDays.push(`${dStr}/${mStr}`);
        }
        cur.setDate(cur.getDate() + 1);
      }
    }
  } else {
    for (let day = 1; day <= maxDay; day++) {
      const dStr = day.toString().padStart(2, '0');
      const mStr = mm.toString().padStart(2, '0');
      const dateKey = `${dStr}/${mStr}/${yyyy}`;
      if (!deliveryDateKeys.has(dateKey)) {
        emptyDays.push(`${dStr}/${mStr}`);
      }
    }
  }

  // Toàn bộ công nợ tháng
  let wholeMonthMeat = 0;
  (transList || []).forEach(t => {
    const d = new Date(t.date);
    if (!isNaN(d.getTime()) && (d.getMonth() + 1) === mm && d.getFullYear() === yyyy) {
      if (t.items && t.items.length > 0) {
        t.items.forEach(it => {
          wholeMonthMeat += parseFloat(it.amount) || Math.round((parseFloat(it.quantity) || 0) * (parseFloat(it.price) || 0));
        });
      } else {
        wholeMonthMeat += parseFloat(t.totalAmount || 0);
      }
    }
  });

  let wholeMonthReturn = 0;
  let wholeMonthPayment = 0;
  (payList || []).forEach(p => {
    const trimNote = (p.note || '').trim();
    const hasExplicitTargetMonth = Boolean(
      trimNote.match(/^Thanh toán (?:nợ|hóa đơn) [Tt]háng (\d{1,2})\/(\d{4})/i) ||
      trimNote.match(/Thanh toán (?:nợ|hóa đơn) [Tt]háng (\d{1,2})\/(\d{4})/i)
    );

    let shouldInclude = false;
    if (hasExplicitTargetMonth) {
      shouldInclude = (getPaymentTargetMonth(p) === monthStr);
    } else {
      const targetMonth = getPaymentTargetMonth(p);
      const pDate = new Date(p.paidAt);
      const dateMatch = trimNote.match(/^Thanh toán nợ ngày (\d{1,2})\/(\d{1,2})\/(\d{4})/i);
      let effDate = pDate;
      if (dateMatch) {
        effDate = new Date(Number(dateMatch[3]), Number(dateMatch[2]) - 1, Number(dateMatch[1]), 12, 0, 0);
      }
      const isSameMonth = !isNaN(effDate.getTime()) && (effDate.getMonth() + 1) === mm && effDate.getFullYear() === yyyy;
      shouldInclude = (targetMonth === monthStr) || isSameMonth;
    }

    if (shouldInclude) {
      const amt = parseFloat(p.amount || 0);
      if (isReturnPayment(p)) {
        wholeMonthReturn += amt;
      } else {
        wholeMonthPayment += amt;
      }
    }
  });

  const wholeMonthDebt = Math.max(0, wholeMonthMeat - wholeMonthReturn - wholeMonthPayment);
  const finalDebt = Math.max(0, totalMeatAmount - totalReturnAmount - totalPaymentAmount);

  // Nếu không có bất kỳ giao dịch nào
  if (sortedDays.length === 0) {
    return {
      imageUri: null,
      totalMeatAmount: 0,
      totalPaymentAmount: 0,
      totalReturnAmount: 0,
      finalDebt: 0,
      rowsCount: 0,
      hasTransactions: false,
    };
  }

  const totalEntriesCount = sortedDays.reduce((sum, d) => sum + d.entries.length, 0);

  // ─── THIẾT KẾ BẢNG CANVAS ───
  const startX = 36;
  const colWidths = [60, 200, 65, 100, 135];
  const panelWidth = colWidths.reduce((a, b) => a + b, 0); // 560px
  const panelGap = 16;
  const isSplit = sortedDays.length > 10;
  const canvasWidth = isSplit ? (startX * 2 + panelWidth * 2 + panelGap) : (startX * 2 + panelWidth);

  let leftDays = [];
  let rightDays = [];

  if (!isSplit) {
    leftDays = sortedDays;
    rightDays = [];
  } else {
    let bestK = 1;
    let minDiff = Infinity;
    let runningLeft = 0;

    for (let k = 1; k < sortedDays.length; k++) {
      runningLeft += sortedDays[k - 1].entries.length;
      const runningRight = totalEntriesCount - runningLeft;
      const diff = Math.abs(runningLeft - runningRight);
      if (diff < minDiff) {
        minDiff = diff;
        bestK = k;
      }
    }

    leftDays = sortedDays.slice(0, bestK);
    rightDays = sortedDays.slice(bestK);
  }

  const rowHeight = 34;
  const tableHeaderHeight = 38;
  const summaryRowHeight = 46;
  const startTableY = 78;

  const leftEntriesCount = leftDays.reduce((sum, d) => sum + d.entries.length, 0);
  const rightEntriesCount = rightDays.reduce((sum, d) => sum + d.entries.length, 0);
  const maxRowsInCol = Math.max(leftEntriesCount, rightEntriesCount, 1);
  const tableContentHeight = maxRowsInCol * rowHeight;

  const summaryRowsCount = 1 + (totalReturnAmount > 0 ? 1 : 0) + (totalPaymentAmount > 0 ? 1 : 0) + 1 + (!isFullMonth ? 1 : 0);
  const summaryHeight = summaryRowsCount * summaryRowHeight;
  const summaryStartY = startTableY + tableHeaderHeight + tableContentHeight + 16;
  const emptyDaysHeight = (!isSplit && emptyDays.length > 0) ? 28 : 0;
  const canvasHeight = summaryStartY + summaryHeight + emptyDaysHeight + 30;

  // Tạo Canvas
  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = canvasWidth * scale;
  canvas.height = canvasHeight * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // ─── Header Card ───
  const headerCardHeight = 44;
  const headerCardY = 20;
  const cardRadius = 8;
  const cardX = startX;
  const cardW = canvasWidth - startX * 2;

  ctx.fillStyle = '#F8FAFC';
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + cardRadius, headerCardY);
  ctx.lineTo(cardX + cardW - cardRadius, headerCardY);
  ctx.quadraticCurveTo(cardX + cardW, headerCardY, cardX + cardW, headerCardY + cardRadius);
  ctx.lineTo(cardX + cardW, headerCardY + headerCardHeight - cardRadius);
  ctx.quadraticCurveTo(cardX + cardW, headerCardY + headerCardHeight, cardX + cardW - cardRadius, headerCardY + headerCardHeight);
  ctx.lineTo(cardX + cardRadius, headerCardY + headerCardHeight);
  ctx.quadraticCurveTo(cardX, headerCardY + headerCardHeight, cardX, headerCardY + headerCardHeight - cardRadius);
  ctx.lineTo(cardX, headerCardY + cardRadius);
  ctx.quadraticCurveTo(cardX, headerCardY, cardX + cardRadius, headerCardY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  let titleText = `Khách hàng: ${cust?.name || ''}`;
  if (isFullMonth && monthStr) {
    titleText += ` - Tháng ${monthStr}`;
  } else if (activeFrom === activeTo) {
    titleText += ` (Ngày ${activeFrom})`;
  } else {
    titleText += ` (Từ ${activeFrom} đến ${activeTo})`;
  }

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 16.5px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(titleText, canvasWidth / 2, headerCardY + headerCardHeight / 2);

  // Vẽ Panel
  const drawPanel = (panelDays, panelStartX) => {
    let panelY = startTableY;

    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(panelStartX, panelY, panelWidth, tableHeaderHeight);
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(panelStartX, panelY, panelWidth, tableHeaderHeight);

    const pColX = [
      panelStartX,
      panelStartX + colWidths[0],
      panelStartX + colWidths[0] + colWidths[1],
      panelStartX + colWidths[0] + colWidths[1] + colWidths[2],
      panelStartX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3],
    ];

    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    for (let c = 1; c < pColX.length; c++) {
      ctx.beginPath();
      ctx.moveTo(pColX[c], panelY);
      ctx.lineTo(pColX[c], panelY + tableHeaderHeight);
      ctx.stroke();
    }

    ctx.fillStyle = '#334155';
    ctx.font = 'bold 13.5px Arial, sans-serif';
    ctx.textBaseline = 'middle';
    const hMid = panelY + tableHeaderHeight / 2;

    ctx.textAlign = 'center';
    ctx.fillText('NGÀY', pColX[0] + colWidths[0] / 2, hMid);

    ctx.textAlign = 'left';
    ctx.fillText('TÊN HÀNG', pColX[1] + 8, hMid);

    ctx.textAlign = 'right';
    ctx.fillText('SL (KG)', pColX[2] + colWidths[2] - 8, hMid);
    ctx.fillText('ĐƠN GIÁ', pColX[3] + colWidths[3] - 8, hMid);
    ctx.fillText('THÀNH TIỀN', pColX[4] + colWidths[4] - 8, hMid);

    panelY += tableHeaderHeight;

    panelDays.forEach((day) => {
      const dayHeight = day.entries.length * rowHeight;
      const dayStartY = panelY;

      day.entries.forEach((entry, idx) => {
        const itemY = dayStartY + idx * rowHeight;
        const midY = itemY + rowHeight / 2;
        const isDayTotal = entry.type === 'DAY_TOTAL';

        ctx.fillStyle = isDayTotal ? '#F8FAFC' : '#FFFFFF';
        ctx.fillRect(panelStartX, itemY, panelWidth, rowHeight);

        if (isDayTotal) {
          ctx.strokeStyle = '#CBD5E1';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pColX[1], itemY);
          ctx.lineTo(panelStartX + panelWidth, itemY);
          ctx.stroke();
        }

        ctx.textAlign = 'left';
        if (isDayTotal) {
          ctx.fillStyle = '#0F172A';
          ctx.font = 'bold 13.5px Arial, sans-serif';
          ctx.fillText(entry.name, pColX[1] + 8, midY);
        } else if (entry.type === 'RETURN') {
          ctx.fillStyle = '#DC2626';
          ctx.font = '13.5px Arial, sans-serif';
          ctx.fillText(entry.name, pColX[1] + 8, midY);
        } else if (entry.type === 'PAYMENT') {
          ctx.fillStyle = '#059669';
          ctx.font = '13.5px Arial, sans-serif';
          ctx.fillText(entry.name, pColX[1] + 8, midY);
        } else {
          ctx.fillStyle = '#0F172A';
          ctx.font = '13.5px Arial, sans-serif';
          ctx.fillText(entry.name, pColX[1] + 8, midY);
        }

        ctx.textAlign = 'right';
        if (isDayTotal) {
          ctx.fillStyle = '#64748B';
          ctx.font = '14px Arial, sans-serif';
          ctx.fillText('-', pColX[2] + colWidths[2] - 8, midY);
        } else {
          const isQuickEntry = entry.name === 'TIỀN HÀNG' || entry.name?.startsWith('TIỀN') || entry.isQuick;
          const numQty = parseFloat(entry.quantity);
          const qtyText = (!isQuickEntry && entry.quantity !== null && entry.quantity !== undefined && !isNaN(numQty))
            ? (Number.isInteger(numQty) ? String(numQty) : parseFloat(numQty.toFixed(2)).toString())
            : '-';
          ctx.fillStyle = entry.type === 'RETURN' ? '#DC2626' : '#0F172A';
          ctx.font = '14px Arial, sans-serif';
          ctx.fillText(qtyText, pColX[2] + colWidths[2] - 8, midY);
        }

        ctx.textAlign = 'right';
        if (isDayTotal) {
          ctx.fillStyle = '#64748B';
          ctx.font = 'bold 14.5px Arial, sans-serif';
          ctx.fillText('-', pColX[3] + colWidths[3] - 8, midY);
        } else {
          const isQuickEntry = entry.name === 'TIỀN HÀNG' || entry.name?.startsWith('TIỀN') || entry.isQuick;
          const numPrice = parseFloat(entry.price);
          const priceText = (!isQuickEntry && entry.price !== null && entry.price !== undefined && !isNaN(numPrice) && numPrice > 0)
            ? new Intl.NumberFormat('vi-VN').format(Math.round(numPrice))
            : '-';
          ctx.fillStyle = entry.type === 'RETURN' ? '#DC2626' : '#0F172A';
          ctx.font = 'bold 14.5px Arial, sans-serif';
          ctx.fillText(priceText, pColX[3] + colWidths[3] - 8, midY);
        }

        ctx.textAlign = 'right';
        const numAmount = parseFloat(entry.amount || 0);
        const formattedAmount = new Intl.NumberFormat('vi-VN').format(Math.round(numAmount));
        if (isDayTotal) {
          ctx.fillStyle = '#0F172A';
          ctx.font = 'bold 15px Arial, sans-serif';
          ctx.fillText(formattedAmount, pColX[4] + colWidths[4] - 8, midY);
        } else if (entry.type === 'RETURN') {
          ctx.fillStyle = '#DC2626';
          ctx.font = 'bold 15px Arial, sans-serif';
          ctx.fillText(`-${formattedAmount}`, pColX[4] + colWidths[4] - 8, midY);
        } else if (entry.type === 'PAYMENT') {
          ctx.fillStyle = '#059669';
          ctx.font = 'bold 15px Arial, sans-serif';
          ctx.fillText(`-${formattedAmount}`, pColX[4] + colWidths[4] - 8, midY);
        } else {
          ctx.fillStyle = '#0F172A';
          ctx.font = 'bold 15px Arial, sans-serif';
          ctx.fillText(formattedAmount, pColX[4] + colWidths[4] - 8, midY);
        }

        if (idx < day.entries.length - 1) {
          ctx.strokeStyle = '#F1F5F9';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pColX[1], itemY + rowHeight);
          ctx.lineTo(panelStartX + panelWidth, itemY + rowHeight);
          ctx.stroke();
        }
      });

      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1;
      for (let c = 1; c < pColX.length; c++) {
        ctx.beginPath();
        ctx.moveTo(pColX[c], dayStartY);
        ctx.lineTo(pColX[c], dayStartY + dayHeight);
        ctx.stroke();
      }

      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(pColX[0], dayStartY, colWidths[0], dayHeight);
      ctx.strokeStyle = '#CBD5E1';
      ctx.strokeRect(pColX[0], dayStartY, colWidths[0], dayHeight);

      ctx.fillStyle = '#334155';
      ctx.font = '13.5px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(day.displayDate, pColX[0] + colWidths[0] / 2, dayStartY + dayHeight / 2);

      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(panelStartX, dayStartY + dayHeight);
      ctx.lineTo(panelStartX + panelWidth, dayStartY + dayHeight);
      ctx.stroke();

      panelY += dayHeight;
    });

    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(panelStartX, startTableY, panelWidth, panelY - startTableY);

    return panelY;
  };

  drawPanel(leftDays, startX);

  if (isSplit && rightDays.length > 0) {
    const rightStartX = startX + panelWidth + panelGap;
    drawPanel(rightDays, rightStartX);
  }

  // ─── TỔNG KẾT CUỐI BẢNG ───
  const summaryStartX = isSplit ? (startX + panelWidth + panelGap) : startX;
  const summaryColLeftWidth = 350;
  let curSummaryY = summaryStartY;

  let filterRangeStr = '';
  if (activeFrom && activeTo) {
    if (activeFrom === activeTo) {
      filterRangeStr = activeFrom.substring(0, 5);
    } else {
      filterRangeStr = `${activeFrom.substring(0, 5)} - ${activeTo.substring(0, 5)}`;
    }
  } else if (monthStr) {
    filterRangeStr = `Tháng ${monthStr}`;
  }

  // 1. Tổng tiền hàng
  const meatLabel = filterRangeStr ? `TỔNG TIỀN HÀNG (${filterRangeStr}):` : 'TỔNG TIỀN HÀNG:';
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(summaryStartX, curSummaryY, panelWidth, summaryRowHeight);
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1;
  ctx.strokeRect(summaryStartX, curSummaryY, panelWidth, summaryRowHeight);

  ctx.beginPath();
  ctx.moveTo(summaryStartX + summaryColLeftWidth, curSummaryY);
  ctx.lineTo(summaryStartX + summaryColLeftWidth, curSummaryY + summaryRowHeight);
  ctx.stroke();

  ctx.fillStyle = '#475569';
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(meatLabel, summaryStartX + summaryColLeftWidth - 10, curSummaryY + summaryRowHeight / 2);
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 17.5px Arial, sans-serif';
  ctx.fillText(`${new Intl.NumberFormat('vi-VN').format(totalMeatAmount)} đ`, summaryStartX + panelWidth - 10, curSummaryY + summaryRowHeight / 2);
  curSummaryY += summaryRowHeight;

  // 2. Tiền hàng trả về
  if (totalReturnAmount > 0) {
    ctx.fillStyle = '#FFF7ED';
    ctx.fillRect(summaryStartX, curSummaryY, panelWidth, summaryRowHeight);
    ctx.strokeStyle = '#FED7AA';
    ctx.strokeRect(summaryStartX, curSummaryY, panelWidth, summaryRowHeight);

    ctx.beginPath();
    ctx.moveTo(summaryStartX + summaryColLeftWidth, curSummaryY);
    ctx.lineTo(summaryStartX + summaryColLeftWidth, curSummaryY + summaryRowHeight);
    ctx.stroke();

    ctx.fillStyle = '#C2410C';
    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('TIỀN HÀNG TRẢ VỀ:', summaryStartX + summaryColLeftWidth - 10, curSummaryY + summaryRowHeight / 2);
    ctx.fillStyle = '#DC2626';
    ctx.font = 'bold 17.5px Arial, sans-serif';
    ctx.fillText(`- ${new Intl.NumberFormat('vi-VN').format(totalReturnAmount)} đ`, summaryStartX + panelWidth - 10, curSummaryY + summaryRowHeight / 2);
    curSummaryY += summaryRowHeight;
  }

  // 3. Đã thu
  if (totalPaymentAmount > 0) {
    ctx.fillStyle = '#F0FDF4';
    ctx.fillRect(summaryStartX, curSummaryY, panelWidth, summaryRowHeight);
    ctx.strokeStyle = '#BBF7D0';
    ctx.strokeRect(summaryStartX, curSummaryY, panelWidth, summaryRowHeight);

    ctx.beginPath();
    ctx.moveTo(summaryStartX + summaryColLeftWidth, curSummaryY);
    ctx.lineTo(summaryStartX + summaryColLeftWidth, curSummaryY + summaryRowHeight);
    ctx.stroke();

    ctx.fillStyle = '#047857';
    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('ĐÃ THU:', summaryStartX + summaryColLeftWidth - 10, curSummaryY + summaryRowHeight / 2);
    ctx.fillStyle = '#059669';
    ctx.font = 'bold 17.5px Arial, sans-serif';
    ctx.fillText(`- ${new Intl.NumberFormat('vi-VN').format(totalPaymentAmount)} đ`, summaryStartX + panelWidth - 10, curSummaryY + summaryRowHeight / 2);
    curSummaryY += summaryRowHeight;
  }

  // 4. Còn lại phải thu
  const debtLabel = filterRangeStr ? `CÒN LẠI PHẢI THU (${filterRangeStr}):` : 'CÒN LẠI PHẢI THU:';
  ctx.fillStyle = '#EFF6FF';
  ctx.fillRect(summaryStartX, curSummaryY, panelWidth, summaryRowHeight);
  ctx.strokeStyle = '#93C5FD';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(summaryStartX, curSummaryY, panelWidth, summaryRowHeight);

  ctx.beginPath();
  ctx.moveTo(summaryStartX + summaryColLeftWidth, curSummaryY);
  ctx.lineTo(summaryStartX + summaryColLeftWidth, curSummaryY + summaryRowHeight);
  ctx.stroke();

  ctx.fillStyle = '#1E40AF';
  ctx.font = 'bold 14.5px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(debtLabel, summaryStartX + summaryColLeftWidth - 10, curSummaryY + summaryRowHeight / 2);
  ctx.fillStyle = finalDebt > 0 ? '#DC2626' : '#059669';
  ctx.font = 'bold 18.5px Arial, sans-serif';
  ctx.fillText(`${new Intl.NumberFormat('vi-VN').format(finalDebt)} đ`, summaryStartX + panelWidth - 10, curSummaryY + summaryRowHeight / 2);
  curSummaryY += summaryRowHeight;

  // 5. Tổng công nợ cả tháng (nếu lọc khoảng ngày lẻ trong tháng)
  if (!isFullMonth) {
    const wholeMonthLabel = `TỔNG CÔNG NỢ THÁNG ${monthStr}:`;
    ctx.fillStyle = '#FEF2F2';
    ctx.fillRect(summaryStartX, curSummaryY, panelWidth, summaryRowHeight);
    ctx.strokeStyle = '#FCA5A5';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(summaryStartX, curSummaryY, panelWidth, summaryRowHeight);

    ctx.beginPath();
    ctx.moveTo(summaryStartX + summaryColLeftWidth, curSummaryY);
    ctx.lineTo(summaryStartX + summaryColLeftWidth, curSummaryY + summaryRowHeight);
    ctx.stroke();

    ctx.fillStyle = '#991B1B';
    ctx.font = 'bold 14.5px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(wholeMonthLabel, summaryStartX + summaryColLeftWidth - 10, curSummaryY + summaryRowHeight / 2);

    ctx.fillStyle = wholeMonthDebt > 0 ? '#DC2626' : '#059669';
    ctx.font = 'bold 21px Arial, sans-serif';
    ctx.fillText(`${new Intl.NumberFormat('vi-VN').format(wholeMonthDebt)} đ`, summaryStartX + panelWidth - 10, curSummaryY + summaryRowHeight / 2);
    curSummaryY += summaryRowHeight;
  }

  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(summaryStartX, summaryStartY, panelWidth, curSummaryY - summaryStartY);

  // ─── Ngày không phát sinh công nợ ───
  if (emptyDays.length > 0) {
    ctx.font = 'italic 13.5px Arial, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const noteText = `* Các ngày không phát sinh công nợ: Ngày ${emptyDays.join(', ')}`;
    const maxTextWidth = isSplit ? panelWidth : (canvasWidth - startX * 2);
    const words = noteText.split(' ');
    let line = '';
    let noteCurY = isSplit ? (summaryStartY + 14) : (curSummaryY + 16);

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxTextWidth && n > 0) {
        ctx.fillText(line.trim(), startX, noteCurY);
        line = words[n] + ' ';
        noteCurY += 22;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), startX, noteCurY);
  }

  const url = canvas.toDataURL('image/png');
  return {
    imageUri: url,
    totalMeatAmount,
    totalPaymentAmount,
    totalReturnAmount,
    finalDebt,
    rowsCount: sortedDays.length,
    hasTransactions: true,
  };
};

/**
 * Vẽ ảnh bảng tổng hợp công nợ của cả nhóm khách hàng / chuỗi cửa hàng
 * @param {Object} params
 * @param {string} params.groupName - Tên nhóm khách hàng
 * @param {string} params.fromDate - Từ ngày (DD/MM/YYYY)
 * @param {string} params.toDate - Đến ngày (DD/MM/YYYY)
 * @param {Array} params.items - Danh sách kết quả từng khách: [{ customer, totalMeatAmount, totalReturnAmount, totalPaymentAmount, finalDebt, hasData }]
 * @returns {Promise<{ imageUri: string, groupTotalMeat: number, groupTotalReturn: number, groupTotalPayment: number, groupTotalDebt: number }>}
 */
export const drawGroupSummaryCanvas = async ({
  groupName = 'Nhóm khách hàng',
  fromDate = '',
  toDate = '',
  items = [],
}) => {
  if (typeof document === 'undefined') {
    return { imageUri: null, groupTotalMeat: 0, groupTotalReturn: 0, groupTotalPayment: 0, groupTotalDebt: 0 };
  }

  // Tính các con số tổng của cả nhóm
  const groupTotalMeat = items.reduce((sum, it) => sum + (Number(it.totalMeatAmount) || 0), 0);
  const groupTotalReturn = items.reduce((sum, it) => sum + (Number(it.totalReturnAmount) || 0), 0);
  const groupTotalPayment = items.reduce((sum, it) => sum + (Number(it.totalPaymentAmount) || 0), 0);
  const groupTotalDebt = items.reduce((sum, it) => sum + (Number(it.finalDebt) || 0), 0);

  const hasAnyReturn = items.some(it => (Number(it.totalReturnAmount) || 0) > 0);

  // Định nghĩa cột bảng
  const startX = 36;
  const colWidths = hasAnyReturn
    ? [46, 230, 125, 105, 125, 139]
    : [46, 254, 150, 150, 160];
  const colHeaders = hasAnyReturn
    ? ['STT', 'CỬA HÀNG / KHÁCH HÀNG', 'TIỀN HÀNG', 'TRẢ HÀNG', 'ĐÃ THU', 'CÒN NỢ']
    : ['STT', 'CỬA HÀNG / KHÁCH HÀNG', 'TIỀN HÀNG', 'ĐÃ THU', 'CÒN NỢ'];
  const colAligns = hasAnyReturn
    ? ['center', 'left', 'right', 'right', 'right', 'right']
    : ['center', 'left', 'right', 'right', 'right'];

  const panelWidth = colWidths.reduce((a, b) => a + b, 0);
  const canvasWidth = startX * 2 + panelWidth;

  const headerCardHeight = 66;
  const headerCardY = 22;
  const startTableY = headerCardY + headerCardHeight + 20;
  const tableHeaderHeight = 38;
  const rowHeight = 36;
  const tableContentHeight = Math.max(items.length, 1) * rowHeight;

  const summaryRowHeight = 44;
  const summaryRowsCount = 1 + (hasAnyReturn ? 1 : 0) + (groupTotalPayment > 0 ? 1 : 0) + 1;
  const summaryHeight = summaryRowsCount * summaryRowHeight;
  const summaryStartY = startTableY + tableHeaderHeight + tableContentHeight + 16;
  const footerNoteHeight = 46;
  const canvasHeight = summaryStartY + summaryHeight + footerNoteHeight + 24;

  // Tạo Canvas với scale = 2 (Chuẩn Retina sắc nét cao)
  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = canvasWidth * scale;
  canvas.height = canvasHeight * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  // Nền trắng toàn bộ ảnh
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // ─── 1. Khung Header ───
  const cardRadius = 10;
  const cardX = startX;
  const cardW = panelWidth;

  ctx.fillStyle = '#F8FAFC';
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(cardX, headerCardY, cardW, headerCardHeight, cardRadius);
  } else {
    ctx.rect(cardX, headerCardY, cardW, headerCardHeight);
  }
  ctx.fill();
  ctx.stroke();

  // Tiêu đề Header
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 18px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BẢNG TỔNG HỢP CÔNG NỢ NHÓM', canvasWidth / 2, headerCardY + 22);

  // Phụ đề (Tên nhóm & Thời gian)
  const dateRangeStr = (fromDate && toDate && fromDate === toDate)
    ? `Ngày: ${fromDate}`
    : `Từ ${fromDate || ''} đến ${toDate || ''}`;
  const subText = `NHÓM: ${groupName.toUpperCase()}  •  ${dateRangeStr}  •  ${items.length} CỬA HÀNG`;

  ctx.fillStyle = '#475569';
  ctx.font = 'bold 12.5px Arial, sans-serif';
  ctx.fillText(subText, canvasWidth / 2, headerCardY + 46);

  // ─── 2. Bảng dữ liệu từng cửa hàng ───
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(startX, startTableY, panelWidth, tableHeaderHeight);
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 1;
  ctx.strokeRect(startX, startTableY, panelWidth, tableHeaderHeight);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 12px Arial, sans-serif';
  ctx.textBaseline = 'middle';

  let curColX = startX;
  for (let c = 0; c < colHeaders.length; c++) {
    const colW = colWidths[c];
    const align = colAligns[c];
    ctx.textAlign = align;
    let textX = curColX + (align === 'center' ? colW / 2 : align === 'right' ? colW - 10 : 10);
    ctx.fillText(colHeaders[c], textX, startTableY + tableHeaderHeight / 2);

    if (c < colHeaders.length - 1) {
      ctx.strokeStyle = '#334155';
      ctx.beginPath();
      ctx.moveTo(curColX + colW, startTableY);
      ctx.lineTo(curColX + colW, startTableY + tableHeaderHeight);
      ctx.stroke();
    }
    curColX += colW;
  }

  // Vẽ từng dòng dữ liệu khách hàng
  let curRowY = startTableY + tableHeaderHeight;
  items.forEach((it, idx) => {
    // Màu nền so le
    ctx.fillStyle = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
    ctx.fillRect(startX, curRowY, panelWidth, rowHeight);

    // Viền ngang
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, curRowY + rowHeight);
    ctx.lineTo(startX + panelWidth, curRowY + rowHeight);
    ctx.stroke();

    const stt = String(idx + 1);
    const custName = it.customer?.name || 'Khách hàng';
    const meatAmt = Number(it.totalMeatAmount) || 0;
    const returnAmt = Number(it.totalReturnAmount) || 0;
    const payAmt = Number(it.totalPaymentAmount) || 0;
    const debtAmt = Number(it.finalDebt) || 0;

    const rowValues = hasAnyReturn
      ? [
          stt,
          custName,
          meatAmt > 0 ? `${meatAmt.toLocaleString('vi-VN')} đ` : '-',
          returnAmt > 0 ? `${returnAmt.toLocaleString('vi-VN')} đ` : '-',
          payAmt > 0 ? `${payAmt.toLocaleString('vi-VN')} đ` : '-',
          debtAmt > 0 ? `${debtAmt.toLocaleString('vi-VN')} đ` : '0 đ',
        ]
      : [
          stt,
          custName,
          meatAmt > 0 ? `${meatAmt.toLocaleString('vi-VN')} đ` : '-',
          payAmt > 0 ? `${payAmt.toLocaleString('vi-VN')} đ` : '-',
          debtAmt > 0 ? `${debtAmt.toLocaleString('vi-VN')} đ` : '0 đ',
        ];

    let rowX = startX;
    for (let c = 0; c < rowValues.length; c++) {
      const colW = colWidths[c];
      const align = colAligns[c];
      ctx.textAlign = align;
      let textX = rowX + (align === 'center' ? colW / 2 : align === 'right' ? colW - 10 : 10);

      // Định dạng màu sắc từng cột
      if (c === rowValues.length - 1) {
        ctx.fillStyle = debtAmt > 0 ? '#DC2626' : '#059669';
        ctx.font = 'bold 12.5px Arial, sans-serif';
      } else if (c === 1) {
        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 12.5px Arial, sans-serif';
      } else if (hasAnyReturn && c === 3) {
        ctx.fillStyle = returnAmt > 0 ? '#D97706' : '#94A3B8';
        ctx.font = '12px Arial, sans-serif';
      } else if ((hasAnyReturn && c === 4) || (!hasAnyReturn && c === 3)) {
        ctx.fillStyle = payAmt > 0 ? '#059669' : '#94A3B8';
        ctx.font = '12px Arial, sans-serif';
      } else {
        ctx.fillStyle = (meatAmt > 0 || c === 0) ? '#334155' : '#94A3B8';
        ctx.font = '12px Arial, sans-serif';
      }

      ctx.fillText(rowValues[c], textX, curRowY + rowHeight / 2);

      // Viền dọc giữa các cột
      if (c < rowValues.length - 1) {
        ctx.strokeStyle = '#E2E8F0';
        ctx.beginPath();
        ctx.moveTo(rowX + colW, curRowY);
        ctx.lineTo(rowX + colW, curRowY + rowHeight);
        ctx.stroke();
      }
      rowX += colW;
    }

    curRowY += rowHeight;
  });

  // Viền bao quanh bảng
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1;
  ctx.strokeRect(startX, startTableY, panelWidth, tableHeaderHeight + tableContentHeight);

  // ─── 3. Bảng tổng cộng của cả nhóm (Summary Panel) ───
  let curSummaryY = summaryStartY;
  const summaryColLeftWidth = panelWidth - 210;

  const drawSummaryRow = (label, valueStr, isTotal = false, isDebt = false) => {
    ctx.fillStyle = isDebt ? '#FEF2F2' : (isTotal ? '#F1F5F9' : '#FFFFFF');
    ctx.fillRect(startX, curSummaryY, panelWidth, summaryRowHeight);

    ctx.strokeStyle = isDebt ? '#FCA5A5' : '#CBD5E1';
    ctx.lineWidth = isDebt ? 1.5 : 1;
    ctx.strokeRect(startX, curSummaryY, panelWidth, summaryRowHeight);

    // Vạch ngăn giữa nhãn và số tiền
    ctx.beginPath();
    ctx.moveTo(startX + summaryColLeftWidth, curSummaryY);
    ctx.lineTo(startX + summaryColLeftWidth, curSummaryY + summaryRowHeight);
    ctx.stroke();

    // Nhãn bên trái
    ctx.fillStyle = isDebt ? '#991B1B' : '#334155';
    ctx.font = isDebt ? 'bold 14px Arial, sans-serif' : 'bold 13px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, startX + summaryColLeftWidth - 12, curSummaryY + summaryRowHeight / 2);

    // Số tiền bên phải
    ctx.fillStyle = isDebt ? (groupTotalDebt > 0 ? '#DC2626' : '#059669') : (isTotal ? '#0F172A' : '#059669');
    ctx.font = isDebt ? 'bold 18.5px Arial, sans-serif' : 'bold 14.5px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(valueStr, startX + panelWidth - 12, curSummaryY + summaryRowHeight / 2);

    curSummaryY += summaryRowHeight;
  };

  drawSummaryRow('TỔNG TIỀN HÀNG CẢ NHÓM:', `${groupTotalMeat.toLocaleString('vi-VN')} đ`, true);
  if (hasAnyReturn) {
    drawSummaryRow('TỔNG TIỀN TRẢ HÀNG:', `${groupTotalReturn.toLocaleString('vi-VN')} đ`, false);
  }
  if (groupTotalPayment > 0) {
    drawSummaryRow('TỔNG ĐÃ THANH TOÁN:', `${groupTotalPayment.toLocaleString('vi-VN')} đ`, false);
  }
  drawSummaryRow('TỔNG CÔNG NỢ CỦA NHÓM:', `${groupTotalDebt.toLocaleString('vi-VN')} đ`, true, true);

  // Viền ngoài bảng tổng
  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(startX, summaryStartY, panelWidth, curSummaryY - summaryStartY);

  // ─── 4. Dòng ghi chú chân trang ───
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const exportTimeStr = `${pad(now.getHours())}:${pad(now.getMinutes())} ngày ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;

  ctx.font = 'italic 12px Arial, sans-serif';
  ctx.fillStyle = '#64748B';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`* Bảng tổng hợp tự động bao gồm ${items.length} cửa hàng/khách hàng trong nhóm`, startX, curSummaryY + 16);
  ctx.textAlign = 'right';
  ctx.fillText(`Xuất lúc: ${exportTimeStr}`, startX + panelWidth, curSummaryY + 16);

  const url = canvas.toDataURL('image/png');
  return {
    imageUri: url,
    groupTotalMeat,
    groupTotalReturn,
    groupTotalPayment,
    groupTotalDebt,
  };
};
