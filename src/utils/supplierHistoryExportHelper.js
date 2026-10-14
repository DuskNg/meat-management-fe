// meat-management-fe/src/utils/supplierHistoryExportHelper.js
import { Platform } from 'react-native';
import { showGlobalToast } from '../store/toastStore';
import { downloadOrShareImage } from './imageShareHelper';

// Các hàm tiện ích định dạng
const padZero = (n) => String(n).padStart(2, '0');

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount || 0).replace('₫', 'đ');
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${padZero(d.getDate())}/${padZero(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// Hàm ngắt dòng văn bản dài cho Canvas
const wrapText = (context, text, maxWidth) => {
  if (!text) return [];
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = context.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
};

// Phân tích chuỗi ngày DD/MM/YYYY thành Date
const parseDDMMYYYYToDate = (str, isEndOfDay = false) => {
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
 * Tạo thẻ Canvas vẽ bảng kê chi tiết giao dịch nhà cung cấp theo bộ lọc
 * @param {Object} params
 * @param {Object} params.supplier - Thông tin nhà cung cấp { name, phone, address, createdAt }
 * @param {Array} params.historyList - Danh sách giao dịch đã lọc theo bộ lọc hiện tại
 * @param {Object} params.filterInfo - Thông tin bộ lọc { fromDate, toDate, selectedFilter, typeFilter }
 * @returns {HTMLCanvasElement|null}
 */
export const generateSupplierHistoryCanvas = ({
  supplier,
  historyList = [],
  filterInfo = {},
}) => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return null;
  }

  const {
    fromDate = '',
    toDate = '',
    selectedFilter = 'ALL',
    typeFilter = 'ALL',
  } = filterInfo;

  // 1. Sắp xếp danh sách giao dịch theo ngày tăng dần để theo dõi tuần tự
  const sortedItems = [...historyList].sort((a, b) => {
    const timeA = a.date ? new Date(a.date).getTime() : 0;
    const timeB = b.date ? new Date(b.date).getTime() : 0;
    return timeA - timeB;
  });

  // 2. Tính toán tổng nợ nhập và tổng tiền đã thanh toán
  let totalDebt = 0;
  let totalPayment = 0;
  sortedItems.forEach((it) => {
    const amt = parseFloat(it.amount || 0);
    if (it.type === 'DEBT') {
      totalDebt += amt;
    } else {
      totalPayment += amt;
    }
  });
  const balance = totalDebt - totalPayment;

  // 3. Xác định tiêu đề báo cáo & phụ đề thời gian theo bộ lọc
  let titleText = 'BẢNG KÊ NHẬP HÀNG & THANH TOÁN TIỀN HÀNG';
  if (typeFilter === 'DEBT') {
    titleText = 'BẢNG KÊ TIỀN HÀNG NHẬP';
  } else if (typeFilter === 'PAYMENT') {
    titleText = 'BẢNG KÊ THANH TOÁN TIỀN HÀNG';
  }

  let periodText = 'TOÀN BỘ THỜI GIAN';
  if (fromDate && toDate) {
    if (fromDate === toDate) {
      periodText = `NGÀY ${fromDate}`;
    } else {
      periodText = `TỪ NGÀY ${fromDate} ĐẾN NGÀY ${toDate}`;
    }
  } else if (fromDate) {
    periodText = `TỪ NGÀY ${fromDate}`;
  } else if (toDate) {
    periodText = `ĐẾN NGÀY ${toDate}`;
  } else if (selectedFilter === 'TODAY') {
    const now = new Date();
    periodText = `HÔM NAY (${padZero(now.getDate())}/${padZero(now.getMonth() + 1)}/${now.getFullYear()})`;
  } else if (selectedFilter === '7_DAYS') {
    periodText = '7 NGÀY GẦN NHẤT';
  } else if (selectedFilter === '30_DAYS') {
    periodText = '30 NGÀY GẦN NHẤT';
  } else if (selectedFilter && selectedFilter.includes('/')) {
    periodText = `THÁNG ${selectedFilter}`;
  }

  // 4. Kích thước & bố cục Canvas
  const width = 860;
  const colWidths = {
    stt: 45,
    date: 105,
    type: 125,
    note: 385,
    amount: 150,
  };

  const startTableY = 220;
  const rowMinHeight = 38;
  const paddingX = 25;

  // Đo kích thước dòng
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.font = '13px Arial';

  const rowsLayout = sortedItems.map((item, idx) => {
    let noteText = item.note ? item.note.trim() : '';
    if (!noteText) {
      if (Array.isArray(item.items) && item.items.length > 0) {
        noteText = item.items
          .map((m) => `${m.productName || m.name || 'Mặt hàng'} (${m.quantity || m.weight || 0}kg)`)
          .join(', ');
      } else {
        noteText = item.type === 'DEBT' ? 'Nhập hàng nợ' : 'Thanh toán tiền hàng';
      }
    }
    const lines = wrapText(tempCtx, noteText, colWidths.note - 16);
    const rowHeight = Math.max(rowMinHeight, lines.length * 18 + 14);
    return {
      ...item,
      stt: idx + 1,
      lines,
      rowHeight,
    };
  });

  const tableContentHeight = rowsLayout.length > 0
    ? rowsLayout.reduce((sum, r) => sum + r.rowHeight, 0)
    : 60;

  const footerHeight = 260;
  const canvasHeight = startTableY + 42 + tableContentHeight + footerHeight;

  // Tạo Canvas chính với độ sắc nét cao (scale = 1.5)
  const canvas = document.createElement('canvas');
  const scale = 1.5;
  canvas.width = width * scale;
  canvas.height = canvasHeight * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  // Nền trắng tinh
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, canvasHeight);

  // Khung viền ngoài
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, width - 24, canvasHeight - 24);

  // ─── PHẦN TIÊU ĐỀ BÁO CÁO ───
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 22px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(titleText, width / 2, 55);

  ctx.fillStyle = '#475569';
  ctx.font = 'bold 15px Arial';
  ctx.fillText(periodText, width / 2, 80);

  // Đường kẻ phân cách header
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(paddingX, 98);
  ctx.lineTo(width - paddingX, 98);
  ctx.stroke();

  // Thông tin nhà cung cấp
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 15px Arial';
  ctx.fillText(`Nhà cung cấp: ${supplier?.name || '---'}`, paddingX, 126);

  ctx.font = '14px Arial';
  ctx.fillStyle = '#475569';
  ctx.fillText(`Số điện thoại: ${supplier?.phone || 'Chưa cập nhật'}`, paddingX, 151);
  if (supplier?.address) {
    ctx.fillText(`Địa chỉ: ${supplier.address}`, paddingX, 176);
  }

  // Thời gian xuất báo cáo & số giao dịch
  const now = new Date();
  const exportTime = `${padZero(now.getHours())}:${padZero(now.getMinutes())} - ${padZero(now.getDate())}/${padZero(now.getMonth() + 1)}/${now.getFullYear()}`;
  ctx.textAlign = 'right';
  ctx.font = 'italic 13px Arial';
  ctx.fillStyle = '#64748B';
  ctx.fillText(`Thời gian xuất: ${exportTime}`, width - paddingX, 126);
  ctx.fillText(`Tổng số giao dịch: ${sortedItems.length}`, width - paddingX, 151);

  // ─── TIÊU ĐỀ BẢNG DỮ LIỆU (TABLE HEADER) ───
  const tableHeadY = startTableY;
  const tableWidth = width - paddingX * 2;
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(paddingX, tableHeadY, tableWidth, 36);

  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1;
  ctx.strokeRect(paddingX, tableHeadY, tableWidth, 36);

  ctx.fillStyle = '#1E293B';
  ctx.font = 'bold 13px Arial';
  ctx.textAlign = 'center';

  let curX = paddingX;
  ctx.fillText('STT', curX + colWidths.stt / 2, tableHeadY + 23);
  curX += colWidths.stt;

  ctx.fillText('Ngày', curX + colWidths.date / 2, tableHeadY + 23);
  curX += colWidths.date;

  ctx.fillText('Loại giao dịch', curX + colWidths.type / 2, tableHeadY + 23);
  curX += colWidths.type;

  ctx.textAlign = 'left';
  ctx.fillText('Nội dung / Ghi chú đơn hàng', curX + 10, tableHeadY + 23);
  curX += colWidths.note;

  ctx.textAlign = 'right';
  ctx.fillText('Số tiền (VND)', curX + colWidths.amount - 10, tableHeadY + 23);

  // Kẻ đường dọc giữa các cột tiêu đề
  let lineX = paddingX;
  [colWidths.stt, colWidths.date, colWidths.type, colWidths.note].forEach((w) => {
    lineX += w;
    ctx.beginPath();
    ctx.moveTo(lineX, tableHeadY);
    ctx.lineTo(lineX, tableHeadY + 36);
    ctx.stroke();
  });

  // ─── DÒNG DỮ LIỆU (TABLE ROWS) ───
  let curY = tableHeadY + 36;
  if (rowsLayout.length === 0) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(paddingX, curY, tableWidth, 60);
    ctx.strokeRect(paddingX, curY, tableWidth, 60);

    ctx.fillStyle = '#94A3B8';
    ctx.font = 'italic 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Không có giao dịch nào phù hợp với bộ lọc đã chọn.', width / 2, curY + 35);
    curY += 60;
  } else {
    rowsLayout.forEach((row, idx) => {
      const isDebt = row.type === 'DEBT';
      ctx.fillStyle = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      ctx.fillRect(paddingX, curY, tableWidth, row.rowHeight);
      ctx.strokeRect(paddingX, curY, tableWidth, row.rowHeight);

      // Cột STT
      let colX = paddingX;
      ctx.fillStyle = '#475569';
      ctx.font = '13px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(row.stt.toString(), colX + colWidths.stt / 2, curY + 23);
      colX += colWidths.stt;

      // Cột Ngày
      ctx.fillText(formatDate(row.date), colX + colWidths.date / 2, curY + 23);
      colX += colWidths.date;

      // Cột Loại giao dịch (Badge)
      ctx.textAlign = 'center';
      ctx.font = 'bold 12px Arial';
      ctx.fillStyle = isDebt ? '#DC2626' : '#16A34A';
      ctx.fillText(isDebt ? '📥 Nhập hàng' : '💵 Trả tiền', colX + colWidths.type / 2, curY + 23);
      colX += colWidths.type;

      // Cột Ghi chú
      ctx.textAlign = 'left';
      ctx.font = '13px Arial';
      ctx.fillStyle = '#334155';
      row.lines.forEach((line, lineIdx) => {
        ctx.fillText(line, colX + 8, curY + 20 + lineIdx * 18);
      });
      colX += colWidths.note;

      // Cột Số tiền
      ctx.textAlign = 'right';
      ctx.font = 'bold 13px Arial';
      ctx.fillStyle = isDebt ? '#DC2626' : '#16A34A';
      const sign = isDebt ? '+' : '-';
      ctx.fillText(`${sign}${formatCurrency(row.amount)}`, colX + colWidths.amount - 10, curY + 23);

      // Kẻ đường dọc giữa các cột
      let rLineX = paddingX;
      [colWidths.stt, colWidths.date, colWidths.type, colWidths.note].forEach((w) => {
        rLineX += w;
        ctx.beginPath();
        ctx.moveTo(rLineX, curY);
        ctx.lineTo(rLineX, curY + row.rowHeight);
        ctx.stroke();
      });

      curY += row.rowHeight;
    });
  }

  // ─── TỔNG KẾT & CHÚ THÍCH (SUMMARY FOOTER) ───
  curY += 15;
  const summaryBoxWidth = 380;
  const summaryX = width - paddingX - summaryBoxWidth;

  // Tính toán chú thích ngày không có hàng nhập hoặc tóm tắt
  const noteBoxX = paddingX;
  const noteBoxWidth = summaryX - paddingX - 16;
  const noteBoxHeight = 105;

  ctx.fillStyle = '#FFFBEB';
  ctx.fillRect(noteBoxX, curY, noteBoxWidth, noteBoxHeight);
  ctx.strokeStyle = '#FDE68A';
  ctx.lineWidth = 1;
  ctx.strokeRect(noteBoxX, curY, noteBoxWidth, noteBoxHeight);

  if (typeFilter === 'PAYMENT') {
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px Arial';
    ctx.fillStyle = '#92400E';
    ctx.fillText('📌 Chú thích: Bảng kê thanh toán', noteBoxX + 12, curY + 22);

    ctx.font = '12px Arial';
    ctx.fillStyle = '#1E293B';
    ctx.fillText(`• Tổng số đợt chi trả: ${sortedItems.length} đợt`, noteBoxX + 12, curY + 48);
    ctx.fillText(`• Tổng tiền đã thanh toán: ${formatCurrency(totalPayment)}`, noteBoxX + 12, curY + 70);
  } else {
    // Xét tính missing days nếu khoảng ngày hợp lý (<= 31 ngày)
    let shouldCalculateMissingDays = false;
    let evalStartDate = null;
    let evalEndDate = null;

    if (fromDate && toDate) {
      const dFrom = parseDDMMYYYYToDate(fromDate, false);
      const dTo = parseDDMMYYYYToDate(toDate, true);
      if (dFrom && dTo) {
        const diffDays = Math.round((dTo.getTime() - dFrom.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 31) {
          shouldCalculateMissingDays = true;
          evalStartDate = dFrom;
          evalEndDate = dTo > now ? now : dTo;
        }
      }
    } else if (selectedFilter && selectedFilter.includes('/')) {
      const [m, y] = selectedFilter.split('/').map(Number);
      if (!isNaN(m) && !isNaN(y)) {
        shouldCalculateMissingDays = true;
        evalStartDate = new Date(y, m - 1, 1);
        const lastDay = new Date(y, m, 0).getDate();
        const endOfMonth = new Date(y, m - 1, lastDay, 23, 59, 59);
        evalEndDate = endOfMonth > now ? now : endOfMonth;
      }
    }

    ctx.textAlign = 'left';
    ctx.font = 'bold 13px Arial';
    ctx.fillStyle = '#92400E';
    ctx.fillText('📌 Chú thích: Ngày nhập tiền hàng', noteBoxX + 12, curY + 22);

    if (shouldCalculateMissingDays && evalStartDate && evalEndDate && evalStartDate <= evalEndDate) {
      // Tập hợp các ngày có tiền hàng nhập DEBT
      const debtDateKeys = new Set();
      sortedItems.forEach((it) => {
        if (it.type === 'DEBT' && it.date) {
          const d = new Date(it.date);
          if (!isNaN(d.getTime())) {
            debtDateKeys.add(`${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`);
          }
        }
      });

      const missingDateList = [];
      const loopDate = new Date(evalStartDate);
      loopDate.setHours(0, 0, 0, 0);
      const stopDate = new Date(evalEndDate);
      stopDate.setHours(0, 0, 0, 0);

      while (loopDate <= stopDate) {
        const key = `${loopDate.getFullYear()}-${padZero(loopDate.getMonth() + 1)}-${padZero(loopDate.getDate())}`;
        if (!debtDateKeys.has(key)) {
          missingDateList.push(padZero(loopDate.getDate()));
        }
        loopDate.setDate(loopDate.getDate() + 1);
      }

      if (missingDateList.length === 0) {
        ctx.fillStyle = '#166534';
        ctx.font = '12px Arial';
        ctx.fillText('🎉 Tất cả các ngày trong khoảng thời gian đã chọn đều có hàng nhập.', noteBoxX + 12, curY + 48);
      } else {
        ctx.fillStyle = '#DC2626';
        ctx.font = 'bold 12px Arial';
        ctx.fillText(`Không có tiền hàng nhập (${missingDateList.length} ngày):`, noteBoxX + 12, curY + 44);

        ctx.fillStyle = '#1E293B';
        ctx.font = '12px Arial';
        const wrappedLines = wrapText(ctx, `Ngày: ${missingDateList.join(', ')}`, noteBoxWidth - 24);
        wrappedLines.slice(0, 2).forEach((line, lIdx) => {
          ctx.fillText(line, noteBoxX + 12, curY + 62 + lIdx * 16);
        });
      }
    } else {
      // Trường hợp toàn bộ thời gian hoặc khoảng ngày dài
      const debtCount = sortedItems.filter((i) => i.type === 'DEBT').length;
      ctx.font = '12px Arial';
      ctx.fillStyle = '#1E293B';
      ctx.fillText(`• Số lượt nhập hàng trong kỳ: ${debtCount} lượt`, noteBoxX + 12, curY + 46);
      ctx.fillText(`• Tổng giá trị hàng nhập: ${formatCurrency(totalDebt)}`, noteBoxX + 12, curY + 68);
    }
  }

  // Hộp tổng kết tài chính (bên phải)
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(summaryX, curY, summaryBoxWidth, 105);
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.strokeRect(summaryX, curY, summaryBoxWidth, 105);

  if (typeFilter === 'ALL') {
    // Tổng tiền nhập hàng
    ctx.textAlign = 'left';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#475569';
    ctx.fillText('Tổng tiền hàng nhập (+):', summaryX + 15, curY + 28);

    ctx.textAlign = 'right';
    ctx.font = 'bold 15px Arial';
    ctx.fillStyle = '#DC2626';
    ctx.fillText(`+${formatCurrency(totalDebt)}`, summaryX + summaryBoxWidth - 15, curY + 28);

    // Tổng tiền đã thanh toán
    ctx.textAlign = 'left';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#475569';
    ctx.fillText('Tổng tiền đã trả (-):', summaryX + 15, curY + 58);

    ctx.textAlign = 'right';
    ctx.font = 'bold 15px Arial';
    ctx.fillStyle = '#16A34A';
    ctx.fillText(`-${formatCurrency(totalPayment)}`, summaryX + summaryBoxWidth - 15, curY + 58);

    // Chênh lệch
    ctx.textAlign = 'left';
    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = '#0F172A';
    ctx.fillText('Chênh lệch trong kỳ:', summaryX + 15, curY + 88);

    ctx.textAlign = 'right';
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = balance > 0 ? '#DC2626' : (balance < 0 ? '#16A34A' : '#475569');
    const balanceSign = balance > 0 ? '+' : '';
    ctx.fillText(`${balanceSign}${formatCurrency(balance)}`, summaryX + summaryBoxWidth - 15, curY + 88);
  } else if (typeFilter === 'DEBT') {
    ctx.textAlign = 'left';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#475569';
    ctx.fillText('Tổng tiền hàng nhập (+):', summaryX + 15, curY + 36);

    ctx.textAlign = 'right';
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = '#DC2626';
    ctx.fillText(`+${formatCurrency(totalDebt)}`, summaryX + summaryBoxWidth - 15, curY + 36);

    ctx.textAlign = 'left';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#475569';
    ctx.fillText('Số lượt nhập hàng:', summaryX + 15, curY + 76);

    ctx.textAlign = 'right';
    ctx.font = 'bold 15px Arial';
    ctx.fillStyle = '#0F172A';
    ctx.fillText(`${sortedItems.length} lượt`, summaryX + summaryBoxWidth - 15, curY + 76);
  } else {
    ctx.textAlign = 'left';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#475569';
    ctx.fillText('Tổng tiền đã trả (-):', summaryX + 15, curY + 36);

    ctx.textAlign = 'right';
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = '#16A34A';
    ctx.fillText(`-${formatCurrency(totalPayment)}`, summaryX + summaryBoxWidth - 15, curY + 36);

    ctx.textAlign = 'left';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#475569';
    ctx.fillText('Số lượt thanh toán:', summaryX + 15, curY + 76);

    ctx.textAlign = 'right';
    ctx.font = 'bold 15px Arial';
    ctx.fillStyle = '#0F172A';
    ctx.fillText(`${sortedItems.length} lượt`, summaryX + summaryBoxWidth - 15, curY + 76);
  }

  // ─── KHU VỰC CHỮ KÝ ───
  const signY = curY + 130;
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';

  ctx.fillText('ĐẠI DIỆN BÊN BÁN (NCC)', paddingX + 130, signY);
  ctx.font = 'italic 12px Arial';
  ctx.fillStyle = '#64748B';
  ctx.fillText('(Ký và ghi rõ họ tên)', paddingX + 130, signY + 20);

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 14px Arial';
  ctx.fillText('ĐẠI DIỆN BÊN MUA (CHỦ SẠP)', width - paddingX - 130, signY);
  ctx.font = 'italic 12px Arial';
  ctx.fillStyle = '#64748B';
  ctx.fillText('(Ký và ghi rõ họ tên)', width - paddingX - 130, signY + 20);

  return canvas;
};

