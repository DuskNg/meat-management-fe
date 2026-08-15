// meat-management-fe/src/components/store/OrderModal.js
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
import SmoothModal from '../SmoothModal';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { COLORS, FONTS, SHADOWS } from '../../theme';
import PinInputModal from '../PinInputModal';
import PinSetupModal from '../PinSetupModal';
import { hasPin, isSessionValid } from '../../store/pinStore';
import { useRouter } from 'expo-router';
import { matchItemSearch } from '../../utils/searchHelper';

const OrderModal = forwardRef(({ customerId: propCustomerId, onRefresh }, ref) => {
  const router = useRouter();

  const getTodayFormatted = () => {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    return `${d}/${m}/${y}`;
  };

  const parseDateString = (str) => {
    const parts = str.trim().split(/[\/\-]/);
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    const dateObj = new Date(year, month - 1, day);
    return dateObj.toISOString();
  };

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
      .format(amount)
      .replace('₫', 'đ');

  const [visible, setVisible] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  const [quantities, setQuantities] = useState({}); // { [productId]: quantity }
  const [productSearch, setProductSearch] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pinInputRef = useRef(null);
  const pinSetupRef = useRef(null);
  const isSubmittingRef = useRef(false);
  const [showPayButton, setShowPayButton] = useState(false);

  const finalCustomerId = selectedTable?.id || propCustomerId;

  // Tải danh mục thực đơn món ăn
  const { data: productsResponse, isLoading: isLoadingProducts } = useQuery({
    queryKey: ['store_products'],
    queryFn: async () => {
      const res = await api.get('/store/products');
      return res.data;
    },
    enabled: visible,
  });

  // Tải các giao dịch và thanh toán để khôi phục số lượng đã đặt
  const { data: transResponse, isLoading: isLoadingTrans } = useQuery({
    queryKey: ['store_table_transactions', finalCustomerId],
    queryFn: async () => {
      const response = await api.get(`/store/transactions`, {
        params: { customerId: finalCustomerId },
      });
      return response.data;
    },
    enabled: !!finalCustomerId && visible,
  });

  const { data: paymentsResponse, isLoading: isLoadingPayments } = useQuery({
    queryKey: ['store_table_payments', finalCustomerId],
    queryFn: async () => {
      const response = await api.get(`/store/payments`, {
        params: { customerId: finalCustomerId },
      });
      return response.data;
    },
    enabled: !!finalCustomerId && visible,
  });

  const isLoadingData =
    isLoadingProducts ||
    (!!finalCustomerId && (isLoadingTrans || isLoadingPayments));

  const products = (productsResponse?.data || []).filter(
    (p) => p.name && p.name !== 'Món lẻ' && !p.name.toLowerCase().startsWith('tiền')
  );

  const filteredProducts = products.filter((p) => {
    return matchItemSearch(p, productSearch, ['name', 'unit']);
  });

  const originalQuantitiesRef = useRef({});
  const activeTransactionIdsRef = useRef([]);
  const activeTransactionsTotalRef = useRef(0);

  useEffect(() => {
    if (visible && transResponse?.data && paymentsResponse?.data) {
      const transactions = transResponse.data;
      const payments = paymentsResponse.data;

      const events = [
        ...transactions.map(t => ({ type: 'trans', date: new Date(t.date || t.createdAt), amount: parseFloat(t.totalAmount || 0), items: t.items })),
        ...payments.map(p => ({ type: 'pay', date: new Date(p.paidAt || p.createdAt), amount: parseFloat(p.amount || 0) }))
      ];

      events.sort((a, b) => a.date - b.date);

      let runningBalance = 0;
      let lastClearedTime = new Date(0);

      events.forEach(e => {
        if (e.type === 'trans') {
          runningBalance += e.amount;
        } else {
          runningBalance -= e.amount;
        }
        if (runningBalance <= 0) {
          lastClearedTime = e.date;
        }
      });

      const activeQuantities = {};
      const activeTxIds = [];
      let activeTxTotal = 0;

      transactions.forEach(t => {
        const tDate = new Date(t.date || t.createdAt);
        if (tDate > lastClearedTime) {
          activeTxIds.push(t.id);
          activeTxTotal += parseFloat(t.totalAmount || 0);
          (t.items || []).forEach(item => {
            const pid = item.productId;
            if (pid) {
              activeQuantities[pid] = (activeQuantities[pid] || 0) + parseFloat(item.quantity || 0);
            }
          });
        }
      });

      setQuantities(activeQuantities);
      originalQuantitiesRef.current = activeQuantities;
      activeTransactionIdsRef.current = activeTxIds;
      activeTransactionsTotalRef.current = activeTxTotal;
    } else if (visible && !finalCustomerId) {
      setQuantities({});
      originalQuantitiesRef.current = {};
      activeTransactionIdsRef.current = [];
      activeTransactionsTotalRef.current = 0;
    }
  }, [visible, transResponse, paymentsResponse, finalCustomerId]);

  useImperativeHandle(ref, () => ({
    open: (tableObj = null) => {
      setVisible(true);
      setSelectedTable(tableObj);
      setQuantities({});
      originalQuantitiesRef.current = {};
      activeTransactionIdsRef.current = [];
      activeTransactionsTotalRef.current = 0;
      setProductSearch('');
      setError('');
      setNote('');
      const initialDebt = parseFloat(tableObj?.debt || 0) || 0;
      setShowPayButton(initialDebt > 0);
    },
    close: () => setVisible(false),
  }));

  const handleIncrement = (productId) => {
    setQuantities((prev) => ({
      ...prev,
      [productId]: (prev[productId] || 0) + 1,
    }));
  };

  const handleDecrement = (productId) => {
    setQuantities((prev) => ({
      ...prev,
      [productId]: Math.max(0, (prev[productId] || 0) - 1),
    }));
  };

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
      pinInputRef.current?.open(action, 'ghi hóa đơn gọi món');
    }
  };

  const handleSubmit = async () => {
    if (loading || isSubmittingRef.current) return;

    const orderItems = [];
    products.forEach((p) => {
      const qty = quantities[p.id] || 0;
      if (qty > 0) {
        orderItems.push({
          productId: p.id,
          quantity: qty,
          price: p.defaultPrice,
        });
      }
    });

    const finalCustomerId = selectedTable?.id || propCustomerId;
    if (!finalCustomerId) {
      setError('Không xác định được thông tin bàn ăn.');
      return;
    }

    setError('');
    setLoading(true);
    isSubmittingRef.current = true;
    try {
      const isoDate = parseDateString(getTodayFormatted());

      // 1. Xóa toàn bộ các giao dịch gọi món cũ trong phiên hiện tại
      if (activeTransactionIdsRef.current && activeTransactionIdsRef.current.length > 0) {
        await Promise.all(
          activeTransactionIdsRef.current.map((id) =>
            api.delete(`/store/transactions/${id}`)
          )
        );
      }

      // 2. Tạo giao dịch gọi món mới chứa toàn bộ thực đơn đã chọn
      if (orderItems.length > 0) {
        const response = await api.post('/store/transactions', {
          customerId: finalCustomerId,
          date: isoDate,
          note: null,
          items: orderItems,
        });

        if (!response.data.success) {
          throw new Error(response.data.message || 'Lỗi lưu hóa đơn.');
        }
      }

      setVisible(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const cartTotal = products.reduce((sum, p) => sum + (quantities[p.id] || 0) * p.defaultPrice, 0);

  const handlePayAndSubmit = async () => {
    if (loading || isSubmittingRef.current) return;

    const finalCustomerId = selectedTable?.id || propCustomerId;
    if (!finalCustomerId) {
      setError('Không xác định được thông tin bàn ăn.');
      return;
    }

    const orderItems = [];
    products.forEach((p) => {
      const qty = quantities[p.id] || 0;
      if (qty > 0) {
        orderItems.push({
          productId: p.id,
          quantity: qty,
          price: p.defaultPrice,
        });
      }
    });

    setError('');
    setLoading(true);
    isSubmittingRef.current = true;

    try {
      const isoDate = parseDateString(getTodayFormatted());

      // 1. Xóa toàn bộ các giao dịch gọi món cũ trong phiên hiện tại
      if (activeTransactionIdsRef.current && activeTransactionIdsRef.current.length > 0) {
        await Promise.all(
          activeTransactionIdsRef.current.map((id) =>
            api.delete(`/store/transactions/${id}`)
          )
        );
      }

      // 2. Tạo giao dịch gọi món mới chứa toàn bộ thực đơn đã chọn
      if (orderItems.length > 0) {
        const transRes = await api.post('/store/transactions', {
          customerId: finalCustomerId,
          date: isoDate,
          note: null,
          items: orderItems,
        });

        if (!transRes.data.success) {
          throw new Error(transRes.data.message || 'Lỗi ghi nhận gọi món.');
        }
      }

      // 3. Tạo thanh toán cho toàn bộ hóa đơn mới
      const deletedTransTotal = activeTransactionsTotalRef.current || 0;
      const initialTableDebt = Math.max(0, parseFloat(selectedTable?.debt || 0) - deletedTransTotal);
      const payAmount = initialTableDebt + cartTotal;

      if (payAmount > 0) {
        const payRes = await api.post('/store/payments', {
          customerId: finalCustomerId,
          amount: payAmount,
          note: 'Thanh toán trực tiếp',
        });

        if (!payRes.data.success) {
          throw new Error(payRes.data.message || 'Lỗi ghi nhận thanh toán.');
        }
      }

      setVisible(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>
            {selectedTable ? `🏪 GỌI MÓN: ${selectedTable.name}` : '🏪 GỌI MÓN'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity style={styles.closeHeaderButton} onPress={() => setVisible(false)}>
              <Text style={styles.closeHeaderText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

        {isLoadingData ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#5B21B6" />
            <Text style={styles.loadingText}>Đang tải danh sách món...</Text>
          </View>
        ) : (
          <>
            {/* Thanh tìm kiếm món */}
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="🔍 Tìm món ăn..."
                placeholderTextColor={COLORS.textLight}
                value={productSearch}
                onChangeText={setProductSearch}
              />
            </View>

            {/* Danh sách món ăn */}
            <ScrollView style={styles.productList} keyboardShouldPersistTaps="handled">
              {filteredProducts.map((p) => {
                const qty = quantities[p.id] || 0;
                return (
                  <View key={p.id} style={styles.productRow}>
                    <View style={styles.productInfo}>
                      <Text style={styles.productName}>{p.name}</Text>
                      <Text style={styles.productPrice}>{formatCurrency(p.defaultPrice)}</Text>
                    </View>

                    <View style={styles.quantitySelector}>
                      <TouchableOpacity
                        style={[styles.qtyBtn, qty === 0 && styles.qtyBtnDisabled]}
                        onPress={() => handleDecrement(p.id)}
                        disabled={qty === 0}
                      >
                        <Text style={[styles.qtyBtnText, qty === 0 && styles.qtyBtnTextDisabled]}>-</Text>
                      </TouchableOpacity>

                      <Text style={styles.qtyText}>{qty}</Text>

                      <TouchableOpacity style={styles.qtyBtn} onPress={() => handleIncrement(p.id)}>
                        <Text style={styles.qtyBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
              {filteredProducts.length === 0 && (
                <Text style={{ textAlign: 'center', color: COLORS.textLight, marginVertical: 20 }}>
                  Không tìm thấy món ăn phù hợp.
                </Text>
              )}
            </ScrollView>

            {/* Tổng hóa đơn */}
            <View style={styles.totalSection}>
              <Text style={styles.totalLabel}>TỔNG HÓA ĐƠN:</Text>
              <Text style={styles.totalValue}>{formatCurrency(cartTotal)}</Text>
            </View>
          </>
        )}

        {/* 3 nút chung 1 hàng ở dưới cùng */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.btn, styles.btnCancel]}
            onPress={() => setVisible(false)}
            disabled={loading || isLoadingData}
          >
            <Text style={styles.btnCancelText}>HỦY</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnSubmit]}
            onPress={() => requirePin(handleSubmit)}
            disabled={loading || isLoadingData}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.btnSubmitText}>ĐẶT MÓN</Text>
            )}
          </TouchableOpacity>

          {showPayButton ? (
            <TouchableOpacity
              style={[styles.btnPayNow]}
              onPress={() => requirePin(handlePayAndSubmit)}
              disabled={loading || isLoadingData}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.btnPayNowText}>THANH TOÁN</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <PinInputModal ref={pinInputRef} />
      <PinSetupModal ref={pinSetupRef} />
    </SmoothModal>
  );
});

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    height: '92%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#5B21B6',
  },
  closeHeaderButton: {
    padding: 6,
  },
  closeHeaderText: {
    fontSize: 18,
    color: COLORS.textSecondary,
  },
  searchContainer: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    height: 40,
    justifyContent: 'center',
    marginBottom: 12,
  },
  searchInput: {
    fontSize: 14,
    color: COLORS.text,
    padding: 0,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      },
    }),
  },
  productList: {
    flex: 1,
    marginBottom: 12,
  },
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EDE9FE',
  },
  productInfo: {
    flex: 1,
    marginRight: 10,
  },
  productName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  productPrice: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  quantitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  qtyBtnDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
    opacity: 0.5,
  },
  qtyBtnText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#5B21B6',
  },
  qtyBtnTextDisabled: {
    color: '#94A3B8',
  },
  qtyText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
    minWidth: 20,
    textAlign: 'center',
  },
  totalSection: {
    backgroundColor: '#F5F3FF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#5B21B6',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6D28D9',
  },
  noteInput: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 16,
    fontSize: 13,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnCancel: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnCancelText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  btnSubmit: {
    backgroundColor: '#5B21B6',
  },
  btnSubmitText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  errorText: {
    color: COLORS.dangerDark,
    backgroundColor: COLORS.dangerLight,
    padding: 8,
    borderRadius: 8,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  btnPayNow: {
    flex: 1,
    backgroundColor: '#10B981', // Màu xanh lá thanh toán
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnPayNowText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
});

export default OrderModal;
