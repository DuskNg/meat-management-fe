// meat-management-fe/src/utils/debtExportAuditHelper.js

/**
 * Chuẩn hóa tên loại thịt để so sánh:
 * - Chuyển chữ thường, xóa khoảng trắng thừa ở 2 đầu và giữa các từ.
 * - Loại bỏ các ký tự dấu ngoặc thừa nếu cần hoặc giữ nguyên để khớp chính xác như "TÁI (BÒ)".
 */
export const normalizeMeatName = (name) => {
  if (!name || typeof name !== 'string') return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
};

/**
 * Kiểm tra xem 2 số lượng kg có bị coi là trùng lặp hay không:
 * - Bị coi là trùng lặp nếu độ chênh lệch tuyệt đối < 0.2 kg (ví dụ 9.7kg và 9.7kg -> lệch 0 < 0.2; 9.7kg và 9.8kg -> lệch 0.1 < 0.2).
 */
export const isQuantityDuplicate = (qty1, qty2) => {
  const q1 = parseFloat(qty1);
  const q2 = parseFloat(qty2);
  if (isNaN(q1) || isNaN(q2) || q1 <= 0 || q2 <= 0) return false;
  // Dùng 0.2001 để bao quát việc làm tròn số thực trong JavaScript
  return Math.abs(q1 - q2) < 0.2001;
};

/**
 * 1. Kiểm tra các mục giao thịt bị trùng lặp trong từng ngày:
 * - Đầu vào: danh sách các ngày `days` (mỗi ngày chứa `entries: [{ type, name, quantity, price, amount }]`).
 * - Chỉ kiểm tra các dòng giao hàng (`type === 'DELIVERY'`) có số kg hợp lệ và không phải các dòng tiền hàng chung.
 * - Phát hiện nếu trong cùng 1 ngày có từ 2 dòng trở lên cùng tên thịt và số kg lệch < 0.2kg.
 * - Trả về: danh sách các nhóm bị trùng lặp theo từng ngày.
 */
export const detectDuplicateDayItems = (days = []) => {
  const duplicateResults = [];

  (days || []).forEach((day) => {
    const rawEntries = day.entries || [];
    // Lọc các món giao hàng thực tế có số kg
    const deliveryItems = rawEntries.filter((e) => {
      if (e.type !== 'DELIVERY') return false;
      const q = parseFloat(e.quantity);
      if (isNaN(q) || q <= 0) return false;
      const cleanName = (e.name || '').trim().toUpperCase();
      if (cleanName === 'TIỀN HÀNG' || cleanName.startsWith('TIỀN')) return false;
      return true;
    });

    if (deliveryItems.length < 2) return;

    const usedIndices = new Set();
    const dayGroups = [];

    for (let i = 0; i < deliveryItems.length; i++) {
      if (usedIndices.has(i)) continue;

      const itemA = deliveryItems[i];
      const normNameA = normalizeMeatName(itemA.name);
      const group = [itemA];

      for (let j = i + 1; j < deliveryItems.length; j++) {
        if (usedIndices.has(j)) continue;

        const itemB = deliveryItems[j];
        const normNameB = normalizeMeatName(itemB.name);

        // Cùng tên thịt và số kg lệch < 0.2kg
        if (normNameA === normNameB && isQuantityDuplicate(itemA.quantity, itemB.quantity)) {
          group.push(itemB);
          usedIndices.add(j);
        }
      }

      if (group.length > 1) {
        usedIndices.add(i);
        dayGroups.push({
          productName: itemA.name,
          items: group,
          quantities: group.map((it) => parseFloat(it.quantity)),
        });
      }
    }

    if (dayGroups.length > 0) {
      duplicateResults.push({
        dateKey: day.dateKey,
        displayDate: day.displayDate || (day.dateKey ? day.dateKey.substring(0, 5) : ''),
        displayLunarDate: day.displayLunarDate || '',
        groups: dayGroups,
      });
    }
  });

  return duplicateResults;
};

/**
 * Helper: Kiểm tra xem khoảng thời gian hiện tại có phải là lọc trọn vẹn 1 tháng hay không.
 */
