// meat-management-fe/src/utils/debtAllocationHelper.js

/**
 * Kiểm tra xem một giao dịch/khoản thanh toán có phải là "Trả hàng" hay không
 */
export const isReturnPayment = (p) => {
  if (!p) return false;
  const trimNote = (p.note || '').trim();
  return (
    trimNote.includes('[Trả lại hàng]') ||
    trimNote.includes('[Trả hàng nhanh]') ||
    trimNote.includes('Trả lại hàng') ||
    trimNote.includes('Trả hàng') ||
    trimNote.includes('Trả lại')
  );
};

/**
 * Helper chuyển ngày Date / ISO String thành key dạng DD/MM/YYYY
 */
export const toDateKey = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  const dd = d.getDate().toString().padStart(2, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

/**
 * Phân tích danh sách các món thịt trả lại từ ghi chú của payment
 */
export const parseReturnItems = (note, defaultAmount) => {
  if (!note) return [{ type: 'RETURN', name: 'TRẢ HÀNG', quantity: null, price: null, amount: defaultAmount }];

  const isNoteLevelImport = /\b(nhập hàng|nhập thịt|nhập kho|nhập lô|mua thịt|mua hàng|nhap hang|nhap thit)\b/i.test(note || '');

  // Loại bỏ các tag hệ thống (trả hàng, nhập hàng, dọn dẹp ảnh cũ...) và tiền tố
  let text = note
    .replace(/[-–—:\s]*\[[^\]]*(?:dọn dẹp|cloudinary|không xem được|ảnh\/video|đã xóa)[^\]]*\]/gi, '')
    .replace(/\[Trả lại hàng\]|\[Trả hàng nhanh\]|\[Trả hàng\]|\[Nhập hàng\]/gi, '')
    .trim();
  text = text.replace(/^(?:Trả hàng nhanh|Trả lại hàng|Trả hàng|Nhập hàng)\s*[:-]?\s*/gi, '').trim();

  if (!text) {
    return [{
      type: 'RETURN',
      name: isNoteLevelImport ? 'NHẬP HÀNG' : 'TRẢ HÀNG',
      quantity: null,
      price: null,
      amount: defaultAmount,
    }];
  }

  // Hàm phụ chuẩn hóa tên món và gắn tiền tố tương ứng NHẬP: hoặc TRẢ:
  const formatReturnItemName = (rawName, isPartImport) => {
    let clean = (rawName || '').trim();
    // 0. Xóa các ghi chú hệ thống trong ngoặc vuông nếu còn sót
    clean = clean.replace(/[-–—:\s]*\[[^\]]*(?:dọn dẹp|cloudinary|không xem được|ảnh\/video|đã xóa)[^\]]*\]/gi, ' ').trim();
    // 1. Xóa số tiền nằm trong ngoặc đơn: ví dụ (1.288.000), (986.400 Đ)
    clean = clean.replace(/\(\s*[\d.,]+\s*[đ₫kKVND]?\s*\)/gi, ' ').trim();
    // 2. Xóa các tiền tố trả hàng / nhập hàng
    clean = clean.replace(/^(TRẢ HÀNG NHANH|TRẢ LẠI HÀNG|TRẢ HÀNG|TRẢ LẠI|TRẢ|NHẬP HÀNG|NHẬP THỊT|NHẬP)\s*[:-]?\s*/gi, ' ').trim();
    // 3. Xóa các hậu tố nhập hàng hoặc số lượng lặp lại ở đuôi
    clean = clean.replace(/[-–—:]*\s*(?:NHẬP HÀNG|NHẬP THỊT|NHẬP TÁI(?:\s*\d+)?|NHẬP GẦU(?:\s*\d+)?|NHẬP\s+[a-zA-ZÀ-ỹ]+(?:\s*\d+)?)\s*$/gi, ' ').trim();
    clean = clean.replace(/[-–—:]*\s*\d+(?:[.,]\d+)?\s*(?:kg|kilo)?\s+[a-zA-ZÀ-ỹ\s()]+\s*$/gi, ' ').trim();
    // 4. Xóa dấu gạch nối hoặc khoảng trắng thừa ở đầu/cuối
    clean = clean.replace(/^[-–—:\s]+|[-–—:\s]+$/g, '').trim().toUpperCase();

    if (isPartImport || isNoteLevelImport) {
      return clean ? `NHẬP: ${clean}` : 'NHẬP HÀNG';
    }
    return clean ? `TRẢ: ${clean}` : 'TRẢ HÀNG';
  };

  // Tách nhiều món nếu phân tách bởi dấu phẩy hoặc dấu chấm phẩy
  const parts = text.split(/[,;\n]\s*(?=[a-zA-Z\d\u00C0-\u1EF9])/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    return [{
      type: 'RETURN',
      name: isNoteLevelImport ? 'NHẬP HÀNG' : 'TRẢ HÀNG',
      quantity: null,
      price: null,
      amount: defaultAmount,
    }];
  }

  const results = [];

  for (let part of parts) {
    part = part.trim();
    if (!part) continue;

    const isPartImport = /\b(nhập hàng|nhập thịt|nhập tái|nhập gầu|nhập kho|nhập lô|mua thịt|mua hàng|nhap hang|nhap thit|nhap)\b/i.test(part) || isNoteLevelImport;

    // 0. Định dạng đầy đủ có nhân đơn giá: 10kg Sườn non x 120k = 1.200.000
    const matchFull = part.match(/^([\d.,]+)\s*(kg|kilo|g|con|miếng)?\s+(.+?)\s*[xX*]\s*([\d.,]+k?)\s*=\s*([\d.,]+)/i);
    if (matchFull) {
      const q = parseFloat(matchFull[1].replace(',', '.'));
      const rawProdName = matchFull[3].trim();
      const pStr = matchFull[4].toLowerCase().replace(',', '.');
      const p = pStr.endsWith('k') ? parseFloat(pStr.replace('k', '')) * 1000 : parseFloat(pStr.replace(/\./g, ''));
      const amt = parseFloat(matchFull[5].replace(/\./g, '').replace(',', '.'));
      results.push({
        type: 'RETURN',
        name: formatReturnItemName(rawProdName, isPartImport),
        quantity: isNaN(q) ? null : q,
        price: isNaN(p) ? null : p,
        amount: isNaN(amt) ? defaultAmount : amt,
      });
      continue;
    }

    // 1. Kiểm tra định dạng chuẩn: <số lượng><đơn vị> <tên thịt> (<thành tiền>)
    // Ví dụ: '1.66kg Bắp giây (630.800)' hoặc '2.61kg Tái (bò) (626.400 đ)'
    const oldFormatRegex = /^(\d+(?:[.,]\d+)?)\s*(?:kg|kilo|g|con|miếng)?\s+(.+?)(?:\s*\(\s*([\d.,]+)[\s\u00a0]*[đ₫kKVND]?\s*\))?(?:\s*[-–—:]\s*(.*))?$/i;
    const oldMatch = part.match(oldFormatRegex);
    if (oldMatch) {
      const tokenAfter = oldMatch[2].trim();
      const startsWithNumber = /^\d+/.test(tokenAfter);
      if (!startsWithNumber) {
        const qty = parseFloat(oldMatch[1].replace(',', '.'));
        const rawProdName = oldMatch[2].trim();
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
    let amtFromParen = null;
    const parenAmtMatch = part.match(/\(\s*([\d.,]+)[\s\u00a0]*[đ₫kKVND]?\s*\)\s*$/i);
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

      const num1 = parseFloat(num1Str.replace(',', '.'));
      const num2 = parseFloat(num2Str);

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

    // 4. Fallback không tách được số: Giữ tên gốc đã làm sạch
    results.push({
      type: 'RETURN',
      name: formatReturnItemName(part, isPartImport),
      quantity: null,
      price: null,
      amount: amtFromParen || (parts.length === 1 ? defaultAmount : 0),
    });
  }

  return results.length > 0 ? results : [{
    type: 'RETURN',
    name: isNoteLevelImport ? 'NHẬP HÀNG' : 'TRẢ HÀNG',
    quantity: null,
    price: null,
    amount: defaultAmount,
  }];
};

/**
 * Thuật toán phân bổ công nợ FIFO chuẩn xác:
 * - Ưu tiên 0: Trả hàng (Return payment) khớp vào các đơn hàng cùng ngày phát sinh trả hàng.
 * - Ưu tiên 1: Thanh toán ghi rõ ngày cụ thể (ví dụ: "Thanh toán nợ ngày 15/07/2026").
 * - Ưu tiên 2: Thanh toán ghi rõ khoảng ngày cụ thể (ví dụ: "Thanh toán nợ từ ngày 01/07/2026 đến ngày 10/07/2026").
 * - Ưu tiên 3: Thanh toán ghi rõ tháng cụ thể (ví dụ: "Thanh toán nợ Tháng 07/2026").
 * - Ưu tiên 4: Phân bổ chung theo nguyên tắc FIFO (First-In, First-Out): tiền trả dồn sẽ tự động cấn trừ các đơn nợ cũ nhất còn thiếu trước.
 *
 * @param {Array} transactions - Toàn bộ danh sách đơn nợ của khách hàng
 * @param {Array} payments - Toàn bộ danh sách các đợt thanh toán của khách hàng
 * @returns {Object} {
 *   remainingDebtMap: { [transId]: number }, // Số tiền còn nợ lại của từng đơn
 *   remainingPayMap: { [payId]: number },   // Số tiền còn dư (chưa phân bổ hết) của từng đợt thanh toán
 *   transAllocations: { [transId]: Array<{ paymentId, date, amount, note, isReturn, payment }> }, // Các khoản thanh toán cấn trừ cho từng đơn
 *   payAllocations: { [payId]: Array<{ transactionId, date, amount, note, transaction }> } // Các đơn nợ được thanh toán bởi từng đợt
 * }
 */
export const allocateDebtFIFO = (transactions = [], payments = []) => {
  const remainingDebtMap = {};
  (transactions || []).forEach((t) => {
    remainingDebtMap[t.id] = parseFloat(t.totalAmount || 0);
  });

  const remainingPayMap = {};
  (payments || []).forEach((p) => {
    remainingPayMap[p.id] = parseFloat(p.amount || 0);
  });

  const transAllocations = {}; // t.id -> array of { paymentId, date, amount, note, isReturn, payment }
  const payAllocations = {};   // p.id -> array of { transactionId, date, amount, note, transaction }

  const recordAllocation = (t, p, allocAmt) => {
    if (allocAmt <= 0) return;
    remainingDebtMap[t.id] = Math.max(0, (remainingDebtMap[t.id] || 0) - allocAmt);
    remainingPayMap[p.id] = Math.max(0, (remainingPayMap[p.id] || 0) - allocAmt);

    if (!transAllocations[t.id]) transAllocations[t.id] = [];
    transAllocations[t.id].push({
      paymentId: p.id,
      date: p.paidAt,
      amount: allocAmt,
      note: p.note,
      isReturn: isReturnPayment(p),
      payment: p,
    });

    if (!payAllocations[p.id]) payAllocations[p.id] = [];
    payAllocations[p.id].push({
      transactionId: t.id,
      date: t.date,
      amount: allocAmt,
      note: t.note,
      transaction: t,
    });
  };

  // 0. Phân bổ các khoản Trả hàng (Return Goods) trực tiếp vào đơn nợ của chính ngày phát sinh trả hàng
  (payments || []).forEach((p) => {
    if (isReturnPayment(p)) {
      const returnDateKey = toDateKey(p.paidAt);
      const dayTransactions = (transactions || [])
        .filter((t) => toDateKey(t.date) === returnDateKey)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      dayTransactions.forEach((t) => {
        const debtAmt = remainingDebtMap[t.id] || 0;
        const payAmt = remainingPayMap[p.id] || 0;
        if (debtAmt > 0 && payAmt > 0) {
          const allocAmt = Math.min(debtAmt, payAmt);
          recordAllocation(t, p, allocAmt);
        }
      });
    }
  });

  // 1. Phân bổ theo ngày cụ thể (Specific Date matching)
  (payments || []).forEach((p) => {
    const trimNote = (p.note || '').trim();
    const dateMatch = trimNote.match(/^Thanh toán nợ ngày (\d{1,2})\/(\d{1,2})\/(\d{4})/i);
    if (dateMatch) {
      const dd = dateMatch[1].padStart(2, '0');
      const mm = dateMatch[2].padStart(2, '0');
      const yyyy = dateMatch[3];
      const dateKey = `${dd}/${mm}/${yyyy}`;
      const dayTransactions = (transactions || [])
        .filter((t) => toDateKey(t.date) === dateKey)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      dayTransactions.forEach((t) => {
        const debtAmt = remainingDebtMap[t.id] || 0;
        const payAmt = remainingPayMap[p.id] || 0;
        if (debtAmt > 0 && payAmt > 0) {
          const allocAmt = Math.min(debtAmt, payAmt);
          recordAllocation(t, p, allocAmt);
        }
      });
    }
  });

  // 2. Phân bổ theo cụm ngày / khoảng ngày cụ thể (Specific Date Range matching)
  (payments || []).forEach((p) => {
    const trimNote = (p.note || '').trim();
    const rangeMatch = trimNote.match(/Thanh toán nợ từ ngày (\d{1,2})\/(\d{1,2})\/(\d{4}) đến ngày (\d{1,2})\/(\d{1,2})\/(\d{4})/i);
    if (rangeMatch) {
      const fromParts = [rangeMatch[1], rangeMatch[2], rangeMatch[3]].map(Number);
      const toParts = [rangeMatch[4], rangeMatch[5], rangeMatch[6]].map(Number);
      const fromDateObj = new Date(fromParts[2], fromParts[1] - 1, fromParts[0], 0, 0, 0, 0);
      const toDateObj = new Date(toParts[2], toParts[1] - 1, toParts[0], 23, 59, 59, 999);

      const rangeTransactions = (transactions || [])
        .filter((t) => {
          const tDate = new Date(t.date);
          return tDate >= fromDateObj && tDate <= toDateObj;
        })
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      rangeTransactions.forEach((t) => {
        const debtAmt = remainingDebtMap[t.id] || 0;
        const payAmt = remainingPayMap[p.id] || 0;
        if (debtAmt > 0 && payAmt > 0) {
          const allocAmt = Math.min(debtAmt, payAmt);
          recordAllocation(t, p, allocAmt);
        }
      });
    }
  });

  // 3. Phân bổ theo tháng cụ thể (Specific Month matching)
  (payments || []).forEach((p) => {
    const trimNote = (p.note || '').trim();
    const monthMatch = trimNote.match(/^Thanh toán (?:nợ|hóa đơn) [Tt]háng (\d{1,2})\/(\d{4})/i) ||
                       trimNote.match(/Thanh toán (?:nợ|hóa đơn) [Tt]háng (\d{1,2})\/(\d{4})/i);
    if (monthMatch) {
      const mm = monthMatch[1].padStart(2, '0');
      const yyyy = monthMatch[2];
      const monthKey = `${mm}/${yyyy}`;
      const monthTransactions = (transactions || [])
        .filter((t) => {
          const d = new Date(t.date);
          const tMm = (d.getMonth() + 1).toString().padStart(2, '0');
          const tYyyy = d.getFullYear().toString();
          return `${tMm}/${tYyyy}` === monthKey;
        })
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      monthTransactions.forEach((t) => {
        const debtAmt = remainingDebtMap[t.id] || 0;
        const payAmt = remainingPayMap[p.id] || 0;
        if (debtAmt > 0 && payAmt > 0) {
          const allocAmt = Math.min(debtAmt, payAmt);
          recordAllocation(t, p, allocAmt);
        }
      });
    }
  });

  // 4. Phân bổ chung FIFO (cho phần còn dư của thanh toán cụ thể và thanh toán chung không ghi chú)
  // Sắp xếp tăng dần theo thời gian: trả các hóa đơn cũ nhất trước
  const sortedPayments = [...(payments || [])].sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt));
  const sortedTransactions = [...(transactions || [])].sort((a, b) => new Date(a.date) - new Date(b.date));

  sortedPayments.forEach((p) => {
    sortedTransactions.forEach((t) => {
      const debtAmt = remainingDebtMap[t.id] || 0;
      const payAmt = remainingPayMap[p.id] || 0;
      if (debtAmt > 0 && payAmt > 0) {
        const allocAmt = Math.min(debtAmt, payAmt);
        recordAllocation(t, p, allocAmt);
      }
    });
  });

  return {
    remainingDebtMap,
    remainingPayMap,
    transAllocations,
    payAllocations,
  };
};

