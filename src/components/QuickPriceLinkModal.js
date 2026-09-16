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
        'Khi tạo mã mới, đường link cũ đã gửi vào Zalo trước đây sẽ KHÔNG còn dùng được nữa.\n\nBạn có chắc chắn muốn tạo mã link mới?',
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
      <SmoothModal visible={visible} onClose={() => setVisible(false)} centered={true}>
        <View style={styles.modalView}>
          {/* Header modal */}
          <View style={styles.modalHeader}>
            <View style={styles.titleWrap}>
              <Text style={styles.headerIcon}>🥩</Text>
              <View style={styles.titleTextCol}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  LINK ZALO CẬP NHẬT GIÁ
                </Text>
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  Chỉnh giá bán riêng & tự động tính lại đơn nợ
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

              {/* Thông tin tiện ích tinh gọn (compact UI) */}
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  💡 <Text style={{ fontWeight: '700' }}>Tiện ích:</Text> Mở trực tiếp từ Zalo trên điện thoại để sửa tên thịt, cập nhật giá riêng và tự động tính lại đơn nợ mà không cần đăng nhập.
                </Text>
              </View>

              {/* Khu vực bảo mật mã PIN */}
              <View style={styles.pinSection}>
                <View style={styles.pinHeaderRow}>
                  <View style={styles.pinInfoCol}>
                    <View style={styles.pinTitleRow}>
                      <Text style={styles.pinSectionTitle}>🔒 Mã PIN bảo vệ</Text>
                      {linkData?.hasPin ? (
                        <View style={styles.pinActiveBadge}>
                          <Text style={styles.pinActiveBadgeText}>Bảo vệ: {linkData.pin}</Text>
                        </View>
                      ) : (
                        <View style={styles.pinInactiveBadge}>
                          <Text style={styles.pinInactiveBadgeText}>Chưa cài PIN</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.pinStatusText}>
                      {linkData?.hasPin
                        ? 'Yêu cầu mã PIN 4 số khi mở link'
                        : 'Bất kỳ ai có link đều mở được'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.togglePinBtn}
                    onPress={() => setIsSettingPin(!isSettingPin)}
                  >
                    <Text style={styles.togglePinBtnText}>
                      {isSettingPin ? 'Đóng' : linkData?.hasPin ? 'Đổi PIN' : 'Cài PIN'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {isSettingPin && (
                  <View style={styles.pinForm}>
                    <TextInput
                      style={styles.pinInput}
                      value={pin}
                      onChangeText={setPin}
                      placeholder="Nhập 4 số PIN mới (để trống để gỡ)"
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
                <TouchableOpacity style={styles.regenerateBtn} onPress={handleRegenerate} activeOpacity={0.7}>
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
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    ...SHADOWS.large,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  titleTextCol: {
    flex: 1,
  },
  headerIcon: {
    fontSize: 22,
  },
  modalTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  modalSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  loadingWrap: {
    padding: 30,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  body: {
    padding: 12,
    gap: 10,
  },
  linkCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  linkLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
  },
  urlBox: {
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginBottom: 8,
  },
  urlText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  copyBtn: {
    flex: 1,
    height: 38,
    backgroundColor: '#2563EB',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  copyBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  openBtn: {
    paddingHorizontal: 14,
    height: 38,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  openBtnText: {
    color: '#4338CA',
    fontSize: 12.5,
    fontWeight: '700',
  },
  infoBox: {
    backgroundColor: '#F0FDF4',
    borderLeftWidth: 3,
    borderLeftColor: '#16A34A',
    padding: 8,
    borderRadius: 6,
  },
  infoText: {
    fontSize: 11.5,
    color: '#14532D',
    lineHeight: 16,
  },
  pinSection: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 10,
  },
  pinHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pinInfoCol: {
    flex: 1,
    marginRight: 8,
  },
  pinTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pinSectionTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  pinActiveBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  pinActiveBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#15803D',
  },
  pinInactiveBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  pinInactiveBadgeText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#64748B',
  },
  pinStatusText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  togglePinBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
  },
  togglePinBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
  },
  pinForm: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    alignItems: 'center',
  },
  pinInput: {
    flex: 1,
    height: 34,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 12.5,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  savePinBtn: {
    paddingHorizontal: 14,
    height: 34,
    backgroundColor: COLORS.primary,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  savePinBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  regenerateRow: {
    alignItems: 'center',
    paddingTop: 2,
  },
  regenerateBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 6,
  },
  regenerateBtnText: {
    fontSize: 11.5,
    color: '#DC2626',
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  },
});

export default QuickPriceLinkModal;
