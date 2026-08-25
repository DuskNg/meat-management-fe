// meat-management-fe/src/components/shop/AddShopSessionItemModal.js
import React, { useState, useRef, forwardRef, useImperativeHandle, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
} from 'react-native';
import { api } from '../../api/client';
import { COLORS, FONTS, SHADOWS } from '../../theme';
import PopupModal from '../PopupModal';
import { matchItemSearch } from '../../utils/searchHelper';

// Định dạng tiền tệ VND
const formatVND = (num) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num || 0);
};

// Modal Chọn Món từ Kho để thêm vào Bàn chơi (Hỗ trợ chọn nhiều món cùng lúc, tự động trừ tồn kho)
const AddShopSessionItemModal = forwardRef(({ onAdded }, ref) => {
  const [visible, setVisible] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [tableName, setTableName] = useState('');

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const popupModalRef = useRef(null);

  // Lưu trữ số lượng đã chọn theo từng sản phẩm: { [productId]: quantity }
  const [selectedQuantities, setSelectedQuantities] = useState({});

  // Tải danh sách sản phẩm từ kho
  const fetchInventoryProducts = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/inventory/products');
      if (res.data && res.data.success) {
        setProducts(res.data.data.products || []);
      } else {
        setError('Không thể tải danh sách kho.');
      }
    } catch (err) {
      console.error('Lỗi tải sản phẩm kho:', err);
      setError(err.response?.data?.message || 'Không thể kết nối tới kho hàng.');
    } finally {
      setLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    open: (targetSessionId, targetTableName) => {
      setSessionId(targetSessionId);
      setTableName(targetTableName || '');
      setSelectedQuantities({});
      setSearch('');
      setError('');
      setVisible(true);
      fetchInventoryProducts();
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Lọc sản phẩm theo từ khóa tìm kiếm (hỗ trợ không dấu, viết tắt, nhiều từ rời rạc)
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      return matchItemSearch(p, search, ['name', 'barcode', 'sku', 'unit', 'category']);
    });
  }, [products, search]);

  // Xử lý tăng số lượng cho một sản phẩm (bắt đầu từ 1)
  const handleIncrease = (product) => {
    const stock = parseFloat(product.quantity || 0);
    if (stock <= 0) {
      popupModalRef.current?.show({
        title: 'Hết hàng',
        message: `Sản phẩm "**${product.name}**" hiện tại đã hết tồn kho.`,
        type: 'warning',
      });
      return;
    }

    setSelectedQuantities((prev) => {
      const current = prev[product.id] || 0;
      if (current + 1 > stock) {
        popupModalRef.current?.show({
          title: 'Đạt giới hạn tồn kho',
          message: `Kho chỉ còn **${stock}** ${product.unit}.`,
          type: 'warning',
        });
        return prev;
      }
      return {
        ...prev,
        [product.id]: current + 1,
      };
    });
  };

  // Xử lý giảm số lượng cho một sản phẩm
  const handleDecrease = (product) => {
    setSelectedQuantities((prev) => {
      const current = prev[product.id] || 0;
      if (current <= 1) {
        const copy = { ...prev };
        delete copy[product.id];
        return copy;
      }
      return {
        ...prev,
        [product.id]: current - 1,
      };
    });
  };

  // Tổng số lượng món và tổng tiền tạm tính của các món được chọn
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
          // Ưu tiên Giá bán (sellingPrice), fallback về Giá nhập (price)
          const sellPrice = parseFloat(prod.sellingPrice || 0) > 0 ? parseFloat(prod.sellingPrice) : parseFloat(prod.price || 0);
          amount += qty * sellPrice;
        }
      }
    });

    return { totalKinds: kinds, totalUnits: units, totalAmount: amount };
  }, [selectedQuantities, products]);

  // Xử lý xác nhận thêm toàn bộ các món đã chọn vào bàn và trừ kho
  const handleConfirmAdd = async () => {
    if (!sessionId || totalKinds === 0) return;

    const itemsToAdd = [];
    for (const [prodId, qty] of Object.entries(selectedQuantities)) {
      if (qty > 0) {
        const prod = products.find((p) => p.id === prodId);
        if (!prod) continue;
        const stock = parseFloat(prod.quantity || 0);
        if (stock < qty) {
          popupModalRef.current?.show({
            title: 'Không đủ hàng',
            message: `Sản phẩm "**${prod.name}**" trong kho chỉ còn **${stock}** ${prod.unit}, không đủ để phục vụ ${qty} ${prod.unit}.`,
            type: 'warning',
          });
          return;
        }
        // Gửi đơn giá bán
        const itemSellingPrice = parseFloat(prod.sellingPrice || 0) > 0 ? parseFloat(prod.sellingPrice) : parseFloat(prod.price || 0);
        itemsToAdd.push({
          productId: prod.id,
          quantity: qty,
          price: itemSellingPrice,
        });
      }
    }

    if (itemsToAdd.length === 0) return;

    setSubmitting(true);
    try {
      const response = await api.post(`/shop/sessions/${sessionId}/items`, {
        items: itemsToAdd,
      });

      if (response.data && response.data.success) {
        if (onAdded) {
          onAdded(response.data.data);
        }
        setVisible(false);
      } else {
        popupModalRef.current?.show({
          title: 'Thất bại',
          message: response.data.message || 'Lỗi thêm món.',
          type: 'error',
        });
      }
    } catch (err) {
      console.error('Lỗi thêm món vào bàn:', err);
      popupModalRef.current?.show({
        title: 'Lỗi',
        message: err.response?.data?.message || 'Không thể thêm món.',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={() => setVisible(false)}
    >
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={StyleSheet.absoluteFillObject} />
        </TouchableWithoutFeedback>

        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>🥤 Gọi Thêm Món & Nước Uống</Text>
              <Text style={styles.subtitle}>
                Phục vụ cho bàn: <Text style={styles.tableHighlight}>{tableName}</Text> (Tự động trừ kho)
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setVisible(false)}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Ô tìm kiếm mặt hàng kho */}
          <View style={styles.searchWrapper}>
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="🔍 Tìm nước ngọt, bia, snack, đồ ăn..."
              placeholderTextColor="#94A3B8"
            />
            {search.length > 0 && (
              <TouchableOpacity style={styles.clearSearchBtn} onPress={() => setSearch('')}>
                <Text style={styles.clearSearchText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

          {/* Danh sách sản phẩm trong kho */}
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#0F766E" />
              <Text style={styles.loadingText}>Đang tải danh mục kho hàng...</Text>
            </View>
          ) : filteredProducts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {search.trim() ? 'Không tìm thấy món nào khớp từ khóa.' : 'Kho hàng hiện tại đang trống.'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredProducts}
              keyExtractor={(item) => item.id}
              style={styles.productList}
              contentContainerStyle={{ gap: 8, paddingBottom: 10 }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const stock = parseFloat(item.quantity || 0);
                const isOut = stock <= 0;
                const qty = selectedQuantities[item.id] || 0;
                const isSelected = qty > 0;
                const displayPrice = parseFloat(item.sellingPrice || 0) > 0 ? parseFloat(item.sellingPrice) : parseFloat(item.price || 0);

                return (
                  <View
                    style={[
                      styles.productItem,
                      isSelected && styles.productItemSelected,
                      isOut && styles.productItemDisabled,
                    ]}
                  >
                    {/* Cột thông tin món bên trái */}
                    <TouchableOpacity
                      style={{ flex: 1, paddingRight: 8 }}
                      onPress={() => !isOut && handleIncrease(item)}
                      activeOpacity={isOut ? 1 : 0.7}
                    >
                      <Text style={[styles.productName, isSelected && styles.textSelected]}>
                        {item.name}
                      </Text>
                      <View style={styles.metaRow}>
                        <Text style={styles.productPriceText}>
                          {formatVND(displayPrice)}
                        </Text>
                        <Text style={styles.productUnitText}>/{item.unit}</Text>

                        {/* Badge tồn kho */}
                        <View
                          style={[
                            styles.stockBadge,
                            isOut ? styles.bgRed : stock <= 5 ? styles.bgYellow : styles.bgGreen,
                          ]}
                        >
                          <Text
                            style={[
                              styles.stockBadgeText,
                              isOut ? styles.textRed : stock <= 5 ? styles.textYellow : styles.textGreen,
                            ]}
                          >
                            {isOut ? 'Hết hàng' : `Kho còn: ${stock} (${item.unit})`}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Cột điều khiển số lượng bên phải: Dấu - + giữa là số */}
                    <View style={styles.rightActionCol}>
                      {isOut ? (
                        <View style={styles.outOfStockBadge}>
                          <Text style={styles.outOfStockText}>Tạm hết</Text>
                        </View>
                      ) : (
                        <View style={[styles.stepperContainer, qty === 0 && styles.stepperContainerInactive]}>
                          <TouchableOpacity
                            style={[styles.stepperBtn, qty === 0 && styles.stepperBtnDisabled]}
                            onPress={() => handleDecrease(item)}
                            disabled={qty === 0}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.stepperBtnText, qty === 0 && styles.stepperBtnTextDisabled]}>-</Text>
                          </TouchableOpacity>

                          <View style={[styles.stepperValueBox, qty === 0 && styles.stepperValueBoxInactive]}>
                            <Text style={[styles.stepperValueText, qty === 0 && styles.stepperValueTextInactive]}>
                              {qty}
                            </Text>
                          </View>

                          <TouchableOpacity
                            style={[styles.stepperBtn, qty >= stock && styles.stepperBtnDisabled]}
                            onPress={() => handleIncrease(item)}
                            disabled={qty >= stock}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.stepperBtnText, qty >= stock && styles.stepperBtnTextDisabled]}>
                              +
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                );
              }}
            />
          )}

          {/* Thanh tổng kết các món đã chọn */}
          {totalKinds > 0 && (
            <View style={styles.summaryBar}>
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryTitle}>
                  Đã chọn: <Text style={styles.summaryHighlight}>{totalKinds} loại ({totalUnits} phần)</Text>
                </Text>
                <Text style={styles.summaryTotalText}>
                  Tổng: <Text style={styles.summaryAmountHighlight}>{formatVND(totalAmount)}</Text>
                </Text>
              </View>
            </View>
          )}

          {/* Footer nút hành động */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setVisible(false)}
              disabled={submitting}
            >
              <Text style={styles.cancelBtnText}>Đóng</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.confirmBtn,
                totalKinds === 0 && { backgroundColor: '#CBD5E1' },
              ]}
              onPress={handleConfirmAdd}
              disabled={totalKinds === 0 || submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.confirmBtnText}>
                  {totalKinds > 0
                    ? `➕ XÁC NHẬN THÊM (${totalKinds} MÓN)`
                    : 'CHƯA CHỌN MÓN'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Modal Cảnh báo/Xác nhận dùng chung */}
        <PopupModal ref={popupModalRef} />
      </View>
    </Modal>
  );
});