/**
 * Thực hiện xuất ảnh lịch sử giao dịch nhà cung cấp theo bộ lọc ngay lập tức
 * @param {Object} params
 * @param {Object} params.supplier
 * @param {Array} params.historyList
 * @param {Object} params.filterInfo
 */
export const exportSupplierHistoryImage = async ({
  supplier,
  historyList = [],
  filterInfo = {},
}) => {
  if (Platform.OS !== 'web') {
    showGlobalToast('Tính năng xuất ảnh hiện hỗ trợ tốt nhất trên nền tảng Web.', 'info');
    return false;
  }

  try {
    const canvas = generateSupplierHistoryCanvas({
      supplier,
      historyList,
      filterInfo,
    });

    if (!canvas) {
      showGlobalToast('Không thể tạo bản vẽ ảnh báo cáo.', 'error');
      return false;
    }

    const dataUrl = canvas.toDataURL('image/png');

    const safeSupplier = (supplier?.name || 'NCC').replace(/[\s\/\\]+/g, '_');
    const safeFilter = (filterInfo?.selectedFilter || 'BoLoc').replace(/[\s\/\\]+/g, '-');
    const safeType = filterInfo?.typeFilter === 'DEBT' ? 'NhapHang' : (filterInfo?.typeFilter === 'PAYMENT' ? 'TraTien' : 'GiaoDich');
    const fileName = `BangKe_NCC_${safeSupplier}_${safeType}_${safeFilter}_${Date.now()}.png`;

    await downloadOrShareImage({
      imageUri: dataUrl,
      fileName,
      title: `Bảng kê giao dịch NCC ${supplier?.name || ''}`,
      text: `Bảng kê giao dịch Nhà cung cấp: ${supplier?.name || ''}`,
      phone: supplier?.phone || '',
      customerName: supplier?.name || '',
    });

    return true;
  } catch (err) {
    console.error('[EXPORT SUPPLIER HISTORY IMAGE ERROR]', err);
    showGlobalToast('Đã xảy ra lỗi khi tạo hình ảnh báo cáo.', 'error');
    return false;
  }
};
