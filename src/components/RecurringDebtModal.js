// meat-management-fe/src/components/RecurringDebtModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef, useEffect, useMemo } from 'react';
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
import CustomSelect from './CustomSelect';
import MoneyInput from './MoneyInput';
import PopupModal from './PopupModal';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import { showGlobalToast } from '../store/toastStore';

// Helper định dạng tiền VNĐ
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  })
    .format(amount || 0)
    .replace('₫', 'đ');
};

const RecurringDebtModal = forwardRef(({ onRefresh }, ref) => {
  const popupRef = useRef(null);
  const scrollRef = useRef(null);

  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Danh sách các mẫu đơn nợ cố định
  const [recurringDebts, setRecurringDebts] = useState([]);

  // Danh mục dữ liệu
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [custProductsMap, setCustProductsMap] = useState({});

  // Tab thêm mới: 'quick' (Nhập nhanh) hoặc 'detail' (Nhập chi tiết)
  const [activeTab, setActiveTab] = useState('quick');

  // Đang ở chế độ chỉnh sửa đơn nào (nếu có)
  const [editingDebtId, setEditingDebtId] = useState(null);

  // ─── STATE TAB NHẬP NHANH ───
  const [quickCustomer, setQuickCustomer] = useState(null);
  const [quickAmountVND, setQuickAmountVND] = useState(0);
  const [quickProfitPercent, setQuickProfitPercent] = useState('');
  const [quickNote, setQuickNote] = useState('');

  // ─── STATE TAB NHẬP CHI TIẾT ───
  const [detailCustomer, setDetailCustomer] = useState(null);
  const [cartItems, setCartItems] = useState([]);
  const [currentProduct, setCurrentProduct] = useState(null);
  const [currentQuantity, setCurrentQuantity] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [currentCostPrice, setCurrentCostPrice] = useState('');
  const [detailNote, setDetailNote] = useState('');

  // Phơi bày hàm open/close ra bên ngoài
  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true);
      setError('');
      resetForm();
      fetchData();
    },
    close: () => {
      setVisible(false);
    },
    refetch: () => {
      fetchData();
    },
  }));

  // Reset toàn bộ form về mặc định
  const resetForm = () => {
    setEditingDebtId(null);
    setQuickCustomer(null);
    setQuickAmountVND(0);
    setQuickProfitPercent('');
    setQuickNote('');

    setDetailCustomer(null);
    setCartItems([]);
    setCurrentProduct(null);
    setCurrentQuantity('');
    setCurrentPrice('');
    setCurrentCostPrice('');
    setDetailNote('');
    setError('');
  };

  // Tải dữ liệu từ máy chủ
  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [debtsRes, custRes, prodRes] = await Promise.all([
        api.get('/recurring-debts'),
        api.get('/customers'),
        api.get('/products'),
      ]);

      setRecurringDebts(debtsRes.data?.data || []);
      setCustomers((custRes.data?.data || []).filter((c) => c.isActive && !c.isBadDebt));
      setProducts((prodRes.data?.data || []).filter((p) => p.name !== 'Tiền hàng' && !p.name.toLowerCase().startsWith('tiền')));
    } catch (err) {
      console.error('[FETCH RECURRING DEBTS ERROR]:', err);
      setError('Không thể tải dữ liệu đơn nợ cố định.');
    } finally {
      setLoading(false);
    }
  };

  // Tải bảng giá riêng của khách hàng khi chọn khách hàng ở tab Chi tiết
  const fetchCustomerPrices = async (customerId) => {
    if (!customerId || custProductsMap[customerId]) return;
    try {
      const res = await api.get('/products', { params: { customerId } });
      const customerSpecificProducts = (res.data?.data || []).filter(
        (p) => p.name !== 'Tiền hàng' && !p.name.toLowerCase().startsWith('tiền')
      );
      setCustProductsMap((prev) => ({ ...prev, [customerId]: customerSpecificProducts }));
    } catch (err) {
      console.error('[FETCH CUSTOMER PRICES ERROR]:', err);
    }
  };

  // Danh sách sản phẩm khả dụng theo khách hàng được chọn
  const availableProducts = useMemo(() => {
    if (detailCustomer && custProductsMap[detailCustomer.id]) {
      return custProductsMap[detailCustomer.id];
    }
    return products;
  }, [detailCustomer, custProductsMap, products]);

  // Xử lý khi chọn sản phẩm ở tab Chi tiết
  const handleSelectProduct = (prod) => {
    if (!prod) {
      setCurrentProduct(null);
      setCurrentPrice('');
      setCurrentCostPrice('');
      return;
    }
    setCurrentProduct(prod);
    const pPrice = parseFloat(prod.price !== undefined ? prod.price : prod.defaultPrice || 0);
    const pCost = parseFloat(prod.costPrice || 0);
    setCurrentPrice(pPrice > 0 ? String(pPrice) : '');
    setCurrentCostPrice(pCost > 0 ? String(pCost) : '');
  };

  // Thêm 1 dòng mặt hàng vào giỏ hàng tab Chi tiết
  const handleAddToCart = () => {
    if (!currentProduct) {
      popupRef.current?.show({
        title: 'Chưa chọn loại thịt',
        message: 'Vui lòng chọn loại thịt cần lên đơn.',
        type: 'alert',
      });
      return;
    }

    const qty = parseFloat(currentQuantity);
    if (isNaN(qty) || qty <= 0) {
      popupRef.current?.show({
        title: 'Số lượng không hợp lệ',
        message: 'Vui lòng nhập số lượng hợp lệ (lớn hơn 0).',
        type: 'alert',
      });
      return;
    }

    const priceNum = parseFloat(currentPrice) || 0;
    const costNum = parseFloat(currentCostPrice) || 0;
    const amount = Math.round(qty * priceNum);
    const profit = Math.round(amount - qty * costNum);

    const newItem = {
      productId: currentProduct.id,
      productName: currentProduct.name,
      unit: currentProduct.unit || 'kg',
      quantity: qty,
      price: priceNum,
      costPrice: costNum,
      amount,
      profit,
    };

    // Nếu sản phẩm đã có trong giỏ thì cập nhật
    const existingIndex = cartItems.findIndex((item) => item.productId === currentProduct.id);
    if (existingIndex >= 0) {
      const updated = [...cartItems];
      updated[existingIndex] = newItem;
      setCartItems(updated);
    } else {
      setCartItems([...cartItems, newItem]);
    }

    // Reset ô nhập dòng hiện tại
    setCurrentProduct(null);
    setCurrentQuantity('');
    setCurrentPrice('');
    setCurrentCostPrice('');
  };

  // Xóa 1 mặt hàng khỏi giỏ hàng
  const handleRemoveCartItem = (index) => {
    setCartItems(cartItems.filter((_, idx) => idx !== index));
  };

  // Tính tổng tiền & lợi nhuận tạm tính cho giỏ hàng chi tiết
  const detailTotalAmount = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.amount, 0);
  }, [cartItems]);

  const detailTotalProfit = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.profit, 0);
  }, [cartItems]);

  // Xử lý nạp dữ liệu để Sửa đơn nợ cố định
  const handleEdit = (debt) => {
    setEditingDebtId(debt.id);
    const isQuick = debt.items?.length === 1 && (debt.items[0].product?.name === 'Tiền hàng' || debt.items[0].product?.name?.toLowerCase().startsWith('tiền'));

    if (isQuick) {
      setActiveTab('quick');
      setQuickCustomer(debt.customer);
      setQuickAmountVND(parseFloat(debt.totalAmount || 0));
      setQuickProfitPercent(debt.profitPercent ? String(debt.profitPercent) : '');
      setQuickNote(debt.note || '');
    } else {
      setActiveTab('detail');
      setDetailCustomer(debt.customer);
      if (debt.customerId) {
        fetchCustomerPrices(debt.customerId);
      }
      setCartItems(
        (debt.items || []).map((i) => ({
          productId: i.productId,
          productName: i.product?.name || 'Thịt',
          unit: i.product?.unit || 'kg',
          quantity: parseFloat(i.quantity || 0),
          price: parseFloat(i.price || 0),
          costPrice: parseFloat(i.costPrice || 0),
          amount: parseFloat(i.amount || 0),
          profit: parseFloat(i.profit || 0),
        }))
      );
      setDetailNote(debt.note || '');
    }

    // Cuộn xuống phần form nhập
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  // Xóa đơn nợ cố định
  const handleDelete = (debt) => {
    popupRef.current?.show({
      title: 'Xác nhận xóa đơn cố định',
      message: `Bạn có chắc muốn xóa đơn nợ cố định của khách hàng ${debt.customer?.name || 'này'} không? Hệ thống sẽ không tự động lên đơn này từ ngày mai.`,
      type: 'confirm',
      confirmText: 'Xóa ngay',
      cancelText: 'Hủy',
      onConfirm: async () => {
        try {
          await api.delete(`/recurring-debts/${debt.id}`);
          showGlobalToast({
            title: 'Đã xóa đơn cố định',
            message: 'Đơn nợ cố định đã được gỡ bỏ.',
            type: 'success',
          });
          fetchData();
          if (editingDebtId === debt.id) {
            resetForm();
          }
          if (onRefresh) onRefresh();
        } catch (err) {
          console.error('[DELETE RECURRING DEBT ERROR]:', err);
          showGlobalToast({
            title: 'Lỗi',
            message: 'Không thể xóa đơn nợ cố định.',
            type: 'error',
          });
        }
      },
    });
  };

  // Lưu đơn nợ cố định dạng Nhập Nhanh
  const handleSaveQuick = async () => {
    if (!quickCustomer) {
      popupRef.current?.show({
        title: 'Chưa chọn khách hàng',
        message: 'Vui lòng chọn khách hàng cần tạo đơn nợ cố định.',
        type: 'alert',
      });
      return;
    }

    if (!quickAmountVND || quickAmountVND <= 0) {
      popupRef.current?.show({
        title: 'Chưa nhập số tiền',
        message: 'Vui lòng nhập số tiền nợ hợp lệ lớn hơn 0.',
        type: 'alert',
      });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        customerId: quickCustomer.id,
        note: quickNote.trim() || 'Đơn nợ nhanh cố định hàng ngày',
        profitPercent: quickProfitPercent ? parseFloat(quickProfitPercent) : null,
        items: [
          {
            productName: 'Tiền hàng',
            quantity: 1,
            price: quickAmountVND,
            unit: 'lần',
          },
        ],
      };

      if (editingDebtId) {
        await api.put(`/recurring-debts/${editingDebtId}`, payload);
        showGlobalToast({
          title: 'Thành công',
          message: 'Đã cập nhật đơn nợ cố định hàng ngày!',
          type: 'success',
        });
      } else {
        await api.post('/recurring-debts', payload);
        showGlobalToast({
          title: 'Thành công',
          message: 'Đã thêm đơn nợ cố định mới (tự động lên đơn lúc 0:30 mỗi ngày)!',
          type: 'success',
        });
      }

      resetForm();
      fetchData();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('[SAVE QUICK RECURRING DEBT ERROR]:', err);
      popupRef.current?.show({
        title: 'Lỗi lưu đơn cố định',
        message: err.response?.data?.message || 'Không thể lưu đơn nợ cố định.',
        type: 'alert',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Lưu đơn nợ cố định dạng Nhập Chi Tiết
  const handleSaveDetail = async () => {
    if (!detailCustomer) {
      popupRef.current?.show({
        title: 'Chưa chọn khách hàng',
        message: 'Vui lòng chọn khách hàng cần tạo đơn nợ cố định.',
        type: 'alert',
      });
      return;
    }

    if (cartItems.length === 0) {
      popupRef.current?.show({
        title: 'Giỏ hàng trống',
        message: 'Vui lòng thêm ít nhất một loại thịt vào đơn hàng.',
        type: 'alert',
      });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        customerId: detailCustomer.id,
        note: detailNote.trim() || null,
        items: cartItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
          costPrice: item.costPrice,
        })),
      };

      if (editingDebtId) {
        await api.put(`/recurring-debts/${editingDebtId}`, payload);
        showGlobalToast({
          title: 'Thành công',
          message: 'Đã cập nhật đơn nợ cố định chi tiết!',
          type: 'success',
        });
      } else {
        await api.post('/recurring-debts', payload);
        showGlobalToast({
          title: 'Thành công',
          message: 'Đã thêm đơn nợ cố định chi tiết (tự động lên đơn lúc 0:30 mỗi ngày)!',
          type: 'success',
        });
      }

      resetForm();
      fetchData();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('[SAVE DETAIL RECURRING DEBT ERROR]:', err);
      popupRef.current?.show({
        title: 'Lỗi lưu đơn cố định',
        message: err.response?.data?.message || 'Không thể lưu đơn nợ cố định.',
        type: 'alert',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        {/* Header Modal */}
        <View style={styles.modalHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle}>🔁 ĐƠN NỢ CỐ ĐỊNH HÀNG NGÀY</Text>
            <Text style={styles.modalSubTitle}>
              Tự động thêm vào danh sách công nợ lúc <Text style={styles.boldText}>00:30</Text> hàng ngày
            </Text>
          </View>
          <TouchableOpacity style={styles.closeHeaderBtn} onPress={() => setVisible(false)} activeOpacity={0.7}>
            <Text style={styles.closeHeaderBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView ref={scrollRef} style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
          {/* ═════════════════════════════════════════════════════════════ */}
          {/* PHẦN TRÊN: DANH SÁCH ĐƠN NỢ CỐ ĐỊNH HIỆN CÓ                   */}
          {/* ═════════════════════════════════════════════════════════════ */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>📋 Danh sách đơn nợ cố định ({recurringDebts.length})</Text>
            <TouchableOpacity style={styles.refreshBtn} onPress={fetchData} activeOpacity={0.7}>
              <Text style={styles.refreshBtnText}>🔄 Làm mới</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Đang tải danh sách đơn cố định...</Text>
            </View>
          ) : recurringDebts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyTitle}>Chưa có đơn nợ cố định nào</Text>
              <Text style={styles.emptySubText}>
                Thêm đơn nợ khách quen lấy hàng đều đặn mỗi ngày ở form bên dưới để hệ thống tự động lên đơn.
              </Text>
            </View>
          ) : (
            <View style={styles.debtListContainer}>
              {recurringDebts.map((debt, index) => {
                const isQuick =
                  debt.items?.length === 1 &&
                  (debt.items[0].product?.name === 'Tiền hàng' || debt.items[0].product?.name?.toLowerCase().startsWith('tiền'));

                const detailsText = isQuick
                  ? '⚡ Ghi nợ nhanh'
                  : (debt.items || [])
                      .map((item) => `${parseFloat(item.quantity)}${item.product?.unit || 'kg'} ${item.product?.name || 'Thịt'}`)
                      .join(', ');

                const isEditingThis = editingDebtId === debt.id;

                return (
                  <View key={debt.id} style={[styles.debtCard, isEditingThis && styles.debtCardEditing]}>
                    <View style={styles.debtCardHeader}>
                      <View style={styles.customerRow}>
                        <Text style={styles.customerIndex}>{index + 1}.</Text>
                        <Text style={styles.customerName}>{debt.customer?.name || 'Khách ẩn danh'}</Text>
                        {isEditingThis && (
                          <View style={styles.editingBadge}>
                            <Text style={styles.editingBadgeText}>Đang sửa</Text>
                          </View>
                        )}
                        <TouchableOpacity style={styles.cardEditBtn} onPress={() => handleEdit(debt)} activeOpacity={0.7}>
                          <Text style={styles.cardEditBtnText}>Sửa</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.cardDeleteBtn} onPress={() => handleDelete(debt)} activeOpacity={0.7}>
                          <Text style={styles.cardDeleteBtnText}>Xóa</Text>
                        </TouchableOpacity>
                      </View>

                      <Text style={styles.debtAmount}>+{formatCurrency(debt.totalAmount)}</Text>
                    </View>

                    {/* Chi tiết mặt hàng / Ghi chú / Lãi */}
                    <View style={styles.debtDetailsRow}>
                      <Text style={styles.debtDetailsText} numberOfLines={1}>
                        {isQuick ? '⚡ Ghi nợ nhanh' : `🥩 ${detailsText}`}
                        {debt.note && debt.note !== 'Đơn nợ nhanh cố định hàng ngày' ? `  ·  📝 ${debt.note}` : ''}
                      </Text>
                      {parseFloat(debt.totalProfit || 0) > 0 && (
                        <View style={styles.profitBadge}>
                          <Text style={styles.profitBadgeText}>
                            Lãi: +{formatCurrency(debt.totalProfit)}
                            {debt.profitPercent ? ` (${debt.profitPercent}%)` : ''}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* ═════════════════════════════════════════════════════════════ */}
          {/* PHẦN DƯỚI: FORM THÊM / CẬP NHẬT ĐƠN NỢ CỐ ĐỊNH                 */}
          {/* ═════════════════════════════════════════════════════════════ */}
          <View style={styles.formSectionContainer}>
            <View style={styles.formSectionHeader}>
              <Text style={styles.formSectionTitle}>
                {editingDebtId ? '✏️ Chỉnh sửa đơn nợ cố định' : '➕ Thêm đơn nợ cố định mới'}
              </Text>
              {editingDebtId && (
                <TouchableOpacity style={styles.cancelEditBtn} onPress={resetForm} activeOpacity={0.7}>
                  <Text style={styles.cancelEditBtnText}>✕ Hủy sửa</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 2 Tabs chuyển đổi Nhập nhanh / Nhập chi tiết */}
            <View style={styles.tabHeaderContainer}>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'quick' && styles.tabButtonActive]}
                onPress={() => setActiveTab('quick')}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabButtonText, activeTab === 'quick' && styles.tabButtonTextActive]}>
                  ⚡ Nhập nhanh
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'detail' && styles.tabButtonActive]}
                onPress={() => setActiveTab('detail')}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabButtonText, activeTab === 'detail' && styles.tabButtonTextActive]}>
                  📝 Nhập chi tiết
                </Text>
              </TouchableOpacity>
            </View>

            {/* ─────────────────── TAB 1: NHẬP NHANH ─────────────────── */}
            {activeTab === 'quick' && (
              <View style={styles.tabContent}>
                <Text style={styles.inputLabel}>Khách hàng <Text style={styles.requiredMark}>*</Text></Text>
                <View style={{ zIndex: 999999, elevation: 999999, marginBottom: 12 }}>
                  <CustomSelect
                    value={quickCustomer}
                    placeholder="Chọn khách hàng..."
                    options={customers}
                    onSelect={(c) => setQuickCustomer(c)}
                    renderSelected={(c) => c.name}
                    getOptionLabel={(c) => c?.name || ''}
                    renderOption={(c) => (
                      <View style={styles.selectOptionRow}>
                        <Text style={styles.selectOptionName}>{c.name}</Text>
                        {c.phone ? <Text style={styles.selectOptionPhone}>{c.phone}</Text> : null}
                      </View>
                    )}
                    zIndex={999999}
                  />
                </View>

                <Text style={styles.inputLabel}>Số tiền nợ cố định mỗi ngày (đ) <Text style={styles.requiredMark}>*</Text></Text>
                <MoneyInput
                  value={quickAmountVND}
                  onChangeValue={(val) => setQuickAmountVND(val)}
                  placeholder="Nhập số tiền nợ (ví dụ: 1.500.000)..."
                  style={styles.moneyInput}
                />

                <Text style={styles.inputLabel}>% Lợi nhuận ước tính (tùy chọn)</Text>
                <TextInput
                  style={styles.textInput}
                  value={quickProfitPercent}
                  onChangeText={setQuickProfitPercent}
                  placeholder="Ví dụ: 15 (tương đương 15%)"
                  keyboardType="numeric"
                />

                <Text style={styles.inputLabel}>Ghi chú đơn hàng (tùy chọn)</Text>
                <TextInput
                  style={[styles.textInput, { height: 60 }]}
                  value={quickNote}
                  onChangeText={setQuickNote}
                  placeholder="Ví dụ: Lấy đều sáng sớm hằng ngày..."
                  multiline
                />

                <TouchableOpacity
                  style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                  onPress={handleSaveQuick}
                  disabled={submitting}
                  activeOpacity={0.8}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitButtonText}>
                      {editingDebtId ? '💾 LƯU THAY ĐỔI ĐƠN CỐ ĐỊNH' : '➕ LƯU ĐƠN NỢ CỐ ĐỊNH'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* ─────────────────── TAB 2: NHẬP CHI TIẾT ─────────────────── */}
            {activeTab === 'detail' && (
              <View style={styles.tabContent}>
                <Text style={styles.inputLabel}>Khách hàng <Text style={styles.requiredMark}>*</Text></Text>
                <View style={{ zIndex: 999999, elevation: 999999, marginBottom: 12 }}>
                  <CustomSelect
                    value={detailCustomer}
                    placeholder="Chọn khách hàng..."
                    options={customers}
                    onSelect={(c) => {
                      setDetailCustomer(c);
                      if (c) fetchCustomerPrices(c.id);
                    }}
                    renderSelected={(c) => c.name}
                    getOptionLabel={(c) => c?.name || ''}
                    renderOption={(c) => (
                      <View style={styles.selectOptionRow}>
                        <Text style={styles.selectOptionName}>{c.name}</Text>
                        {c.phone ? <Text style={styles.selectOptionPhone}>{c.phone}</Text> : null}
                      </View>
                    )}
                    zIndex={999999}
                  />
                </View>

                {/* Giỏ hàng các loại thịt đã chọn */}
                <View style={styles.cartSection}>
                  <View style={styles.cartHeader}>
                    <Text style={styles.cartTitle}>🛒 Các loại thịt lấy mỗi ngày ({cartItems.length})</Text>
                    <Text style={styles.cartTotalText}>{formatCurrency(detailTotalAmount)}</Text>
                  </View>

                  {cartItems.length === 0 ? (
                    <Text style={styles.cartEmptyText}>Chưa có loại thịt nào. Thêm thịt ở bên dưới.</Text>
                  ) : (
                    <View style={styles.cartItemsList}>
                      {cartItems.map((item, idx) => (
                        <View key={idx} style={styles.cartItemRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.cartItemName}>
                              {item.productName} ({item.quantity}{item.unit})
                            </Text>
                            <Text style={styles.cartItemSub}>
                              Đơn giá: {formatCurrency(item.price)}/{item.unit}   |   Thành tiền: {formatCurrency(item.amount)}
                            </Text>
                          </View>
                          <TouchableOpacity style={styles.cartItemRemoveBtn} onPress={() => handleRemoveCartItem(idx)}>
                            <Text style={styles.cartItemRemoveText}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* Thêm dòng thịt vào đơn */}
                <View style={styles.addItemBox}>
                  <Text style={styles.addItemBoxTitle}>+ Thêm loại thịt vào đơn</Text>
                  
                  <Text style={styles.inputLabelSmall}>Loại thịt</Text>
                  <View style={{ zIndex: 99999, elevation: 99999, marginBottom: 8 }}>
                    <CustomSelect
                      value={currentProduct}
                      placeholder="Chọn loại thịt..."
                      options={availableProducts}
                      onSelect={handleSelectProduct}
                      renderSelected={(p) => p.name}
                      getOptionLabel={(p) => p?.name || ''}
                      renderOption={(p) => (
                        <View style={styles.selectOptionRow}>
                          <Text style={styles.selectOptionName}>{p.name}</Text>
                          <Text style={styles.selectOptionPrice}>
                            {formatCurrency(p.price !== undefined ? p.price : p.defaultPrice)}/{p.unit || 'kg'}
                          </Text>
                        </View>
                      )}
                      zIndex={99999}
                    />
                  </View>

                  <View style={styles.rowInputs}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabelSmall}>Số lượng ({currentProduct?.unit || 'kg'})</Text>
                      <TextInput
                        style={styles.textInput}
                        value={currentQuantity}
                        onChangeText={setCurrentQuantity}
                        placeholder="Ví dụ: 2.5"
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flex: 1.3 }}>
                      <Text style={styles.inputLabelSmall}>Đơn giá bán (đ)</Text>
                      <MoneyInput
                        value={currentPrice}
                        onChangeValue={(val) => setCurrentPrice(String(val))}
                        placeholder="Giá bán..."
                        style={styles.moneyInput}
                      />
                    </View>
                  </View>

                  <TouchableOpacity style={styles.addCartBtn} onPress={handleAddToCart} activeOpacity={0.7}>
                    <Text style={styles.addCartBtnText}>➕ Thêm loại thịt này vào đơn</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.inputLabel}>Ghi chú đơn hàng (tùy chọn)</Text>
                <TextInput
                  style={[styles.textInput, { height: 50 }]}
                  value={detailNote}
                  onChangeText={setDetailNote}
                  placeholder="Ví dụ: Giao trước 6h sáng..."
                />

                {/* Tổng kết chi tiết */}
                {cartItems.length > 0 && (
                  <View style={styles.summaryBar}>
                    <Text style={styles.summaryBarTotal}>Tổng tiền: {formatCurrency(detailTotalAmount)}</Text>
                    {detailTotalProfit > 0 && (
                      <Text style={styles.summaryBarProfit}>Lãi ước tính: +{formatCurrency(detailTotalProfit)}</Text>
                    )}
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                  onPress={handleSaveDetail}
                  disabled={submitting}
                  activeOpacity={0.8}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitButtonText}>
                      {editingDebtId ? '💾 LƯU THAY ĐỔI ĐƠN CỐ ĐỊNH' : '➕ LƯU ĐƠN NỢ CỐ ĐỊNH'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>

        {/* Nút Đóng */}
        <View style={styles.footerButtons}>
          <TouchableOpacity style={styles.closeFooterBtn} onPress={() => setVisible(false)} activeOpacity={0.7}>
            <Text style={styles.closeFooterBtnText}>ĐÓNG LẠI</Text>
          </TouchableOpacity>
        </View>

        <PopupModal ref={popupRef} />
      </View>
    </SmoothModal>
  );
});

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    marginTop: 20,
    width: '100%',
    maxWidth: 720,
    maxHeight: '94%',
    flex: 1,
    alignSelf: 'center',
    ...SHADOWS.card,
    flexDirection: 'column',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  modalSubTitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  boldText: {
    fontWeight: 'bold',
    color: '#DC2626',
  },
  closeHeaderBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  closeHeaderBtnText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: 'bold',
  },
  modalScroll: {
    flex: 1,
    marginVertical: 10,
  },
  modalScrollContent: {
    paddingBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#334155',
  },
  refreshBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  refreshBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  loadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  emptyContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#475569',
  },
  emptySubText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 400,
  },
  debtListContainer: {
    gap: 8,
    marginBottom: 16,
  },
  debtCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 3,
    ...SHADOWS.card,
  },
  debtCardEditing: {
    borderColor: '#F59E0B',
    borderLeftColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  debtCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  customerIndex: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#64748B',
  },
  customerName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  editingBadge: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  editingBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#B45309',
  },
  cardEditBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginLeft: 2,
  },
  cardEditBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1D4ED8',
  },
  cardDeleteBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#FEF2F2',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  cardDeleteBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  debtAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  debtDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  debtDetailsText: {
    fontSize: 12,
    color: '#475569',
    flex: 1,
  },
  profitBadge: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  profitBadgeText: {
    fontSize: 10.5,
    fontWeight: 'bold',
    color: '#0369A1',
  },
  formSectionContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  formSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  formSectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  cancelEditBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
  },
  cancelEditBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#64748B',
  },
  tabHeaderContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    padding: 3,
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    ...SHADOWS.card,
  },
  tabButtonText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  tabButtonTextActive: {
    color: '#0F172A',
    fontWeight: 'bold',
  },
  tabContent: {
    flexDirection: 'column',
  },
  inputLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  inputLabelSmall: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 3,
  },
  requiredMark: {
    color: '#DC2626',
  },
  moneyInput: {
    backgroundColor: '#FFFFFF',
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#0F172A',
    marginBottom: 10,
  },
  selectOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  selectOptionName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  selectOptionPhone: {
    fontSize: 11.5,
    color: '#64748B',
  },
  selectOptionPrice: {
    fontSize: 11.5,
    color: '#059669',
    fontWeight: '600',
  },
  cartSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 10,
    marginBottom: 12,
  },
  cartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cartTitle: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#334155',
  },
  cartTotalText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  cartEmptyText: {
    fontSize: 11.5,
    color: '#94A3B8',
    fontStyle: 'italic',
    paddingVertical: 6,
  },
  cartItemsList: {
    gap: 6,
  },
  cartItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    padding: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cartItemName: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  cartItemSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  cartItemRemoveBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  cartItemRemoveText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  addItemBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    padding: 10,
    marginBottom: 12,
  },
  addItemBoxTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1E40AF',
    marginBottom: 6,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 8,
  },
  addCartBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 2,
  },
  addCartBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  summaryBar: {
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryBarTotal: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#065F46',
  },
  summaryBarProfit: {
    fontSize: 12,
    fontWeight: '600',
    color: '#047857',
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    ...SHADOWS.button,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: 'bold',
  },
  footerButtons: {
    marginTop: 10,
  },
  closeFooterBtn: {
    height: 42,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFooterBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#475569',
  },
});

export default RecurringDebtModal;
