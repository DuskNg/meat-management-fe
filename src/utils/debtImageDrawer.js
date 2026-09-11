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
  const clean = note.replace(/\[Trả lại hàng\]|\[Trả hàng nhanh\]/gi, '').trim();

  const itemRegex = /(\d+(?:[.,]\d+)?)\s*([a-zA-ZÀ-ỹ]*)\s+(.+?)\s*\(\s*([\d.,]+)[\s\u00a0]*[đ₫VND]?\s*\)(?:\s*,|\s*-|$)/gi;
  const items = [];
  let match;
  while ((match = itemRegex.exec(clean)) !== null) {
    const qtyStr = match[1].replace(',', '.');
    const qty = parseFloat(qtyStr);
    const prodName = match[3].trim().toUpperCase();
    const amtStr = match[4].replace(/\./g, '').replace(/,/g, '');
    const amt = parseFloat(amtStr) || 0;
    const price = (qty && qty > 0 && amt > 0) ? Math.round(amt / qty) : null;
    items.push({
      type: 'RETURN',
      name: `[TRẢ HÀNG] ${prodName}`,
      quantity: !isNaN(qty) ? qty : null,
      price: price,
      amount: amt,
    });
  }

  if (items.length === 0) {
    const cleanName = clean ? `[TRẢ HÀNG] ${clean.toUpperCase()}` : '[TRẢ HÀNG]';
    return [{
      type: 'RETURN',
      name: cleanName,
      quantity: null,
      price: null,
      amount: defaultAmount,
    }];
  }

  return items;
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

  // Thêm dòng TỔNG tiền thịt cho các ngày có từ 2 loại thịt trở lên
  sortedDays.forEach((day) => {
    const deliveryEntries = (day.entries || []).filter((e) => e.type === 'DELIVERY');
    if (deliveryEntries.length > 1) {
      const dayMeatTotal = deliveryEntries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

      let lastDeliveryIdx = -1;
      for (let i = day.entries.length - 1; i >= 0; i--) {
        if (day.entries[i].type === 'DELIVERY') {
          lastDeliveryIdx = i;
          break;
        }
      }

      const totalEntry = {
        type: 'DAY_TOTAL',
        name: 'TỔNG',
        quantity: null,
        price: null,
        amount: dayMeatTotal,
      };

      if (lastDeliveryIdx >= 0) {
        day.entries.splice(lastDeliveryIdx + 1, 0, totalEntry);
      } else {
        day.entries.push(totalEntry);
      }
    }
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
          const numQty = parseFloat(entry.quantity);
          const qtyText = (entry.quantity !== null && entry.quantity !== undefined && !isNaN(numQty))
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
          const numPrice = parseFloat(entry.price);
          const priceText = (entry.price !== null && entry.price !== undefined && !isNaN(numPrice) && numPrice > 0)
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
