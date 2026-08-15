// meat-management-fe/src/components/inventory/InventoryHistoryModal.js
import React, { useState, useImperativeHandle, forwardRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TouchableWithoutFeedback,
} from 'react-native';
import { api } from '../../api/client';
import { COLORS, FONTS, SHADOWS } from '../../theme';

// Định dạng tiền tệ VND
const formatVND = (num) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num || 0);
};

// Định dạng ngày giờ hiển thị
const formatDateTime = (dateString) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes} - ${day}/${month}/${year}`;
};

// Modal Xem Thẻ Kho / Lịch sử biến động của 1 sản phẩm
const InventoryHistoryModal = forwardRef((_, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [productInfo, setProductInfo] = useState(null);
  const [logs, setLogs] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  // Tải danh sách lịch sử biến động từ API
  const fetchLogs = async (productId) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const response = await api.get(`/inventory/products/${productId}/logs`);
      if (response.data && response.data.success) {
        setProductInfo(response.data.data);
        setLogs(response.data.data.logs || []);
      } else {
        setErrorMsg('Không thể tải lịch sử biến động.');
      }
    } catch (error) {
      console.error('Lỗi tải lịch sử kho:', error);
      setErrorMsg(error.response?.data?.message || 'Không thể kết nối máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    open: (prod) => {
      setProductInfo({
        productName: prod.name,
        unit: prod.unit,
        currentQty: parseFloat(prod.quantity || 0),
      });
      setLogs([]);
      setVisible(true);
      fetchLogs(prod.id);
    },
    close: () => {
      setVisible(false);
    },
  }));

  if (!visible) return null;

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
          {/* Header modal */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>📜 Lịch Sử Sử Dụng Sản Phẩm</Text>
              {productInfo && (
                <Text style={styles.subtitle}>
                  Sản phẩm: <Text style={styles.nameHighlight}>{productInfo.productName}</Text> (Tồn hiện tại: {productInfo.currentQty} {productInfo.unit})
                </Text>
              )}
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setVisible(false)}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Nội dung danh sách lịch sử */}
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.loadingText}>Đang nạp dữ liệu lịch sử sử dụng...</Text>
            </View>
          ) : errorMsg ? (
            <View style={styles.center}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : logs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Chưa có lịch sử sử dụng nào cho sản phẩm này.</Text>
            </View>
          ) : (
            <FlatList
              data={logs}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const isTypeIn = item.type === 'IN';
                const isTypeOut = item.type === 'OUT';
                const isTypeAdjust = item.type === 'ADJUST';

                const qtyNum = parseFloat(item.quantity || 0);
                const prevQty = parseFloat(item.previousQty || 0);
                const nextQty = parseFloat(item.newQty || 0);

                return (
                  <View style={styles.logCard}>
                    <View style={styles.logHeader}>
                      {/* Badge loại biến động */}
                      <View
                        style={[
                          styles.typeBadge,
                          isTypeIn && styles.badgeIn,
                          isTypeOut && styles.badgeOut,
                          isTypeAdjust && styles.badgeAdjust,
                        ]}
                      >
                        <Text
                          style={[
                            styles.typeBadgeText,
                            isTypeIn && styles.textIn,
                            isTypeOut && styles.textOut,
                            isTypeAdjust && styles.textAdjust,
                          ]}
                        >
                          {isTypeIn ? '📥 Nhập kho' : isTypeOut ? '📤 Xuất kho' : '⚖️ Kiểm kê'}
                        </Text>
                      </View>

                      <Text style={styles.logTime}>{formatDateTime(item.createdAt)}</Text>
                    </View>

                    <View style={styles.logBody}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.logReason}>
                          {item.reason || (isTypeIn ? 'Nhập hàng' : isTypeOut ? 'Xuất kho' : 'Kiểm kê')}
                        </Text>
                        <Text style={styles.logBalance}>
                          Tồn kho: {prevQty} ➔ <Text style={{ fontWeight: 'bold', color: '#0F172A' }}>{nextQty} {productInfo?.unit}</Text>
                        </Text>
                      </View>

                      {/* Số lượng thay đổi */}
                      <View style={styles.logQtyCol}>
                        <Text
                          style={[
                            styles.logDeltaQty,
                            isTypeIn && styles.textIn,
                            isTypeOut && styles.textOut,
                            isTypeAdjust && styles.textAdjust,
                          ]}
                        >
                          {isTypeIn ? `+${qtyNum}` : isTypeOut ? `-${qtyNum}` : `±${qtyNum}`} {productInfo?.unit}
                        </Text>
                        {parseFloat(item.price || 0) > 0 && isTypeIn && (
                          <Text style={styles.logPriceText}>Giá: {formatVND(item.price)}</Text>
                        )}
                      </View>
                    </View>
                  </View>
                );
              }}
            />
          )}

          {/* Nút đóng ở dưới */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.footerCloseBtn} onPress={() => setVisible(false)}>
              <Text style={styles.footerCloseText}>Đóng</Text>
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
    maxWidth: 460,
    height: '80%',
    maxHeight: 600,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    ...SHADOWS.card,
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
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
  },
  nameHighlight: {
    fontWeight: 'bold',
    color: '#1E40AF',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: 'bold',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 8,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
  },
  listContent: {
    gap: 10,
    paddingBottom: 12,
  },
  logCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  badgeIn: { backgroundColor: '#D1FAE5' },
  badgeOut: { backgroundColor: '#FEE2E2' },
  badgeAdjust: { backgroundColor: '#DBEAFE' },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  textIn: { color: '#059669' },
  textOut: { color: '#DC2626' },
  textAdjust: { color: '#2563EB' },
  logTime: {
    fontSize: 11,
    color: '#94A3B8',
  },
  logBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logReason: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
  },
  logBalance: {
    fontSize: 11,
    color: '#64748B',
  },
  logQtyCol: {
    alignItems: 'flex-end',
  },
  logDeltaQty: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  logPriceText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  footer: {
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    paddingTop: 12,
    alignItems: 'flex-end',
  },
  footerCloseBtn: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  footerCloseText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default InventoryHistoryModal;
