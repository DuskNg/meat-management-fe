// meat-management-fe/src/components/QuickPriceLinkModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import SmoothModal from './SmoothModal';
import { api } from '../api/client';
import { COLORS, SHADOWS } from '../theme';
import { showGlobalToast } from '../store/toastStore';
import PopupModal from './PopupModal';
import AnimatedPressable from './AnimatedPressable';

const QuickPriceLinkModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [linkData, setLinkData] = useState(null);

  // Cấu hình mã PIN
  const [pin, setPin] = useState('');
  const [isSettingPin, setIsSettingPin] = useState(false);
  const [savingPin, setSavingPin] = useState(false);

  // Popup xác nhận
  const popupRef = useRef(null);

  // Lấy đường link đầy đủ dựa trên host hiện tại
  const getFullUrl = () => {
    if (!linkData?.token) return '';
    const origin =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin
        : 'https://app.meatmanager.vn';
    return `${origin}/quick-price/${linkData.token}`;
  };

  // Tải thông tin link của chủ sạp
  const fetchLink = async () => {
    try {
      setLoading(true);
      const res = await api.get('/quick-price/manage/link');
      if (res.data?.success) {
        setLinkData(res.data.data);
        setPin(res.data.data.pin || '');
      }
    } catch (err) {
      console.error('Lỗi tải thông tin link Zalo cập nhật giá:', err);
      showGlobalToast('Không thể tải thông tin đường dẫn.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Phơi bày hàm điều khiển ra bên ngoài qua ref
  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true);
      setIsSettingPin(false);
      fetchLink();
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Sao chép link vào bộ nhớ tạm
  const handleCopyLink = async () => {
    const url = getFullUrl();
    if (!url) return;

    try {
      if (Platform.OS === 'web' && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
      showGlobalToast('Đã sao chép đường link Zalo vào bộ nhớ tạm!', 'success');
    } catch (err) {
      showGlobalToast('Không thể tự động sao chép link, vui lòng copy thủ công.', 'warning');
    }
  };

  // Mở thử link trên tab mới
  const handleOpenLink = () => {
    const url = getFullUrl();
    if (!url) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank');
    }
  };

  // Thu hồi và tạo mới token
  const handleRegenerate = () => {
    popupRef.current?.show({
      type: 'confirm',
      title: '🔄 Tạo Lại Mã Link Mới',
      message:
        'Khi tạo mã mới, đường link cũ đã gửi vào Zalo trước đây sẽ KHÔNG còn dùng được nữa.\n\nAnh chủ có chắc chắn muốn tạo mã link mới?',
      confirmText: 'Đồng ý tạo lại',
      cancelText: 'Hủy bỏ',
      onConfirm: async () => {
        try {
          setLoading(true);
          const res = await api.post('/quick-price/manage/regenerate');
          if (res.data?.success) {
            setLinkData(res.data.data);
            showGlobalToast('Đã tạo mới mã link Zalo thành công!', 'success');
          }
        } catch (err) {
          showGlobalToast('Không thể tạo lại mã link.', 'error');
        } finally {
          setLoading(false);
        }
      },
    });
  };

  // Lưu cấu hình mã PIN
  const handleSavePin = async () => {
    if (!linkData?.id) return;
    try {
      setSavingPin(true);
      const res = await api.put(`/quick-price/manage/link/${linkData.id}`, {
        pin: pin.trim() || null,
      });
      if (res.data?.success) {
        setLinkData(res.data.data);
        setIsSettingPin(false);
        showGlobalToast(
          pin.trim() ? 'Đã cài đặt mã PIN bảo mật thành công!' : 'Đã gỡ bỏ mã PIN bảo vệ.',
          'success'
        );
      }
    } catch (err) {
      showGlobalToast('Không thể lưu mã PIN.', 'error');
    } finally {
      setSavingPin(false);
    }
  };

  return (
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)}>
        <View style={styles.modalView}>
          {/* Header modal */}
          <View style={styles.modalHeader}>
            <View style={styles.titleWrap}>
              <Text style={styles.headerIcon}>🥩</Text>
              <View>
                <Text style={styles.modalTitle}>LINK ZALO CẬP NHẬT GIÁ CHO ANH CHỦ</Text>
                <Text style={styles.modalSubtitle}>
                  Gửi link này vào Zalo để anh chủ chủ động chỉnh giá riêng mà không cần vào hệ thống
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setVisible(false)}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={COLORS.primary} size="large" />
              <Text style={styles.loadingText}>Đang tải thông tin link...</Text>
            </View>
          ) : (
            <View style={styles.body}>
              {/* Thẻ hiển thị link */}
              <View style={styles.linkCard}>
                <Text style={styles.linkLabel}>🔗 Đường dẫn truy cập trực tiếp:</Text>
                <View style={styles.urlBox}>
                  <Text style={styles.urlText} numberOfLines={2} selectable>
                    {getFullUrl()}
                  </Text>
                </View>

                {/* Các nút bấm thao tác */}
                <View style={styles.actionBtnRow}>
                  <TouchableOpacity style={styles.copyBtn} onPress={handleCopyLink} activeOpacity={0.8}>
                    <Text style={styles.copyBtnText}>📋 SAO CHÉP LINK GỬI ZALO</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.openBtn} onPress={handleOpenLink} activeOpacity={0.8}>
                    <Text style={styles.openBtnText}>🌐 Mở thử</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Thông tin tính năng nổi bật */}
              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>✨ Tiện ích vượt trội khi dùng link này:</Text>
                <Text style={styles.infoItem}>• Mở nhanh trực tiếp trên điện thoại từ tin nhắn Zalo.</Text>
                <Text style={styles.infoItem}>• Chọn ngày áp dụng giá mới (đơn nợ cũ trước ngày áp dụng giữ nguyên 100%).</Text>
                <Text style={styles.infoItem}>• Chọn cửa hàng, cho phép sửa tên thịt và chỉnh giá bán riêng theo ý muốn.</Text>
                <Text style={styles.infoItem}>• Tự động tính lại toàn bộ đơn nợ từ ngày áp dụng trở về sau khi bấm Áp dụng.</Text>
              </View>

              {/* Khu vực bảo mật mã PIN */}
              <View style={styles.pinSection}>
                <View style={styles.pinHeaderRow}>
                  <View>
                    <Text style={styles.pinSectionTitle}>🔒 Bảo mật mã PIN 4 số</Text>
                    <Text style={styles.pinStatusText}>
                      {linkData?.hasPin
                        ? `Đang bật bảo vệ (Mã PIN: ${linkData.pin})`
                        : 'Chưa cài đặt mã PIN (Bất kỳ ai có link đều mở được)'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.togglePinBtn}
                    onPress={() => setIsSettingPin(!isSettingPin)}
                  >
                    <Text style={styles.togglePinBtnText}>
                      {isSettingPin ? 'Đóng lại' : linkData?.hasPin ? 'Đổi PIN' : 'Cài PIN'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {isSettingPin && (
                  <View style={styles.pinForm}>
                    <TextInput
                      style={styles.pinInput}
                      value={pin}
                      onChangeText={setPin}
                      placeholder="Nhập 4 số PIN mới (để trống để bỏ)"
                      placeholderTextColor="#94A3B8"
                      keyboardType="numeric"
                      maxLength={6}
                    />
                    <TouchableOpacity
                      style={[styles.savePinBtn, savingPin && styles.btnDisabled]}
                      onPress={handleSavePin}
                      disabled={savingPin}
                    >
                      {savingPin ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.savePinBtnText}>Lưu PIN</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Nút tạo lại mã link */}
              <View style={styles.regenerateRow}>
                <TouchableOpacity style={styles.regenerateBtn} onPress={handleRegenerate}>
                  <Text style={styles.regenerateBtnText}>🔄 Đổi mã link mới (Thu hồi link cũ)</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </SmoothModal>

      <PopupModal ref={popupRef} />
    </>
  );
});

