// meat-management-fe/src/components/DailyReportModal.js
import React, { useState, forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
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
import PopupModal from './PopupModal';
import { matchSearch } from '../utils/searchHelper';

const DailyReportModal = forwardRef(({ onRefresh, onExportDebt, onEditTransaction, onEditPayment }, ref) => {
  const popupModalRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(''); // Định dạng DD/MM/YYYY
  const [selectedMonth, setSelectedMonth] = useState(''); // Định dạng MM/YYYY
  const [activeReportTab, setActiveReportTab] = useState('day'); // 'day' hoặc 'month'
  const [rawTransactions, setRawTransactions] = useState([]);
  const [rawPayments, setRawPayments] = useState([]);
  const [rawCustomers, setRawCustomers] = useState([]);
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
      fetchReportData(todayStr, thisMonthStr, 'day');
    },
    close: () => {
      setVisible(false);
    },
    refetch: () => {
      fetchReportData();
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
    if (trimNote === '[Trả hàng nhanh] Trừ tiền công nợ đơn trong ngày' || trimNote === 'Trả hàng' || trimNote === 'Trả lại hàng') {
      return 'Trả lại hàng';
    }
    if (trimNote.startsWith('[Trả hàng nhanh]')) {
      return trimNote.replace('[Trả hàng nhanh]', '[Trả lại hàng]');
    }
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

  // Helper phân loại 4 trạng thái giao dịch: 'edited' (Đã sửa) | 'return' (Trả hàng) | 'payment' (Thu nợ) | 'debt' (Đơn nợ mới)
  const getItemStatus = (item) => {
    const createdAt = item.createdAt || item.rawObj?.createdAt;
    const updatedAt = item.updatedAt || item.rawObj?.updatedAt;
    const isEdited = createdAt && updatedAt && (new Date(updatedAt).getTime() - new Date(createdAt).getTime() > 1000);
    if (isEdited) return 'edited';

    const isDebt = item.type === 'debt';
    const isReturnGoods = !isDebt && (
      item.details?.includes('Trả hàng') ||
      item.details?.includes('Trả lại') ||
      item.note?.includes('Trả hàng') ||
      item.note?.includes('Trả lại')
    );
    if (isReturnGoods) return 'return';
    if (!isDebt) return 'payment';
    return 'debt';
  };

  // Thứ tự ưu tiên hiển thị: 1. Đã sửa -> 2. Trả hàng -> 3. Thu nợ -> 4. Đơn nợ mới
  const STATUS_PRIORITY = {
    edited: 1,
    return: 2,
    payment: 3,
    debt: 4,
  };

  // 2. Tải giao dịch, thu tiền & khách hàng từ API theo ngày cụ thể (hoặc tháng nếu chọn tab Tháng)
  const fetchReportData = async (
    targetDate = selectedDate,
    targetMonth = selectedMonth,
    tab = activeReportTab
  ) => {
    setLoading(true);
    setError('');
    try {
      let params = {};
      if (tab === 'day' && targetDate) {
        params = { date: targetDate };
      } else if (tab === 'month' && targetMonth) {
        params = { month: targetMonth };
      }

      const [transRes, payRes, custRes] = await Promise.all([
        api.get('/transactions', { params }),
        api.get('/payments', { params }),
        api.get('/customers'),
      ]);

      setRawTransactions(transRes.data?.data || []);
      setRawPayments(payRes.data?.data || []);
      setRawCustomers(custRes.data?.data || []);
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
    const dateParts = newDateStr.split('/');
    let targetMonth = selectedMonth;
    if (dateParts.length === 3) {
      targetMonth = `${dateParts[1]}/${dateParts[2]}`;
      setSelectedMonth(targetMonth);
    }
    fetchReportData(newDateStr, targetMonth, 'day');
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
    const newMonth = `${String(prevM).padStart(2, '0')}/${prevY}`;
    setSelectedMonth(newMonth);
    fetchReportData(selectedDate, newMonth, 'month');
  };

  const handleNextMonth = () => {
    const [m, y] = selectedMonth.split('/').map(Number);
    let nextM = m + 1;
    let nextY = y;
    if (nextM === 13) {
      nextM = 1;
      nextY = y + 1;
    }
    const newMonth = `${String(nextM).padStart(2, '0')}/${nextY}`;
    setSelectedMonth(newMonth);
    fetchReportData(selectedDate, newMonth, 'month');
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

  // Helper lấy lợi nhuận của 1 transaction (hỗ trợ cả đơn mới và đơn cũ)
  const getTransactionProfit = (t) => {
    if (t.totalProfit !== undefined && t.totalProfit !== null && parseFloat(t.totalProfit) > 0) {
      return parseFloat(t.totalProfit);
    }
    // Fallback tính từ items nếu đơn cũ chưa lưu totalProfit
    if (t.items && Array.isArray(t.items)) {
      return t.items.reduce((sum, it) => {
        if (it.profit !== undefined && it.profit !== null && parseFloat(it.profit) > 0) {
          return sum + parseFloat(it.profit);
        }
        const qty = parseFloat(it.quantity || 0);
        const sellPrice = parseFloat(it.price || 0);
        const itemCostNum = parseFloat(it.costPrice || 0);
        const prodCostNum = parseFloat(it.product?.costPrice || 0);
        const costPrice = itemCostNum > 0 ? itemCostNum : prodCostNum;
        const amt = it.amount !== null && it.amount !== undefined ? parseFloat(it.amount) : Math.round(qty * sellPrice);
        if (costPrice > 0) {
          return sum + (amt - (qty * costPrice));
        }
        return sum;
      }, 0);
    }
    return 0;
  };

  // Tính tổng nợ phát sinh, tổng đã thu và tổng lợi nhuận trong khoảng thời gian được chọn
  const totalDebtCreated = useMemo(() => {
    return currentTransactions.reduce((sum, t) => sum + parseFloat(t.totalAmount || 0), 0);
  }, [currentTransactions]);

  const totalPaymentReceived = useMemo(() => {
    return currentPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  }, [currentPayments]);

  const totalProfit = useMemo(() => {
    return currentTransactions.reduce((sum, t) => sum + getTransactionProfit(t), 0);
  }, [currentTransactions]);

  const profitMarginPercent = useMemo(() => {
    if (totalDebtCreated <= 0 || totalProfit <= 0) return 0;
    return Math.round((totalProfit / totalDebtCreated) * 100);
  }, [totalDebtCreated, totalProfit]);

  // Gộp chung giao dịch và thanh toán thành một dòng thời gian hiển thị (Đã sửa -> Trả hàng -> Thu nợ -> Đơn nợ mới)
  const timelineItems = useMemo(() => {
    return [
      ...currentPayments.map(p => ({
        id: p.id,
        type: 'payment',
        time: p.paidAt,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        customerId: p.customerId,
        rawObj: p,
        customerName: p.customer?.name || 'Khách ẩn danh',
        amount: parseFloat(p.amount || 0),
        note: p.note,
        details: formatPaymentNote(p.note, p.paidAt)
      })),
      ...currentTransactions.map(t => ({
        id: t.id,
        type: 'debt',
        time: t.date,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        customerId: t.customerId,
        rawObj: t,
        customerName: t.customer?.name || 'Khách ẩn danh',
        amount: parseFloat(t.totalAmount || 0),
        profit: getTransactionProfit(t),
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
      // Sắp xếp theo mức độ ưu tiên trạng thái: 1. Đã sửa -> 2. Trả hàng -> 3. Thu nợ -> 4. Đơn nợ mới
      const priorityA = STATUS_PRIORITY[getItemStatus(a)] || 99;
      const priorityB = STATUS_PRIORITY[getItemStatus(b)] || 99;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      // Cùng nhóm thì xếp theo thời gian mới nhất lên đầu
      return new Date(b.time) - new Date(a.time);
    });
  }, [currentTransactions, currentPayments]);

  // Thao tác xóa từng đơn nợ hoặc lượt thu tiền trong báo cáo ngày
  const handleDeleteItem = (item) => {
    const isDebt = item.type === 'debt';
    const typeLabel = isDebt ? 'đơn ghi nợ' : 'lượt thu tiền';
    popupModalRef.current?.show({
      title: `Xác nhận xóa ${typeLabel}`,
      message: `Bạn có chắc chắn muốn xóa ${typeLabel} của ${item.customerName} không? Hành động này không thể hoàn tác.`,
      type: 'confirm',
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      onConfirm: async () => {
        try {
          if (isDebt) {
            await api.delete(`/transactions/${item.id}`);
          } else {
            await api.delete(`/payments/${item.id}`);
          }
          fetchReportData();
          if (onRefresh) onRefresh();
        } catch (err) {
          const errMsg = err.response?.data?.message || err.message || 'Lỗi khi xóa.';
          alert(errMsg);
        }
      }
    });
  };

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

  const handleExportDailyReportImage = () => {
    if (Platform.OS !== 'web') {
      alert('Chức năng xuất ảnh hiện hỗ trợ trên giao diện Web.');
      return;
    }

    try {
      // 1. Lấy danh sách giao dịch nợ mới & thu nợ trong ngày
      const newDebtOrders = rawTransactions.filter(t => toDateKey(t.date) === selectedDate);
      const paymentsCollected = rawPayments.filter(p => toDateKey(p.paidAt) === selectedDate);

      // Tính tổng tiền nợ mới & thu nợ
      const totalNewDebt = newDebtOrders.reduce((sum, t) => sum + parseFloat(t.totalAmount || 0), 0);
      const totalPayment = paymentsCollected.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
      const netBalance = totalNewDebt - totalPayment;

      // 2. Xác định danh sách khách quen theo thời gian gần đây (trong 2 tuần gần nhất có nhiều hơn 3 đơn nợ)
      const [dayStr, monthStr, yearStr] = selectedDate.split('/').map(Number);
      const reportDate = new Date(yearStr, monthStr - 1, dayStr);
      reportDate.setHours(0, 0, 0, 0);

      const twoWeeksAgo = new Date(reportDate);
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      // Đếm số đơn nợ của từng khách hàng trong khoảng 2 tuần gần đây
      const customerRecentTxCounts = {};
      rawTransactions.forEach(t => {
        if (!t.customerId || !t.date) return;
        const txDate = new Date(t.date);
        txDate.setHours(0, 0, 0, 0);

        // Kiểm tra xem ngày giao dịch có nằm trong khoảng 14 ngày qua (cho đến ngày báo cáo) hay không
        if (txDate >= twoWeeksAgo && txDate <= reportDate) {
          customerRecentTxCounts[t.customerId] = (customerRecentTxCounts[t.customerId] || 0) + 1;
        }
      });

      const regularCustomers = rawCustomers.filter(c => {
        if (!c.isActive || c.isBadDebt) return false;
        const txCount = customerRecentTxCounts[c.id] || 0;
        return txCount > 3; // Nhiều hơn 3 đơn nợ trong 2 tuần
      });

      // Lọc ra các khách quen chưa có đơn nợ trong ngày được chọn
      const customersWithOrderToday = new Set(newDebtOrders.map(t => t.customerId));
      const missingRegularCustomers = regularCustomers.filter(c => !customersWithOrderToday.has(c.id));

      // 3. Chuẩn bị danh sách giao dịch & chia cột
      const allDailyTx = [...timelineItems];
      const totalDailyCount = allDailyTx.length;
      const isTwoCol = totalDailyCount >= 10;

      let leftItems = [];
      let rightItems = [];

      if (isTwoCol) {
        const half = Math.ceil(totalDailyCount / 2);
        leftItems = allDailyTx.slice(0, half);
        rightItems = allDailyTx.slice(half);
      } else {
        leftItems = allDailyTx;
      }

      // Đánh chỉ số toàn cục (globalIdx)
      leftItems = leftItems.map((item, idx) => ({ ...item, globalIdx: idx + 1 }));
      rightItems = rightItems.map((item, idx) => ({ ...item, globalIdx: leftItems.length + idx + 1 }));

      const numRows = Math.max(1, leftItems.length);

      // Tự động tính toán chiều cao hàng, kích thước chữ dựa trên số lượng phần tử
      let rowHeight = 48;
      let fontSizeName = 14;
      let fontSizeDetail = 11.5;
      let fontSizeAmount = 14;

      if (numRows <= 6) {
        rowHeight = 68;
        fontSizeName = 17;
        fontSizeDetail = 13.5;
        fontSizeAmount = 17;
      } else if (numRows <= 12) {
        rowHeight = 60;
        fontSizeName = 16;
        fontSizeDetail = 12.5;
        fontSizeAmount = 16;
      } else if (numRows <= 18) {
        rowHeight = 54;
        fontSizeName = 15;
        fontSizeDetail = 12;
        fontSizeAmount = 15;
      } else if (numRows <= 26) {
        rowHeight = 48;
        fontSizeName = 14;
        fontSizeDetail = 11.5;
        fontSizeAmount = 14;
      } else {
        rowHeight = Math.max(42, Math.round(48 - (numRows - 26) * 0.25));
        fontSizeName = Math.max(12.5, 14 - (numRows - 26) * 0.05);
        fontSizeDetail = Math.max(10, 11.5 - (numRows - 26) * 0.05);
        fontSizeAmount = fontSizeName;
      }

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

      // 4. Tính toán kích thước canvas chuẩn xác (vừa khít không bị thừa khoảng trắng phía dưới)
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const width = isTwoCol ? 1200 : 900;
      const colGap = 20;
      const sidePadding = 25;
      const colWidth = isTwoCol ? (width - sidePadding * 2 - colGap) / 2 : (width - sidePadding * 2);
      const leftColX = sidePadding;
      const rightColX = sidePadding + colWidth + colGap;

      const headerTop = 15;
      const headerHeight = 110;
      const boxY = headerTop + headerHeight + 10; // 135
      const boxH = 70;
      const colHeaderHeight = 42;
      const listStartY = boxY + boxH + 20; // 225
      const listHeight = colHeaderHeight + numRows * rowHeight;
      const footerGap = 20;
      const footerHeight = 55;
      const bottomPadding = 15;

      const totalHeight = listStartY + listHeight + footerGap + footerHeight + bottomPadding;

      // Scale 2x giúp hình ảnh xuất ra siêu nét, xem rõ ràng trên mọi thiết bị
      const scale = 2;
      canvas.width = width * scale;
      canvas.height = totalHeight * scale;

      ctx.scale(scale, scale);

      // Nền trắng toàn ảnh
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, totalHeight);

      // Viền bo khung ngoài
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 3;
      ctx.strokeRect(10, 10, width - 20, totalHeight - 20);

      // ─── 1. HEADER BÁO CÁO ───────────────────
      ctx.fillStyle = '#065F46';
      ctx.fillRect(15, 15, width - 30, 110);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 24px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BÁO CÁO CÔNG NỢ TRONG NGÀY', width / 2, 52);

      ctx.fillStyle = '#A7F3D0';
      ctx.font = 'bold 16px Arial, sans-serif';
      ctx.fillText(`Ngày báo cáo: ${selectedDate}`, width / 2, 82);

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} - ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
      ctx.fillStyle = '#E2E8F0';
      ctx.font = 'italic 12px Arial, sans-serif';
      ctx.fillText(`Thời gian xuất: ${timeStr}`, width / 2, 107);

      // ─── 2. HỘP TỔNG KẾT (3 HỘP TRÊN CÙNG) ───────────────────
      const boxW = (width - sidePadding * 2 - 20) / 3;

      // Hộp Nợ Mới
      ctx.fillStyle = '#FEF2F2';
      ctx.fillRect(sidePadding, boxY, boxW, boxH);
      ctx.strokeStyle = '#FECACA';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sidePadding, boxY, boxW, boxH);

      ctx.fillStyle = '#991B1B';
      ctx.font = 'bold 12.5px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('🔴 ĐƠN NỢ MỚI TRONG NGÀY', sidePadding + 14, boxY + 26);
      ctx.font = 'bold 18px Arial, sans-serif';
      ctx.fillText(formatCurrency(totalNewDebt), sidePadding + 14, boxY + 54);

      // Hộp Thu Nợ
      const box2X = sidePadding + boxW + 10;
      ctx.fillStyle = '#F0FDF4';
      ctx.fillRect(box2X, boxY, boxW, boxH);
      ctx.strokeStyle = '#BBF7D0';
      ctx.strokeRect(box2X, boxY, boxW, boxH);

      ctx.fillStyle = '#166534';
      ctx.font = 'bold 12.5px Arial, sans-serif';
      ctx.fillText('🟢 TIỀN ĐÃ THU TRONG NGÀY', box2X + 14, boxY + 26);
      ctx.font = 'bold 18px Arial, sans-serif';
      ctx.fillText(formatCurrency(totalPayment), box2X + 14, boxY + 54);

      // Hộp Dư NỢ Ròng
      const box3X = box2X + boxW + 10;
      ctx.fillStyle = '#EFF6FF';
      ctx.fillRect(box3X, boxY, boxW, boxH);
      ctx.strokeStyle = '#BFDBFE';
      ctx.strokeRect(box3X, boxY, boxW, boxH);

      ctx.fillStyle = '#1E40AF';
      ctx.font = 'bold 12.5px Arial, sans-serif';
      ctx.fillText('🔵 CHÊNH LỆCH CÔNG NỢ RÒNG', box3X + 14, boxY + 26);
      ctx.font = 'bold 18px Arial, sans-serif';
      ctx.fillText(formatCurrency(netBalance), box3X + 14, boxY + 54);

      // ─── 3. VẼ DANH SÁCH CHI TIẾT GIAO DỊCH ───────────────────
      const drawColumn = (items, startX, colW, headerTitle) => {
        let colY = listStartY;

        // Header cột
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(startX, colY, colW, colHeaderHeight);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(headerTitle, startX + 14, colY + 26);

        colY += colHeaderHeight;

        if (items.length === 0) {
          ctx.fillStyle = '#F8FAFC';
          ctx.fillRect(startX, colY, colW, rowHeight);
          ctx.strokeStyle = '#E2E8F0';
          ctx.strokeRect(startX, colY, colW, rowHeight);

          ctx.fillStyle = '#94A3B8';
          ctx.font = 'italic 13px Arial, sans-serif';
          ctx.fillText('Không có giao dịch nào.', startX + 14, colY + Math.round(rowHeight / 2) + 5);
          colY += rowHeight;
        } else {
          items.forEach((item, idx) => {
            const status = getItemStatus(item);
            const isDebt = item.type === 'debt';
            const isReturnGoods = status === 'return';

            if (isReturnGoods) {
              ctx.fillStyle = idx % 2 === 0 ? '#FFF7ED' : '#FFEDD5';
              ctx.strokeStyle = '#FED7AA';
            } else if (isDebt) {
              ctx.fillStyle = idx % 2 === 0 ? '#FFFFFF' : '#FEF2F2';
              ctx.strokeStyle = '#FECACA';
            } else {
              ctx.fillStyle = idx % 2 === 0 ? '#FFFFFF' : '#F0FDF4';
              ctx.strokeStyle = '#BBF7D0';
            }

            ctx.fillRect(startX, colY, colW, rowHeight);
            ctx.strokeRect(startX, colY, colW, rowHeight);

            // Tên khách hàng (căn trái)
            ctx.fillStyle = '#0F172A';
            ctx.font = `bold ${fontSizeName}px Arial, sans-serif`;
            ctx.textAlign = 'left';
            ctx.fillText(`${item.globalIdx || idx + 1}. ${item.customerName}`, startX + 12, colY + Math.round(rowHeight * 0.42));

            // Chi tiết mặt hàng / ghi chú (căn trái)
            ctx.fillStyle = '#64748B';
            ctx.font = `${fontSizeDetail}px Arial, sans-serif`;
            const subText = wrapText(ctx, item.details || '', colW - 170)[0] || '';
            ctx.fillText(subText, startX + 22, colY + Math.round(rowHeight * 0.8));

            // Số tiền (căn phải)
            if (isReturnGoods) {
              ctx.fillStyle = '#EA580C';
            } else if (isDebt) {
              ctx.fillStyle = '#DC2626';
            } else {
              ctx.fillStyle = '#16A34A';
            }

            ctx.font = `bold ${fontSizeAmount}px Arial, sans-serif`;
            ctx.textAlign = 'right';
            ctx.fillText(`${isDebt ? '+' : '-'}${formatCurrency(item.amount)}`, startX + colW - 12, colY + Math.round(rowHeight * 0.58));
            ctx.textAlign = 'left';

            colY += rowHeight;
          });
        }
        return colY;
      };

      if (!isTwoCol) {
        drawColumn(leftItems, leftColX, width - sidePadding * 2, `📝 DANH SÁCH GIAO DỊCH CÔNG NỢ TRONG NGÀY (${totalDailyCount} giao dịch)`);
      } else {
        drawColumn(leftItems, leftColX, colWidth, `📝 CHI TIẾT GIAO DỊCH (Phần 1 - ${leftItems.length} đơn)`);
        drawColumn(rightItems, rightColX, colWidth, `📝 CHI TIẾT GIAO DỊCH (Phần 2 - ${rightItems.length} đơn)`);
      }

      // ─── 4. VẼ FOOTER CHO CANVAS 1 & TẢI XUỐNG ───────────────────
      const footerY1 = listStartY + listHeight + footerGap;
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sidePadding, footerY1);
      ctx.lineTo(width - sidePadding, footerY1);
      ctx.stroke();

      ctx.fillStyle = '#64748B';
      ctx.font = '12px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Hệ thống Quản lý Giao dịch & Công nợ Sạp thịt', width / 2, footerY1 + 22);
      ctx.fillText('Cảm ơn bạn đã tin dùng dịch vụ!', width / 2, footerY1 + 40);

      // Tải ảnh báo cáo chính (Ảnh 1)
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `BaoCao_CongNo_Ngay_${selectedDate.replace(/\//g, '_')}.png`;
      link.href = dataUrl;
      link.click();

      // ─── 5. XỬ LÝ ẢNH 2 (NẾU CÓ KHÁCH QUEN SÓT ĐƠN NỢ) ───────────────────
      if (missingRegularCustomers.length > 0) {
        const numMissingRows = Math.max(1, missingRegularCustomers.length);
        let missingRowHeight = 48;
        let missingFontSize = 14;
        if (numMissingRows <= 6) {
          missingRowHeight = 65;
          missingFontSize = 16;
        } else if (numMissingRows <= 12) {
          missingRowHeight = 56;
          missingFontSize = 15;
        }

        const c2HeaderH = 80;
        const c2StartY = 15 + c2HeaderH + 20; // 115
        const c2ListH = numMissingRows * missingRowHeight;
        const canvas2Height = c2StartY + c2ListH + footerGap + footerHeight + bottomPadding;

        const canvas2 = document.createElement('canvas');
        const ctx2 = canvas2.getContext('2d');

        canvas2.width = width * scale;
        canvas2.height = canvas2Height * scale;
        ctx2.scale(scale, scale);

        // Nền trắng toàn ảnh
        ctx2.fillStyle = '#FFFFFF';
        ctx2.fillRect(0, 0, width, canvas2Height);

        // Viền bo khung ngoài
        ctx2.strokeStyle = '#CBD5E1';
        ctx2.lineWidth = 3;
        ctx2.strokeRect(10, 10, width - 20, canvas2Height - 20);

        // Header của ảnh 2
        ctx2.fillStyle = '#065F46';
        ctx2.fillRect(15, 15, width - 30, c2HeaderH);

        ctx2.fillStyle = '#FFFFFF';
        ctx2.font = 'bold 20px Arial, sans-serif';
        ctx2.textAlign = 'center';
        ctx2.fillText('DANH SÁCH KHÁCH QUEN CHƯA CÓ ĐƠN NỢ HÔM NAY', width / 2, 45);

        ctx2.fillStyle = '#A7F3D0';
        ctx2.font = 'bold 13px Arial, sans-serif';
        ctx2.fillText(`Ngày báo cáo: ${selectedDate}`, width / 2, 70);

        let currentY = c2StartY;

        if (missingRegularCustomers.length === 0) {
          ctx2.fillStyle = '#F8FAFC';
          ctx2.fillRect(sidePadding, currentY, width - sidePadding * 2, missingRowHeight);
          ctx2.strokeStyle = '#E2E8F0';
          ctx2.strokeRect(sidePadding, currentY, width - sidePadding * 2, missingRowHeight);

          ctx2.fillStyle = '#94A3B8';
          ctx2.font = 'italic 13px Arial, sans-serif';
          ctx2.fillText('Không có khách quen nào bị sót.', sidePadding + 14, currentY + Math.round(missingRowHeight / 2) + 5);
          currentY += missingRowHeight;
        } else {
          missingRegularCustomers.forEach((c, idx) => {
            ctx2.fillStyle = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
            ctx2.fillRect(sidePadding, currentY, width - sidePadding * 2, missingRowHeight);
            ctx2.strokeStyle = '#E2E8F0';
            ctx2.strokeRect(sidePadding, currentY, width - sidePadding * 2, missingRowHeight);

            ctx2.fillStyle = '#0F172A';
            ctx2.font = `bold ${missingFontSize}px Arial, sans-serif`;
            ctx2.fillText(`${idx + 1}. ${c.name}`, sidePadding + 12, currentY + Math.round(missingRowHeight / 2) + 5);

            ctx2.fillStyle = '#64748B';
            ctx2.font = '12px Arial, sans-serif';
            ctx2.fillText(
              `SĐT: ${c.phone || 'Chưa có'}  |  Số đơn nợ 2 tuần qua: ${customerRecentTxCounts[c.id] || 0} đơn`,
              sidePadding + 260,
              currentY + Math.round(missingRowHeight / 2) + 5
            );

            ctx2.fillStyle = c.debt > 0 ? '#DC2626' : '#64748B';
            ctx2.font = `bold ${missingFontSize}px Arial, sans-serif`;
            ctx2.textAlign = 'right';
            ctx2.fillText(`Nợ tích lũy: ${formatCurrency(c.debt)}`, width - sidePadding - 14, currentY + Math.round(missingRowHeight / 2) + 5);
            ctx2.textAlign = 'left';

            currentY += missingRowHeight;
          });
        }

        // Footer ảnh 2
        const finalY = currentY + footerGap;
        ctx2.strokeStyle = '#CBD5E1';
        ctx2.lineWidth = 1;
        ctx2.beginPath();
        ctx2.moveTo(sidePadding, finalY);
        ctx2.lineTo(width - sidePadding, finalY);
        ctx2.stroke();

        ctx2.fillStyle = '#64748B';
        ctx2.font = '12px Arial, sans-serif';
        ctx2.textAlign = 'center';
        ctx2.fillText('Hệ thống Quản lý Giao dịch & Công nợ Sạp thịt', width / 2, finalY + 22);
        ctx2.fillText('Cảm ơn bạn đã tin dùng dịch vụ!', width / 2, finalY + 40);

        // Download Ảnh 2
        const dataUrl2 = canvas2.toDataURL('image/png');
        const link2 = document.createElement('a');
        link2.download = `BaoCao_KhachQuenSot_Ngay_${selectedDate.replace(/\//g, '_')}.png`;
        link2.href = dataUrl2;
        link2.click();
      }
    } catch (err) {
      console.error('[EXPORT IMAGE ERROR]', err);
      alert('Đã xảy ra lỗi khi xuất ảnh báo cáo.');
    }
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        <View style={styles.modalHeaderRow}>
          <Text style={styles.modalTitle}>
            {activeReportTab === 'day' ? '📊 THỐNG KÊ CÔNG NỢ TRONG NGÀY' : '📊 THỐNG KÊ CÔNG NỢ THEO THÁNG'}
          </Text>
          <TouchableOpacity style={styles.closeHeaderBtn} onPress={() => setVisible(false)}>
            <Text style={styles.closeHeaderBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Thanh chọn tab thống kê */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeReportTab === 'day' && styles.tabButtonActive]}
            onPress={() => {
              setActiveReportTab('day');
              setError('');
              setSearchText('');
              fetchReportData(selectedDate, selectedMonth, 'day');
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
              fetchReportData(selectedDate, selectedMonth, 'month');
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
            {/* 3 Hộp tổng kết nhanh (Nợ phát sinh, Tiền đã thu, Lợi nhuận) */}
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
                <Text style={styles.summaryBoxLabel}>{activeReportTab === 'day' ? '🔴 Nợ phát sinh' : '🔴 Tổng nợ'}</Text>
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
                <Text style={styles.summaryBoxLabel}>{activeReportTab === 'day' ? '🟢 Tiền đã thu' : '🟢 Đã thu'}</Text>
                <Text style={styles.summaryBoxValue}>{formatCurrency(totalPaymentReceived)}</Text>
              </TouchableOpacity>
              <View style={[styles.summaryBox, styles.profitBox]}>
                <Text style={[styles.summaryBoxLabel, { color: '#0369A1' }]}>
                  {`💰 Lợi nhuận${profitMarginPercent > 0 ? ` (${profitMarginPercent}%)` : ''}`}
                </Text>
                <Text style={[styles.summaryBoxValue, { color: '#0369A1' }]}>{formatCurrency(totalProfit)}</Text>
              </View>
            </View>

            {/* Ô chú thích 4 màu trạng thái giao dịch */}
            {activeReportTab === 'day' && (
              <View style={styles.legendContainer}>
                <View style={[styles.legendBadge, styles.legendBadgeEdited]}>
                  <View style={[styles.legendDot, { backgroundColor: '#8B5CF6' }]} />
                  <Text style={[styles.legendText, { color: '#7E22CE' }]}>Đã sửa</Text>
                </View>
                <View style={[styles.legendBadge, styles.legendBadgeReturn]}>
                  <View style={[styles.legendDot, { backgroundColor: '#EA580C' }]} />
                  <Text style={[styles.legendText, { color: '#EA580C' }]}>Trả hàng</Text>
                </View>
                <View style={[styles.legendBadge, styles.legendBadgePayment]}>
                  <View style={[styles.legendDot, { backgroundColor: '#16A34A' }]} />
                  <Text style={[styles.legendText, { color: '#16A34A' }]}>Thu nợ</Text>
                </View>
                <View style={[styles.legendBadge, styles.legendBadgeDebt]}>
                  <View style={[styles.legendDot, { backgroundColor: '#DC2626' }]} />
                  <Text style={[styles.legendText, { color: '#DC2626' }]}>Đơn nợ mới</Text>
                </View>
              </View>
            )}

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
              // Hiển thị danh sách chi tiết 1 phần tử 1 hàng (full-width)
              <ScrollView
                style={styles.scrollList}
                contentContainerStyle={styles.scrollListContent}
                showsVerticalScrollIndicator={false}
              >
                {displayItems.map((item) => {
                  if (activeReportTab === 'day') {
                    const status = getItemStatus(item);
                    const isDebt = item.type === 'debt';
                    const isEdited = status === 'edited';
                    const isReturnGoods = status === 'return';

                    let displayDetails = item.details;
                    if (isReturnGoods) {
                      if (displayDetails === '[Trả hàng nhanh] Trừ tiền công nợ đơn trong ngày' || displayDetails === 'Trả hàng' || displayDetails === 'Trả lại hàng') {
                        displayDetails = 'Trả lại hàng';
                      } else if (displayDetails?.startsWith('[Trả hàng nhanh]')) {
                        displayDetails = displayDetails.replace('[Trả hàng nhanh]', '[Trả lại hàng]');
                      }
                    }

                    return (
                      <View
                        key={item.id}
                        style={[
                          styles.itemCard,
                          isEdited
                            ? styles.itemCardEdited
                            : isReturnGoods 
                              ? styles.itemCardReturnGoods 
                              : isDebt 
                                ? styles.itemCardDebt 
                                : styles.itemCardPayment
                        ]}
                      >
                        <View style={styles.itemHeader}>
                          <View style={styles.customerNameRow}>
                            <Text style={styles.customerName}>{item.customerName}</Text>
                            <TouchableOpacity
                              style={styles.itemEditBtn}
                              onPress={() => {
                                if (isDebt && onEditTransaction) {
                                  onEditTransaction(item.rawObj || item);
                                } else if (!isDebt && onEditPayment) {
                                  onEditPayment(item.rawObj || item);
                                }
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.itemEditBtnText}>Sửa</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.itemDeleteBtn}
                              onPress={() => handleDeleteItem(item)}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.itemDeleteBtnText}>Xóa</Text>
                            </TouchableOpacity>
                          </View>

                          <Text style={[
                            styles.itemAmount, 
                            isEdited
                              ? styles.amountEdited
                              : isReturnGoods 
                                ? styles.amountReturnGoods 
                                : isDebt 
                                  ? styles.amountDebt 
                                  : styles.amountPayment
                          ]}>
                            {isDebt ? '+' : '-'}{formatCurrency(item.amount)}
                          </Text>
                        </View>

                        {displayDetails ? (
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={[styles.itemDetails, { flex: 1 }]} numberOfLines={2}>
                              {isDebt ? `🥩 ${displayDetails}` : isReturnGoods ? `↩️ ${displayDetails}` : `💵 ${displayDetails}`}
                            </Text>
                            {isDebt && item.profit > 0 ? (
                              <View style={styles.itemProfitBadge}>
                                <Text style={styles.itemProfitBadgeText}>
                                  Lãi: +{formatCurrency(item.profit)}
                                </Text>
                              </View>
                            ) : null}
                          </View>
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
          {activeReportTab === 'day' && (
            <TouchableOpacity
              style={styles.exportReportBtn}
              onPress={handleExportDailyReportImage}
              activeOpacity={0.7}
            >
              <Text style={styles.exportReportBtnText}>📸 XUẤT BÁO CÁO NGÀY</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.closeButtonNew}
            onPress={() => setVisible(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.closeButtonTextNew}>ĐÓNG LẠI</Text>
          </TouchableOpacity>
        </View>
      </View>
      {/* Popup xác nhận xóa */}
      <PopupModal ref={popupModalRef} />
    </SmoothModal>
  );
});

export default DailyReportModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    marginTop: 20,
    maxHeight: '94%',
    flex: 1,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    flex: 1,
  },
  closeHeaderBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  closeHeaderBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#64748B',
  },
  customerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  datePickerContainer: {
    marginBottom: 8,
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
    flex: 1,
    overflow: 'hidden',
  },
  summaryContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  summaryBox: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
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
  profitBox: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  itemProfitBadge: {
    backgroundColor: '#E0F2FE',
    borderColor: '#7DD3FC',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 6,
  },
  itemProfitBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0369A1',
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
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  summaryBoxValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  listTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 6,
  },
  emptyContainer: {
    paddingVertical: 30,
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  emptyText: {
    color: COLORS.textLight,
    fontStyle: 'italic',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  scrollList: {
    flex: 1,
    marginBottom: 8,
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
  itemEditBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemEditBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1D4ED8',
  },
  itemDeleteBtn: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemDeleteBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#DC2626',
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
  itemCardReturnGoods: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FEF3C7',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  itemCardEdited: {
    backgroundColor: '#FAF5FF',
    borderColor: '#E9D5FF',
    borderLeftWidth: 4,
    borderLeftColor: '#8B5CF6',
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
  amountReturnGoods: {
    color: '#D97706',
  },
  amountEdited: {
    color: '#7E22CE',
  },
  /* Legend Box */
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  legendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  legendBadgeEdited: {
    backgroundColor: '#F3E8FF',
    borderColor: '#D8B4FE',
  },
  legendBadgeReturn: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FFEDD5',
  },
  legendBadgePayment: {
    backgroundColor: '#F0FDF4',
    borderColor: '#DCFCE7',
  },
  legendBadgeDebt: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusTagEdited: {
    backgroundColor: '#EDE9FE',
    borderWidth: 1,
    borderColor: '#C4B5FD',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusTagEditedText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6D28D9',
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
    marginTop: 'auto',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
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
    marginBottom: 8,
    position: 'relative',
    justifyContent: 'center',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    height: 34,
    borderRadius: 8,
    paddingLeft: 10,
    paddingRight: 30,
    fontSize: 12,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
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
  exportReportBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    backgroundColor: '#059669', // Emerald green
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.card,
  },
  exportReportBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
