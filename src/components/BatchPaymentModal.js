// meat-management-fe/src/components/BatchPaymentModal.js
import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import MoneyInput from './MoneyInput';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import SmoothModal from './SmoothModal';
import DatePickerInput from './DatePickerInput';
import PinInputModal from './PinInputModal';
import PinSetupModal from './PinSetupModal';
import CustomSelect from './CustomSelect';
import { api } from '../api/client';
import { COLORS, SHADOWS } from '../theme';
import { useCustomerGroups } from '../hooks/useCustomerGroups';
import { hasPin, isSessionValid } from '../store/pinStore';
import { showGlobalToast } from '../store/toastStore';
import * as SecureStore from 'expo-secure-store';

// --- Key lưu bản nháp thu nợ hàng loạt ---
const BATCH_PAYMENT_DRAFT_KEY = 'meat_batch_payment_draft';

// Helper định dạng số hàng nghìn dấu chấm
const formatNumberString = (value) => {
  if (value === undefined || value === null) return '';
  const clean = String(value).replace(/[^0-9]/g, '');
  if (clean === '') return '';
  return new Intl.NumberFormat('vi-VN').format(parseInt(clean, 10));
};

const parseNumberString = (formatted) => {
  if (!formatted) return 0;
  const clean = String(formatted).replace(/[^0-9]/g, '');
  return clean ? parseInt(clean, 10) : 0;
};

// Helper định dạng tiền tệ VNĐ
const formatCurrency = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
    .format(amount || 0)
    .replace('₫', 'đ');

// Helper lấy ngày hôm nay định dạng DD/MM/YYYY
const getTodayFormatted = () => {
  const today = new Date();
  const d = String(today.getDate()).padStart(2, '0');
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const y = today.getFullYear();
  return `${d}/${m}/${y}`;
};

// Helper chuyển chuỗi DD/MM/YYYY thành ISO string
const parseDateString = (str) => {
  if (!str) return null;
  const parts = str.trim().split(/[\/\-]/);
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  const dateObj = new Date(year, month - 1, day);
  if (
    dateObj.getFullYear() !== year ||
    dateObj.getMonth() !== month - 1 ||
    dateObj.getDate() !== day
  ) return null;
  return dateObj.toISOString();
};

// Helper lưu nháp thu nợ đa nền tảng
const saveDraftCache = async (data) => {
  try {
    const jsonValue = JSON.stringify(data);
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(BATCH_PAYMENT_DRAFT_KEY, jsonValue);
      }
    } else {
      await SecureStore.setItemAsync(BATCH_PAYMENT_DRAFT_KEY, jsonValue);
    }
  } catch (e) {
    console.error('Lỗi lưu nháp batch payment:', e);
  }
};

// Helper đọc nháp thu nợ đa nền tảng
const loadDraftCache = async () => {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(BATCH_PAYMENT_DRAFT_KEY);
        return raw ? JSON.parse(raw) : null;
      }
    } else {
      const raw = await SecureStore.getItemAsync(BATCH_PAYMENT_DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    }
  } catch (e) {
    console.error('Lỗi đọc nháp batch payment:', e);
  }
  return null;
};

// Helper xóa nháp thu nợ đa nền tảng
const clearDraftCache = async () => {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(BATCH_PAYMENT_DRAFT_KEY);
      }
    } else {
      await SecureStore.deleteItemAsync(BATCH_PAYMENT_DRAFT_KEY);
    }
  } catch (e) {
    console.error('Lỗi xóa nháp batch payment:', e);
  }
};

// Helper sinh danh sách các tháng gần nhất cho bộ lọc nợ
const generateMonthOptions = () => {
  const options = [{ id: 'all', name: '🗓️ Toàn bộ thời gian (Tổng nợ)', shortLabel: 'Toàn bộ nợ' }];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const y = d.getFullYear();
    const monthKey = `${m}/${y}`;
    const label = i === 0 ? `Tháng ${monthKey} (Tháng này)` : i === 1 ? `Tháng ${monthKey} (Tháng trước)` : `Tháng ${monthKey}`;
    options.push({ id: monthKey, name: `📅 ${label}`, shortLabel: `Tháng ${monthKey}` });
  }
  return options;
};
const MONTH_OPTIONS = generateMonthOptions();

