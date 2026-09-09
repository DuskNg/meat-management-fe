// meat-management-fe/src/components/ExportDebtModal.js
import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
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
  TextInput,
  Linking,
} from 'react-native';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import SmoothModal from './SmoothModal';
import DatePickerInput from './DatePickerInput';
import ImagePreviewModal from './ImagePreviewModal';
import { showGlobalToast } from '../store/toastStore';
import { isChiTuyetToanNgaCustomer, buildChiTuyetDailyMessage } from '../utils/debtMessageHelper';

// Helper: lấy ngày hôm nay dạng DD/MM/YYYY
const getTodayFormatted = () => {
  const today = new Date();
  const d = String(today.getDate()).padStart(2, '0');
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const y = today.getFullYear();
  return `${d}/${m}/${y}`;
};

// Helper: Lấy ngày bắt đầu, ngày giữa và ngày kết thúc của tháng (dạng DD/MM/YYYY)
const getMonthBounds = (monthStr) => {
  if (!monthStr || !monthStr.includes('/')) {
    return { start: '', midEnd: '', midStart: '', end: '' };
  }
  const [mm, yyyy] = monthStr.split('/').map(Number);
  const mmStr = mm.toString().padStart(2, '0');
  const daysInMonth = new Date(yyyy, mm, 0).getDate();
  return {
    start: `01/${mmStr}/${yyyy}`,
    midEnd: `15/${mmStr}/${yyyy}`,
    midStart: `16/${mmStr}/${yyyy}`,
    end: `${daysInMonth.toString().padStart(2, '0')}/${mmStr}/${yyyy}`
  };
};

// Helper: Chuyển đổi chuỗi DD/MM/YYYY thành đối tượng Date
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

// Helper: Lấy khoảng ngày theo các mốc thời gian thông dụng (Tháng này, Tháng trước, 1-15, 16-hết, 7 ngày, Tất cả)
const getPresetRange = (presetKey, currentFrom, transList) => {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

  if (presetKey === 'this_month') {
    const y = today.getFullYear();
    const m = today.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    return { from: fmt(first), to: fmt(last) };
  }

  if (presetKey === 'last_month') {
    const y = today.getFullYear();
    const m = today.getMonth() - 1;
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    return { from: fmt(first), to: fmt(last) };
  }

  // Lấy mốc thời gian cơ sở từ currentFrom nếu có
  const baseDate = parseDDMMYYYY(currentFrom, false) || today;
  const y = baseDate.getFullYear();
  const m = baseDate.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();

  if (presetKey === 'first_half') {
    return {
      from: `01/${pad(m + 1)}/${y}`,
      to: `15/${pad(m + 1)}/${y}`,
    };
  }

  if (presetKey === 'second_half') {
    return {
      from: `16/${pad(m + 1)}/${y}`,
      to: `${pad(lastDay)}/${pad(m + 1)}/${y}`,
    };
  }

  if (presetKey === 'last_7_days') {
    const from = new Date(today);
    from.setDate(today.getDate() - 6);
    return { from: fmt(from), to: fmt(today) };
  }

  if (presetKey === 'all') {
    if (transList && transList.length > 0) {
      const sorted = [...transList].sort((a, b) => new Date(a.date) - new Date(b.date));
      const first = new Date(sorted[0].date);
      return { from: fmt(first), to: fmt(today) };
    }
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    return { from: fmt(first), to: fmt(last) };
  }

  return { from: currentFrom, to: currentFrom };
};

