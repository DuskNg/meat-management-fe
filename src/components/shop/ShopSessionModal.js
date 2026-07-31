// meat-management-fe/src/components/shop/ShopSessionModal.js
import React, { useState, forwardRef, useImperativeHandle, useEffect, useRef } from 'react';
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
import { api } from '../../api/client';
import { COLORS, FONTS } from '../../theme';
import SmoothModal from '../SmoothModal';

/**
 * Component ShopSessionModal quản lý phiên chơi:
 * - Theo dõi thời gian thực của phiên đang chơi (cập nhật mỗi giây để trực quan)
 * - Cập nhật khoản phụ thu (nước uống, đồ ăn nhanh)
 * - Kết thúc chơi tính tiền giờ
 * - Xác nhận thanh toán hóa đơn phiên chơi
 */
const ShopSessionModal = forwardRef(({ onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [table, setTable] = useState(null);
  const [session, setSession] = useState(null);

  // States phụ thu
  const [extraAmount, setExtraAmount] = useState('0');
  const [extraNote, setExtraNote] = useState('');

  // States tính toán động
  const [playTimeText, setPlayTimeText] = useState('0 phút 0 giây');
  const [playAmount, setPlayAmount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);

  // Phơi bày các phương thức ra bên ngoài
  useImperativeHandle(ref, () => ({
    open: (targetTable, targetSession) => {
      setError('');
      setTable(targetTable);
      setSession(targetSession);
      setExtraAmount(targetSession.extraAmount.toString());
      setExtraNote(targetSession.extraNote || '');
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    }
  }));

  // Hàm định dạng tiền tệ VND
  const formatCurrency = (val) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
      .format(val)
      .replace('₫', 'đ');
  };

  // Cập nhật bộ đếm thời gian
  useEffect(() => {
    if (!visible || !session) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const updateTicker = () => {
      const start = new Date(session.startTime);
      const end = session.endTime ? new Date(session.endTime) : new Date();
      const diffMs = Math.max(0, end - start);

      const hours = diffMs / (1000 * 60 * 60);
      const calculatedPlayAmount = Math.round(hours * table.pricePerHour);

      const totalMinutes = Math.floor(diffMs / (1000 * 60));
      const hr = Math.floor(totalMinutes / 60);
      const mn = totalMinutes % 60;
      const sec = Math.floor((diffMs / 1000) % 60);

      let timeStr = '';
      if (hr > 0) {
        timeStr = `${hr} giờ ${mn} phút ${sec} giây`;
      } else {
        timeStr = `${mn} phút ${sec} giây`;
      }

      const parsedExtra = parseInt(extraAmount, 10) || 0;

      setPlayTimeText(timeStr);
      setPlayAmount(calculatedPlayAmount);
      setTotalAmount(calculatedPlayAmount + parsedExtra);
    };

    updateTicker();

    // Tự động chạy lại mỗi giây để người dùng thấy thời gian nhảy liên tục
    timerRef.current = setInterval(updateTicker, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible, session, extraAmount, table]);

  // Cập nhật phụ thu lên server
  const handleUpdateExtra = async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const parsedExtra = parseInt(extraAmount, 10) || 0;
      const response = await api.put(`/shop/sessions/${session.id}/extra`, {
        extraAmount: parsedExtra,
        extraNote: extraNote.trim() || null,
      });

      if (response.data.success) {
        setSession(response.data.data);
        if (onRefresh) onRefresh();
      } else {
        setError(response.data.message || 'Lỗi cập nhật khoản phụ thu.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối mạng khi cập nhật phụ thu.');
    } finally {
      setLoading(false);
    }
  };

  // Kết thúc phiên chơi (Dừng đồng hồ tính giờ)
  const handleEndSession = async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.put(`/shop/sessions/${session.id}/end`);
      if (response.data.success) {
        setSession(response.data.data);
        if (onRefresh) onRefresh();
      } else {
        setError(response.data.message || 'Lỗi khi kết thúc phiên.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối mạng khi kết thúc phiên.');
    } finally {
      setLoading(false);
    }
  };

  // Thanh toán và đóng phiên chơi (Bàn chuyển về Trống)
  const handlePaySession = async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.post(`/shop/sessions/${session.id}/pay`);
      if (response.data.success) {
        setVisible(false);
        if (onRefresh) onRefresh();
      } else {
        setError(response.data.message || 'Lỗi xử lý thanh toán.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối mạng khi thanh toán.');
    } finally {
      setLoading(false);
    }
  };

  if (!visible || !table || !session) return null;

  const isSessionEnded = !!session.endTime;

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        <Text style={styles.modalTitle}>🏪 CHI TIẾT PHIÊN CHƠI - {table.name}</Text>

        {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

        <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
          {/* Thông tin thời gian và số tiền giờ tạm tính */}
          <View style={styles.infoBox}>
            <Text style={styles.infoRow}>
              <Text style={styles.infoLabel}>Giờ vào:</Text>{' '}
              <Text style={styles.infoValue}>
                {new Date(session.startTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </Text>

            {isSessionEnded && (
              <Text style={styles.infoRow}>
                <Text style={styles.infoLabel}>Giờ ra:</Text>{' '}
                <Text style={styles.infoValue}>
                  {new Date(session.endTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </Text>
            )}

            <Text style={styles.infoRow}>
              <Text style={styles.infoLabel}>Thời gian đã chơi:</Text>{' '}
              <Text style={[styles.infoValue, { color: isSessionEnded ? COLORS.text : '#EF4444' }]}>
                {playTimeText}
              </Text>
            </Text>

            <Text style={styles.infoRow}>
              <Text style={styles.infoLabel}>Đơn giá:</Text>{' '}
              <Text style={styles.infoValue}>{formatCurrency(table.pricePerHour)}/giờ</Text>
            </Text>

            <View style={styles.divider} />

            <Text style={styles.infoRow}>
              <Text style={styles.infoLabel}>Tiền giờ chơi:</Text>{' '}
              <Text style={[styles.infoValue, { fontWeight: 'bold' }]}>{formatCurrency(playAmount)}</Text>
            </Text>
          </View>

          {/* Form quản lý phụ thu */}
          <Text style={styles.sectionHeader}>Khoản phụ thu thêm (Nước uống, đồ ăn...):</Text>
          
          <View style={styles.extraForm}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Số tiền phụ thu (VND):</Text>
              <TextInput
                style={styles.input}
                placeholder="Ví dụ: 20000"
                placeholderTextColor={COLORS.textLight}
                keyboardType="numeric"
                value={extraAmount}
                onChangeText={(text) => setExtraAmount(text.replace(/[^0-9]/g, ''))}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Ghi chú phụ thu (Ví dụ: 2 nước ngọt):</Text>
              <TextInput
                style={styles.input}
                placeholder="Nhập tên món uống, đồ ăn nhẹ..."
                placeholderTextColor={COLORS.textLight}
                value={extraNote}
                onChangeText={setExtraNote}
              />
            </View>

            <TouchableOpacity
              style={styles.updateExtraBtn}
              onPress={handleUpdateExtra}
              disabled={loading}
            >
              <Text style={styles.updateExtraBtnText}>Cập nhật khoản phụ thu</Text>
            </TouchableOpacity>
          </View>

          {/* Tổng tiền thanh toán */}
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>TỔNG CỘNG CẦN THANH TOÁN:</Text>
            <Text style={styles.totalValue}>{formatCurrency(totalAmount)}</Text>
          </View>
        </ScrollView>

        {/* Cụm nút bấm hành động */}
        <View style={styles.actionContainer}>
          {!isSessionEnded ? (
            <TouchableOpacity
              style={[styles.btn, styles.btnDanger]}
              onPress={handleEndSession}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.btnText}>⏹️ KẾT THÚC CHƠI</Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.btn, styles.btnSuccess]}
              onPress={handlePaySession}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.btnText}>💰 XÁC NHẬN THANH TOÁN</Text>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.btn, styles.btnCancel]}
            onPress={() => setVisible(false)}
            disabled={loading}
          >
            <Text style={styles.btnCancelText}>ĐÓNG</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SmoothModal>
  );
});

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
    color: '#0F766E', // Xanh teal
    textAlign: 'center',
    marginBottom: 15,
  },
  errorText: {
    color: COLORS.dangerDark,
    backgroundColor: COLORS.dangerLight,
    padding: 10,
    borderRadius: 8,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 15,
  },
  scrollContainer: {
    marginBottom: 15,
  },
  infoBox: {
    backgroundColor: '#F0FDFA',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#CCFBF1',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    fontSize: 14,
  },
  infoLabel: {
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  infoValue: {
    color: COLORS.text,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#CCFBF1',
    marginVertical: 8,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    marginBottom: 10,
  },
  extraForm: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
    fontWeight: '500',
  },
  input: {
    backgroundColor: COLORS.card,
    height: 40,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  updateExtraBtn: {
    backgroundColor: '#14B8A6',
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  updateExtraBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  totalBox: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0369A1',
    marginBottom: 4,
  },
  totalValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0284C7',
  },
  actionContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnDanger: {
    backgroundColor: '#EF4444',
  },
  btnSuccess: {
    backgroundColor: '#0F766E',
  },
  btnCancel: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnCancelText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: 'bold',
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default ShopSessionModal;