const BatchPaymentModal = forwardRef(({ onRefresh, currentUserId }, ref) => {
  const [visible, setVisible] = useState(false);
  const [dateStr, setDateStr] = useState(getTodayFormatted());
  const [selectedDebtMonth, setSelectedDebtMonth] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [customers, setCustomers] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [rows, setRows] = useState([]);
  const [activeRowTempId, setActiveRowTempId] = useState(null);

  // Quản lý trạng thái Thu nợ gộp theo nhóm nhà hàng
  const [selectedGroupId, setSelectedGroupId] = useState('none');
  const [groupLumpSum, setGroupLumpSum] = useState('');
  const [isGroupSelectOpen, setIsGroupSelectOpen] = useState(false);
  const [isMonthSelectOpen, setIsMonthSelectOpen] = useState(false);

  const { groups, refreshGroups } = useCustomerGroups(currentUserId);

  const pinInputRef = useRef(null);
  const pinSetupRef = useRef(null);
  const mainScrollRef = useRef(null);
  const isSubmittingRef = useRef(false);
  const isLoadedCacheRef = useRef(false);
  // Counter tăng dần đảm bảo tempId luôn unique
  const rowIdCounterRef = useRef(1);

  // Helper lấy số nợ hiệu lực của khách hàng (theo tháng đang chọn hoặc toàn bộ)
  const getCustEffectiveDebt = (c, monthVal = selectedDebtMonth) => {
    if (!c) return 0;
    if (monthVal && monthVal !== 'all' && c.monthDebt !== undefined) {
      return Math.round(Math.max(0, c.monthDebt || 0));
    }
    return Math.round(Math.max(0, c.debt || 0));
  };

  // Phơi bày hàm điều khiển ra bên ngoài
  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true);
      setDateStr(getTodayFormatted());
      setSelectedDebtMonth('all');
      setError('');
      setSelectedGroupId('none');
      setGroupLumpSum('');
      isLoadedCacheRef.current = false;
      fetchData(null, 'all');
      refreshGroups();
    },
    openWithGroup: (targetGroup) => {
      setVisible(true);
      setDateStr(getTodayFormatted());
      setSelectedDebtMonth('all');
      setError('');
      setGroupLumpSum('');
      isLoadedCacheRef.current = false;
      fetchData(targetGroup, 'all');
      refreshGroups();
    },
    close: () => setVisible(false),
  }));

  // Helper tạo dòng thu nợ mới với ID luôn unique
  const createEmptyRow = (customerId = null) => ({
    tempId: `row_${Date.now()}_${Math.random().toString(36).slice(2, 9)}_${rowIdCounterRef.current++}`,
    selectedCustomerId: customerId,
    amount: '',
    amountVND: 0,
  });

  // Khởi tạo danh sách hàng mặc định (10 hàng)
  const createInitialRows = (count = 10) =>
    Array.from({ length: count }, () => createEmptyRow());

  // Đảm bảo danh sách luôn có tối thiểu 10 hàng
  const padRowsToMin = (rowsList, count = 10) => {
    if (!Array.isArray(rowsList) || rowsList.length === 0) return createInitialRows(count);
    if (rowsList.length >= count) return rowsList;
    return [...rowsList, ...createInitialRows(count - rowsList.length)];
  };

  // Tải danh sách khách hàng từ server (kèm query month nếu có)
  const fetchData = async (targetGroup = null, monthVal = null) => {
    setLoading(true);
    setError('');
    const activeMonth = monthVal !== null ? monthVal : selectedDebtMonth;
    const monthQuery = activeMonth && activeMonth !== 'all' ? `&month=${encodeURIComponent(activeMonth)}` : '';
    try {
      const custRes = await api.get(`/customers?isBadDebt=false${monthQuery}`);
      const allCustData = custRes.data?.data || (Array.isArray(custRes.data) ? custRes.data : []);
      setAllCustomers(allCustData);

      // Chỉ lấy những khách hàng đang có nợ hiệu lực cho danh sách chọn lẻ
      const debtCustomers = allCustData.filter((c) => getCustEffectiveDebt(c, activeMonth) > 0);
      setCustomers(debtCustomers);

      // Nếu mở kèm nhóm chỉ định cụ thể
      const groupToUse = targetGroup || (selectedGroupId !== 'none' ? groups.find((g) => g.id === selectedGroupId) : null);
      if (groupToUse && groupToUse.id) {
        setSelectedGroupId(groupToUse.id);
        const memberIds = new Set(groupToUse.customerIds || []);
        const groupCusts = allCustData.filter((c) => memberIds.has(c.id));
        groupCusts.sort((a, b) => getCustEffectiveDebt(b, activeMonth) - getCustEffectiveDebt(a, activeMonth));

        if (groupCusts.length > 0) {
          const groupRows = groupCusts.map((c) => createEmptyRow(c.id));
          setRows(groupRows);
          isLoadedCacheRef.current = true;
          return;
        }
      } else {
        setSelectedGroupId('none');
      }

      // Đọc bản nháp từ cache nếu có (khi không mở theo nhóm và là toàn bộ thời gian)
      if (activeMonth === 'all') {
        const draft = await loadDraftCache();
        if (draft && Array.isArray(draft.rows) && draft.rows.length > 0) {
          const seenIds = new Set();
          const uniqueDraftRows = draft.rows.map((r) => {
            const isDup = !r.tempId || seenIds.has(r.tempId);
            const tempId = isDup
              ? `row_${Date.now()}_${Math.random().toString(36).slice(2, 9)}_${rowIdCounterRef.current++}`
              : r.tempId;
            seenIds.add(tempId);
            return { ...r, tempId };
          });
          setRows(padRowsToMin(uniqueDraftRows, 10));
          if (draft.dateStr) setDateStr(draft.dateStr);
          isLoadedCacheRef.current = true;
          return;
        }
      }

      // Khởi tạo sẵn 10 dòng trống ban đầu
      setRows(createInitialRows(10));
      isLoadedCacheRef.current = true;
    } catch (err) {
      console.error('[BATCH PAYMENT FETCH ERROR]', err);
      setError('Không thể tải danh sách khách hàng.');
    } finally {
      setLoading(false);
    }
  };

  // Tự động lưu bản nháp khi rows, dateStr thay đổi (chỉ lưu khi thu lẻ)
  useEffect(() => {
    if (!visible || !isLoadedCacheRef.current || selectedGroupId !== 'none') return;
    const hasData = rows.some((r) => r.selectedCustomerId || parseNumberString(r.amount) > 0);
    if (hasData) {
      saveDraftCache({
        rows,
        dateStr,
        savedAt: new Date().toISOString(),
      });
    }
  }, [rows, dateStr, visible, selectedGroupId]);

  // Xóa toàn bộ nháp
  const handleClearDraft = async () => {
    await clearDraftCache();
    setRows(createInitialRows(10));
    setSelectedGroupId('none');
    setGroupLumpSum('');
    setError('');
  };

  // Thay đổi tháng lọc công nợ
  const handleSelectMonth = async (monthId) => {
    setSelectedDebtMonth(monthId);
    setGroupLumpSum('');
    setError('');
    const targetGroup = selectedGroupId !== 'none' ? groups.find((g) => g.id === selectedGroupId) : null;
    await fetchData(targetGroup, monthId);
  };

  // Chọn nhóm nhà hàng từ dropdown
  const handleSelectGroup = (groupId) => {
    setSelectedGroupId(groupId);
    setGroupLumpSum('');
    setError('');

    if (groupId === 'none') {
      setRows(createInitialRows(10));
      return;
    }

    const group = groups.find((g) => g.id === groupId);
    if (!group) return;

    const memberIds = new Set(group.customerIds || []);
    const groupCusts = allCustomers.filter((c) => memberIds.has(c.id));
    // Ưu tiên quán có công nợ nhiều nhất lên đầu
    groupCusts.sort((a, b) => getCustEffectiveDebt(b) - getCustEffectiveDebt(a));

    if (groupCusts.length > 0) {
      const groupRows = groupCusts.map((c) => createEmptyRow(c.id));
      setRows(groupRows);
    } else {
      setRows(createInitialRows(10));
      setError(`Nhóm [${group.name}] hiện chưa có quán thành viên nào.`);
    }
  };

  // 1. Tự động trừ cuốn chiếu (quán nợ trước/từ trên xuống dứt điểm trước)
  const handleAutoAllocateFIFO = () => {
    const lumpSum = parseNumberString(groupLumpSum);
    if (lumpSum <= 0) {
      setError('Vui lòng nhập số tiền chuỗi chuyển khoản gộp > 0 đ.');
      return;
    }
    setError('');
    let remaining = lumpSum;
    const updated = rows.map((r) => {
      if (!r.selectedCustomerId) return r;
      const cust = allCustomers.find((c) => c.id === r.selectedCustomerId);
      const debt = getCustEffectiveDebt(cust);
      if (debt <= 0 || remaining <= 0) {
        return { ...r, amount: '', amountVND: 0 };
      }
      const pay = Math.min(debt, remaining);
      remaining -= pay;
      return {
        ...r,
        amountVND: pay,
        amount: formatNumberString(pay.toString()),
      };
    });
    setRows(updated);
    showGlobalToast(
      `Đã tự động trừ dứt điểm ${formatCurrency(lumpSum - remaining)} cho các quán từ trên xuống!`,
      'success'
    );
  };

  // 2. Phân bổ theo tỷ lệ % nợ
  const handleAutoAllocateProRata = () => {
    const lumpSum = parseNumberString(groupLumpSum);
    if (lumpSum <= 0) {
      setError('Vui lòng nhập số tiền chuỗi chuyển khoản gộp > 0 đ.');
      return;
    }
    setError('');

    // Tổng nợ của các quán trong bảng theo tháng lọc
    const totalDebt = rows.reduce((sum, r) => {
      const cust = allCustomers.find((c) => c.id === r.selectedCustomerId);
      return sum + getCustEffectiveDebt(cust);
    }, 0);

    if (totalDebt <= 0) {
      setError('Tổng công nợ của các nhà hàng hiện tại bằng 0 đ.');
      return;
    }

    let allocatedTotal = 0;
    const debtRows = rows.filter((r) => {
      const cust = allCustomers.find((c) => c.id === r.selectedCustomerId);
      return cust && getCustEffectiveDebt(cust) > 0;
    });

    const updated = rows.map((r) => {
      if (!r.selectedCustomerId) return r;
      const cust = allCustomers.find((c) => c.id === r.selectedCustomerId);
      const debt = getCustEffectiveDebt(cust);
      if (debt <= 0) return { ...r, amount: '', amountVND: 0 };

      const ratio = debt / totalDebt;
      const pay = Math.min(debt, Math.round(lumpSum * ratio));
      allocatedTotal += pay;
      return {
        ...r,
        amountVND: pay,
        amount: formatNumberString(pay.toString()),
      };
    });

    // Bù sai lệch số lẻ nếu có vào quán cuối cùng có nợ
    const diff = lumpSum - allocatedTotal;
    if (diff !== 0 && debtRows.length > 0) {
      const lastRow = debtRows[debtRows.length - 1];
      const idx = updated.findIndex((r) => r.tempId === lastRow.tempId);
      if (idx >= 0) {
        const cust = allCustomers.find((c) => c.id === updated[idx].selectedCustomerId);
        const curAmt = updated[idx].amountVND || 0;
        const maxDebt = getCustEffectiveDebt(cust);
        const adjusted = Math.min(maxDebt, Math.max(0, curAmt + diff));
        updated[idx] = {
          ...updated[idx],
          amountVND: adjusted,
          amount: formatNumberString(adjusted.toString()),
        };
      }
    }

    setRows(updated);
    showGlobalToast(
      `Đã phân bổ ${formatCurrency(Math.min(lumpSum, totalDebt))} theo tỷ lệ % nợ cho các quán!`,
      'success'
    );
  };

  // 3. Xóa số tiền của các dòng
  const handleClearGroupAmounts = () => {
    const cleared = rows.map((r) => ({ ...r, amount: '', amountVND: 0 }));
    setRows(cleared);
  };

  // Thêm dòng khách hàng trả nợ
  const handleAddRow = () => {
    setRows((prev) => [...prev, createEmptyRow()]);
    setTimeout(() => {
      mainScrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  // Xóa 1 dòng
  const handleRemoveRow = (tempId) => {
    setRows((prev) => prev.filter((r) => r.tempId !== tempId));
  };

  // Cập nhật 1 dòng
  const handleUpdateRow = (tempId, updates) => {
    setRows((prev) =>
      prev.map((r) => (r.tempId === tempId ? { ...r, ...updates } : r))
    );
  };

  // Thay đổi số tiền thu nợ (giới hạn tối đa không vượt quá số nợ hiệu lực của khách)
  const handleAmountChangeVND = (tempId, val, selectedCust) => {
    const custDebt = getCustEffectiveDebt(selectedCust);
    if (selectedCust && custDebt > 0 && val > custDebt) {
      const maxVND = Math.round(custDebt);
      handleUpdateRow(tempId, { amountVND: maxVND, amount: formatNumberString(maxVND.toString()) });
      setError(`Số tiền thu của [${selectedCust.name}] tự động điều chỉnh về mức nợ tối đa là ${formatCurrency(custDebt)}.`);
      return;
    }
    setError('');
    handleUpdateRow(tempId, { amountVND: val, amount: formatNumberString(val.toString()) });
  };

  // Nút điền nhanh "Thu hết nợ" cho khách hàng
  const handleFillAllDebt = (tempId, currentDebt) => {
    if (!currentDebt || currentDebt <= 0) return;
    const maxVND = Math.round(currentDebt);
    handleUpdateRow(tempId, { amountVND: maxVND, amount: formatNumberString(maxVND.toString()) });
  };

  // Tính tổng số tiền thu và số khách hợp lệ
  const validRows = rows.filter((r) => r.selectedCustomerId && parseNumberString(r.amount) > 0);
  const totalBatchAmount = rows.reduce((sum, r) => sum + parseNumberString(r.amount), 0);

  // Tính các chỉ số cho nhóm đang chọn theo nợ hiệu lực
  const activeGroup = groups.find((g) => g.id === selectedGroupId);
  const activeGroupTotalDebt = rows.reduce((sum, r) => {
    const cust = allCustomers.find((c) => c.id === r.selectedCustomerId);
    return sum + getCustEffectiveDebt(cust);
  }, 0);
  const enteredLumpSum = parseNumberString(groupLumpSum);
  const remainingGroupDebt = Math.max(0, activeGroupTotalDebt - totalBatchAmount);
  const diffLumpSum = enteredLumpSum > 0 ? enteredLumpSum - totalBatchAmount : 0;

  // Lựa chọn dropdown nhóm
  const groupSelectOptions = [
    { id: 'none', name: '📋 Thu lẻ từng khách hàng (Mặc định)' },
    ...groups.map((g) => ({
      id: g.id,
      name: `🏢 ${g.name} (${g.count || (g.customerIds || []).length} quán)`,
    })),
  ];

  // Kiểm tra mã PIN trước khi thu tiền hàng loạt (Chặn bấm đúp / spam nút bấm)
  const requirePin = async (action) => {
    if (loading || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      const pinExists = await hasPin();
      if (!pinExists) {
        isSubmittingRef.current = false;
        pinSetupRef.current?.open(action);
        return;
      }
      const sessionOk = await isSessionValid();
      if (sessionOk) {
        await action();
      } else {
        isSubmittingRef.current = false;
        pinInputRef.current?.open(action, 'xác nhận thu nợ hàng loạt');
      }
    } catch (err) {
      isSubmittingRef.current = false;
      throw err;
    }
  };

  // Gửi dữ liệu thu nợ hàng loạt lên API
  const handleSubmit = async () => {
    const isoDate = parseDateString(dateStr);
    if (!isoDate) {
      setError('Ngày thu tiền không đúng định dạng (VD: 25/08/2026).');
      isSubmittingRef.current = false;
      return;
    }

    if (validRows.length === 0) {
      setError('Vui lòng chọn khách hàng và nhập số tiền thu nợ > 0 đ cho ít nhất 1 dòng.');
      isSubmittingRef.current = false;
      return;
    }

    // Kiểm tra không cho phép nhập số tiền vượt quá số nợ hiệu lực
    for (const row of validRows) {
      const cust = allCustomers.find((c) => c.id === row.selectedCustomerId) || customers.find((c) => c.id === row.selectedCustomerId);
      const payAmount = parseNumberString(row.amount);
      const custDebt = getCustEffectiveDebt(cust);
      if (cust && custDebt > 0 && payAmount > custDebt) {
        setError(`Số tiền thu của [${cust.name}] (${formatCurrency(payAmount)}) không được vượt quá số nợ (${formatCurrency(custDebt)}).`);
        isSubmittingRef.current = false;
        return;
      }
    }

    setError('');
    setLoading(true);
    isSubmittingRef.current = true;

    try {
      // Gắn rõ thông tin tháng được thanh toán vào note để hệ thống bóc tách trừ đúng tháng đó
      const monthNoteSuffix = selectedDebtMonth !== 'all' ? ` - Thanh toán nợ Tháng ${selectedDebtMonth}` : '';
      const defaultNote = activeGroup
        ? `Thu nợ gộp nhóm [${activeGroup.name}]${monthNoteSuffix} - Tổng tiền đợt này ${formatCurrency(totalBatchAmount)} ngày ${dateStr}`
        : (selectedDebtMonth !== 'all' ? `Thanh toán nợ Tháng ${selectedDebtMonth}` : null);

      const promises = validRows.map((row) => {
        const payAmount = parseNumberString(row.amount);
        return api.post('/payments', {
          customerId: row.selectedCustomerId,
          amount: payAmount,
          paidAt: isoDate,
          note: defaultNote,
        });
      });

      await Promise.all(promises);

      // Đánh dấu tắt tự động lưu nháp
      isLoadedCacheRef.current = false;
      await clearDraftCache();

      // Reset về 10 dòng trống
      setRows(createInitialRows(10));
      setSelectedGroupId('none');
      setGroupLumpSum('');

      if (onRefresh) onRefresh();

      setVisible(false);

      // Thông báo Toast thành công
      showGlobalToast(
        activeGroup
          ? `Đã thu nợ thành công cho nhóm [${activeGroup.name}] (${validRows.length} quán) với tổng tiền ${formatCurrency(totalBatchAmount)}.`
          : `Đã thu nợ thành công cho ${validRows.length} khách hàng với tổng tiền ${formatCurrency(totalBatchAmount)}.`,
        'success'
      );
    } catch (err) {
      console.error('[BATCH PAYMENT SUBMIT ERROR]', err);
      setError(err.response?.data?.message || 'Có lỗi khi thu nợ hàng loạt. Vui lòng thử lại.');
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalViewFullScreen}>
        {/* Header Modal */}
        <View style={styles.modalHeader}>
          <View style={styles.titleRow}>
            <Text style={styles.modalTitle}>🟢 THU NỢ HÀNG LOẠT</Text>
          </View>
          <TouchableOpacity style={styles.closeHeaderButton} onPress={() => setVisible(false)}>
            <Text style={styles.closeHeaderText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Khung điều khiển trên cùng: Ngày thu, Lọc nợ tháng, Xóa làm lại & Chế độ thu */}
        <View
          style={[
            styles.topControlCard,
            (isMonthSelectOpen || isGroupSelectOpen) && { zIndex: 999999, elevation: 999999 },
          ]}
        >
          <View style={styles.topControlRow1}>
            {/* Cột Ngày thu */}
            <View style={styles.dateCol}>
              <Text style={styles.controlMiniLabel}>📅 Ngày thu</Text>
              <DatePickerInput
                value={dateStr}
                onChange={setDateStr}
                allowFuture={true}
                compact={true}
              />
            </View>

            {/* Cột Lọc nợ theo tháng */}
            <View style={[styles.monthCol, isMonthSelectOpen && { zIndex: 999999, elevation: 999999 }]}>
              <Text style={styles.controlMiniLabel}>🗓️ Kỳ nợ</Text>
              <CustomSelect
                value={MONTH_OPTIONS.find((m) => m.id === selectedDebtMonth) || MONTH_OPTIONS[0]}
                options={MONTH_OPTIONS}
                getOptionLabel={(m) => m.name}
                renderSelected={(m) => m.shortLabel || m.name}
                onSelect={(m) => handleSelectMonth(m.id)}
                onOpenChange={setIsMonthSelectOpen}
                compact={true}
                zIndex={999999}
              />
            </View>

            {/* Nút Xóa làm lại */}
            <TouchableOpacity
              style={styles.clearDraftBtnMini}
              onPress={handleClearDraft}
              activeOpacity={0.7}
            >
              <Text style={styles.clearDraftBtnMiniText}>🧹 Làm lại</Text>
            </TouchableOpacity>
          </View>

          {/* Hàng chọn Chế độ thu */}
          <View style={[styles.groupSelectRow, isGroupSelectOpen && { zIndex: 999998, elevation: 999998 }]}>
            <Text style={styles.controlMiniLabel}>🏢 Chế độ thu:</Text>
            <View style={{ flex: 1 }}>
              <CustomSelect
                value={groupSelectOptions.find((g) => g.id === selectedGroupId) || groupSelectOptions[0]}
                options={groupSelectOptions}
                getOptionLabel={(g) => g.name}
                renderSelected={(g) => g.name}
                onSelect={(g) => handleSelectGroup(g.id)}
                onOpenChange={setIsGroupSelectOpen}
                compact={true}
                zIndex={999998}
              />
            </View>
          </View>
        </View>

        {/* Khung điều khiển Thu Nợ Gộp Chuỗi (Chỉ hiện khi đang chọn 1 nhóm nhà hàng) */}
        {selectedGroupId !== 'none' && activeGroup && (
          <View style={styles.groupBatchControlCard}>
            <View style={styles.groupCardHeaderRow}>
              <Text style={styles.groupCardHeaderTitle} numberOfLines={1}>
                🏢 <Text style={{ color: '#047857' }}>{activeGroup.name}</Text> ({rows.length} quán)
              </Text>
              <View style={styles.groupTotalDebtBadge}>
                <Text style={styles.groupTotalDebtLabel}>
                  {selectedDebtMonth !== 'all' ? `NỢ T${selectedDebtMonth}` : 'TỔNG NỢ'}:
                </Text>
                <Text style={styles.groupTotalDebtVal}>{formatCurrency(activeGroupTotalDebt)}</Text>
              </View>
            </View>

            {/* Hàng nhập số tiền & các nút phân bổ thu gọn */}
            <View style={styles.allocationActionRow}>
              <View style={styles.lumpSumInputBox}>
                <MoneyInput
                  value={parseNumberString(groupLumpSum)}
                  onChangeValue={(val) => {
                    setGroupLumpSum(val ? val.toString() : '');
                    setError('');
                  }}
                  placeholder="Tiền chuỗi chuyển..."
                  style={styles.lumpSumInput}
                />
              </View>

              <TouchableOpacity
                style={[styles.allocBtn, styles.allocBtnFIFO]}
                onPress={handleAutoAllocateFIFO}
                activeOpacity={0.8}
              >
                <Text style={styles.allocBtnFIFOText}>⚡ Cuốn chiếu</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.allocBtn, styles.allocBtnProRata]}
                onPress={handleAutoAllocateProRata}
                activeOpacity={0.8}
              >
                <Text style={styles.allocBtnProRataText}>📊 Chia % nợ</Text>
              </TouchableOpacity>

              {groupLumpSum ? (
                <TouchableOpacity
                  style={[styles.allocBtn, styles.allocBtnClear]}
                  onPress={() => {
                    setGroupLumpSum('');
                    handleClearGroupAmounts();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.allocBtnClearText}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Thanh thống kê 1 dòng ngắn gọn */}
            <View style={styles.allocResultBar}>
              <Text style={styles.allocResultText}>
                Chuyển: <Text style={styles.allocResultBold}>{formatCurrency(enteredLumpSum)}</Text>
              </Text>
              <Text style={styles.allocResultText}>
                Đã chia: <Text style={[styles.allocResultBold, { color: '#047857' }]}>{formatCurrency(totalBatchAmount)}</Text>
              </Text>
              {enteredLumpSum > 0 && (
                <Text style={[styles.allocResultText, diffLumpSum === 0 ? styles.textSuccess : styles.textDanger]}>
                  {diffLumpSum === 0 ? '✓ Khớp' : diffLumpSum > 0 ? `Dư ${formatCurrency(diffLumpSum)}` : `Vượt ${formatCurrency(Math.abs(diffLumpSum))}`}
                </Text>
              )}
              <Text style={styles.allocResultText}>
                Còn lại: <Text style={[styles.allocResultBold, { color: COLORS.danger }]}>{formatCurrency(remainingGroupDebt)}</Text>
              </Text>
            </View>
          </View>
        )}

        {/* Banner thông báo lỗi */}
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        ) : null}

        {/* Danh sách các dòng thu nợ */}
        <ScrollView
          ref={mainScrollRef}
          style={styles.mainScrollFull}
          contentContainerStyle={styles.mainScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.tableContainer}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.thText, { flex: 2 }]}>Nhà hàng / Khách hàng</Text>
              <Text style={[styles.thText, { flex: 1.5, textAlign: 'right' }]}>Số tiền thu (VNĐ)</Text>
              <Text style={[styles.thText, { width: 28, textAlign: 'center' }]}></Text>
            </View>

            {rows.map((row, index) => {
              const selectedCust =
                allCustomers.find((c) => c.id === row.selectedCustomerId) ||
                customers.find((c) => c.id === row.selectedCustomerId);
              const amt = parseNumberString(row.amount);
              const isActive = activeRowTempId === row.tempId;
              const rowZIndex = isActive ? 999999 : (rows.length - index) * 10;
              const effDebt = getCustEffectiveDebt(selectedCust);
              const hasDebt = effDebt > 0;

              // Lọc bỏ những khách hàng đã được chọn ở các dòng khác
              const otherSelectedCustomerIds = new Set(
                rows
                  .filter((r) => r.tempId !== row.tempId && r.selectedCustomerId)
                  .map((r) => r.selectedCustomerId)
              );
              const customerPool = selectedGroupId !== 'none' ? allCustomers : customers;
              const availableCustomers = customerPool.filter(
                (c) => !otherSelectedCustomerIds.has(c.id)
              );

              return (
                <View key={row.tempId} style={[styles.tableRow, { zIndex: rowZIndex, elevation: rowZIndex }]}>
                  {/* Hàng chính: Ô chọn khách, Ô tiền và Nút xóa */}
                  <View style={styles.tableRowMain}>
                    {/* Ô chọn khách hàng */}
                    <View style={{ flex: 2, marginRight: 8 }}>
                      <CustomSelect
                        value={selectedCust}
                        placeholder="Chọn khách hàng..."
                        options={availableCustomers}
                        dropUp={index >= Math.max(1, rows.length - 2)}
                        onOpenChange={(isOpen) => setActiveRowTempId(isOpen ? row.tempId : null)}
                        onSelect={(c) => {
                          const currentAmt = parseNumberString(row.amount);
                          let newAmt = row.amount;
                          const cDebt = getCustEffectiveDebt(c);
                          if (c && cDebt > 0 && currentAmt > cDebt) {
                            newAmt = formatNumberString(Math.round(cDebt).toString());
                            setError(`Số tiền thu của [${c.name}] tự động điều chỉnh về mức nợ tối đa là ${formatCurrency(cDebt)}.`);
                          }
                          handleUpdateRow(row.tempId, { selectedCustomerId: c?.id || null, amount: newAmt });
                        }}
                        renderSelected={(c) => c.name}
                        renderOption={(c) => {
                          const cEff = getCustEffectiveDebt(c);
                          return (
                            <View style={styles.custOptionRow}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.custOptionName}>{c.name}</Text>
                                {c.phone ? <Text style={styles.custOptionPhone}>📞 {c.phone}</Text> : null}
                              </View>
                              <Text style={[styles.custOptionDebt, cEff > 0 ? styles.textDanger : styles.textSuccess]}>
                                {cEff > 0 ? `Nợ: ${formatCurrency(cEff)}` : '0 đ'}
                              </Text>
                            </View>
                          );
                        }}
                      />
                    </View>

                    {/* Ô nhập số tiền thu */}
                    <View style={{ flex: 1.5, marginRight: 8 }}>
                      <MoneyInput
                        style={[
                          styles.tableMoneyInputContainer,
                          amt > 0 && styles.amountInputActive,
                        ]}
                        inputStyle={styles.tableMoneyInputText}
                        value={row.amountVND || (row.amount ? parseNumberString(row.amount) : 0)}
                        onChangeValue={(val) => handleAmountChangeVND(row.tempId, val, selectedCust)}
                        placeholder="0"
                        textAlign="right"
                      />
                    </View>

                    {/* Nút xóa dòng */}
                    <TouchableOpacity
                      style={styles.deleteRowBtnMini}
                      onPress={() => handleRemoveRow(row.tempId)}
                    >
                      <Text style={styles.deleteRowBtnMiniText}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Thanh phụ hiển thị thông tin nợ & nút Thu hết nợ */}
                  {selectedCust ? (
                    <View style={styles.tableRowSubBar}>
                      {hasDebt ? (
                        <>
                          <Text style={styles.debtInfoText}>
                            🔴 {selectedDebtMonth !== 'all' ? `Nợ T${selectedDebtMonth}: ` : 'Nợ hiện tại: '}
                            <Text style={styles.debtInfoBold}>{formatCurrency(effDebt)}</Text>
                            {selectedDebtMonth !== 'all' && selectedCust.debt !== effDebt && (
                              <Text style={styles.debtTotalSubText}> (Tổng: {formatCurrency(selectedCust.debt)})</Text>
                            )}
                          </Text>
                          <TouchableOpacity
                            style={styles.fillDebtBtn}
                            onPress={() => handleFillAllDebt(row.tempId, effDebt)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.fillDebtBtnText}>⚡ Thu hết {formatCurrency(effDebt)}</Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <Text style={styles.zeroDebtBadgeText}>
                          ✓ Không có nợ {selectedDebtMonth !== 'all' ? `tháng ${selectedDebtMonth}` : 'cũ'}
                        </Text>
                      )}
                    </View>
                  ) : null}
                </View>
              );
            })}

            {/* Nút thêm dòng chỉ hiển thị khi chọn lẻ từng khách, nằm trong scroll để tiết kiệm không gian */}
            {selectedGroupId === 'none' && (
              <TouchableOpacity style={styles.addCustomerBtnInside} onPress={handleAddRow} activeOpacity={0.85}>
                <Text style={styles.addCustomerBtnText}>➕ THÊM DÒNG KHÁCH TRẢ NỢ</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={styles.modalFooter}>
          <View style={styles.footerSummaryBox}>
            <Text style={styles.summaryCountText}>
              Đã thu: <Text style={styles.summaryCountBold}>{validRows.length}</Text> khách
            </Text>
            <Text style={styles.summaryTotalText}>{formatCurrency(totalBatchAmount)}</Text>
          </View>

          <View style={styles.footerActionsRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setVisible(false)}
              disabled={loading}
            >
              <Text style={styles.cancelBtnText}>Hủy bỏ</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.submitBtn,
                (validRows.length === 0 || loading) && styles.submitBtnDisabled,
              ]}
              onPress={() => requirePin(handleSubmit)}
              disabled={validRows.length === 0 || loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>🟢 XÁC NHẬN THU TIỀN</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SmoothModal>

      {/* Modal PIN ở tầng cao nhất, độc lập với SmoothModal cha */}
      <PinInputModal ref={pinInputRef} />
      <PinSetupModal ref={pinSetupRef} />
    </>
  );
});

