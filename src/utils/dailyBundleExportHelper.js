// meat-management-fe/src/utils/dailyBundleExportHelper.js
import { Platform } from 'react-native';
import { api } from '../api/client';
import { downloadOrShareMultipleImages } from './imageShareHelper';
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
const parseReturnItems = (note, totalAmount) => {
  let text = (note || '')
    .replace(/\[Trả lại hàng\]|\[Trả hàng nhanh\]|\[Trả hàng\]/gi, '')
    .trim();
  text = text.replace(/^(?:Trả hàng nhanh|Trả lại hàng|Trả hàng)\s*[:-]?\s*/gi, '').trim();

  if (!text) {
    return [
      {
        type: 'RETURN',
        name: 'TRẢ LẠI HÀNG',
        quantity: null,
        price: null,
        amount: totalAmount,
      },
    ];
  }

  const parts = text.split(/[,;\n]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) {
    let cleanName = text.replace(/^(TRẢ HÀNG NHANH|TRẢ LẠI HÀNG|TRẢ HÀNG|TRẢ LẠI|TRẢ)\s*:?\s*/gi, '').trim();
    return [
      {
        type: 'RETURN',
        name: cleanName ? `TRẢ LẠI: ${cleanName.toUpperCase()}` : 'TRẢ LẠI HÀNG',
        quantity: null,
        price: null,
        amount: totalAmount,
      },
    ];
  }

  return parts.map((part) => ({
    type: 'RETURN',
    name: `TRẢ LẠI: ${part.toUpperCase()}`,
    quantity: null,
    price: null,
    amount: null,
  }));
};

/**
 * ── 1. VẼ ẢNH BÁO CÁO CÔNG NỢ & THU TIỀN TRONG NGÀY (HTML5 Canvas) ──
 */
