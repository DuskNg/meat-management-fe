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

const BatchPaymentModal = forwardRef(({ onRefresh, currentUserId }, ref) => {
  const [visible, setVisible] = useState(false);
  const [dateStr, setDateStr] = useState(getTodayFormatted());
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

  const { groups, refreshGroups } = useCustomerGroups(currentUserId);

  const pinInputRef = useRef(null);
  const pinSetupRef = useRef(null);
  const mainScrollRef = useRef(null);
  const isSubmittingRef = useRef(false);
  const isLoadedCacheRef = useRef(false);
  // Counter tăng dần đảm bảo tempId luôn unique
  const rowIdCounterRef = useRef(1);

  // Phơi bày hàm điều khiển ra bên ngoài
  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true);
      setDateStr(getTodayFormatted());
      setError('');
      setSelectedGroupId('none');
      setGroupLumpSum('');
      isLoadedCacheRef.current = false;
      fetchData();
      refreshGroups();
    },
    openWithGroup: (targetGroup) => {
      setVisible(true);
      setDateStr(getTodayFormatted());
      setError('');
      setGroupLumpSum('');
      isLoadedCacheRef.current = false;
      fetchData(targetGroup);
      refreshGroups();
    },
    close: () => setVisible(false),
  }));

  // Helper tạo dòng thu nợ mới với ID luôn unique
  const createEmptyRow = (customerId = null) => ({
    tempId: `row_${rowIdCounterRef.current++}`,
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

  // Tải danh sách khách hàng từ server
  const fetchData = async (targetGroup = null) => {
    setLoading(true);
    setError('');
    try {
      const custRes = await api.get('/customers?isBadDebt=false');
      const allCustData = custRes.data?.data || (Array.isArray(custRes.data) ? custRes.data : []);
      setAllCustomers(allCustData);

      // Chỉ lấy những khách hàng đang phát sinh công nợ (nợ > 0) cho danh sách chọn lẻ
      const debtCustomers = allCustData.filter((c) => Math.round(c.debt || 0) > 0);
      setCustomers(debtCustomers);

      // Nếu mở kèm nhóm chỉ định cụ thể
      if (targetGroup && targetGroup.id) {
        setSelectedGroupId(targetGroup.id);
        const memberIds = new Set(targetGroup.customerIds || []);
        const groupCusts = allCustData.filter((c) => memberIds.has(c.id));
        groupCusts.sort((a, b) => (parseFloat(b.debt) || 0) - (parseFloat(a.debt) || 0));

        if (groupCusts.length > 0) {
          const groupRows = groupCusts.map((c) => createEmptyRow(c.id));
          setRows(groupRows);
          isLoadedCacheRef.current = true;
          return;
        }
      } else {
        setSelectedGroupId('none');
      }

      // Đọc bản nháp từ cache nếu có (khi không mở theo nhóm)
      const draft = await loadDraftCache();
      if (draft && Array.isArray(draft.rows) && draft.rows.length > 0) {
        setRows(padRowsToMin(draft.rows, 10));
        if (draft.dateStr) setDateStr(draft.dateStr);
        isLoadedCacheRef.current = true;
        return;
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
    // Ưu tiên quán có công nợ nợ nhiều nhất lên đầu
    groupCusts.sort((a, b) => (parseFloat(b.debt) || 0) - (parseFloat(a.debt) || 0));

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
      const debt = Math.round(Math.max(0, cust?.debt || 0));
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

    // Tổng nợ của các quán trong bảng
    const totalDebt = rows.reduce((sum, r) => {
      const cust = allCustomers.find((c) => c.id === r.selectedCustomerId);
      return sum + Math.round(Math.max(0, cust?.debt || 0));
    }, 0);

    if (totalDebt <= 0) {
      setError('Tổng công nợ của các nhà hàng hiện tại bằng 0 đ.');
      return;
    }

    let allocatedTotal = 0;
    const debtRows = rows.filter((r) => {
      const cust = allCustomers.find((c) => c.id === r.selectedCustomerId);
      return cust && (cust.debt || 0) > 0;
    });

    const updated = rows.map((r) => {
      if (!r.selectedCustomerId) return r;
      const cust = allCustomers.find((c) => c.id === r.selectedCustomerId);
      const debt = Math.round(Math.max(0, cust?.debt || 0));
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
        const maxDebt = Math.round(cust?.debt || curAmt);
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
      `Đã phân bổ ${formatCurrency(lumpSum)} theo tỷ lệ % nợ cho các quán!`,
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

  // Thay đổi số tiền thu nợ (giới hạn tối đa không vượt quá số nợ hiện tại của khách)
  const handleAmountChangeVND = (tempId, val, selectedCust) => {
    if (selectedCust && selectedCust.debt > 0 && val > selectedCust.debt) {
      const maxVND = Math.round(selectedCust.debt);
      handleUpdateRow(tempId, { amountVND: maxVND, amount: formatNumberString(maxVND.toString()) });
      setError(`Số tiền thu của [${selectedCust.name}] tự động điều chỉnh về mức nợ tối đa là ${formatCurrency(selectedCust.debt)}.`);
      return;
    }
    setError('');
    handleUpdateRow(tempId, { amountVND: val, amount: formatNumberString(val.toString()) });
  };

  // Nút điền nhanh "Thu hết nợ hiện tại" cho khách hàng
  const handleFillAllDebt = (tempId, currentDebt) => {
    if (!currentDebt || currentDebt <= 0) return;
    const maxVND = Math.round(currentDebt);
    handleUpdateRow(tempId, { amountVND: maxVND, amount: formatNumberString(maxVND.toString()) });
  };

  // Tính tổng số tiền thu và số khách hợp lệ
  const validRows = rows.filter((r) => r.selectedCustomerId && parseNumberString(r.amount) > 0);
  const totalBatchAmount = rows.reduce((sum, r) => sum + parseNumberString(r.amount), 0);

  // Tính các chỉ số cho nhóm đang chọn
  const activeGroup = groups.find((g) => g.id === selectedGroupId);
  const activeGroupTotalDebt = rows.reduce((sum, r) => {
    const cust = allCustomers.find((c) => c.id === r.selectedCustomerId);
    return sum + Math.round(Math.max(0, cust?.debt || 0));
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

    // Kiểm tra không cho phép nhập số tiền vượt quá tổng nợ hiện tại
    for (const row of validRows) {
      const cust = allCustomers.find((c) => c.id === row.selectedCustomerId) || customers.find((c) => c.id === row.selectedCustomerId);
      const payAmount = parseNumberString(row.amount);
      if (cust && cust.debt > 0 && payAmount > cust.debt) {
        setError(`Số tiền thu của [${cust.name}] (${formatCurrency(payAmount)}) không được vượt quá số nợ hiện tại (${formatCurrency(cust.debt)}).`);
        isSubmittingRef.current = false;
        return;
      }
    }

    setError('');
    setLoading(true);
    isSubmittingRef.current = true;

    try {
      const defaultNote = activeGroup
        ? `Thu nợ gộp nhóm [${activeGroup.name}] - Tổng tiền đợt này ${formatCurrency(totalBatchAmount)} ngày ${dateStr}`
        : null;

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

        {/* Thanh điều khiển trên cùng: Ngày thu tiền & Chọn nhóm nhà hàng */}
        <View style={styles.topControlRow}>
          <View style={styles.dateAndDraftRow}>
            <View style={styles.dateInlineGroup}>
              <Text style={styles.dateLabelInline}>📅 Ngày thu:</Text>
              <DatePickerInput
                value={dateStr}
                onChange={setDateStr}
                allowFuture={true}
                compact={true}
              />
            </View>

            <TouchableOpacity style={styles.clearDraftBtnHeader} onPress={handleClearDraft}>
              <Text style={styles.clearDraftTextHeader}>🧹 Xóa làm lại</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Thanh chọn nhóm khách hàng */}
        <View
          style={[
            styles.groupToolbar,
            isGroupSelectOpen && { zIndex: 999999, elevation: 999999 },
          ]}
        >
          <View style={styles.groupSelectWrap}>
            <Text style={styles.groupSelectLabel}>🏢 Chế độ thu:</Text>
            <View style={{ flex: 1 }}>
              <CustomSelect
                value={groupSelectOptions.find((g) => g.id === selectedGroupId) || groupSelectOptions[0]}
                options={groupSelectOptions}
                getOptionLabel={(g) => g.name}
                renderSelected={(g) => g.name}
                onSelect={(g) => handleSelectGroup(g.id)}
                onOpenChange={setIsGroupSelectOpen}
                compact={true}
                zIndex={999999}
              />
            </View>
          </View>
        </View>

        {/* Khung điều khiển Thu Nợ Gộp Chuỗi (Chỉ hiện khi đang chọn 1 nhóm nhà hàng) */}
        {selectedGroupId !== 'none' && activeGroup && (
          <View style={styles.groupBatchControlCard}>
            <View style={styles.groupCardHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.groupCardHeaderTitle}>
                  🏢 Thu nợ gộp: <Text style={{ color: '#047857' }}>{activeGroup.name}</Text> ({rows.length} quán)
                </Text>
                <Text style={styles.groupCardSub}>
                  Nhập số tiền chuyển khoản một cục $\rightarrow$ Bấm nút để máy tự động phân bổ trừ nợ
                </Text>
              </View>
              <View style={styles.groupTotalDebtBadge}>
                <Text style={styles.groupTotalDebtLabel}>TỔNG NỢ NHÓM</Text>
                <Text style={styles.groupTotalDebtVal}>{formatCurrency(activeGroupTotalDebt)}</Text>
              </View>
            </View>

            {/* Ô nhập số tiền chuỗi chuyển và các nút tự động phân bổ */}
            <View style={styles.allocationActionRow}>
              <View style={styles.lumpSumInputBox}>
                <Text style={styles.lumpSumInputLabel}>Tiền chuỗi chuyển khoản (VNĐ):</Text>
                <MoneyInput
                  valueVND={parseNumberString(groupLumpSum)}
                  onChangeVND={(val) => setGroupLumpSum(val ? val.toString() : '')}
                  placeholder="Ví dụ: 100.000.000"
                  style={styles.lumpSumInput}
                />
              </View>

              <View style={styles.allocBtnGroup}>
                <TouchableOpacity
                  style={[styles.allocBtn, styles.allocBtnFIFO]}
                  onPress={handleAutoAllocateFIFO}
                  activeOpacity={0.8}
                >
                  <Text style={styles.allocBtnFIFOText}>⚡ Trừ cuốn chiếu (Nợ cũ trước)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.allocBtn, styles.allocBtnProRata]}
                  onPress={handleAutoAllocateProRata}
                  activeOpacity={0.8}
                >
                  <Text style={styles.allocBtnProRataText}>📊 Chia theo tỷ lệ % nợ</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.allocBtn, styles.allocBtnClear]}
                  onPress={handleClearGroupAmounts}
                  activeOpacity={0.8}
                >
                  <Text style={styles.allocBtnClearText}>🧹 Xóa tiền</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Thanh thống kê kết quả phân bổ trực quan theo thời gian thực */}
            <View style={styles.allocResultBar}>
              <View style={styles.allocResultItem}>
                <Text style={styles.allocResultLabel}>Khách chuyển:</Text>
                <Text style={styles.allocResultVal}>{formatCurrency(enteredLumpSum)}</Text>
              </View>
              <View style={styles.allocResultItem}>
                <Text style={styles.allocResultLabel}>Đã phân bổ:</Text>
                <Text style={[styles.allocResultVal, { color: '#047857' }]}>
                  {formatCurrency(totalBatchAmount)}
                </Text>
              </View>
              <View style={styles.allocResultItem}>
                <Text style={styles.allocResultLabel}>Khớp tiền:</Text>
                {enteredLumpSum === 0 ? (
                  <Text style={[styles.allocBadgeText, { color: '#64748B' }]}>Chưa nhập tiền</Text>
                ) : diffLumpSum === 0 ? (
                  <Text style={[styles.allocBadgeText, { color: '#15803D' }]}>✓ Khớp chuẩn 100%</Text>
                ) : diffLumpSum > 0 ? (
                  <Text style={[styles.allocBadgeText, { color: '#B45309' }]}>
                    Còn dư {formatCurrency(diffLumpSum)}
                  </Text>
                ) : (
                  <Text style={[styles.allocBadgeText, { color: COLORS.danger }]}>
                    Vượt quá {formatCurrency(Math.abs(diffLumpSum))}
                  </Text>
                )}
              </View>
              <View style={styles.allocResultItem}>
                <Text style={styles.allocResultLabel}>Nợ còn lại sau trừ:</Text>
                <Text style={[styles.allocResultVal, { color: COLORS.danger, fontWeight: 'bold' }]}>
                  {formatCurrency(remainingGroupDebt)}
                </Text>
              </View>
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
              <Text style={[styles.thText, { width: 32, textAlign: 'center' }]}></Text>
            </View>

            {rows.map((row, index) => {
              const selectedCust =
                allCustomers.find((c) => c.id === row.selectedCustomerId) ||
                customers.find((c) => c.id === row.selectedCustomerId);
              const amt = parseNumberString(row.amount);
              const isActive = activeRowTempId === row.tempId;
              const rowZIndex = isActive ? 999999 : (rows.length - index) * 10;
              const hasDebt = selectedCust && selectedCust.debt > 0;

              // Lọc bỏ những khách hàng đã được chọn ở các dòng khác (tự động ẩn khỏi danh sách của ô chọn khác)
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
                  {/* Hàng chính: Ô chọn khách, Ô tiền và Nút xóa nằm trên cùng một hàng ngang căn chỉnh hoàn hảo */}
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
                          if (c && c.debt > 0 && currentAmt > c.debt) {
                            newAmt = formatNumberString(Math.round(c.debt).toString());
                            setError(`Số tiền thu của [${c.name}] tự động điều chỉnh về mức nợ tối đa là ${formatCurrency(c.debt)}.`);
                          }
                          handleUpdateRow(row.tempId, { selectedCustomerId: c?.id || null, amount: newAmt });
                        }}
                        renderSelected={(c) => c.name}
                        renderOption={(c) => (
                          <View style={styles.custOptionRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.custOptionName}>{c.name}</Text>
                              {c.phone ? <Text style={styles.custOptionPhone}>📞 {c.phone}</Text> : null}
                            </View>
                            <Text style={[styles.custOptionDebt, c.debt > 0 ? styles.textDanger : styles.textSuccess]}>
                              {c.debt > 0 ? `Nợ: ${formatCurrency(c.debt)}` : '0 đ'}
                            </Text>
                          </View>
                        )}
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

                  {/* Thanh phụ hiển thị thông tin nợ & nút Thu hết nợ (Chỉ hiện khi đã chọn khách hàng) */}
                  {selectedCust ? (
                    <View style={styles.tableRowSubBar}>
                      {hasDebt ? (
                        <>
                          <Text style={styles.debtInfoText}>
                            🔴 Nợ hiện tại: <Text style={styles.debtInfoBold}>{formatCurrency(selectedCust.debt)}</Text>
                          </Text>
                          <TouchableOpacity
                            style={styles.fillDebtBtn}
                            onPress={() => handleFillAllDebt(row.tempId, selectedCust.debt)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.fillDebtBtnText}>⚡ Thu hết {formatCurrency(selectedCust.debt)}</Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <Text style={styles.zeroDebtBadgeText}>✓ Khách hàng này hiện không có nợ cũ</Text>
                      )}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </ScrollView>

        {/* Nút thêm dòng khách hàng */}
        <TouchableOpacity style={styles.addCustomerBtnSticky} onPress={handleAddRow} activeOpacity={0.85}>
          <Text style={styles.addCustomerBtnText}>➕ THÊM DÒNG KHÁCH TRẢ NỢ</Text>
        </TouchableOpacity>

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

      {/* Modal PIN */}
      <PinInputModal ref={pinInputRef} />
      <PinSetupModal ref={pinSetupRef} />
    </SmoothModal>
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
    padding: 16,
    flexDirection: 'column',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#059669',
  },
  clearDraftBtnHeader: {
    backgroundColor: '#FEF2F2',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  clearDraftTextHeader: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  closeHeaderButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeHeaderText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#64748B',
  },
  topControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dateAndDraftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
  dateInlineGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateLabelInline: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#475569',
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    marginBottom: 8,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: 'bold',
  },
  mainScrollFull: {
    flex: 1,
    // Không đặt zIndex ở đây, để dropdown thoát ra ngoài tự nhiên
  },
  mainScrollContent: {
    paddingBottom: 10,
  },
  tableContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    // overflow visible để dropdown của CustomSelect thoát ra ngoài đè lên button bên dưới
    overflow: 'visible',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderColor: '#CBD5E1',
  },
  thText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#475569',
  },
  tableRow: {
    flexDirection: 'column',
    marginBottom: 10,
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    // Không dùng position: relative để tránh tạo stacking context cô lập - dropdown sẽ bị kẹt bên trong
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
    marginTop: 8,
    paddingTop: 6,
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
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  fillDebtBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#059669',
  },
  zeroDebtBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },
  tableMoneyInputContainer: {
    height: 38,
    borderRadius: 8,
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1,
  },
  tableMoneyInputText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#059669',
  },
  amountInput: {
    backgroundColor: '#FFFFFF',
    height: 38,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    color: '#0F172A',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    textAlign: 'right',
  },
  amountInputActive: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
    color: '#047857',
  },
  deleteRowBtnMini: {
    width: 28,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  deleteRowBtnMiniText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  addCustomerBtnSticky: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderStyle: 'dashed',
    paddingVertical: 10,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 8,
    zIndex: 1,
    elevation: 1,
  },
  addCustomerBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#047857',
  },
  modalFooter: {
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    paddingTop: 10,
    zIndex: 1,
    elevation: 1,
  },
  footerSummaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    backgroundColor: '#ECFDF5',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  summaryCountText: {
    fontSize: 13,
    color: '#065F46',
  },
  summaryCountBold: {
    fontWeight: 'bold',
    fontSize: 15,
    color: '#047857',
  },
  summaryTotalText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#047857',
  },
  footerActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#64748B',
  },
  submitBtn: {
    flex: 2,
    height: 44,
    borderRadius: 10,
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
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  /* Styles cho chế độ Thu Nợ Gộp Theo Nhóm */
  groupToolbar: {
    marginBottom: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  groupSelectWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupSelectLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#334155',
  },
  groupBatchControlCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#10B981',
    padding: 10,
    marginBottom: 10,
    ...SHADOWS.card,
  },
  groupCardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  groupCardHeaderTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  groupCardSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  groupTotalDebtBadge: {
    alignItems: 'flex-end',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  groupTotalDebtLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#991B1B',
  },
  groupTotalDebtVal: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#DC2626',
    marginTop: 1,
  },
  allocationActionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  lumpSumInputBox: {
    flex: 1,
    minWidth: 200,
  },
  lumpSumInputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
  },
  lumpSumInput: {
    height: 38,
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderRadius: 6,
    paddingHorizontal: 10,
    backgroundColor: '#F0FDF4',
    fontSize: 14,
    fontWeight: 'bold',
    color: '#047857',
  },
  allocBtnGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  allocBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  allocBtnFIFO: {
    backgroundColor: '#059669',
  },
  allocBtnFIFOText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  allocBtnProRata: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  allocBtnProRataText: {
    color: '#0369A1',
    fontSize: 12,
    fontWeight: 'bold',
  },
  allocBtnClear: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  allocBtnClearText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  allocResultBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexWrap: 'wrap',
    gap: 8,
  },
  allocResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  allocResultLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  allocResultVal: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  allocBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
});
