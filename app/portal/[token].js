// meat-management-fe/app/portal/[token].js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import axios from 'axios';
import PortalFeedbackModal from '../../src/components/PortalFeedbackModal';
import BranchDebtModal from '../../src/components/BranchDebtModal';
import ImagePreviewModal from '../../src/components/ImagePreviewModal';
import InvoiceImageViewerModal from '../../src/components/InvoiceImageViewerModal';
import CustomerPriceCheckModal from '../../src/components/CustomerPriceCheckModal';
import DatePickerInput from '../../src/components/DatePickerInput';
import CustomSelect from '../../src/components/CustomSelect';
import { showGlobalToast } from '../../src/store/toastStore';
import { COLORS } from '../../src/theme';
import { matchSearch } from '../../src/utils/searchHelper';

import { API_HOST } from '../../src/api/client';

const formatCurrency = (val) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
    .format(val || 0)
    .replace('₫', 'đ');

const formatShortPrice = (val) => {
  if (val == null || isNaN(val)) return '-';
  const num = Math.round(Number(val));
  return new Intl.NumberFormat('vi-VN').format(num);
};

const formatDate = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

// Helper chuyển chuỗi DD/MM/YYYY thành Date object
const parseDDMMYYYY = (str, isEndOfDay = false) => {
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

// Helper tính khoảng ngày theo preset (tối đa theo tháng)
const getPresetRange = (presetKey) => {
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  if (presetKey === 'last_month') {
    const prevDate = new Date(y, m - 1, 1);
    const py = prevDate.getFullYear();
    const pm = prevDate.getMonth();
    const pDays = new Date(py, pm + 1, 0).getDate();
    return {
      from: `01/${pad(pm + 1)}/${py}`,
      to: `${pad(pDays)}/${pad(pm + 1)}/${py}`,
    };
  }

  if (presetKey === '7_days') {
    const fromDate = new Date(now);
    fromDate.setDate(now.getDate() - 6);
    return {
      from: `${pad(fromDate.getDate())}/${pad(fromDate.getMonth() + 1)}/${fromDate.getFullYear()}`,
      to: `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${y}`,
    };
  }

  if (presetKey === 'first_half') {
    return {
      from: `01/${pad(m + 1)}/${y}`,
      to: `15/${pad(m + 1)}/${y}`,
    };
  }

  if (presetKey === 'second_half') {
    return {
      from: `16/${pad(m + 1)}/${y}`,
      to: `${pad(daysInMonth)}/${pad(m + 1)}/${y}`,
    };
  }

  // Mặc định là Tháng này (tối đa theo tháng)
  return {
    from: `01/${pad(m + 1)}/${y}`,
    to: `${pad(daysInMonth)}/${pad(m + 1)}/${y}`,
  };
};

// Helper kiểm tra giao dịch trả lại hàng
const isReturnPayment = (pm) => {
  const note = (pm?.note || '').toLowerCase();
  return (
    note.includes('trả hàng') ||
    note.includes('trả lại') ||
    note.includes('hoàn hàng')
  );
};

// Danh sách mốc thời gian lọc nhanh (Tối đa là theo tháng)
const TIME_PRESETS = [
  { key: 'this_month', label: 'Tháng này' },
  { key: 'last_month', label: 'Tháng trước' },
  { key: '7_days', label: '7 ngày qua' },
  { key: 'first_half', label: '1 - 15' },
  { key: 'second_half', label: '16 - hết tháng' },
];

// Helper phân tích danh sách các món thịt trả lại từ ghi chú
const parseReturnItems = (note, defaultAmount) => {
  if (!note) return [{ type: 'RETURN', name: 'TRẢ HÀNG', quantity: null, price: null, amount: defaultAmount }];

  // Xóa các tag hệ thống
  const clean = note.replace(/\[Trả lại hàng\]|\[Trả hàng nhanh\]|\[Trả hàng\]/gi, '').trim();

  // Khớp từng món: <số lượng><đơn vị> <tên thịt> (<thành tiền>)
  const itemRegex = /(\d+(?:[.,]\d+)?)\s*([a-zA-ZÀ-ỹ]*)\s+(.+?)\s*\(\s*([\d.,]+)[\s\u00a0]*[đ₫VND]?\s*\)(?:\s*,|\s*-|$)/gi;
  const items = [];
  let match;
  while ((match = itemRegex.exec(clean)) !== null) {
    const qtyStr = match[1].replace(',', '.');
    const qty = parseFloat(qtyStr);
    let prodName = match[3].trim().toUpperCase();
    prodName = prodName.replace(/^(TRẢ HÀNG|TRẢ LẠI|TRẢ)\s*:?\s*/gi, '').trim();
    const amtStr = match[4].replace(/\./g, '').replace(/,/g, '');
    const amt = parseFloat(amtStr) || 0;
    const price = (qty && qty > 0 && amt > 0) ? Math.round(amt / qty) : null;
    items.push({
      type: 'RETURN',
      name: `TRẢ: ${prodName}`,
      quantity: !isNaN(qty) ? qty : null,
      price: price,
      amount: amt,
    });
  }

  if (items.length === 0) {
    let cleanName = clean.toUpperCase().replace(/^(TRẢ HÀNG|TRẢ LẠI|TRẢ)\s*:?\s*/gi, '').trim();
    const displayName = cleanName ? `TRẢ: ${cleanName}` : 'TRẢ HÀNG';
    return [{
      type: 'RETURN',
      name: displayName,
      quantity: null,
      price: null,
      amount: defaultAmount,
    }];
  }

  return items;
};

// Helper xác định ngày hiệu lực và tên hiển thị cho khoản thanh toán dựa vào tháng nợ mục tiêu
const getEffectivePaymentInfo = (pm) => {
  const trimNote = (pm.note || '').trim();
  const monthMatch = trimNote.match(/^Thanh toán nợ Tháng (\d{2})\/(\d{4})/i) ||
    trimNote.match(/Thanh toán (?:nợ|hóa đơn) [Tt]háng (\d{2})\/(\d{4})/i);

  // Trích xuất ngày thanh toán thực tế nếu có trong ngoặc (ví dụ: "(ngày 06/09/2026)")
  const actualDateMatch = trimNote.match(/\(ngày\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\)/i);
  const rawDate = new Date(pm.paidAt);
  let actualPayDate = rawDate;
  if (actualDateMatch) {
    const aDay = parseInt(actualDateMatch[1], 10);
    const aMonth = parseInt(actualDateMatch[2], 10);
    const aYear = actualDateMatch[3] ? parseInt(actualDateMatch[3], 10) : rawDate.getFullYear();
    actualPayDate = new Date(aYear, aMonth - 1, aDay, 12, 0, 0);
  }

  if (monthMatch) {
    const targetM = parseInt(monthMatch[1], 10);
    const targetY = parseInt(monthMatch[2], 10);

    const actualM = actualPayDate.getMonth() + 1;
    const actualY = actualPayDate.getFullYear();

    // CHỈ đưa về ngày cuối cùng của tháng mục tiêu khi đây là khoản trả nợ cho THÁNG CŨ
    // Ví dụ: Trả nợ tháng 8 vào ngày 07/09 -> đưa về 31/08
    if (targetY < actualY || (targetY === actualY && targetM < actualM)) {
      const effectiveDate = new Date(targetY, targetM, 0, 23, 59, 59, 999);
      const dDay = String(actualPayDate.getDate()).padStart(2, '0');
      const dMonth = String(actualPayDate.getMonth() + 1).padStart(2, '0');
      return {
        effectiveDate,
        displayName: `THANH TOÁN (ngày ${dDay}/${dMonth})`,
      };
    }

    // Nếu thanh toán cho chính tháng hiện tại (ví dụ: trả nợ tháng 9 vào ngày 06/09)
    // -> Giữ nguyên ngày thực tế thanh toán (06/09), tuyệt đối KHÔNG đẩy về 30/09!
    return {
      effectiveDate: actualPayDate,
      displayName: 'THANH TOÁN',
    };
  }

  const dateMatch = trimNote.match(/^Thanh toán nợ ngày (\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if (dateMatch) {
    const dd = parseInt(dateMatch[1], 10);
    const mm = parseInt(dateMatch[2], 10);
    const yyyy = parseInt(dateMatch[3], 10);
    const effectiveDate = new Date(yyyy, mm - 1, dd, 12, 0, 0);
    return { effectiveDate, displayName: 'THANH TOÁN' };
  }

  return { effectiveDate: rawDate, displayName: 'THANH TOÁN' };
};

// ─── THỨ TỰ NHÀ HÀNG & MÀU NỀN PHÂN BIỆT TỪNG QUÁN ───
const PREFERRED_RESTAURANT_ORDER = [
  '373 kim mã',
  '126 nguyễn khánh toàn',
  'trường hoàng',
  'cuốn an khánh',
  'giảng võ',
  'cuốn láng hạ',
  '52 trần thái tông',
  '236 xã đàn',
  '268 khương đình',
];

// Bảng màu nền nhạt (pastel) sang trọng để phân biệt từng nhà hàng
const RESTAURANT_PASTEL_COLORS = [
  '#FFFFFF', // 0: Trắng tinh tế (373 Kim Mã)
  '#EFF6FF', // 1: Xanh dương nhạt (126 Nguyễn Khánh Toàn)
  '#F0FDF4', // 2: Xanh lục bạc hà nhạt (Trường Hoàng)
  '#FFFBEB', // 3: Vàng kem nhạt (Cuốn An Khánh)
  '#F5F3FF', // 4: Tím oải hương nhạt (Giảng Võ)
  '#ECFEFF', // 5: Xanh ngọc biển nhạt (Cuốn Láng Hạ)
  '#FEF2F2', // 6: Hồng phấn cực nhạt (52 Trần Thái Tông)
  '#F0FDFA', // 7: Xanh mòng két nhạt (236 Xã Đàn)
  '#FAF5FF', // 8: Tím phấn nhạt (268 Khương Đình)
  '#FFF7ED', // 9: Cam sữa nhạt
];

// Chuẩn hóa tên quán để so khớp không dấu, không phân biệt hoa thường
const normalizeRestaurantName = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
};

// Lấy thứ hạng ưu tiên của nhà hàng
const getRestaurantRank = (customerName, branchList = []) => {
  if (!customerName) return 9999;
  const norm = normalizeRestaurantName(customerName);

  // 1. Kiểm tra danh sách thứ tự ưu tiên của chuỗi
  for (let i = 0; i < PREFERRED_RESTAURANT_ORDER.length; i++) {
    const target = normalizeRestaurantName(PREFERRED_RESTAURANT_ORDER[i]);
    if (norm.includes(target) || target.includes(norm)) {
      return i;
    }
  }

  // 2. Kiểm tra danh sách chi nhánh truyền vào từ link nhóm
  if (Array.isArray(branchList) && branchList.length > 0) {
    for (let i = 0; i < branchList.length; i++) {
      const bName = normalizeRestaurantName(branchList[i]?.name || branchList[i]);
      if (bName && (norm.includes(bName) || bName.includes(norm))) {
        return 100 + i;
      }
    }
  }

  return 1000;
};

// Lấy màu nền pastel cố định cho từng quán
const getRestaurantColor = (customerName, branchList = []) => {
  if (!customerName) return '#FFFFFF';
  const rank = getRestaurantRank(customerName, branchList);
  return RESTAURANT_PASTEL_COLORS[Math.abs(rank) % RESTAURANT_PASTEL_COLORS.length];
};

// Helper gom nhóm giao dịch và thanh toán theo từng ngày (Bảng kê chi tiết chuẩn hóa đơn)
const buildInvoiceRows = (
  transactions = [],
  payments = [],
  fromDateStr = '',
  toDateStr = '',
  sortOrder = 'desc',
  branchList = []
) => {
  const fromD = parseDDMMYYYY(fromDateStr, false);
  const toD = parseDDMMYYYY(toDateStr, true);

  const filteredTxs = transactions.filter((tx) => {
    if (!tx.date) return false;
    const d = new Date(tx.date);
    if (isNaN(d.getTime())) return false;
    if (fromD && d < fromD) return false;
    if (toD && d > toD) return false;
    return true;
  });

  const filteredPays = (payments || []).filter((pm) => {
    if (!pm.paidAt) return false;
    const { effectiveDate } = getEffectivePaymentInfo(pm);
    if (isNaN(effectiveDate.getTime())) return false;
    if (fromD && effectiveDate < fromD) return false;
    if (toD && effectiveDate > toD) return false;
    return true;
  });

  const dayMap = {};
  let totalMeatAmount = 0;
  let totalReturnAmount = 0;
  let totalPaymentAmount = 0;

  // 1. Gom các món thịt từ đơn hàng
  filteredTxs.forEach((tx) => {
    const d = new Date(tx.date);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const dateKey = `${dd}/${mm}/${yyyy}`;
    const displayDate = `${dd}/${mm}`;

    if (!dayMap[dateKey]) {
      dayMap[dateKey] = {
        date: tx.date,
        dateKey,
        displayDate,
        entries: [],
        invoices: [],
      };
    }

    // Thu thập danh sách ảnh hóa đơn đính kèm của đơn
    if (tx.invoices && tx.invoices.length > 0) {
      dayMap[dateKey].invoices.push(...tx.invoices);
    }

    if (tx.items && tx.items.length > 0) {
      tx.items.forEach((item) => {
        const amt = Number(item.total) || (Number(item.quantity) * Number(item.price)) || 0;
        totalMeatAmount += amt;
        dayMap[dateKey].entries.push({
          type: 'MEAT',
          name: (item.productName || 'THỊT').toUpperCase(),
          quantity: item.quantity != null ? Number(item.quantity) : null,
          unit: item.unit || 'kg',
          price: item.price != null ? Number(item.price) : null,
          amount: amt,
          customerName: tx.customerName,
        });
      });
    } else {
      const amt = Number(tx.totalAmount) || 0;
      totalMeatAmount += amt;
      const noteName = tx.note ? tx.note.toUpperCase() : 'GIAO HÀNG';
      dayMap[dateKey].entries.push({
        type: 'DELIVERY',
        name: noteName,
        quantity: null,
        unit: 'kg',
        price: null,
        amount: amt,
        customerName: tx.customerName,
      });
    }
  });

  // 2. Gom các khoản thanh toán / trả hàng
  filteredPays.forEach((pm) => {
    const { effectiveDate, displayName } = getEffectivePaymentInfo(pm);
    const dd = String(effectiveDate.getDate()).padStart(2, '0');
    const mm = String(effectiveDate.getMonth() + 1).padStart(2, '0');
    const yyyy = effectiveDate.getFullYear();
    const dateKey = `${dd}/${mm}/${yyyy}`;
    const displayDate = `${dd}/${mm}`;

    if (!dayMap[dateKey]) {
      dayMap[dateKey] = {
        date: effectiveDate.toISOString(),
        dateKey,
        displayDate,
        entries: [],
        invoices: [],
      };
    }

    const amt = Number(pm.amount) || 0;
    const isRet = isReturnPayment(pm);
    const payCustomerName = pm.customerName || pm.customer?.name || null;

    if (isRet) {
      totalReturnAmount += amt;
      const returnItems = parseReturnItems(pm.note, amt);
      returnItems.forEach((rItem) => {
        dayMap[dateKey].entries.push({
          ...rItem,
          customerName: payCustomerName,
        });
      });
    } else {
      totalPaymentAmount += amt;
      dayMap[dateKey].entries.push({
        type: 'PAYMENT',
        name: displayName,
        quantity: null,
        price: null,
        amount: amt,
        customerName: payCustomerName,
      });
    }
  });

  // 3. Sắp xếp các dòng món trong từng ngày theo thứ tự nhà hàng ưu tiên
  Object.values(dayMap).forEach((day) => {
    day.entries.sort((a, b) => {
      const rankA = getRestaurantRank(a.customerName, branchList);
      const rankB = getRestaurantRank(b.customerName, branchList);
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      if (rankA === 1000 && rankB === 1000) {
        const nameA = a.customerName || '';
        const nameB = b.customerName || '';
        const cmp = nameA.localeCompare(nameB, 'vi');
        if (cmp !== 0) return cmp;
      }
      // Trong cùng 1 nhà hàng: thịt trước, trả hàng sau, thanh toán cuối
      const typeOrder = { MEAT: 1, DELIVERY: 2, RETURN: 3, PAYMENT: 4 };
      return (typeOrder[a.type] || 5) - (typeOrder[b.type] || 5);
    });
  });

  // Sắp xếp các ngày theo tùy chọn (mới nhất hoặc cũ nhất)
  const sortedDays = Object.values(dayMap).sort((a, b) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
  });

  // Thêm dòng TỔNG tiền thịt cho các ngày có từ 2 loại thịt trở lên
  sortedDays.forEach((day) => {
    const meatEntries = (day.entries || []).filter((e) => e.type === 'MEAT' || e.type === 'DELIVERY');
    if (meatEntries.length > 1) {
      const dayMeatTotal = meatEntries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

      let lastMeatIdx = -1;
      for (let i = day.entries.length - 1; i >= 0; i--) {
        if (day.entries[i].type === 'MEAT' || day.entries[i].type === 'DELIVERY') {
          lastMeatIdx = i;
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

      if (lastMeatIdx >= 0) {
        day.entries.splice(lastMeatIdx + 1, 0, totalEntry);
      } else {
        day.entries.push(totalEntry);
      }
    }
  });

  const finalDebt = Math.max(0, totalMeatAmount - totalReturnAmount - totalPaymentAmount);

  return {
    sortedDays,
    totals: {
      totalMeat: totalMeatAmount,
      totalReturn: totalReturnAmount,
      totalPaid: totalPaymentAmount,
      finalDebt,
    },
  };
};

// Helper vẽ ảnh Canvas độ nét cao 2x chuẩn hóa đơn kế toán
const drawInvoiceCanvas = (sortedDays, totals, customerName, fromDateStr = '', toDateStr = '', timePresetLabel = '', branchList = []) => {
  if (typeof document === 'undefined') return null;
  const startX = 36;
  const colWidths = [60, 200, 65, 100, 135]; // Tổng chiều rộng 1 panel: 560px
  const panelWidth = colWidths.reduce((a, b) => a + b, 0);
  const isSplit = sortedDays.length > 10;
  const panelGap = 16;
  const canvasWidth = isSplit ? (startX * 2 + panelWidth * 2 + panelGap) : (startX * 2 + panelWidth);

  const totalEntries = sortedDays.reduce((sum, d) => sum + d.entries.length, 0);
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
      const runningRight = totalEntries - runningLeft;
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

  const leftCount = leftDays.reduce((sum, d) => sum + d.entries.length, 0);
  const rightCount = rightDays.reduce((sum, d) => sum + d.entries.length, 0);
  const maxRows = Math.max(leftCount, rightCount, 1);
  const tableContentHeight = maxRows * rowHeight;

  const summaryCount = 1 + (totals.totalReturn > 0 ? 1 : 0) + (totals.totalPaid > 0 ? 1 : 0) + 1;
  const summaryHeight = summaryCount * summaryRowHeight;
  const summaryStartY = startTableY + tableHeaderHeight + tableContentHeight + 16;
  const canvasHeight = summaryStartY + summaryHeight + 30;

  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = canvasWidth * scale;
  canvas.height = canvasHeight * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  // Nền trắng
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Card Header tiêu đề
  const headerCardHeight = 44;
  const headerCardY = 20;
  const cardX = startX;
  const cardW = canvasWidth - startX * 2;

  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(cardX, headerCardY, cardW, headerCardHeight);
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1;
  ctx.strokeRect(cardX, headerCardY, cardW, headerCardHeight);

  const rangeLabel = fromDateStr && toDateStr
    ? `${fromDateStr} - ${toDateStr}`
    : (fromDateStr ? `Từ ${fromDateStr}` : (toDateStr ? `Đến ${toDateStr}` : (timePresetLabel || 'Toàn bộ')));

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 16.5px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    `BẢNG KÊ CÔNG NỢ: ${customerName || ''} (${rangeLabel})`,
    canvasWidth / 2,
    headerCardY + headerCardHeight / 2
  );

  // Hàm vẽ 1 panel bảng
  const drawPanel = (panelDays, panelStartX) => {
    let panelY = startTableY;

    // Header bảng
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
    ctx.fillText('KG', pColX[2] + colWidths[2] - 8, hMid);
    ctx.fillText('ĐƠN GIÁ', pColX[3] + colWidths[3] - 8, hMid);
    ctx.fillText('THÀNH TIỀN', pColX[4] + colWidths[4] - 8, hMid);

    panelY += tableHeaderHeight;

    // Các dòng dữ liệu
    panelDays.forEach((day) => {
      const dayHeight = day.entries.length * rowHeight;
      const dayStartY = panelY;

      day.entries.forEach((entry, idx) => {
        const itemY = dayStartY + idx * rowHeight;
        const midY = itemY + rowHeight / 2;

        // Màu nền nhạt phân biệt từng nhà hàng
        const isDayTotal = entry.type === 'DAY_TOTAL';
        let rowBg = '#FFFFFF';
        if (isDayTotal) {
          rowBg = '#F8FAFC';
        } else if (entry.type === 'RETURN') {
          rowBg = '#FFF7ED';
        } else if (entry.type === 'PAYMENT') {
          rowBg = '#F0FDF4';
        } else if (entry.customerName) {
          rowBg = getRestaurantColor(entry.customerName, branchList);
        }

        ctx.fillStyle = rowBg;
        ctx.fillRect(panelStartX, itemY, panelWidth, rowHeight);

        if (isDayTotal) {
          ctx.strokeStyle = '#CBD5E1';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pColX[1], itemY);
          ctx.lineTo(panelStartX + panelWidth, itemY);
          ctx.stroke();
        }

        // Tên hàng
        ctx.textAlign = 'left';
        if (isDayTotal) {
          ctx.fillStyle = '#0F172A';
          ctx.font = 'bold 13.5px Arial, sans-serif';
          ctx.fillText(entry.name, pColX[1] + 8, midY);
        } else if (entry.type === 'RETURN') {
          ctx.fillStyle = '#DC2626';
          ctx.font = '13.5px Arial, sans-serif';
          const displayName = entry.customerName ? `[${entry.customerName}] ${entry.name}` : entry.name;
          ctx.fillText(displayName, pColX[1] + 8, midY);
        } else if (entry.type === 'PAYMENT') {
          ctx.fillStyle = '#059669';
          ctx.font = '13.5px Arial, sans-serif';
          const displayName = entry.customerName ? `[${entry.customerName}] ${entry.name}` : entry.name;
          ctx.fillText(displayName, pColX[1] + 8, midY);
        } else {
          ctx.fillStyle = '#0F172A';
          ctx.font = '13.5px Arial, sans-serif';
          const displayName = entry.customerName ? `[${entry.customerName}] ${entry.name}` : entry.name;
          ctx.fillText(displayName, pColX[1] + 8, midY);
        }

        // SL
        ctx.textAlign = 'right';
        ctx.fillStyle = entry.type === 'RETURN' ? '#DC2626' : '#0F172A';
        const qtyText = isDayTotal ? '-' : (entry.quantity != null ? String(entry.quantity) : '-');
        ctx.fillText(qtyText, pColX[2] + colWidths[2] - 8, midY);

        // Đơn giá
        const priceText = isDayTotal ? '-' : (entry.price != null ? new Intl.NumberFormat('vi-VN').format(entry.price) : '-');
        ctx.font = 'bold 14px Arial, sans-serif';
        ctx.fillText(priceText, pColX[3] + colWidths[3] - 8, midY);

        // Thành tiền
        const amtText = new Intl.NumberFormat('vi-VN').format(entry.amount);
        ctx.font = 'bold 14.5px Arial, sans-serif';
        if (isDayTotal) {
          ctx.fillStyle = '#0F172A';
          ctx.fillText(amtText, pColX[4] + colWidths[4] - 8, midY);
        } else if (entry.type === 'RETURN' || entry.type === 'PAYMENT') {
          ctx.fillText(`-${amtText}`, pColX[4] + colWidths[4] - 8, midY);
        } else {
          ctx.fillText(amtText, pColX[4] + colWidths[4] - 8, midY);
        }

        // Kẻ ngang giữa các món (nét đậm phân cách giữa các nhà hàng, nét mảnh giữa các món trong cùng nhà hàng)
        if (idx < day.entries.length - 1) {
          const nextEntry = day.entries[idx + 1];
          const isBoundary =
            Boolean(entry.customerName || nextEntry?.customerName) &&
            entry.customerName !== nextEntry?.customerName;

          ctx.beginPath();
          ctx.moveTo(pColX[1], itemY + rowHeight);
          ctx.lineTo(panelStartX + panelWidth, itemY + rowHeight);

          if (isBoundary) {
            ctx.strokeStyle = '#64748B'; // Đậm vừa: phân cách cửa hàng
            ctx.lineWidth = 1.8;
          } else {
            ctx.strokeStyle = '#F1F5F9'; // Nhẹ nhất: các món cùng cửa hàng
            ctx.lineWidth = 1;
          }
          ctx.stroke();
        }
      });

      // Kẻ dọc giữa các cột
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1;
      for (let c = 1; c < pColX.length; c++) {
        ctx.beginPath();
        ctx.moveTo(pColX[c], dayStartY);
        ctx.lineTo(pColX[c], dayStartY + dayHeight);
        ctx.stroke();
      }

      // Ô ngày gộp chung
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(pColX[0], dayStartY, colWidths[0], dayHeight);
      ctx.strokeStyle = '#CBD5E1';
      ctx.strokeRect(pColX[0], dayStartY, colWidths[0], dayHeight);

      ctx.fillStyle = '#334155';
      ctx.font = '13.5px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(day.displayDate, pColX[0] + colWidths[0] / 2, dayStartY + dayHeight / 2);

      // Kẻ ngang phân cách ngày (ĐẬM NHẤT)
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2.8;
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
    drawPanel(rightDays, startX + panelWidth + panelGap);
  }

  // Khối tổng kết
  const summaryStartX = isSplit ? (startX + panelWidth + panelGap) : startX;
  let curSummaryY = summaryStartY;
  const summaryColLeft = 240;

  // 1. Tổng tiền hàng
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(summaryStartX, curSummaryY, panelWidth, summaryRowHeight);
  ctx.strokeStyle = '#CBD5E1';
  ctx.strokeRect(summaryStartX, curSummaryY, panelWidth, summaryRowHeight);
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('TỔNG TIỀN HÀNG:', summaryStartX + summaryColLeft, curSummaryY + summaryRowHeight / 2);
  ctx.font = 'bold 18px Arial, sans-serif';
  ctx.fillText(`${new Intl.NumberFormat('vi-VN').format(totals.totalMeat)} đ`, summaryStartX + panelWidth - 12, curSummaryY + summaryRowHeight / 2);
  curSummaryY += summaryRowHeight;

  // 2. Trả hàng
  if (totals.totalReturn > 0) {
    ctx.fillStyle = '#FFF7ED';
    ctx.fillRect(summaryStartX, curSummaryY, panelWidth, summaryRowHeight);
    ctx.strokeStyle = '#FED7AA';
    ctx.strokeRect(summaryStartX, curSummaryY, panelWidth, summaryRowHeight);
    ctx.fillStyle = '#C2410C';
    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.fillText('TIỀN HÀNG TRẢ VỀ:', summaryStartX + summaryColLeft, curSummaryY + summaryRowHeight / 2);
    ctx.fillStyle = '#DC2626';
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.fillText(`- ${new Intl.NumberFormat('vi-VN').format(totals.totalReturn)} đ`, summaryStartX + panelWidth - 12, curSummaryY + summaryRowHeight / 2);
    curSummaryY += summaryRowHeight;
  }

  // 3. Đã thanh toán
  if (totals.totalPaid > 0) {
    ctx.fillStyle = '#F0FDF4';
    ctx.fillRect(summaryStartX, curSummaryY, panelWidth, summaryRowHeight);
    ctx.strokeStyle = '#BBF7D0';
    ctx.strokeRect(summaryStartX, curSummaryY, panelWidth, summaryRowHeight);
    ctx.fillStyle = '#047857';
    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.fillText('ĐÃ THANH TOÁN:', summaryStartX + summaryColLeft, curSummaryY + summaryRowHeight / 2);
    ctx.fillStyle = '#059669';
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.fillText(`- ${new Intl.NumberFormat('vi-VN').format(totals.totalPaid)} đ`, summaryStartX + panelWidth - 12, curSummaryY + summaryRowHeight / 2);
    curSummaryY += summaryRowHeight;
  }

  // 4. Còn lại phải thu
  ctx.fillStyle = '#EFF6FF';
  ctx.fillRect(summaryStartX, curSummaryY, panelWidth, summaryRowHeight);
  ctx.strokeStyle = '#93C5FD';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(summaryStartX, curSummaryY, panelWidth, summaryRowHeight);
  ctx.fillStyle = '#1E3A8A';
  ctx.font = 'bold 14.5px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('CÒN LẠI PHẢI THU:', summaryStartX + summaryColLeft, curSummaryY + summaryRowHeight / 2);
  ctx.fillStyle = totals.finalDebt > 0 ? '#DC2626' : '#059669';
  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.fillText(`${new Intl.NumberFormat('vi-VN').format(totals.finalDebt)} đ`, summaryStartX + panelWidth - 12, curSummaryY + summaryRowHeight / 2);

  return canvas.toDataURL('image/png');
};

export default function PortalScreen() {
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const feedbackModalRef = useRef(null);
  const imagePreviewModalRef = useRef(null);
  const branchDebtModalRef = useRef(null);
  const invoiceViewerRef = useRef(null);
  const customerPriceCheckModalRef = useRef(null);

  // Mở modal xem phóng to ảnh hóa đơn trên Portal
  const handleOpenInvoiceModal = (day) => {
    if (invoiceViewerRef.current && day.invoices && day.invoices.length > 0) {
      invoiceViewerRef.current.open({
        images: day.invoices,
        title: `Hóa đơn ngày ${day.dateKey}`,
        subtitle: `Ngày: ${day.dateKey}`,
      });
    } else {
      showGlobalToast('Ngày này chưa có ảnh chụp hóa đơn đính kèm.', 'info');
    }
  };

  const { token } = useLocalSearchParams();

  // Bộ lọc từ ngày - đến ngày và thứ tự sắp xếp bảng kê (mặc định tháng này, tối đa theo tháng)
  const initialRange = getPresetRange('this_month');
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [timePreset, setTimePreset] = useState('this_month');
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' (mới nhất) | 'asc' (từ đầu tháng)
  const [searchKeyword, setSearchKeyword] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [exportingImage, setExportingImage] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [portalInfo, setPortalInfo] = useState(null);

  // Trạng thái mã PIN
  const [pinRequired, setPinRequired] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [sessionToken, setSessionToken] = useState(null);

  // Trạng thái dữ liệu Portal
  const [portalData, setPortalData] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('all');
  const [activeTab, setActiveTab] = useState('transactions'); // 'transactions' | 'prices' | 'payments'
  const [expandedTxId, setExpandedTxId] = useState(null);
  const [branchSelectOpen, setBranchSelectOpen] = useState(false);

  // Danh sách các cơ sở/chi nhánh dạng options cho CustomSelect
  const branchOptions = useMemo(() => {
    if (!portalInfo?.customers || portalInfo.customers.length === 0) return [];
    const allOption = {
      id: 'all',
      name: `🏢 Toàn bộ chuỗi (${portalInfo.customers.length} quán)`,
    };
    const sorted = [...portalInfo.customers].sort((a, b) => {
      const rankA = getRestaurantRank(a.name);
      const rankB = getRestaurantRank(b.name);
      if (rankA !== rankB) return rankA - rankB;
      return a.name.localeCompare(b.name, 'vi');
    });

    return [
      allOption,
      ...sorted.map((c) => ({
        id: c.id,
        name: `📍 ${c.name}`,
        rawName: c.name,
      })),
    ];
  }, [portalInfo?.customers]);

  const selectedBranchOption = useMemo(() => {
    return branchOptions.find((opt) => opt.id === selectedCustomerId) || branchOptions[0] || null;
  }, [branchOptions, selectedCustomerId]);

  // Đọc session token đã lưu trong LocalStorage khi ở trên Web
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(`portal_session_${token}`);
      if (saved) {
        setSessionToken(saved);
      }
    }
  }, [token]);

  // 1. Tải thông tin cơ bản về link nhóm Zalo
  const fetchPortalInfo = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await axios.get(`${API_HOST}/api/v1/portal/info/${token}`);
      const data = res.data?.data;
      setPortalInfo(data);

      if (data?.hasPin && !sessionToken && !data?.isSessionValid) {
        setPinRequired(true);
      } else {
        setPinRequired(false);
        const isMulti = data?.customers && data.customers.length > 1;
        const initialCustId = isMulti ? 'all' : (data?.customers?.[0]?.id || 'all');
        setSelectedCustomerId(initialCustId);
        fetchPortalData(initialCustId, sessionToken);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Đường dẫn không tồn tại hoặc đã bị thu hồi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchPortalInfo();
    }
  }, [token]);

  // 2. Xác thực mã PIN
  const handleVerifyPin = async () => {
    if (!pinInput.trim()) {
      setPinError('Vui lòng nhập mã PIN');
      return;
    }

    try {
      setPinSubmitting(true);
      setPinError('');
      const res = await axios.post(`${API_HOST}/api/v1/portal/verify-pin/${token}`, {
        pin: pinInput.trim(),
      });

      const sToken = res.data?.sessionToken;
      setSessionToken(sToken);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.localStorage.setItem(`portal_session_${token}`, sToken);
      }

      setPinRequired(false);
      const isMulti = portalInfo?.customers && portalInfo.customers.length > 1;
      const initialCustId = isMulti ? 'all' : (portalInfo?.customers?.[0]?.id || 'all');
      setSelectedCustomerId(initialCustId);
      fetchPortalData(initialCustId, sToken);
    } catch (err) {
      setPinError(err.response?.data?.message || 'Mã PIN không đúng, vui lòng thử lại.');
    } finally {
      setPinSubmitting(false);
    }
  };

  // 3. Tải dữ liệu công nợ & giá thịt
  const fetchPortalData = async (custParam, sToken) => {
    try {
      setDataLoading(true);
      const headers = {};
      const tokenToUse = sToken || sessionToken;
      if (tokenToUse) {
        headers['Authorization'] = `Bearer ${tokenToUse}`;
      }

      const res = await axios.get(`${API_HOST}/api/v1/portal/data/${token}`, {
        params: { customerId: custParam },
        headers,
      });

      setPortalData(res.data?.data);
    } catch (err) {
      if (err.response?.data?.code === 'PIN_REQUIRED') {
        setPinRequired(true);
      }
    } finally {
      setDataLoading(false);
    }
  };

  // Chuyển đổi chi nhánh xem (Toàn chuỗi hoặc từng quán)
  const handleSelectBranch = (cId) => {
    setSelectedCustomerId(cId);
    setExpandedTxId(null);
    fetchPortalData(cId, sessionToken);
  };

  // Mở modal gửi phản hồi
  const handleOpenFeedback = (opts = {}) => {
    feedbackModalRef.current?.open({
      branches: portalInfo?.customers || [],
      currentCustomer: portalData?.currentCustomer || null,
      sessionToken,
      defaultContent: opts?.defaultContent || '',
    });
  };

  // Mở modal kiểm tra giá các loại thịt thường xuyên lấy
  const handleOpenPriceCheck = () => {
    const itemMap = {};

    // 1. Thêm các món từ bảng giá cấu hình riêng của khách (nếu có)
    (portalData?.prices || []).forEach((cp) => {
      const key = (cp.productName || '').trim().toUpperCase();
      if (!key) return;
      itemMap[key] = {
        name: cp.productName.trim(),
        unit: cp.unit || 'kg',
        price: Number(cp.price) || 0,
        orderCount: 0,
        latestDate: '',
        latestTime: 0,
        isCustomPrice: true,
      };
    });

    // 2. Thống kê từ lịch sử đơn nợ gần đây
    (portalData?.transactions || []).forEach((tx) => {
      const txDateObj = new Date(tx.date);
      const txTime = txDateObj.getTime();
      const dd = String(txDateObj.getDate()).padStart(2, '0');
      const mm = String(txDateObj.getMonth() + 1).padStart(2, '0');
      const dateDisplay = `${dd}/${mm}`;

      (tx.items || []).forEach((it) => {
        const rawName = (it.productName || '').trim();
        if (!rawName) return;
        const key = rawName.toUpperCase();

        if (!itemMap[key]) {
          itemMap[key] = {
            name: rawName,
            unit: it.unit || 'kg',
            price: Number(it.price) || 0,
            orderCount: 1,
            latestDate: dateDisplay,
            latestTime: txTime,
            isCustomPrice: false,
          };
        } else {
          itemMap[key].orderCount = (itemMap[key].orderCount || 0) + 1;
          if (txTime > (itemMap[key].latestTime || 0)) {
            itemMap[key].latestTime = txTime;
            itemMap[key].latestDate = dateDisplay;
            if (!itemMap[key].isCustomPrice && it.price) {
              itemMap[key].price = Number(it.price) || 0;
            }
          }
        }
      });
    });

    const items = Object.values(itemMap).sort((a, b) => b.orderCount - a.orderCount);

    customerPriceCheckModalRef.current?.open({
      customerName: portalData?.currentCustomer?.name || portalInfo?.name || '',
      items,
    });
  };

  // Xử lý chọn mốc thời gian nhanh
  const handleSelectPreset = (key) => {
    setTimePreset(key);
    const range = getPresetRange(key);
    setFromDate(range.from);
    setToDate(range.to);
  };

  // Xử lý thay đổi từ ngày hoặc đến ngày thủ công (giới hạn tối đa 1 tháng)
  const handleDateChange = (newFrom, newTo) => {
    let finalTo = newTo;
    if (newFrom && newTo) {
      const dFrom = parseDDMMYYYY(newFrom);
      const dTo = parseDDMMYYYY(newTo);
      if (dFrom && dTo) {
        const diffDays = Math.round((dTo.getTime() - dFrom.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > 31) {
          showGlobalToast('Khoảng thời gian tra cứu tối đa là 1 tháng.', 'warning');
          const maxTo = new Date(dFrom);
          maxTo.setDate(dFrom.getDate() + 30);
          const pad = (n) => String(n).padStart(2, '0');
          finalTo = `${pad(maxTo.getDate())}/${pad(maxTo.getMonth() + 1)}/${maxTo.getFullYear()}`;
        }
      }
    }
    setFromDate(newFrom);
    setToDate(finalTo);
    setTimePreset('custom');
  };

  // Đặt lại bộ lọc ngày về Tháng này
  const handleClearDateFilter = () => {
    const range = getPresetRange('this_month');
    setFromDate(range.from);
    setToDate(range.to);
    setTimePreset('this_month');
  };

  // Chuẩn hóa dữ liệu bảng kê theo ngày giống hệt giao diện xuất ảnh
  const branchList = portalData?.branches || portalInfo?.customers || [];
  const invoiceData = useMemo(() => {
    return buildInvoiceRows(
      portalData?.transactions || [],
      portalData?.payments || [],
      fromDate,
      toDate,
      sortOrder,
      branchList
    );
  }, [portalData?.transactions, portalData?.payments, fromDate, toDate, sortOrder, branchList]);

  // Dữ liệu bảng kê sau khi áp dụng thanh tìm kiếm nhanh
  const displayInvoiceData = useMemo(() => {
    if (!invoiceData?.sortedDays) return invoiceData;
    const q = (searchKeyword || '').trim();
    if (!q) return invoiceData;

    let filteredTotalMeat = 0;
    let filteredTotalReturn = 0;
    let filteredTotalPaid = 0;

    const filteredDays = [];

    invoiceData.sortedDays.forEach((day) => {
      // Lọc các entries thực (bỏ DAY_TOTAL gốc để tính lại sau lọc)
      const matchedEntries = (day.entries || []).filter((entry) => {
        if (entry.type === 'DAY_TOTAL') return false;

        const matchesName = matchSearch(entry.name, q);
        const matchesCustomer = matchSearch(entry.customerName, q);
        const matchesDate = matchSearch(day.displayDate, q) || matchSearch(day.dateKey, q);
        const matchesPayment = entry.type === 'PAYMENT' && matchSearch('thanh toan', q);
        const matchesReturn = entry.type === 'RETURN' && matchSearch('tra hang', q);

        return Boolean(matchesName || matchesCustomer || matchesDate || matchesPayment || matchesReturn);
      });

      if (matchedEntries.length > 0) {
        const meatEntries = [];
        matchedEntries.forEach((entry) => {
          const amt = Number(entry.amount) || 0;
          if (entry.type === 'RETURN') {
            filteredTotalReturn += amt;
          } else if (entry.type === 'PAYMENT') {
            filteredTotalPaid += amt;
          } else {
            filteredTotalMeat += amt;
            meatEntries.push(entry);
          }
        });

        const dayEntries = [...matchedEntries];
        if (meatEntries.length > 1) {
          const dayMeatTotal = meatEntries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
          let lastMeatIdx = -1;
          for (let i = dayEntries.length - 1; i >= 0; i--) {
            if (dayEntries[i].type === 'MEAT' || dayEntries[i].type === 'DELIVERY') {
              lastMeatIdx = i;
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
          if (lastMeatIdx >= 0) {
            dayEntries.splice(lastMeatIdx + 1, 0, totalEntry);
          } else {
            dayEntries.push(totalEntry);
          }
        }

        filteredDays.push({
          ...day,
          entries: dayEntries,
        });
      }
    });

    const finalDebt = Math.max(0, filteredTotalMeat - filteredTotalReturn - filteredTotalPaid);

    return {
      sortedDays: filteredDays,
      totals: {
        totalMeat: filteredTotalMeat,
        totalReturn: filteredTotalReturn,
        totalPaid: filteredTotalPaid,
        finalDebt,
      },
    };
  }, [invoiceData, searchKeyword]);

  // Đếm tổng số lượng món khớp tìm kiếm
  const totalMatchedItems = useMemo(() => {
    if (!searchKeyword.trim() || !displayInvoiceData?.sortedDays) return 0;
    return displayInvoiceData.sortedDays.reduce((sum, day) => {
      return sum + (day.entries || []).filter((e) => e.type !== 'DAY_TOTAL').length;
    }, 0);
  }, [searchKeyword, displayInvoiceData]);

  // Xuất ảnh bảng kê (Canvas) để xem phóng to hoặc tải về / gửi Zalo
  const handleExportCanvasImage = async () => {
    const targetData = displayInvoiceData;
    if (!targetData?.sortedDays || targetData.sortedDays.length === 0) {
      showGlobalToast('Không có dữ liệu giao dịch trong khoảng thời gian này để xuất ảnh.', 'warning');
      return;
    }

    try {
      setExportingImage(true);
      const customerName = portalData?.currentCustomer?.name || portalInfo?.name || 'KhachHang';
      const presetObj = TIME_PRESETS.find((p) => p.key === timePreset);
      const presetLabel = presetObj ? presetObj.label : 'Tùy chọn';

      const dataUrl = drawInvoiceCanvas(
        targetData.sortedDays,
        targetData.totals,
        customerName,
        fromDate,
        toDate,
        presetLabel,
        branchList
      );

      if (!dataUrl) {
        showGlobalToast('Trình duyệt hiện tại không hỗ trợ vẽ ảnh tự động.', 'error');
        return;
      }

      // Mở modal xem trước và phóng to ảnh (có sẵn nút tải về / lưu ảnh)
      imagePreviewModalRef.current?.open(dataUrl);

      // Thử chia sẻ qua Web Share API nếu trên điện thoại
      const isMobileDevice =
        typeof navigator !== 'undefined' &&
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

      if (isMobileDevice && typeof navigator !== 'undefined' && navigator.share && typeof File !== 'undefined') {
        try {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          const file = new File([blob], `BangKeCongNo_${customerName}.png`, { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `Bảng kê công nợ ${customerName}`,
              text: `Bảng kê công nợ ${customerName} (${presetLabel})`,
            });
          }
        } catch (shareErr) {
          // Bỏ qua nếu người dùng bấm Hủy chia sẻ
        }
      }
    } catch (err) {
      console.error('Lỗi khi xuất ảnh bảng kê:', err);
      showGlobalToast('Đã xảy ra lỗi khi tạo ảnh bảng kê.', 'error');
    } finally {
      setExportingImage(false);
    }
  };

  // ─── MÀN HÌNH CHỜ & LỖI ───
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Đang tải dữ liệu nhóm Zalo...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>Không thể truy cập</Text>
        <Text style={styles.errorDesc}>{error}</Text>
      </View>
    );
  }

  // ─── MÀN HÌNH NHẬP MÃ PIN BẢO MẬT ───
  if (pinRequired) {
    return (
      <SafeAreaView style={styles.pinScreen}>
        <View style={styles.pinCard}>
          <Text style={styles.pinLockIcon}>🔒</Text>
          <Text style={styles.pinTitle}>{portalInfo?.name || 'Cổng Tra Cứu Công Nợ'}</Text>
          <Text style={styles.pinSubtitle}>
            Nhóm này được bảo vệ bởi mã PIN. Vui lòng nhập mã PIN 4 số của nhóm Zalo để xem số liệu:
          </Text>

          <TextInput
            style={styles.pinInput}
            value={pinInput}
            onChangeText={(t) => {
              setPinInput(t);
              setPinError('');
            }}
            placeholder="••••"
            placeholderTextColor="#9CA3AF"
            keyboardType="number-pad"
            maxLength={6}
            secureTextEntry
            autoFocus
            onSubmitEditing={handleVerifyPin}
          />

          {pinError ? <Text style={styles.pinErrorText}>{pinError}</Text> : null}

          <TouchableOpacity style={styles.pinSubmitBtn} onPress={handleVerifyPin} disabled={pinSubmitting}>
            {pinSubmitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.pinSubmitText}>Xem Công Nợ & Bảng Giá</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.pinHint}>
            * Mã PIN đã được ghim trong phần mô tả / tin nhắn ghim của nhóm Zalo này.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const isChain = portalInfo?.customers && portalInfo.customers.length > 1;

  // ─── GIAO DIỆN CHÍNH CỦA PORTAL ───
  return (
    <SafeAreaView style={styles.mainContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#065F46" />

      {/* HEADER TOP BAR */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.groupNameText}>{portalInfo?.name}</Text>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.priceCheckBtn} onPress={handleOpenPriceCheck} activeOpacity={0.8}>
            <Text style={styles.priceCheckBtnText}>🥩 Giá thịt</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.feedbackBtn} onPress={() => handleOpenFeedback()} activeOpacity={0.8}>
            <Text style={styles.feedbackBtnText}>💬 Phản ánh</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* KHUNG NỘI DUNG VỪA KHÍT VIEWPORT 100VH */}
      <View style={styles.scrollContent}>
        {/* THANH CHỌN CHI NHÁNH DẠNG SELECT */}
        {isChain && (
          <View style={[styles.branchBar, branchSelectOpen && styles.branchBarActive]}>
            <Text style={styles.branchBarLabel}>Chọn cửa hàng:</Text>
            <View style={styles.branchSelectWrap}>
              <CustomSelect
                value={selectedBranchOption}
                options={branchOptions}
                onSelect={(opt) => {
                  if (opt) {
                    handleSelectBranch(opt.id);
                  }
                }}
                renderSelected={(opt) => opt?.name || ''}
                getOptionLabel={(opt) => opt?.name || ''}
                placeholder="Chọn cơ sở xem số liệu..."
                compact={true}
                zIndex={999999}
                onOpenChange={(isOpen) => setBranchSelectOpen(isOpen)}
                style={styles.branchSelectInput}
              />
            </View>
          </View>
        )}

        {/* LOADING INDICATOR KHI ĐỔI TAB/QUÁN */}
        {dataLoading ? (
          <View style={styles.dataLoadingWrap}>
            <ActivityIndicator size="small" color="#10B981" />
            <Text style={styles.dataLoadingText}>Đang tải số liệu...</Text>
          </View>
        ) : (
          <>
            {/* THẺ TỔNG QUAN CÔNG NỢ (THU GỌN TỐI ĐA) */}
            <View style={styles.debtCardCompact}>
              <View style={styles.debtCardMainRow}>
                <View style={styles.debtTitleAndAmount}>
                  <Text style={styles.debtCardLabel}>
                    TỔNG TIỀN NỢ:
                  </Text>
                  <Text style={styles.debtMainAmount}>
                    {formatCurrency(portalData?.summary?.totalDebt || portalData?.summary?.debt || 0)}
                  </Text>
                </View>

                <View style={styles.debtCardRightActions}>
                  {/* Nút mở pop-up xem chi tiết tiền nợ từng cửa hàng */}
                  {isChain && portalData?.branches && portalData.branches.length > 1 && (
                    <TouchableOpacity
                      style={styles.viewBranchesDebtBtn}
                      onPress={() =>
                        branchDebtModalRef.current?.open({
                          branches: portalData.branches,
                          totalDebt: portalData?.summary?.totalDebt || portalData?.summary?.debt || 0,
                          onSelectBranch: handleSelectBranch,
                        })
                      }
                      activeOpacity={0.7}
                    >
                      <Text style={styles.viewBranchesDebtBtnText}>Xem chi tiết nợ từng quán</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.reloadIconBtn}
                    onPress={() => fetchPortalData(selectedCustomerId, sessionToken)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.reloadIcon}>🔄</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* BẢNG KÊ ĐƠN HÀNG CHI TIẾT (DẠNG BẢNG KÊ TIỀN HÀNG) */}
            <View style={[styles.sectionWrap, styles.invoiceSectionFlex]}>
              {/* KHUNG BỘ LỌC THỜI GIAN NỔI BẬT */}
              <View style={styles.filterSectionCard}>
                {/* Dòng tiêu đề + nút đổi thứ tự */}
                <View style={styles.filterHeaderRow}>
                  <View style={styles.filterTitleWrap}>
                    <Text style={styles.filterCalendarIcon}>📅</Text>
                    <Text style={styles.filterTitleText}>Chọn ngày lọc xem nợ:</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.sortToggleBtn}
                    onPress={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.sortToggleBtnText}>
                      {sortOrder === 'desc' ? '⬇ Mới nhất' : '⬆ Cũ nhất'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Thanh lọc mốc thời gian nhanh (Chips) */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.timeFilterScroll}
                  contentContainerStyle={styles.timeFilterContent}
                >
                  {TIME_PRESETS.map((preset) => {
                    const isActive = timePreset === preset.key;
                    return (
                      <TouchableOpacity
                        key={preset.key}
                        style={[styles.timeChip, isActive && styles.timeChipActive]}
                        onPress={() => handleSelectPreset(preset.key)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.timeChipText, isActive && styles.timeChipTextActive]}>
                          {preset.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* BỘ LỌC TỪ NGÀY ĐẾN NGÀY */}
                <View style={styles.dateFilterCompactRow}>
                  <View style={styles.datePickerWrap}>
                    <DatePickerInput
                      value={fromDate}
                      onChange={(val) => handleDateChange(val, toDate)}
                      allowFuture={true}
                      compact={true}
                      style={styles.compactDatePicker}
                    />
                  </View>

                  <View style={styles.dateArrowWrap}>
                    <Text style={styles.dateArrowText}>➔</Text>
                  </View>

                  <View style={styles.datePickerWrap}>
                    <DatePickerInput
                      value={toDate}
                      onChange={(val) => handleDateChange(fromDate, val)}
                      allowFuture={true}
                      compact={true}
                      style={styles.compactDatePicker}
                    />
                  </View>

                  {timePreset === 'custom' && (
                    <TouchableOpacity
                      style={styles.clearDateBtnCompact}
                      onPress={handleClearDateFilter}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.clearDateBtnText}>✕ Xóa</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* THANH TÌM KIẾM NHỎ XINH BÊN DƯỚI BỘ LỌC NGÀY */}
              <View style={[styles.searchBarContainer, isSearchFocused && styles.searchBarContainerFocused]}>
                <Text style={[styles.searchBarIcon, isSearchFocused && styles.searchBarIconFocused]}>🔍</Text>
                <TextInput
                  style={styles.searchBarInput}
                  placeholder="Tìm kiếm theo ngày, tên thịt..."
                  placeholderTextColor="#94A3B8"
                  value={searchKeyword}
                  onChangeText={setSearchKeyword}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                  returnKeyType="search"
                />
                {searchKeyword.trim() ? (
                  <View style={styles.searchActionWrap}>
                    <View style={styles.searchCountBadge}>
                      <Text style={styles.searchCountText}>{totalMatchedItems} món</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.searchClearBtn}
                      onPress={() => setSearchKeyword('')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.searchClearText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>

              {/* BẢNG DỮ LIỆU INVOICE */}
              {displayInvoiceData?.sortedDays && displayInvoiceData.sortedDays.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.tableScrollWrapper}
                  contentContainerStyle={styles.tableScrollContent}
                >
                  <View style={styles.invoiceTableContainer}>
                    {/* Tiêu đề các cột - Cố định ở trên cùng, không bị cuộn hay hở viền trên */}
                    <View style={styles.tableHeaderRowStyle}>
                      <Text style={[styles.thCell, styles.thDate]}>NGÀY</Text>
                      <Text style={[styles.thCell, styles.thName]}>TÊN HÀNG</Text>
                      <Text style={[styles.thCell, styles.thQty]}>KG</Text>
                      <Text style={[styles.thCell, styles.thPrice]}>ĐƠN GIÁ</Text>
                      <Text style={[styles.thCell, styles.thAmount]}>THÀNH TIỀN</Text>
                    </View>

                    {/* Vùng cuộn dọc chứa các khối ngày và tổng kết */}
                    <ScrollView
                      style={styles.tableVerticalScroll}
                      contentContainerStyle={styles.tableVerticalContent}
                      showsVerticalScrollIndicator={true}
                      nestedScrollEnabled={true}
                    >
                      {/* Các khối ngày */}
                      {displayInvoiceData.sortedDays.map((day) => (
                        <View key={day.dateKey} style={styles.tableDayRowGroup}>
                          {/* Cột Ngày bên trái (gộp chung cho toàn bộ các món trong ngày) */}
                          <View style={styles.tdDateCol}>
                            <Text style={styles.tdDateText}>{day.displayDate}</Text>
                          </View>

                          {/* Danh sách các dòng món hàng bên phải */}
                          <View style={styles.tdItemsCol}>
                            {day.entries.map((entry, idx) => {
                              const isLast = idx === day.entries.length - 1;
                              const nextEntry = !isLast ? day.entries[idx + 1] : null;
                              const isRestaurantBoundary =
                                !isLast &&
                                Boolean(entry.customerName || nextEntry?.customerName) &&
                                entry.customerName !== nextEntry?.customerName;

                              const isDayTotal = entry.type === 'DAY_TOTAL';
                              const isReturn = entry.type === 'RETURN';
                              const isPayment = entry.type === 'PAYMENT';

                              // Màu nền nhạt để phân biệt từng nhà hàng (dòng tổng ngày dùng nền xám nhẹ)
                              const restaurantBg = isDayTotal
                                ? '#F8FAFC'
                                : entry.customerName
                                  ? getRestaurantColor(entry.customerName, branchList)
                                  : '#FFFFFF';

                              return (
                                <View
                                  key={idx}
                                  style={[
                                    styles.itemSubRow,
                                    { backgroundColor: restaurantBg },
                                    isDayTotal && { borderTopWidth: 1, borderTopColor: '#CBD5E1' },
                                    !isLast && (isRestaurantBoundary ? styles.itemSubRowBoundary : styles.itemSubRowBorder),
                                    isReturn && styles.itemSubRowReturn,
                                    isPayment && styles.itemSubRowPayment,
                                  ]}
                                >
                                  {isDayTotal ? (
                                    <View style={[styles.tdName, styles.tdTotalCellWrap]}>
                                      <Text style={styles.tdTotalTitleText}>TỔNG</Text>
                                      {day.invoices && day.invoices.length > 0 && (
                                        <TouchableOpacity
                                          style={[
                                            styles.dayTotalInvoiceBtn,
                                            styles.dayTotalInvoiceBtnActive,
                                          ]}
                                          onPress={() => handleOpenInvoiceModal(day)}
                                          activeOpacity={0.7}
                                        >
                                          <Text
                                            style={[
                                              styles.dayTotalInvoiceBtnText,
                                              styles.dayTotalInvoiceBtnTextActive,
                                            ]}
                                          >
                                            🧾 Xem ảnh ({day.invoices.length})
                                          </Text>
                                        </TouchableOpacity>
                                      )}
                                    </View>
                                  ) : (
                                    <View style={[styles.tdCell, styles.tdName, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 4 }]}>
                                      <Text
                                        style={[
                                          { flex: 1 },
                                          isReturn && styles.textRed,
                                          isPayment && styles.textGreen,
                                        ]}
                                        numberOfLines={3}
                                      >
                                        {isPayment ? (
                                          'THANH TOÁN'
                                        ) : entry.customerName ? (
                                          <>
                                            <Text style={styles.branchPrefixText}>{`[${entry.customerName}] `}</Text>
                                            <Text>{entry.name}</Text>
                                          </>
                                        ) : (
                                          entry.name
                                        )}
                                      </Text>
                                      {/* Nếu ngày không có dòng TỔNG nhưng có ảnh hóa đơn và đây là món đầu tiên thì hiển thị nút xem ảnh */}
                                      {day.invoices && day.invoices.length > 0 && !day.entries.some(e => e.type === 'DAY_TOTAL') && idx === 0 && (
                                        <TouchableOpacity
                                          style={[
                                            styles.dayTotalInvoiceBtn,
                                            styles.dayTotalInvoiceBtnActive,
                                          ]}
                                          onPress={() => handleOpenInvoiceModal(day)}
                                          activeOpacity={0.7}
                                        >
                                          <Text
                                            style={[
                                              styles.dayTotalInvoiceBtnText,
                                              styles.dayTotalInvoiceBtnTextActive,
                                            ]}
                                          >
                                            🧾 Xem ảnh ({day.invoices.length})
                                          </Text>
                                        </TouchableOpacity>
                                      )}
                                    </View>
                                  )}
                                  <Text
                                    style={[
                                      styles.tdCell,
                                      styles.tdQty,
                                      isReturn && styles.textRed,
                                    ]}
                                  >
                                    {entry.quantity != null ? entry.quantity : '-'}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.tdCell,
                                      styles.tdPrice,
                                      isReturn && styles.textRed,
                                    ]}
                                  >
                                    {entry.price != null ? formatShortPrice(entry.price) : '-'}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.tdCell,
                                      styles.tdAmount,
                                      isReturn && styles.textRed,
                                      isPayment && styles.textGreen,
                                    ]}
                                  >
                                    {isReturn || isPayment
                                      ? `-${formatCurrency(entry.amount)}`
                                      : formatCurrency(entry.amount)}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      ))}

                      {/* Khối tổng kết cuối bảng chuẩn đồ họa cao cấp */}
                      <View style={styles.invoiceSummaryCard}>
                        <View style={styles.invSumRow}>
                          <Text style={styles.invSumLabel}>TỔNG TIỀN HÀNG:</Text>
                          <Text style={styles.invSumValue}>
                            {formatCurrency(displayInvoiceData.totals.totalMeat)}
                          </Text>
                        </View>

                        {displayInvoiceData.totals.totalReturn > 0 && (
                          <View style={[styles.invSumRow, styles.invSumReturnRow]}>
                            <Text style={[styles.invSumLabel, { color: '#C2410C' }]}>
                              TIỀN HÀNG TRẢ VỀ:
                            </Text>
                            <Text style={[styles.invSumValue, { color: '#DC2626' }]}>
                              - {formatCurrency(displayInvoiceData.totals.totalReturn)}
                            </Text>
                          </View>
                        )}

                        {displayInvoiceData.totals.totalPaid > 0 && (
                          <View style={[styles.invSumRow, styles.invSumPaidRow]}>
                            <Text style={[styles.invSumLabel, { color: '#047857' }]}>
                              ĐÃ THANH TOÁN:
                            </Text>
                            <Text style={[styles.invSumValue, { color: '#059669' }]}>
                              - {formatCurrency(displayInvoiceData.totals.totalPaid)}
                            </Text>
                          </View>
                        )}

                        <View style={[styles.invSumRow, styles.invSumFinalRow]}>
                          <Text style={styles.invSumFinalLabel}>CÒN LẠI PHẢI THU:</Text>
                          <Text
                            style={[
                              styles.invSumFinalValue,
                              {
                                color:
                                  displayInvoiceData.totals.finalDebt > 0 ? '#DC2626' : '#059669',
                              },
                            ]}
                          >
                            {formatCurrency(displayInvoiceData.totals.finalDebt)}
                          </Text>
                        </View>
                      </View>
                    </ScrollView>
                  </View>
                </ScrollView>
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>
                    {searchKeyword.trim()
                      ? `Không tìm thấy món thịt nào khớp với "${searchKeyword.trim()}".`
                      : 'Không có phát sinh giao dịch nào trong khoảng thời gian đã chọn.'}
                  </Text>
                  {searchKeyword.trim() ? (
                    <TouchableOpacity
                      style={styles.searchEmptyClearBtn}
                      onPress={() => setSearchKeyword('')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.searchEmptyClearBtnText}>✕ Xóa tìm kiếm</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}
            </View>
          </>
        )}
      </View>

      {/* MODAL GỬI PHẢN HỒI KHIẾU NẠI */}
      <PortalFeedbackModal
        ref={feedbackModalRef}
        token={token}
        apiHost={API_HOST}
        onSubmitted={() => fetchPortalData(selectedCustomerId, sessionToken)}
      />

      {/* MODAL PHÓNG TO / LƯU ẢNH BẢNG KÊ */}
      <ImagePreviewModal ref={imagePreviewModalRef} />

      {/* MODAL XEM CHI TIẾT CÔNG NỢ TỪNG CỬA HÀNG TRONG CHUỖI */}
      <BranchDebtModal
        ref={branchDebtModalRef}
        token={token}
        apiHost={API_HOST}
        sessionToken={sessionToken}
      />

      {/* MODAL XEM ẢNH HÓA ĐƠN THỰC TẾ TRÊN PORTAL */}
      <InvoiceImageViewerModal ref={invoiceViewerRef} />

      {/* MODAL KIỂM TRA GIÁ THỊT & PHẢN ÁNH GIÁ */}
      <CustomerPriceCheckModal
        ref={customerPriceCheckModalRef}
        onOpenFeedback={handleOpenFeedback}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    height: Platform.OS === 'web' ? '100vh' : '100%',
    maxHeight: Platform.OS === 'web' ? '100vh' : '100%',
    overflow: 'hidden',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#4B5563',
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 6,
  },
  errorDesc: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },

  // ─── PIN SCREEN ───
  pinScreen: {
    flex: 1,
    backgroundColor: '#065F46',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  pinCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  pinLockIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  pinTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 6,
  },
  pinSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
  },
  pinInput: {
    borderWidth: 2,
    borderColor: '#10B981',
    borderRadius: 12,
    fontSize: 28,
    letterSpacing: 10,
    textAlign: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    width: 180,
    backgroundColor: '#ECFDF5',
    color: '#065F46',
    marginBottom: 12,
  },
  pinErrorText: {
    color: '#EF4444',
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },
  pinSubmitBtn: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
    marginTop: 4,
  },
  pinSubmitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  pinHint: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 16,
  },

  // ─── HEADER BAR (THU GỌN TỐI ĐA) ───
  header: {
    backgroundColor: '#065F46',
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#047857',
  },
  headerLeft: {
    flex: 1,
  },
  ownerBadge: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#A7F3D0',
    letterSpacing: 0.5,
  },
  groupNameText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  ownerPhoneText: {
    fontSize: 10,
    color: '#D1FAE5',
  },
  headerRight: {
    marginLeft: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceCheckBtn: {
    backgroundColor: '#047857',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
  },
  priceCheckBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  feedbackBtn: {
    backgroundColor: '#F59E0B',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  feedbackBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 11,
  },

  // ─── VIEWPORT CONTENT (VỪA KHÍT 100VH) ───
  scrollContent: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 8,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
    overflow: 'hidden',
  },

  // ─── BRANCH SELECTOR (DROPDOWN SELECT) ───
  branchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    zIndex: 10,
  },
  branchBarActive: {
    zIndex: 999999,
    elevation: 999999,
  },
  branchBarLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginRight: 8,
  },
  branchSelectWrap: {
    flex: 1,
  },
  branchSelectInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },

  // ─── LOADING STATS ───
  dataLoadingWrap: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  dataLoadingText: {
    marginTop: 4,
    fontSize: 11,
    color: '#6B7280',
  },

  // ─── DEBT CARD COMPACT (SIÊU GỌN) ───
  debtCardCompact: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 6,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  debtCardMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'nowrap',
    gap: 6,
  },
  debtTitleAndAmount: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 4,
    flexShrink: 1,
  },
  debtCardLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  debtMainAmount: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  debtCardRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  viewBranchesDebtBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewBranchesDebtBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
    lineHeight: 14,
  },
  reloadIconBtn: {
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reloadIcon: {
    fontSize: 12,
    lineHeight: 14,
  },
  debtInlineSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  debtSubText: {
    fontSize: 11,
    color: '#6B7280',
  },
  debtSubValue: {
    fontWeight: 'bold',
    color: '#1F2937',
  },
  debtDotDivider: {
    marginHorizontal: 8,
    color: '#9CA3AF',
    fontSize: 10,
  },

  // ─── TABS ───
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabBtnTextActive: {
    color: '#111827',
    fontWeight: 'bold',
  },

  // ─── SECTIONS ───
  sectionWrap: {
    marginBottom: 8,
  },
  invoiceSectionFlex: {
    flex: 1,
    minHeight: 0,
    marginBottom: 0,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 6,
  },

  // ─── TABLE ───
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    alignItems: 'center',
  },
  tableHeaderRow: {
    backgroundColor: '#F9FAFB',
    borderBottomColor: '#E5E7EB',
  },
  tableCell: {
    fontSize: 13,
    color: '#1F2937',
  },
  branchTableName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#111827',
  },
  branchTablePhone: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 1,
  },

  // ─── TRANSACTION CARD ───
  txCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  txCardHeader: {
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  txDateText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#111827',
  },
  txCustomerTag: {
    fontSize: 11,
    backgroundColor: '#EFF6FF',
    color: '#1D4ED8',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '600',
  },
  txNoteText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  txAmountWrap: {
    alignItems: 'flex-end',
  },
  txTotalAmountText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  txExpandHint: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  txItemsWrap: {
    backgroundColor: '#F9FAFB',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  txItemsHeader: {
    flexDirection: 'row',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  txItemHeadCol: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#6B7280',
  },
  txItemRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  txItemCell: {
    fontSize: 12,
    color: '#374151',
  },

  // ─── EMPTY STATE ───
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyText: {
    fontSize: 13,
    color: '#6B7280',
  },
  searchEmptyClearBtn: {
    marginTop: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'center',
  },
  searchEmptyClearBtnText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },

  // ─── THANH TÌM KIẾM NHỎ XINH BÊN DƯỚI BỘ LỌC NGÀY ───
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 9,
    height: 34,
    marginBottom: 7,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  searchBarContainerFocused: {
    borderColor: '#059669',
    backgroundColor: '#FFFFFF',
    shadowColor: '#059669',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  searchBarIcon: {
    fontSize: 12.5,
    marginRight: 6,
    color: '#64748B',
  },
  searchBarIconFocused: {
    color: '#059669',
  },
  searchBarInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    paddingVertical: 0,
    height: '100%',
    ...(Platform.OS === 'web'
      ? {
        outlineStyle: 'none',
        outlineWidth: 0,
        outlineColor: 'transparent',
      }
      : {}),
  },
  searchActionWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  searchCountBadge: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
  },
  searchCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
  },
  searchClearBtn: {
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchClearText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: 'bold',
  },

  // ─── FOOTER ───
  footer: {
    marginTop: 10,
    marginBottom: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
  },
  footerSubText: {
    fontSize: 10,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 2,
  },

  // ─── STYLES BẢNG KÊ TIỀN HÀNG & CÔNG NỢ (GIỐNG DẠNG XUẤT ẢNH) ───
  invoiceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  invoiceSubTitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  exportInvoiceBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  exportInvoiceBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // ─── BỘ LỌC THỜI GIAN NỔI BẬT ───
  filterSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderLeftWidth: 4,
    borderLeftColor: '#059669',
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 6,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  filterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  filterTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  filterCalendarIcon: {
    fontSize: 13,
  },
  filterTitleText: {
    fontSize: 11.5,
    fontWeight: 'bold',
    color: '#065F46',
    letterSpacing: 0.2,
  },
  timeFilterScroll: {
    marginBottom: 5,
  },
  timeFilterContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 1,
  },
  timeChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 12,
    marginRight: 5,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  timeChipActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
    shadowColor: '#059669',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 1,
  },
  timeChipText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
  timeChipTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  sortToggleBtn: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sortToggleBtnText: {
    fontSize: 10.5,
    color: '#047857',
    fontWeight: '700',
  },
  dateFilterCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    padding: 3,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  datePickerWrap: {
    flex: 1,
  },
  compactDatePicker: {
    height: 34,
  },
  dateArrowWrap: {
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateArrowText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#059669',
  },
  clearDateBtnCompact: {
    marginLeft: 5,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    height: 34,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearDateBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  tableScrollWrapper: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#94A3B8',
    overflow: 'hidden',
    width: '100%',
  },
  tableScrollContent: {
    minWidth: '100%',
    flexGrow: 1,
  },
  tableVerticalScroll: {
    flex: 1,
    minHeight: 0,
    width: '100%',
  },
  tableVerticalContent: {
    minWidth: '100%',
  },
  invoiceTableContainer: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    backgroundColor: '#FFFFFF',
  },
  tableHeaderRowStyle: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1.2,
    borderBottomColor: '#94A3B8',
    paddingVertical: 8,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
  },
  thCell: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#334155',
  },
  thDate: {
    width: 42,
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
  },
  thName: {
    width: 170,
    paddingLeft: 6,
    paddingRight: 4,
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
  },
  thQty: {
    width: 44,
    textAlign: 'right',
    paddingRight: 4,
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
  },
  thPrice: {
    width: 66,
    textAlign: 'right',
    paddingRight: 4,
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
  },
  thAmount: {
    flex: 1,
    minWidth: 80,
    textAlign: 'right',
    paddingRight: 6,
  },
  tableDayRowGroup: {
    flexDirection: 'row',
    borderBottomWidth: 2.5,
    borderBottomColor: '#0F172A',
  },
  tdDateCol: {
    width: 42,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
    paddingVertical: 5,
  },
  tdDateText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'center',
  },
  tdItemsCol: {
    flex: 1,
  },
  itemSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
  },
  itemSubRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemSubRowBoundary: {
    borderBottomWidth: 1.5,
    borderBottomColor: '#64748B',
  },
  branchPrefixText: {
    fontWeight: 'bold',
    color: '#0F172A',
  },
  itemSubRowReturn: {
    backgroundColor: '#FFF7ED',
  },
  itemSubRowPayment: {
    backgroundColor: '#F0FDF4',
  },
  tdCell: {
    fontSize: 11.5,
    color: '#0F172A',
  },
  tdName: {
    width: 170,
    paddingLeft: 6,
    paddingRight: 4,
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
  },
  tdTotalCellWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tdTotalTitleText: {
    fontWeight: 'bold',
    color: '#0F172A',
    fontSize: 11.5,
  },
  dayTotalInvoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  dayTotalInvoiceBtnActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
  },
  dayTotalInvoiceBtnEmpty: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
  dayTotalInvoiceBtnText: {
    fontSize: 9.5,
    fontWeight: '600',
  },
  dayTotalInvoiceBtnTextActive: {
    color: '#1D4ED8',
  },
  dayTotalInvoiceBtnTextEmpty: {
    color: '#64748B',
  },
  tdQty: {
    width: 44,
    textAlign: 'right',
    paddingRight: 4,
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
  },
  tdPrice: {
    width: 66,
    textAlign: 'right',
    paddingRight: 4,
    fontWeight: '600',
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
  },
  tdAmount: {
    flex: 1,
    minWidth: 80,
    textAlign: 'right',
    paddingRight: 6,
    fontWeight: 'bold',
  },
  textRed: {
    color: '#DC2626',
  },
  textGreen: {
    color: '#059669',
  },
  invoiceSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1.5,
    borderTopColor: '#64748B',
  },
  invSumRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  invSumLabel: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#334155',
  },
  invSumValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  invSumReturnRow: {
    backgroundColor: '#FFF7ED',
    borderBottomColor: '#FED7AA',
  },
  invSumPaidRow: {
    backgroundColor: '#F0FDF4',
    borderBottomColor: '#BBF7D0',
  },
  invSumFinalRow: {
    backgroundColor: '#EFF6FF',
    borderBottomWidth: 0,
    paddingVertical: 10,
  },
  invSumFinalLabel: {
    fontSize: 13.5,
    fontWeight: 'bold',
    color: '#1E3A8A',
  },
  invSumFinalValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
});
