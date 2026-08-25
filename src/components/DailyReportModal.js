// meat-management-fe/src/components/DailyReportModal.js
import React, { useState, forwardRef, useImperativeHandle, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  TextInput,
} from 'react-native';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import SmoothModal from './SmoothModal';
import DatePickerInput from './DatePickerInput';
import { matchSearch } from '../utils/searchHelper';

const DailyReportModal = forwardRef(({ onRefresh, onExportDebt }, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(''); // Định dạng DD/MM/YYYY
  const [selectedMonth, setSelectedMonth] = useState(''); // Định dạng MM/YYYY
  const [activeReportTab, setActiveReportTab] = useState('day'); // 'day' hoặc 'month'
  const [rawTransactions, setRawTransactions] = useState([]);
  const [rawPayments, setRawPayments] = useState([]);
  const [error, setError] = useState('');
  // Bộ lọc loại giao dịch đang chọn: 'all' (tất cả), 'debt' (nợ phát sinh), 'payment' (tiền đã thu)
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchText, setSearchText] = useState('');

  // 1. Phơi bày hàm open/close ra bên ngoài
  useImperativeHandle(ref, () => ({
    open: () => {
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yyyy = today.getFullYear();
      const todayStr = `${dd}/${mm}/${yyyy}`;
      const thisMonthStr = `${mm}/${yyyy}`;
      
      setSelectedDate(todayStr);
      setSelectedMonth(thisMonthStr);
      setActiveReportTab('day');
      setVisible(true);
      setError('');
      // Reset bộ lọc và thanh tìm kiếm khi mở modal
      setActiveFilter('all');
      setSearchText('');
      fetchReportData();
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Định dạng hiển thị tiền VNĐ
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount).replace('₫', 'đ');
  };

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

  // Helper kiểm tra xem ngày có thuộc tháng mục tiêu không
  const isDateInMonth = (dateStr, targetMonthYear) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${yyyy}` === targetMonthYear;
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

  // Helper xác định tháng mục tiêu của khoản thanh toán dựa trên ghi chú
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
    return `${mm}/${yyyy}`;
  };

  // 2. Tải toàn bộ giao dịch & thu tiền từ API
  const fetchReportData = async () => {
    setLoading(true);
    setError('');
    try {
      // Gọi API lấy toàn bộ giao dịch và thanh toán của chủ buôn
      const [transRes, payRes] = await Promise.all([
        api.get('/transactions'),
        api.get('/payments')
      ]);

      setRawTransactions(transRes.data?.data || []);
      setRawPayments(payRes.data?.data || []);
    } catch (err) {
      console.error('[DAILY REPORT FETCH ERROR]', err);
      setError('Không thể tải dữ liệu thống kê.');
    } finally {
      setLoading(false);
    }
  };

  // Xử lý khi người dùng đổi ngày trên DatePicker
  const handleDateChange = (newDateStr) => {
    setSelectedDate(newDateStr);
    fetchReportData();
  };

  // Các hàm xử lý đổi tháng cho bộ chọn tháng
  const handlePrevMonth = () => {
    const [m, y] = selectedMonth.split('/').map(Number);
    let prevM = m - 1;
    let prevY = y;
    if (prevM === 0) {
      prevM = 12;
      prevY = y - 1;
    }
    setSelectedMonth(`${String(prevM).padStart(2, '0')}/${prevY}`);
    fetchReportData();
  };

  const handleNextMonth = () => {
    const [m, y] = selectedMonth.split('/').map(Number);
    let nextM = m + 1;
    let nextY = y;
    if (nextM === 13) {
      nextM = 1;
      nextY = y + 1;
    }
    setSelectedMonth(`${String(nextM).padStart(2, '0')}/${nextY}`);
    fetchReportData();
  };

  // Lọc danh sách giao dịch và thanh toán theo tab hiện tại
  const currentTransactions = useMemo(() => {
    if (activeReportTab === 'day') {
      return rawTransactions.filter(t => toDateKey(t.date) === selectedDate);
    } else {
      return rawTransactions.filter(t => isDateInMonth(t.date, selectedMonth));
    }
  }, [rawTransactions, activeReportTab, selectedDate, selectedMonth]);

  const currentPayments = useMemo(() => {
    if (activeReportTab === 'day') {
      return rawPayments.filter(p => toDateKey(p.paidAt) === selectedDate);
    } else {
      return rawPayments.filter(p => isDateInMonth(p.paidAt, selectedMonth));
    }
  }, [rawPayments, activeReportTab, selectedDate, selectedMonth]);

  // Tính tổng nợ phát sinh và tổng đã thu trong khoảng thời gian được chọn
  const totalDebtCreated = useMemo(() => {
    return currentTransactions.reduce((sum, t) => sum + parseFloat(t.totalAmount || 0), 0);
  }, [currentTransactions]);

  const totalPaymentReceived = useMemo(() => {
    return currentPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  }, [currentPayments]);

  // Gộp chung giao dịch và thanh toán thành một dòng thời gian hiển thị (tiền đã thu lên đầu, sau đó đến nợ phát sinh)
  const timelineItems = useMemo(() => {
    return [
      ...currentPayments.map(p => ({
        id: p.id,
        type: 'payment',
        time: p.paidAt,
        customerName: p.customer?.name || 'Khách ẩn danh',
        amount: parseFloat(p.amount || 0),
        note: p.note,
        details: formatPaymentNote(p.note, p.paidAt)
      })),
      ...currentTransactions.map(t => ({
        id: t.id,
        type: 'debt',
        time: t.date,
        customerName: t.customer?.name || 'Khách ẩn danh',
        amount: parseFloat(t.totalAmount || 0),
        note: t.note,
        details: t.items?.map(item => {
          const qty = parseFloat(item.quantity);
          const name = item.product?.name || 'Thịt';
          // Nếu là ghi nợ nhanh (sản phẩm là Tiền hàng hoặc bắt đầu bằng Tiền), không hiển thị số lượng và đơn vị
          const isQuick = name === 'Tiền hàng' || name.toLowerCase().startsWith('tiền') || t.note === 'Ghi nợ nhanh';
          if (isQuick) {
            return name;
          }
          return `${qty}${item.product?.unit || 'kg'} ${name}`;
        }).join(', ')
      }))
    ].sort((a, b) => {
      // Sắp xếp tiền đã thu (payment) lên đầu, nợ phát sinh (debt) ở sau
      if (a.type === 'payment' && b.type === 'debt') return -1;
      if (a.type === 'debt' && b.type === 'payment') return 1;
      // Cùng loại thì xếp theo thời gian mới nhất lên đầu
      return new Date(b.time) - new Date(a.time);
    });
  }, [currentTransactions, currentPayments]);

  // Nhóm nợ theo khách hàng và lọc khách còn nợ trong tháng được chọn
  const customerMonthlyDebts = useMemo(() => {
    if (activeReportTab !== 'month') return [];

    // 1. Phân loại transactions và payments theo từng khách hàng
    const customerTransactionsMap = {};
    const customerPaymentsList = {};

    rawTransactions.forEach(t => {
      const cId = t.customerId;
      if (!cId) return;
      if (!customerTransactionsMap[cId]) {
        customerTransactionsMap[cId] = [];
      }
      customerTransactionsMap[cId].push({
        id: t.id,
        customerId: cId,
        date: t.date,
        totalAmount: parseFloat(t.totalAmount || 0),
        paidAmount: 0,
      });
    });

    rawPayments.forEach(p => {
      const cId = p.customerId;
      if (!cId) return;
      if (!customerPaymentsList[cId]) {
        customerPaymentsList[cId] = [];
      }
      customerPaymentsList[cId].push({
        id: p.id,
        customerId: cId,
        paidAt: p.paidAt,
        amount: parseFloat(p.amount || 0),
        note: p.note,
        targetMonth: getPaymentTargetMonth(p),
      });
    });

    // 2. Chạy thuật toán cấn trừ nợ cho từng khách hàng
    const allCustomerIds = new Set([
      ...Object.keys(customerTransactionsMap),
      ...Object.keys(customerPaymentsList)
    ]);

    const allocatedTransactions = {};

    allCustomerIds.forEach(cId => {
      const txs = customerTransactionsMap[cId] || [];
      const payments = customerPaymentsList[cId] || [];

      // Sắp xếp transactions theo ngày tăng dần để cấn trừ FIFO cho các đơn cũ trước
      txs.sort((a, b) => new Date(a.date) - new Date(b.date));
      // Sắp xếp payments theo ngày tăng dần
      payments.sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt));

      // Bước A: Cấn trừ các payments có ghi chú chỉ định cụ thể tháng
      payments.forEach(p => {
        if (!p.targetMonth) return;

        let remainingPayment = p.amount;

        txs.forEach(t => {
          if (remainingPayment <= 0) return;

          const tDate = new Date(t.date);
          const tMonth = (tDate.getMonth() + 1).toString().padStart(2, '0');
          const tYear = tDate.getFullYear();
          const tMonthYearStr = `${tMonth}/${tYear}`;

          if (tMonthYearStr === p.targetMonth) {
            const needed = t.totalAmount - t.paidAmount;
            if (needed > 0) {
              const allocated = Math.min(needed, remainingPayment);
              t.paidAmount += allocated;
              remainingPayment -= allocated;
            }
          }
        });

        p.remainingAmount = remainingPayment;
      });

      // Bước B: Cấn trừ FIFO cho các payments tự do HOẶC phần dư thừa từ bước A
      payments.forEach(p => {
        let remainingPayment = p.targetMonth ? (p.remainingAmount || 0) : p.amount;
        if (remainingPayment <= 0) return;

        txs.forEach(t => {
          if (remainingPayment <= 0) return;

          const needed = t.totalAmount - t.paidAmount;
          if (needed > 0) {
            const allocated = Math.min(needed, remainingPayment);
            t.paidAmount += allocated;
            remainingPayment -= allocated;
          }
        });
      });

      allocatedTransactions[cId] = txs;
    });

    // 3. Gom nhóm theo tháng được chọn
    const [selM, selY] = selectedMonth.split('/').map(Number);
    const targetMonthStr = `${String(selM).padStart(2, '0')}/${selY}`;

    const customerMap = {};

    Object.keys(allocatedTransactions).forEach(cId => {
      const txs = allocatedTransactions[cId];
      
      txs.forEach(t => {
        const tDate = new Date(t.date);
        const tMonth = (tDate.getMonth() + 1).toString().padStart(2, '0');
        const tYear = tDate.getFullYear();
        const tMonthYearStr = `${tMonth}/${tYear}`;

        if (tMonthYearStr === targetMonthStr) {
          if (!customerMap[cId]) {
            const firstTx = rawTransactions.find(rt => rt.customerId === cId);
            const customerName = firstTx?.customer?.name || 'Khách ẩn danh';

            customerMap[cId] = {
              customerId: cId,
              customerName,
              totalDebt: 0,
              totalPaid: 0,
            };
          }

          customerMap[cId].totalDebt += t.totalAmount;
          customerMap[cId].totalPaid += t.paidAmount;
        }
      });
    });

    // 4. Chuyển sang mảng kết quả, lọc và sắp xếp theo số nợ còn lại trong tháng
    return Object.values(customerMap)
      .map(c => {
        const txs = allocatedTransactions[c.customerId] || [];
        const currentGlobalRemaining = txs.reduce((sum, t) => sum + (t.totalAmount - t.paidAmount), 0);

        return {
          ...c,
          remainingDebt: currentGlobalRemaining, // Tổng nợ tích lũy toàn thời gian thực tế hiện tại
          remainingInMonth: c.totalDebt - c.totalPaid, // Số nợ chưa trả của riêng tháng được chọn
        };
      })
      // Lọc: Chỉ hiển thị khách hàng có số nợ chưa trả của tháng được chọn > 0
      .filter(c => c.remainingInMonth > 0)
      .sort((a, b) => b.remainingInMonth - a.remainingInMonth); // Sắp xếp nợ tháng này nhiều nhất lên đầu
  }, [rawTransactions, rawPayments, activeReportTab, selectedMonth]);

  // Lọc danh sách giao dịch hiển thị dựa trên bộ lọc đang chọn và từ khóa tìm kiếm
  const displayItems = useMemo(() => {
    if (activeReportTab === 'day') {
      return timelineItems.filter(item => {
        // 1. Lọc theo tab/loại giao dịch
        if (activeFilter === 'debt' && item.type !== 'debt') return false;
        if (activeFilter === 'payment' && item.type !== 'payment') return false;
        
        // 2. Lọc theo từ khóa tìm kiếm (tên khách hàng, loại thịt hoặc số tiền - hỗ trợ không dấu, viết tắt, nhiều từ)
        if (searchText && searchText.trim()) {
          const nameMatch = matchSearch(item.customerName || '', searchText);
          const detailMatch = matchSearch(item.details || '', searchText);
          const amountMatch = (item.amount || 0).toString().includes(searchText.trim());
          
          return nameMatch || detailMatch || amountMatch;
        }
        
        return true;
      });
    } else {
      // Tab Theo tháng: Lọc danh sách khách còn nợ theo từ khóa tìm kiếm
      return customerMonthlyDebts.filter(item => {
        if (searchText && searchText.trim()) {
          const nameMatch = matchSearch(item.customerName || '', searchText);
          const amountMatch = item.remainingInMonth.toString().includes(searchText.trim());
          return nameMatch || amountMatch;
        }
        return true;
      });
    }
  }, [timelineItems, customerMonthlyDebts, activeReportTab, activeFilter, searchText]);

  // Xử lý xuất công nợ dạng ảnh bằng Canvas HTML5 (Cứ 15 giao dịch chia làm 1 cột, tự động tăng chiều rộng)
  const handleExportImage = () => {
    if (Platform.OS !== 'web') {
      alert('Chức năng xuất ảnh hiện hỗ trợ trên giao diện Web.');
      return;
    }

    try {
      // 1. Chuẩn bị canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      const itemsPerCol = 15;
      const numCols = Math.max(1, Math.ceil(displayItems.length / itemsPerCol));
      const colWidth = 500;
      
      // Chiều rộng cơ sở: tối thiểu 1000px để hiển thị đẹp mắt 2 hộp tổng kết ở header
      const width = Math.max(1000, numCols * colWidth);
      const rowHeight = 60;
      const headerHeight = 260;
      const footerHeight = 80;
      const numRows = Math.min(itemsPerCol, displayItems.length);
      const listHeight = displayItems.length === 0 ? 100 : numRows * rowHeight;
      const height = headerHeight + listHeight + footerHeight;
      
      // Tỉ lệ scale ảnh lên 1.3
      const scale = 1.3;
      canvas.width = width * scale;
      canvas.height = height * scale;

      // Áp dụng tỉ lệ scale cho context vẽ để phóng to tất cả các thành phần tương ứng
      ctx.scale(scale, scale);

      // Nền trắng toàn ảnh
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      // Viền khung ngoài cùng
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, width - 20, height - 20);

      // 2. Vẽ Header nền xanh nhạt sang trọng
      ctx.fillStyle = '#ECFDF5';
      ctx.fillRect(12, 12, width - 24, 130);
      
      // Viền phân cách dưới header
      ctx.strokeStyle = '#A7F3D0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(12, 142);
      ctx.lineTo(width - 12, 142);
      ctx.stroke();

      // Tiêu đề và ngày/tháng báo cáo tùy theo tab đang chọn
      const reportTitle = activeReportTab === 'day' ? 'BÁO CÁO CÔNG NỢ TRONG NGÀY' : 'BÁO CÁO CÔNG NỢ THEO THÁNG';
      const reportSubTitle = activeReportTab === 'day' ? `Ngày thống kê: ${selectedDate}` : `Tháng thống kê: Tháng ${selectedMonth}`;
      const reportFilename = activeReportTab === 'day' 
        ? `CongNo_Ngay_${selectedDate.replace(/\//g, '_')}` 
        : `CongNo_Thang_${selectedMonth.replace(/\//g, '_')}`;

      ctx.fillStyle = '#065F46';
      ctx.font = 'bold 22px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(reportTitle, width / 2, 55);

      // Ngày/tháng báo cáo
      ctx.fillStyle = '#047857';
      ctx.font = 'bold 16px Arial, sans-serif';
      ctx.fillText(reportSubTitle, width / 2, 90);

      // Lời chào/Thời gian xuất
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} - ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
      ctx.fillStyle = '#64748B';
      ctx.font = 'italic 12px Arial, sans-serif';
      ctx.fillText(`Thời gian xuất: ${timeStr}`, width / 2, 120);

      // 3. Vẽ hộp Tổng kết (Nợ phát sinh & Tiền đã thu) - Tự động tính toán theo chiều rộng canvas
      const boxY = 165;
      const boxPadding = 25;
      const boxWidth = (width - boxPadding * 3) / 2;
      const boxHeight = 70;
      
      // Hộp Nợ phát sinh (bên trái)
      ctx.fillStyle = '#FEF2F2';
      ctx.fillRect(boxPadding, boxY, boxWidth, boxHeight);
      ctx.strokeStyle = '#FECACA';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(boxPadding, boxY, boxWidth, boxHeight);
      
      ctx.fillStyle = '#991B1B';
      ctx.font = 'bold 12px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(activeReportTab === 'day' ? '🔴 Nợ phát sinh trong ngày' : '🔴 Nợ phát sinh trong tháng', boxPadding + 15, boxY + 25);
      ctx.font = 'bold 18px Arial, sans-serif';
      ctx.fillText(formatCurrency(totalDebtCreated), boxPadding + 15, boxY + 52);

      // Hộp Tiền đã thu (bên phải)
      const rightBoxX = boxPadding * 2 + boxWidth;
      ctx.fillStyle = '#F0FDF4';
      ctx.fillRect(rightBoxX, boxY, boxWidth, boxHeight);
      ctx.strokeStyle = '#BBF7D0';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rightBoxX, boxY, boxWidth, boxHeight);
      
      ctx.fillStyle = '#166534';
      ctx.font = 'bold 12px Arial, sans-serif';
      ctx.fillText(activeReportTab === 'day' ? '🟢 Tiền đã thu trong ngày' : '🟢 Tiền đã thu trong tháng', rightBoxX + 15, boxY + 25);
      ctx.font = 'bold 18px Arial, sans-serif';
      ctx.fillText(formatCurrency(totalPaymentReceived), rightBoxX + 15, boxY + 52);

      // 4. Vẽ danh sách chi tiết (Chia nhiều cột động)
      let currentY = boxY + boxHeight + 45;
      
      ctx.fillStyle = '#1E293B';
      ctx.font = 'bold 15px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Chi tiết giao dịch (${displayItems.length}):`, 25, currentY - 10);

      if (displayItems.length === 0) {
        ctx.fillStyle = '#64748B';
        ctx.font = 'italic 14px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(activeReportTab === 'day' ? 'Không có giao dịch công nợ phát sinh trong ngày.' : 'Không có giao dịch công nợ phát sinh trong tháng.', width / 2, currentY + 45);
      } else {
        // Vẽ các đường kẻ ngang phân tách các hàng
        for (let r = 0; r <= numRows; r++) {
          const lineY = currentY + r * rowHeight;
          ctx.strokeStyle = '#F1F5F9';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(25, lineY);
          ctx.lineTo(width - 25, lineY);
          ctx.stroke();
        }

        // Vẽ đường kẻ dọc chia tách các cột
        ctx.strokeStyle = '#F1F5F9';
        ctx.lineWidth = 1;
        const actualColWidth = (width - 50) / numCols;
        for (let c = 1; c < numCols; c++) {
          const lineX = 25 + c * actualColWidth;
          ctx.beginPath();
          ctx.moveTo(lineX, currentY);
          ctx.lineTo(lineX, currentY + numRows * rowHeight);
          ctx.stroke();
        }

        displayItems.forEach((item, index) => {
          const colIndex = Math.floor(index / itemsPerCol);
          const rowIndex = index % itemsPerCol;
          
          const textLeftX = 25 + colIndex * actualColWidth + 10;
          const textRightX = 25 + (colIndex + 1) * actualColWidth - 10;
          
          const itemY = currentY + rowIndex * rowHeight;

          // Tên khách hàng (căn trái)
          ctx.fillStyle = '#1E293B';
          ctx.font = 'bold 14px Arial, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(item.customerName, textLeftX, itemY + 24);

          if (activeReportTab === 'day') {
            const isDebt = item.type === 'debt';
            // Chi tiết (mặt hàng/ghi chú)
            ctx.fillStyle = '#64748B';
            ctx.font = '12px Arial, sans-serif';
            ctx.fillText(isDebt ? `🥩 ${item.details}` : `💵 ${item.details}`, textLeftX, itemY + 45);

            // Số tiền (căn phải)
            ctx.fillStyle = isDebt ? '#DC2626' : '#16A34A';
            ctx.font = 'bold 14px Arial, sans-serif';
            ctx.textAlign = 'right';
            const amtStr = `${isDebt ? '+' : '-'}${formatCurrency(item.amount)}`;
            ctx.fillText(amtStr, textRightX, itemY + 34);
          } else {
            // Chi tiết tổng nợ / đã trả theo tháng
            ctx.fillStyle = '#64748B';
            ctx.font = '12px Arial, sans-serif';
            ctx.fillText(`Tổng nợ: ${formatCurrency(item.totalDebt)}  |  Đã trả: ${formatCurrency(item.totalPaid)}`, textLeftX, itemY + 45);

            // Số tiền nợ còn lại (căn phải, hiển thị màu đỏ)
            ctx.fillStyle = '#DC2626';
            ctx.font = 'bold 14px Arial, sans-serif';
            ctx.textAlign = 'right';
            const amtStr = `Còn nợ: ${formatCurrency(item.remainingInMonth)}`;
            ctx.fillText(amtStr, textRightX, itemY + 34);
          }
        });
      }

      // 5. Vẽ Footer
      const footerY = height - 55;
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(25, footerY - 10);
      ctx.lineTo(width - 25, footerY - 10);
      ctx.stroke();

      ctx.fillStyle = '#94A3B8';
      ctx.font = '11px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Hệ thống Quản lý Giao dịch & Công nợ Sạp thịt', width / 2, footerY + 15);
      ctx.fillText('Cảm ơn bạn đã tin dùng dịch vụ!', width / 2, footerY + 32);

      // 6. Thực hiện download ảnh
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `${reportFilename}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('[EXPORT IMAGE ERROR]', err);
      alert('Đã xảy ra lỗi khi xuất ảnh công nợ.');
    }
  };

  // Xử lý xuất báo cáo công nợ ra file Excel dạng CSV hỗ trợ tiếng Việt có dấu
  const handleExportExcel = () => {
    if (Platform.OS !== 'web') {
      alert('Chức năng xuất Excel hiện hỗ trợ trên giao diện Web.');
      return;
    }

    try {
      // Sử dụng byte order mark (BOM) UTF-8 để Excel hiển thị đúng dấu tiếng Việt
      let csvContent = '\uFEFF';
      
      const csvReportTitle = activeReportTab === 'day' ? 'BÁO CÁO CÔNG NỢ TRONG NGÀY' : 'BÁO CÁO CÔNG NỢ THEO THÁNG';
      const csvReportSubTitle = activeReportTab === 'day' ? `Ngày thống kê: ${selectedDate}` : `Tháng thống kê: Tháng ${selectedMonth}`;
      const csvDebtSummaryLabel = activeReportTab === 'day' ? 'Tổng nợ phát sinh trong ngày' : 'Tổng nợ phát sinh trong tháng';
      const csvPaymentSummaryLabel = activeReportTab === 'day' ? 'Tổng tiền đã thu trong ngày' : 'Tổng tiền đã thu trong tháng';
      const csvDiffLabel = activeReportTab === 'day' ? 'Chênh lệch nợ ròng' : 'Chênh lệch nợ ròng trong tháng';
      const csvFilename = activeReportTab === 'day' 
        ? `BaoCao_CongNo_Ngay_${selectedDate.replace(/\//g, '_')}.csv` 
        : `BaoCao_CongNo_Thang_${selectedMonth.replace(/\//g, '_')}.csv`;

      // Tiêu đề báo cáo
      csvContent += `${csvReportTitle}\r\n`;
      csvContent += `${csvReportSubTitle}\r\n`;
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} - ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
      csvContent += `Thời gian xuất: ${timeStr}\r\n\r\n`;
      
      if (activeReportTab === 'day') {
        // Tiêu đề cột cho ngày
        csvContent += 'Thời gian,Khách hàng,Loại giao dịch,Chi tiết giao dịch,Số tiền (đ)\r\n';
        
        // Duyệt qua danh sách để điền thông tin chi tiết
        displayItems.forEach(item => {
          const isDebt = item.type === 'debt';
          const typeStr = isDebt ? 'Nợ phát sinh' : 'Tiền đã thu';
          
          const tDate = new Date(item.time);
          const hour = String(tDate.getHours()).padStart(2, '0');
          const minute = String(tDate.getMinutes()).padStart(2, '0');
          const timeFormatted = `${hour}:${minute}`;
          
          const customerNameEscaped = `"${(item.customerName || '').replace(/"/g, '""')}"`;
          const detailsEscaped = `"${(item.details || '').replace(/"/g, '""')}"`;
          const amountVal = isDebt ? item.amount : -item.amount;
          
          csvContent += `${timeFormatted},${customerNameEscaped},${typeStr},${detailsEscaped},${amountVal}\r\n`;
        });
      } else {
        // Tiêu đề cột cho tháng (thống kê khách còn nợ)
        csvContent += 'Khách hàng,Tổng nợ phát sinh trong tháng (đ),Đã trả trong tháng (đ),Số nợ còn lại (đ)\r\n';
        
        displayItems.forEach(item => {
          const customerNameEscaped = `"${(item.customerName || '').replace(/"/g, '""')}"`;
          csvContent += `${customerNameEscaped},${item.totalDebt},${item.totalPaid},${item.remainingInMonth}\r\n`;
        });
      }
      
      // Phần tổng kết báo cáo
      csvContent += '\r\n';
      csvContent += `${csvDebtSummaryLabel},,,,,${totalDebtCreated}\r\n`;
      csvContent += `${csvPaymentSummaryLabel},,,,,${totalPaymentReceived}\r\n`;
      csvContent += `${csvDiffLabel},,,,,${totalDebtCreated - totalPaymentReceived}\r\n`;
      
      // Tải tệp tin về trình duyệt
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = csvFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setTimeout(() => URL.revokeObjectURL(url), 200);
    } catch (err) {
      console.error('[EXPORT EXCEL ERROR]', err);
      alert('Đã xảy ra lỗi khi xuất file Excel.');
    }
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        <View style={styles.dragBar} />
        <Text style={styles.modalTitle}>
          {activeReportTab === 'day' ? '📊 THỐNG KÊ CÔNG NỢ TRONG NGÀY' : '📊 THỐNG KÊ CÔNG NỢ THEO THÁNG'}
        </Text>

        {/* Thanh chọn tab thống kê */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeReportTab === 'day' && styles.tabButtonActive]}
            onPress={() => {
              setActiveReportTab('day');
              setError('');
              setSearchText('');
            }}
          >
            <Text style={[styles.tabButtonText, activeReportTab === 'day' && styles.tabButtonTextActive]}>
              📅 Theo ngày
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeReportTab === 'month' && styles.tabButtonActive]}
            onPress={() => {
              setActiveReportTab('month');
              setError('');
              setSearchText('');
            }}
          >
            <Text style={[styles.tabButtonText, activeReportTab === 'month' && styles.tabButtonTextActive]}>
              📅 Theo tháng
            </Text>
          </TouchableOpacity>
        </View>

        {/* Bộ chọn thời gian (Ngày hoặc Tháng) */}
        {activeReportTab === 'day' ? (
          <View style={styles.datePickerContainer}>
            <Text style={styles.sectionLabel}>Chọn ngày xem thống kê:</Text>
            <DatePickerInput
              value={selectedDate}
              onChange={handleDateChange}
              allowFuture={true}
            />
          </View>
        ) : (
          <View style={styles.datePickerContainer}>
            <Text style={styles.sectionLabel}>Chọn tháng xem thống kê:</Text>
            <View style={styles.monthSelectorRow}>
              <TouchableOpacity style={styles.monthSelectorArrow} onPress={handlePrevMonth}>
                <Text style={styles.monthSelectorArrowText}>◀</Text>
              </TouchableOpacity>
              <View style={styles.monthValueContainer}>
                <Text style={styles.monthValueText}>Tháng {selectedMonth}</Text>
              </View>
              <TouchableOpacity style={styles.monthSelectorArrow} onPress={handleNextMonth}>
                <Text style={styles.monthSelectorArrowText}>▶</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Thanh tìm kiếm nhanh dạng text */}
        {!loading && !error && (
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="🔍 Tìm theo tên khách, loại thịt hoặc số tiền..."
              placeholderTextColor={COLORS.textLight}
              value={searchText}
              onChangeText={setSearchText}
            />
            {searchText ? (
              <TouchableOpacity style={styles.clearSearch} onPress={() => setSearchText('')}>
                <Text style={styles.clearSearchText}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Đang tổng hợp dữ liệu...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
            <TouchableOpacity
              style={[styles.button, styles.retryButton]}
              onPress={() => fetchReportData()}
            >
              <Text style={styles.retryButtonText}>TẢI LẠI DỮ LIỆU</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.mainContent}>
            {/* Hộp tổng kết nhanh */}
            <View style={styles.summaryContainer}>
              <TouchableOpacity
                style={[
                  styles.summaryBox,
                  styles.debtBox,
                  activeReportTab === 'day' && activeFilter === 'debt' && styles.activeDebtBox,
                  activeReportTab === 'day' && activeFilter === 'payment' && styles.inactiveBox
                ]}
                onPress={() => {
                  if (activeReportTab === 'day') {
                    setActiveFilter(prev => prev === 'debt' ? 'all' : 'debt');
                  }
                }}
                activeOpacity={activeReportTab === 'day' ? 0.7 : 1}
              >
                <Text style={styles.summaryBoxLabel}>{activeReportTab === 'day' ? '🔴 Nợ phát sinh' : '🔴 Tổng nợ trong tháng'}</Text>
                <Text style={styles.summaryBoxValue}>{formatCurrency(totalDebtCreated)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.summaryBox,
                  styles.paymentBox,
                  activeReportTab === 'day' && activeFilter === 'payment' && styles.activePaymentBox,
                  activeReportTab === 'day' && activeFilter === 'debt' && styles.inactiveBox
                ]}
                onPress={() => {
                  if (activeReportTab === 'day') {
                    setActiveFilter(prev => prev === 'payment' ? 'all' : 'payment');
                  }
                }}
                activeOpacity={activeReportTab === 'day' ? 0.7 : 1}
              >
                <Text style={styles.summaryBoxLabel}>{activeReportTab === 'day' ? '🟢 Tiền đã thu' : '🟢 Đã thu trong tháng'}</Text>
                <Text style={styles.summaryBoxValue}>{formatCurrency(totalPaymentReceived)}</Text>
              </TouchableOpacity>
            </View>

            {/* Tiêu đề danh sách chi tiết */}
            <Text style={styles.listTitle}>📝 Danh sách chi tiết ({displayItems.length}):</Text>

            {displayItems.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {activeReportTab === 'day' 
                    ? 'Không có giao dịch công nợ phát sinh trong ngày này.' 
                    : 'Không có giao dịch công nợ phát sinh trong tháng này.'}
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.scrollList}
                contentContainerStyle={styles.scrollListContent}
                showsVerticalScrollIndicator={false}
              >
                {displayItems.map((item) => {
                  if (activeReportTab === 'day') {
                    const isDebt = item.type === 'debt';
                    return (
                      <View
                        key={item.id}
                        style={[
                          styles.itemCard,
                          isDebt ? styles.itemCardDebt : styles.itemCardPayment
                        ]}
                      >
                        <View style={styles.itemHeader}>
                          <Text style={styles.customerName}>{item.customerName}</Text>
                          <Text style={[styles.itemAmount, isDebt ? styles.amountDebt : styles.amountPayment]}>
                            {isDebt ? '+' : '-'}{formatCurrency(item.amount)}
                          </Text>
                        </View>
                        
                        {item.details ? (
                          <Text style={styles.itemDetails} numberOfLines={2}>
                            {isDebt ? `🥩 ${item.details}` : `💵 ${item.details}`}
                          </Text>
                        ) : null}
                      </View>
                    );
                  } else {
                    // Render danh sách khách hàng còn nợ trong tab Theo tháng
                    return (
                      <View
                        key={item.customerId}
                        style={[
                          styles.itemCard,
                          styles.itemCardDebt // Mặc định dùng viền nợ màu đỏ
                        ]}
                      >
                        <View style={styles.itemHeader}>
                          <Text style={styles.customerName}>{item.customerName}</Text>
                          <Text style={[styles.itemAmount, styles.amountDebt]}>
                            Còn nợ: {formatCurrency(item.remainingInMonth)}
                          </Text>
                        </View>
                        
                        <Text style={styles.itemDetails}>
                          {`Tổng nợ: ${formatCurrency(item.totalDebt)}   |   Đã trả: ${formatCurrency(item.totalPaid)}`}
                        </Text>

                        {/* Nút hành động xuất nợ & gửi Zalo cho từng khách hàng */}
                        <View style={styles.cardActionsContainer}>
                          <TouchableOpacity
                            style={styles.zaloButton}
                            onPress={() => onExportDebt?.(item.customerId, selectedMonth)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.zaloButtonText}>📸 Xuất ảnh & Gửi Zalo 💬</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  }
                })}
              </ScrollView>
            )}
          </View>
        )}

        {/* Nhóm nút hành động dưới đáy */}
        <View style={styles.footerButtons}>
          <TouchableOpacity
            style={styles.closeButtonNew}
            onPress={() => setVisible(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.closeButtonTextNew}>ĐÓNG LẠI</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SmoothModal>
  );
});

