// meat-management-fe/src/components/inventory/InventoryActionModal.js
import React, { useState, useImperativeHandle, forwardRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView,
} from 'react-native';
import { api } from '../../api/client';
import { COLORS, FONTS, SHADOWS } from '../../theme';

// Định dạng chuỗi nhập số có dấu chấm phân cách hàng nghìn
const formatNumberString = (value) => {
  const cleanValue = value.toString().replace(/[^0-9]/g, '');
  if (cleanValue === '') return '';
  return new Intl.NumberFormat('vi-VN').format(parseInt(cleanValue, 10));
};

// Đưa chuỗi đã định dạng về lại dạng số nguyên
const parseNumberString = (formattedValue) => {
  const cleanValue = formattedValue.toString().replace(/[^0-9]/g, '');
  return cleanValue ? parseInt(cleanValue, 10) : 0;
};

// Chỉ cho phép nhập ký tự số (hỗ trợ số thập phân có 1 dấu chấm)
const formatQuantityInput = (value) => {
  if (!value) return '';
  let clean = value.toString().replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const parts = clean.split('.');
  if (parts.length > 2) {
    clean = `${parts[0]}.${parts.slice(1).join('')}`;
  }
  return clean;
};

// Định dạng tiền tệ VND
const formatVND = (num) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num || 0);
};

