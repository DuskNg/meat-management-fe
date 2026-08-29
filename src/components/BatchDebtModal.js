// meat-management-fe/src/components/BatchDebtModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef, useEffect } from 'react';
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
import PopupModal from './PopupModal';
import { api } from '../api/client';
import { COLORS, SHADOWS } from '../theme';
import { hasPin, isSessionValid } from '../store/pinStore';
import { showGlobalToast } from '../store/toastStore';
import { matchSearch } from '../utils/searchHelper';

// --- Helper: định dạng số hàng nghìn dấu chấm ---
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

// --- Helper: định dạng tiền tệ VNĐ ---
const formatCurrency = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
    .format(amount || 0)
    .replace('₫', 'đ');

// --- Helper: lấy ngày hôm nay định dạng DD/MM/YYYY ---
const getTodayFormatted = () => {
  const today = new Date();
  const d = String(today.getDate()).padStart(2, '0');
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const y = today.getFullYear();
  return `${d}/${m}/${y}`;
};

// --- Helper: chuyển chuỗi DD/MM/YYYY thành ISO string ---
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

import * as SecureStore from 'expo-secure-store';

const BATCH_DRAFT_KEY = 'meat_batch_debt_draft';

// Helper lưu nháp đa nền tảng (Web: localStorage, Mobile: SecureStore)
const saveDraftCache = async (data) => {
  try {
    const jsonValue = JSON.stringify(data);
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(BATCH_DRAFT_KEY, jsonValue);
      }
    } else {
      await SecureStore.setItemAsync(BATCH_DRAFT_KEY, jsonValue);
    }
  } catch (e) {
    console.error('Lỗi lưu nháp batch debt:', e);
  }
};

// Helper đọc nháp đa nền tảng
const loadDraftCache = async () => {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(BATCH_DRAFT_KEY);
        return raw ? JSON.parse(raw) : null;
      }
    } else {
      const raw = await SecureStore.getItemAsync(BATCH_DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    }
  } catch (e) {
    console.error('Lỗi đọc nháp batch debt:', e);
  }
  return null;
};

// Helper xóa nháp đa nền tảng
const clearDraftCache = async () => {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(BATCH_DRAFT_KEY);
      }
    } else {
      await SecureStore.deleteItemAsync(BATCH_DRAFT_KEY);
    }
  } catch (e) {
    console.error('Lỗi xóa nháp batch debt:', e);
  }
};

import CustomSelect from './CustomSelect';