export default BatchPaymentModal;

const styles = StyleSheet.create({
  modalViewFullScreen: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    width: '100%',
    maxWidth: 620,
    maxHeight: '92%',
    height: '92%',
    padding: 14,
    flexDirection: 'column',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#059669',
  },
  closeHeaderButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeHeaderText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#64748B',
  },

  /* Khung điều khiển trên cùng (Ngày, Tháng, Nút làm lại, Chế độ thu) */
  topControlCard: {
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  topControlRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateCol: {
    flex: 1.1,
  },
  monthCol: {
    flex: 1.3,
  },
  controlMiniLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#475569',
    marginBottom: 2,
  },
  clearDraftBtnMini: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 6,
    height: 34,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-end',
  },
  clearDraftBtnMiniText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  groupSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },

  /* Khung điều khiển Thu Nợ Gộp Chuỗi Siêu Thu Gọn */
  groupBatchControlCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#10B981',
    padding: 8,
    marginBottom: 8,
    ...SHADOWS.card,
  },
  groupCardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  groupCardHeaderTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A',
    flex: 1,
    marginRight: 8,
  },
  groupTotalDebtBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  groupTotalDebtLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#991B1B',
  },
  groupTotalDebtVal: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  allocationActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  lumpSumInputBox: {
    flex: 1.4,
  },
  lumpSumInput: {
    height: 34,
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderRadius: 6,
    paddingHorizontal: 8,
    backgroundColor: '#F0FDF4',
    fontSize: 13,
    fontWeight: 'bold',
    color: '#047857',
  },
  allocBtn: {
    height: 34,
    paddingHorizontal: 8,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  allocBtnFIFO: {
    backgroundColor: '#059669',
  },
  allocBtnFIFOText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  allocBtnProRata: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  allocBtnProRataText: {
    color: '#0369A1',
    fontSize: 11,
    fontWeight: 'bold',
  },
  allocBtnClear: {
    width: 32,
    height: 34,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  allocBtnClearText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: 'bold',
  },
  allocResultBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexWrap: 'wrap',
    gap: 6,
  },
  allocResultText: {
    fontSize: 11,
    color: '#64748B',
  },
  allocResultBold: {
    fontWeight: 'bold',
    color: '#1E293B',
  },

  /* Banner lỗi */
  errorBanner: {
    backgroundColor: '#FEF2F2',
    padding: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    marginBottom: 6,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: 'bold',
  },

  /* Danh sách các dòng thu nợ */
  mainScrollFull: {
    flex: 1,
  },
  mainScrollContent: {
    paddingBottom: 8,
  },
  tableContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'visible',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderColor: '#CBD5E1',
  },
  thText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#475569',
  },
  tableRow: {
    flexDirection: 'column',
    marginBottom: 8,
    backgroundColor: '#F8FAFC',
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tableRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  tableRowSubBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
  },
  debtInfoText: {
    fontSize: 11,
    color: '#475569',
  },
  debtInfoBold: {
    fontWeight: 'bold',
    color: '#DC2626',
  },
  debtTotalSubText: {
    fontSize: 10,
    color: '#94A3B8',
  },
  custOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  custOptionName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  custOptionPhone: {
    fontSize: 11,
    color: '#64748B',
  },
  custOptionDebt: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  textDanger: {
    color: '#DC2626',
  },
  textSuccess: {
    color: '#059669',
  },
  fillDebtBtn: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 5,
  },
  fillDebtBtnText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#059669',
  },
  zeroDebtBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#059669',
  },
  tableMoneyInputContainer: {
    height: 36,
    borderRadius: 6,
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1,
  },
  tableMoneyInputText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#059669',
  },
  amountInputActive: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
    color: '#047857',
  },
  deleteRowBtnMini: {
    width: 26,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  deleteRowBtnMiniText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  addCustomerBtnInside: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderStyle: 'dashed',
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  addCustomerBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#047857',
  },

  /* Footer */
  modalFooter: {
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    paddingTop: 8,
    marginTop: 6,
    zIndex: 1,
    elevation: 1,
  },
  footerSummaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    backgroundColor: '#ECFDF5',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  summaryCountText: {
    fontSize: 12,
    color: '#065F46',
  },
  summaryCountBold: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#047857',
  },
  summaryTotalText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#047857',
  },
  footerActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelBtn: {
    flex: 1,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#64748B',
  },
  submitBtn: {
    flex: 2,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.card,
  },
  submitBtnDisabled: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
