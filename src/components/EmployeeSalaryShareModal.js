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
} from 'react-native';
import SmoothModal from './SmoothModal';
import { api } from '../api/client';
import { showGlobalToast } from '../store/toastStore';
import { shareTextToZalo } from '../utils/imageShareHelper';

/**
 * Modal tạo và chia sẻ liên kết tra cứu Lương và Nội quy quy định cho nhân viên qua Zalo
 * Hỗ trợ 2 chế độ:
 * 1. Chế độ chung (Khuyến nghị): Tất cả nhân viên dùng chung 1 đường link duy nhất (có tab Lương + tab Nội quy)
 * 2. Chế độ riêng: Gửi link riêng lẻ cho 1 nhân viên cụ thể
 */
const EmployeeSalaryShareModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [isGeneralMode, setIsGeneralMode] = useState(true);
  const [employee, setEmployee] = useState(null);
  const [monthKey, setMonthKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [shareData, setShareData] = useState(null);

  useImperativeHandle(ref, () => ({
    // Mở link chung cho toàn bộ nhân viên (Tab Lương + Tab Nội quy)
    openGeneral: async (targetMonthKey) => {
      setIsGeneralMode(true);
      setEmployee(null);
      setMonthKey(targetMonthKey || getCurrentMonthKey());
      setVisible(true);
      setShareData(null);
      await fetchGeneralShareLink();
    },
    // Mở link riêng cho 1 nhân viên cụ thể
    open: async (targetEmployee, targetMonthKey) => {
      if (!targetEmployee) return;
      setIsGeneralMode(false);
      setEmployee(targetEmployee);
      setMonthKey(targetMonthKey || getCurrentMonthKey());
      setVisible(true);
      setShareData(null);
      await fetchEmployeeShareLink(targetEmployee.id);
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

  // Lấy link chung cho toàn bộ nhân viên
  const fetchGeneralShareLink = async () => {
    try {
      setLoading(true);
      const res = await api.get('/employees/general-share-link');
      if (res.data?.success) {
        setShareData(res.data.data);
      }
    } catch (err) {
      console.error('Lỗi lấy liên kết nhân sự chung:', err);
      showGlobalToast(
        err.response?.data?.message || 'Không thể lấy liên kết chung cho nhân viên.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  // Lấy link riêng cho 1 nhân viên
  const fetchEmployeeShareLink = async (employeeId) => {
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
    if (isGeneralMode) {
      return `📋 CỔNG THÔNG TIN NHÂN SỰ & NỘI QUY CỬA HÀNG\n🔗 Link xem bảng lương & nội quy quy chế:\n${url}\n\n💡 HƯỚNG DẪN DÀNH CHO TẤT CẢ NHÂN VIÊN:\n• Tab 1 (Bảng lương): Chọn Tên của bạn và nhập 4 số cuối SĐT để mở khóa xem lương, ngày nghỉ, tạm ứng.\n• Tab 2 (Nội quy quy định): Đọc quy chế ứng lương (tối đa 50%), thưởng lễ, thưởng thâm niên 6 tháng, thưởng trách nhiệm 200k/tháng & quy định an toàn vệ sinh.`;
    }

    const name = employee?.name || 'bạn';
    const pinNotice = shareData?.suggestedPin
      ? `\n🔒 Mật khẩu mở xem: 4 số cuối SĐT (${shareData.suggestedPin})`
      : '';

    return `📋 BẢNG LƯƠNG & CHẾ ĐỘ THÁNG ${monthKey}\n👤 Nhân viên: ${name}\n🔗 Nhấp vào link để xem chi tiết:\n${url}${pinNotice}\n(Kiểm tra ngày nghỉ, tạm ứng, lương thực lĩnh & nội quy cửa hàng)`;
  };

  const handleCopyLink = async () => {
    const url = getFullShareUrl();
    if (!url) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
      showGlobalToast('Đã sao chép liên kết!', 'success');
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
      showGlobalToast('Đã sao chép nội dung tin nhắn!', 'success');
    } catch (_) {
      showGlobalToast('Không thể sao chép, vui lòng thử lại.', 'warning');
    }
  };

  const handleSendZalo = async () => {
    const msg = getZaloShareMessage();
    if (!msg) return;
    const sent = await shareTextToZalo({
      phone: employee?.phone,
      customerName: employee?.name || 'Nhóm Nhân Viên',
      text: msg,
      title: isGeneralMode
        ? 'Cổng Thông Tin Nhân Sự & Nội Quy Cửa Hàng'
        : `Phiếu lương tháng ${monthKey} - ${employee?.name}`,
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
            <Text style={styles.headerIcon}>{isGeneralMode ? '🌐' : '📲'}</Text>
            <Text style={styles.headerTitle}>
              {isGeneralMode
                ? 'LINK CHUNG NHÂN VIÊN (LƯƠNG & NỘI QUY)'
                : 'GỬI PHIẾU LƯƠNG QUA ZALO'}
            </Text>
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
          {/* Card thông tin */}
          {isGeneralMode ? (
            <View style={styles.generalCard}>
              <View style={styles.generalIconBox}>
                <Text style={{ fontSize: 24 }}>👥</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.generalTitle}>DÙNG CHUNG 1 ĐƯỜNG DẪN DUY NHẤT</Text>
                <Text style={styles.generalSubtitle}>
                  Tất cả nhân viên vào chung 1 link: gồm Tab Bảng lương (bảo mật PIN cá nhân) và Tab Nội quy cửa hàng.
                </Text>
              </View>
            </View>
          ) : (
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
          )}

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#0284C7" />
              <Text style={styles.loadingText}>Đang tạo đường dẫn chia sẻ...</Text>
            </View>
          ) : (
            <>
              {/* Thẻ hướng dẫn bảo mật */}
              <View style={styles.pinTipCard}>
                <Text style={styles.pinTipIcon}>🔒</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pinTipTitle}>
                    {isGeneralMode ? 'Bảo Mật Bảng Lương Cá Nhân' : 'Bảo Mật Bằng Mã PIN 4 Số'}
                  </Text>
                  <Text style={styles.pinTipDesc}>
                    {isGeneralMode ? (
                      <>
                        Khi mở link, nhân viên chỉ cần{' '}
                        <Text style={{ fontWeight: 'bold', color: '#0369A1' }}>chọn tên mình</Text> và nhập{' '}
                        <Text style={{ fontWeight: 'bold', color: '#0369A1' }}>4 số cuối SĐT</Text> để mở khóa xem bảng lương của riêng họ. Không ai xem trộm được lương của người khác!
                      </>
                    ) : shareData?.suggestedPin ? (
                      <>
                        Nhân viên khi mở link trên Zalo cần nhập{' '}
                        <Text style={{ fontWeight: 'bold', color: '#0369A1' }}>
                          4 số cuối số điện thoại ({shareData.suggestedPin})
                        </Text>{' '}
                        để mở khóa xem lương.
                      </>
                    ) : (
                      'Nhân viên chưa cập nhật số điện thoại nên link này có thể mở trực tiếp mà không cần mã PIN.'
                    )}
                  </Text>
                </View>
              </View>

              {/* Ô hiển thị đường dẫn */}
              <View style={styles.linkSection}>
                <Text style={styles.sectionLabel}>🔗 ĐƯỜNG DẪN DÙNG CHUNG TRÊN ĐIỆN THOẠI</Text>
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
            <Text style={styles.zaloActionBtnText}>
              {isGeneralMode ? 'GỬI TIN NHẮN VÀO NHÓM ZALO' : 'MỞ ZALO GỬI NGAY CHO NHÂN VIÊN'}
            </Text>
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
    flex: 1,
  },
  headerIcon: {
    fontSize: 20,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    textTransform: 'uppercase',
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
    paddingBottom: 16,
    gap: 12,
  },
  generalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  generalIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  generalTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0369A1',
    marginBottom: 2,
  },
  generalSubtitle: {
    fontSize: 12,
    color: '#0284C7',
    lineHeight: 16,
  },
  employeeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  empAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empAvatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0284C7',
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
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  monthBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#4F46E5',
  },
  loadingBox: {
    paddingVertical: 36,
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
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    alignItems: 'flex-start',
  },
  pinTipIcon: {
    fontSize: 18,
    marginTop: 2,
  },
  pinTipTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#15803D',
    marginBottom: 2,
  },
  pinTipDesc: {
    fontSize: 12,
    color: '#166534',
    lineHeight: 17,
  },
  linkSection: {
    gap: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  linkInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  linkInput: {
    flex: 1,
    height: 42,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#0F172A',
  },
  copyLinkBtn: {
    height: 42,
    paddingHorizontal: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyLinkBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#334155',
  },
  previewSection: {
    gap: 6,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  copyMsgBtnText: {
    fontSize: 12,
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
  },
  footerContainer: {
    marginTop: 8,
    gap: 8,
  },
  zaloActionBtn: {
    height: 46,
    borderRadius: 12,
    backgroundColor: '#0284C7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  zaloActionBtnIcon: {
    fontSize: 18,
  },
  zaloActionBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  secondaryBtn: {
    height: 42,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
});