export default AddShopSessionItemModal;

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
    maxWidth: 640,
    height: '92%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    ...SHADOWS.card,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingBottom: 12,
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0F766E',
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  tableHighlight: {
    fontWeight: 'bold',
    color: '#0F766E',
  },
  closeBtn: {
    padding: 6,
    marginLeft: 10,
  },
  closeBtnText: {
    fontSize: 18,
    color: '#94A3B8',
    fontWeight: 'bold',
  },
  searchWrapper: {
    position: 'relative',
    justifyContent: 'center',
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 42,
    fontSize: 14,
    color: COLORS.text,
    paddingRight: 36,
  },
  clearSearchBtn: {
    position: 'absolute',
    right: 12,
    padding: 4,
  },
  clearSearchText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: 'bold',
  },
  errorText: {
    color: COLORS.dangerDark,
    backgroundColor: COLORS.dangerLight,
    padding: 8,
    borderRadius: 8,
    fontSize: 12,
    marginBottom: 10,
    textAlign: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
  },
  productList: {
    flex: 1,
    marginBottom: 10,
  },
  productItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  productItemSelected: {
    borderColor: '#0F766E',
    backgroundColor: '#F0FDFA',
  },
  productItemDisabled: {
    backgroundColor: '#F8FAFC',
    opacity: 0.6,
  },
  productName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 4,
  },
  textSelected: {
    color: '#0F766E',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  productPriceText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F766E',
  },
  productUnitText: {
    fontSize: 12,
    color: '#64748B',
  },
  stockBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 4,
  },
  stockBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  bgGreen: {
    backgroundColor: '#DCFCE7',
  },
  textGreen: {
    color: '#166534',
  },
  bgYellow: {
    backgroundColor: '#FEF9C3',
  },
  textYellow: {
    color: '#854D0E',
  },
  bgRed: {
    backgroundColor: '#FEE2E2',
  },
  textRed: {
    color: '#991B1B',
  },

  // Khung điều khiển số lượng ở bên phải món
  rightActionCol: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    minWidth: 110,
  },
  outOfStockBadge: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  outOfStockText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  addInitBtn: {
    backgroundColor: '#CCFBF1',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addInitBtnText: {
    color: '#0F766E',
    fontSize: 13,
    fontWeight: 'bold',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1.2,
    borderColor: '#0F766E',
    overflow: 'hidden',
  },
  stepperContainerInactive: {
    borderColor: '#CBD5E1',
  },
  stepperBtn: {
    width: 32,
    height: 32,
    backgroundColor: '#0F766E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperBtnDisabled: {
    backgroundColor: '#F1F5F9',
  },
  stepperBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
    lineHeight: 20,
  },
  stepperBtnTextDisabled: {
    color: '#94A3B8',
  },
  stepperValueBox: {
    minWidth: 36,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 6,
  },
  stepperValueBoxInactive: {
    backgroundColor: '#F8FAFC',
  },
  stepperValueText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F766E',
  },
  stepperValueTextInactive: {
    color: '#94A3B8',
    fontWeight: '500',
  },

  // Thanh tổng kết
  summaryBar: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1.2,
    borderColor: '#99F6E4',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  summaryInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryTitle: {
    fontSize: 13,
    color: '#334155',
  },
  summaryHighlight: {
    fontWeight: 'bold',
    color: '#0F766E',
  },
  summaryTotalText: {
    fontSize: 13,
    color: '#334155',
  },
  summaryAmountHighlight: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F766E',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 0.7,
    backgroundColor: '#F1F5F9',
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#475569',
  },
  confirmBtn: {
    flex: 1.3,
    backgroundColor: '#0F766E',
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
