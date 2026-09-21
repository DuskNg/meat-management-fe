// meat-management-fe/src/utils/dailyBundleExportHelper.js
import { Platform } from 'react-native';
import { api } from '../api/client';
import { downloadOrShareMultipleImages, isMobileDevice } from './imageShareHelper';
import { showGlobalToast } from '../store/toastStore';

// Định dạng hiển thị tiền VNĐ
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  })
    .format(amount || 0)
    .replace('₫', 'đ');
};

// Chuyển đổi chuỗi ngày sang dạng DD/MM/YYYY (chuẩn giờ VN UTC+7)
const toDateKey = (dateInput) => {
  if (!dateInput) return '';
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      return trimmed;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [yyyy, mm, dd] = trimmed.split('-');
      return `${dd}/${mm}/${yyyy}`;
    }
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const vnTime = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const dd = String(vnTime.getUTCDate()).padStart(2, '0');
  const mm = String(vnTime.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = vnTime.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

// Kiểm tra khoản thanh toán có phải trả hàng không
const isReturnPayment = (p) => {
  if (!p) return false;
  const note = (p.note || '').trim();
  return (
    note.includes('[Trả lại hàng]') ||
    note.includes('[Trả hàng nhanh]') ||
    note.includes('[Trả hàng]') ||
    note.startsWith('Trả hàng') ||
    note.startsWith('Trả lại hàng')
  );
};

// Bóc tách chi tiết các món hàng khách trả từ ghi chú
const parseReturnItems = (note, defaultAmount = 0) => {
  if (!note) {
    return [{
      type: 'RETURN',
      name: '[TRẢ HÀNG]',
      quantity: null,
      price: null,
      amount: defaultAmount,
    }];
  }

  let text = note.replace(/\[Trả lại hàng\]|\[Trả hàng nhanh\]|\[Trả hàng\]/gi, '').trim();
  const parts = text.split(/[,;\n]/).map(p => p.trim()).filter(Boolean);

  if (parts.length === 0) {
    return [{
      type: 'RETURN',
      name: '[TRẢ HÀNG]',
      quantity: null,
      price: null,
      amount: defaultAmount,
    }];
  }

  const results = [];

  for (let part of parts) {
    const oldFormatRegex = /^(\d+(?:[.,]\d+)?)\s*(?:kg|kilo)?\s+(.+?)(?:\s*\(\s*([\d.,]+)[\s\u00a0]*[đ₫VND]?\s*\))?$/i;
    const oldMatch = part.match(oldFormatRegex);
    if (oldMatch) {
      const tokenAfter = oldMatch[2].trim();
      const startsWithNumber = /^\d+/.test(tokenAfter);
      if (!startsWithNumber) {
        const qty = parseFloat(oldMatch[1].replace(',', '.'));
        let prodName = oldMatch[2].trim().toUpperCase();
        prodName = prodName.replace(/^(TRẢ HÀNG NHANH|TRẢ LẠI HÀNG|TRẢ HÀNG|TRẢ LẠI|TRẢ)\s*:?\s*/gi, '').trim();
        const amtStr = oldMatch[3] ? oldMatch[3].replace(/\./g, '').replace(/,/g, '') : null;
        const amt = amtStr ? parseFloat(amtStr) : (parts.length === 1 ? defaultAmount : 0);
        const price = (qty && qty > 0 && amt > 0) ? Math.round(amt / qty) : null;
        results.push({
          type: 'RETURN',
          name: `[TRẢ HÀNG] ${prodName}`,
          quantity: !isNaN(qty) ? qty : null,
          price: price,
          amount: amt,
        });
        continue;
      }
    }

    let amtFromParen = null;
    const parenAmtMatch = part.match(/\(\s*([\d.,]+)[\s\u00a0]*[đ₫VND]?\s*\)\s*$/i);
    if (parenAmtMatch) {
      amtFromParen = parseFloat(parenAmtMatch[1].replace(/\./g, '').replace(/,/g, ''));
      part = part.slice(0, part.lastIndexOf(parenAmtMatch[0])).trim();
    }

    const quickMatch = part.match(/^([a-zA-ZÀ-ỹ\s()+-]+?)\s+(\d+(?:[.,]\d+)?\s*[kK]?)\s+([\d]+(?:[.,]\d+)?)\s*(?:kg|kilo)?\s*(\([a-zA-Z0-9\s]+\))?$/i);
    if (quickMatch) {
      let prodName = quickMatch[1].trim().toUpperCase();
      prodName = prodName.replace(/^(TRẢ HÀNG NHANH|TRẢ LẠI HÀNG|TRẢ HÀNG|TRẢ LẠI|TRẢ)\s*:?\s*/gi, '').trim();
      const extraNote = quickMatch[4] ? ` ${quickMatch[4].trim()}` : '';
      if (extraNote) prodName += extraNote;

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
        name: `[TRẢ HÀNG] ${prodName}`,
        quantity: qty,
        price: price,
        amount: amt || 0,
      });
      continue;
    }

    const nameQtyMatch = part.match(/^([a-zA-ZÀ-ỹ\s()+-]+?)\s+(\d+(?:[.,]\d+)?)\s*(?:kg|kilo)\s*(\([a-zA-Z0-9\s]+\))?$/i);
    if (nameQtyMatch) {
      let prodName = nameQtyMatch[1].trim().toUpperCase();
      prodName = prodName.replace(/^(TRẢ HÀNG NHANH|TRẢ LẠI HÀNG|TRẢ HÀNG|TRẢ LẠI|TRẢ)\s*:?\s*/gi, '').trim();
      if (nameQtyMatch[3]) prodName += ` ${nameQtyMatch[3].trim()}`;
      const qty = parseFloat(nameQtyMatch[2].replace(',', '.'));
      let amt = amtFromParen || (parts.length === 1 ? defaultAmount : 0);
      const price = (qty && qty > 0 && amt > 0) ? Math.round(amt / qty) : null;
      results.push({
        type: 'RETURN',
        name: `[TRẢ HÀNG] ${prodName}`,
        quantity: !isNaN(qty) ? qty : null,
        price: price,
        amount: amt,
      });
      continue;
    }

    let cleanName = part.toUpperCase().replace(/^(TRẢ HÀNG NHANH|TRẢ LẠI HÀNG|TRẢ HÀNG|TRẢ LẠI|TRẢ)\s*[:-]?\s*/gi, '').trim();
    const displayName = cleanName ? `[TRẢ HÀNG] ${cleanName}` : '[TRẢ HÀNG]';
    results.push({
      type: 'RETURN',
      name: displayName,
      quantity: null,
      price: null,
      amount: parts.length === 1 ? defaultAmount : 0,
    });
  }

  return results.length > 0 ? results : [{
    type: 'RETURN',
    name: '[TRẢ HÀNG]',
    quantity: null,
    price: null,
    amount: defaultAmount,
  }];
};

