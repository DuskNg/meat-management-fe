// meat-management-fe/src/components/AssignBankTransactionModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import SmoothModal from './SmoothModal';
import CustomSelect from './CustomSelect';
import { api } from '../api/client';
import { COLORS } from '../theme';
import { showGlobalToast } from '../store/toastStore';

const formatCurrency = (amount) =>
  new Intl.NumberFormat('vi-VN').format(Math.round(amount || 0));

const formatDateTime = (isoDate) => {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes} ${day}/${month}/${year}`;
};

const AssignBankTransactionModal = forwardRef(({ onAssigned }, ref) => {
  const [visible, setVisible] = useState(false);
  const [transaction, setTransaction] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [note, setNote] = useState('');
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useImperativeHandle(ref, () => ({
    open: async (tx) => {
      setTransaction(tx);
      setSelectedCustomerId(tx?.matchedCustomerId || null);
      setNote(tx?.description || `Thu tiền trả nợ qua CK ${tx?.gateway || 'NH'}: ${tx?.content || ''}`);
      setVisible(true);

      // Tải danh sách khách hàng hoạt động
      try {
        setLoadingCustomers(true);
        const res = await api.get('/customers');
        const activeCusts = (res.data?.data || []).filter((c) => c.isActive && !c.isBadDebt);
        setCustomers(activeCusts);
      } catch (err) {
        console.error('Lỗi tải khách hàng:', err);
      } finally {
        setLoadingCustomers(false);
      }
    },
    close: () => {
      setVisible(false);
    },
  }));

  const handleClose = () => {
    if (submitting) return;
    setVisible(false);
  };

  const handleConfirm = async () => {
    if (!selectedCustomerId) {
      showGlobalToast('Vui lòng chọn khách hàng để gán', 'warning');
      return;
    }

    try {
      setSubmitting(true);
      const res = await api.post(`/bank-transactions/${transaction.id}/assign-customer`, {
        customerId: selectedCustomerId,
        note: note.trim() || undefined,
      });

      if (res.data?.success) {
        showGlobalToast(res.data?.message || 'Đã gán thành công vào khách hàng!', 'success');
        setVisible(false);
        if (onAssigned) {
          onAssigned(res.data?.data);
        }
      }
    } catch (err) {
      console.error('Lỗi khi gán giao dịch:', err);
      showGlobalToast(err.response?.data?.message || 'Không thể gán giao dịch.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCustomerObj = customers.find((c) => c.id === selectedCustomerId) || null;

  return (
    <SmoothModal visible={visible} onClose={handleClose}>
      <View style={styles.modalView}>
        {/* Header Modal */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerIcon}>💳</Text>
            <Text style={styles.headerTitle}>GÁN GIAO DỊCH VÀO KHÁCH HÀNG</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose} disabled={submitting}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Nội dung cuộn */}
        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          {/* Thẻ thông tin giao dịch ngân hàng */}
          <View style={styles.txInfoCard}>
            <View style={styles.txRow}>
              <Text style={styles.txLabel}>Số tiền:</Text>
              <Text style={styles.txAmount}>+{formatCurrency(transaction?.transferAmount)} đ</Text>
            </View>
            <View style={styles.txRow}>
              <Text style={styles.txLabel}>Ngân hàng:</Text>
              <Text style={styles.txVal}>{transaction?.gateway || 'Ngân hàng'} ({transaction?.accountNumber})</Text>
            </View>
            <View style={styles.txRow}>
              <Text style={styles.txLabel}>Thời gian:</Text>
              <Text style={styles.txVal}>{formatDateTime(transaction?.transactionDate)}</Text>
            </View>
            <View style={styles.txContentBox}>
              <Text style={styles.txContentLabel}>Nội dung CK:</Text>
              <Text style={styles.txContentText}>{transaction?.content || 'Không có nội dung'}</Text>
            </View>
          </View>

          {/* Ô chọn khách hàng */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              CHỌN KHÁCH HÀNG ĐỂ TRỪ NỢ <Text style={styles.required}>*</Text>
            </Text>
            {loadingCustomers ? (
              <ActivityIndicator size="small" color="#10B981" style={{ marginVertical: 10 }} />
            ) : (
              <CustomSelect
                value={selectedCustomerObj}
                options={customers}
                placeholder="-- Gõ tìm hoặc chọn khách hàng --"
                getOptionLabel={(c) => c ? `${c.name}${c.phone ? ` (${c.phone})` : ''}` : ''}
                renderSelected={(c) => (c ? c.name : '')}
                onSelect={(c) => setSelectedCustomerId(c ? c.id : null)}
                triggerStyle={styles.selectTrigger}
              />
            )}
          </View>

          {/* Ô ghi chú phiếu thu */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>GHI CHÚ PHIẾU THU</Text>
            <TextInput
              style={styles.textInput}
              value={note}
              onChangeText={setNote}
              placeholder="Ghi chú thêm cho phiếu thu nợ..."
              placeholderTextColor="#94A3B8"
              multiline
            />
          </View>
        </ScrollView>

        {/* Nút hành động ở chân modal */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.confirmBtn, submitting && styles.disabledBtn]}
            onPress={handleConfirm}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.confirmBtnText}>✓ XÁC NHẬN GÁN & TRỪ NỢ</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SmoothModal>
  );
});

export default AssignBankTransactionModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: {
    fontSize: 20,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: 'bold',
  },
  body: {
    maxHeight: 460,
  },
  txInfoCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  txLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  txVal: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '600',
  },
  txAmount: {
    fontSize: 17,
    color: '#059669',
    fontWeight: 'bold',
  },
  txContentBox: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  txContentLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 2,
  },
  txContentText: {
    fontSize: 13,
    color: '#0F172A',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  required: {
    color: '#EF4444',
  },
  selectTrigger: {
    borderWidth: 0,
    borderColor: 'transparent',
    outlineStyle: 'none',
    outlineWidth: 0,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    minHeight: 70,
    textAlignVertical: 'top',
  },
  footer: {
    marginTop: 14,
  },
  confirmBtn: {
    backgroundColor: '#10B981',
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledBtn: {
    opacity: 0.6,
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
