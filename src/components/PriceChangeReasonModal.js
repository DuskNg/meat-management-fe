// meat-management-fe/src/components/PriceChangeReasonModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import SmoothModal from './SmoothModal';
import PopupModal from './PopupModal';
import { useCustomerGroups } from '../hooks/useCustomerGroups';
import { COLORS } from '../theme';

// Các gợi ý lý do phổ biến để chọn nhanh trên màn hình điện thoại
const QUICK_REASONS = [
  'Giá thị trường tăng',
  'Giá thị trường giảm',
  'Khách thân thiết ưu đãi',
  'Hàng loại 1 đặc biệt',
  'Khách lấy số lượng lớn',
  'Khách yêu cầu giảm giá',
];

// Định dạng tiền tệ VNĐ
const formatCurrency = (amount) => {
  if (amount === undefined || amount === null || isNaN(amount)) return '0 đ';
  return `${Number(amount).toLocaleString('vi-VN')} đ`;
};

/**
 * Modal hỏi phạm vi & nhập lý do khi thay đổi giá riêng của khách hàng
 * - Bước 1: Hỏi cập nhật từ bây giờ hay chỉ lần này (công nợ lần đó)
 * - Nếu chọn "Chỉ lần này": áp dụng giá mới cho lần nợ hiện tại, không đổi giá riêng của khách
 * - Nếu chọn "Cập nhật từ bây giờ": mở logic nhập lý do đổi giá và lưu giá mới từ nay về sau
 * - NẾU LÀ NHÀ HÀNG THUỘC NHÓM: khi ấn lưu từ bây giờ, hiển thị thêm pop-up xác nhận đây là giá riêng của nhà hàng trong nhóm
 * - Áp dụng chuẩn Mobile-First Bottom-Sheet
 */
const PriceChangeReasonModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState('SCOPE'); // 'SCOPE' | 'REASON'
  const [changedItems, setChangedItems] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState(null);
  const [isGroupMemberProp, setIsGroupMemberProp] = useState(false);
  const [groupNameProp, setGroupNameProp] = useState(null);
  const [reason, setReason] = useState('');
  const [canChooseScope, setCanChooseScope] = useState(true);

  const onConfirmCallbackRef = useRef(null);
  const popupModalRef = useRef(null);

  // Lấy danh sách nhóm khách hàng để tự động nhận diện nếu khách thuộc nhóm chuỗi
  const { groups } = useCustomerGroups();

  // Mở modal và nhận thông tin các mặt hàng thay đổi giá cùng callback
  useImperativeHandle(ref, () => ({
    open: ({
      items = [],
      customerName = '',
      customerId = null,
      isGroupMember = false,
      groupName = null,
      allowScopeSelection = true,
      onConfirm = null,
    }) => {
      setChangedItems(items);
      setCustomerName(customerName || '');
      setCustomerId(customerId || null);
      setIsGroupMemberProp(Boolean(isGroupMember));
      setGroupNameProp(groupName || null);
      setReason('');
      setCanChooseScope(allowScopeSelection !== false);
      setStep(allowScopeSelection !== false ? 'SCOPE' : 'REASON');
      onConfirmCallbackRef.current = onConfirm;
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Đóng modal
  const handleClose = () => {
    setVisible(false);
  };

  // Trả về kết quả cho component cha
  const notifyParent = (applyToFuture, finalReason = null) => {
    setVisible(false);
    if (onConfirmCallbackRef.current) {
      onConfirmCallbackRef.current({
        applyToFuture,
        updateCustomPrice: applyToFuture,
        reason: finalReason ? finalReason.trim() : null,
      });
    }
  };

  // Chọn: Chỉ áp dụng lần này (không lưu vào bảng giá riêng)
  const handleSelectOneTimeOnly = () => {
    notifyParent(false, null);
  };

  // Chọn: Cập nhật từ bây giờ -> chuyển sang bước nhập lý do
  const handleSelectApplyToFuture = () => {
    setStep('REASON');
  };

  // Kiểm tra xem khách hàng này có thuộc nhóm nhà hàng nào không
  const checkGroupMembership = () => {
    if (isGroupMemberProp) {
      return { isGroup: true, groupName: groupNameProp || 'Nhóm nhà hàng' };
    }
    if (groupNameProp) {
      return { isGroup: true, groupName: groupNameProp };
    }
    if (customerId && Array.isArray(groups)) {
      const matched = groups.find((g) => (g.customerIds || []).includes(customerId));
      if (matched) {
        return { isGroup: true, groupName: matched.name || 'Nhóm nhà hàng' };
      }
    }
    return { isGroup: false, groupName: null };
  };

  // Xử lý xác nhận lưu giá mới từ bây giờ (nếu là nhà hàng trong nhóm: hiển thị pop-up hỏi tiếp tục)
  const confirmSaveApplyToFuture = (finalReason) => {
    const { isGroup, groupName } = checkGroupMembership();

    if (isGroup) {
      const groupSuffix = groupName && groupName !== 'Nhóm nhà hàng' ? ` "${groupName}"` : '';
      popupModalRef.current?.show({
        type: 'confirm',
        title: 'Xác nhận thay đổi giá riêng nhóm',
        message: `đây là giá riêng của nhà hàng trong nhóm${groupSuffix}, bạn có muốn tiếp tục thay đổi?`,
        confirmText: 'Tiếp tục thay đổi',
        cancelText: 'Hủy bỏ',
        onConfirm: () => {
          notifyParent(true, finalReason);
        },
        onCancel: () => {
          // Người dùng bấm Hủy bỏ -> giữ nguyên, không lưu đè giá riêng
        },
      });
      return;
    }

    // Nếu không thuộc nhóm, lưu bình thường
    notifyParent(true, finalReason);
  };

  // Xác nhận lưu giá kèm lý do
  const handleConfirmReason = () => {
    const finalReason = reason.trim();
    confirmSaveApplyToFuture(finalReason || null);
  };

  // Bỏ qua lý do nhưng vẫn cập nhật giá mới từ bây giờ
  const handleSkipReason = () => {
    confirmSaveApplyToFuture(null);
  };

  // Chọn nhanh lý do từ gợi ý
  const handleSelectQuickReason = (text) => {
    setReason(text);
  };

  return (
    <>
      <SmoothModal visible={visible} onClose={handleClose} zIndex={props.zIndex || 9999999}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ width: '100%' }}
      >
        <View style={styles.modalView}>
          {/* Header Modal */}
          <View style={styles.header}>
            <View style={styles.headerTitleWrap}>
              {step === 'REASON' && canChooseScope ? (
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => setStep('SCOPE')}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.backBtnText}>←</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.headerIcon}>{step === 'SCOPE' ? '⚖️' : '📝'}</Text>
              )}
              <Text style={styles.headerTitle}>
                {step === 'SCOPE' ? 'ÁP DỤNG ĐƠN GIÁ MỚI' : 'LÝ DO THAY ĐỔI ĐƠN GIÁ'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleClose}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            {/* Tên khách hàng */}
            {customerName ? (
              <View style={styles.customerCard}>
                <View style={{ flex: 1, paddingRight: 6 }}>
                  <Text style={styles.customerLabel}>Khách hàng:</Text>
                  <Text style={styles.customerValue} numberOfLines={1}>
                    {customerName}
                  </Text>
                </View>
                {checkGroupMembership().isGroup ? (
                  <View style={styles.groupBadge}>
                    <Text style={styles.groupBadgeText} numberOfLines={1}>
                      🏢 {checkGroupMembership().groupName}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Danh sách các mặt hàng có giá bị thay đổi */}
            <View style={styles.itemsCard}>
              <Text style={styles.itemsCardTitle}>Các mặt hàng điều chỉnh giá:</Text>
              {changedItems.map((item, idx) => (
                <View key={idx} style={styles.itemRow}>
                  <Text style={styles.itemName}>• {item.productName || item.name || 'Thịt'}</Text>
                  <View style={styles.priceFlowWrap}>
                    <Text style={styles.oldPriceText}>{formatCurrency(item.oldPrice)}</Text>
                    <Text style={styles.arrowText}>➔</Text>
                    <Text style={styles.newPriceText}>{formatCurrency(item.newPrice)}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* ════════════════════ BƯỚC 1: CHỌN PHẠM VI ÁP DỤNG ════════════════════ */}
            {step === 'SCOPE' ? (
              <View style={styles.scopeSection}>
                <Text style={styles.questionText}>
                  Bạn muốn cập nhật từ bây giờ với giá mới hay là chỉ áp dụng cho lần này?
                </Text>

                {/* Lựa chọn 1: Chỉ lần này */}
                <TouchableOpacity
                  style={styles.optionCard}
                  onPress={handleSelectOneTimeOnly}
                  activeOpacity={0.75}
                >
                  <View style={styles.optionLeftWrap}>
                    <View style={[styles.optionIconCircle, styles.optionIconCircleOneTime]}>
                      <Text style={styles.optionIcon}>⚡</Text>
                    </View>
                    <View style={styles.optionInfo}>
                      <View style={styles.optionTitleRow}>
                        <Text style={styles.optionTitle}>CHỈ LẦN NÀY</Text>
                        <View style={styles.oneTimeBadge}>
                          <Text style={styles.oneTimeBadgeText}>Đơn nợ này</Text>
                        </View>
                      </View>
                      <Text style={styles.optionDesc}>
                        Chỉ nhân giá mới với công nợ lần này. Bảng giá riêng của khách vẫn giữ nguyên giá cũ.
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.optionChevron}>›</Text>
                </TouchableOpacity>

                {/* Lựa chọn 2: Cập nhật từ bây giờ */}
                <TouchableOpacity
                  style={[styles.optionCard, styles.optionCardFuture]}
                  onPress={handleSelectApplyToFuture}
                  activeOpacity={0.75}
                >
                  <View style={styles.optionLeftWrap}>
                    <View style={[styles.optionIconCircle, styles.optionIconCircleFuture]}>
                      <Text style={styles.optionIcon}>🔄</Text>
                    </View>
                    <View style={styles.optionInfo}>
                      <View style={styles.optionTitleRow}>
                        <Text style={[styles.optionTitle, styles.optionTitleFuture]}>
                          CẬP NHẬT TỪ BÂY GIỜ
                        </Text>
                        <View style={styles.futureBadge}>
                          <Text style={styles.futureBadgeText}>Lưu giá mới</Text>
                        </View>
                      </View>
                      <Text style={styles.optionDesc}>
                        Lưu làm giá riêng mới của khách. Các lần ghi nợ sau sẽ tự động áp dụng giá này.
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.optionChevron, styles.optionChevronFuture]}>›</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* ════════════════════ BƯỚC 2: NHẬP LÝ DO (LUỒNG CŨ) ════════════════════ */
              <View>
                {/* Thông báo phạm vi đã chọn */}
                <View style={styles.scopeNoticeCard}>
                  <Text style={styles.scopeNoticeText}>
                    📌 Đang lưu giá mới cho khách từ bây giờ. Bạn có thể ghi lại lý do điều chỉnh:
                  </Text>
                </View>

                {/* Ô nhập lý do */}
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>
                    Lý do thay đổi giá <Text style={styles.inputLabelSub}>(lưu lại lý do mới nhất)</Text>:
                  </Text>
                  <TextInput
                    style={styles.textInput}
                    multiline
                    numberOfLines={3}
                    placeholder="Nhập lý do đổi giá (ví dụ: Thịt nhập tăng giá, Khách lấy nhiều ưu đãi...)"
                    placeholderTextColor="#94A3B8"
                    value={reason}
                    onChangeText={setReason}
                    textAlignVertical="top"
                  />
                </View>

                {/* Gợi ý lý do bấm 1 chạm */}
                <View style={styles.quickWrap}>
                  <Text style={styles.quickTitle}>Gợi ý nhanh:</Text>
                  <View style={styles.chipGrid}>
                    {QUICK_REASONS.map((q, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={[styles.chip, reason === q && styles.chipActive]}
                        onPress={() => handleSelectQuickReason(q)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.chipText, reason === q && styles.chipTextActive]}>
                          {q}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer nút hành động: chỉ hiển thị ở bước nhập lý do */}
          {step === 'REASON' && (
            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.skipBtn}
                onPress={handleSkipReason}
                activeOpacity={0.7}
              >
                <Text style={styles.skipBtnText}>BỎ QUA LÝ DO</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleConfirmReason}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmBtnText}>XÁC NHẬN & LƯU</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Footer bước 1: Nút đóng lại */}
          {step === 'SCOPE' && (
            <View style={styles.footerSingle}>
              <TouchableOpacity
                style={styles.closeFooterBtn}
                onPress={handleClose}
                activeOpacity={0.7}
              >
                <Text style={styles.closeFooterBtnText}>HỦY THAO TÁC</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SmoothModal>

    {/* PopupModal xác nhận độc lập ở tầng cao nhất tuyệt đối */}
    <PopupModal ref={popupModalRef} />
  </>
  );
});

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 20,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  backBtnText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#334155',
  },
  headerIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#64748B',
  },
  scrollContent: {
    paddingVertical: 12,
  },
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  customerLabel: {
    fontSize: 13,
    color: '#64748B',
    marginRight: 6,
  },
  customerValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  groupBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    maxWidth: 150,
  },
  groupBadgeText: {
    fontSize: 11,
    color: '#1D4ED8',
    fontWeight: '700',
  },
  itemsCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  itemsCardTitle: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#C2410C',
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  itemName: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
    marginRight: 8,
  },
  priceFlowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  oldPriceText: {
    fontSize: 12.5,
    color: '#64748B',
    textDecorationLine: 'line-through',
  },
  arrowText: {
    fontSize: 12,
    color: '#94A3B8',
    marginHorizontal: 6,
  },
  newPriceText: {
    fontSize: 13.5,
    fontWeight: 'bold',
    color: '#DC2626',
  },

  /* Scope Selection Styles */
  scopeSection: {
    marginTop: 2,
    marginBottom: 10,
  },
  questionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    lineHeight: 20,
    marginBottom: 12,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  optionCardFuture: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
  },
  optionLeftWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    paddingRight: 8,
  },
  optionIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionIconCircleOneTime: {
    backgroundColor: '#F1F5F9',
  },
  optionIconCircleFuture: {
    backgroundColor: '#DBEAFE',
  },
  optionIcon: {
    fontSize: 18,
  },
  optionInfo: {
    flex: 1,
  },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
    gap: 6,
  },
  optionTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#1E293B',
  },
  optionTitleFuture: {
    color: '#1D4ED8',
  },
  oneTimeBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  oneTimeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  futureBadge: {
    backgroundColor: '#BFDBFE',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  futureBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  optionDesc: {
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 18,
  },
  optionChevron: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#94A3B8',
    marginLeft: 6,
  },
  optionChevronFuture: {
    color: '#3B82F6',
  },

  /* Reason Screen Styles */
  scopeNoticeCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  scopeNoticeText: {
    fontSize: 12.5,
    color: '#15803D',
    fontWeight: '600',
    lineHeight: 18,
  },
  inputWrap: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13.5,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 6,
  },
  inputLabelSub: {
    fontSize: 12,
    fontWeight: 'normal',
    color: '#64748B',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    minHeight: 74,
  },
  quickWrap: {
    marginBottom: 10,
  },
  quickTitle: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 8,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  chipText: {
    fontSize: 12,
    color: '#475569',
  },
  chipTextActive: {
    color: '#1D4ED8',
    fontWeight: 'bold',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  skipBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#64748B',
  },
  confirmBtn: {
    flex: 2,
    height: 46,
    borderRadius: 12,
    backgroundColor: COLORS.primary || '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  footerSingle: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  closeFooterBtn: {
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFooterBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#64748B',
  },
});

export default PriceChangeReasonModal;
