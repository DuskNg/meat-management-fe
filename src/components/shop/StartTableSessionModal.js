// meat-management-fe/src/components/shop/StartTableSessionModal.js
import React, { useState, forwardRef, useImperativeHandle, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Alert,
} from 'react-native';
import { api } from '../../api/client';
import { COLORS, SHADOWS } from '../../theme';
import { useResourceLock } from '../../hooks/useResourceLock';

// Định dạng tiền tệ VND
const formatVND = (num) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num || 0);
};

// Modal Xác Nhận Bắt Đầu Phiên Chơi Kèm Chọn Đồ Ăn / Nước Uống Ban Đầu
const StartTableSessionModal = forwardRef(({ onStartSession, onViewTableHistory }, ref) => {
  const [visible, setVisible] = useState(false);
  const [table, setTable] = useState(null);

  // Tự động khóa bàn khi mở modal mở bàn mới
  useResourceLock('SHOP_TABLE', table?.id, visible);
  const [loading, setLoading] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Danh sách sản phẩm kho và số lượng đã chọn: { [productId]: quantity }
  const [products, setProducts] = useState([]);
  const [selectedQuantities, setSelectedQuantities] = useState({});
  const [search, setSearch] = useState('');
  const [showItemSection, setShowItemSection] = useState(true);

  // Tải danh sách sản phẩm còn tồn kho từ API
  const fetchProducts = async () => {
    setLoadingProducts(true);
    try {
      const response = await api.get('/inventory/products');
      if (response.data && response.data.success) {
        const list = response.data.data.products || [];
        setProducts(list);
      }
    } catch (err) {
      console.error('Lỗi tải sản phẩm kho:', err);
    } finally {
      setLoadingProducts(false);
    }
  };

  useImperativeHandle(ref, () => ({
    open: (targetTable) => {
      setTable(targetTable);
      setSelectedQuantities({});
      setSearch('');
      setLoading(false);
      setVisible(true);
      fetchProducts();
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Lọc sản phẩm theo tìm kiếm
  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase().trim();
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, search]);

  // Tăng số lượng món
  const handleIncrease = (prod) => {
    const stock = parseFloat(prod.quantity || 0);
    if (stock <= 0) {
      Alert.alert('Hết hàng', `Sản phẩm "${prod.name}" trong kho đã hết.`);
      return;
    }

    setSelectedQuantities((prev) => {
      const cur = prev[prod.id] || 0;
      if (cur + 1 > stock) {
        Alert.alert('Đạt giới hạn tồn kho', `Kho chỉ còn ${stock} ${prod.unit}.`);
        return prev;
      }
      return { ...prev, [prod.id]: cur + 1 };
    });
  };

  // Giảm số lượng món
  const handleDecrease = (prod) => {
    setSelectedQuantities((prev) => {
      const cur = prev[prod.id] || 0;
      if (cur <= 1) {
        const copy = { ...prev };
        delete copy[prod.id];
        return copy;
      }
      return { ...prev, [prod.id]: cur - 1 };
    });
  };

  // Tính tổng số lượng và tiền món đã chọn
  const { totalKinds, totalUnits, totalAmount } = useMemo(() => {
    let kinds = 0;
    let units = 0;
    let amount = 0;

    Object.entries(selectedQuantities).forEach(([prodId, qty]) => {
      if (qty > 0) {
        kinds += 1;
        units += qty;
        const prod = products.find((p) => p.id === prodId);
        if (prod) {
          amount += qty * parseFloat(prod.price || 0);
        }
      }
    });

    return { totalKinds: kinds, totalUnits: units, totalAmount: amount };
  }, [selectedQuantities, products]);

  // Xác nhận bắt đầu phiên chơi kèm món đã chọn
  const handleConfirmStart = async () => {
    if (!table || loading) return;

    // Chuẩn bị danh sách món gửi lên
    const itemsPayload = [];
    for (const [prodId, qty] of Object.entries(selectedQuantities)) {
      if (qty > 0) {
        const prod = products.find((p) => p.id === prodId);
        if (prod) {
          itemsPayload.push({
            productId: prod.id,
            quantity: qty,
            price: prod.price,
          });
        }
      }
    }

    setLoading(true);
    try {
      if (onStartSession) {
        await onStartSession(table, itemsPayload);
      }
      setVisible(false);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenHistory = () => {
    if (!table) return;
    setVisible(false);
    if (onViewTableHistory) {
      onViewTableHistory(table);
    }
  };

  if (!visible || !table) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={() => setVisible(false)}
    >
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={() => setVisible(false)}>
          <View style={StyleSheet.absoluteFillObject} />
        </TouchableWithoutFeedback>

        <View style={styles.card}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>🏪 Mở Bàn "{table.name}"</Text>
              <Text style={styles.subtitle}>Đơn giá: {formatVND(table.pricePerHour)}/giờ</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setVisible(false)}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Nút Xem lịch sử bàn chơi hôm nay */}
          <TouchableOpacity
            style={styles.historyBtn}
            onPress={handleOpenHistory}
            activeOpacity={0.75}
          >
            <Text style={styles.historyBtnText}>📜 Xem Lịch Sử Chơi Hôm Nay Của Bàn</Text>
          </TouchableOpacity>

          {/* Khu vực Chọn đồ ăn / Nước uống gọi kèm */}
          <View style={styles.itemSectionHeader}>
            <Text style={styles.itemSectionTitle}>🥤 ĐỒ DÙNG / NƯỚC UỐNG GỌI KÈM:</Text>
            {totalUnits > 0 && (
              <Text style={styles.selectedBadge}>
                Đã chọn: {totalUnits} món ({formatVND(totalAmount)})
              </Text>
            )}
          </View>

          {/* Ô tìm kiếm nhanh món */}
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm nước ngọt, snack, đồ ăn..."
              placeholderTextColor="#94A3B8"
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Text style={styles.clearSearchText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Danh sách món kho có thể gọi */}
          {loadingProducts ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color="#0F766E" />
              <Text style={styles.loadingText}>Đang nạp thực đơn kho...</Text>
            </View>
          ) : filteredProducts.length === 0 ? (
            <View style={styles.emptyProductsBox}>
              <Text style={styles.emptyProductsText}>
                {search ? 'Không tìm thấy món phù hợp' : 'Kho chưa có sản phẩm nào'}
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.productList} showsVerticalScrollIndicator={true}>
              {filteredProducts.map((prod) => {
                const stock = parseFloat(prod.quantity || 0);
                const isOutOfStock = stock <= 0;
                const qty = selectedQuantities[prod.id] || 0;

                return (
                  <View
                    key={prod.id}
                    style={[
                      styles.productRow,
                      qty > 0 && styles.productRowSelected,
                      isOutOfStock && styles.productRowOutOfStock,
                    ]}
                  >
                    <View style={styles.productInfo}>
                      <Text style={styles.productName} numberOfLines={1}>
                        {prod.name}
                      </Text>
                      <View style={styles.productSubRow}>
                        <Text style={styles.productPrice}>{formatVND(prod.price)}</Text>
                        <Text style={styles.productDot}>•</Text>
                        <Text
                          style={[
                            styles.productStock,
                            isOutOfStock && styles.textRed,
                          ]}
                        >
                          {isOutOfStock ? 'Hết hàng' : `Kho còn: ${stock} (${prod.unit})`}
                        </Text>
                      </View>
                    </View>

                    {/* Bộ điều khiển tăng giảm số lượng */}
                    {isOutOfStock ? (
                      <View style={styles.outOfStockBadge}>
                        <Text style={styles.outOfStockText}>Hết</Text>
                      </View>
                    ) : (
                      <View style={styles.stepperContainer}>
                        {qty > 0 ? (
                          <>
                            <TouchableOpacity
                              style={styles.stepperBtn}
                              onPress={() => handleDecrease(prod)}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.stepperBtnText}>−</Text>
                            </TouchableOpacity>

                            <View style={styles.stepperQtyBox}>
                              <Text style={styles.stepperQtyText}>{qty}</Text>
                            </View>

                            <TouchableOpacity
                              style={styles.stepperBtn}
                              onPress={() => handleIncrease(prod)}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.stepperBtnText}>+</Text>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <TouchableOpacity
                            style={styles.addInitBtn}
                            onPress={() => handleIncrease(prod)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.addInitBtnText}>+ Thêm</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* Hàng 2 nút hành động: HỦY và BẮT ĐẦU CHƠI */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setVisible(false)}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelBtnText}>HỦY</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.startBtn}
              onPress={handleConfirmStart}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.startBtnText}>
                  BẮT ĐẦU CHƠI {totalUnits > 0 ? `(+${totalUnits} món)` : ''}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
});

export default StartTableSessionModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '96%',
    maxWidth: 440,
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    ...SHADOWS.card,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingBottom: 10,
    marginBottom: 8,
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#0F766E',
    fontWeight: '600',
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
    marginLeft: 8,
  },
  closeBtnText: {
    fontSize: 18,
    color: '#94A3B8',
    fontWeight: 'bold',
  },

  historyBtn: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  historyBtnText: {
    color: '#0F766E',
    fontSize: 12,
    fontWeight: 'bold',
  },

  itemSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  itemSectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#334155',
    letterSpacing: 0.3,
  },
  selectedBadge: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#059669',
  },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    height: 36,
  },
  searchIcon: {
    fontSize: 13,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#1E293B',
    paddingVertical: 0,
  },
  clearSearchText: {
    fontSize: 14,
    color: '#94A3B8',
    paddingHorizontal: 4,
  },

  loadingBox: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
  },
  emptyProductsBox: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyProductsText: {
    fontSize: 12,
    color: '#94A3B8',
  },

  productList: {
    maxHeight: 220,
    marginBottom: 10,
  },
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 6,
  },
  productRowSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  productRowOutOfStock: {
    opacity: 0.5,
    backgroundColor: '#F8FAFC',
  },
  productInfo: {
    flex: 1,
    paddingRight: 8,
  },
  productName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  productSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  productPrice: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0D9488',
  },
  productDot: {
    fontSize: 9,
    color: '#CBD5E1',
  },
  productStock: {
    fontSize: 11,
    color: '#64748B',
  },
  textRed: {
    color: '#EF4444',
  },

  outOfStockBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  outOfStockText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#DC2626',
  },

  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  stepperBtn: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  stepperBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#334155',
  },
  stepperQtyBox: {
    minWidth: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperQtyText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0F172A',
  },

  addInitBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  addInitBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#2563EB',
  },

  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
  },
  cancelBtn: {
    flex: 1,
    height: 42,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#64748B',
  },
  startBtn: {
    flex: 1.5,
    height: 42,
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.card,
  },
  startBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