// Modal Thao tác nhanh cho Sản phẩm Kho (Nhập / Xuất / Điều chỉnh kiểm kê)
const InventoryActionModal = forwardRef(({ onSuccess }, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Thông tin sản phẩm đang thao tác
  const [product, setProduct] = useState(null);

  // Tab thao tác: 'IN' (Nhập hàng) | 'OUT' (Xuất kho) | 'ADJUST' (Kiểm kê/Cân bằng)
  const [activeTab, setActiveTab] = useState('IN');

  // Form nhập liệu
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('');

  // Phơi bày phương thức open/close cho parent
  useImperativeHandle(ref, () => ({
    open: (prod, initialTab = 'IN') => {
      setErrorMsg('');
      setProduct(prod);
      setActiveTab(initialTab);
      setQuantity('');
      setPrice(prod?.price ? formatNumberString(prod.price) : '');
      setReason('');
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Danh sách các lý do mẫu gợi ý nhanh theo từng tab
  const QUICK_REASONS = {
    IN: ['Nhập mua mới', 'Nhập bổ sung trong ca', 'Khách trả hàng'],
    OUT: ['Dùng cho quán', 'Xuất bán trực tiếp', 'Hỏng / Hết hạn / Rơi bẩn', 'Xuất gửi chi nhánh'],
    ADJUST: ['Kiểm kê cuối tuần', 'Bù trừ hao hụt thực tế', 'Điều chỉnh tồn kho'],
  };

  // Tính toán số tồn sau khi thao tác để người dùng xem trước (Preview)
  const calculatePreviewStock = () => {
    if (!product) return 0;
    const current = parseFloat(product.quantity || 0);
    const input = parseFloat(quantity || 0);

    if (isNaN(input) || input <= 0) {
      if (activeTab === 'ADJUST' && quantity !== '' && input === 0) return 0;
      return current;
    }

    if (activeTab === 'IN') return current + input;
    if (activeTab === 'OUT') return Math.max(0, current - input);
    if (activeTab === 'ADJUST') return input;
    return current;
  };

  // Xử lý gửi API thực hiện giao dịch kho
  const handleSubmit = async () => {
    if (!product) return;

    const inputQty = parseFloat(quantity);
    if (isNaN(inputQty) || inputQty < 0) {
      setErrorMsg('Vui lòng nhập số lượng hợp lệ.');
      return;
    }

    if ((activeTab === 'IN' || activeTab === 'OUT') && inputQty <= 0) {
      setErrorMsg('Số lượng thao tác phải lớn hơn 0.');
      return;
    }

    const currentQty = parseFloat(product.quantity || 0);
    if (activeTab === 'OUT' && currentQty < inputQty) {
      setErrorMsg(`Kho không đủ hàng để xuất! Hiện chỉ còn ${currentQty} ${product.unit}.`);
      return;
    }

    const parsedPrice = price ? parseNumberString(price) : undefined;

    setLoading(true);
    setErrorMsg('');

    try {
      const payload = {
        type: activeTab,
        quantity: inputQty,
        price: parsedPrice,
        reason: reason.trim() || undefined,
      };

      const response = await api.post(`/inventory/products/${product.id}/adjust`, payload);

      if (response.data && response.data.success) {
        if (onSuccess) {
          onSuccess(response.data.data);
        }
        setVisible(false);
      } else {
        setErrorMsg(response.data.message || 'Thao tác thất bại.');
      }
    } catch (error) {
      console.error('Lỗi thao tác kho:', error);
      setErrorMsg(error.response?.data?.message || 'Không thể kết nối tới máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  if (!visible || !product) return null;

  const currentStock = parseFloat(product.quantity || 0);
  const previewStock = calculatePreviewStock();

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
          {/* Header thông tin sản phẩm */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.productTitle}>{product.name}</Text>
              <Text style={styles.productSubtitle}>
                Tồn hiện tại: <Text style={styles.stockHighlight}>{currentStock} {product.unit}</Text> | Giá vốn: {formatVND(product.price)}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeHeaderBtn} onPress={() => setVisible(false)}>
              <Text style={styles.closeHeaderText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Thanh chuyển đổi Tab: Nhập / Xuất / Kiểm kê */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'IN' && styles.tabBtnInActive]}
              onPress={() => {
                setActiveTab('IN');
                setErrorMsg('');
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, activeTab === 'IN' && styles.tabTextInActive]}>
                + Nhập hàng
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'OUT' && styles.tabBtnOutActive]}
              onPress={() => {
                setActiveTab('OUT');
                setErrorMsg('');
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, activeTab === 'OUT' && styles.tabTextOutActive]}>
                - Xuất kho
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'ADJUST' && styles.tabBtnAdjustActive]}
              onPress={() => {
                setActiveTab('ADJUST');
                setErrorMsg('');
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, activeTab === 'ADJUST' && styles.tabTextAdjustActive]}>
                ⚖️ Kiểm kho
              </Text>
            </TouchableOpacity>
          </View>

          {errorMsg ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
            {/* Nhập số lượng */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                {activeTab === 'IN'
                  ? `Số lượng nhập thêm (${product.unit}) *`
                  : activeTab === 'OUT'
                  ? `Số lượng xuất ra (${product.unit}) *`
                  : `Số lượng thực tế đếm được (${product.unit}) *`}
              </Text>
              <TextInput
                style={styles.input}
                value={quantity}
                onChangeText={(text) => setQuantity(formatQuantityInput(text))}
                placeholder={activeTab === 'ADJUST' ? `Số thực tế (Hiện có ${currentStock})` : 'Ví dụ: 10'}
                keyboardType="decimal-pad"
                placeholderTextColor="#94A3B8"
                autoFocus
              />
            </View>

            {/* Giá nhập mới (Chỉ hiển thị khi Nhập hàng) */}
            {activeTab === 'IN' && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Đơn giá nhập đợt này (đ/{product.unit})</Text>
                <TextInput
                  style={styles.input}
                  value={price}
                  onChangeText={(t) => setPrice(formatNumberString(t))}
                  placeholder="Giá nhập mới"
                  keyboardType="numeric"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            )}

            {/* Gợi ý lý do nhanh */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Lý do / Ghi chú</Text>
              <View style={styles.quickReasonsContainer}>
                {QUICK_REASONS[activeTab].map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.reasonBadge, reason === r && styles.reasonBadgeSelected]}
                    onPress={() => setReason(r)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.reasonBadgeText, reason === r && styles.reasonBadgeTextSelected]}>
                      {r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={[styles.input, { marginTop: 8 }]}
                value={reason}
                onChangeText={setReason}
                placeholder="Nhập ghi chú chi tiết..."
                placeholderTextColor="#94A3B8"
              />
            </View>

            {/* Bảng xem trước kết quả tồn kho */}
            <View style={styles.previewCard}>
              <Text style={styles.previewLabel}>Dự kiến tồn kho sau thao tác:</Text>
              <View style={styles.previewRow}>
                <Text style={styles.previewStockBefore}>
                  {currentStock} {product.unit}
                </Text>
                <Text style={styles.previewArrow}>➔</Text>
                <Text
                  style={[
                    styles.previewStockAfter,
                    activeTab === 'IN' && styles.textGreen,
                    activeTab === 'OUT' && styles.textRed,
                    activeTab === 'ADJUST' && styles.textBlue,
                  ]}
                >
                  {previewStock} {product.unit}
                </Text>
              </View>
            </View>
          </ScrollView>

          {/* Nút bấm hành động */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setVisible(false)}
              disabled={loading}
            >
              <Text style={styles.cancelBtnText}>Đóng</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.submitBtn,
                activeTab === 'IN' && styles.bgGreen,
                activeTab === 'OUT' && styles.bgRed,
                activeTab === 'ADJUST' && styles.bgBlue,
              ]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {activeTab === 'IN' ? 'Xác nhận Nhập' : activeTab === 'OUT' ? 'Xác nhận Xuất' : 'Cân bằng tồn kho'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    ...SHADOWS.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    paddingBottom: 12,
    marginBottom: 14,
  },
  productTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  productSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
  },
  stockHighlight: {
    fontWeight: 'bold',
    color: '#0F172A',
  },
  closeHeaderBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeHeaderText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: 'bold',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 4,
    marginBottom: 14,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabBtnInActive: {
    backgroundColor: '#10B981',
  },
  tabBtnOutActive: {
    backgroundColor: '#EF4444',
  },
  tabBtnAdjustActive: {
    backgroundColor: '#3B82F6',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextInActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  tabTextOutActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  tabTextAdjustActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  errorBox: {
    backgroundColor: '#FFF1F1',
    borderColor: '#FEE2E2',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
  },
  formScroll: {
    maxHeight: 320,
  },
  inputGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  input: {
    height: 42,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  quickReasonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  reasonBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reasonBadgeSelected: {
    backgroundColor: '#E0F2FE',
    borderColor: '#0284C7',
  },
  reasonBadgeText: {
    fontSize: 11,
    color: '#64748B',
  },
  reasonBadgeTextSelected: {
    color: '#0369A1',
    fontWeight: 'bold',
  },
  previewCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
    marginBottom: 8,
  },
  previewLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 4,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  previewStockBefore: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  previewArrow: {
    fontSize: 14,
    color: '#94A3B8',
  },
  previewStockAfter: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  textGreen: { color: '#059669' },
  textRed: { color: '#DC2626' },
  textBlue: { color: '#2563EB' },
  bgGreen: { backgroundColor: '#10B981' },
  bgRed: { backgroundColor: '#EF4444' },
  bgBlue: { backgroundColor: '#3B82F6' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
    borderTopWidth: 1,
    borderColor: '#F1F5F9',
    paddingTop: 12,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cancelBtnText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '500',
  },
  submitBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
});

export default InventoryActionModal;