const styles = StyleSheet.create({
  modalView: {
    width: '95%',
    maxWidth: 600,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    ...SHADOWS.large,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 10,
  },
  headerIcon: {
    fontSize: 26,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  modalSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  loadingWrap: {
    padding: 40,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  body: {
    padding: 16,
    gap: 14,
  },
  linkCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  linkLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
  },
  urlBox: {
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  urlText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  copyBtn: {
    flex: 1,
    height: 42,
    backgroundColor: '#2563EB',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  copyBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  openBtn: {
    paddingHorizontal: 16,
    height: 42,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  openBtnText: {
    color: '#4338CA',
    fontSize: 13,
    fontWeight: '700',
  },
  infoBox: {
    backgroundColor: '#F0FDF4',
    borderLeftWidth: 3,
    borderLeftColor: '#16A34A',
    padding: 10,
    borderRadius: 6,
    gap: 4,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 2,
  },
  infoItem: {
    fontSize: 11,
    color: '#14532D',
    lineHeight: 16,
  },
  pinSection: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
  },
  pinHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pinSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  pinStatusText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  togglePinBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
  },
  togglePinBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  pinForm: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  pinInput: {
    flex: 1,
    height: 38,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#0F172A',
  },
  savePinBtn: {
    paddingHorizontal: 16,
    height: 38,
    backgroundColor: COLORS.primary,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  savePinBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  regenerateRow: {
    alignItems: 'center',
    paddingTop: 4,
  },
  regenerateBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  regenerateBtnText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  btnDisabled: {
    opacity: 0.5,
  },
});

export default QuickPriceLinkModal;