// Helper bẻ dòng text dài trong ô bảng
const wrapText = (context, text, maxWidth) => {
  const lines = [];
  let currentLine = '';
  const words = text.split(' ');

  for (let i = 0; i < words.length; i++) {
    let word = words[i];
    while (context.measureText(word).width > maxWidth) {
      let breakIndex = 1;
      while (
        context.measureText(word.substring(0, breakIndex)).width <= maxWidth &&
        breakIndex <= word.length
      ) {
        breakIndex++;
      }
      breakIndex--;
      const part = word.substring(0, breakIndex);
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }
      lines.push(part);
      word = word.substring(breakIndex);
    }

    if (!word) continue;
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (context.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
};

/**
 * ── 1. VẼ ẢNH BÁO CÁO CÔNG NỢ NGÀY DẠNG BẢNG KẺ CHI TIẾT CHUẨN KẾ TOÁN (HTML5 Canvas - GIỐNG ẢNH 2) ──
 */
export const generateDailyDebtImage = ({ selectedDate, transactions, payments }) => {
  if (typeof document === 'undefined') return null;

  try {
    // 1. Lọc toàn bộ giao dịch mua hàng, trả hàng và thanh toán theo ngày đã chọn
    const dayTransactions = (transactions || []).filter((t) => toDateKey(t.date) === selectedDate);
    const dayPayments = (payments || []).filter((p) => toDateKey(p.paidAt) === selectedDate);

    // 2. Gom nhóm theo từng Khách hàng
    const customerMap = {};
    let totalMeatAmount = 0;
    let totalReturnAmount = 0;
    let totalPaymentAmount = 0;

    // 2.1. Thêm các món hàng từ giao dịch (Transactions)
    dayTransactions.forEach((t) => {
      const cId = t.customerId || (t.customer?.name || 'Khách vãng lai');
      const cName = t.customer?.name || 'Khách vãng lai';

      if (!customerMap[cId]) {
        customerMap[cId] = {
          id: cId,
          name: cName,
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
          customerMap[cId].entries.push({
            type: 'DELIVERY',
            name: isQuick ? 'TIỀN HÀNG' : rawName.toUpperCase(),
            quantity: isQuick ? null : (isNaN(q) ? null : q),
            price: isQuick ? null : (isNaN(p) ? null : p),
            amount: itemAmt,
          });
        });
      } else {
        // Ghi nợ nhanh
        totalMeatAmount += amt;
        const noteName = (t.note && t.note !== 'Ghi nợ nhanh') ? t.note : 'TIỀN HÀNG';
        customerMap[cId].entries.push({
          type: 'DELIVERY',
          name: noteName.toUpperCase(),
          quantity: null,
          price: null,
          amount: amt,
        });
      }
    });

    // 2.2. Thêm các khoản thanh toán / trả hàng từ payments
    dayPayments.forEach((p) => {
      const cId = p.customerId || (p.customer?.name || 'Khách vãng lai');
      const cName = p.customer?.name || 'Khách vãng lai';

      if (!customerMap[cId]) {
        customerMap[cId] = {
          id: cId,
          name: cName,
          entries: [],
        };
      }

      const amt = parseFloat(p.amount || 0);
      const isReturn = isReturnPayment(p);

      if (isReturn) {
        totalReturnAmount += amt;
        const returnItems = parseReturnItems(p.note, amt);
        returnItems.forEach((ritem) => {
          customerMap[cId].entries.push(ritem);
        });
      } else {
        totalPaymentAmount += amt;
        customerMap[cId].entries.push({
          type: 'PAYMENT',
          name: 'ĐÃ THU',
          quantity: null,
          price: null,
          amount: amt,
        });
      }
    });

    // Lọc các khách hàng có dữ liệu phát sinh
    const activeCustomers = Object.values(customerMap).filter((c) => c.entries && c.entries.length > 0);
    // Sắp xếp theo tên khách hàng tiếng Việt
    const sortedCustomers = activeCustomers.sort((a, b) => a.name.localeCompare(b.name, 'vi'));

    const finalRemaining = Math.max(0, totalMeatAmount - totalReturnAmount - totalPaymentAmount);

    // Nếu không có bất kỳ giao dịch nào trong ngày
    if (sortedCustomers.length === 0) {
      return null;
    }

    const totalEntriesCount = sortedCustomers.reduce((sum, c) => sum + c.entries.length, 0);

    // ─── THIẾT KẾ BẢNG VẼ CANVAS CHUẨN ĐỒ HỌA CAO CẤP (PREMIUM INVOICE NHƯ ẢNH 2) ───
    const startX = 36;
    // Cột: [Khách hàng: 130px, Tên hàng: 220px, SL (KG): 65px, Đơn giá: 95px, Thành tiền: 130px]
    const colWidths = [130, 220, 65, 95, 130];
    const panelWidth = colWidths.reduce((a, b) => a + b, 0); // 640px
    const panelGap = 16;

    // Nếu > 10 khách hàng thì tự động chia đôi thành 2 cột bảng (trái/phải)
    const isSplit = sortedCustomers.length > 10;
    const canvasWidth = isSplit ? (startX * 2 + panelWidth * 2 + panelGap) : (startX * 2 + panelWidth);

    let leftCustomers = [];
    let rightCustomers = [];

    if (!isSplit) {
      leftCustomers = sortedCustomers;
      rightCustomers = [];
    } else {
      let bestK = 1;
      let minDiff = Infinity;
      let runningLeft = 0;

      for (let k = 1; k < sortedCustomers.length; k++) {
        runningLeft += sortedCustomers[k - 1].entries.length;
        const runningRight = totalEntriesCount - runningLeft;
        const diff = Math.abs(runningLeft - runningRight);
        if (diff < minDiff) {
          minDiff = diff;
          bestK = k;
        }
      }

      leftCustomers = sortedCustomers.slice(0, bestK);
      rightCustomers = sortedCustomers.slice(bestK);
    }

    const rowHeight = 34;
    const tableHeaderHeight = 38;
    const summaryRowHeight = 46;
    const startTableY = 78;

    const leftEntriesCount = leftCustomers.reduce((sum, c) => sum + c.entries.length, 0);
    const rightEntriesCount = rightCustomers.reduce((sum, c) => sum + c.entries.length, 0);
    const maxRowsInCol = Math.max(leftEntriesCount, rightEntriesCount, 1);
    const tableContentHeight = maxRowsInCol * rowHeight;

    const summaryRowsCount = 1 + (totalReturnAmount > 0 ? 1 : 0) + (totalPaymentAmount > 0 ? 1 : 0) + 1;
    const summaryHeight = summaryRowsCount * summaryRowHeight;
    const summaryStartY = startTableY + tableHeaderHeight + tableContentHeight + 16;
    const canvasHeight = summaryStartY + summaryHeight + 30;

    // Tạo canvas và phóng tỉ lệ phù hợp (Mobile dùng 1.5x để tối ưu bộ nhớ RAM/Safari, PC dùng 2x sắc nét)
    const isMobile = isMobileDevice();
    const scale = isMobile ? 1.5 : 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(canvasWidth * scale);
    canvas.height = Math.round(canvasHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(scale, scale);

    // Nền trắng tinh khôi
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // ─── PHẦN TIÊU ĐỀ BÁO CÁO: CARD BO GÓC TRANG NHÃ ───
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

    const titleText = `BÁO CÁO CÔNG NỢ NGÀY ${selectedDate}`;
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 16.5px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(titleText, canvasWidth / 2, headerCardY + headerCardHeight / 2);

    // Hàm vẽ 1 panel bảng (gồm Header và các dòng)
    const drawPanel = (panelCustomers, panelStartX) => {
      let panelY = startTableY;

      // 1. Tiêu đề bảng của panel
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(panelStartX, panelY, panelWidth, tableHeaderHeight);
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(panelStartX, panelY, panelWidth, tableHeaderHeight);

      // Kẻ dọc các cột header
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

      // Chữ header (nhã nhặn, sắc nét)
      ctx.fillStyle = '#334155';
      ctx.font = 'bold 13.5px Arial, sans-serif';
      ctx.textBaseline = 'middle';
      const hMid = panelY + tableHeaderHeight / 2;

      ctx.textAlign = 'center';
      ctx.fillText('KHÁCH HÀNG', pColX[0] + colWidths[0] / 2, hMid);

      ctx.textAlign = 'left';
      ctx.fillText('TÊN HÀNG', pColX[1] + 8, hMid);

      ctx.textAlign = 'right';
      ctx.fillText('SL (KG)', pColX[2] + colWidths[2] - 8, hMid);
      ctx.fillText('ĐƠN GIÁ', pColX[3] + colWidths[3] - 8, hMid);
      ctx.fillText('THÀNH TIỀN', pColX[4] + colWidths[4] - 8, hMid);

      panelY += tableHeaderHeight;

      // 2. Các dòng dữ liệu
      panelCustomers.forEach((cust) => {
        const custHeight = cust.entries.length * rowHeight;
        const custStartY = panelY;

        cust.entries.forEach((entry, idx) => {
          const itemY = custStartY + idx * rowHeight;
          const midY = itemY + rowHeight / 2;

          // Nền trắng
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(panelStartX, itemY, panelWidth, rowHeight);

          // Cột 1: Tên hàng
          ctx.textAlign = 'left';
          const maxItemNameWidth = colWidths[1] - 14;
          let itemFontSize = 13.5;
          ctx.font = `${itemFontSize}px Arial, sans-serif`;
          let itemDisplayName = entry.name || '';

          if (ctx.measureText(itemDisplayName).width > maxItemNameWidth) {
            itemFontSize = 11.5;
            ctx.font = `${itemFontSize}px Arial, sans-serif`;
            if (ctx.measureText(itemDisplayName).width > maxItemNameWidth) {
              while (ctx.measureText(itemDisplayName + '...').width > maxItemNameWidth && itemDisplayName.length > 0) {
                itemDisplayName = itemDisplayName.slice(0, -1);
              }
              itemDisplayName += '...';
            }
          }

          if (entry.type === 'RETURN') {
            ctx.fillStyle = '#DC2626';
            ctx.fillText(itemDisplayName, pColX[1] + 8, midY);
          } else if (entry.type === 'PAYMENT') {
            ctx.fillStyle = '#059669';
            ctx.fillText(itemDisplayName, pColX[1] + 8, midY);
          } else {
            ctx.fillStyle = '#0F172A';
            ctx.fillText(itemDisplayName, pColX[1] + 8, midY);
          }

          // Cột 2: Số lượng
          ctx.textAlign = 'right';
          const numQty = parseFloat(entry.quantity);
          const qtyText = (entry.quantity !== null && entry.quantity !== undefined && !isNaN(numQty))
            ? (Number.isInteger(numQty) ? String(numQty) : parseFloat(numQty.toFixed(2)).toString())
            : '-';
          if (entry.type === 'RETURN') {
            ctx.fillStyle = '#DC2626';
          } else {
            ctx.fillStyle = '#0F172A';
          }
          ctx.font = '14px Arial, sans-serif';
          ctx.fillText(qtyText, pColX[2] + colWidths[2] - 8, midY);

          // Cột 3: Đơn giá
          ctx.textAlign = 'right';
          const numPrice = parseFloat(entry.price);
          const priceText = (entry.price !== null && entry.price !== undefined && !isNaN(numPrice) && numPrice > 0)
            ? new Intl.NumberFormat('vi-VN').format(Math.round(numPrice))
            : '-';
          if (entry.type === 'RETURN') {
            ctx.fillStyle = '#DC2626';
            ctx.font = 'bold 14.5px Arial, sans-serif';
          } else {
            ctx.fillStyle = '#0F172A';
            ctx.font = 'bold 14.5px Arial, sans-serif';
          }
          ctx.fillText(priceText, pColX[3] + colWidths[3] - 8, midY);

          // Cột 4: Thành tiền
          ctx.textAlign = 'right';
          const numAmount = parseFloat(entry.amount || 0);
          const formattedAmount = new Intl.NumberFormat('vi-VN').format(Math.round(numAmount));
          if (entry.type === 'RETURN') {
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

          // Đường kẻ ngang giữa các món của cùng 1 khách
          if (idx < cust.entries.length - 1) {
            ctx.strokeStyle = '#F1F5F9';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pColX[1], itemY + rowHeight);
            ctx.lineTo(panelStartX + panelWidth, itemY + rowHeight);
            ctx.stroke();
          }
        });

        // Kẻ dọc giữa các cột cho toàn khách hàng này
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 1;
        for (let c = 1; c < pColX.length; c++) {
          ctx.beginPath();
          ctx.moveTo(pColX[c], custStartY);
          ctx.lineTo(pColX[c], custStartY + custHeight);
          ctx.stroke();
        }

        // Cột 0: Ô Tên khách hàng gộp chung (nền xám nhẹ)
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(pColX[0], custStartY, colWidths[0], custHeight);
        ctx.strokeStyle = '#CBD5E1';
        ctx.strokeRect(pColX[0], custStartY, colWidths[0], custHeight);

        // Chữ tên khách hàng (căn giữa theo ô gộp)
        ctx.fillStyle = '#1E293B';
        ctx.textAlign = 'center';
        let custFontSize = 12.5;
        ctx.font = `bold ${custFontSize}px Arial, sans-serif`;

        let nameLines = wrapText(ctx, cust.name || '', colWidths[0] - 8);
        let lineHeight = custFontSize + 3.5;
        let totalTextHeight = nameLines.length * lineHeight;

        while (totalTextHeight > custHeight - 4 && custFontSize > 9.5) {
          custFontSize -= 0.5;
          lineHeight = custFontSize + 2.5;
          ctx.font = `bold ${custFontSize}px Arial, sans-serif`;
          nameLines = wrapText(ctx, cust.name || '', colWidths[0] - 8);
          totalTextHeight = nameLines.length * lineHeight;
        }

        const startTextY = custStartY + (custHeight - totalTextHeight) / 2 + lineHeight / 2;

        nameLines.forEach((line, lIdx) => {
          ctx.fillText(line, pColX[0] + colWidths[0] / 2, startTextY + lIdx * lineHeight);
        });

        // Đường kẻ ngang phân tách giữa các khách hàng
        ctx.strokeStyle = '#64748B';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(panelStartX, custStartY + custHeight);
        ctx.lineTo(panelStartX + panelWidth, custStartY + custHeight);
        ctx.stroke();

        panelY += custHeight;
      });

      // Viền bao quanh toàn bộ panel
      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(panelStartX, startTableY, panelWidth, panelY - startTableY);

      return panelY;
    };

    // Vẽ Panel Trái (Cột 1)
    drawPanel(leftCustomers, startX);

    // Vẽ Panel Phải (Cột 2) nếu có chia đôi
    if (isSplit && rightCustomers.length > 0) {
      const rightStartX = startX + panelWidth + panelGap;
      drawPanel(rightCustomers, rightStartX);
    }

    // ─── PHẦN TỔNG KẾT CUỐI BẢNG (CHUẨN KẾ TOÁN SANG TRỌNG NHƯ ẢNH 2) ───
    const summaryStartX = isSplit ? (startX + panelWidth + panelGap) : startX;
    const summaryColLeftWidth = 380;
    let curSummaryY = summaryStartY;

    // Dòng 1: TỔNG TIỀN HÀNG
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
    ctx.fillText(`TỔNG TIỀN HÀNG (${selectedDate}):`, summaryStartX + summaryColLeftWidth - 10, curSummaryY + summaryRowHeight / 2);
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 17.5px Arial, sans-serif';
    ctx.fillText(`${new Intl.NumberFormat('vi-VN').format(totalMeatAmount)} đ`, summaryStartX + panelWidth - 10, curSummaryY + summaryRowHeight / 2);
    curSummaryY += summaryRowHeight;

    // Dòng 2: TIỀN HÀNG TRẢ VỀ (Nếu có)
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

    // Dòng 3: ĐÃ THU (Nếu có)
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

    // Dòng 4: CÒN LẠI PHẢI THU
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
    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`CÒN LẠI PHẢI THU (${selectedDate}):`, summaryStartX + summaryColLeftWidth - 10, curSummaryY + summaryRowHeight / 2);
    ctx.fillStyle = finalRemaining > 0 ? '#DC2626' : '#059669';
    ctx.font = 'bold 17.5px Arial, sans-serif';
    ctx.fillText(`${new Intl.NumberFormat('vi-VN').format(finalRemaining)} đ`, summaryStartX + panelWidth - 10, curSummaryY + summaryRowHeight / 2);

    return canvas.toDataURL('image/png');
  } catch (err) {
    console.error('[GENERATE DAILY DEBT IMAGE ERROR]', err);
    return null;
  }
};

