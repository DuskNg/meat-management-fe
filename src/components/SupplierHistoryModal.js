// meat-management-fe/src/components/SupplierHistoryModal.js
import React, { useState, forwardRef, useImperativeHandle, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import SmoothModal from './SmoothModal';

// Modal xem lịch sử dòng công nợ của nhà cung cấp
const SupplierHistoryModal = forwardRef(({ supplier }, ref) => {
  const [visible, setVisible] = useState(false);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true);
      fetchHistory();
    },
    close: () => {
      setVisible(false);
    },
  }));

  const fetchHistory = async () => {
    if (!supplier?.id) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/suppliers/${supplier.id}/history`);
      if (response.data.success) {
        setHistory(response.data.data);
      } else {
        setError(response.data.message || 'Không thể tải lịch sử giao dịch.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Có lỗi khi kết nối máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount).replace('₫', 'đ');
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  };

  const renderHistoryItem = ({ item }) => {
    const isDebt = item.type === 'DEBT';
    return (
      <View style={styles.historyCard}>
        <View style={styles.cardLeft}>
          <View style={[styles.typeBadge, isDebt ? styles.badgeDebt : styles.badgePayment]}>
            <Text style={[styles.typeText, isDebt ? styles.textDebt : styles.textPayment]}>
              {isDebt ? '📥 Nhập nợ' : '💵 Trả tiền'}
            </Text>
          </View>
          <Text style={styles.dateText}>{formatDate(item.date)}</Text>
        </View>

        <View style={styles.cardRight}>
          <Text style={[styles.amountText, isDebt ? styles.amountDebt : styles.amountPayment]}>
            {isDebt ? '+' : '-'}{formatCurrency(item.amount)}
          </Text>
          {item.note ? <Text style={styles.noteText} numberOfLines={2}>{item.note}</Text> : null}
        </View>
      </View>
    );
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        <Text style={styles.modalTitle}>👁️ LỊCH SỬ GIAO DỊCH</Text>
        <Text style={styles.supplierName}>Nhà cung cấp: {supplier?.name}</Text>

        {loading ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 40 }} />
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchHistory}>
              <Text style={styles.retryText}>Thử lại 🔄</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={history}
            renderItem={renderHistoryItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Chưa có giao dịch nhập hàng hay trả tiền nào được ghi nhận.</Text>
              </View>
            }
          />
        )}

        <TouchableOpacity style={styles.closeButton} onPress={() => setVisible(false)}>
          <Text style={styles.closeButtonText}>ĐÓNG LẠI</Text>
        </TouchableOpacity>
      </View>
    </SmoothModal>
  );
});

export default SupplierHistoryModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  supplierName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 15,
  },
  listContent: {
    paddingBottom: 20,
  },
  historyCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardLeft: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 6,
  },
  typeBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  badgeDebt: {
    backgroundColor: '#FFE2E2',
  },
  badgePayment: {
    backgroundColor: '#E8F5E9',
  },
  typeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  textDebt: {
    color: '#D32F2F',
  },
  textPayment: {
    color: '#388E3C',
  },
  dateText: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  cardRight: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 10,
  },
  amountText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  amountDebt: {
    color: '#D32F2F', // Màu đỏ cho nợ tăng thêm
  },
  amountPayment: {
    color: '#388E3C', // Màu xanh cho khoản đã trả giảm nợ
  },
  noteText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: 'right',
  },
  errorContainer: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: COLORS.inputBg,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  retryText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textLight,
    textAlign: 'center',
    lineHeight: 20,
  },
  closeButton: {
    backgroundColor: COLORS.inputBg,
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  closeButtonText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: 'bold',
  },
});