/**
 * Xây dựng danh sách các nhóm ngày công nợ phục vụ xuất file/ảnh theo khoảng thời gian:
 * - Áp dụng triệt để phân bổ FIFO: Tiền thanh toán chỉ được tính vào ngày/tháng nếu nó thực sự cấn trừ cho các đơn nợ của ngày/tháng đó.
 * - Tiền trả dồn cho các tháng cũ sẽ được đưa về đúng các tháng cũ được khấu trừ, tuyệt đối không trừ lẹm vào tháng hiện tại.
 */
export const buildExportDayGroupsWithFIFO = ({
  transList = [],
  payList = [],
  fromD,
  toD,
  monthStr,
  getLunarDateString = () => '',
  includePaymentInDailyRows = false, // Mặc định không hiển thị dòng Đã thu lặp lại dưới từng ngày, chỉ tổng hợp ở bảng thanh toán
}) => {
  // 1. Chạy thuật toán phân bổ FIFO trên TOÀN BỘ lịch sử giao dịch & thanh toán của khách hàng
  const { remainingPayMap, transAllocations } = allocateDebtFIFO(transList, payList);

  // 2. Lọc các giao dịch phát sinh trong khoảng thời gian đang lọc
  const filteredTrans = (transList || []).filter((t) => {
    const d = new Date(t.date);
    if (isNaN(d.getTime())) return false;
    if (fromD && toD) {
      return d >= fromD && d <= toD;
    }
    return true;
  });

  const dayMap = {};
  let totalMeatAmount = 0;
  let totalReturnAmount = 0;
  let totalPaymentAmount = 0;

  // Tập hợp danh sách các ngày thanh toán đã đóng góp vào tổng tiền đã thu trong kỳ lọc
  const paymentDatesSet = new Set();

  // Gom các khoản thanh toán được phân bổ theo ngày nợ (dateKey)
  // Map: dateKey -> Map<paymentId, { amount, date, isReturn, note }>
  const dayPaymentAllocMap = new Map();

  // 3. Xử lý các giao dịch mua hàng trong khoảng lọc
  filteredTrans.forEach((t) => {
    const d = new Date(t.date);
    const dayNum = d.getDate().toString().padStart(2, '0');
    const monthNum = (d.getMonth() + 1).toString().padStart(2, '0');
    const dateKey = `${dayNum}/${monthNum}/${d.getFullYear()}`;
    const displayDate = `${dayNum}/${monthNum}`;
    const displayLunarDate = getLunarDateString(d);

    if (!dayMap[dateKey]) {
      dayMap[dateKey] = {
        date: t.date,
        dateKey,
        displayDate,
        displayLunarDate,
        entries: [],
      };
    }

    const amt = parseFloat(t.totalAmount || 0);

    if (t.items && t.items.length > 0) {
      t.items.forEach((item) => {
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

    // Thu thập các khoản thanh toán được phân bổ cấn trừ cho đơn nợ này
    const allocs = transAllocations[t.id] || [];
    allocs.forEach((alloc) => {
      if (!dayPaymentAllocMap.has(dateKey)) {
        dayPaymentAllocMap.set(dateKey, new Map());
      }
      const pMap = dayPaymentAllocMap.get(dateKey);
      if (!pMap.has(alloc.paymentId)) {
        pMap.set(alloc.paymentId, {
          paymentId: alloc.paymentId,
          amount: 0,
          date: alloc.date,
          isReturn: alloc.isReturn,
          note: alloc.note,
        });
      }
      pMap.get(alloc.paymentId).amount += alloc.amount;
    });
  });

  // 4. Đưa các khoản thanh toán / trả hàng đã được phân bổ vào từng ngày nợ tương ứng
  dayPaymentAllocMap.forEach((pMap, dateKey) => {
    if (!dayMap[dateKey]) return;

    pMap.forEach((pAlloc) => {
      const amt = pAlloc.amount;
      if (amt <= 0) return;

      if (pAlloc.isReturn) {
        totalReturnAmount += amt;
        const returnItems = parseReturnItems(pAlloc.note, amt);
        returnItems.forEach((ritem) => {
          dayMap[dateKey].entries.push(ritem);
        });
      } else {
        totalPaymentAmount += amt;
        const payDateKey = toDateKey(pAlloc.date);
        if (payDateKey) {
          paymentDatesSet.add(payDateKey);
        }

        // Chỉ chèn dòng ĐÃ THU dưới từng ngày nếu includePaymentInDailyRows = true
        if (includePaymentInDailyRows) {
          let payName = 'ĐÃ THU';
          if (payDateKey && payDateKey !== dateKey) {
            payName = `ĐÃ THU (${payDateKey.substring(0, 5)})`;
          }

          dayMap[dateKey].entries.push({
            type: 'PAYMENT',
            name: payName,
            quantity: null,
            price: null,
            amount: amt,
          });
        }
      }
    });
  });

  // 5. Kiểm tra các khoản thanh toán phát sinh trong khoảng lọc có tiền trả dư / trả trước (Prepayment)
  // Nếu khách trả tiền trong kỳ này mà không còn đơn nợ nào để cấn trừ (dư tiền), ghi nhận tổng tiền thu
  (payList || []).forEach((p) => {
    const pDate = new Date(p.paidAt);
    if (isNaN(pDate.getTime())) return;
    const inRange = (!fromD || !toD) || (pDate >= fromD && pDate <= toD);

    if (inRange) {
      const surplus = remainingPayMap[p.id] || 0;
      if (surplus > 0) {
        const isReturn = isReturnPayment(p);
        const dayNum = pDate.getDate().toString().padStart(2, '0');
        const monthNum = (pDate.getMonth() + 1).toString().padStart(2, '0');
        const dateKey = `${dayNum}/${monthNum}/${pDate.getFullYear()}`;
        const displayDate = `${dayNum}/${monthNum}`;
        const displayLunarDate = getLunarDateString(pDate);

        if (isReturn) {
          totalReturnAmount += surplus;
          if (!dayMap[dateKey]) {
            dayMap[dateKey] = {
              date: p.paidAt,
              dateKey,
              displayDate,
              displayLunarDate,
              entries: [],
            };
          }
          const returnItems = parseReturnItems(p.note, surplus);
          returnItems.forEach((ritem) => {
            dayMap[dateKey].entries.push(ritem);
          });
        } else {
          totalPaymentAmount += surplus;
          const payDateKey = toDateKey(p.paidAt);
          if (payDateKey) {
            paymentDatesSet.add(payDateKey);
          }

          if (includePaymentInDailyRows) {
            if (!dayMap[dateKey]) {
              dayMap[dateKey] = {
                date: p.paidAt,
                dateKey,
                displayDate,
                displayLunarDate,
                entries: [],
              };
            }
            dayMap[dateKey].entries.push({
              type: 'PAYMENT',
              name: 'ĐÃ THU (TRẢ DƯ)',
              quantity: null,
              price: null,
              amount: surplus,
            });
          }
        }
      }
    }
  });

  const activeDays = Object.values(dayMap).filter((d) => d.entries && d.entries.length > 0);
  const sortedDays = activeDays.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Chuẩn hóa thứ tự hiển thị các dòng trong từng ngày: DELIVERY -> RETURN -> TỔNG (nếu nhiều món) -> PAYMENT
  sortedDays.forEach((day) => {
    const deliveries = (day.entries || []).filter((e) => e.type === 'DELIVERY');
    const returns = (day.entries || []).filter((e) => e.type === 'RETURN');
    const payments = (day.entries || []).filter((e) => e.type === 'PAYMENT');
    const others = (day.entries || []).filter(
      (e) => e.type !== 'DELIVERY' && e.type !== 'RETURN' && e.type !== 'PAYMENT' && e.type !== 'DAY_TOTAL'
    );

    const newEntries = [...deliveries, ...returns];

    if (deliveries.length > 1 || (deliveries.length >= 1 && returns.length > 0)) {
      const dayMeatTotal = deliveries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
      const dayReturnTotal = returns.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
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

  // 6. Tính toán công nợ thực tế của cả tháng mục tiêu (nếu đang lọc theo tháng)
  let wholeMonthMeat = 0;
  let wholeMonthReturn = 0;
  let wholeMonthPayment = 0;

  if (monthStr && monthStr.includes('/')) {
    const [targetM, targetY] = monthStr.split('/').map(Number);

    // Tính tổng tiền thịt cả tháng
    (transList || []).forEach((t) => {
      const d = new Date(t.date);
      if (!isNaN(d.getTime()) && (d.getMonth() + 1) === targetM && d.getFullYear() === targetY) {
        if (t.items && t.items.length > 0) {
          t.items.forEach((it) => {
            wholeMonthMeat += parseFloat(it.amount) || Math.round((parseFloat(it.quantity) || 0) * (parseFloat(it.price) || 0));
          });
        } else {
          wholeMonthMeat += parseFloat(t.totalAmount || 0);
        }

        // Tính các khoản thanh toán được phân bổ cấn trừ cho các đơn trong tháng này
        const allocs = transAllocations[t.id] || [];
        allocs.forEach((alloc) => {
          if (alloc.isReturn) {
            wholeMonthReturn += alloc.amount;
          } else {
            wholeMonthPayment += alloc.amount;
          }
        });
      }
    });

    // Thêm các khoản tiền trả dư (prepayment) phát sinh trong tháng này
    (payList || []).forEach((p) => {
      const pDate = new Date(p.paidAt);
      if (!isNaN(pDate.getTime()) && (pDate.getMonth() + 1) === targetM && pDate.getFullYear() === targetY) {
        const surplus = remainingPayMap[p.id] || 0;
        if (surplus > 0) {
          if (isReturnPayment(p)) {
            wholeMonthReturn += surplus;
          } else {
            wholeMonthPayment += surplus;
          }
        }
      }
    });
  } else {
    wholeMonthMeat = totalMeatAmount;
    wholeMonthReturn = totalReturnAmount;
    wholeMonthPayment = totalPaymentAmount;
  }

  const wholeMonthDebt = Math.max(0, wholeMonthMeat - wholeMonthReturn - wholeMonthPayment);
  const finalDebt = Math.max(0, totalMeatAmount - totalReturnAmount - totalPaymentAmount);

  // Sắp xếp các ngày thanh toán theo trình tự thời gian
  const sortedPayDates = Array.from(paymentDatesSet).sort((a, b) => {
    const [d1, m1, y1] = a.split('/').map(Number);
    const [d2, m2, y2] = b.split('/').map(Number);
    return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
  });

  const formatPayDateForDisplay = (dStr) => {
    const [d, m, y] = dStr.split('/');
    if (fromD && toD && fromD.getFullYear() !== Number(y)) {
      return dStr; // Nếu khác năm thì hiện đủ DD/MM/YYYY
    }
    return `${d}/${m}`;
  };

  let paymentSummaryText = '';
  if (sortedPayDates.length === 1) {
    paymentSummaryText = `Khoản thu ngày ${formatPayDateForDisplay(sortedPayDates[0])}`;
  } else if (sortedPayDates.length > 1 && sortedPayDates.length <= 3) {
    paymentSummaryText = `Khoản thu ngày ${sortedPayDates.map(formatPayDateForDisplay).join(', ')}`;
  } else if (sortedPayDates.length > 3) {
    paymentSummaryText = `Khoản thu ngày ${sortedPayDates.slice(0, 3).map(formatPayDateForDisplay).join(', ')}...`;
  }

  return {
    sortedDays,
    totalMeatAmount,
    totalReturnAmount,
    totalPaymentAmount,
    finalDebt,
    wholeMonthMeat,
    wholeMonthReturn,
    wholeMonthPayment,
    wholeMonthDebt,
    paymentDates: sortedPayDates,
    paymentSummaryText,
  };
};