/**
 * ── 2. VẼ ẢNH KHÁCH QUEN CHƯA CÓ ĐƠN NỢ TRONG NGÀY (HTML5 Canvas) ──
 */
const generateMissingCustomersImage = ({ selectedDate, allTransactions, customers }) => {
  if (typeof document === 'undefined') return null;

  try {
    const parts = (selectedDate || '').split('/');
    if (parts.length !== 3) return null;

    const targetDateObj = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    targetDateObj.setHours(0, 0, 0, 0);

    // 1. Tìm 5 buổi bán gần nhất trước ngày kiểm tra
    const pastTxDates = Array.from(
      new Set(
        (allTransactions || [])
          .filter((t) => {
            if (!t || !t.date) return false;
            const dKey = toDateKey(t.date);
            if (dKey === selectedDate) return false;
            const d = new Date(t.date);
            d.setHours(0, 0, 0, 0);
            return d < targetDateObj;
          })
          .map((t) => toDateKey(t.date))
      )
    ).sort((a, b) => {
      const [d1, m1, y1] = a.split('/').map(Number);
      const [d2, m2, y2] = b.split('/').map(Number);
      return new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1);
    });

    let labels = [];
    if (pastTxDates.length >= 5) {
      labels = pastTxDates.slice(0, 5).reverse();
    } else {
      for (let i = 5; i >= 1; i--) {
        const dObj = new Date(targetDateObj);
        dObj.setDate(dObj.getDate() - i);
        labels.push(toDateKey(dObj));
      }
    }

    const recent5DaysSet = new Set(labels);

    const recentTxByCustomer = {};
    const todayTxByCustomer = {};

    (allTransactions || []).forEach((tx) => {
      if (!tx || !tx.date) return;
      const cId = tx.customerId || (tx.customer?.id || tx.customer?._id || tx.customer?.name);
      if (!cId) return;
      const txDateKey = toDateKey(tx.date);

      if (recent5DaysSet.has(txDateKey)) {
        if (!recentTxByCustomer[cId]) {
          recentTxByCustomer[cId] = [];
        }
        recentTxByCustomer[cId].push(tx);
      }

      if (txDateKey === selectedDate) {
        if (!todayTxByCustomer[cId]) {
          todayTxByCustomer[cId] = [];
        }
        todayTxByCustomer[cId].push(tx);
      }
    });

    // Khách quen: có đơn trong 5 buổi gần nhất nhưng chưa có đơn hôm nay
    const missingCustomers = [];
    (customers || []).forEach((cust) => {
      if (!cust || cust.isBadDebt) return;
      const cId = cust.id || cust._id;
      const recentOrders = (cId && recentTxByCustomer[cId]) || (cust.name && recentTxByCustomer[cust.name]) || [];
      const todayOrders = (cId && todayTxByCustomer[cId]) || (cust.name && todayTxByCustomer[cust.name]) || [];
      if (recentOrders.length > 0 && todayOrders.length === 0) {
        missingCustomers.push(cust);
      }
    });

    // Vẽ Canvas
    const isMobile = isMobileDevice();
    const scale = isMobile ? 1.5 : 2;
    const isTwoCol = missingCustomers.length > 15;
    const width = isTwoCol ? 750 : 550;
    const padding = 20;
    const headerHeight = 85;
    const rowHeight = 44;
    const emptyRowHeight = 65;
    const footerHeight = 45;

    const numRows = isTwoCol ? Math.ceil(missingCustomers.length / 2) : Math.max(missingCustomers.length, 1);
    const contentHeight = missingCustomers.length === 0 ? emptyRowHeight : numRows * rowHeight;
    const totalHeight = padding * 2 + headerHeight + 15 + contentHeight + footerHeight;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(totalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(scale, scale);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, totalHeight);

    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(8, 8, width - 16, totalHeight - 16);

    // Header xanh lá sang trọng
    ctx.fillStyle = '#065F46';
    ctx.fillRect(12, 12, width - 24, headerHeight);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 20px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DANH SÁCH KHÁCH QUEN CHƯA LÊN ĐƠN HÔM NAY', width / 2, 44);

    ctx.fillStyle = '#A7F3D0';
    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.fillText(`Ngày: ${selectedDate}   •   Tổng số: ${missingCustomers.length} khách`, width / 2, 70);

    let startY = 12 + headerHeight + 15;

    if (missingCustomers.length === 0) {
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(padding, startY, width - padding * 2, emptyRowHeight);
      ctx.strokeStyle = '#E2E8F0';
      ctx.strokeRect(padding, startY, width - padding * 2, emptyRowHeight);

      ctx.fillStyle = '#059669';
      ctx.font = 'bold 14px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🎉 Tất cả khách quen đều đã được lên đơn trong ngày hôm nay!', width / 2, startY + 38);
      startY += emptyRowHeight;
    } else if (!isTwoCol) {
      missingCustomers.forEach((item, idx) => {
        ctx.fillStyle = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
        ctx.fillRect(padding, startY, width - padding * 2, rowHeight);
        ctx.strokeStyle = '#E2E8F0';
        ctx.strokeRect(padding, startY, width - padding * 2, rowHeight);

        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 15px Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${idx + 1}. ${item.name || ''}`, padding + 20, startY + 27);

        startY += rowHeight;
      });
    } else {
      const half = Math.ceil(missingCustomers.length / 2);
      const colW = (width - padding * 2 - 16) / 2;
      const leftX = padding;
      const rightX = padding + colW + 16;

      for (let i = 0; i < half; i++) {
        const rowY = startY + i * rowHeight;
        const leftItem = missingCustomers[i];
        if (leftItem) {
          ctx.fillStyle = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
          ctx.fillRect(leftX, rowY, colW, rowHeight);
          ctx.strokeStyle = '#E2E8F0';
          ctx.strokeRect(leftX, rowY, colW, rowHeight);

          ctx.fillStyle = '#0F172A';
          ctx.font = 'bold 14px Arial, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(`${i + 1}. ${leftItem.name || ''}`, leftX + 16, rowY + 27);
        }

        const rightIdx = half + i;
        if (rightIdx < missingCustomers.length) {
          const rightItem = missingCustomers[rightIdx];
          ctx.fillStyle = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
          ctx.fillRect(rightX, rowY, colW, rowHeight);
          ctx.strokeStyle = '#E2E8F0';
          ctx.strokeRect(rightX, rowY, colW, rowHeight);

          ctx.fillStyle = '#0F172A';
          ctx.font = 'bold 14px Arial, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(`${rightIdx + 1}. ${rightItem.name || ''}`, rightX + 16, rowY + 27);
        }
      }
      startY += half * rowHeight;
    }

    // Footer ảnh
    const footerY = startY + 12;
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, footerY);
    ctx.lineTo(width - padding, footerY);
    ctx.stroke();

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ngày ${toDateKey(now)}`;
    ctx.fillStyle = '#64748B';
    ctx.font = '11px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Thời gian xuất: ${timeStr}`, padding, footerY + 18);
    ctx.textAlign = 'right';
    ctx.fillText('Phần mềm Quản lý Sạp thịt', width - padding, footerY + 18);

    return canvas.toDataURL('image/png');
  } catch (err) {
    console.error('[GENERATE MISSING CUSTOMERS IMAGE ERROR]', err);
    return null;
  }
};

/**
 * ── 3. VẼ ẢNH BÁO CÁO ĐƠN NỢ TRÙNG / KHÁCH TRÙNG (HTML5 Canvas) ──
 */
const generateDuplicateDebtsImage = ({ selectedDate, transactions }) => {
  if (typeof document === 'undefined') return null;

  try {
    const dayTransactions = (transactions || []).filter((t) => toDateKey(t?.date) === selectedDate);

    // Đếm số đơn nợ của từng khách hàng
    const countByCustomer = {};
    dayTransactions.forEach((t) => {
      if (!t) return;
      const cId = t.customerId || (t.customer?.id || t.customer?._id || t.customer?.name || 'Khách vãng lai');
      countByCustomer[cId] = (countByCustomer[cId] || 0) + 1;
    });

    // Lọc các đơn của khách hàng có >= 2 đơn nợ
    const duplicateItems = dayTransactions
      .filter((t) => {
        if (!t) return false;
        const cId = t.customerId || (t.customer?.id || t.customer?._id || t.customer?.name || 'Khách vãng lai');
        return (countByCustomer[cId] || 0) >= 2;
      })
      .sort((a, b) => {
        const nameA = a.customer?.name || '';
        const nameB = b.customer?.name || '';
        return nameA.localeCompare(nameB, 'vi');
      });

    const dupCustomerIds = new Set(duplicateItems.map((t) => t.customerId || t.customer?.name));
    const duplicateCustomerCount = dupCustomerIds.size;
    const totalDupAmount = duplicateItems.reduce((sum, t) => sum + parseFloat(t.totalAmount || 0), 0);

    // Kích thước canvas (Tối ưu scale cho Mobile)
    const isMobile = isMobileDevice();
    const scale = isMobile ? 1.5 : 2;
    const width = 760;
    const padding = 20;
    const headerHeight = 90;
    const summaryBoxHeight = 65;
    const rowHeight = 44;
    const emptyRowHeight = 70;
    const footerHeight = 45;

    const contentHeight = duplicateItems.length === 0 ? emptyRowHeight : duplicateItems.length * rowHeight;
    const totalHeight = padding * 2 + headerHeight + summaryBoxHeight + 15 + contentHeight + footerHeight;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(totalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(scale, scale);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, totalHeight);

    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(8, 8, width - 16, totalHeight - 16);

    // Header màu cam cháy / đỏ cảnh báo
    ctx.fillStyle = '#B45309';
    ctx.fillRect(12, 12, width - 24, headerHeight);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BÁO CÁO ĐƠN NỢ TRÙNG TRONG NGÀY', width / 2, 46);

    ctx.fillStyle = '#FDE68A';
    ctx.font = 'bold 13.5px Arial, sans-serif';
    ctx.fillText(`Ngày báo cáo: ${selectedDate}   •   Kiểm tra phát hiện ghi nợ 2 lần`, width / 2, 72);

    // 3 Hộp KPI tóm tắt
    const boxY = 12 + headerHeight + 10;
    const boxW = (width - padding * 2 - 16) / 3;

    // Box 1: Tiền đơn trùng
    ctx.fillStyle = '#FFFBEB';
    ctx.fillRect(padding, boxY, boxW, summaryBoxHeight);
    ctx.strokeStyle = '#FDE68A';
    ctx.lineWidth = 1;
    ctx.strokeRect(padding, boxY, boxW, summaryBoxHeight);
    ctx.fillStyle = '#92400E';
    ctx.font = 'bold 11px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('⚠️ TỔNG TIỀN ĐƠN TRÙNG', padding + 10, boxY + 22);
    ctx.font = 'bold 16px Arial, sans-serif';
    ctx.fillText(formatCurrency(totalDupAmount), padding + 10, boxY + 48);

    // Box 2: Khách bị trùng
    const box2X = padding + boxW + 8;
    ctx.fillStyle = '#EFF6FF';
    ctx.fillRect(box2X, boxY, boxW, summaryBoxHeight);
    ctx.strokeStyle = '#BFDBFE';
    ctx.strokeRect(box2X, boxY, boxW, summaryBoxHeight);
    ctx.fillStyle = '#1E40AF';
    ctx.font = 'bold 11px Arial, sans-serif';
    ctx.fillText('👥 KHÁCH BỊ TRÙNG', box2X + 10, boxY + 22);
    ctx.font = 'bold 16px Arial, sans-serif';
    ctx.fillText(`${duplicateCustomerCount} khách`, box2X + 10, boxY + 48);

    // Box 3: Số đơn trùng
    const box3X = box2X + boxW + 8;
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(box3X, boxY, boxW, summaryBoxHeight);
    ctx.strokeStyle = '#CBD5E1';
    ctx.strokeRect(box3X, boxY, boxW, summaryBoxHeight);
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 11px Arial, sans-serif';
    ctx.fillText('📋 SỐ ĐƠN TRÙNG', box3X + 10, boxY + 22);
    ctx.font = 'bold 16px Arial, sans-serif';
    ctx.fillText(`${duplicateItems.length} đơn`, box3X + 10, boxY + 48);

    let startY = boxY + summaryBoxHeight + 14;

    if (duplicateItems.length === 0) {
      ctx.fillStyle = '#F0FDF4';
      ctx.fillRect(padding, startY, width - padding * 2, emptyRowHeight);
      ctx.strokeStyle = '#BBF7D0';
      ctx.strokeRect(padding, startY, width - padding * 2, emptyRowHeight);

      ctx.fillStyle = '#166534';
      ctx.font = 'bold 14px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`🎉 Không có khách hàng nào bị trùng đơn trong ngày ${selectedDate}!`, width / 2, startY + 40);
      startY += emptyRowHeight;
    } else {
      duplicateItems.forEach((item, idx) => {
        ctx.fillStyle = idx % 2 === 0 ? '#FFFFFF' : '#FFFBEB';
        ctx.fillRect(padding, startY, width - padding * 2, rowHeight);
        ctx.strokeStyle = '#FEF3C7';
        ctx.strokeRect(padding, startY, width - padding * 2, rowHeight);

        const custName = item.customer?.name || 'Khách vãng lai';

        // Số thứ tự & tên khách hàng
        ctx.fillStyle = '#92400E';
        ctx.font = 'bold 14px Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${idx + 1}. ${custName}`, padding + 14, startY + 27);

        // Chi tiết món thịt
        let desc = '';
        if (item.items && item.items.length > 0) {
          desc = item.items
            .map((it) => `${it.product?.name || it.productName || 'Thịt'} (${it.quantity || ''})`)
            .join(', ');
        } else {
          desc = item.note || 'Đơn nợ';
        }

        ctx.fillStyle = '#64748B';
        ctx.font = '12px Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`• ${desc}`, padding + 260, startY + 27);

        // Số tiền
        ctx.fillStyle = '#DC2626';
        ctx.font = 'bold 14px Arial, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(formatCurrency(item.totalAmount || 0), width - padding - 14, startY + 27);

        startY += rowHeight;
      });
    }

    // Footer ảnh
    const footerY = startY + 12;
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, footerY);
    ctx.lineTo(width - padding, footerY);
    ctx.stroke();

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ngày ${toDateKey(now)}`;
    ctx.fillStyle = '#64748B';
    ctx.font = '11px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Thời gian xuất: ${timeStr}`, padding, footerY + 18);
    ctx.textAlign = 'right';
    ctx.fillText('Phần mềm Quản lý Sạp thịt', width - padding, footerY + 18);

    return canvas.toDataURL('image/png');
  } catch (err) {
    console.error('[GENERATE DUPLICATE DEBTS IMAGE ERROR]', err);
    return null;
  }
};

