// meat-management-fe/src/components/ExportDebtModal.js
import React, { useState, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import SmoothModal from './SmoothModal';

// Hàm helper để xác định tháng mục tiêu của khoản thanh toán dựa trên ghi chú
const getPaymentTargetMonth = (p) => {
  const trimNote = (p.note || '').trim();
  const monthMatch = trimNote.match(/^Thanh toán nợ Tháng (\d{2})\/(\d{4})/);
  const dateMatch = trimNote.match(/^Thanh toán nợ ngày (\d{2})\/(\d{2})\/(\d{4})/);

  if (monthMatch) {
    return `${monthMatch[1]}/${monthMatch[2]}`;
  }
  if (dateMatch) {
    return `${dateMatch[2]}/${dateMatch[3]}`;
  }
  const d = new Date(p.paidAt);
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const yyyy = d.getFullYear();
};

const formatPaymentNote = (note, paidAt) => {
  if (!note) return 'Thu tiền nợ';
  const trimNote = note.trim();
  if (trimNote.startsWith('Thanh toán nợ Tháng') && !trimNote.includes('ngày')) {
    const d = new Date(paidAt);
    if (!isNaN(d.getTime())) {
      const dd = d.getDate().toString().padStart(2, '0');
      const mm = (d.getMonth() + 1).toString().padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${trimNote} (ngày ${dd}/${mm}/${yyyy})`;
    }
  }
  return trimNote;
};

const ExportDebtModal = forwardRef(({ onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [availableMonths, setAvailableMonths] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [imageUri, setImageUri] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [totalDebtInMonth, setTotalDebtInMonth] = useState(0);
  const [totalPaymentInMonth, setTotalPaymentInMonth] = useState(0);

  // 1. Phơi bày các hàm điều khiển ra bên ngoài
  useImperativeHandle(ref, () => ({
    open: (c, targetMonth) => {
      setCustomer(c);
      setVisible(true);
      setSelectedMonth(targetMonth || '');
      setAvailableMonths([]);
      setTransactions([]);
      setPayments([]);
      setImageUri(null);
      setError('');
      fetchData(c.id, c, targetMonth);
    },
    close: () => {
      setVisible(false);
    }
  }));

  // 2. Tải toàn bộ giao dịch & thu tiền để trích xuất các tháng khả dụng
  const fetchData = async (customerId, currentCust, targetMonth) => {
    setLoading(true);
    setError('');
    try {
      const [transRes, payRes] = await Promise.all([
        api.get(`/transactions?customerId=${customerId}`),
        api.get(`/payments?customerId=${customerId}`)
      ]);

      const transList = transRes.data?.data || [];
      const payList = payRes.data?.data || [];

      setTransactions(transList);
      setPayments(payList);

      // Trích xuất các tháng duy nhất có giao dịch phát sinh
      const monthsSet = new Set();

      transList.forEach(t => {
        const d = new Date(t.date);
        const mm = (d.getMonth() + 1).toString().padStart(2, '0');
        const yyyy = d.getFullYear();
        monthsSet.add(`${mm}/${yyyy}`);
      });

      payList.forEach(p => {
        monthsSet.add(getPaymentTargetMonth(p));
      });

      // Chuyển set thành mảng và sắp xếp ngược lại (tháng mới nhất lên đầu)
      const monthsArray = Array.from(monthsSet).sort((a, b) => {
        const [aM, aY] = a.split('/').map(Number);
        const [bM, bY] = b.split('/').map(Number);
        return bY - aY || bM - aM;
      });

      setAvailableMonths(monthsArray);

      // Chọn tháng mặc định là tháng được chỉ định (hoặc tháng gần nhất có giao dịch)
      let defaultMonth = targetMonth;
      if (!defaultMonth) {
        if (monthsArray.length > 0) {
          defaultMonth = monthsArray[0];
        } else {
          const d = new Date();
          const mm = (d.getMonth() + 1).toString().padStart(2, '0');
          const yyyy = d.getFullYear();
          defaultMonth = `${mm}/${yyyy}`;
        }
      }
      setSelectedMonth(defaultMonth);

      // Tự động tạo ảnh công nợ ngay khi tải xong dữ liệu
      if (monthsArray.length > 0 || targetMonth) {
        generateDebtImage(defaultMonth, transList, payList, currentCust);
      }

    } catch (err) {
      console.error(err);
      setError('Không thể tải lịch sử giao dịch để xuất công nợ.');
    } finally {
      setLoading(false);
    }
  };

  // Định dạng hiển thị tiền tệ VNĐ
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount).replace('₫', 'đ');
  };

  // 3. Tạo file ảnh công nợ từ dữ liệu tháng được chọn bằng HTML5 Canvas (Cứ 16 dòng chia thành 1 cột, tự động giãn ngang)
  const generateDebtImage = (month, transList, payList, cust) => {
    if (Platform.OS !== 'web') {
      return; // Không vẽ trên môi trường Native để tránh lỗi Canvas
    }

    if (!month || !cust) return;

    setGenerating(true);
    setImageUri(null); // Reset ảnh cũ trong khi vẽ ảnh mới

    try {
      // Lọc các giao dịch phát sinh trong tháng đã chọn
      const filteredTrans = transList.filter(t => {
        const d = new Date(t.date);
        const mm = (d.getMonth() + 1).toString().padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${mm}/${yyyy}` === month;
      });

      const filteredPays = payList.filter(p => {
        return getPaymentTargetMonth(p) === month;
      });

      // Nhóm giao dịch & thanh toán theo ngày (mỗi ngày chỉ 1 mảng thôi)
      const dayMap = {};
      let totalDebtVal = 0;
      let totalPaymentVal = 0;

      const [mm, yyyy] = month.split('/').map(Number);
      const daysInMonth = new Date(yyyy, mm, 0).getDate();

      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1;
      const currentYear = currentDate.getFullYear();
      const currentDay = currentDate.getDate();

      const isCurrentMonth = (mm === currentMonth && yyyy === currentYear);
      const maxDay = isCurrentMonth ? Math.min(daysInMonth, currentDay) : daysInMonth;

      filteredTrans.forEach(t => {
        const d = new Date(t.date);
        const dateKey = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
        if (!dayMap[dateKey]) {
          dayMap[dateKey] = {
            date: t.date,
            dateKey,
            debtAmount: 0,
            paymentAmount: 0,
            items: [],
            notes: []
          };
        }
        const amt = parseFloat(t.totalAmount || 0);
        dayMap[dateKey].debtAmount += amt;
        totalDebtVal += amt;

        if (t.items && t.items.length > 0) {
          t.items.forEach(item => {
            const q = parseFloat(item.quantity);
            const p = parseFloat(item.price);
            const name = item.product?.name || 'Thịt';
            const isQuick = name === 'Tiền hàng' || name.toLowerCase().startsWith('tiền') || t.note === 'Ghi nợ nhanh';
            if (isQuick) {
              dayMap[dateKey].items.push(name);
            } else {
              dayMap[dateKey].items.push(`${q}${item.product?.unit || 'kg'} ${name} (giá ${p / 1000}k)`);
            }
          });
        }
        if (t.note && t.note !== 'Ghi nợ nhanh') {
          dayMap[dateKey].notes.push(t.note);
        }
      });

      filteredPays.forEach(p => {
        const d = new Date(p.paidAt);
        const dateKey = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
        if (!dayMap[dateKey]) {
          dayMap[dateKey] = {
            date: p.paidAt,
            dateKey,
            debtAmount: 0,
            paymentAmount: 0,
            items: [],
            notes: []
          };
        }
        const amt = parseFloat(p.amount || 0);
        dayMap[dateKey].paymentAmount += amt;
        totalPaymentVal += amt;

        if (p.note && !p.note.startsWith('Thanh toán nợ ngày')) {
          dayMap[dateKey].notes.push(formatPaymentNote(p.note, p.paidAt));
        }
      });

      // Lọc các ngày thực sự có phát sinh giao dịch hoặc thanh toán
      const activeRows = Object.values(dayMap).filter(
        r => r.debtAmount > 0 || r.paymentAmount > 0 || r.items.length > 0 || r.notes.length > 0
      );
      const activeDateKeys = new Set(activeRows.map(r => r.dateKey));

      // Sắp xếp tăng dần theo thời gian (cũ tới mới)
      const sortedRows = activeRows.sort((a, b) => new Date(a.date) - new Date(b.date));

      // Tính danh sách các ngày không có công nợ
      const emptyDays = [];
      for (let day = 1; day <= maxDay; day++) {
        const dateKey = `${day.toString().padStart(2, '0')}/${mm.toString().padStart(2, '0')}/${yyyy}`;
        if (!activeDateKeys.has(dateKey)) {
          emptyDays.push(day.toString().padStart(2, '0'));
        }
      }

      // Lưu trữ dữ liệu vào State
      setRows(sortedRows);
      setTotalDebtInMonth(totalDebtVal);
      setTotalPaymentInMonth(totalPaymentVal);

      // Nếu vượt quá 100 ngày giao dịch, không vẽ ảnh mà hiển thị xuất Excel
      if (sortedRows.length > 100) {
        setGenerating(false);
        setImageUri(null);
        return;
      }

      // Hàm ngắt dòng cho chữ tiếng Việt trên canvas
      const wrapText = (context, text, maxWidth) => {
        const lines = [];
        let currentLine = '';
        const words = text.split(' ');

        for (let i = 0; i < words.length; i++) {
          let word = words[i];

          // Nếu bản thân một từ dài hơn maxWidth, cần bẻ từ đó ra
          while (context.measureText(word).width > maxWidth) {
            let breakIndex = 1;
            while (context.measureText(word.substring(0, breakIndex)).width <= maxWidth && breakIndex <= word.length) {
              breakIndex++;
            }
            breakIndex--; // Lùi lại để lấy phần an toàn

            const part = word.substring(0, breakIndex);

            if (currentLine) {
              lines.push(currentLine);
              currentLine = '';
            }
            lines.push(part);
            word = word.substring(breakIndex);
          }

          if (!word) continue;

          const testLine = currentLine ? currentLine + ' ' + word : word;
          const metrics = context.measureText(testLine);

          if (metrics.width <= maxWidth) {
            currentLine = testLine;
          } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
          }
        }
        if (currentLine) {
          lines.push(currentLine);
        }
        return lines;
      };

      const startTableY = 180;

      // Tạo một canvas tạm thời để đo độ rộng chữ và tính toán chiều cao hàng
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.font = '15px Arial';

      const colDateX = 50;
      const colDescX = 110;
      const colDebtX = 800 - 170; // 630 (tính từ startX của mỗi cột)
      const colPayX = 800 - 50;   // 750 (tính từ startX của mỗi cột)
      const colDescMaxWidth = 380;

      const lineHeight = 20;
      const paddingY = 15;
      const minRowHeight = 55;

      // Tính toán số dòng chữ mô tả và chiều cao của từng hàng
      const rowsWithLayout = sortedRows.map(row => {
        let descText = '';
        const parts = [];
        if (row.items && row.items.length > 0) {
          parts.push(row.items.join(', '));
        }
        if (row.notes && row.notes.length > 0) {
          parts.push(row.notes.join('; '));
        }
        descText = parts.join(' | ');

        // Sử dụng hàm wrapText để ngắt dòng chi tiết giao dịch
        const descLines = wrapText(tempCtx, descText, colDescMaxWidth);

        // Chiều cao tính toán của hàng
        const textHeight = Math.max(1, descLines.length) * lineHeight;
        const calculatedHeight = textHeight + paddingY * 2;
        const rowHeight = Math.max(minRowHeight, calculatedHeight);

        return {
          ...row,
          descLines,
          rowHeight
        };
      });

      // Chia các dòng thành các cột:
      // Nếu tổng số dòng >= 20, chia thành 2 cột bằng nhau. Nếu lẻ thì cột bên trái nhiều hơn cột bên phải 1 sản phẩm.
      // Nếu tổng số dòng < 20, chỉ chia làm 1 cột.
      const totalRowsCount = rowsWithLayout.length;
      const columns = [];
      if (totalRowsCount >= 20) {
        const leftColSize = Math.ceil(totalRowsCount / 2);
        columns.push(rowsWithLayout.slice(0, leftColSize));
        columns.push(rowsWithLayout.slice(leftColSize));
      } else {
        columns.push(rowsWithLayout);
      }
      const numCols = columns.length;
      const colWidth = 800;
      const width = numCols * colWidth;

      // Tính chiều cao nội dung cao nhất trong các cột
      const colHeights = columns.map(col => {
        return col.length > 0 ? col.reduce((sum, r) => sum + r.rowHeight, 0) : 80;
      });
      const contentHeight = Math.max(...colHeights);

      // Tính toán chiều cao khung thông tin các ngày không có công nợ
      let emptyDaysLines = [];
      let emptyBoxHeight = 0;
      if (emptyDays.length > 0) {
        const emptyDaysText = `📌 Các ngày không phát sinh công nợ: Ngày ${emptyDays.join(', ')}`;
        tempCtx.font = 'bold 18px Arial';
        // Chiều rộng khả dụng bên trong khung (width - 80px lề 2 bên - 36px padding trong khung)
        emptyDaysLines = wrapText(tempCtx, emptyDaysText, width - 116);
        emptyBoxHeight = emptyDaysLines.length * 28 + 24; // 24px padding trên dưới
      }
      const footerExtraHeight = emptyDays.length > 0 ? (emptyBoxHeight + 20) : 0;
      const footerHeight = 220 + footerExtraHeight;
      const canvasHeight = startTableY + 42 + contentHeight + footerHeight;

      // Tạo canvas chính thức để vẽ
      const canvas = document.createElement('canvas');

      // Thiết lập kích thước canvas nhân với tỉ lệ scale 1.3 để xuất ảnh sắc nét hơn
      const scale = 1.3;
      canvas.width = width * scale;
      canvas.height = canvasHeight * scale;
      const ctx = canvas.getContext('2d');

      // Áp dụng tỉ lệ scale cho context vẽ để phóng to tất cả các thành phần tương ứng
      ctx.scale(scale, scale);

      // Vẽ nền trắng phẳng tinh tế
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, canvasHeight);

      // Vẽ viền bo nhẹ ngoài cùng
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 2;
      ctx.strokeRect(15, 15, width - 30, canvasHeight - 30);

      // ─── PHẦN TIÊU ĐỀ (HEADER) ───────────────────
      ctx.fillStyle = '#0F172A'; // Chữ tối màu tương phản cao
      ctx.font = 'bold 28px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`BẢNG CHI TIẾT CÔNG NỢ THÁNG ${month}`, width / 2, 65);

      // Vẽ đường phân cách nét mảnh
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(35, 95);
      ctx.lineTo(width - 35, 95);
      ctx.stroke();

      // Thông tin khách hàng - RẤT TO & RÕ RÀNG
      ctx.textAlign = 'left';
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 26px Arial';
      ctx.fillText(`Khách hàng: ${cust?.name || ''}`, 40, 142);

      ctx.textAlign = 'right';
      ctx.font = 'bold 18px Arial';
      ctx.fillStyle = '#475569';
      ctx.fillText(`Số ĐT: ${cust?.phone || 'Không có'}`, width - 40, 142);

      // ─── PHẦN BẢNG DỮ LIỆU (TABLE HEADER & ROWS) ──────────
      columns.forEach((colRows, colIdx) => {
        const startX = colIdx * colWidth;

        // Vẽ Header bảng màu xanh lá cho cột này
        ctx.fillStyle = '#10B981';
        ctx.fillRect(startX + 40, startTableY, 720, 42);
        ctx.strokeStyle = '#059669';
        ctx.lineWidth = 1;
        ctx.strokeRect(startX + 40, startTableY, 720, 42);

        // Chữ tiêu đề cột
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 15px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('Ngày', startX + colDateX, startTableY + 27);
        ctx.fillText('Nội dung / Chi tiết giao dịch trong ngày', startX + colDescX, startTableY + 27);

        ctx.textAlign = 'right';
        ctx.fillText('Tiền Nợ (+)', startX + colDebtX, startTableY + 27);
        ctx.fillText('Đã Trả (-)', startX + colPayX, startTableY + 27);

        // Vẽ các dòng giao dịch của cột này
        let currentY = startTableY + 42;
        ctx.textAlign = 'left';

        if (colRows.length === 0) {
          ctx.fillStyle = '#F8FAFC';
          ctx.fillRect(startX + 40, currentY, 720, 80);
          ctx.strokeStyle = '#E2E8F0';
          ctx.strokeRect(startX + 40, currentY, 720, 80);

          ctx.fillStyle = '#94A3B8';
          ctx.font = 'italic 16px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('Không có giao dịch phát sinh trong tháng này', startX + 400, currentY + 48);
        } else {
          colRows.forEach((row, idx) => {
            ctx.fillStyle = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
            ctx.fillRect(startX + 40, currentY, 720, row.rowHeight);

            ctx.strokeStyle = '#E2E8F0';
            ctx.strokeRect(startX + 40, currentY, 720, row.rowHeight);

            // Thiết lập textBaseline là middle để căn giữa dọc dễ dàng hơn
            ctx.textBaseline = 'middle';

            // Cột ngày
            ctx.fillStyle = '#0F172A';
            ctx.font = '15px Arial';
            ctx.textAlign = 'left';

            const [day, monthStr] = row.dateKey.split('/');
            ctx.fillText(`${day}/${monthStr}`, startX + colDateX, currentY + row.rowHeight / 2);

            // Cột Chi tiết mô tả - vẽ nhiều dòng
            ctx.textAlign = 'left';
            const startTextY = currentY + row.rowHeight / 2 - ((row.descLines.length - 1) * lineHeight) / 2;
            row.descLines.forEach((line, lineIdx) => {
              const textY = startTextY + lineIdx * lineHeight;
              ctx.fillStyle = '#0F172A';
              ctx.font = '15px Arial';
              ctx.fillText(line, startX + colDescX, textY);
            });

            // Cột tiền nợ
            ctx.textAlign = 'right';
            if (row.debtAmount > 0) {
              ctx.fillStyle = '#DC2626';
              ctx.font = 'bold 15px Arial';
              ctx.fillText(formatCurrency(row.debtAmount), startX + colDebtX, currentY + row.rowHeight / 2);
            }

            // Cột tiền trả
            if (row.paymentAmount > 0) {
              ctx.fillStyle = '#10B981';
              ctx.font = 'bold 15px Arial';
              ctx.fillText(formatCurrency(row.paymentAmount), startX + colPayX, currentY + row.rowHeight / 2);
            }

            currentY += row.rowHeight;
            ctx.textBaseline = 'alphabetic'; // Trả về mặc định cho các phần vẽ sau
            ctx.textAlign = 'left';
          });
        }
      });

      // ─── PHẦN TỔNG KẾT (FOOTER) ───────────────────
      let currentFooterY = startTableY + 42 + contentHeight + 20;

      // Vẽ Khung thông tin nổi bật các ngày không có công nợ
      if (emptyDays.length > 0) {
        const boxX = 40;
        const boxY = currentFooterY;
        const boxW = width - 80;
        const boxH = emptyBoxHeight;

        // Nền khung nổi bật
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(boxX, boxY, boxW, boxH);

        // Viền xung quanh khung
        ctx.strokeStyle = '#94A3B8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        // Vạch màu nhấn bên trái
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(boxX, boxY, 6, boxH);

        // Vẽ nội dung chữ to, đậm và rõ ràng
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = 'bold 18px Arial';
        ctx.fillStyle = '#0F172A';

        let textY = boxY + 12;
        emptyDaysLines.forEach((line) => {
          ctx.fillText(line, boxX + 18, textY);
          textY += 28;
        });

        ctx.textBaseline = 'alphabetic'; // Trả về mặc định
        currentFooterY += boxH + 20;
      }

      // Vẽ nét gạch ngang trước tổng kết
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(40, currentFooterY);
      ctx.lineTo(width - 40, currentFooterY);
      ctx.stroke();

      currentFooterY += 45;

      // Hàng 1: Tổng tiền nợ
      ctx.textAlign = 'right';
      ctx.fillStyle = '#334155';
      ctx.font = 'bold 22px Arial';
      ctx.fillText('Tổng tiền nợ:', width - 320, currentFooterY);

      ctx.fillStyle = '#DC2626';
      ctx.font = 'bold 26px Arial';
      ctx.fillText(formatCurrency(totalDebtVal), width - 40, currentFooterY);

      // Hàng 2: Tổng tiền đã thanh toán
      currentFooterY += 45;
      ctx.fillStyle = '#334155';
      ctx.font = 'bold 22px Arial';
      ctx.fillText('Tổng tiền đã thanh toán:', width - 320, currentFooterY);

      ctx.fillStyle = '#059669';
      ctx.font = 'bold 26px Arial';
      ctx.fillText(formatCurrency(totalPaymentVal), width - 40, currentFooterY);

      // Hàng 3: Tiền nợ còn lại (Rất to và nổi bật)
      currentFooterY += 52;
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 26px Arial';
      ctx.fillText('Tiền nợ còn lại:', width - 320, currentFooterY);

      // Chỉ tính nợ còn lại của riêng tháng được chọn
      const overallDebt = Math.max(0, totalDebtVal - totalPaymentVal);
      ctx.fillStyle = overallDebt > 0 ? '#DC2626' : '#059669';
      ctx.font = 'bold 34px Arial';
      ctx.fillText(formatCurrency(overallDebt), width - 40, currentFooterY);

      // Xuất base64
      const url = canvas.toDataURL('image/png');
      setImageUri(url);

    } catch (err) {
      console.error('[GENERATE IMAGE ERROR]', err);
    } finally {
      setGenerating(false);
    }
  };

  // Xử lý xuất công nợ tháng ra file Excel dạng CSV hỗ trợ tiếng Việt có dấu
  const handleExportExcel = () => {
    if (Platform.OS !== 'web') {
      alert('Chức năng xuất Excel hiện hỗ trợ trên giao diện Web.');
      return;
    }

    try {
      // Sử dụng byte order mark (BOM) UTF-8 để Excel hiển thị đúng dấu tiếng Việt
      let csvContent = '\uFEFF';

      // Tiêu đề báo cáo
      csvContent += `BẢNG CHI TIẾT CÔNG NỢ THÁNG ${selectedMonth}\r\n`;
      csvContent += `Khách hàng: ${customer?.name}\r\n`;
      csvContent += `Số ĐT: ${customer?.phone || 'Không có'}\r\n\r\n`;

      // Tiêu đề cột
      csvContent += 'Ngày,Nội dung / Chi tiết giao dịch,Tiền Nợ (+),Đã Trả (-)\r\n';

      // Duyệt qua danh sách để điền thông tin chi tiết
      rows.forEach(row => {
        let descText = '';
        const parts = [];
        if (row.items && row.items.length > 0) {
          parts.push(row.items.join(', '));
        }
        if (row.notes && row.notes.length > 0) {
          parts.push(row.notes.join('; '));
        }
        descText = parts.join(' | ');

        const dateFormatted = row.dateKey;
        const descEscaped = `"${descText.replace(/"/g, '""')}"`;
        const debtStr = row.debtAmount > 0 ? row.debtAmount : '';
        const paymentStr = row.paymentAmount > 0 ? row.paymentAmount : '';

        csvContent += `${dateFormatted},${descEscaped},${debtStr},${paymentStr}\r\n`;
      });

      // Phần tổng kết báo cáo
      csvContent += '\r\n';
      csvContent += `Tổng tiền nợ,,,,${totalDebtInMonth}\r\n`;
      csvContent += `Tổng tiền đã thanh toán,,,,${totalPaymentInMonth}\r\n`;
      csvContent += `Tiền nợ còn lại,,,,${Math.max(0, totalDebtInMonth - totalPaymentInMonth)}\r\n`;

      // Tải tệp tin về trình duyệt
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeName = customer?.name?.replace(/\s+/g, '_') || 'Khach';
      const safeMonth = selectedMonth.replace('/', '-');
      link.download = `CongNo_${safeName}_Thang_${safeMonth}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => URL.revokeObjectURL(url), 200);
    } catch (err) {
      console.error('[EXPORT EXCEL ERROR]', err);
      alert('Đã xảy ra lỗi khi xuất file Excel.');
    }
  };

  // Chuyển đổi chuỗi base64 thành Blob để hỗ trợ tải ảnh trên trình duyệt di động (Android/Samsung)
  const base64ToBlob = (base64Data, contentType = 'image/png') => {
    const sliceSize = 512;
    const byteCharacters = atob(base64Data.split(',')[1]);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, { type: contentType });
  };

  // Thực hiện tải ảnh về máy
  const executeDownloadImage = async () => {
    if (Platform.OS === 'web' && imageUri) {
      const safeName = customer?.name?.replace(/\s+/g, '_') || 'Khach';
      const safeMonth = selectedMonth.replace('/', '-');
      const fileName = `CongNo_${safeName}_Thang_${safeMonth}.png`;

      try {
        const blob = base64ToBlob(imageUri, 'image/png');
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Giải phóng bộ nhớ Object URL sau khi hoàn tất
        setTimeout(() => URL.revokeObjectURL(blobUrl), 200);
      } catch (err) {
        console.error('Lỗi khi tải ảnh:', err);
      }
    }
  };

  // 4. Tải ảnh công nợ về máy
  const handleDownloadImage = async () => {
    executeDownloadImage();
  };

  return (
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)}>
        <View style={styles.modalView}>
          <Text style={styles.modalTitle}>📊 XUẤT ẢNH CÔNG NỢ CHI TIẾT</Text>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Đang tải lịch sử công nợ...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
              <TouchableOpacity
                style={[styles.button, styles.retryButton]}
                onPress={() => fetchData(customer?.id, customer)}
              >
                <Text style={styles.retryButtonText}>TẢI LẠI DỮ LIỆU</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <View style={styles.customerBox}>
                <Text style={styles.customerText}>
                  Khách hàng: <Text style={styles.boldText}>{customer?.name}</Text>
                </Text>
                <Text style={styles.customerText}>
                  Số điện thoại: <Text style={styles.boldText}>{customer?.phone || 'Chưa ghi nhận'}</Text>
                </Text>
              </View>

              <Text style={styles.sectionLabel}>Chọn tháng cần xuất công nợ:</Text>

              {availableMonths.length === 0 ? (
                <Text style={styles.noMonthsText}>
                  Khách hàng này chưa phát sinh giao dịch nào để xuất công nợ.
                </Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.monthScroll}
                  contentContainerStyle={styles.monthScrollContent}
                >
                  {availableMonths.map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.monthItem, selectedMonth === m && styles.activeMonthItem]}
                      onPress={() => {
                        setSelectedMonth(m);
                        // Kích hoạt vẽ lại ảnh tức thì khi đổi tháng
                        generateDebtImage(m, transactions, payments, customer);
                      }}
                    >
                      <Text style={[styles.monthItemText, selectedMonth === m && styles.activeMonthItemText]}>
                        Tháng {m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* TRẠNG THÁI ĐANG VẼ ẢNH */}
              {generating && (
                <View style={styles.generatingBox}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.generatingText}>Đang vẽ ảnh công nợ...</Text>
                </View>
              )}

              {/* PHẦN HIỂN THỊ KHI SỐ LƯỢNG DÒNG QUÁ LỚN (> 100) */}
              {!generating && availableMonths.length > 0 && rows.length > 100 && (
                <View style={styles.excelExportBox}>
                  <Text style={styles.excelWarningText}>
                    ⚠️ Số lượng giao dịch trong tháng quá lớn ({rows.length} ngày có giao dịch). Vui lòng xuất báo cáo dưới dạng tệp Excel để dễ dàng đối chiếu.
                  </Text>
                  <TouchableOpacity
                    style={styles.excelExportButton}
                    onPress={handleExportExcel}
                  >
                    <Text style={styles.excelExportButtonText}>
                      📊 XUẤT FILE EXCEL CÔNG NỢ
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* PHẦN HIỂN THỊ XEM TRƯỚC VÀ NÚT TẢI */}
              {imageUri && !generating && rows.length <= 100 && (
                <View style={styles.previewBox}>
                  <View style={styles.previewHeaderRow}>
                    <Text style={styles.sectionLabelInline}>Bảng ảnh xem trước:</Text>
                    <TouchableOpacity
                      style={[
                        styles.downloadButtonInline,
                        styles.normalActiveColor
                      ]}
                      onPress={handleDownloadImage}
                    >
                      <Text style={styles.downloadButtonInlineText}>
                        💾 TẢI ẢNH VỀ MÁY
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.imageShadowFrame}>
                    <Image
                      source={{ uri: imageUri }}
                      style={styles.previewImage}
                      resizeMode="contain"
                    />
                  </View>

                  {Platform.OS === 'web' ? (
                    <Text style={styles.helperText}>
                      💡 Mẹo trên điện thoại: Bạn có thể nhấn giữ lâu vào ảnh trên và chọn "Lưu hình ảnh" để lưu trực tiếp vào Thư viện ảnh (Gallery) của máy.
                    </Text>
                  ) : (
                    <Text style={styles.helperText}>
                      💡 Mẹo: Nhấn giữ vào ảnh trên để lưu vào Thư viện ảnh của thiết bị.
                    </Text>
                  )}
                </View>
              )}
            </ScrollView>
          )}

          {/* Nút đóng chân Modal */}
          <TouchableOpacity
            style={[styles.button, styles.closeButton]}
            onPress={() => setVisible(false)}
            disabled={generating}
          >
            <Text style={styles.closeButtonText}>ĐÓNG LẠI</Text>
          </TouchableOpacity>
        </View>
      </SmoothModal>
    </>
  );
});

export default ExportDebtModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 15,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  errorContainer: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.dangerDark,
    backgroundColor: COLORS.dangerLight,
    padding: 12,
    borderRadius: 8,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 15,
    width: '100%',
  },
  scrollContent: {
    marginBottom: 15,
  },
  customerBox: {
    backgroundColor: COLORS.inputBg,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  customerText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  boldText: {
    fontWeight: 'bold',
    color: COLORS.text,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 10,
  },
  noMonthsText: {
    fontSize: 14,
    color: COLORS.textLight,
    fontStyle: 'italic',
    marginBottom: 16,
  },
  monthScroll: {
    marginBottom: 16,
    flexDirection: 'row',
  },
  monthScrollContent: {
    gap: 8,
    paddingRight: 10,
  },
  monthItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  activeMonthItem: {
    borderColor: COLORS.primary,
    backgroundColor: '#ECFDF5',
  },
  monthItemText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  activeMonthItemText: {
    color: COLORS.primaryDark,
    fontWeight: 'bold',
  },
  generatingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  generatingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  actionButton: {
    backgroundColor: COLORS.primary,
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  previewBox: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 16,
  },
  // Khung tiêu đề hiển thị song song nhãn và nút tải
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionLabelInline: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  // Nút tải ảnh dạng inline nằm góc phải
  downloadButtonInline: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
  downloadButtonInlineText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  // Nền màu xanh Zalo khi khách hàng có SĐT
  zaloActiveColor: {
    backgroundColor: '#0068FF',
    shadowColor: '#0068FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  // Nền màu xanh lá thông thường khi khách hàng không có SĐT
  normalActiveColor: {
    backgroundColor: COLORS.primaryDark,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  imageShadowFrame: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    ...SHADOWS.card,
  },
  previewImage: {
    width: '100%',
    height: 380,
  },
  noImagePlaceholder: {
    height: 150,
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  placeholderText: {
    color: COLORS.textLight,
    fontSize: 14,
  },
  downloadButton: {
    backgroundColor: COLORS.primaryDark,
    shadowColor: COLORS.primaryDark,
  },
  helperText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 18,
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  button: {
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    height: 40,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  closeButton: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  closeButtonText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: 'bold',
  },
  excelExportBox: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F0FDF4', // xanh lá nhạt pastel
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    alignItems: 'center',
    marginBottom: 16,
  },
  excelWarningText: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 15,
    lineHeight: 20,
  },
  excelExportButton: {
    backgroundColor: '#10B981', // Xanh lá
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  excelExportButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
