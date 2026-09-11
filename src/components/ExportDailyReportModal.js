// meat-management-fe/src/components/ExportDailyReportModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native';
import { COLORS, FONTS, SHADOWS } from '../theme';
import SmoothModal from './SmoothModal';
import ImagePreviewModal from './ImagePreviewModal';
import { showGlobalToast } from '../store/toastStore';
import { downloadOrShareImage, isMobileDevice } from '../utils/imageShareHelper';

// Helper chuyển đổi chuỗi ngày ISO sang dạng khóa "DD/MM/YYYY" để so sánh

const toDateKey = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const dd = d.getDate().toString().padStart(2, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

// Helper kiểm tra xem một giao dịch/khoản thanh toán có phải là "Trả hàng" hay không
const isReturnPayment = (p) => {
  if (!p) return false;
  const trimNote = (p.note || '').trim();
  return (
    trimNote.includes('Trả lại hàng') ||
    trimNote.includes('Trả hàng') ||
    trimNote.includes('Trả lại')
  );
};

// Helper phân tích danh sách các món thịt trả lại từ ghi chú
const parseReturnItems = (note, defaultAmount) => {
  if (!note) return [{ type: 'RETURN', name: '[TRẢ HÀNG]', quantity: null, price: null, amount: defaultAmount }];
  const clean = note.replace(/\[Trả lại hàng\]|\[Trả hàng nhanh\]/gi, '').trim();

  // Khớp từng món: <số lượng><đơn vị> <tên thịt> (<thành tiền>)
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

// Helper bẻ dòng text dài
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

const ExportDailyReportModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [generating, setGenerating] = useState(false);
  const [imageUri, setImageUri] = useState(null);

  // Thống kê nhanh cho header
  const [statTotals, setStatTotals] = useState({
    meatAmount: 0,
    returnAmount: 0,
    paymentAmount: 0,
    finalRemaining: 0,
  });

  const imagePreviewModalRef = useRef(null);

  const [modalTitle, setModalTitle] = useState('📸 XUẤT BÁO CÁO CÔNG NỢ NGÀY');
  const [customStatsState, setCustomStatsState] = useState(null);
  const [customFileNameState, setCustomFileNameState] = useState(null);

  // Expose các phương thức open, close, submit qua ref
  useImperativeHandle(ref, () => ({
    open: ({
      selectedDate: date,
      rawTransactions = [],
      rawPayments = [],
      customImageUri = null,
      customTitle = null,
      customStats = null,
      customFileName = null,
    }) => {
      setSelectedDate(date);
      setVisible(true);
      setModalTitle(customTitle || '📸 XUẤT BÁO CÁO CÔNG NỢ NGÀY');
      setCustomStatsState(customStats || null);
      setCustomFileNameState(customFileName || null);

      if (customImageUri) {
        setImageUri(customImageUri);
        setGenerating(false);
      } else {
        setImageUri(null);
        // Tự động tạo ảnh báo cáo ngay khi mở modal
        setTimeout(() => {
          generateDailyReportImage(date, rawTransactions, rawPayments);
        }, 100);
      }
    },
    close: () => {
      setVisible(false);
    },
    submit: () => {
      setVisible(false);
    },
  }));

  // Định dạng hiển thị tiền tệ VNĐ
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(amount || 0).replace('₫', 'đ');
  };

  // Tạo ảnh báo cáo công nợ ngày dạng bảng kẻ chi tiết chuẩn kế toán (giống ảnh hóa đơn khách hàng)
  const generateDailyReportImage = (date, rawTransactions = [], rawPayments = []) => {
    if (Platform.OS !== 'web') return;

    setGenerating(true);
    setImageUri(null);

    try {
      // 1. Lọc toàn bộ giao dịch mua hàng, trả hàng và thanh toán theo ngày đã chọn (không áp dụng bộ lọc nào)
      const dayTransactions = rawTransactions.filter(t => toDateKey(t.date) === date);
      const dayPayments = rawPayments.filter(p => toDateKey(p.paidAt) === date);

      // 2. Gom nhóm theo từng Khách hàng
      // customerMap: { [customerIdOrName]: { customerName, entries: [] } }
      const customerMap = {};
      let totalMeatAmount = 0;
      let totalReturnAmount = 0;
      let totalPaymentAmount = 0;

      // 2.1. Thêm các món hàng từ giao dịch (Transactions)
      dayTransactions.forEach(t => {
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
          t.items.forEach(item => {
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
      dayPayments.forEach(p => {
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
          returnItems.forEach(ritem => {
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
      const activeCustomers = Object.values(customerMap).filter(c => c.entries && c.entries.length > 0);
      // Sắp xếp theo tên khách hàng tiếng Việt
      const sortedCustomers = activeCustomers.sort((a, b) => a.name.localeCompare(b.name, 'vi'));

      const finalRemaining = Math.max(0, totalMeatAmount - totalReturnAmount - totalPaymentAmount);

      setStatTotals({
        meatAmount: totalMeatAmount,
        returnAmount: totalReturnAmount,
        paymentAmount: totalPaymentAmount,
        finalRemaining,
      });

      // Nếu không có bất kỳ giao dịch nào trong ngày
      if (sortedCustomers.length === 0) {
        setGenerating(false);
        setImageUri(null);
        return;
      }

      const totalEntriesCount = sortedCustomers.reduce((sum, c) => sum + c.entries.length, 0);

      // ─── THIẾT KẾ BẢNG VẼ CANVAS CHUẨN ĐỒ HỌA CAO CẤP (PREMIUM INVOICE NHƯ ẢNH 2) ───
      const startX = 36;
      // Cột: [Khách hàng: 130px (tăng thêm vừa vặn), Tên hàng: 220px (rộng rãi), SL (KG): 65px, Đơn giá: 95px, Thành tiền: 130px]
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

      // Các dòng tổng kết cuối bảng:
      // 1. Tổng tiền hàng
      // 2. Tiền hàng trả về (nếu có)
      // 3. Đã thu (nếu có)
      // 4. Còn lại phải thu
      const summaryRowsCount = 1 + (totalReturnAmount > 0 ? 1 : 0) + (totalPaymentAmount > 0 ? 1 : 0) + 1;
      const summaryHeight = summaryRowsCount * summaryRowHeight;
      const summaryStartY = startTableY + tableHeaderHeight + tableContentHeight + 16;
      const canvasHeight = summaryStartY + summaryHeight + 30;

      // Tạo canvas và phóng tỉ lệ 2x cho độ nét cao (Retina)
      const canvas = document.createElement('canvas');
      const scale = 2;
      canvas.width = canvasWidth * scale;
      canvas.height = canvasHeight * scale;
      const ctx = canvas.getContext('2d');
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

      const titleText = `BÁO CÁO CÔNG NỢ NGÀY ${date}`;
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

            // Cột 1: Tên hàng (Chữ nét thường, tự động co giãn nếu quá dài để không bao giờ tràn cột)
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

            // Đường kẻ ngang giữa các món của cùng 1 khách (mảnh nhẹ)
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

          // Chữ tên khách hàng (căn giữa theo ô gộp, tự động xuống dòng và co giãn cỡ chữ vừa vặn hoàn hảo)
          ctx.fillStyle = '#1E293B';
          ctx.textAlign = 'center';
          let custFontSize = 12.5;
          ctx.font = `bold ${custFontSize}px Arial, sans-serif`;

          let nameLines = wrapText(ctx, cust.name || '', colWidths[0] - 8);
          let lineHeight = custFontSize + 3.5;
          let totalTextHeight = nameLines.length * lineHeight;

          // Nếu số dòng nhân chiều cao vượt quá chiều cao ô gộp, giảm nhẹ cỡ chữ để toàn bộ tên hiển thị đẹp
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

          // Đường kẻ ngang phân tách giữa các khách hàng (đậm và rõ nét hơn để dễ phân biệt từng khách)
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
      const leftEndY = drawPanel(leftCustomers, startX);

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
      ctx.fillText(`TỔNG TIỀN HÀNG (${date}):`, summaryStartX + summaryColLeftWidth - 10, curSummaryY + summaryRowHeight / 2);
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
      ctx.fillText(`CÒN LẠI PHẢI THU (${date}):`, summaryStartX + summaryColLeftWidth - 10, curSummaryY + summaryRowHeight / 2);
      ctx.fillStyle = finalRemaining > 0 ? '#DC2626' : '#059669';
      ctx.font = 'bold 17.5px Arial, sans-serif';
      ctx.fillText(`${new Intl.NumberFormat('vi-VN').format(finalRemaining)} đ`, summaryStartX + panelWidth - 10, curSummaryY + summaryRowHeight / 2);

      // Chuyển canvas thành Data URL PNG sắc nét
      const dataUrl = canvas.toDataURL('image/png');
      setImageUri(dataUrl);
    } catch (err) {
      console.error('[GENERATE DAILY REPORT ERROR]', err);
    } finally {
      setGenerating(false);
    }
  };

  // Tải ảnh hoặc chuyển tiếp Zalo tùy theo thiết bị
  const handleDownloadImage = () => {
    if (!imageUri) return;
    const fileName = customFileNameState || `BaoCaoCongNo_Ngay_${(selectedDate || '').replace(/\//g, '-')}.png`;
    downloadOrShareImage({
      imageUri,
      fileName,
      title: modalTitle || `Báo cáo công nợ ngày ${selectedDate}`,
      text: `Bảng kê công nợ ngày ${selectedDate}`,
    });
  };

  return (
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)}>
        <View style={styles.modalView}>
          {/* Header modal có tiêu đề và nút đóng */}
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalTitle}>{modalTitle}</Text>
            <TouchableOpacity
              style={styles.modalCloseIconBtn}
              onPress={() => setVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCloseIconText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Thẻ tóm tắt thông tin ngày xuất */}
          <View style={styles.summaryInfoCard}>
            <View style={styles.summaryDateBadge}>
              <Text style={styles.summaryDateText}>📅 Báo cáo ngày: {selectedDate}</Text>
            </View>
            {customStatsState && customStatsState.type === 'duplicate' ? (
              <View style={styles.summaryStatsRow}>
                <View style={[styles.microStatPill, styles.statPillDebt]}>
                  <Text style={styles.statPillLabel}>⚠️ Tiền đơn trùng:</Text>
                  <Text style={styles.statPillValue}>{formatCurrency(customStatsState.totalDupAmount)}</Text>
                </View>
                <View style={[styles.microStatPill, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                  <Text style={[styles.statPillLabel, { color: '#1E40AF' }]}>👥 Khách bị trùng:</Text>
                  <Text style={[styles.statPillValue, { color: '#1D4ED8' }]}>{customStatsState.duplicateCustomerCount} khách</Text>
                </View>
                <View style={[styles.microStatPill, { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' }]}>
                  <Text style={[styles.statPillLabel, { color: '#475569' }]}>📋 Số đơn trùng:</Text>
                  <Text style={[styles.statPillValue, { color: '#334155' }]}>{customStatsState.duplicateCount} đơn</Text>
                </View>
              </View>
            ) : (
              <View style={styles.summaryStatsRow}>
                <View style={[styles.microStatPill, styles.statPillDebt]}>
                  <Text style={styles.statPillLabel}>🔴 Nợ phát sinh:</Text>
                  <Text style={styles.statPillValue}>{formatCurrency(statTotals.meatAmount)}</Text>
                </View>
                <View style={[styles.microStatPill, styles.statPillPaid]}>
                  <Text style={styles.statPillLabel}>🟢 Đã thu:</Text>
                  <Text style={styles.statPillValue}>{formatCurrency(statTotals.paymentAmount)}</Text>
                </View>
                <View style={[styles.microStatPill, styles.statPillRemaining]}>
                  <Text style={styles.statPillLabel}>🔵 Còn lại:</Text>
                  <Text style={styles.statPillValue}>{formatCurrency(statTotals.finalRemaining)}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Vùng xem trước và tải ảnh */}
          {generating ? (
            <View style={styles.generatingBox}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.generatingText}>Đang vẽ ảnh báo cáo...</Text>
            </View>
          ) : !imageUri ? (
            <View style={styles.noImagePlaceholder}>
              <Text style={styles.placeholderText}>
                Không có giao dịch hoặc khoản thu nào trong ngày {selectedDate}.
              </Text>
            </View>
          ) : (
            <View style={styles.previewBox}>
              <View style={styles.previewHeaderRow}>
                <Text style={styles.sectionLabelInline}>Bảng ảnh xem trước:</Text>
                <View style={styles.inlineButtonsGroup}>
                  <TouchableOpacity
                    style={styles.previewZoomButtonInline}
                    onPress={() => imagePreviewModalRef.current?.open(imageUri)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.previewZoomButtonText}>🔍 PHÓNG TO</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.downloadButtonInline}
                    onPress={handleDownloadImage}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.downloadButtonInlineText}>
                      {isMobileDevice() ? '📲 GỬI ZALO' : '💾 TẢI ẢNH VỀ MÁY'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={styles.imageShadowFrame}
                activeOpacity={0.9}
                onPress={() => imagePreviewModalRef.current?.open(imageUri)}
              >
                <Image
                  source={{ uri: imageUri }}
                  style={styles.previewImage}
                  resizeMode="contain"
                />
                <View style={styles.zoomImageOverlayBadge}>
                  <Text style={styles.zoomImageOverlayText}>
                    🔍 Bấm vào ảnh để xem phóng to chi tiết
                  </Text>
                </View>
              </TouchableOpacity>

              <Text style={styles.helperText}>
                💡 Mẹo trên iPhone/Android: Bấm "📲 LƯU / GỬI ẢNH" để lưu trực tiếp vào Thư viện ảnh (Photos) hoặc gửi qua Zalo. Bạn cũng có thể nhấn giữ lâu vào ảnh và chọn "Lưu hình ảnh".
              </Text>
            </View>
          )}

          {/* Nút đóng dưới cùng */}
          <View style={styles.modalBottomActions}>
            <TouchableOpacity
              style={styles.closeBottomBtn}
              onPress={() => setVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.closeBottomBtnText}>ĐÓNG LẠI</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SmoothModal>

      {/* Modal phóng to xem ảnh toàn màn hình */}
      <ImagePreviewModal ref={imagePreviewModalRef} />
    </>
  );
});

export default ExportDailyReportModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    maxHeight: '96%',
    flex: 1,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
  },
  modalCloseIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseIconText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: 'bold',
  },
  summaryInfoCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    gap: 6,
  },
  summaryDateBadge: {
    alignSelf: 'flex-start',
  },
  summaryDateText: {
    fontSize: 13.5,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  summaryStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  microStatPill: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  statPillDebt: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  statPillPaid: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  statPillRemaining: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  statPillLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#64748B',
    marginBottom: 1,
  },
  statPillValue: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
  },
  generatingBox: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  generatingText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  noImagePlaceholder: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  previewBox: {
    flex: 1,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionLabelInline: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  inlineButtonsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewZoomButtonInline: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewZoomButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#334155',
  },
  downloadButtonInline: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  downloadButtonInlineText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  imageShadowFrame: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#F8FAFC',
    maxHeight: 440,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.card,
  },
  previewImage: {
    width: '100%',
    height: 420,
  },
  zoomImageOverlayBadge: {
    position: 'absolute',
    bottom: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  zoomImageOverlayText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  helperText: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
    marginTop: 8,
    fontStyle: 'italic',
  },
  modalBottomActions: {
    marginTop: 10,
  },
  closeBottomBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBottomBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#475569',
  },
});