/**
 * ── HÀM CHÍNH: XUẤT VÀ TẢI TRỌN BỘ 3 ẢNH BÁO CÁO ──
 *
 * @param {Object} params
 * @param {string} params.selectedDate - Ngày xuất báo cáo (DD/MM/YYYY)
 * @param {Array} [params.transactions] - Danh sách giao dịch nợ (nếu có sẵn)
 * @param {Array} [params.payments] - Danh sách thanh toán (nếu có sẵn)
 * @param {Array} [params.customers] - Danh sách khách hàng (nếu có sẵn)
 * @param {Function} [params.onProgress] - Callback cập nhật trạng thái tiến trình
 * @returns {Promise<{ success: boolean, count: number }>}
 */
export const exportDailyReportBundle = async ({
  selectedDate,
  transactions = null,
  payments = null,
  customers = null,
  onProgress = null,
} = {}) => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    showGlobalToast('Tính năng xuất ảnh chỉ hỗ trợ trên môi trường Web.', 'warning');
    return { success: false, count: 0 };
  }

  const dateStr = toDateKey(selectedDate) || toDateKey(new Date());
  const dateFileClean = dateStr.replace(/\//g, '_');

  try {
    onProgress?.('Đang chuẩn bị dữ liệu báo cáo...');

    // 1. Tải dữ liệu nếu chưa được truyền vào (dùng catch từng promise tránh reject cả cụm)
    let finalTransactions = transactions;
    let finalPayments = payments;
    let finalCustomers = customers;

    const promises = [];
    if (!finalTransactions) {
      promises.push(
        api.get('/transactions', { params: { date: dateStr } })
          .then((res) => {
            finalTransactions = res.data?.data || [];
          })
          .catch((err) => {
            console.warn('Lỗi tải giao dịch trong ngày:', err);
            finalTransactions = [];
          })
      );
    }
    if (!finalPayments) {
      promises.push(
        api.get('/payments', { params: { date: dateStr } })
          .then((res) => {
            finalPayments = res.data?.data || [];
          })
          .catch((err) => {
            console.warn('Lỗi tải thanh toán trong ngày:', err);
            finalPayments = [];
          })
      );
    }
    if (!finalCustomers) {
      promises.push(
        api.get('/customers?isBadDebt=false')
          .then((res) => {
            finalCustomers = res.data?.data || [];
          })
          .catch((err) => {
            console.warn('Lỗi tải danh sách khách hàng:', err);
            finalCustomers = [];
          })
      );
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }

    finalTransactions = Array.isArray(finalTransactions) ? finalTransactions : [];
    finalPayments = Array.isArray(finalPayments) ? finalPayments : [];
    finalCustomers = Array.isArray(finalCustomers) ? finalCustomers : [];

    // Đảm bảo có đủ toàn bộ lịch sử giao dịch cho phân tích khách quen (5 buổi gần nhất)
    let allHistoryTransactions = finalTransactions;
    const hasPastDays = finalTransactions.some((t) => {
      const k = toDateKey(t?.date);
      return k && k !== dateStr;
    });

    if (!hasPastDays) {
      try {
        const fullTxRes = await api.get('/transactions');
        if (fullTxRes.data?.data && Array.isArray(fullTxRes.data.data)) {
          allHistoryTransactions = fullTxRes.data.data;
        }
      } catch (txErr) {
        console.warn('Không thể tải toàn bộ lịch sử, sử dụng danh sách hiện tại:', txErr);
      }
    }

    // 2. Tạo Ảnh 1: Báo cáo công nợ & thu tiền trong ngày
    onProgress?.('Đang tạo ảnh 1/3: Báo cáo công nợ ngày...');
    let img1 = null;
    try {
      img1 = generateDailyDebtImage({
        selectedDate: dateStr,
        transactions: finalTransactions,
        payments: finalPayments,
      });
    } catch (e1) {
      console.warn('Lỗi khi vẽ ảnh 1 (Công nợ ngày):', e1);
    }

    // 3. Tạo Ảnh 2: Danh sách khách quen chưa có đơn nợ hôm nay
    onProgress?.('Đang tạo ảnh 2/3: Khách quen chưa có đơn...');
    let img2 = null;
    try {
      img2 = generateMissingCustomersImage({
        selectedDate: dateStr,
        allTransactions: allHistoryTransactions,
        customers: finalCustomers,
      });
    } catch (e2) {
      console.warn('Lỗi khi vẽ ảnh 2 (Khách quen sót đơn):', e2);
    }

    // 4. Tạo Ảnh 3: Báo cáo đơn nợ trùng / khách trùng
    onProgress?.('Đang tạo ảnh 3/3: Báo cáo đơn nợ trùng...');
    let img3 = null;
    try {
      img3 = generateDuplicateDebtsImage({
        selectedDate: dateStr,
        transactions: finalTransactions,
      });
    } catch (e3) {
      console.warn('Lỗi khi vẽ ảnh 3 (Đơn trùng):', e3);
    }

    const itemsToExport = [];
    if (img1) {
      itemsToExport.push({
        imageUri: img1,
        fileName: `1_BaoCaoCongNo_Ngay_${dateFileClean}.png`,
        title: `Báo cáo công nợ ngày ${dateStr}`,
      });
    }
    if (img2) {
      itemsToExport.push({
        imageUri: img2,
        fileName: `2_KhachChuaLenDon_Ngay_${dateFileClean}.png`,
        title: `Khách chưa lên đơn ngày ${dateStr}`,
      });
    }
    if (img3) {
      itemsToExport.push({
        imageUri: img3,
        fileName: `3_DonNoTrung_Ngay_${dateFileClean}.png`,
        title: `Đơn nợ trùng ngày ${dateStr}`,
      });
    }

    if (itemsToExport.length === 0) {
      showGlobalToast('Không thể tạo hình ảnh báo cáo (dữ liệu trống hoặc thiết bị không hỗ trợ).', 'warning');
      return { success: false, count: 0 };
    }

    onProgress?.(`Đang xuất ${itemsToExport.length} ảnh báo cáo...`);

    // 5. Tự động tải tất cả file về máy tính (PC) hoặc chuyển tiếp Zalo (Mobile)
    const shareResult = await downloadOrShareMultipleImages({
      items: itemsToExport,
      title: `Trọn bộ 3 ảnh báo cáo ngày ${dateStr}`,
      text: `Báo cáo công nợ, khách chưa lên đơn và đơn trùng ngày ${dateStr}`,
    });

    return { success: shareResult?.success ?? true, count: itemsToExport.length };
  } catch (err) {
    console.error('[EXPORT DAILY REPORT BUNDLE ERROR]', err);
    showGlobalToast('Đã xảy ra lỗi khi tạo trọn bộ ảnh báo cáo. Vui lòng thử lại.', 'error');
    return { success: false, count: 0 };
  }
};