export default DailyReportModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  dragBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 15,
  },
  datePickerContainer: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  loadingContainer: {
    paddingVertical: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  errorContainer: {
    paddingVertical: 40,
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
  mainContent: {
    flexDirection: 'column',
  },
  summaryContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  summaryBox: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'flex-start',
    ...SHADOWS.card,
  },
  debtBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  paymentBox: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  activeDebtBox: {
    borderColor: '#DC2626',
    borderWidth: 2,
  },
  activePaymentBox: {
    borderColor: '#16A34A',
    borderWidth: 2,
  },
  inactiveBox: {
    opacity: 0.5,
  },
  summaryBoxLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  summaryBoxValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 10,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  emptyText: {
    color: COLORS.textLight,
    fontStyle: 'italic',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  scrollList: {
    maxHeight: 320,
    marginBottom: 16,
  },
  itemCard: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    flexDirection: 'column',
    gap: 4,
  },
  itemCardDebt: {
    backgroundColor: COLORS.card,
    borderColor: '#FEE2E2',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.danger,
  },
  itemCardPayment: {
    backgroundColor: COLORS.card,
    borderColor: '#DCFCE7',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  itemAmount: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  amountDebt: {
    color: COLORS.dangerDark,
  },
  amountPayment: {
    color: COLORS.primaryDark,
  },
  itemDetails: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  itemTime: {
    fontSize: 10,
    color: COLORS.textLight,
    marginTop: 2,
  },
  button: {
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  footerButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  exportButton: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    backgroundColor: '#E0F2FE', // Màu xanh dương nhạt pastel
    borderColor: '#BAE6FD',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.card,
  },
  exportButtonText: {
    color: '#0369A1', // Xanh dương đậm
    fontSize: 13,
    fontWeight: 'bold',
  },
  excelButton: {
    backgroundColor: '#DCFCE7', // Màu xanh lá nhạt pastel
    borderColor: '#BBF7D0',
  },
  excelButtonText: {
    color: '#15803D', // Xanh lá đậm
  },
  closeButtonNew: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonTextNew: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  searchContainer: {
    marginBottom: 16,
    position: 'relative',
    justifyContent: 'center',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    height: 40,
    borderRadius: 10,
    paddingLeft: 12,
    paddingRight: 35,
    fontSize: 13,
    color: COLORS.text,
    borderWidth: 1.2,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  clearSearch: {
    position: 'absolute',
    right: 12,
    padding: 6,
  },
  clearSearchText: {
    fontSize: 16,
    color: COLORS.textLight,
    fontWeight: 'bold',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    ...SHADOWS.small,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabButtonTextActive: {
    color: COLORS.primaryDark,
    fontWeight: 'bold',
  },
  monthSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  monthSelectorArrow: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthSelectorArrowText: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: 'bold',
  },
  monthValueContainer: {
    flex: 1,
    height: 44,
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthValueText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  scrollListContent: {
    paddingBottom: 24, // Khoảng đệm ở đáy để đảm bảo cuộn hết nút bấm của phần tử cuối cùng
  },
  cardActionsContainer: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  zaloButton: {
    backgroundColor: '#0068FF', // Màu xanh Zalo thương hiệu
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zaloButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
