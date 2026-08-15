// meat-management-fe/src/components/WorkspaceEditActionModal.js
import React, { forwardRef, useImperativeHandle, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { api } from '../api/client';
import PopupModal from './PopupModal';

const { height: SCREEN_H } = Dimensions.get('window');

// Modal chỉnh sửa trực tiếp các thao tác của thành viên (Giao diện Sáng)
const WorkspaceEditActionModal = forwardRef(function WorkspaceEditActionModal(props, ref) {
  const [visible, setVisible] = useState(false);
  const [actionItem, setActionItem] = useState(null);
  const [loading, setLoading] = useState(false);

  // Form states dành cho các loại thao tác khác nhau
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [items, setItems] = useState([]);

  const popupRef = useRef(null);
  const onSaveSuccessRef = useRef(null);

  useImperativeHandle(ref, () => ({
    open: (item, onSaveSuccess) => {
      setActionItem(item);
      onSaveSuccessRef.current = onSaveSuccess;

      // Khởi tạo giá trị form dựa trên loại thao tác và dữ liệu gốc
      const raw = item?.rawItem || {};
      setNote(raw.note || '');
      setAmount(item?.amount ? String(item.amount) : '');

      if (item?.type === 'TRANSACTION' || item?.type === 'STORE_ORDER') {
        const rawItems = (raw.items || []).map((it) => ({
          productId: it.productId,
          productName: it.product?.name || 'Mặt hàng',
          unit: it.product?.unit || 'kg',
          quantity: String(parseFloat(it.quantity) || 1),
          price: String(parseFloat(it.price) || 0),
        }));
        setItems(rawItems);
      } else if (item?.type === 'CUSTOMER') {
        setCustomerName(raw.name || '');
        setCustomerPhone(raw.phone || '');
        setCustomerAddress(raw.address || '');
      }

      setVisible(true);
    },
    close: () => {
      setVisible(false);
      setActionItem(null);
    },
  }));

  const closeModal = () => {
    setVisible(false);
    setActionItem(null);
  };

  // Cập nhật số lượng hoặc giá của từng dòng sản phẩm trong đơn nợ
  const handleItemChange = (index, field, value) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Tính lại tổng tiền tạm tính cho đơn nợ khi sửa số lượng/giá
  const calculateTotal = () => {
    return items.reduce((sum, item) => {
      const q = parseFloat(item.quantity) || 0;
      const p = parseFloat(item.price) || 0;
      return sum + q * p;
    }, 0);
  };

  // Lưu chỉnh sửa lên máy chủ
  const handleSave = async () => {
    if (!actionItem) return;
    setLoading(true);

    try {
      const raw = actionItem.rawItem || {};

      if (actionItem.type === 'TRANSACTION') {
        // 1. Cập nhật đơn nợ thịt
        if (items.length === 0) {
          throw new Error('Đơn hàng phải có ít nhất 1 mặt hàng.');
        }
        const formattedItems = items.map((it) => ({
          productId: it.productId,
          productName: it.productName,
          quantity: parseFloat(it.quantity) || 0,
          price: parseFloat(it.price) || 0,
        }));

        await api.put(`/transactions/${actionItem.id}`, {
          note: note.trim(),
          items: formattedItems,
        });
      } else if (actionItem.type === 'PAYMENT') {
        // 2. Cập nhật lượt thu tiền
        const payAmount = parseFloat(amount);
        if (isNaN(payAmount) || payAmount <= 0) {
          throw new Error('Số tiền thu phải lớn hơn 0.');
        }

        await api.put(`/payments/${actionItem.id}`, {
          amount: payAmount,
          note: note.trim(),
        });
      } else if (actionItem.type === 'CUSTOMER') {
        // 3. Cập nhật thông tin khách hàng
        if (!customerName.trim()) {
          throw new Error('Tên khách hàng không được để trống.');
        }

        await api.put(`/customers/${actionItem.id}`, {
          name: customerName.trim(),
          phone: customerPhone.trim() || null,
          address: customerAddress.trim() || null,
          note: note.trim() || null,
        });
      } else if (actionItem.type === 'STORE_ORDER') {
        // 4. Cập nhật hóa đơn bàn ăn
        const formattedItems = items.map((it) => ({
          productId: it.productId,
          productName: it.productName,
          quantity: parseFloat(it.quantity) || 0,
          price: parseFloat(it.price) || 0,
        }));

        await api.put(`/store/transactions/${actionItem.id}`, {
          note: note.trim(),
          items: formattedItems,
        });
      } else if (actionItem.type === 'STORE_PAYMENT') {
        // 5. Cập nhật thanh toán bàn ăn
        await api.put(`/payments/${actionItem.id}`, {
          amount: parseFloat(amount) || raw.amount,
          note: note.trim(),
        });
      } else if (actionItem.type === 'INVENTORY') {
        // 6. Cập nhật sản phẩm tồn kho
        await api.put(`/inventory/products/${actionItem.id}`, {
          name: customerName.trim() || raw.name,
          quantity: parseFloat(amount) || raw.quantity,
          price: parseFloat(note) || raw.price,
        });
      } else {
        throw new Error('Loại thao tác này chưa hỗ trợ sửa trực tiếp.');
      }

      popupRef.current?.show({
        title: 'Thành công',
        message: 'Đã cập nhật thao tác thành công!',
        type: 'success',
        confirmText: 'ĐÓNG',
        onConfirm: () => {
          closeModal();
          if (onSaveSuccessRef.current) onSaveSuccessRef.current();
        },
      });
    } catch (error) {
      popupRef.current?.show({
        title: 'Lỗi cập nhật',
        message: error.response?.data?.message || error.message || 'Không thể lưu thay đổi.',
        type: 'error',
        confirmText: 'ĐÓNG',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!visible || !actionItem) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeModal}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>✏️ Chỉnh sửa thao tác</Text>
              <Text style={styles.subtitle}>
                {actionItem.typeName} — Nhân viên: {actionItem.actor?.name || 'Nhân viên'}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={closeModal}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Form nội dung theo loại thao tác */}
          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 20 }}>
            {/* Loại Đơn nợ thịt (TRANSACTION) hoặc Gọi món (STORE_ORDER) */}
            {(actionItem.type === 'TRANSACTION' || actionItem.type === 'STORE_ORDER') && (
              <View>
                <Text style={styles.sectionTitle}>Danh sách mặt hàng & đơn giá:</Text>
                {items.map((it, idx) => (
                  <View key={idx} style={styles.itemRow}>
                    <View style={{ flex: 1.5 }}>
                      <Text style={styles.itemName} numberOfLines={1}>{it.productName}</Text>
                      <Text style={styles.itemUnit}>Đơn vị: {it.unit}</Text>
                    </View>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.inputLabel}>Số lượng ({it.unit})</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="decimal-pad"
                        value={it.quantity}
                        onChangeText={(val) => handleItemChange(idx, 'quantity', val)}
                        placeholder="Số lượng"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                    <View style={{ flex: 1.3 }}>
                      <Text style={styles.inputLabel}>Đơn giá (đ)</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={it.price}
                        onChangeText={(val) => handleItemChange(idx, 'price', val)}
                        placeholder="Đơn giá"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                  </View>
                ))}

                {/* Tổng tiền tính tự động */}
                <View style={styles.totalBox}>
                  <Text style={styles.totalLabel}>Tổng tiền sau khi sửa:</Text>
                  <Text style={styles.totalValue}>{calculateTotal().toLocaleString('vi-VN')} đ</Text>
                </View>

                {/* Ghi chú */}
                <Text style={[styles.inputLabel, { marginTop: 12 }]}>Ghi chú đơn hàng:</Text>
                <TextInput
                  style={[styles.input, { height: 44 }]}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Nhập ghi chú mới nếu có..."
                  placeholderTextColor="#94A3B8"
                />
              </View>
            )}

            {/* Loại Thu tiền nợ (PAYMENT) hoặc Thanh toán bàn ăn (STORE_PAYMENT) */}
            {(actionItem.type === 'PAYMENT' || actionItem.type === 'STORE_PAYMENT') && (
              <View>
                <Text style={styles.inputLabel}>Số tiền thu (VNĐ):</Text>
                <TextInput
                  style={[styles.input, { fontSize: 16, fontWeight: 'bold', color: '#059669', marginBottom: 16 }]}
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="Nhập số tiền..."
                  placeholderTextColor="#94A3B8"
                />

                <Text style={styles.inputLabel}>Ghi chú thu tiền:</Text>
                <TextInput
                  style={[styles.input, { height: 60 }]}
                  multiline
                  value={note}
                  onChangeText={setNote}
                  placeholder="Nhập ghi chú thu tiền..."
                  placeholderTextColor="#94A3B8"
                />
              </View>
            )}

            {/* Loại Khách hàng (CUSTOMER) */}
            {actionItem.type === 'CUSTOMER' && (
              <View>
                <Text style={styles.inputLabel}>Tên khách hàng (*):</Text>
                <TextInput
                  style={[styles.input, { marginBottom: 12 }]}
                  value={customerName}
                  onChangeText={setCustomerName}
                  placeholder="Nhập tên khách..."
                  placeholderTextColor="#94A3B8"
                />

                <Text style={styles.inputLabel}>Số điện thoại:</Text>
                <TextInput
                  style={[styles.input, { marginBottom: 12 }]}
                  keyboardType="phone-pad"
                  value={customerPhone}
                  onChangeText={setCustomerPhone}
                  placeholder="Nhập số điện thoại..."
                  placeholderTextColor="#94A3B8"
                />

                <Text style={styles.inputLabel}>Địa chỉ:</Text>
                <TextInput
                  style={[styles.input, { marginBottom: 12 }]}
                  value={customerAddress}
                  onChangeText={setCustomerAddress}
                  placeholder="Nhập địa chỉ..."
                  placeholderTextColor="#94A3B8"
                />

                <Text style={styles.inputLabel}>Ghi chú:</Text>
                <TextInput
                  style={[styles.input, { height: 50 }]}
                  multiline
                  value={note}
                  onChangeText={setNote}
                  placeholder="Ghi chú thêm..."
                  placeholderTextColor="#94A3B8"
                />
              </View>
            )}
          </ScrollView>

          {/* Footer nút hành động */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={closeModal} disabled={loading}>
              <Text style={styles.cancelBtnText}>HỦY</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveBtnText}>LƯU THAY ĐỔI</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <PopupModal ref={popupRef} />
    </Modal>
  );
});

export default WorkspaceEditActionModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '95%',
    maxWidth: 600,
    maxHeight: SCREEN_H * 0.85,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 12,
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#7C3AED',
    marginTop: 2,
    fontWeight: '600',
  },
  closeBtn: {
    backgroundColor: '#F1F5F9',
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: 'bold',
  },
  body: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#475569',
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  itemName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  itemUnit: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  inputLabel: {
    fontSize: 11,
    color: '#475569',
    marginBottom: 4,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    height: 36,
    color: '#0F172A',
    fontSize: 13,
  },
  totalBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FAF5FF',
    borderColor: '#DDD6FE',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 16,
    color: '#7C3AED',
    fontWeight: 'bold',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 12,
    marginTop: 12,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
  },
  saveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#7C3AED',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 120,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
});