const generateDailyDebtImage = ({ selectedDate, transactions, payments }) => {
  if (typeof document === 'undefined') return null;

  const dayTransactions = (transactions || []).filter((t) => toDateKey(t.date) === selectedDate);
  const dayPayments = (payments || []).filter((p) => toDateKey(p.paidAt) === selectedDate);

  const customerMap = {};
  let totalMeatAmount = 0;
  let totalReturnAmount = 0;
  let totalPaymentAmount = 0;

  dayTransactions.forEach((t) => {
    const cId = t.customerId || (t.customer?.name || 'Khách vãng lai');
    const cName = t.customer?.name || 'Khách vãng lai';

    if (!customerMap[cId]) {
      customerMap[cId] = { id: cId, name: cName, entries: [] };
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
          quantity: isQuick ? null : isNaN(q) ? null : q,
          price: isQuick ? null : isNaN(p) ? null : p,
          amount: itemAmt,
        });
      });
    } else {
      totalMeatAmount += amt;
      const noteName = t.note && t.note !== 'Ghi nợ nhanh' ? t.note : 'TIỀN HÀNG';
      customerMap[cId].entries.push({
        type: 'DELIVERY',
        name: noteName.toUpperCase(),
        quantity: null,
        price: null,
        amount: amt,
      });
    }
  });

  dayPayments.forEach((p) => {
    const cId = p.customerId || (p.customer?.name || 'Khách vãng lai');
    const cName = p.customer?.name || 'Khách vãng lai';

    if (!customerMap[cId]) {
      customerMap[cId] = { id: cId, name: cName, entries: [] };
    }

    const amt = parseFloat(p.amount || 0);
    const isReturn = isReturnPayment(p);

    if (isReturn) {
      totalReturnAmount += amt;
      const returnItems = parseReturnItems(p.note, amt);
      returnItems.forEach((ritem) => customerMap[cId].entries.push(ritem));
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

  const activeCustomers = Object.values(customerMap)
    .filter((c) => c.entries && c.entries.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  const finalRemaining = Math.max(0, totalMeatAmount - totalReturnAmount - totalPaymentAmount);

  // Kích thước canvas
  const width = 820;
  const padding = 20;
  const headerHeight = 95;
  const summaryBoxHeight = 65;
  const colHeaderHeight = 36;
  const rowHeight = 32;
  const customerHeaderHeight = 34;

  let totalRows = 0;
  activeCustomers.forEach((c) => {
    totalRows += 1 + c.entries.length;
  });

  const contentHeight = Math.max(totalRows * rowHeight, 100);
  const footerHeight = 45;
  const totalHeight = padding * 2 + headerHeight + summaryBoxHeight + 15 + colHeaderHeight + contentHeight + footerHeight;

  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = totalHeight * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);

  // Nền trắng
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, totalHeight);

  // Khung viền
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(8, 8, width - 16, totalHeight - 16);

  // Header xanh navy sang trọng
  ctx.fillStyle = '#1E3A8A';
  ctx.fillRect(12, 12, width - 24, headerHeight);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BÁO CÁO CÔNG NỢ & THU TIỀN TRONG NGÀY', width / 2, 48);

  ctx.fillStyle = '#93C5FD';
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.fillText(`Ngày báo cáo: ${selectedDate}   •   Tổng khách phát sinh: ${activeCustomers.length} khách`, width / 2, 74);

  // 3 Hộp KPI tóm tắt
  const boxY = 12 + headerHeight + 10;
  const boxW = (width - padding * 2 - 16) / 3;

  // Box 1: Nợ phát sinh
  ctx.fillStyle = '#FEF2F2';
  ctx.fillRect(padding, boxY, boxW, summaryBoxHeight);
  ctx.strokeStyle = '#FECACA';
  ctx.lineWidth = 1;
  ctx.strokeRect(padding, boxY, boxW, summaryBoxHeight);
  ctx.fillStyle = '#991B1B';
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('🔴 NỢ PHÁT SINH', padding + 10, boxY + 22);
  ctx.font = 'bold 16px Arial, sans-serif';
  ctx.fillText(formatCurrency(totalMeatAmount), padding + 10, boxY + 48);

  // Box 2: Đã thu
  const box2X = padding + boxW + 8;
  ctx.fillStyle = '#F0FDF4';
  ctx.fillRect(box2X, boxY, boxW, summaryBoxHeight);
  ctx.strokeStyle = '#BBF7D0';
  ctx.strokeRect(box2X, boxY, boxW, summaryBoxHeight);
  ctx.fillStyle = '#166534';
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.fillText('🟢 ĐÃ THU', box2X + 10, boxY + 22);
  ctx.font = 'bold 16px Arial, sans-serif';
  ctx.fillText(formatCurrency(totalPaymentAmount), box2X + 10, boxY + 48);

  // Box 3: Còn lại
  const box3X = box2X + boxW + 8;
  ctx.fillStyle = '#EFF6FF';
  ctx.fillRect(box3X, boxY, boxW, summaryBoxHeight);
  ctx.strokeStyle = '#BFDBFE';
  ctx.strokeRect(box3X, boxY, boxW, summaryBoxHeight);
  ctx.fillStyle = '#1E40AF';
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.fillText('🔵 CÒN LẠI PHẢI THU', box3X + 10, boxY + 22);
  ctx.fillStyle = finalRemaining > 0 ? '#DC2626' : '#059669';
  ctx.font = 'bold 16px Arial, sans-serif';
  ctx.fillText(formatCurrency(finalRemaining), box3X + 10, boxY + 48);

  // Bảng chi tiết
  let startY = boxY + summaryBoxHeight + 14;
  const colW = {
    name: 300,
    qty: 120,
    price: 150,
    amount: 190,
  };

  // Header cột
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(padding, startY, width - padding * 2, colHeaderHeight);
  ctx.strokeStyle = '#CBD5E1';
  ctx.strokeRect(padding, startY, width - padding * 2, colHeaderHeight);

  ctx.fillStyle = '#334155';
  ctx.font = 'bold 12.5px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('NỘI DUNG GIAO DỊCH / HÀNG HÓA', padding + 12, startY + 22);
  ctx.textAlign = 'center';
  ctx.fillText('SỐ LƯỢNG', padding + colW.name + colW.qty / 2, startY + 22);
  ctx.textAlign = 'right';
  ctx.fillText('ĐƠN GIÁ', padding + colW.name + colW.qty + colW.price - 12, startY + 22);
  ctx.fillText('THÀNH TIỀN', width - padding - 12, startY + 22);

  startY += colHeaderHeight;

  if (activeCustomers.length === 0) {
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(padding, startY, width - padding * 2, 60);
    ctx.strokeStyle = '#E2E8F0';
    ctx.strokeRect(padding, startY, width - padding * 2, 60);
    ctx.fillStyle = '#64748B';
    ctx.font = 'italic 13px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Không có đơn nợ hoặc giao dịch nào phát sinh trong ngày.', width / 2, startY + 35);
    startY += 60;
  } else {
    activeCustomers.forEach((cust, cIdx) => {
      // Dòng khách hàng
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(padding, startY, width - padding * 2, customerHeaderHeight);
      ctx.strokeStyle = '#CBD5E1';
      ctx.strokeRect(padding, startY, width - padding * 2, customerHeaderHeight);

      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 13.5px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`👤 ${cIdx + 1}. ${cust.name}`, padding + 10, startY + 22);

      const custTotalDebt = cust.entries
        .filter((e) => e.type === 'DELIVERY')
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      const custTotalPaid = cust.entries
        .filter((e) => e.type === 'PAYMENT')
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      const custRem = custTotalDebt - custTotalPaid;

      ctx.font = 'bold 12px Arial, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = custRem > 0 ? '#DC2626' : '#059669';
      ctx.fillText(
        `Nợ: ${formatCurrency(custTotalDebt)}  |  Đã trả: ${formatCurrency(custTotalPaid)}`,
        width - padding - 10,
        startY + 22
      );

      startY += customerHeaderHeight;

      // Các dòng chi tiết
      cust.entries.forEach((item, rIdx) => {
        ctx.fillStyle = rIdx % 2 === 0 ? '#FFFFFF' : '#FAFAFA';
        ctx.fillRect(padding, startY, width - padding * 2, rowHeight);
        ctx.strokeStyle = '#F1F5F9';
        ctx.strokeRect(padding, startY, width - padding * 2, rowHeight);

        // Tên hàng
        ctx.textAlign = 'left';
        if (item.type === 'PAYMENT') {
          ctx.fillStyle = '#059669';
          ctx.font = 'bold 12px Arial, sans-serif';
          ctx.fillText(`  ↳ [TIỀN ĐÃ THU]`, padding + 16, startY + 20);
        } else if (item.type === 'RETURN') {
          ctx.fillStyle = '#D97706';
          ctx.font = 'bold 12px Arial, sans-serif';
          ctx.fillText(`  ↳ ${item.name}`, padding + 16, startY + 20);
        } else {
          ctx.fillStyle = '#334155';
          ctx.font = '12px Arial, sans-serif';
          ctx.fillText(`  • ${item.name}`, padding + 16, startY + 20);
        }

        // Số lượng
        ctx.textAlign = 'center';
        ctx.fillStyle = '#475569';
        ctx.font = '12px Arial, sans-serif';
        ctx.fillText(item.quantity ? String(item.quantity) : '-', padding + colW.name + colW.qty / 2, startY + 20);

        // Đơn giá
        ctx.textAlign = 'right';
        ctx.fillText(
          item.price ? new Intl.NumberFormat('vi-VN').format(item.price) : '-',
          padding + colW.name + colW.qty + colW.price - 12,
          startY + 20
        );

        // Thành tiền
        ctx.font = 'bold 12px Arial, sans-serif';
        if (item.type === 'PAYMENT') {
          ctx.fillStyle = '#059669';
          ctx.fillText(`+${new Intl.NumberFormat('vi-VN').format(item.amount)} đ`, width - padding - 12, startY + 20);
        } else if (item.type === 'RETURN') {
          ctx.fillStyle = '#D97706';
          ctx.fillText(
            item.amount ? `-${new Intl.NumberFormat('vi-VN').format(item.amount)} đ` : '-',
            width - padding - 12,
            startY + 20
          );
        } else {
          ctx.fillStyle = '#DC2626';
          ctx.fillText(`${new Intl.NumberFormat('vi-VN').format(item.amount)} đ`, width - padding - 12, startY + 20);
        }

        startY += rowHeight;
      });
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
};

/**
 * ── 2. VẼ ẢNH KHÁCH QUEN CHƯA CÓ ĐƠN NỢ TRONG NGÀY (HTML5 Canvas) ──
 */
const generateMissingCustomersImage = ({ selectedDate, allTransactions, customers }) => {
  if (typeof document === 'undefined') return null;

  const parts = (selectedDate || '').split('/');
  if (parts.length !== 3) return null;

  const targetDateObj = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  targetDateObj.setHours(0, 0, 0, 0);

  // 1. Tìm 5 buổi bán gần nhất trước ngày kiểm tra
  const pastTxDates = Array.from(
    new Set(
      (allTransactions || [])
        .filter((t) => {
          if (!t.date) return false;
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

  allTransactions.forEach((tx) => {
    if (!tx.customerId || !tx.date) return;
    const txDateKey = toDateKey(tx.date);

    if (recent5DaysSet.has(txDateKey)) {
      if (!recentTxByCustomer[tx.customerId]) {
        recentTxByCustomer[tx.customerId] = [];
      }
      recentTxByCustomer[tx.customerId].push(tx);
    }

    if (txDateKey === selectedDate) {
      if (!todayTxByCustomer[tx.customerId]) {
        todayTxByCustomer[tx.customerId] = [];
      }
      todayTxByCustomer[tx.customerId].push(tx);
    }
  });

  // Khách quen: có đơn trong 5 buổi gần nhất nhưng chưa có đơn hôm nay
  const missingCustomers = [];
  customers.forEach((cust) => {
    if (cust.isBadDebt) return;
    const recentOrders = recentTxByCustomer[cust.id] || [];
    const todayOrders = todayTxByCustomer[cust.id] || [];
    if (recentOrders.length > 0 && todayOrders.length === 0) {
      missingCustomers.push(cust);
    }
  });

  // Vẽ Canvas
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
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = totalHeight * scale;
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
};

/**
 * ── 3. VẼ ẢNH BÁO CÁO ĐƠN NỢ TRÙNG / KHÁCH TRÙNG (HTML5 Canvas) ──
 */
const generateDuplicateDebtsImage = ({ selectedDate, transactions }) => {
  if (typeof document === 'undefined') return null;

  const dayTransactions = (transactions || []).filter((t) => toDateKey(t.date) === selectedDate);

  // Đếm số đơn nợ của từng khách hàng
  const countByCustomer = {};
  dayTransactions.forEach((t) => {
    const cId = t.customerId || (t.customer?.name || 'Khách vãng lai');
    countByCustomer[cId] = (countByCustomer[cId] || 0) + 1;
  });

  // Lọc các đơn của khách hàng có >= 2 đơn nợ
  const duplicateItems = dayTransactions
    .filter((t) => {
      const cId = t.customerId || (t.customer?.name || 'Khách vãng lai');
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

  // Kích thước canvas
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
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = totalHeight * scale;
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

    // 1. Tải dữ liệu nếu chưa được truyền vào
    let finalTransactions = transactions;
    let finalPayments = payments;
    let finalCustomers = customers;

    const promises = [];
    if (!finalTransactions) {
      promises.push(api.get('/transactions').then((res) => (finalTransactions = res.data?.data || [])));
    }
    if (!finalPayments) {
      promises.push(
        api.get('/payments', { params: { date: dateStr } }).then((res) => (finalPayments = res.data?.data || []))
      );
    }
    if (!finalCustomers) {
      promises.push(
        api.get('/customers?isBadDebt=false').then((res) => (finalCustomers = res.data?.data || []))
      );
    }

    if (promises.length > 0) {
      await Promise.all(promises);
    }

    // Đảm bảo có đủ toàn bộ lịch sử giao dịch cho phân tích khách quen (5 buổi gần nhất)
    let allHistoryTransactions = finalTransactions;
    if (finalTransactions.length < 50) {
      try {
        const fullTxRes = await api.get('/transactions');
        if (fullTxRes.data?.data) {
          allHistoryTransactions = fullTxRes.data.data;
        }
      } catch (txErr) {
        console.warn('Không thể tải toàn bộ lịch sử, sử dụng danh sách hiện tại:', txErr);
      }
    }

    // 2. Tạo Ảnh 1: Báo cáo công nợ & thu tiền trong ngày
    onProgress?.('Đang tạo ảnh 1/3: Báo cáo công nợ ngày...');
    const img1 = generateDailyDebtImage({
      selectedDate: dateStr,
      transactions: finalTransactions,
      payments: finalPayments,
    });

    // 3. Tạo Ảnh 2: Danh sách khách quen chưa có đơn nợ hôm nay
    onProgress?.('Đang tạo ảnh 2/3: Khách quen chưa có đơn...');
    const img2 = generateMissingCustomersImage({
      selectedDate: dateStr,
      allTransactions: allHistoryTransactions,
      customers: finalCustomers,
    });

    // 4. Tạo Ảnh 3: Báo cáo đơn nợ trùng / khách trùng
    onProgress?.('Đang tạo ảnh 3/3: Báo cáo đơn nợ trùng...');
    const img3 = generateDuplicateDebtsImage({
      selectedDate: dateStr,
      transactions: finalTransactions,
    });

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
      showGlobalToast('Không tạo được hình ảnh báo cáo nào.', 'warning');
      return { success: false, count: 0 };
    }

    onProgress?.(`Đang tải về ${itemsToExport.length} ảnh báo cáo...`);

    // 5. Tự động tải tất cả file về máy tính (PC) hoặc chuyển tiếp Zalo (Mobile)
    await downloadOrShareMultipleImages({
      items: itemsToExport,
      title: `Trọn bộ 3 ảnh báo cáo ngày ${dateStr}`,
      text: `Báo cáo công nợ, khách chưa lên đơn và đơn trùng ngày ${dateStr}`,
    });

    return { success: true, count: itemsToExport.length };
  } catch (err) {
    console.error('[EXPORT DAILY REPORT BUNDLE ERROR]', err);
    showGlobalToast('Đã xảy ra lỗi khi tạo trọn bộ ảnh báo cáo. Vui lòng thử lại.', 'error');
    return { success: false, count: 0 };
  }
};