const BatchDebtModal = forwardRef(({ onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('quick'); // 'quick' (Ghi nợ nhanh) hoặc 'detail' (Ghi nợ chi tiết)
  const [dateStr, setDateStr] = useState(getTodayFormatted());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Danh mục từ API
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  // Quản lý giá thịt riêng theo từng khách hàng { [customerId]: productListWithCustomPrices }
  const [custProductsMap, setCustProductsMap] = useState({});

  // State độc lập cho 2 tab Nợ nhanh & Nợ chi tiết
  const [quickRows, setQuickRows] = useState([]);
  const [detailRows, setDetailRows] = useState([]);

  // Getter & Setter động theo Tab đang hoạt động
  const rows = activeTab === 'quick' ? quickRows : detailRows;
  const setRows = (newRowsOrFn) => {
    if (activeTab === 'quick') {
      setQuickRows(newRowsOrFn);
    } else {
      setDetailRows(newRowsOrFn);
    }
  };

  const pinInputRef = useRef(null);
  const pinSetupRef = useRef(null);
  const popupRef = useRef(null);
  const mainScrollRef = useRef(null);
  const isSubmittingRef = useRef(false);
  const isLoadedCacheRef = useRef(false);
  // Counter tăng dần đảm bảo tempId/tempItemId luôn unique dù gọi liên tiếp trong cùng 1ms
  const rowIdCounterRef = useRef(1);

  // Tải danh mục thịt kèm giá riêng cho 1 khách hàng
  const fetchProductsForCustomer = async (customerId) => {
    if (!customerId || custProductsMap[customerId]) return;
    try {
      const res = await api.get(`/products?customerId=${customerId}`);
      const custProds = (res.data?.data || []).filter(
        (p) => p.name !== 'Tiền hàng' && !p.name.toLowerCase().startsWith('tiền')
      );
      setCustProductsMap((prev) => ({ ...prev, [customerId]: custProds }));
    } catch (e) {
      console.error('[FETCH CUST PRODUCTS ERROR]', e);
    }
  };

  // Phơi bày hàm điều khiển ra bên ngoài
  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true);
      setDateStr(getTodayFormatted());
      setActiveTab('quick');
      setError('');
      setCustProductsMap({});
      isLoadedCacheRef.current = false;
      fetchData();
    },
    close: () => setVisible(false),
  }));

  // Tự động lưu bản nháp khi quickRows, detailRows, activeTab, dateStr thay đổi
  useEffect(() => {
    if (!visible || !isLoadedCacheRef.current) return;
    const hasDataQuick = quickRows.some((r) => r.selectedCustomerId || parseNumberString(r.quickAmount) > 0);
    const hasDataDetail = detailRows.some((r) => r.selectedCustomerId || (r.items && r.items.some((i) => i.productId)));
    if (hasDataQuick || hasDataDetail) {
      saveDraftCache({
        quickRows,
        detailRows,
        activeTab,
        dateStr,
        savedAt: new Date().toISOString(),
      });
    }
  }, [quickRows, detailRows, activeTab, dateStr, visible]);

  // Tải danh sách khách hàng và sản phẩm thịt từ server
  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [custRes, prodRes] = await Promise.all([
        api.get('/customers?isBadDebt=false'),
        api.get('/products'),
      ]);

      const custData = custRes.data?.data || [];
      const prodData = (prodRes.data?.data || []).filter(
        (p) => p.name !== 'Tiền hàng' && !p.name.toLowerCase().startsWith('tiền')
      );

      setCustomers(custData);
      setProducts(prodData);

      // Gán lại ID mới cho các rows từ draft để tránh duplicate key từ cache cũ
      const sanitizeRows = (rows) => {
        if (!Array.isArray(rows)) return rows;
        return rows.map((r) => ({
          ...r,
          tempId: `row_${rowIdCounterRef.current++}`,
          items: Array.isArray(r.items)
            ? r.items.map((item) => ({
                ...item,
                tempItemId: `item_${rowIdCounterRef.current++}`,
              }))
            : r.items,
        }));
      };

      // Đọc bản nháp từ cache nếu có
      const draft = await loadDraftCache();
      if (draft && (draft.quickRows || draft.detailRows)) {
        if (Array.isArray(draft.quickRows) && draft.quickRows.length > 0) {
          // Sanitize: gán lại ID mới để tránh duplicate key từ cache cũ
          setQuickRows(sanitizeRows(draft.quickRows));
        } else {
          setQuickRows([createEmptyRow(prodData), createEmptyRow(prodData), createEmptyRow(prodData), createEmptyRow(prodData)]);
        }

        if (Array.isArray(draft.detailRows) && draft.detailRows.length > 0) {
          // Sanitize: gán lại ID mới để tránh duplicate key từ cache cũ
          setDetailRows(sanitizeRows(draft.detailRows));
        } else {
          setDetailRows([createEmptyRow(prodData), createEmptyRow(prodData), createEmptyRow(prodData), createEmptyRow(prodData)]);
        }

        if (draft.activeTab) setActiveTab(draft.activeTab);
        if (draft.dateStr) setDateStr(draft.dateStr);
        isLoadedCacheRef.current = true;
        return;
      }

      // Khởi tạo sẵn 4 dòng trống ban đầu cho cả 2 tab nếu không có nháp
      const initialQuick = [createEmptyRow(prodData), createEmptyRow(prodData), createEmptyRow(prodData), createEmptyRow(prodData)];
      const initialDetail = [createEmptyRow(prodData), createEmptyRow(prodData), createEmptyRow(prodData), createEmptyRow(prodData)];
      setQuickRows(initialQuick);
      setDetailRows(initialDetail);
      isLoadedCacheRef.current = true;
    } catch (err) {
      console.error('[BATCH DEBT FETCH ERROR]', err);
      setError('Không thể tải danh sách khách hàng và loại thịt.');
    } finally {
      setLoading(false);
    }
  };

  // Reset xóa toàn bộ nháp cho cả 2 tab
  const handleClearDraft = async () => {
    await clearDraftCache();
    const freshQuick = [createEmptyRow(products), createEmptyRow(products), createEmptyRow(products), createEmptyRow(products)];
    const freshDetail = [createEmptyRow(products), createEmptyRow(products), createEmptyRow(products), createEmptyRow(products)];
    setQuickRows(freshQuick);
    setDetailRows(freshDetail);
    setError('');
  };

  // Helper tạo 1 dòng ghi nợ mới với ID duy nhất tuyệt đối
  const createEmptyRow = (prodList = products) => ({
    tempId: `row_${rowIdCounterRef.current++}`,
    selectedCustomerId: null,
    // Dành cho Nợ Nhanh
    quickAmount: '',
    quickProductName: 'Tiền hàng',
    // Dành cho Nợ Chi Tiết (mặc định sẵn 3 dòng chọn loại thịt)
    items: [
      { tempItemId: `item_${rowIdCounterRef.current++}`, productId: null, quantity: '', price: '', unit: 'kg' },
      { tempItemId: `item_${rowIdCounterRef.current++}`, productId: null, quantity: '', price: '', unit: 'kg' },
      { tempItemId: `item_${rowIdCounterRef.current++}`, productId: null, quantity: '', price: '', unit: 'kg' },
    ],
  });

  // --- Các hàm thao tác trên hàng (rows) ---
  const handleAddRow = () => {
    setRows((prev) => [...prev, createEmptyRow()]);
    setTimeout(() => {
      mainScrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleRemoveRow = (tempId) => {
    setRows((prev) => prev.filter((r) => r.tempId !== tempId));
  };

  const handleUpdateRow = (tempId, updates) => {
    setRows((prev) =>
      prev.map((r) => (r.tempId === tempId ? { ...r, ...updates } : r))
    );
  };

  // Thêm loại thịt vào dòng đơn nợ chi tiết
  const handleAddItemToRow = (rowTempId) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.tempId !== rowTempId) return r;
        const newItem = {
          // Dùng counter tăng dần thay vì Date.now() + Math.random()
          tempItemId: `item_${rowIdCounterRef.current++}`,
          productId: null,
          quantity: '',
          price: '',
          unit: 'kg',
        };
        return { ...r, items: [...r.items, newItem] };
      })
    );
    setTimeout(() => {
      mainScrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  // Xóa loại thịt khỏi dòng đơn nợ chi tiết
  const handleRemoveItemFromRow = (rowTempId, tempItemId) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.tempId !== rowTempId) return r;
        const newItems = r.items.filter((i) => i.tempItemId !== tempItemId);
        return { ...r, items: newItems.length > 0 ? newItems : r.items };
      })
    );
  };

  // Cập nhật loại thịt trong dòng đơn nợ chi tiết
  const handleUpdateRowItem = (rowTempId, tempItemId, updates) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.tempId !== rowTempId) return r;
        return {
          ...r,
          items: r.items.map((i) =>
            i.tempItemId === tempItemId ? { ...i, ...updates } : i
          ),
        };
      })
    );
  };

  // --- Tính toán tổng tiền theo từng loại ---
  const getQuickRowTotal = (row) => parseNumberString(row.quickAmount);

  const getDetailRowTotal = (row) =>
    (row.items || []).reduce((sum, item) => {
      const q = parseFloat((item.quantity || '0').replace(',', '.')) || 0;
      const p = parseNumberString(item.price);
      const sub = item.amount !== undefined ? item.amount : Math.round(q * p);
      return sum + sub;
    }, 0);

  // Hàm tổng quát: tính tổng tiền theo loại row
  const getRowTotal = (row, type) => {
    if (type === 'quick') return getQuickRowTotal(row);
    if (type === 'detail') return getDetailRowTotal(row);
    // Fallback: dùng activeTab
    return activeTab === 'quick' ? getQuickRowTotal(row) : getDetailRowTotal(row);
  };

  // Gộp cả 2 tab để tính tổng chung hiển thị ở footer
  const validQuickRows = quickRows.filter((r) => r.selectedCustomerId && getQuickRowTotal(r) > 0);
  const validDetailRows = detailRows.filter((r) => r.selectedCustomerId && getDetailRowTotal(r) > 0);
  const totalBatchAmount =
    validQuickRows.reduce((s, r) => s + getQuickRowTotal(r), 0) +
    validDetailRows.reduce((s, r) => s + getDetailRowTotal(r), 0);
  const validRowsCount = validQuickRows.length + validDetailRows.length;

  // --- Kiểm tra PIN và Gửi dữ liệu ---
  const requirePin = async (action) => {
    const pinExists = await hasPin();
    if (!pinExists) {
      pinSetupRef.current?.open(action);
      return;
    }
    const sessionOk = await isSessionValid();
    if (sessionOk) {
      action();
    } else {
      pinInputRef.current?.open(action, 'nhập nợ hàng loạt');
    }
  };

  const handleSubmit = async () => {
    if (loading || isSubmittingRef.current) return;

    const isoDate = parseDateString(dateStr);
    if (!isoDate) {
      setError('Ngày ghi nợ không đúng định dạng (VD: 25/08/2026).');
      return;
    }

    // Lấy các dòng hợp lệ từ CẢ 2 TAB
    const validQuick = quickRows.filter((r) => r.selectedCustomerId && getQuickRowTotal(r) > 0);
    const validDetail = detailRows.filter((r) => r.selectedCustomerId && getDetailRowTotal(r) > 0);

    if (validQuick.length === 0 && validDetail.length === 0) {
      setError('Vui lòng chọn khách hàng và nhập số tiền nợ cho ít nhất 1 dòng (ở bất kỳ tab nào).');
      return;
    }

    // Validate chi tiết: kiểm tra SL & đơn giá cho các dòng nợ chi tiết
    for (const row of validDetail) {
      const custName = customers.find((c) => c.id === row.selectedCustomerId)?.name || 'Khách hàng';
      for (const item of row.items) {
        const q = parseFloat((item.quantity || '0').replace(',', '.'));
        const p = parseNumberString(item.price);
        if (item.productId && (isNaN(q) || q <= 0)) {
          setError(`Vui lòng nhập khối lượng > 0 cho đơn của [${custName}].`);
          return;
        }
        if (item.productId && p <= 0) {
          setError(`Vui lòng nhập đơn giá > 0 cho đơn của [${custName}].`);
          return;
        }
      }
    }

    setError('');
    setLoading(true);
    isSubmittingRef.current = true;

    try {
      // Tạo các promise cho NỢ NHANH
      const quickPromises = validQuick.map((row) => {
        const amount = getQuickRowTotal(row);
        return api.post('/transactions', {
          customerId: row.selectedCustomerId,
          date: isoDate,
          note: 'Ghi nợ nhanh hàng loạt',
          source: 'BATCH_QUICK',
          isBatch: true,
          items: [{ productName: 'Tiền hàng', quantity: 1, price: amount }],
        });
      });

      // Tạo các promise cho NỢ CHI TIẾT
      const detailPromises = validDetail.map((row) => {
        const formattedItems = row.items
          .filter((i) => i.productId && parseFloat((i.quantity || '0').replace(',', '.')) > 0)
          .map((i) => ({
            productId: i.productId,
            quantity: parseFloat((i.quantity || '0').replace(',', '.')),
            price: parseNumberString(i.price),
          }));
        return api.post('/transactions', {
          customerId: row.selectedCustomerId,
          date: isoDate,
          note: 'Ghi nợ chi tiết hàng loạt',
          source: 'BATCH_DETAIL',
          isBatch: true,
          items: formattedItems,
        });
      });

      // Submit tất cả cùng lúc (parallel)
      await Promise.all([...quickPromises, ...detailPromises]);

      // Đánh dấu tắt chế độ tự lưu để useEffect không ghi đè dữ liệu vừa submit vào cache
      isLoadedCacheRef.current = false;

      // Xóa sạch cache nháp trong storage
      await clearDraftCache();
      setCustProductsMap({});

      // Reset state 2 tab về 4 dòng trống chuẩn bị cho lần nhập tiếp theo
      const freshQuick = [createEmptyRow(products), createEmptyRow(products), createEmptyRow(products), createEmptyRow(products)];
      const freshDetail = [createEmptyRow(products), createEmptyRow(products), createEmptyRow(products), createEmptyRow(products)];
      setQuickRows(freshQuick);
      setDetailRows(freshDetail);

      if (onRefresh) onRefresh();

      // Đóng modal ngay lập tức
      setVisible(false);

      // Phát thông báo Toast toàn cục (Global Toast)
      const totalSaved = validQuick.length + validDetail.length;
      showGlobalToast(
        `Đã lưu thành công ${totalSaved} đơn nợ mới với tổng tiền ${formatCurrency(totalBatchAmount)}.`,
        'success'
      );
    } catch (err) {
      console.error('[BATCH DEBT SUBMIT ERROR]', err);
      setError(err.response?.data?.message || 'Có lỗi khi lưu ghi nợ hàng loạt. Vui lòng thử lại.');
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalViewFullScreen}>
        {/* Header Modal Full Màn Hình Cực Kỳ Tinh Gọn */}
        <View style={styles.modalHeader}>
          <View style={styles.titleRow}>
            <Text style={styles.modalTitle}>⚡ NHẬP CÔNG NỢ HÀNG LOẠT</Text>
          </View>
          <TouchableOpacity style={styles.closeHeaderButton} onPress={() => setVisible(false)}>
            <Text style={styles.closeHeaderText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Thanh Điều Khiển: Tab Chuyển Đổi & Chọn Ngày */}
        <View style={styles.topControlRow}>
          <View style={styles.segmentedTabContainer}>
            <TouchableOpacity
              style={[styles.segTabBtn, activeTab === 'quick' && styles.segTabBtnActive]}
              onPress={() => {
                setActiveTab('quick');
                setError('');
              }}
            >
              <Text style={[styles.segTabBtnText, activeTab === 'quick' && styles.segTabBtnTextActive]}>
                ⚡ Nợ nhanh (Tổng tiền)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.segTabBtn, activeTab === 'detail' && styles.segTabBtnActive]}
              onPress={() => {
                setActiveTab('detail');
                setError('');
              }}
            >
              <Text style={[styles.segTabBtnText, activeTab === 'detail' && styles.segTabBtnTextActive]}>
                🥩 Nợ chi tiết (Theo thịt)
              </Text>
            </TouchableOpacity>
          </View>

          {/* Phần Ngày ghi nợ chung 1 hàng ngang */}
          <View style={styles.datePickerSection}>
            <View style={styles.dateAndDraftRow}>
              <Text style={styles.dateLabelInline}>📅 Ngày ghi nợ:</Text>
              <DatePickerInput
                value={dateStr}
                onChange={setDateStr}
                allowFuture={true}
                compact={true}
              />
              <TouchableOpacity style={styles.clearDraftBtnHeader} onPress={handleClearDraft}>
                <Text style={styles.clearDraftTextHeader}>🧹 Xóa nháp</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Thông báo lỗi */}
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        ) : null}

        {/* ── BẢNG DANH SÁCH KHÁCH HÀNG NỢ FULL HEIGHT ── */}
        <ScrollView
          ref={mainScrollRef}
          style={styles.mainScrollFull}
          contentContainerStyle={styles.mainScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {activeTab === 'quick' ? (
            /* ──────────────── TAB 1: NỢ NHANH ──────────────── */
            <View style={styles.quickTableContainer}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.thText, { flex: 2.2 }]}>Khách hàng nợ</Text>
                <Text style={[styles.thText, { flex: 1.2, textAlign: 'right' }]}>Số tiền nợ (VNĐ)</Text>
                <Text style={[styles.thText, { width: 32, textAlign: 'center' }]}></Text>
              </View>

              {rows.map((row, index) => {
                const selectedCust = customers.find((c) => c.id === row.selectedCustomerId);
                const amt = parseNumberString(row.quickAmount);
                const rowZIndex = (rows.length - index) * 10;

                return (
                  <View key={row.tempId} style={[styles.quickTableRow, { zIndex: rowZIndex, elevation: rowZIndex }]}>
                    {/* Ô chọn khách hàng */}
                    <View style={{ flex: 2.2, marginRight: 8 }}>
                      <CustomSelect
                        value={selectedCust}
                        placeholder="Chọn khách hàng..."
                        options={customers}
                        onSelect={(c) => handleUpdateRow(row.tempId, { selectedCustomerId: c.id })}
                        renderSelected={(c) => c.name}
                        renderOption={(c) => (
                          <View style={styles.custOptionRow}>
                            <Text style={styles.custOptionName}>{c.name}</Text>
                            {c.phone ? <Text style={styles.custOptionPhone}>📞 {c.phone}</Text> : null}
                          </View>
                        )}
                        compact={true}
                      />
                    </View>

                    {/* Ô nhập số tiền nợ */}
                    <View style={{ flex: 1.2 }}>
                      <MoneyInput
                        style={[
                          styles.tableMoneyInputContainer,
                          amt > 0 && styles.quickAmountInputActive,
                        ]}
                        inputStyle={styles.tableMoneyInputText}
                        value={row.quickAmountVND || (row.quickAmount ? parseNumberString(row.quickAmount) : 0)}
                        onChangeValue={(val) => {
                          handleUpdateRow(row.tempId, {
                            quickAmountVND: val,
                            quickAmount: formatNumberString(val.toString()),
                          });
                        }}
                        placeholder="0"
                        textAlign="right"
                      />
                    </View>

                    {/* Nút Xóa Dòng (Nhỏ gọn tinh tế) */}
                    <TouchableOpacity
                      style={styles.deleteRowBtnMini}
                      onPress={() => handleRemoveRow(row.tempId)}
                    >
                      <Text style={styles.deleteRowBtnMiniText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ) : (
            /* ──────────────── TAB 2: NỢ CHI TIẾT ──────────────── */
            <View style={styles.detailListContainer}>
              {rows.map((row, index) => {
                const selectedCust = customers.find((c) => c.id === row.selectedCustomerId);
                const rowTotal = getRowTotal(row);
                const cardZIndex = (rows.length - index) * 10;

                return (
                  <View key={row.tempId} style={[styles.detailCustCard, { zIndex: cardZIndex, elevation: cardZIndex }]}>
                    {/* Header Card Khách Hàng - Đặt zIndex cao = 100 để dropdown khách hàng đè lên bảng thịt ở dưới */}
                    <View style={styles.custCardHeader}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <CustomSelect
                          value={selectedCust}
                          placeholder="Chọn khách hàng nợ..."
                          options={customers}
                          onSelect={(c) => {
                            handleUpdateRow(row.tempId, { selectedCustomerId: c.id });
                            fetchProductsForCustomer(c.id);
                          }}
                          renderSelected={(c) => c.name}
                          renderOption={(c) => (
                            <View style={styles.custOptionRow}>
                              <Text style={styles.custOptionName}>{c.name}</Text>
                              {c.phone ? <Text style={styles.custOptionPhone}>📞 {c.phone}</Text> : null}
                            </View>
                          )}
                          compact={true}
                        />
                      </View>

                      <View style={styles.custTotalBadge}>
                        <Text style={styles.custTotalText}>{formatCurrency(rowTotal)}</Text>
                      </View>

                      <TouchableOpacity
                        style={styles.deleteRowBtnMini}
                        onPress={() => handleRemoveRow(row.tempId)}
                      >
                        <Text style={styles.deleteRowBtnMiniText}>✕</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Bảng Mặt Hàng Thịt - Đặt zIndex thấp hơn header = 1 */}
                    <View style={styles.meatSubTable}>
                      <View style={styles.meatTableHeader}>
                        <Text style={[styles.meatTh, { flex: 2 }]}>Loại thịt</Text>
                        <Text style={[styles.meatTh, { flex: 1, textAlign: 'center' }]}>SL (kg)</Text>
                        <Text style={[styles.meatTh, { flex: 1.4, textAlign: 'center' }]}>Đơn giá (đ)</Text>
                        <Text style={[styles.meatTh, { flex: 1.4, textAlign: 'right' }]}>Thành tiền</Text>
                        <View style={{ width: 24 }} />
                      </View>

                      {(() => {
                        const availableProducts = (row.selectedCustomerId && custProductsMap[row.selectedCustomerId]) || products;
                        return row.items.map((item, itemIdx) => {
                          const selectedProd = availableProducts.find((p) => p.id === item.productId) || products.find((p) => p.id === item.productId);
                          const q = parseFloat((item.quantity || '0').replace(',', '.')) || 0;
                          const p = parseNumberString(item.price);
                          const itemSubtotal = item.amount !== undefined ? item.amount : Math.round(q * p);
                          const itemZIndex = (row.items.length - itemIdx) * 10;

                          return (
                            <View key={item.tempItemId} style={[styles.meatTableRow, { zIndex: itemZIndex, elevation: itemZIndex }]}>
                              <View style={{ flex: 2, marginRight: 4 }}>
                                <CustomSelect
                                  value={selectedProd}
                                  placeholder="Chọn thịt..."
                                  options={availableProducts}
                                  onSelect={(prod) => {
                                    const qVal = parseFloat((item.quantity || '0').replace(',', '.')) || 0;
                                    const pVal = prod.defaultPrice || 0;
                                    handleUpdateRowItem(row.tempId, item.tempItemId, {
                                      productId: prod.id,
                                      price: formatNumberString(pVal),
                                      unit: prod.unit || 'kg',
                                      amount: Math.round(qVal * pVal),
                                    });
                                  }}
                                  renderSelected={(prod) => prod.name}
                                  renderOption={(prod) => (
                                    <View style={styles.custOptionRow}>
                                      <Text style={styles.custOptionName}>{prod.name}</Text>
                                      <Text style={styles.custOptionPhone}>{formatCurrency(prod.defaultPrice)}/{prod.unit}</Text>
                                    </View>
                                  )}
                                  compact={true}
                                />
                              </View>

                             <View style={{ flex: 1, marginRight: 4 }}>
                              <TextInput
                                style={styles.compactInput}
                                placeholder="0"
                                placeholderTextColor="#94A3B8"
                                keyboardType="decimal-pad"
                                value={item.quantity !== undefined && item.quantity !== null ? String(item.quantity) : ''}
                                selectTextOnFocus={true}
                                onChangeText={(text) => {
                                  const filtered = text.replace(/[^0-9.,]/g, '');
                                  const qVal = parseFloat(filtered.replace(',', '.')) || 0;
                                  const pVal = parseNumberString(item.price);
                                  const amtVal = item.amount !== undefined ? item.amount : 0;

                                  let updates = { quantity: filtered };

                                  if (pVal > 0) {
                                    // Đã có Đơn giá -> tính Thành tiền = SL * Giá
                                    updates.amount = Math.round(qVal * pVal);
                                  } else if (amtVal > 0 && qVal > 0) {
                                    // Chưa có Đơn giá nhưng đã có Thành tiền -> tính Đơn giá = Thành tiền / SL
                                    const calcPrice = Math.round(amtVal / qVal);
                                    updates.price = formatNumberString(calcPrice.toString());
                                  }

                                  handleUpdateRowItem(row.tempId, item.tempItemId, updates);
                                }}
                              />
                            </View>

                            <View style={{ flex: 1.4, marginRight: 4 }}>
                              <MoneyInput
                                style={styles.subtableMoneyInputContainer}
                                inputStyle={styles.subtableMoneyInputText}
                                value={p}
                                onChangeValue={(pVal) => {
                                  const qVal = parseFloat((item.quantity || '0').replace(',', '.')) || 0;
                                  const amtVal = item.amount !== undefined ? item.amount : 0;

                                  let updates = { price: formatNumberString(pVal.toString()) };

                                  if (qVal > 0) {
                                    // Đã có Số lượng -> tính Thành tiền = SL * Giá
                                    updates.amount = Math.round(qVal * pVal);
                                  } else if (amtVal > 0 && pVal > 0) {
                                    // Chưa có Số lượng nhưng đã có Thành tiền -> tính Số lượng = Thành tiền / Giá
                                    const newQty = amtVal / pVal;
                                    const roundedQty = Math.round(newQty * 100) / 100;
                                    updates.quantity = Number.isInteger(roundedQty) ? String(roundedQty) : roundedQty.toFixed(2);
                                  }

                                  handleUpdateRowItem(row.tempId, item.tempItemId, updates);
                                }}
                                placeholder="0"
                                textAlign="right"
                              />
                            </View>

                            <View style={{ flex: 1.4, marginRight: 4 }}>
                              <MoneyInput
                                style={styles.subtableMoneyInputContainer}
                                inputStyle={[styles.subtableMoneyInputText, { color: '#DC2626', fontWeight: '600' }]}
                                value={item.amount !== undefined && item.amount !== null ? item.amount : itemSubtotal}
                                onChangeValue={(amtVal) => {
                                  const qVal = parseFloat((item.quantity || '0').replace(',', '.')) || 0;

                                  let updates = { amount: amtVal };

                                  if (p > 0) {
                                    // Đã có Đơn giá -> tính Số lượng = Thành tiền / Giá
                                    const newQty = p > 0 ? amtVal / p : 0;
                                    const roundedQty = Math.round(newQty * 100) / 100;
                                    updates.quantity = Number.isInteger(roundedQty) ? String(roundedQty) : roundedQty.toFixed(2);
                                  } else if (qVal > 0) {
                                    // Chưa có Đơn giá nhưng đã có Số lượng -> tính Đơn giá = Thành tiền / SL
                                    const calcPrice = Math.round(amtVal / qVal);
                                    updates.price = formatNumberString(calcPrice.toString());
                                  }

                                  handleUpdateRowItem(row.tempId, item.tempItemId, updates);
                                }}
                                placeholder="0"
                                textAlign="right"
                              />
                            </View>

                            <TouchableOpacity
                              style={styles.deleteItemBtnMini}
                              onPress={() => handleRemoveItemFromRow(row.tempId, item.tempItemId)}
                            >
                              <Text style={styles.deleteItemBtnMiniText}>✕</Text>
                            </TouchableOpacity>
                          </View>
                        );
                        });
                      })()}

                      <TouchableOpacity
                        style={styles.addMeatBtn}
                        onPress={() => handleAddItemToRow(row.tempId)}
                      >
                        <Text style={styles.addMeatBtnText}>🥩 + Thêm loại thịt</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

        </ScrollView>

        {/* Nút Thêm Khách Nợ Mới - GIỮ CỐ ĐỊNH PHÍA TRÊN FOOTER */}
        <TouchableOpacity style={styles.addCustomerBtnSticky} onPress={handleAddRow} activeOpacity={0.85}>
          <Text style={styles.addCustomerBtnText}>➕ THÊM DÒNG KHÁCH NỢ MỚI</Text>
        </TouchableOpacity>

        {/* ── FOOTER DÀNH CHO BÁN NỢ HÀNG LOẠT ── */}
        <View style={styles.modalFooter}>
          <View style={styles.footerSummaryBox}>
            <Text style={styles.summaryCountText}>
              Đã ghi: <Text style={styles.summaryCountBold}>{validRowsCount}</Text> khách
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
                (validRowsCount === 0 || loading) && styles.submitBtnDisabled,
              ]}
              onPress={() => requirePin(handleSubmit)}
              disabled={validRowsCount === 0 || loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {`XÁC NHẬN LƯU (${validRowsCount} ĐƠN)`}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Modals hỗ trợ PIN & Popup */}
      <PinInputModal ref={pinInputRef} />
      <PinSetupModal ref={pinSetupRef} />
      <PopupModal ref={popupRef} />
    </SmoothModal>
  );
});

export default BatchDebtModal;

const styles = StyleSheet.create({
  modalViewFullScreen: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    height: '100%',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    justifyContent: 'space-between',
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#991B1B',
    letterSpacing: 0.3,
  },
  closeHeaderButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeHeaderText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#64748B',
  },
  clearDraftBtnHeader: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  clearDraftTextHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
  },
  topControlRow: {
    flexDirection: 'column',
    marginTop: 8,
    marginBottom: 8,
    gap: 8,
  },
  segmentedTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 2,
    width: '100%',
  },
  segTabBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
  },
  segTabBtnActive: {
    backgroundColor: '#FFFFFF',
    ...SHADOWS.small,
  },
  segTabBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  segTabBtnTextActive: {
    color: '#991B1B',
    fontWeight: 'bold',
  },
  datePickerSection: {
    marginTop: 4,
  },
  dateAndDraftRow: {
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
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
  },
  mainScrollFull: {
    flex: 1,
    marginVertical: 4,
  },
  mainScrollContent: {
    paddingBottom: 24,
  },

  /* TAB 1: NỢ NHANH STYLES */
  quickTableContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'visible',
    position: 'relative',
    zIndex: 500,
    elevation: 500,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  thText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  quickTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },
  tableMoneyInputContainer: {
    height: 34,
    borderRadius: 6,
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1,
  },
  tableMoneyInputText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  quickAmountInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 34,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    textAlign: 'right',
  },
  quickAmountInputActive: {
    borderColor: '#EF4444',
    color: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  deleteRowBtnMini: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  deleteRowBtnMiniText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#EF4444',
  },

  /* TAB 2: NỢ CHI TIẾT STYLES */
  detailListContainer: {
    gap: 5,
    position: 'relative',
    zIndex: 500,
    elevation: 500,
  },
  detailCustCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#6366F1', // Viền màu Tím Xanh Indigo nổi bật
    padding: 6,
    position: 'relative',
    ...SHADOWS.small,
  },
  custCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    position: 'relative',
    zIndex: 100, // Đặt zIndex cao để SelectDropdown của header luôn đè lên meatSubTable phía dưới
    elevation: 100,
  },
  custTotalBadge: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    marginRight: 4,
  },
  custTotalText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#DC2626',
  },
  meatSubTable: {
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    padding: 5,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    position: 'relative',
    zIndex: 1, // Đặt zIndex thấp hơn header
    elevation: 1,
  },
  meatTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 3,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  meatTh: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  meatTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    position: 'relative',
  },
  subtableMoneyInputContainer: {
    borderWidth: 1,
    borderColor: '#94A3B8',
    borderRadius: 5,
    paddingHorizontal: 4,
    height: 26,
    backgroundColor: '#FFFFFF',
  },
  subtableMoneyInputText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0F172A',
  },
  compactInput: {
    borderWidth: 1,
    borderColor: '#94A3B8',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 0,
    height: 26,
    fontSize: 11,
    fontWeight: '600',
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  itemSubtotalText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  deleteItemBtnMini: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 3,
  },
  deleteItemBtnMiniText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#EF4444',
  },
  addMeatBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 8,
    backgroundColor: '#E0F2FE',
    borderRadius: 5,
    marginTop: 2,
  },
  addMeatBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },

  /* NÚT THÊM KHÁCH MỚI CỐ ĐỊNH */
  addCustomerBtnSticky: {
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    marginVertical: 4,
    ...SHADOWS.small,
  },
  addCustomerBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },

  /* FOOTER STYLES */
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
    marginTop: 4,
  },
  footerSummaryBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryCountText: {
    fontSize: 13,
    color: '#475569',
  },
  summaryCountBold: {
    fontWeight: 'bold',
    color: '#0F172A',
  },
  summaryTotalText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#DC2626',
  },
  footerActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  submitBtn: {
    flex: 2,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  submitBtnDisabled: {
    backgroundColor: '#FCA5A5',
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  /* SELECT DROPDOWN STYLES */
  selectWrapper: {
    position: 'relative',
    zIndex: 100,
    elevation: 100,
  },
  selectWrapperOpen: {
    zIndex: 99999,
    elevation: 99999,
  },
  selectTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    height: 34,
  },
  selectTriggerCompact: {
    height: 32,
    paddingHorizontal: 8,
  },
  selectTriggerOpen: {
    borderColor: '#2563EB',
  },
  selectTriggerInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    padding: 0,
  },
  selectTriggerTextCompact: {
    fontSize: 13,
  },
  selectPlaceholder: {
    color: '#94A3B8',
  },
  selectArrow: {
    fontSize: 10,
    color: '#94A3B8',
    marginLeft: 4,
  },
  selectDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    maxHeight: 180,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    marginTop: 2,
    ...SHADOWS.large,
    zIndex: 999999,
    elevation: 999999,
  },
  selectDropdownScroll: {
    maxHeight: 175,
  },
  selectOption: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  selectOptionCompact: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  selectOptionText: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
  },
  selectEmptyText: {
    fontSize: 12,
    color: '#94A3B8',
    padding: 10,
    textAlign: 'center',
  },
  custOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  custOptionName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  custOptionPhone: {
    fontSize: 11,
    color: '#64748B',
  },
});
