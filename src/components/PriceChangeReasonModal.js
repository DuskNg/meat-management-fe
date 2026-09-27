// meat-management-fe/src/components/PriceChangeReasonModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import SmoothModal from './SmoothModal';
import { COLORS } from '../theme';

// Các gợi ý lý do phổ biến để chọn nhanh trên màn hình điện thoại
const QUICK_REASONS = [
  'Giá thị trường tăng',
  'Giá thị trường giảm',
  'Khách thân thiết ưu đãi',
  'Hàng loại 1 đặc biệt',
  'Khách lấy số lượng lớn',
  'Khách yêu cầu giảm giá',
];

// Định dạng tiền tệ VNĐ
const formatCurrency = (amount) => {
  if (amount === undefined || amount === null || isNaN(amount)) return '0 đ';
  return `${Number(amount).toLocaleString('vi-VN')} đ`;
};

/**
 * Modal nhập lý do khi thay đổi giá riêng của khách hàng
 * - Áp dụng chuẩn Mobile-First Bottom-Sheet
 * - Expose qua ref: open({ items, customerName, onConfirm })
 */
const PriceChangeReasonModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [changedItems, setChangedItems] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [reason, setReason] = useState('');
  const onConfirmCallbackRef = useRef(null);

  // Mở modal và nhận thông tin các mặt hàng thay đổi giá cùng callback
  useImperativeHandle(ref, () => ({
    open: ({ items = [], customerName = '', onConfirm = null }) => {
      setChangedItems(items);
      setCustomerName(customerName || '');
      setReason('');
      onConfirmCallbackRef.current = onConfirm;
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Đóng modal
  const handleClose = () => {
    setVisible(false);
  };

  // Xác nhận lưu kèm lý do
  const handleConfirm = () => {
    const finalReason = reason.trim();
    setVisible(false);
    if (onConfirmCallbackRef.current) {
      onConfirmCallbackRef.current(finalReason || null);
    }
  };

  // Bỏ qua (không ghi lý do, vẫn tiếp tục lưu giá)
  const handleSkip = () => {
    setVisible(false);
    if (onConfirmCallbackRef.current) {
      onConfirmCallbackRef.current(null);
    }
  };

  // Chọn nhanh lý do từ gợi ý
  const handleSelectQuickReason = (text) => {
    setReason(text);
  };

  return (
    <SmoothModal visible={visible} onClose={handleClose} zIndex={props.zIndex || 9999999}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ width: '100%' }}
      >
        <View style={styles.modalView}>
          {/* Header Modal */}
          <View style={styles.header}>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerIcon}>📝</Text>
              <Text style={styles.headerTitle}>LÝ DO THAY ĐỔI ĐƠN GIÁ</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleClose}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            {/* Tên khách hàng (nếu có) */}
            {customerName ? (
              <View style={styles.customerCard}>
                <Text style={styles.customerLabel}>Khách hàng:</Text>
                <Text style={styles.customerValue}>{customerName}</Text>
              </View>
            ) : null}

            {/* Danh sách các mặt hàng có giá bị thay đổi */}
            <View style={styles.itemsCard}>
              <Text style={styles.itemsCardTitle}>Các mặt hàng điều chỉnh giá:</Text>
              {changedItems.map((item, idx) => (
                <View key={idx} style={styles.itemRow}>
                  <Text style={styles.itemName}>• {item.productName || item.name || 'Thịt'}</Text>
                  <View style={styles.priceFlowWrap}>
                    <Text style={styles.oldPriceText}>{formatCurrency(item.oldPrice)}</Text>
                    <Text style={styles.arrowText}>➔</Text>
                    <Text style={styles.newPriceText}>{formatCurrency(item.newPrice)}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Ô nhập lý do */}
            <View style={styles.inputWrap}>
              <Text style={styles.inputLabel}>
                Lý do thay đổi giá <Text style={styles.inputLabelSub}>(lưu lại lý do mới nhất)</Text>:
              </Text>
              <TextInput
                style={styles.textInput}
                multiline
                numberOfLines={3}
                placeholder="Nhập lý do đổi giá (ví dụ: Thịt nhập tăng giá, Khách lấy nhiều ưu đãi...)"
                placeholderTextColor="#94A3B8"
                value={reason}
                onChangeText={setReason}
                textAlignVertical="top"
              />
            </View>

            {/* Gợi ý lý do bấm 1 chạm */}
            <View style={styles.quickWrap}>
              <Text style={styles.quickTitle}>Gợi ý nhanh:</Text>
              <View style={styles.chipGrid}>
                {QUICK_REASONS.map((q, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.chip, reason === q && styles.chipActive]}
                    onPress={() => handleSelectQuickReason(q)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, reason === q && styles.chipTextActive]}>
                      {q}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Footer nút hành động */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.skipBtn}
              onPress={handleSkip}
              activeOpacity={0.7}
            >
              <Text style={styles.skipBtnText}>BỎ QUA LÝ DO</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={handleConfirm}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmBtnText}>XÁC NHẬN & LƯU</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SmoothModal>
  );
});

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 20,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#64748B',
  },
  scrollContent: {
    paddingVertical: 12,
  },
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  customerLabel: {
    fontSize: 13,
    color: '#64748B',
    marginRight: 6,
  },
  customerValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
    flex: 1,
  },
  itemsCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  itemsCardTitle: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#C2410C',
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  itemName: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
    marginRight: 8,
  },
  priceFlowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  oldPriceText: {
    fontSize: 12.5,
    color: '#64748B',
    textDecorationLine: 'line-through',
  },
  arrowText: {
    fontSize: 12,
    color: '#94A3B8',
    marginHorizontal: 6,
  },
  newPriceText: {
    fontSize: 13.5,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  inputWrap: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13.5,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 6,
  },
  inputLabelSub: {
    fontSize: 12,
    fontWeight: 'normal',
    color: '#64748B',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    minHeight: 74,
  },
  quickWrap: {
    marginBottom: 10,
  },
  quickTitle: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 8,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  chipText: {
    fontSize: 12,
    color: '#475569',
  },
  chipTextActive: {
    color: '#1D4ED8',
    fontWeight: 'bold',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  skipBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#64748B',
  },
  confirmBtn: {
    flex: 2,
    height: 46,
    borderRadius: 12,
    backgroundColor: COLORS.primary || '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});

export default PriceChangeReasonModal;
