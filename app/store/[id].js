// meat-management-fe/app/store/[id].js
import React, { useState, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  ScrollView,
  RefreshControl,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../src/api/client';
import { COLORS, FONTS, SHADOWS } from '../../src/theme';
import OrderModal from '../../src/components/store/OrderModal';
import TablePaymentModal from '../../src/components/store/TablePaymentModal';
import ScanInvoiceModal from '../../src/components/store/ScanInvoiceModal';
import StorePopupModal from '../../src/components/store/StorePopupModal';
import { startNativeRecording, stopNativeRecording } from '../../src/utils/mediaActions';

import { useAuthStore } from '../../src/store/authStore';

export default function TableDetailScreen() {
  const auth = useAuthStore();
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [isRecording, setIsRecording] = useState(false);
  const [scanning, setScanning] = useState(false);

  const orderModalRef = useRef(null);
  const paymentModalRef = useRef(null);
  const scanInvoiceModalRef = useRef(null);
  const popupModalRef = useRef(null);
  const mediaRecorderRef = useRef(null);

  // 1. Tải chi tiết bàn ăn
  const {
    data: tableResponse,
    isLoading: isLoadingTable,
    refetch: refetchTable,
  } = useQuery({
    queryKey: ['store_table', id],
    queryFn: async () => {
      const response = await api.get(`/store/customers/${id}`);
      return response.data;
    },
    enabled: !!id && auth.hasPermission('canManageStore'),
  });

  // 2. Tải danh sách đơn đặt món (giao dịch) của bàn này
  const {
    data: transResponse,
    isLoading: isLoadingTrans,
    refetch: refetchTrans,
  } = useQuery({
    queryKey: ['store_transactions', id],
    queryFn: async () => {
      const response = await api.get(`/store/transactions?customerId=${id}`);
      return response.data;
    },
    enabled: !!id && auth.hasPermission('canManageStore'),
  });

  // 3. Tải danh sách các đợt thanh toán của bàn này
  const {
    data: paymentsResponse,
    isLoading: isLoadingPayments,
    refetch: refetchPayments,
  } = useQuery({
    queryKey: ['store_payments', id],
    queryFn: async () => {
      const response = await api.get(`/store/payments?customerId=${id}`);
      return response.data;
    },
    enabled: !!id && auth.hasPermission('canManageStore'),
  });

  const table = tableResponse?.data;
  const transactions = transResponse?.data || [];
  const payments = paymentsResponse?.data || [];

  // Tính tổng nợ/tiền chưa thanh toán của bàn
  const unpaidBalance = useMemo(() => {
    const totalOrder = transactions.reduce((sum, t) => sum + parseFloat(t.totalAmount || 0), 0);
    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    return Math.max(0, totalOrder - totalPaid);
  }, [transactions, payments]);

  const handleRefresh = () => {
    refetchTable();
    refetchTrans();
    refetchPayments();
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
      .format(val)
      .replace('₫', 'đ');
  };

  const convertIsoToDisplay = (isoStr) => {
    if (!isoStr) return '';
    const parts = isoStr.split('T')[0].split('-');
    if (parts.length !== 3) return isoStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const processParseResult = (responseData, sourceTitle) => {
    const { data } = responseData;
    const results = Array.isArray(data) ? data : [data].filter(Boolean);
    const firstResult = results[0];

    if (!firstResult) {
      popupModalRef.current?.show({
        title: 'Không có kết quả',
        message: 'AI không nhận diện được món ăn gọi món.',
        type: 'warning',
      });
      return;
    }

    const items = results.map((res) => {
      const qty = parseFloat(res.quantity || res.weight_kg) || 1;
      const amt = parseInt(res.amount) || 0;
      const prc = parseInt(res.price) || (qty > 0 ? Math.round(amt / qty) : 0);

      return {
        product: {
          name: res.product?.name || res.meat_type || 'Món lẻ',
          unit: res.product?.unit || 'phần',
          defaultPrice: prc,
        },
        quantity: qty,
        price: prc,
        amount: amt || Math.round(qty * prc),
        voiceDate: res.voiceDate || responseData.date || firstResult.date,
        voiceCustomerName: table?.name || '',
      };
    });

    scanInvoiceModalRef.current?.open(
      items,
      sourceTitle,
      responseData.rawTranscript || '',
      responseData.date || firstResult.date,
      table?.name || '',
      id
    );
  };

  // Ghi âm gọi món bằng giọng nói cho riêng bàn này
  const handleToggleRecording = async () => {
    if (isRecording) {
      setIsRecording(false);
      setScanning(true);
      try {
        let audioData = null;
        if (mediaRecorderRef.current) {
          audioData = await stopNativeRecording(mediaRecorderRef.current);
          mediaRecorderRef.current = null;
        }

        const response = await api.post('/store/voice-to-text', {
          audio: audioData ? audioData.dataUri : 'mock_audio_base64',
          mimeType: audioData ? audioData.mimeType : 'audio/webm',
        });

        if (response.data.success) {
          processParseResult(response.data, '🎤 KẾT QUẢ GHI NỢ GIỌNG NÓI');
        } else {
          popupModalRef.current?.show({
            title: 'Thất bại',
            message: response.data.message || 'Không nhận dạng được âm thanh.',
            type: 'error',
          });
        }
      } catch (err) {
        console.error(err);
        popupModalRef.current?.show({
          title: 'Lỗi',
          message: 'Lỗi mạng khi phân tích giọng nói.',
          type: 'error',
        });
      } finally {
        setScanning(false);
      }
    } else {
      try {
        mediaRecorderRef.current = await startNativeRecording();
        setIsRecording(true);
      } catch (err) {
        // Fallback nhập văn bản
        popupModalRef.current?.show({
          title: 'Nhập câu thoại gọi món',
          message: `Nhập món ăn cho ${table?.name || 'bàn này'}`,
          type: 'confirm',
          showTextInput: true,
          textInputPlaceholder: 'Ví dụ: gọi 2 đĩa bún chả...',
          onConfirm: async (text) => {
            if (!text) return;
            setScanning(true);
            try {
              const res = await api.post('/store/voice-to-text', {
                transcript: text,
              });
              if (res.data.success) {
                processParseResult(res.data, '🎤 KẾT QUẢ PHÂN TÍCH GIỌNG NÓI');
              }
            } catch (err2) {
              console.error(err2);
            } finally {
              setScanning(false);
            }
          },
        });
      }
    }
  };

  // Xác nhận xóa một hóa đơn gọi món
  const handleDeleteTransaction = (transId) => {
    popupModalRef.current?.show({
      title: 'Xác nhận hủy hóa đơn',
      message: 'Bạn có chắc chắn muốn hủy đơn gọi món này không? Số tiền nợ của bàn sẽ giảm tương ứng.',
      type: 'confirm',
      confirmText: 'Hủy đơn',
      cancelText: 'Quay lại',
      onConfirm: async () => {
        try {
          const response = await api.delete(`/store/transactions/${transId}`);
          if (response.data.success) {
            handleRefresh();
          } else {
            popupModalRef.current?.show({
              title: 'Lỗi',
              message: response.data.message || 'Không thể hủy hóa đơn.',
              type: 'error',
            });
          }
        } catch (err) {
          console.error(err);
        }
      },
    });
  };

  if (isLoadingTable || !table) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#5B21B6" />
      </View>
    );
  }

  const firstLetter = table?.name?.replace(/[^A-Za-z0-9]/g, '').slice(-2) || 'B';
  const avatarBg = unpaidBalance > 0 ? '#FEF2F2' : '#F0FDF4';
  const avatarText = unpaidBalance > 0 ? '#DC2626' : '#059669';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <View style={styles.contentWrapper}>
        {/* HEADER đơn giản: Nút Quay lại bên trái, Profile chủ tài khoản bên phải (Avatar bên trái Tên) */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButtonNew}
            onPress={() => router.replace('/store')}
            activeOpacity={0.7}
          >
            <Text style={styles.backTextNew}>← Quay lại</Text>
          </TouchableOpacity>

          <View style={styles.customerProfileCardRight}>
            <View style={[styles.avatarContainerRight, { backgroundColor: avatarBg }]}>
              <Text style={[styles.avatarTextRight, { color: avatarText }]}>
                {firstLetter}
              </Text>
            </View>
            <View style={styles.customerDetailsRight}>
              <Text style={styles.customerGreetingRight}>Bàn ăn 🏪</Text>
              <Text style={styles.customerNameRight} numberOfLines={1}>
                {table.name}
              </Text>
            </View>
          </View>
        </View>

        <ScrollView
          style={styles.content}
          refreshControl={<RefreshControl refreshing={isLoadingTrans || isLoadingPayments} onRefresh={handleRefresh} colors={['#5B21B6']} />}
        >
        {/* Hộp tổng quan công nợ bàn */}
        <View style={[styles.overviewCard, unpaidBalance > 0 ? styles.overviewServing : styles.overviewEmpty]}>
          <View>
            <Text style={styles.overviewLabel}>Tiền chưa thanh toán</Text>
            <Text style={[styles.overviewValue, { color: unpaidBalance > 0 ? '#EC4899' : '#10B981' }]}>
              {formatCurrency(unpaidBalance)}
            </Text>
          </View>
          {unpaidBalance > 0 && (
            <TouchableOpacity style={styles.payBtn} onPress={() => paymentModalRef.current?.open(unpaidBalance.toString())}>
              <Text style={styles.payBtnText}>Thanh toán 💵</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Nút hành động gọi món */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.actionBtnManual} onPress={() => orderModalRef.current?.open({ ...table, debt: unpaidBalance })}>
            <Text style={styles.actionBtnTextManual}>🍔 Gọi món thủ công</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtnVoice, isRecording && styles.actionBtnVoiceRecording]}
            onPress={handleToggleRecording}
          >
            {scanning ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.actionBtnTextVoice}>{isRecording ? '⏹️ Dừng ghi âm' : '🎤 Ghi âm gọi món'}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Lịch sử hoạt động của bàn */}
        <Text style={styles.sectionTitle}>📋 LỊCH SỬ GỌI MÓN & THANH TOÁN</Text>

        <View style={styles.historyList}>
          {/* Hóa đơn gọi món */}
          {transactions.map((t) => (
            <View key={t.id} style={styles.historyCard}>
              <View style={styles.historyCardHeader}>
                <View>
                  <Text style={styles.historyCardTitle}>🍔 Hóa đơn gọi món</Text>
                  <Text style={styles.historyCardDate}>{convertIsoToDisplay(t.date)}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.historyCardAmount}>+{formatCurrency(t.totalAmount)}</Text>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteTransaction(t.id)}>
                    <Text style={styles.deleteBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {t.items && t.items.length > 0 && (
                <View style={styles.historyCardBody}>
                  {t.items.map((item, idx) => (
                    <Text key={idx} style={styles.itemRow}>
                      • {item.product?.name || 'Món lẻ'}: {item.quantity} x {formatCurrency(item.price)}
                    </Text>
                  ))}
                </View>
              )}
              {t.note && <Text style={styles.historyCardNote}>💡 Ghi chú: {t.note}</Text>}
            </View>
          ))}

          {/* Các đợt thanh toán */}
          {payments.map((p) => (
            <View key={p.id} style={[styles.historyCard, styles.historyCardPayment]}>
              <View style={styles.historyCardHeader}>
                <View>
                  <Text style={[styles.historyCardTitle, { color: '#10B981' }]}>🟢 Đã thanh toán</Text>
                  <Text style={styles.historyCardDate}>{convertIsoToDisplay(p.paidAt)}</Text>
                </View>
                <Text style={[styles.historyCardAmount, { color: '#10B981' }]}>-{formatCurrency(p.amount)}</Text>
              </View>
              {p.note && <Text style={styles.historyCardNote}>💡 Ghi chú: {p.note}</Text>}
            </View>
          ))}

          {transactions.length === 0 && payments.length === 0 && (
            <Text style={styles.emptyText}>Bàn trống, chưa có giao dịch nào.</Text>
          )}
        </View>
      </ScrollView>
    </View>

    {/* Các Modals */}
      <OrderModal ref={orderModalRef} customerId={id} onRefresh={handleRefresh} />
      <TablePaymentModal ref={paymentModalRef} customerId={id} onRefresh={handleRefresh} />
      <ScanInvoiceModal ref={scanInvoiceModalRef} onRefresh={handleRefresh} />
      <StorePopupModal ref={popupModalRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    backgroundColor: '#F8FAFC',
    position: 'relative',
    borderLeftWidth: Platform.OS === 'web' ? 1 : 0,
    borderRightWidth: Platform.OS === 'web' ? 1 : 0,
    borderColor: '#E2E8F0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButtonNew: {
    width: 90,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  backTextNew: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
  },
  customerProfileCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainerRight: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  avatarTextRight: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  customerDetailsRight: {
    alignItems: 'flex-start',
  },
  customerGreetingRight: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  customerNameRight: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  overviewCard: {
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    ...SHADOWS.card,
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 5,
  },
  overviewEmpty: {
    borderLeftColor: '#10B981',
  },
  overviewServing: {
    borderLeftColor: '#EC4899',
  },
  overviewLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  overviewValue: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 4,
  },
  payBtn: {
    backgroundColor: '#FCE7F3',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#FBCFE8',
  },
  payBtnText: {
    color: '#EC4899',
    fontSize: 14,
    fontWeight: 'bold',
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  actionBtnManual: {
    flex: 1,
    height: 48,
    backgroundColor: '#EDE9FE',
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnTextManual: {
    color: '#5B21B6',
    fontWeight: 'bold',
    fontSize: 14,
  },
  actionBtnVoice: {
    flex: 1,
    height: 48,
    backgroundColor: '#5B21B6',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnVoiceRecording: {
    backgroundColor: '#DC2626',
  },
  actionBtnTextVoice: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
  },
  historyList: {
    paddingBottom: 40,
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 10,
    ...SHADOWS.card,
  },
  historyCardPayment: {
    borderColor: '#D1FAE5',
    backgroundColor: '#F0FDF4',
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyCardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  historyCardDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  historyCardAmount: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#EC4899',
  },
  deleteBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtnText: {
    color: COLORS.dangerDark,
    fontSize: 11,
    fontWeight: 'bold',
  },
  historyCardBody: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  itemRow: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  historyCardNote: {
    fontSize: 12,
    color: COLORS.textLight,
    fontStyle: 'italic',
    marginTop: 6,
  },
  emptyText: {
    color: COLORS.textLight,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 20,
  },
});