// Hàm helper để xác định tháng mục tiêu của khoản thanh toán dựa trên ghi chú
const getPaymentTargetMonth = (p) => {
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

// Helper tạo tin nhắn công nợ theo ngày đúng chuẩn gửi Zalo/SMS
// Quy tắc: Hàng trên cùng là ngày, hàng dưới tên thịt nhân đơn giá thành tiền, hàng cuối cùng là tổng
const buildDailyMessage = (dateKey, transList, payList, cust) => {
  if (!dateKey) return '';

  // Áp dụng định dạng tin nhắn riêng cho khách hàng Chị Tuyết (Toàn Nga Thái Dũng)
  if (isChiTuyetToanNgaCustomer(cust)) {
    return buildChiTuyetDailyMessage(dateKey, transList, payList);
  }

  const dayTrans = (transList || []).filter(t => {
    const d = new Date(t.date);
    const dd = d.getDate().toString().padStart(2, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}` === dateKey;
  });

  const dayPays = (payList || []).filter(p => {
    const d = new Date(p.paidAt);
    const dd = d.getDate().toString().padStart(2, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}` === dateKey;
  });

  if (dayTrans.length === 0 && dayPays.length === 0) {
    return `Ngày ${dateKey}\n(Không có phát sinh giao dịch công nợ trong ngày này)`;
  }

  const lines = [];
  // Hàng trên cùng là ngày
  lines.push(`Ngày ${dateKey}`);

  let totalDebt = 0;
  let totalReturn = 0;
  let totalPayment = 0;

  // Hàng dưới: tên thịt nhân đơn giá thành tiền
  dayTrans.forEach(t => {
    totalDebt += parseFloat(t.totalAmount || 0);

    if (t.items && t.items.length > 0) {
      t.items.forEach(item => {
        const q = parseFloat(item.quantity);
        const p = parseFloat(item.price);
        const amt = parseFloat(item.amount || (q * p));
        const name = item.product?.name || 'Thịt';
        const unit = item.product?.unit || 'kg';

        const isQuick = name === 'Tiền hàng' || name.toLowerCase().startsWith('tiền') || t.note === 'Ghi nợ nhanh';
        if (isQuick) {
          lines.push(`${name}: ${new Intl.NumberFormat('vi-VN').format(amt)} đ`);
        } else {
          const priceDisplay = (p >= 1000 && p % 1000 === 0) ? `${p / 1000}k` : `${new Intl.NumberFormat('vi-VN').format(p)}đ`;
          lines.push(`${q}${unit} ${name} x ${priceDisplay} = ${new Intl.NumberFormat('vi-VN').format(amt)} đ`);
        }
      });
    } else {
      lines.push(`Tiền hàng: ${new Intl.NumberFormat('vi-VN').format(t.totalAmount)} đ`);
    }

    if (t.note && t.note !== 'Ghi nợ nhanh' && !t.note.includes('tự động') && !t.note.includes('hàng loạt')) {
      lines.push(`(Ghi chú: ${t.note})`);
    }
  });

  // Hàng trừ trả lại hàng hoặc đã thanh toán trong ngày
  dayPays.forEach(p => {
    const amt = parseFloat(p.amount || 0);
    if (isReturnPayment(p)) {
      totalReturn += amt;
      const cleanNote = p.note ? p.note.replace(/\[Trả lại hàng\]|\[Trả hàng nhanh\]/g, '').trim() : '';
      if (cleanNote) {
        lines.push(`- Trả lại hàng: ${cleanNote} (-${new Intl.NumberFormat('vi-VN').format(amt)} đ)`);
      } else {
        lines.push(`- Trả lại hàng: -${new Intl.NumberFormat('vi-VN').format(amt)} đ`);
      }
    } else {
      totalPayment += amt;
      lines.push(`- Đã thanh toán: -${new Intl.NumberFormat('vi-VN').format(amt)} đ`);
    }
  });

  // Hàng cuối cùng là tổng
  const netTotal = totalDebt - totalReturn - totalPayment;
  if (totalReturn > 0 || totalPayment > 0) {
    lines.push(`Tổng: ${new Intl.NumberFormat('vi-VN').format(netTotal)} đ`);
  } else {
    lines.push(`Tổng: ${new Intl.NumberFormat('vi-VN').format(totalDebt)} đ`);
  }

  return lines.join('\n');
};

const ExportDebtModal = forwardRef(({ onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [activeTab, setActiveTab] = useState('month'); // 'month' | 'day'
  const [selectedMonth, setSelectedMonth] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedDayKey, setSelectedDayKey] = useState('');
  const [availableDays, setAvailableDays] = useState([]);
  const [dailyMessageText, setDailyMessageText] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [imageUri, setImageUri] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [totalDebtInMonth, setTotalDebtInMonth] = useState(0);
  const [totalPaymentInMonth, setTotalPaymentInMonth] = useState(0);
  const [totalReturnInMonth, setTotalReturnInMonth] = useState(0);
  const [totalWholeMonthDebt, setTotalWholeMonthDebt] = useState(0);

  // Ref điều khiển modal phóng to ảnh xem trước
  const imagePreviewModalRef = useRef(null);

  // 1. Phơi bày các hàm điều khiển ra bên ngoài
  useImperativeHandle(ref, () => ({
    open: (c, targetMonth, targetDay, defaultTab) => {
      setCustomer(c);
      setVisible(true);
      setSelectedMonth(targetMonth || '');
      setFromDate('');
      setToDate('');
      setActiveTab(defaultTab || (targetDay ? 'day' : 'month'));
      setAvailableMonths([]);
      setAvailableDays([]);
      setTransactions([]);
      setPayments([]);
      setImageUri(null);
      setError('');
      setIsCopied(false);
      fetchData(c.id, c, targetMonth, targetDay);
    },
    close: () => {
      setVisible(false);
    }
  }));

  // 2. Tải toàn bộ giao dịch & thu tiền để trích xuất các tháng và ngày khả dụng
  const fetchData = async (customerId, currentCust, targetMonth, targetDay) => {
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
      // Trích xuất các ngày duy nhất có giao dịch phát sinh
      const daysMap = new Map();

      transList.forEach(t => {
        const d = new Date(t.date);
        const dd = d.getDate().toString().padStart(2, '0');
        const mm = (d.getMonth() + 1).toString().padStart(2, '0');
        const yyyy = d.getFullYear();
        monthsSet.add(`${mm}/${yyyy}`);

        const dateKey = `${dd}/${mm}/${yyyy}`;
        if (!daysMap.has(dateKey)) {
          daysMap.set(dateKey, {
            dateKey,
            date: t.date,
            totalDebt: 0,
            hasReturn: false,
          });
        }
        daysMap.get(dateKey).totalDebt += parseFloat(t.totalAmount || 0);
      });

      payList.forEach(p => {
        monthsSet.add(getPaymentTargetMonth(p));

        const d = new Date(p.paidAt);
        const dd = d.getDate().toString().padStart(2, '0');
        const mm = (d.getMonth() + 1).toString().padStart(2, '0');
        const yyyy = d.getFullYear();
        const dateKey = `${dd}/${mm}/${yyyy}`;

        if (!daysMap.has(dateKey)) {
          daysMap.set(dateKey, {
            dateKey,
            date: p.paidAt,
            totalDebt: 0,
            hasReturn: false,
          });
        }
        if (isReturnPayment(p)) {
          daysMap.get(dateKey).hasReturn = true;
        }
      });

      // Chuyển set thành mảng và sắp xếp ngược lại (tháng mới nhất lên đầu)
      const monthsArray = Array.from(monthsSet).sort((a, b) => {
        const [aM, aY] = a.split('/').map(Number);
        const [bM, bY] = b.split('/').map(Number);
        return bY - aY || bM - aM;
      });
      setAvailableMonths(monthsArray);

      // Sắp xếp các ngày từ mới nhất đến cũ nhất
      const daysArray = Array.from(daysMap.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
      setAvailableDays(daysArray);

      // Xác định khoảng thời gian mặc định ban đầu:
      let initialFrom = '';
      let initialTo = '';

      if (targetDay) {
        initialFrom = targetDay;
        initialTo = targetDay;
      } else if (targetMonth) {
        const bounds = getMonthBounds(targetMonth);
        initialFrom = bounds.start;
        initialTo = bounds.end;
      } else if (monthsArray.length > 0) {
        const bounds = getMonthBounds(monthsArray[0]);
        initialFrom = bounds.start;
        initialTo = bounds.end;
      } else {
        const thisMonthRange = getPresetRange('this_month');
        initialFrom = thisMonthRange.from;
        initialTo = thisMonthRange.to;
      }

      setFromDate(initialFrom);
      setToDate(initialTo);

      // Chọn ngày mặc định: ngày được chỉ định hoặc ngày gần nhất có giao dịch cho tab tin nhắn
      let defaultDay = targetDay;
      if (!defaultDay) {
        if (daysArray.length > 0) {
          defaultDay = daysArray[0].dateKey;
        } else {
          defaultDay = getTodayFormatted();
        }
      }
      setSelectedDayKey(defaultDay);

      // Tạo tin nhắn cho ngày mặc định
      const msg = buildDailyMessage(defaultDay, transList, payList, currentCust);
      setDailyMessageText(msg);

      // Tự động tạo ảnh công nợ ngay khi tải xong dữ liệu
      generateDebtImage(transList, payList, currentCust, initialFrom, initialTo);

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

  // 3. Tạo file ảnh công nợ dạng bảng kẻ chi tiết gọn gàng, trực quan chuẩn Excel (như mẫu thực tế)
  const generateDebtImage = (transList, payList, cust, customFromDate, customToDate) => {
    if (Platform.OS !== 'web') {
      return; // Không vẽ trên môi trường Native để tránh lỗi Canvas
    }

    if (!cust) return;

    const activeFrom = customFromDate !== undefined ? customFromDate : fromDate;
    const activeTo = customToDate !== undefined ? customToDate : toDate;

    setGenerating(true);
    setImageUri(null); // Reset ảnh cũ trong khi vẽ ảnh mới

    try {
      const fromD = parseDDMMYYYY(activeFrom, false);
      const toD = parseDDMMYYYY(activeTo, true);

      // Kiểm tra xem khoảng ngày có phải trọn vẹn 1 tháng hay không
      const isFullMonth = fromD && toD &&
        fromD.getDate() === 1 &&
        fromD.getMonth() === toD.getMonth() &&
        fromD.getFullYear() === toD.getFullYear() &&
        toD.getDate() === new Date(toD.getFullYear(), toD.getMonth() + 1, 0).getDate();

      const mm = fromD ? (fromD.getMonth() + 1) : (new Date().getMonth() + 1);
      const yyyy = fromD ? fromD.getFullYear() : new Date().getFullYear();
      const monthStr = `${mm.toString().padStart(2, '0')}/${yyyy}`;

      // Lọc các giao dịch phát sinh trong khoảng ngày
      const filteredTrans = (transList || []).filter(t => {
        const d = new Date(t.date);
        if (isNaN(d.getTime())) return false;
        if (fromD && toD) {
          return d >= fromD && d <= toD;
        }
        return true;
      });

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

      // Gom toàn bộ giao dịch mua hàng, trả hàng và thanh toán theo từng ngày
      // dayMap: { [dateKey]: { dateObj, dayStr, entries: [] } }
      const dayMap = {};
      let totalMeatAmount = 0;
      let totalReturnAmount = 0;
      let totalPaymentAmount = 0;

      // 1. Thêm các món hàng từ giao dịch (Transactions)
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
          // Giao dịch không có danh sách items (nợ nhanh)
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

      // 2. Thêm các khoản thanh toán / trả hàng từ payments
      const paymentsForSummary = [];
      filteredPays.forEach(p => {
        const d = new Date(p.paidAt);
        const dayNum = d.getDate().toString().padStart(2, '0');
        const monthNum = (d.getMonth() + 1).toString().padStart(2, '0');
        const dateKey = `${dayNum}/${monthNum}/${d.getFullYear()}`;
        const displayDate = `${dayNum}/${monthNum}`;

        // Trích xuất ngày đã thu định dạng DD/MM/YYYY chuẩn (ví dụ 31/07/2026)
        const trimNote = (p.note || '').trim();
        const noteDateMatch = trimNote.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        const paidDateStr = noteDateMatch
          ? `${noteDateMatch[1]}/${noteDateMatch[2]}/${noteDateMatch[3]}`
          : `${dayNum}/${monthNum}/${d.getFullYear()}`;

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
          // Tách từng món trả hàng để hiển thị thành từng dòng riêng biệt như các loại thịt
          const returnItems = parseReturnItems(p.note, amt);
          returnItems.forEach(ritem => {
            dayMap[dateKey].entries.push(ritem);
          });
        } else {
          totalPaymentAmount += amt;
          // Tiền đã thu: chỉ hiển thị "ĐÃ THU" (không kèm ngày để khách không nhầm là chỉ thu cho ngày đó)
          const payName = 'ĐÃ THU';

          dayMap[dateKey].entries.push({
            type: 'PAYMENT',
            name: payName,
            quantity: null,
            price: null,
            amount: amt,
          });
        }
      });

      // Lọc các ngày thực sự có phát sinh dữ liệu
      const activeDays = Object.values(dayMap).filter(d => d.entries && d.entries.length > 0);
      // Sắp xếp theo ngày tăng dần (từ đầu tháng đến cuối tháng)
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

      // Tính danh sách các ngày không phát sinh công nợ trong khoảng ngày đã chọn
      // KHÔNG liệt kê các ngày trong tương lai chưa tới
      const deliveryDateKeys = new Set(
        sortedDays.filter(d => (d.entries || []).some(e => e.type === 'DELIVERY')).map(d => d.dateKey)
      );
      const emptyDays = [];
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      if (fromD && toD) {
        // Chỉ xét nếu khoảng ngày bắt đầu trước hoặc bằng ngày hôm nay
        if (fromD <= today) {
          const cur = new Date(fromD);
          cur.setHours(0, 0, 0, 0);
          // Giới hạn ngày tối đa là ngày hôm nay, không liệt kê ngày tương lai
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
        // maxDay đã được chặn bởi currentDay nếu là tháng hiện tại
        for (let day = 1; day <= maxDay; day++) {
          const dStr = day.toString().padStart(2, '0');
          const mStr = mm.toString().padStart(2, '0');
          const dateKey = `${dStr}/${mStr}/${yyyy}`;
          if (!deliveryDateKeys.has(dateKey)) {
            emptyDays.push(`${dStr}/${mStr}`);
          }
        }
      }

      // Tính toán toàn bộ công nợ thực tế trong cả tháng của khách hàng
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

      // Lưu state phục vụ Excel & thống kê
      setRows(sortedDays);
      setTotalDebtInMonth(totalMeatAmount);
      setTotalPaymentInMonth(totalPaymentAmount);
      setTotalReturnInMonth(totalReturnAmount);
      setTotalWholeMonthDebt(wholeMonthDebt);

      // Nếu không có bất kỳ giao dịch nào
      if (sortedDays.length === 0) {
        setGenerating(false);
        setImageUri(null);
        return;
      }

      const totalEntriesCount = sortedDays.reduce((sum, d) => sum + d.entries.length, 0);

      // ─── THIẾT KẾ BẢNG VẼ CANVAS 2 CỘT CHUẨN ĐỒ HỌA CAO CẤP (PREMIUM INVOICE) ───
      // Tăng lề 2 bên rìa trái và phải (từ 20 lên 36) để các bảng co vào trong, không bị sát mép ảnh
      const startX = 36;
      // Cột: [Ngày: 60px, Tên hàng: 200px, SL (KG): 65px, Đơn giá: 100px, Thành tiền: 135px]
      const colWidths = [60, 200, 65, 100, 135]; // Tổng chiều rộng 1 panel: 560px
      const panelWidth = colWidths.reduce((a, b) => a + b, 0); // 560px
      const panelGap = 16;
      // Chỉ khi có trên 10 phần tử công nợ (ngày phát sinh giao dịch) mới chia đôi cột bảng
      // Nếu <= 10 phần tử công nợ: Giữ 1 CỘT DUY NHẤT để hóa đơn đứng dọc đẹp, chữ to rõ ràng
      const isSplit = sortedDays.length > 10;
      const canvasWidth = isSplit ? (startX * 2 + panelWidth * 2 + panelGap) : (startX * 2 + panelWidth);

      // Chia danh sách ngày thành 2 cột bảng (trái và phải) nếu trên 10 phần tử
      let leftDays = [];
      let rightDays = [];

      if (!isSplit) {
        // <= 10 phần tử công nợ: Trình bày 1 cột duy nhất
        leftDays = sortedDays;
        rightDays = [];
      } else {
        // > 10 phần tử công nợ: Tự động chia đôi thành 2 cột trái/phải
        // Không cắt giữa các dòng của cùng 1 ngày, tìm vị trí chia ngày tối ưu nhất
        // sao cho độ chênh lệch số dòng giữa 2 cột là nhỏ nhất tuyệt đối (chỉ 1-2 dòng)
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

      // Chiều cao dòng chuẩn hóa đơn kế toán, cân đối thanh lịch
      const rowHeight = 34;
      const tableHeaderHeight = 38;
      // Tăng kích thước chiều cao dòng tổng kết để thoáng và chữ to hơn
      const summaryRowHeight = 46;
      const startTableY = 78;

      const leftEntriesCount = leftDays.reduce((sum, d) => sum + d.entries.length, 0);
      const rightEntriesCount = rightDays.reduce((sum, d) => sum + d.entries.length, 0);
      const maxRowsInCol = Math.max(leftEntriesCount, rightEntriesCount, 1);
      const tableContentHeight = maxRowsInCol * rowHeight;

      // Các dòng tổng kết cuối bảng:
      // 1. Tổng tiền hàng (mở ngoặc ngày đang lọc)
      // 2. Tiền hàng trả về (nếu > 0)
      // 3. Tiền đã thu (nếu > 0)
      // 4. Còn lại phải thu (mở ngoặc ngày đang lọc)
      // 5. Tổng công nợ cả tháng (chỉ thêm khi lọc khoảng ngày trong tháng, lọc cả tháng thì bỏ)
      const summaryRowsCount = 1 + (totalReturnAmount > 0 ? 1 : 0) + (totalPaymentAmount > 0 ? 1 : 0) + 1 + (!isFullMonth ? 1 : 0);
      const summaryHeight = summaryRowsCount * summaryRowHeight;
      const summaryStartY = startTableY + tableHeaderHeight + tableContentHeight + 16;

      // Chiều cao bổ sung cho dòng ghi chú ngày không lấy hàng nếu là bảng 1 cột
      const emptyDaysHeight = (!isSplit && emptyDays.length > 0) ? 28 : 0;
      const canvasHeight = summaryStartY + summaryHeight + emptyDaysHeight + 30;

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

      // ─── PHẦN TIÊU ĐỀ KHÁCH HÀNG: CARD BO GÓC TRANG NHÃ ───
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

      // Hàm vẽ 1 panel bảng (gồm Header và các dòng)
      const drawPanel = (panelDays, panelStartX) => {
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
        ctx.fillText('NGÀY', pColX[0] + colWidths[0] / 2, hMid);

        ctx.textAlign = 'left';
        ctx.fillText('TÊN HÀNG', pColX[1] + 8, hMid);

        ctx.textAlign = 'right';
        ctx.fillText('SL (KG)', pColX[2] + colWidths[2] - 8, hMid);
        ctx.fillText('ĐƠN GIÁ', pColX[3] + colWidths[3] - 8, hMid);
        ctx.fillText('THÀNH TIỀN', pColX[4] + colWidths[4] - 8, hMid);

        panelY += tableHeaderHeight;

        // 2. Các dòng dữ liệu
        panelDays.forEach((day) => {
          const dayHeight = day.entries.length * rowHeight;
          const dayStartY = panelY;

          day.entries.forEach((entry, idx) => {
            const itemY = dayStartY + idx * rowHeight;
            const midY = itemY + rowHeight / 2;

            const isDayTotal = entry.type === 'DAY_TOTAL';

            // Nền trắng (dòng tổng ngày dùng nền xám rất nhạt)
            ctx.fillStyle = isDayTotal ? '#F8FAFC' : '#FFFFFF';
            ctx.fillRect(panelStartX, itemY, panelWidth, rowHeight);

            // Đường viền trên phân cách giữa danh sách thịt và dòng tổng
            if (isDayTotal) {
              ctx.strokeStyle = '#CBD5E1';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(pColX[1], itemY);
              ctx.lineTo(panelStartX + panelWidth, itemY);
              ctx.stroke();
            }

            // Cột 1: Tên hàng
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

            // Cột 2: Số lượng
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
              if (entry.type === 'RETURN') {
                ctx.fillStyle = '#DC2626';
              } else {
                ctx.fillStyle = '#0F172A';
              }
              ctx.font = '14px Arial, sans-serif';
              ctx.fillText(qtyText, pColX[2] + colWidths[2] - 8, midY);
            }

            // Cột 3: Đơn giá
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
              if (entry.type === 'RETURN') {
                ctx.fillStyle = '#DC2626';
                ctx.font = 'bold 14.5px Arial, sans-serif';
              } else {
                ctx.fillStyle = '#0F172A';
                ctx.font = 'bold 14.5px Arial, sans-serif';
              }
              ctx.fillText(priceText, pColX[3] + colWidths[3] - 8, midY);
            }

            // Cột 4: Thành tiền
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

            // Đường kẻ ngang giữa các món trong ngày (rất mảnh nhẹ)
            if (idx < day.entries.length - 1) {
              ctx.strokeStyle = '#F1F5F9';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(pColX[1], itemY + rowHeight);
              ctx.lineTo(panelStartX + panelWidth, itemY + rowHeight);
              ctx.stroke();
            }
          });

          // Kẻ dọc giữa các cột cho toàn ngày này
          ctx.strokeStyle = '#CBD5E1';
          ctx.lineWidth = 1;
          for (let c = 1; c < pColX.length; c++) {
            ctx.beginPath();
            ctx.moveTo(pColX[c], dayStartY);
            ctx.lineTo(pColX[c], dayStartY + dayHeight);
            ctx.stroke();
          }

          // Cột 0: Ô ngày gộp chung (nền xám nhẹ làm nổi bật ngày)
          ctx.fillStyle = '#F8FAFC';
          ctx.fillRect(pColX[0], dayStartY, colWidths[0], dayHeight);
          ctx.strokeStyle = '#CBD5E1';
          ctx.strokeRect(pColX[0], dayStartY, colWidths[0], dayHeight);

          // Chữ ngày căn giữa (Chữ nét thường, 13.5px)
          ctx.fillStyle = '#334155';
          ctx.font = '13.5px Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(day.displayDate, pColX[0] + colWidths[0] / 2, dayStartY + dayHeight / 2);

          // Đường kẻ ngang phân tách giữa các ngày (đậm và rõ hơn)
          ctx.strokeStyle = '#94A3B8';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(panelStartX, dayStartY + dayHeight);
          ctx.lineTo(panelStartX + panelWidth, dayStartY + dayHeight);
          ctx.stroke();

          panelY += dayHeight;
        });

        // Viền bao quanh toàn bộ panel (mảnh, sắc nét)
        ctx.strokeStyle = '#64748B';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(panelStartX, startTableY, panelWidth, panelY - startTableY);

        return panelY;
      };

      // Vẽ Panel Trái (Cột 1)
      const leftEndY = drawPanel(leftDays, startX);

      // Vẽ Panel Phải (Cột 2) nếu có chia đôi
      let rightEndY = leftEndY;
      if (isSplit && rightDays.length > 0) {
        const rightStartX = startX + panelWidth + panelGap;
        rightEndY = drawPanel(rightDays, rightStartX);
      }

      // ─── PHẦN TỔNG KẾT CUỐI BẢNG (CHUẨN KẾ TOÁN SANG TRỌNG) ───
      // Đặt khối tổng kết ở bên phải (dưới Cột 2 nếu chia đôi, hoặc dưới Cột 1 nếu không chia)
      const summaryStartX = isSplit ? (startX + panelWidth + panelGap) : startX;
      // Tăng chiều rộng cột trái lên 350px để nhãn kèm ngày hiển thị thoải mái
      const summaryColLeftWidth = 350;
      let curSummaryY = summaryStartY;

      // Chuỗi hiển thị khoảng ngày đang lọc (ví dụ: 01/08 - 15/08)
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

      // Dòng 1: TỔNG TIỀN HÀNG (Mở ngoặc thêm ngày đang lọc)
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

      // Dòng 3: CÁC KHOẢN ĐÃ THU (Chỉ hiển thị "ĐÃ THU:", không hiển thị ngày để khách không nhầm là chỉ thu của ngày đó)
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

      // Dòng 4: CÒN LẠI PHẢI THU (Mở ngoặc thêm ngày đang lọc)
      const finalDebt = Math.max(0, totalMeatAmount - totalReturnAmount - totalPaymentAmount);
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

      ctx.fillStyle = '#1E3A8A';
      ctx.font = 'bold 14.5px Arial, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(debtLabel, summaryStartX + summaryColLeftWidth - 10, curSummaryY + summaryRowHeight / 2);

      ctx.fillStyle = finalDebt > 0 ? '#DC2626' : '#059669';
      ctx.font = 'bold 20.5px Arial, sans-serif';
      ctx.fillText(`${new Intl.NumberFormat('vi-VN').format(finalDebt)} đ`, summaryStartX + panelWidth - 10, curSummaryY + summaryRowHeight / 2);
      curSummaryY += summaryRowHeight;

      // Dòng 5: TỔNG CÔNG NỢ CẢ THÁNG (Chỉ hiển thị khi lọc khoảng ngày, nếu lọc cả tháng thì bỏ vì đã có dòng Còn lại phải thu)
      if (!isFullMonth) {
        const wholeMonthLabel = monthStr ? `TỔNG CÔNG NỢ CẢ THÁNG (Tháng ${monthStr}):` : 'TỔNG CÔNG NỢ CẢ THÁNG:';
        ctx.fillStyle = '#FEF2F2';
        ctx.fillRect(summaryStartX, curSummaryY, panelWidth, summaryRowHeight);
        ctx.strokeStyle = '#FECACA';
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

      // Viền khung ngoài khối tổng kết
      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(summaryStartX, summaryStartY, panelWidth, curSummaryY - summaryStartY);

      // ─── LIỆT KÊ CÁC NGÀY KHÔNG PHÁT SINH CÔNG NỢ (LIỆT KÊ BÌNH THƯỜNG, KHÔNG DÙNG BẢNG) ───
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

      // Xuất Base64 ảnh
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
      const rangeText = (fromDate && toDate) ? `(TỪ ${fromDate} ĐẾN ${toDate})` : `THÁNG ${selectedMonth}`;
      csvContent += `BẢNG KÊ TIỀN HÀNG & CÔNG NỢ ${rangeText}\r\n`;
      csvContent += `Khách hàng: ${customer?.name}\r\n`;
      csvContent += `Số ĐT: ${customer?.phone || 'Chưa lưu'}\r\n\r\n`;

      // Tiêu đề cột
      csvContent += 'Ngày,Tên hàng,Số lượng (kg),Đơn giá (đ),Thành tiền (đ)\r\n';

      // Duyệt qua từng ngày và từng món
      rows.forEach(day => {
        (day.entries || []).forEach((entry, idx) => {
          const dateStr = idx === 0 ? day.displayDate : '';
          const nameStr = `"${entry.name.replace(/"/g, '""')}"`;
          const qtyStr = entry.quantity !== null && entry.quantity !== undefined ? entry.quantity : '';
          const priceStr = entry.price ? Math.round(entry.price) : '';
          let amtStr = Math.round(entry.amount);
          if (entry.type === 'RETURN' || entry.type === 'PAYMENT') {
            amtStr = -amtStr;
          }

          csvContent += `${dateStr},${nameStr},${qtyStr},${priceStr},${amtStr}\r\n`;
        });
      });

      // Chuỗi hiển thị khoảng ngày đang lọc (ví dụ: 01/08 - 15/08)
      let filterRangeStr = '';
      if (fromDate && toDate) {
        if (fromDate === toDate) {
          filterRangeStr = fromDate.substring(0, 5);
        } else {
          filterRangeStr = `${fromDate.substring(0, 5)} - ${toDate.substring(0, 5)}`;
        }
      } else if (selectedMonth) {
        filterRangeStr = `Tháng ${selectedMonth}`;
      }

      const fromD = parseDDMMYYYY(fromDate, false);
      const toD = parseDDMMYYYY(toDate, true);
      const isFull = fromD && toD &&
        fromD.getDate() === 1 &&
        fromD.getMonth() === toD.getMonth() &&
        fromD.getFullYear() === toD.getFullYear() &&
        toD.getDate() === new Date(toD.getFullYear(), toD.getMonth() + 1, 0).getDate();

      // Phần tổng kết báo cáo
      csvContent += '\r\n';
      csvContent += `,,,TỔNG TIỀN HÀNG${filterRangeStr ? ` (${filterRangeStr})` : ''},${totalDebtInMonth}\r\n`;
      if (totalReturnInMonth > 0) {
        csvContent += `,,,TIỀN HÀNG TRẢ VỀ,-${totalReturnInMonth}\r\n`;
      }
      if (totalPaymentInMonth > 0) {
        csvContent += `,,,TIỀN ĐÃ THANH TOÁN,-${totalPaymentInMonth}\r\n`;
      }
      csvContent += `,,,CÒN LẠI PHẢI THU${filterRangeStr ? ` (${filterRangeStr})` : ''},${Math.max(0, totalDebtInMonth - totalReturnInMonth - totalPaymentInMonth)}\r\n`;
      if (!isFull) {
        csvContent += `,,,TỔNG CÔNG NỢ CẢ THÁNG (Tháng ${selectedMonth}),${totalWholeMonthDebt}\r\n`;
      }

      // Tải tệp tin về trình duyệt
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeName = customer?.name?.replace(/\s+/g, '_') || 'Khach';
      const safeRange = (fromDate && toDate)
        ? `${fromDate.replace(/\//g, '-')}_den_${toDate.replace(/\//g, '-')}`
        : selectedMonth.replace('/', '-');
      link.download = `BangKe_CongNo_${safeName}_${safeRange}.csv`;
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

  // Xử lý hành động tương ứng theo 3 trường hợp người dùng yêu cầu:
  // 1. Web PC -> Tải file ảnh trực tiếp về máy tính
  // 2. Web Mobile + Khách có SĐT -> Chuyển tiếp ảnh vào Zalo
  // 3. Web Mobile + Khách không có SĐT -> Phóng to full ảnh vừa vặn chiều ngang và hướng dẫn chụp ảnh màn hình
  const handleDownloadImage = async () => {
    if (!imageUri || Platform.OS !== 'web') return;

    const isMobileDevice = typeof navigator !== 'undefined' && 
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const cleanPhone = (customer?.phone || '').replace(/[^0-9]/g, '');
    const hasPhone = cleanPhone && cleanPhone.length >= 9;

    const safeName = customer?.name?.replace(/\s+/g, '_') || 'Khach';
    const safeRange = (fromDate && toDate)
      ? `${fromDate.replace(/\//g, '-')}_den_${toDate.replace(/\//g, '-')}`
      : selectedMonth.replace('/', '-');
    const fileName = `CongNo_${safeName}_${safeRange}.png`;

    // ── TRƯỜNG HỢP 1: WEB PC -> CHỈ CẦN TẢI ẢNH VỀ MÁY ──
    if (!isMobileDevice) {
      try {
        const blob = base64ToBlob(imageUri, 'image/png');
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
        showGlobalToast('Đã tải ảnh công nợ về máy thành công!', 'success');
      } catch (err) {
        console.error('Lỗi khi tải ảnh trên PC:', err);
        showGlobalToast('Đã xảy ra lỗi khi tải ảnh.', 'error');
      }
      return;
    }

    // ── TRƯỜNG HỢP 2: WEB MOBILE + KHÁCH CÓ SĐT -> CHUYỂN TIẾP ẢNH VÀO ZALO ──
    if (hasPhone) {
      try {
        const blob = base64ToBlob(imageUri, 'image/png');
        if (typeof navigator !== 'undefined' && navigator.share && typeof File !== 'undefined') {
          const file = new File([blob], fileName, { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({
                files: [file],
                title: `Công nợ ${customer?.name || ''}`,
                text: `Bảng kê công nợ khách hàng ${customer?.name || ''}`,
              });
              return; // Mở bảng chia sẻ thành công (người dùng chọn Zalo)
            } catch (shareErr) {
              if (shareErr.name === 'AbortError') {
                return; // Người dùng bấm Hủy
              }
              console.warn('[WebShare] Mở thẳng Zalo do lỗi chia sẻ file:', shareErr);
            }
          }
        }

        // Nếu Web Share không khả dụng hoặc muốn mở trực tiếp đoạn chat Zalo
        const zaloUrl = `https://zalo.me/${cleanPhone}`;
        if (typeof window !== 'undefined') {
          window.open(zaloUrl, '_blank');
        } else {
          Linking.openURL(zaloUrl).catch(() => {});
        }
        showGlobalToast(`Đang chuyển tiếp tới Zalo của ${customer?.name}...`, 'info');
      } catch (err) {
        console.error('Lỗi khi chuyển tiếp ảnh vào Zalo:', err);
        showGlobalToast('Không thể mở chuyển tiếp Zalo.', 'error');
      }
      return;
    }

    // ── TRƯỜNG HỢP 3: WEB MOBILE + KHÁCH KHÔNG CÓ SĐT -> ZOOM FULL ĐỂ CHỤP MÀN HÌNH ──
    imagePreviewModalRef.current?.open(imageUri, { autoFitWidth: true, isCaptureMode: true });
  };

  // Xử lý áp dụng các mốc thời gian chọn nhanh (Tháng này, Tháng trước, 1-15, 16-hết, 7 ngày, Toàn bộ)
  const handleApplyPreset = (presetKey) => {
    const range = getPresetRange(presetKey, fromDate, transactions);
    setFromDate(range.from);
    setToDate(range.to);
    generateDebtImage(transactions, payments, customer, range.from, range.to);
  };

  // Xử lý khi thay đổi từ ngày hoặc đến ngày thủ công
  const handleDateRangeChange = (newFrom, newTo) => {
    setFromDate(newFrom);
    setToDate(newTo);
    generateDebtImage(transactions, payments, customer, newFrom, newTo);
  };

  // 5. Chọn ngày để xuất tin nhắn công nợ
  const handleSelectDay = (dayKey) => {
    setSelectedDayKey(dayKey);
    const msg = buildDailyMessage(dayKey, transactions, payments, customer);
    setDailyMessageText(msg);
    setIsCopied(false);
  };

  // 6. Sao chép tin nhắn công nợ vào Clipboard
  const handleCopyMessage = async () => {
    if (!dailyMessageText) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(dailyMessageText);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = dailyMessageText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setIsCopied(true);
      showGlobalToast(`Đã sao chép tin nhắn công nợ ngày ${selectedDayKey}!`, 'success');
      setTimeout(() => setIsCopied(false), 2500);
    } catch (err) {
      console.error('Lỗi khi sao chép:', err);
      showGlobalToast('Không thể sao chép, vui lòng bôi đen và sao chép thủ công.', 'error');
    }
  };

  // 7. Chia sẻ tin nhắn qua Zalo hoặc menu hệ thống
  const handleShareMessage = async () => {
    if (!dailyMessageText) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: `Công nợ ngày ${selectedDayKey} - ${customer?.name || ''}`,
          text: dailyMessageText,
        });
      } else {
        handleCopyMessage();
      }
    } catch (err) {
      // Hủy bỏ chia sẻ
    }
  };

  // Xác định môi trường thiết bị (Mobile vs PC) và kiểm tra số điện thoại khách hàng
  const isMobileDevice = typeof navigator !== 'undefined' && 
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const cleanPhone = (customer?.phone || '').replace(/[^0-9]/g, '');
  const hasPhone = Boolean(cleanPhone && cleanPhone.length >= 9);

  return (
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)}>
        <View style={styles.modalView}>
          {/* Header modal có tiêu đề và nút đóng nhanh */}
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalTitle}>📊 XUẤT CÔNG NỢ KHÁCH HÀNG</Text>
            <TouchableOpacity
              style={styles.modalCloseIconBtn}
              onPress={() => setVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCloseIconText}>✕</Text>
            </TouchableOpacity>
          </View>

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
                onPress={() => fetchData(customer?.id, customer, selectedMonth, selectedDayKey)}
              >
                <Text style={styles.retryButtonText}>TẢI LẠI DỮ LIỆU</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
              {/* Thẻ khách hàng thiết kế dạng hồ sơ hiện đại */}
              <View style={styles.customerCard}>
                <View style={styles.customerAvatarCircle}>
                  <Text style={styles.customerAvatarText}>
                    {customer?.name ? customer.name.trim().charAt(0).toUpperCase() : '👤'}
                  </Text>
                </View>
                <View style={styles.customerInfoCol}>
                  <Text style={styles.customerCardName} numberOfLines={1}>
                    {customer?.name || 'Khách hàng'}
                  </Text>
                  <View style={styles.customerPhoneBadge}>
                    <Text style={styles.customerPhoneText}>
                      📞 {customer?.phone || 'Chưa có SĐT'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* ── 2 TABS CHUYỂN ĐỔI CHẾ ĐỘ XUẤT ── */}
              <View style={styles.tabContainer}>
                <TouchableOpacity
                  style={[styles.tabButton, activeTab === 'month' && styles.activeTabButton]}
                  onPress={() => setActiveTab('month')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabButtonText, activeTab === 'month' && styles.activeTabButtonText]}>
                    📸 Xuất bảng kê (Ảnh)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabButton, activeTab === 'day' && styles.activeTabButton]}
                  onPress={() => {
                    setActiveTab('day');
                    if (!selectedDayKey && availableDays.length > 0) {
                      handleSelectDay(availableDays[0].dateKey);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabButtonText, activeTab === 'day' && styles.activeTabButtonText]}>
                    💬 Xuất theo ngày (Tin nhắn)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* ── NỘI DUNG TAB 1: XUẤT BẢNG KÊ (DẠNG ẢNH) ── */}
              {activeTab === 'month' ? (
                <>
                  {/* BỘ LỌC KHOẢNG THỜI GIAN ĐỐI SOÁT */}
                  <View style={styles.dateFilterCard}>
                    <View style={styles.dateFilterHeader}>
                      <View style={styles.dateFilterTitleRow}>
                        <Text style={styles.dateFilterTitleIcon}>📅</Text>
                        <Text style={styles.dateFilterTitle}>KHOẢNG THỜI GIAN ĐỐI SOÁT</Text>
                      </View>
                    </View>

                    {/* Danh sách các nút chọn nhanh mốc thời gian */}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.quickFilterScroll}
                      contentContainerStyle={styles.quickFilterRow}
                    >
                      <TouchableOpacity
                        style={[
                          styles.quickChip,
                          fromDate === getPresetRange('this_month').from &&
                          toDate === getPresetRange('this_month').to &&
                          styles.activeQuickChip
                        ]}
                        onPress={() => handleApplyPreset('this_month')}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.quickChipText,
                            fromDate === getPresetRange('this_month').from &&
                            toDate === getPresetRange('this_month').to &&
                            styles.activeQuickChipText
                          ]}
                        >
                          Tháng này
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.quickChip,
                          fromDate === getPresetRange('last_month').from &&
                          toDate === getPresetRange('last_month').to &&
                          styles.activeQuickChip
                        ]}
                        onPress={() => handleApplyPreset('last_month')}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.quickChipText,
                            fromDate === getPresetRange('last_month').from &&
                            toDate === getPresetRange('last_month').to &&
                            styles.activeQuickChipText
                          ]}
                        >
                          Tháng trước
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.quickChip,
                          fromDate === getPresetRange('first_half', fromDate).from &&
                          toDate === getPresetRange('first_half', fromDate).to &&
                          styles.activeQuickChip
                        ]}
                        onPress={() => handleApplyPreset('first_half')}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.quickChipText,
                            fromDate === getPresetRange('first_half', fromDate).from &&
                            toDate === getPresetRange('first_half', fromDate).to &&
                            styles.activeQuickChipText
                          ]}
                        >
                          Đầu tháng (1 - 15)
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.quickChip,
                          fromDate === getPresetRange('second_half', fromDate).from &&
                          toDate === getPresetRange('second_half', fromDate).to &&
                          styles.activeQuickChip
                        ]}
                        onPress={() => handleApplyPreset('second_half')}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.quickChipText,
                            fromDate === getPresetRange('second_half', fromDate).from &&
                            toDate === getPresetRange('second_half', fromDate).to &&
                            styles.activeQuickChipText
                          ]}
                        >
                          Cuối tháng (16 - hết)
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.quickChip,
                          fromDate === getPresetRange('last_7_days').from &&
                          toDate === getPresetRange('last_7_days').to &&
                          styles.activeQuickChip
                        ]}
                        onPress={() => handleApplyPreset('last_7_days')}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.quickChipText,
                            fromDate === getPresetRange('last_7_days').from &&
                            toDate === getPresetRange('last_7_days').to &&
                            styles.activeQuickChipText
                          ]}
                        >
                          7 ngày qua
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.quickChip,
                          fromDate === getPresetRange('all', fromDate, transactions).from &&
                          toDate === getPresetRange('all', fromDate, transactions).to &&
                          styles.activeQuickChip
                        ]}
                        onPress={() => handleApplyPreset('all')}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.quickChipText,
                            fromDate === getPresetRange('all', fromDate, transactions).from &&
                            toDate === getPresetRange('all', fromDate, transactions).to &&
                            styles.activeQuickChipText
                          ]}
                        >
                          Toàn bộ
                        </Text>
                      </TouchableOpacity>
                    </ScrollView>

                    {/* Hàng 2 ô chọn ngày Từ ngày ➔ Đến ngày */}
                    <View style={styles.dateInputsRow}>
                      <View style={styles.dateInputCol}>
                        <Text style={styles.dateInputSubLabel}>Từ ngày</Text>
                        <DatePickerInput
                          value={fromDate}
                          onChange={(val) => handleDateRangeChange(val, toDate)}
                          allowFuture={true}
                          compact={true}
                          style={styles.compactDatePicker}
                        />
                      </View>

                      <View style={styles.dateInputDivider}>
                        <Text style={styles.dateInputDividerText}>➔</Text>
                      </View>

                      <View style={styles.dateInputCol}>
                        <Text style={styles.dateInputSubLabel}>Đến ngày</Text>
                        <DatePickerInput
                          value={toDate}
                          onChange={(val) => handleDateRangeChange(fromDate, val)}
                          allowFuture={true}
                          compact={true}
                          style={styles.compactDatePicker}
                        />
                      </View>
                    </View>
                  </View>

                  {/* TRẠNG THÁI ĐANG VẼ ẢNH HOẶC KHÔNG CÓ DỮ LIỆU */}
                  {generating ? (
                    <View style={styles.generatingBox}>
                      <ActivityIndicator size="small" color={COLORS.primary} />
                      <Text style={styles.generatingText}>Đang vẽ ảnh công nợ...</Text>
                    </View>
                  ) : !imageUri ? (
                    <View style={styles.noImagePlaceholder}>
                      <Text style={styles.placeholderText}>
                        Không có giao dịch hoặc khoản thu nào trong khoảng ngày đã chọn.
                      </Text>
                    </View>
                  ) : null}

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
                  {imageUri && !generating && (
                    <View style={styles.previewBox}>
                      <View style={styles.previewHeaderRow}>
                        <Text style={styles.sectionLabelInline}>Bảng ảnh xem trước:</Text>
                        <View style={styles.inlineButtonsGroup}>
                          <TouchableOpacity
                            style={styles.previewZoomButtonInline}
                            onPress={() => imagePreviewModalRef.current?.open(imageUri, { autoFitWidth: isMobileDevice })}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.previewZoomButtonText}>
                              🔍 PHÓNG TO
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.downloadButtonInline,
                              isMobileDevice
                                ? (hasPhone ? styles.zaloActiveColor : styles.captureActiveColor)
                                : styles.normalActiveColor
                            ]}
                            onPress={handleDownloadImage}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.downloadButtonInlineText}>
                              {isMobileDevice
                                ? (hasPhone ? '💬 CHUYỂN TIẾP ZALO' : '📸 CHỤP MÀN HÌNH')
                                : '💾 TẢI ẢNH VỀ MÁY'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={styles.imageShadowFrame}
                        activeOpacity={0.9}
                        onPress={() => imagePreviewModalRef.current?.open(imageUri, { autoFitWidth: isMobileDevice })}
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
                        {isMobileDevice
                          ? (hasPhone
                              ? '💡 Khách có SĐT: Bấm "💬 CHUYỂN TIẾP ZALO" để gửi ảnh bảng kê trực tiếp vào Zalo khách hàng.'
                              : '💡 Khách chưa có SĐT: Bấm "📸 CHỤP MÀN HÌNH" để phóng to full ảnh sắc nét và chụp ảnh màn hình lưu vào Thư viện ảnh.')
                          : '💡 Trên máy tính: Bấm "💾 TẢI ẢNH VỀ MÁY" để tải file ảnh bảng kê PNG về máy.'}
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                /* ── NỘI DUNG TAB 2: XUẤT THEO NGÀY (TIN NHẮN COPY) ── */
                <View style={styles.dayTabContent}>
                  <Text style={styles.sectionLabel}>📅 Chọn ngày cần xuất tin nhắn:</Text>

                  {availableDays.length === 0 ? (
                    <Text style={styles.noMonthsText}>
                      Khách hàng này chưa có phát sinh giao dịch nào.
                    </Text>
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.monthScroll}
                      contentContainerStyle={styles.monthScrollContent}
                    >
                      {availableDays.map((d) => (
                        <TouchableOpacity
                          key={d.dateKey}
                          style={[styles.dayItem, selectedDayKey === d.dateKey && styles.activeDayItem]}
                          onPress={() => handleSelectDay(d.dateKey)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.dayItemText, selectedDayKey === d.dateKey && styles.activeDayItemText]}>
                            {d.dateKey}
                          </Text>
                          {d.totalDebt > 0 && (
                            <Text style={[styles.dayItemSubText, selectedDayKey === d.dateKey && styles.activeDayItemSubText]}>
                              {formatCurrency(d.totalDebt)}
                            </Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}

                  {/* Chọn ngày tùy ý qua DatePicker */}
                  <View style={styles.customDateRow}>
                    <Text style={styles.customDateLabel}>Hoặc chọn ngày khác:</Text>
                    <View style={{ flex: 1 }}>
                      <DatePickerInput
                        value={selectedDayKey}
                        onChange={(newDate) => handleSelectDay(newDate)}
                        allowFuture={true}
                      />
                    </View>
                  </View>

                  {/* KHUNG XEM TRƯỚC VÀ CHỈNH SỬA TIN NHẮN */}
                  <View style={styles.messageBox}>
                    <View style={styles.messageHeaderRow}>
                      <Text style={styles.messageBoxTitle}>
                        📝 Tin nhắn ({selectedDayKey}):
                      </Text>
                      <Text style={styles.messageBoxHint}>Chạm vào để sửa trước khi gửi</Text>
                    </View>

                    <TextInput
                      style={styles.messageInput}
                      multiline
                      value={dailyMessageText}
                      onChangeText={setDailyMessageText}
                      placeholder="Nội dung tin nhắn công nợ..."
                      placeholderTextColor="#94A3B8"
                      textAlignVertical="top"
                    />

                    {/* NÚT THAO TÁC SAO CHÉP VÀ GỬI ZALO */}
                    <View style={styles.messageActionsRow}>
                      <TouchableOpacity
                        style={[styles.copyMessageButton, isCopied && styles.copiedButton]}
                        onPress={handleCopyMessage}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.copyMessageButtonText}>
                          {isCopied ? '✅ ĐÃ SAO CHÉP' : '📋 SAO CHÉP TIN NHẮN'}
                        </Text>
                      </TouchableOpacity>

                      {Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share ? (
                        <TouchableOpacity
                          style={styles.shareMessageButton}
                          onPress={handleShareMessage}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.shareMessageButtonText}>📤 GỬI / CHIA SẺ</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    <Text style={styles.helperText}>
                      💡 Mẹo: Bấm "SAO CHÉP TIN NHẮN" để copy nhanh, sau đó dán (Paste) vào Zalo khách hàng.
                    </Text>
                  </View>
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

      {/* Modal hiển thị ảnh phóng to toàn màn hình hỗ trợ zoom đa cấp độ */}
      <ImagePreviewModal ref={imagePreviewModalRef} />
    </>
  );
});

export default ExportDebtModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    maxHeight: '92%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 2,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  modalCloseIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseIconText: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: 'bold',
    lineHeight: 18,
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
    marginBottom: 10,
  },
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    gap: 12,
  },
  customerAvatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#059669',
  },
  customerInfoCol: {
    flex: 1,
  },
  customerCardName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 4,
  },
  customerPhoneBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  customerPhoneText: {
    fontSize: 12.5,
    color: '#475569',
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 13.5,
    fontWeight: 'bold',
    color: '#1E293B',
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
  // Nhóm các nút thao tác nhanh ở tiêu đề ảnh xem trước
  inlineButtonsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Nút xem phóng to ảnh
  previewZoomButtonInline: {
    backgroundColor: '#3B82F6', // Màu xanh dương nổi bật
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  previewZoomButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
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
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  // Nền màu tím chụp màn hình khi mobile không có SĐT
  captureActiveColor: {
    backgroundColor: '#7C3AED',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
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
    position: 'relative',
    cursor: Platform.OS === 'web' ? 'zoom-in' : undefined,
    ...SHADOWS.card,
  },
  zoomImageOverlayBadge: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  zoomImageOverlayText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  previewImage: {
    width: '100%',
    height: 560,
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
  // ─── STYLES CHO BỘ LỌC KHOẢNG NGÀY ĐỐI SOÁT ───
  dateFilterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    ...SHADOWS.card,
  },
  dateFilterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dateFilterTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateFilterTitleIcon: {
    fontSize: 14,
  },
  dateFilterTitle: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#334155',
    letterSpacing: 0.3,
  },
  quickFilterScroll: {
    marginBottom: 12,
  },
  quickFilterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 6,
  },
  quickChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  activeQuickChip: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
    borderWidth: 1.5,
  },
  quickChipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  activeQuickChipText: {
    color: '#059669',
    fontWeight: 'bold',
  },
  dateInputsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dateInputCol: {
    flex: 1,
  },
  dateInputSubLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  compactDatePicker: {
    height: 42,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    justifyContent: 'center',
    marginBottom: 0,
  },
  dateInputDivider: {
    paddingTop: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateInputDividerText: {
    fontSize: 16,
    color: '#94A3B8',
    fontWeight: 'bold',
  },
  // ─── STYLES CHO 2 TABS & XUẤT THEO NGÀY ───
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  activeTabButton: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  activeTabButtonText: {
    color: '#059669',
    fontWeight: 'bold',
  },
  dayTabContent: {
    marginTop: 2,
  },
  dayItem: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  activeDayItem: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  dayItemText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#334155',
  },
  activeDayItemText: {
    color: '#059669',
  },
  dayItemSubText: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  activeDayItemSubText: {
    color: '#059669',
    fontWeight: '700',
  },
  customDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 14,
    gap: 8,
  },
  customDateLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  messageBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    ...SHADOWS.card,
  },
  messageHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  messageBoxTitle: {
    fontSize: 13.5,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  messageBoxHint: {
    fontSize: 11.5,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  messageInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    fontSize: 13.5,
    color: '#0F172A',
    minHeight: 180,
    maxHeight: 260,
    lineHeight: 22,
  },
  messageActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    marginBottom: 8,
  },
  copyMessageButton: {
    flex: 1,
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
  copiedButton: {
    backgroundColor: '#047857',
  },
  copyMessageButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: 'bold',
    letterSpacing: 0.2,
  },
  shareMessageButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
  shareMessageButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
});
