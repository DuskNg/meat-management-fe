// meat-management-fe/src/components/BatchPaymentModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef, useEffect } from 'react';
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

const BatchPaymentModal = forwardRef(({ onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [dateStr, setDateStr] = useState(getTodayFormatted());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [customers, setCustomers] = useState([]);
  const [rows, setRows] = useState([]);
  const [activeRowTempId, setActiveRowTempId] = useState(null);

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
      isLoadedCacheRef.current = false;
      fetchData();
    },
    close: () => setVisible(false),
  }));

  // Helper tạo dòng thu nợ mới với ID luôn unique
  const createEmptyRow = () => ({
    tempId: `row_${rowIdCounterRef.current++}`,
    selectedCustomerId: null,
    amount: '',
  });

  // Tải danh sách khách hàng từ server
  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const custRes = await api.get('/customers?isBadDebt=false');
      const custData = custRes.data?.data || [];
      // Chỉ lấy những khách hàng đang phát sinh công nợ (nợ > 0)
      const debtCustomers = custData.filter((c) => Math.round(c.debt || 0) > 0);
      setCustomers(debtCustomers);

      // Đọc bản nháp từ cache nếu có
      const draft = await loadDraftCache();
      if (draft && Array.isArray(draft.rows) && draft.rows.length > 0) {
        setRows(draft.rows);
        if (draft.dateStr) setDateStr(draft.dateStr);
        isLoadedCacheRef.current = true;
        return;
      }

      // Khởi tạo sẵn 4 dòng trống ban đầu
      setRows([createEmptyRow(), createEmptyRow(), createEmptyRow(), createEmptyRow()]);
      isLoadedCacheRef.current = true;
    } catch (err) {
      console.error('[BATCH PAYMENT FETCH ERROR]', err);
      setError('Không thể tải danh sách khách hàng.');
    } finally {
      setLoading(false);
    }
  };

  // Tự động lưu bản nháp khi rows, dateStr thay đổi
  useEffect(() => {
    if (!visible || !isLoadedCacheRef.current) return;
    const hasData = rows.some((r) => r.selectedCustomerId || parseNumberString(r.amount) > 0);
    if (hasData) {
      saveDraftCache({
        rows,
        dateStr,
        savedAt: new Date().toISOString(),
      });
    }
  }, [rows, dateStr, visible]);

  // Xóa toàn bộ nháp
  const handleClearDraft = async () => {
    await clearDraftCache();
    setRows([createEmptyRow(), createEmptyRow(), createEmptyRow(), createEmptyRow()]);
    setError('');
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
  const handleAmountChange = (tempId, text, selectedCust) => {
    const rawNum = parseNumberString(text);
    if (selectedCust && selectedCust.debt > 0 && rawNum > selectedCust.debt) {
      const maxStr = formatNumberString(Math.round(selectedCust.debt).toString());
      handleUpdateRow(tempId, { amount: maxStr });
      setError(`Số tiền thu của [${selectedCust.name}] tự động điều chỉnh về mức nợ tối đa là ${formatCurrency(selectedCust.debt)}.`);
      return;
    }
    setError('');
    handleUpdateRow(tempId, { amount: formatNumberString(text) });
  };

  // Nút điền nhanh "Thu hết nợ hiện tại" cho khách hàng
  const handleFillAllDebt = (tempId, currentDebt) => {
    if (!currentDebt || currentDebt <= 0) return;
    handleUpdateRow(tempId, { amount: formatNumberString(Math.round(currentDebt).toString()) });
  };

  // Tính tổng số tiền thu và số khách hợp lệ
  const validRows = rows.filter((r) => r.selectedCustomerId && parseNumberString(r.amount) > 0);
  const totalBatchAmount = rows.reduce((sum, r) => sum + parseNumberString(r.amount), 0);

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
      const cust = customers.find((c) => c.id === row.selectedCustomerId);
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
      const promises = validRows.map((row) => {
        const payAmount = parseNumberString(row.amount);
        return api.post('/payments', {
          customerId: row.selectedCustomerId,
          amount: payAmount,
          paidAt: isoDate,
        });
      });

      await Promise.all(promises);

      // Đánh dấu tắt tự động lưu nháp
      isLoadedCacheRef.current = false;
      await clearDraftCache();

      // Reset về 4 dòng trống
      setRows([createEmptyRow(), createEmptyRow(), createEmptyRow(), createEmptyRow()]);

      if (onRefresh) onRefresh();

      setVisible(false);

      // Thông báo Toast thành công
      showGlobalToast(
        `Đã thu nợ thành công cho ${validRows.length} khách hàng với tổng tiền ${formatCurrency(totalBatchAmount)}.`,
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity style={styles.clearDraftBtnHeader} onPress={handleClearDraft}>
              <Text style={styles.clearDraftTextHeader}>🧹 Xóa nháp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeHeaderButton} onPress={() => setVisible(false)}>
              <Text style={styles.closeHeaderText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Thanh điều khiển trên cùng: Ngày thu tiền */}
        <View style={styles.topControlRow}>
          <View style={styles.datePickerWrapper}>
            <Text style={styles.dateLabel}>📅 Ngày thu tiền:</Text>
            <DatePickerInput
              value={dateStr}
              onChange={setDateStr}
              allowFuture={true}
              compact={true}
            />
          </View>
        </View>

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
              <Text style={[styles.thText, { flex: 2 }]}>Khách hàng trả nợ</Text>
              <Text style={[styles.thText, { flex: 1.5, textAlign: 'right' }]}>Số tiền thu (VNĐ)</Text>
              <Text style={[styles.thText, { width: 32, textAlign: 'center' }]}></Text>
            </View>

            {rows.map((row, index) => {
              const selectedCust = customers.find((c) => c.id === row.selectedCustomerId);
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
              const availableCustomers = customers.filter(
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
                      <TextInput
                        style={[
                          styles.amountInput,
                          amt > 0 && styles.amountInputActive,
                        ]}
                        placeholder="0 đ"
                        placeholderTextColor="#94A3B8"
                        keyboardType="number-pad"
                        value={row.amount}
                        onChangeText={(text) => handleAmountChange(row.tempId, text, selectedCust)}
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
  datePickerWrapper: {
    flexDirection: 'column',
  },
  dateLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#475569',
    marginBottom: 4,
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
  amountInput: {
    backgroundColor: '#FFFFFF',
    height: 38,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1E293B',
    textAlign: 'right',
    borderWidth: 1,
    borderColor: '#CBD5E1',
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
});
