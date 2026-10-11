// meat-management-fe/src/components/EmployeeSalaryShareModal.js
import React, { useState, forwardRef, useImperativeHandle } from 'react';
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
import SmoothModal from './SmoothModal';
import { api } from '../api/client';
import { showGlobalToast } from '../store/toastStore';
import { shareTextToZalo } from '../utils/imageShareHelper';
import { COLORS } from '../theme';

/**
 * Modal tạo và chia sẻ liên kết tra cứu Lương, Chế độ và Ngày nghỉ cho nhân viên qua Zalo
 */
const EmployeeSalaryShareModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [employee, setEmployee] = useState(null);
  const [monthKey, setMonthKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [shareData, setShareData] = useState(null);

  useImperativeHandle(ref, () => ({
    open: async (targetEmployee, targetMonthKey) => {
      if (!targetEmployee) return;
      setEmployee(targetEmployee);
      setMonthKey(targetMonthKey || getCurrentMonthKey());
      setVisible(true);
      setShareData(null);
      await fetchShareLink(targetEmployee.id);
    },
    close: () => {
      setVisible(false);
    },
  }));

  const getCurrentMonthKey = () => {
    const now = new Date();
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    return `${mm}/${now.getFullYear()}`;
  };

  const fetchShareLink = async (employeeId) => {
    try {
      setLoading(true);
      const res = await api.get(`/employees/${employeeId}/share-link`);
      if (res.data?.success) {
        setShareData(res.data.data);
      }
    } catch (err) {
      console.error('Lỗi lấy liên kết chia sẻ nhân viên:', err);
      showGlobalToast(
        err.response?.data?.message || 'Không thể lấy liên kết tra cứu cho nhân viên này.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  const getFullShareUrl = () => {
    if (!shareData?.token) return '';
    let origin = 'http://localhost:8081';
    if (typeof window !== 'undefined' && window.location) {
      origin = window.location.origin;
    }
    return `${origin}/portal/salary/${shareData.token}`;
  };

  const getZaloShareMessage = () => {
    const url = getFullShareUrl();
    const name = employee?.name || 'bạn';
    const pinNotice = shareData?.suggestedPin
      ? `\n🔒 Mật khẩu mở xem: 4 số cuối SĐT (${shareData.suggestedPin})`
      : '';

    return `📋 BẢNG LƯƠNG & CHẤM CÔNG THÁNG ${monthKey}\n👤 Nhân viên: ${name}\n🔗 Nhấp vào link để xem chi tiết:\n${url}${pinNotice}\n(Kiểm tra ngày công, tạm ứng và lương thực lĩnh)`;
  };

  const handleCopyLink = async () => {
    const url = getFullShareUrl();
    if (!url) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
      showGlobalToast('Đã sao chép liên kết tra cứu lương!', 'success');
    } catch (_) {
      showGlobalToast('Không thể tự động sao chép, vui lòng copy thủ công.', 'warning');
    }
  };

  const handleCopyMessage = async () => {
    const msg = getZaloShareMessage();
    if (!msg) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(msg);
      }
      showGlobalToast('Đã sao chép nội dung tin nhắn gửi Zalo!', 'success');
    } catch (_) {
      showGlobalToast('Không thể sao chép, vui lòng thử lại.', 'warning');
    }
  };

  const handleSendZalo = async () => {
    const msg = getZaloShareMessage();
    if (!msg) return;
    const sent = await shareTextToZalo({
      phone: employee?.phone,
      customerName: employee?.name,
      text: msg,
      title: `Phiếu lương tháng ${monthKey} - ${employee?.name}`,
    });
    if (sent) {
      setVisible(false);
    }
  };

  const shareUrl = getFullShareUrl();

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        {/* Header Modal */}
        <View style={styles.headerRow}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerIcon}>📲</Text>
            <Text style={styles.headerTitle}>GỬI PHIẾU LƯƠNG & CÔNG QUA ZALO</Text>
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setVisible(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
          {/* Card thông tin nhân viên */}
          <View style={styles.employeeCard}>
            <View style={styles.empAvatar}>
              <Text style={styles.empAvatarText}>
                {(employee?.name || 'E').trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.empInfo}>
              <Text style={styles.empName}>{employee?.name}</Text>
              <Text style={styles.empSub}>
                💼 {employee?.role || 'Nhân viên'} {employee?.phone ? `• 📞 ${employee.phone}` : ''}
              </Text>
            </View>
            <View style={styles.monthBadge}>
              <Text style={styles.monthBadgeText}>Tháng {monthKey}</Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#0284C7" />
              <Text style={styles.loadingText}>Đang tạo đường dẫn bảo mật cho nhân viên...</Text>
            </View>
          ) : (
            <>
              {/* Thẻ gợi ý bảo mật mã PIN */}
              <View style={styles.pinTipCard}>
                <Text style={styles.pinTipIcon}>🔒</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pinTipTitle}>Bảo Mật Bằng Mã PIN 4 Số</Text>
                  <Text style={styles.pinTipDesc}>
                    {shareData?.suggestedPin ? (
                      <>
                        Nhân viên khi mở link trên Zalo cần nhập{' '}
                        <Text style={{ fontWeight: 'bold', color: '#0369A1' }}>
                          4 số cuối số điện thoại ({shareData.suggestedPin})
                        </Text>{' '}
                        để mở khóa xem lương, tránh bị người khác nhìn trộm.
                      </>
                    ) : (
                      'Nhân viên chưa cập nhật số điện thoại nên link này có thể mở trực tiếp mà không cần mã PIN.'
                    )}
                  </Text>
                </View>
              </View>

              {/* Ô hiển thị đường dẫn */}
              <View style={styles.linkSection}>
                <Text style={styles.sectionLabel}>🔗 ĐƯỜNG DẪN TRA CỨU TRÊN ĐIỆN THOẠI</Text>
                <View style={styles.linkInputRow}>
                  <TextInput
                    style={styles.linkInput}
                    value={shareUrl}
                    editable={false}
                    selectTextOnFocus
                  />
                  <TouchableOpacity
                    style={styles.copyLinkBtn}
                    onPress={handleCopyLink}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.copyLinkBtnText}>📋 Sao chép</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Xem trước tin nhắn Zalo sẽ gửi */}
              <View style={styles.previewSection}>
                <View style={styles.previewHeader}>
                  <Text style={styles.sectionLabel}>💬 XEM TRƯỚC TIN NHẮN GỬI QUA ZALO</Text>
                  <TouchableOpacity onPress={handleCopyMessage} activeOpacity={0.7}>
                    <Text style={styles.copyMsgBtnText}>Sao chép tin nhắn</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.previewBox}>
                  <Text style={styles.previewText}>{getZaloShareMessage()}</Text>
                </View>
              </View>
            </>
          )}
        </ScrollView>

        {/* Footer: Các nút hành động chính */}
        <View style={styles.footerContainer}>
          <TouchableOpacity
            style={[styles.zaloActionBtn, loading && { opacity: 0.6 }]}
            onPress={handleSendZalo}
            disabled={loading || !shareData?.token}
            activeOpacity={0.8}
          >
            <Text style={styles.zaloActionBtnIcon}>💬</Text>
            <Text style={styles.zaloActionBtnText}>MỞ ZALO GỬI NGAY CHO NHÂN VIÊN</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => setVisible(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryBtnText}>ĐÓNG LẠI</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SmoothModal>
  );
});

export default EmployeeSalaryShareModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: {
    fontSize: 20,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: 'bold',
  },
  scrollBody: {
    paddingBottom: 12,
  },
  employeeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  empAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  empAvatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0369A1',
  },
  empInfo: {
    flex: 1,
  },
  empName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  empSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  monthBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  monthBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  pinTipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    gap: 8,
  },
  pinTipIcon: {
    fontSize: 18,
    marginTop: 1,
  },
  pinTipTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0369A1',
    marginBottom: 2,
  },
  pinTipDesc: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 17,
  },
  linkSection: {
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  linkInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
  },
  linkInput: {
    flex: 1,
    height: 42,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#334155',
  },
  copyLinkBtn: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 14,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#CBD5E1',
  },
  copyLinkBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  previewSection: {
    marginBottom: 8,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  copyMsgBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0284C7',
  },
  previewBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  previewText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  footerContainer: {
    marginTop: 10,
    gap: 8,
  },
  zaloActionBtn: {
    height: 48,
    backgroundColor: '#0068FF', // Màu chuẩn Zalo
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#0068FF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  zaloActionBtnIcon: {
    fontSize: 18,
  },
  zaloActionBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  secondaryBtn: {
    height: 42,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#64748B',
  },
});