export const isFilteringByFullMonth = ({ activeTab, fromDate, toDate, selectedMonth }) => {
  // Nếu đang ở tab tháng
  if (activeTab === 'month' && selectedMonth && selectedMonth.includes('/')) {
    return true;
  }

  // Nếu lọc theo khoảng ngày từ ngày 1 đến ngày cuối cùng của tháng
  if (fromDate && toDate) {
    const fromParts = fromDate.split('/').map(Number);
    const toParts = toDate.split('/').map(Number);
    if (fromParts.length === 3 && toParts.length === 3) {
      const [d1, m1, y1] = fromParts;
      const [d2, m2, y2] = toParts;
      if (m1 === m2 && y1 === y2 && d1 === 1) {
        const daysInM = new Date(y1, m1, 0).getDate();
        if (d2 === daysInM) {
          return true;
        }
      }
    }
  }

  return false;
};

/**
 * Helper: Trích xuất tháng và năm đang lọc dạng { month: MM, year: YYYY, monthStr: 'MM/YYYY' }.
 */
export const extractTargetMonthYear = ({ activeTab, fromDate, selectedMonth }) => {
  if (activeTab === 'month' && selectedMonth && selectedMonth.includes('/')) {
    const [m, y] = selectedMonth.split('/').map(Number);
    return {
      month: m,
      year: y,
      monthStr: `${m.toString().padStart(2, '0')}/${y}`,
    };
  }

  if (fromDate && fromDate.includes('/')) {
    const parts = fromDate.split('/').map(Number);
    if (parts.length === 3) {
      const [, m, y] = parts;
      return {
        month: m,
        year: y,
        monthStr: `${m.toString().padStart(2, '0')}/${y}`,
      };
    }
  }

  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  return {
    month: m,
    year: y,
    monthStr: `${m.toString().padStart(2, '0')}/${y}`,
  };
};

/**
 * 2. Kiểm tra các ngày không có lịch / đơn hàng trong tháng:
 * - Chỉ áp dụng cho dạng lọc theo tháng.
 * - Chỉ cảnh báo đối với khách hàng / nhà hàng đặt hàng thường xuyên (> 15 lần/tháng).
 * - Không liệt kê các ngày trong tương lai chưa tới.
 */
