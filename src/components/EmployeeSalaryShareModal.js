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
 * Modal tạo và chia sẻ liên kết tra cứu Lương kèm hệ thống cấp phát Mã xác thực:
 * - Mã riêng cho từng nhân viên (nhập mã nào xem lương người đó)
 * - Mã dành riêng cho Chủ cơ sở (nhập vào xem toàn bộ thông tin & trạng thái lương tất cả nhân viên)
 */
const EmployeeSalaryShareModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [isGeneralMode, setIsGeneralMode] = useState(true);
  const [employee, setEmployee] = useState(null);
  const [monthKey, setMonthKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState(null);
  const [shareData, setShareData] = useState(null);

  useImperativeHandle(ref, () => ({
    // Mở link chung cho toàn bộ nhân viên (kèm bảng mã xác thực)
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

  // Lấy link chung kèm mã xác thực của Chủ và toàn bộ nhân viên
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

  // Cấp lại mã xác thực mới cho Chủ cơ sở hoặc cho 1 nhân viên
  const handleRegenerateCode = async (targetType, empId = null) => {
    const loadingKey = targetType === 'OWNER' ? 'OWNER' : empId;
    try {
      setRegeneratingId(loadingKey);
      const res = await api.post('/employees/access-code', {
        targetType,
        employeeId: empId,
      });
      if (res.data?.success) {
        const { newCode, ownerCode, employees } = res.data.data;
        setShareData((prev) => ({
          ...prev,
          ownerCode,
          accessCode: targetType === 'EMPLOYEE' && !isGeneralMode ? newCode : prev?.accessCode,
          employees: employees || prev?.employees || [],
        }));
        showGlobalToast(res.data.message || `Đã cấp mã mới: ${newCode}`, 'success');
      }
    } catch (err) {
      showGlobalToast(
        err.response?.data?.message || 'Không thể đổi mã xác thực, vui lòng thử lại.',
        'error'
      );
    } finally {
      setRegeneratingId(null);
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
      return `📋 CỔNG KIỂM TRA BẢNG LƯƠNG NHÂN VIÊN THÁNG ${monthKey}\n🔗 Đường dẫn tra cứu bảng lương:\n${url}\n\n🔑 HƯỚNG DẪN TRA CỨU:\n• Mỗi nhân viên được cấp 1 Mã xác thực riêng biệt.\n• Khi bấm vào link trên, hãy nhập Mã xác thực cá nhân của mình để xem chi tiết lương tháng này, ngày công, ngày nghỉ và lịch sử tạm ứng.`;
    }

    const name = employee?.name || 'bạn';
    const empCode = shareData?.accessCode || shareData?.suggestedPin || '';
    const codeNotice = empCode ? `\n🔑 Mã xác thực của bạn: ${empCode}` : '';

    return `📋 BẢNG LƯƠNG THÁNG ${monthKey}\n👤 Nhân viên: ${name}\n🔗 Link kiểm tra lương:\n${url}${codeNotice}\n(Nhập mã xác thực để xem chi tiết ngày công, tạm ứng & lương thực lĩnh)`;
  };

  // Sao chép tin nhắn gửi riêng kèm mã cho 1 nhân viên trong bảng
  const handleCopySingleEmployeeCodeMsg = async (emp) => {
    const url = getFullShareUrl();
    const msg = `📋 THÔNG TIN TRA CỨU LƯƠNG THÁNG ${monthKey}\n👤 Nhân viên: ${emp.name}\n🔑 Mã xác thực cá nhân: ${emp.accessCode}\n🔗 Link kiểm tra lương:\n${url}\n(Bấm vào link và nhập mã ${emp.accessCode} để xem chi tiết lương của bạn)`;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(msg);
      }
      showGlobalToast(`Đã sao chép mã & link của ${emp.name} (${emp.accessCode})!`, 'success');
    } catch (_) {
      showGlobalToast('Không thể tự động sao chép.', 'warning');
    }
  };

  // Sao chép nhanh 1 mã xác thực
  const handleCopyRawCode = async (code, label) => {
    if (!code) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(String(code));
      }
      showGlobalToast(`Đã sao chép mã ${label}: ${code}`, 'success');
    } catch (_) {
      showGlobalToast('Không thể sao chép mã.', 'warning');
    }
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
        ? 'Cổng Kiểm Tra Lương Nhân Viên'
        : `Phiếu lương tháng ${monthKey} - ${employee?.name}`,
    });
    if (sent) {
      setVisible(false);
    }
  };

  const shareUrl = getFullShareUrl();
  const empList = shareData?.employees || [];

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        {/* Header Modal */}
        <View style={styles.headerRow}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerIcon}>{isGeneralMode ? '🔐' : '📲'}</Text>
            <Text style={styles.headerTitle}>
              {isGeneralMode
                ? 'LINK KIỂM TRA LƯƠNG & MÃ XÁC THỰC'
                : 'GỬI LINK & MÃ XÁC THỰC LƯƠNG'}
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
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#0284C7" />
              <Text style={styles.loadingText}>Đang phát hành đường dẫn & mã xác thực...</Text>
            </View>
          ) : (
            <>
              {/* Ô hiển thị đường dẫn dùng chung */}
              <View style={styles.linkSection}>
                <Text style={styles.sectionLabel}>🔗 ĐƯỜNG DẪN TRA CỨU LƯƠNG NHÂN VIÊN</Text>
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
                    <Text style={styles.copyLinkBtnText}>📋 Copy link</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* KHỐI 1: MÃ XÁC THỰC DÀNH CHO NGƯỜI CHỦ (QUAN SÁT TẤT CẢ) */}
              {shareData?.ownerCode && (
                <View style={styles.ownerCodeCard}>
                  <View style={styles.ownerCodeHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ownerCodeTitle}>👑 MÃ DÀNH CHO CHỦ CƠ SỞ (XEM TẤT CẢ)</Text>
                      <Text style={styles.ownerCodeDesc}>
                        Nhập mã này vào link để quan sát toàn bộ thông tin & trạng thái lương của tất cả nhân viên.
                      </Text>
                    </View>
                    <View style={styles.ownerCodeActions}>
                      <TouchableOpacity
                        style={styles.ownerCodeBadge}
                        onPress={() => handleCopyRawCode(shareData.ownerCode, 'Chủ cơ sở')}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.ownerCodeValue}>{shareData.ownerCode}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.regenSmallBtn}
                        onPress={() => handleRegenerateCode('OWNER')}
                        disabled={regeneratingId === 'OWNER'}
                        activeOpacity={0.7}
                      >
                        {regeneratingId === 'OWNER' ? (
                          <ActivityIndicator size="small" color="#0369A1" />
                        ) : (
                          <Text style={styles.regenSmallBtnText}>🔄 Đổi mã</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}

              {/* KHỐI 2: BẢNG MÃ XÁC THỰC CỦA TỪNG NHÂN VIÊN */}
              {isGeneralMode ? (
                <View style={styles.empCodesSection}>
                  <View style={styles.empCodesHeaderRow}>
                    <Text style={styles.sectionLabel}>
                      🔑 MÃ XÁC THỰC CỦA TỪNG NHÂN VIÊN ({empList.length} NGƯỜI)
                    </Text>
                    <Text style={styles.empCodesSubHint}>Mỗi người 1 mã riêng</Text>
                  </View>

                  <View style={styles.codeTableContainer}>
                    {/* Header Bảng */}
                    <View style={styles.codeTableHeader}>
                      <Text style={[styles.codeTh, { width: 32, textAlign: 'center' }]}>STT</Text>
                      <Text style={[styles.codeTh, { flex: 1 }]}>NHÂN VIÊN</Text>
                      <Text style={[styles.codeTh, { width: 82, textAlign: 'center' }]}>MÃ SỐ</Text>
                      <Text style={[styles.codeTh, { width: 105, textAlign: 'right' }]}>THAO TÁC</Text>
                    </View>

                    {/* Danh sách dòng nhân viên */}
                    {empList.length === 0 ? (
                      <View style={styles.emptyEmpBox}>
                        <Text style={styles.emptyEmpText}>Chưa có nhân viên nào đang hoạt động.</Text>
                      </View>
                    ) : (
                      empList.map((emp, idx) => {
                        const isRegen = regeneratingId === emp.id;
                        return (
                          <View
                            key={emp.id}
                            style={[
                              styles.codeTableRow,
                              idx % 2 === 1 && styles.codeTableRowAlt,
                            ]}
                          >
                            <Text style={styles.codeTdStt}>{idx + 1}</Text>
                            <View style={{ flex: 1, paddingRight: 6 }}>
                              <Text style={styles.codeTdName} numberOfLines={1}>
                                {emp.name}
                              </Text>
                              {emp.role ? (
                                <Text style={styles.codeTdRole} numberOfLines={1}>
                                  {emp.role}
                                </Text>
                              ) : null}
                            </View>
                            <View style={{ width: 82, alignItems: 'center' }}>
                              <TouchableOpacity
                                style={styles.empCodePill}
                                onPress={() => handleCopyRawCode(emp.accessCode, emp.name)}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.empCodePillText}>{emp.accessCode || '----'}</Text>
                              </TouchableOpacity>
                            </View>
                            <View style={styles.codeTdActions}>
                              <TouchableOpacity
                                style={styles.copyEmpMsgBtn}
                                onPress={() => handleCopySingleEmployeeCodeMsg(emp)}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.copyEmpMsgBtnText}>📋 Copy</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.regenIconBtn}
                                onPress={() => handleRegenerateCode('EMPLOYEE', emp.id)}
                                disabled={isRegen}
                                activeOpacity={0.7}
                              >
                                {isRegen ? (
                                  <ActivityIndicator size="small" color="#475569" />
                                ) : (
                                  <Text style={styles.regenIconBtnText}>🔄</Text>
                                )}
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>
                </View>
              ) : (
                /* Chế độ 1 nhân viên cụ thể */
                <View style={styles.singleEmpCodeCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.singleEmpCodeLabel}>
                      🔑 Mã xác thực của {employee?.name}:
                    </Text>
                    <Text style={styles.singleEmpCodeSub}>
                      Nhân viên nhập mã này khi mở link để xem lương tháng {monthKey}
                    </Text>
                  </View>
                  <View style={styles.ownerCodeActions}>
                    <View style={styles.empCodePill}>
                      <Text style={styles.empCodePillText}>
                        {shareData?.accessCode || shareData?.suggestedPin || '----'}
                      </Text>
                    </View>
                    {employee?.id && (
                      <TouchableOpacity
                        style={styles.regenSmallBtn}
                        onPress={() => handleRegenerateCode('EMPLOYEE', employee.id)}
                        disabled={regeneratingId === employee.id}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.regenSmallBtnText}>🔄 Đổi mã</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}

              {/* Xem trước tin nhắn Zalo sẽ gửi */}
              <View style={styles.previewSection}>
                <View style={styles.previewHeader}>
                  <Text style={styles.sectionLabel}>💬 TIN NHẮN MẪU GỬI QUA ZALO</Text>
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
              {isGeneralMode ? 'GỬI LINK VÀO NHÓM ZALO' : 'MỞ ZALO GỬI NGAY CHO NHÂN VIÊN'}
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
    marginBottom: 12,
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
    fontSize: 19,
  },
  headerTitle: {
    fontSize: 15,
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
    paddingBottom: 14,
    gap: 12,
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
  linkSection: {
    gap: 5,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  linkInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  linkInput: {
    flex: 1,
    height: 38,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 12.5,
    color: '#0F172A',
  },
  copyLinkBtn: {
    height: 38,
    paddingHorizontal: 12,
    backgroundColor: '#E0F2FE',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#7DD3FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyLinkBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0369A1',
  },
  ownerCodeCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 12,
  },
  ownerCodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  ownerCodeTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 3,
  },
  ownerCodeDesc: {
    fontSize: 11.5,
    color: '#B45309',
    lineHeight: 16,
  },
  ownerCodeActions: {
    alignItems: 'center',
    gap: 5,
  },
  ownerCodeBadge: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    minWidth: 74,
    alignItems: 'center',
  },
  ownerCodeValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#B45309',
    letterSpacing: 2,
  },
  regenSmallBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  regenSmallBtnText: {
    fontSize: 10.5,
    fontWeight: 'bold',
    color: '#475569',
  },
  empCodesSection: {
    gap: 6,
  },
  empCodesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  empCodesSubHint: {
    fontSize: 11,
    color: '#64748B',
    fontStyle: 'italic',
  },
  codeTableContainer: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  codeTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  codeTh: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#475569',
  },
  codeTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  codeTableRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  codeTdStt: {
    width: 32,
    textAlign: 'center',
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  codeTdName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  codeTdRole: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  empCodePill: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#7DD3FC',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 64,
    alignItems: 'center',
  },
  empCodePillText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0369A1',
    letterSpacing: 1.5,
  },
  codeTdActions: {
    width: 105,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
  },
  copyEmpMsgBtn: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  copyEmpMsgBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#15803D',
  },
  regenIconBtn: {
    width: 28,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  regenIconBtnText: {
    fontSize: 12,
  },
  emptyEmpBox: {
    padding: 16,
    alignItems: 'center',
  },
  emptyEmpText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  singleEmpCodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  singleEmpCodeLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0369A1',
  },
  singleEmpCodeSub: {
    fontSize: 11.5,
    color: '#0284C7',
    marginTop: 2,
  },
  previewSection: {
    gap: 5,
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
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  previewText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 17,
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