export const detectMissingScheduleDays = ({
  activeTab,
  fromDate,
  toDate,
  selectedMonth,
  isExportMonth,
  transactions = [],
  days = [],
}) => {
  const isMonthFilter = isExportMonth || isFilteringByFullMonth({ activeTab, fromDate, toDate, selectedMonth });

  if (!isMonthFilter) {
    return {
      isMonthFilter: false,
      isFrequentCustomer: false,
      orderCount: 0,
      missingDays: [],
      targetMonthStr: '',
    };
  }

  const { month, year, monthStr } = extractTargetMonthYear({ activeTab, fromDate, selectedMonth });

  // Gom các giao dịch giao hàng trong tháng mục tiêu
  const monthTransactions = (transactions || []).filter((t) => {
    if (!t.date) return false;
    const d = new Date(t.date);
    if (isNaN(d.getTime())) return false;
    const tMonth = d.getMonth() + 1;
    const tYear = d.getFullYear();
    return tMonth === month && tYear === year;
  });

  // Tập hợp các ngày có đơn hàng giao trong tháng
  const deliveryDatesSet = new Set();

  monthTransactions.forEach((t) => {
    const d = new Date(t.date);
    const dd = d.getDate().toString().padStart(2, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    deliveryDatesSet.add(`${dd}/${mm}/${d.getFullYear()}`);
  });

  // Bổ sung từ danh sách ngày nếu có entries DELIVERY
  (days || []).forEach((day) => {
    const hasDelivery = (day.entries || []).some((e) => e.type === 'DELIVERY');
    if (hasDelivery && day.dateKey) {
      const parts = day.dateKey.split('/');
      if (parts.length === 3 && Number(parts[1]) === month && Number(parts[2]) === year) {
        deliveryDatesSet.add(day.dateKey);
      }
    }
  });

  // Số lần đặt hàng trong tháng (số ngày có đơn hoặc số giao dịch)
  const deliveryDaysCount = deliveryDatesSet.size;
  const transactionCount = monthTransactions.length;
  const orderCount = Math.max(deliveryDaysCount, transactionCount);

  // Điều kiện: Nhà hàng đặt hàng thường xuyên (trên 15 lần 1 tháng)
  const isFrequentCustomer = orderCount > 15;

  if (!isFrequentCustomer) {
    return {
      isMonthFilter: true,
      isFrequentCustomer: false,
      orderCount,
      missingDays: [],
      targetMonthStr: monthStr,
    };
  }

  // Tính các ngày không có đơn hàng từ đầu tháng đến cuối tháng (hoặc đến ngày hiện tại nếu là tháng này)
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const isCurrentMonth = month === today.getMonth() + 1 && year === today.getFullYear();
  const maxDay = isCurrentMonth ? Math.min(daysInMonth, today.getDate()) : daysInMonth;

  const missingDays = [];
  const mStr = month.toString().padStart(2, '0');

  for (let dayNum = 1; dayNum <= maxDay; dayNum++) {
    const dStr = dayNum.toString().padStart(2, '0');
    const fullDateKey = `${dStr}/${mStr}/${year}`;
    if (!deliveryDatesSet.has(fullDateKey)) {
      missingDays.push(`${dStr}/${mStr}`);
    }
  }

  return {
    isMonthFilter: true,
    isFrequentCustomer: true,
    orderCount,
    missingDays,
    targetMonthStr: monthStr,
  };
};

/**
 * 3. Tạo nội dung cảnh báo hiển thị trong PopupModal:
 * - Định dạng chuẩn Markdown tương thích tốt với renderStructuredMessage của PopupModal.
 */
export const buildAuditWarningMessage = ({ duplicateGroups = [], missingScheduleInfo = {} }) => {
  const sections = [];

  // Phần 1: Cảnh báo trùng lặp đơn hàng trong ngày
  if (duplicateGroups.length > 0) {
    const dupLines = [];
    dupLines.push('📌 CÁC MỤC NGHI TRÙNG LẶP TRONG CÙNG MỘT NGÀY:');

    duplicateGroups.forEach((dayGroup) => {
      dayGroup.groups.forEach((g) => {
        const qtyListStr = g.quantities.map((q) => `${q}kg`).join(' và ');
        dupLines.push(`• **Ngày ${dayGroup.displayDate}**: Có ${g.items.length} dòng **${g.productName}** (${qtyListStr})`);
      });
    });

    dupLines.push('(Hệ thống phát hiện trùng tên thịt và số kg bằng nhau hoặc lệch < 0.2kg)');
    sections.push(dupLines.join('\n'));
  }

  // Phần 2: Cảnh báo ngày thiếu lịch trong tháng (đối với khách hàng đặt thường xuyên > 15 lần/tháng)
  if (missingScheduleInfo.isFrequentCustomer && missingScheduleInfo.missingDays && missingScheduleInfo.missingDays.length > 0) {
    const missLines = [];
    const count = missingScheduleInfo.missingDays.length;
    missLines.push(`📌 CÁC NGÀY KHÔNG CÓ LỊCH / ĐƠN HÀNG TRONG THÁNG ${missingScheduleInfo.targetMonthStr}:`);
    missLines.push(`• Khách hàng đặt thường xuyên (**${missingScheduleInfo.orderCount} lần/tháng**), phát hiện **${count} ngày** không có đơn:`);
    missLines.push(`  ${missingScheduleInfo.missingDays.join(', ')}`);
    missLines.push('(Vui lòng kiểm tra lại xem có sót đơn hàng của các ngày này không)');
    sections.push(missLines.join('\n'));
  }

  // Phần footer: Câu hỏi xác nhận
  sections.push('Bạn có chắc chắn muốn tiếp tục tải ảnh bảng kê này không?');

  return sections.join('\n\n');
};

/**
 * 4. Hàm tổng hợp kiểm tra kiểm toán trước khi xuất / tải ảnh:
 * - Trả về object kết quả:
 *   hasWarning: boolean (có cảnh báo cần xác nhận hay không)
 *   warningMessage: string (nội dung thông báo)
 *   duplicateGroups: mảng các ngày bị trùng
 *   missingScheduleInfo: thông tin ngày thiếu lịch
 */
export const auditExportDebtData = ({
  days = [],
  transactions = [],
  activeTab = 'month',
  fromDate = '',
  toDate = '',
  selectedMonth = '',
  isExportMonth = false,
}) => {
  // 1. Kiểm tra trùng lặp
  const duplicateGroups = detectDuplicateDayItems(days);

  // 2. Kiểm tra ngày thiếu lịch
  const missingScheduleInfo = detectMissingScheduleDays({
    activeTab,
    fromDate,
    toDate,
    selectedMonth,
    isExportMonth,
    transactions,
    days,
  });

  const hasDuplicates = duplicateGroups.length > 0;
  const hasMissingDays =
    missingScheduleInfo.isFrequentCustomer &&
    missingScheduleInfo.missingDays &&
    missingScheduleInfo.missingDays.length > 0;

  const hasWarning = hasDuplicates || hasMissingDays;

  let warningMessage = '';
  if (hasWarning) {
    warningMessage = buildAuditWarningMessage({
      duplicateGroups,
      missingScheduleInfo,
    });
  }

  return {
    hasWarning,
    hasDuplicates,
    hasMissingDays,
    warningMessage,
    duplicateGroups,
    missingScheduleInfo,
  };
};

/**
 * 5. Kiểm tra ngầm toàn cục danh sách các giao dịch (Global Background Audit):
 * - Rà soát toàn bộ các đơn nợ phát sinh theo từng khách hàng và từng ngày.
 * - Phát hiện nếu một khách hàng trong cùng 1 ngày có từ 2 dòng thịt cùng tên và số kg lệch < 0.2kg
 *   (kể cả nằm trong cùng 1 đơn nợ hoặc nằm ở 2 đơn nợ khác nhau được tạo trong ngày).
 * - targetDateKeys: mảng ngày DD/MM/YYYY cần lọc ưu tiên (nếu truyền vào), hoặc mặc định kiểm tra các ngày gần nhất (trong vòng 7 ngày gần đây).
 * - Trả về: danh sách các khách hàng có đơn nghi trùng lặp.
 */
export const auditGlobalTransactionsForDuplicates = ({
  transactions = [],
  customers = [],
  targetDateKeys = null,
}) => {
  if (!transactions || transactions.length === 0) return [];

  // Tạo map tra cứu thông tin khách hàng
  const customerMap = new Map();
  (customers || []).forEach((c) => {
    if (c && c.id) {
      customerMap.set(c.id, c);
    }
  });

  // Gom các mục giao hàng theo key: `${customerId}__${dateKey}`
  const custDayMap = new Map();

  // Xác định phạm vi ngày cần kiểm tra
  const filterDateSet = targetDateKeys && Array.isArray(targetDateKeys) && targetDateKeys.length > 0
    ? new Set(targetDateKeys)
    : null;

  // Nếu không truyền targetDateKeys, giới hạn kiểm tra trong vòng 7 ngày gần nhất để tối ưu hiệu năng
  const now = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(now.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  transactions.forEach((t) => {
    if (!t.date || !t.customerId) return;
    const d = new Date(t.date);
    if (isNaN(d.getTime())) return;

    const dd = d.getDate().toString().padStart(2, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    const dateKey = `${dd}/${mm}/${yyyy}`;
    const displayDate = `${dd}/${mm}`;

    if (filterDateSet) {
      if (!filterDateSet.has(dateKey)) return;
    } else {
      if (d < sevenDaysAgo) return;
    }

    const mapKey = `${t.customerId}__${dateKey}`;
    if (!custDayMap.has(mapKey)) {
      custDayMap.set(mapKey, {
        customerId: t.customerId,
        dateKey,
        displayDate,
        entries: [],
      });
    }

    const currentEntryObj = custDayMap.get(mapKey);

    // Trích xuất các items từ transaction
    if (t.items && Array.isArray(t.items) && t.items.length > 0) {
      t.items.forEach((item) => {
        const q = parseFloat(item.quantity);
        const p = parseFloat(item.price);
        const rawName = item.product?.name || item.productName || item.name || '';
        const cleanName = rawName.trim().toUpperCase();

        if (cleanName === 'TIỀN HÀNG' || cleanName.startsWith('TIỀN') || t.note === 'Ghi nợ nhanh') {
          return;
        }

        if (!isNaN(q) && q > 0) {
          currentEntryObj.entries.push({
            type: 'DELIVERY',
            name: rawName,
            quantity: q,
            price: isNaN(p) ? null : p,
            amount: parseFloat(item.amount) || Math.round(q * (p || 0)),
            transactionId: t.id,
          });
        }
      });
    }
  });

  // Chạy logic phát hiện trùng lặp cho từng khách trong từng ngày
  const duplicateResults = [];

  custDayMap.forEach((dayData) => {
    if (dayData.entries.length < 2) return;

    // Giả lập cấu trúc ngày cho detectDuplicateDayItems
    const dayMock = {
      dateKey: dayData.dateKey,
      displayDate: dayData.displayDate,
      entries: dayData.entries,
    };

    const dayDups = detectDuplicateDayItems([dayMock]);
    if (dayDups && dayDups.length > 0) {
      const custObj = customerMap.get(dayData.customerId) || {};
      duplicateResults.push({
        customerId: dayData.customerId,
        customerName: custObj.name || tCustomerNameFallback(dayData.entries) || 'Khách hàng',
        customerPhone: custObj.phone || '',
        customer: custObj,
        dateKey: dayData.dateKey,
        displayDate: dayData.displayDate,
        groups: dayDups[0].groups,
      });
    }
  });

  return duplicateResults;
};

// Helper phụ lấy tên khách hàng nếu có trong transaction items
const tCustomerNameFallback = (entries) => {
  return '';
};

/**
 * 6. Tạo chuỗi thông báo pop-up toàn cục khi phát hiện đơn trùng:
 */
export const buildGlobalAuditWarningMessage = (duplicateResults = []) => {
  // Đảm bảo dữ liệu đầu vào là mảng hợp lệ, chống lỗi t.forEach is not a function
  if (!Array.isArray(duplicateResults) || duplicateResults.length === 0) return '';

  const sections = [];
  sections.push('⚠️ PHÁT HIỆN TRÙNG LẶP ĐƠN HÀNG TRONG NGÀY:');
  sections.push(
    `Hệ thống kiểm tra ngầm và phát hiện **${duplicateResults.length} khách hàng** có các dòng thịt nghi ngờ bị nhập trùng (cùng tên thịt và số kg lệch < 0.2kg):`
  );

  duplicateResults.forEach((res) => {
    const custLines = [];
    custLines.push(`📌 Khách hàng: **${res.customerName}** (Ngày ${res.displayDate})`);
    res.groups.forEach((g) => {
      const qtyListStr = g.quantities.map((q) => `${q}kg`).join(' và ');
      custLines.push(`• Trùng ${g.items.length} dòng **${g.productName}** (${qtyListStr})`);
    });
    sections.push(custLines.join('\n'));
  });

  sections.push('💡 Vui lòng kiểm tra lại để tránh bị tính thừa tiền của khách hàng!');
  sections.push('Bạn có muốn mở kiểm tra chi tiết các đơn hàng này không?');

  return sections.join('\n\n');
};

/**
 * 7. Tạo chữ ký định danh cho danh sách trùng lặp (dùng để tránh spam popup khi dữ liệu không đổi):
 */
export const computeDuplicatesSignature = (duplicateResults = []) => {
  if (!Array.isArray(duplicateResults) || duplicateResults.length === 0) return '';
  return duplicateResults
    .map((res) => {
      const groupStr = (res.groups || [])
        .map((g) => `${g.productName}_${(g.quantities || []).sort().join(',')}`)
        .join('|');
      return `${res.customerId}_${res.dateKey}_${groupStr}`;
    })
    .sort()
    .join(';;');
};
