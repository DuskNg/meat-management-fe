// meat-management-fe/src/components/PortalDeliveryModal.js
import React, { useState, forwardRef, useImperativeHandle, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import axios from 'axios';
import SmoothModal from './SmoothModal';
import { showGlobalToast } from '../store/toastStore';
import { API_HOST } from '../api/client';
import { isMobileDevice } from '../utils/imageShareHelper';

// Helper lấy thông tin ngày hôm nay và ngày mai theo định dạng tiếng Việt
const getDateOptions = () => {
  const daysOfWeek = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const now = new Date();

  const pad = (n) => String(n).padStart(2, '0');

  // Hôm nay
  const todayDate = new Date(now);
  const todayDayName = daysOfWeek[todayDate.getDay()];
  const todayFormatted = `${pad(todayDate.getDate())}/${pad(todayDate.getMonth() + 1)}/${todayDate.getFullYear()}`;
  const todayIso = `${todayDate.getFullYear()}-${pad(todayDate.getMonth() + 1)}-${pad(todayDate.getDate())}`;

  // Ngày mai
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(now.getDate() + 1);
  const tomorrowDayName = daysOfWeek[tomorrowDate.getDay()];
  const tomorrowFormatted = `${pad(tomorrowDate.getDate())}/${pad(tomorrowDate.getMonth() + 1)}/${tomorrowDate.getFullYear()}`;
  const tomorrowIso = `${tomorrowDate.getFullYear()}-${pad(tomorrowDate.getMonth() + 1)}-${pad(tomorrowDate.getDate())}`;

  return {
    today: {
      type: 'today',
      dayName: todayDayName,
      formatted: todayFormatted,
      iso: todayIso,
      label: 'Hôm nay',
    },
    tomorrow: {
      type: 'tomorrow',
      dayName: tomorrowDayName,
      formatted: tomorrowFormatted,
      iso: tomorrowIso,
      label: 'Ngày mai',
    },
  };
};

const PortalDeliveryModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [portalToken, setPortalToken] = useState('');
  const [portalInfo, setPortalInfo] = useState(null);
  const [branches, setBranches] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);

  // Lựa chọn ngày: 'today' | 'tomorrow'
  const [selectedDateType, setSelectedDateType] = useState('today');
  const [note, setNote] = useState('');

  // Danh sách các lượt báo hàng gần đây trên portal
  const [recentRequests, setRecentRequests] = useState([]);

  const dateOpts = useMemo(() => getDateOptions(), []);

  // Tải danh sách báo hàng gần đây
  const fetchRecentRequests = async (token) => {
    const tk = token || portalToken;
    if (!tk) return;
    try {
      setLoading(true);
      const res = await axios.get(`${API_HOST}/api/v1/portal/delivery-request/${tk}`, {
        params: { _t: Date.now() },
      });
      if (res.data?.success && res.data?.data) {
        setRecentRequests(res.data.data);
      }
    } catch (err) {
      console.error('Lỗi khi tải lịch sử báo hàng:', err);
    } finally {
      setLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    open: (opts = {}) => {
      const tk = opts.token || '';
      setPortalToken(tk);
      setPortalInfo(opts.portalInfo || null);

      const bList = opts.branches || opts.portalInfo?.customers || [];
      setBranches(bList);

      const isMulti = bList.length > 1;
      const initialCustId = opts.currentCustomerId && opts.currentCustomerId !== 'all'
        ? opts.currentCustomerId
        : (bList[0]?.id || '');
      setSelectedCustomerId(initialCustId);

      // Nếu là nhóm nhiều quán: Nếu đang xem quán cụ thể thì pick quán đó, nếu đang xem 'all' thì pick tất cả quán trong nhóm
      if (isMulti) {
        if (opts.currentCustomerId && opts.currentCustomerId !== 'all') {
          setSelectedCustomerIds([opts.currentCustomerId]);
        } else {
          setSelectedCustomerIds(bList.map((b) => b.id));
        }
      } else {
        setSelectedCustomerIds(initialCustId ? [initialCustId] : []);
      }

      setSelectedDateType('today');
      setNote('');
      setVisible(true);

      if (tk) {
        fetchRecentRequests(tk);
      }
    },
    close: () => {
      setVisible(false);
    },
  }));

  const isChain = branches.length > 1;

  // Toggle chọn hoặc bỏ chọn một cơ sở trong nhóm
  const handleToggleCustomer = (customerId) => {
    setSelectedCustomerIds((prev) => {
      if (prev.includes(customerId)) {
        return prev.filter((id) => id !== customerId);
      }
      return [...prev, customerId];
    });
  };

  // Chọn tất cả cơ sở
  const handleSelectAll = () => {
    setSelectedCustomerIds(branches.map((b) => b.id));
  };

  // Bỏ chọn tất cả cơ sở
  const handleDeselectAll = () => {
    setSelectedCustomerIds([]);
  };

  // Tra cứu trạng thái báo hàng của từng quán trong ngày đang chọn
  const customerStatusMap = useMemo(() => {
    const map = {};
    const targetIso = selectedDateType === 'tomorrow' ? dateOpts.tomorrow.iso : dateOpts.today.iso;
    recentRequests.forEach((req) => {
      if (req.dateString === targetIso && req.status !== 'cancelled') {
        map[req.customerId] = req;
      }
    });
    return map;
  }, [recentRequests, selectedDateType, dateOpts]);

  // Tự động đóng webview / quay lại ứng dụng Zalo trên thiết bị di động
  const handleBackToZalo = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // 1. Zalo In-App Browser (WebView nội bộ Zalo): gọi JS Bridge đóng webview
      if (window.ZaloJSBridge && typeof window.ZaloJSBridge.call === 'function') {
        try {
          window.ZaloJSBridge.call('closeWindow');
          return;
        } catch (_) {}
      }

      // 2. Thử đóng cửa sổ / quay lại history
      try {
        window.close();
      } catch (_) {}

      // 3. Sử dụng deep link zalo:// để switch app quay thẳng về ứng dụng Zalo
      setTimeout(() => {
        try {
          window.location.href = 'zalo://';
        } catch (_) {
          Linking.openURL('zalo://').catch(() => {});
        }
      }, 300);
    } else {
      Linking.openURL('zalo://').catch(() => {});
    }
  };

  // Gửi báo hàng lên server
  const handleSubmit = async () => {
    if (!portalToken) return;

    if (isChain && selectedCustomerIds.length === 0) {
      showGlobalToast('Vui lòng chọn ít nhất 1 cơ sở / nhà hàng cần báo hàng.', 'warning');
      return;
    }

    if (!isChain && !selectedCustomerId && branches.length > 0) {
      showGlobalToast('Vui lòng chọn cơ sở / nhà hàng cần báo hàng.', 'warning');
      return;
    }

    try {
      setSubmitting(true);
      const targetObj = selectedDateType === 'tomorrow' ? dateOpts.tomorrow : dateOpts.today;

      const payload = {
        dateType: selectedDateType,
        deliveryDate: targetObj.iso,
        note: note.trim(),
      };

      if (isChain) {
        payload.customerIds = selectedCustomerIds;
        payload.customerId = selectedCustomerIds[0];
      } else {
        payload.customerId = selectedCustomerId || branches[0]?.id;
      }

      const res = await axios.post(`${API_HOST}/api/v1/portal/delivery-request/${portalToken}`, payload);

      if (res.data?.success) {
        const isMobile = isMobileDevice();
        const baseMsg = res.data?.message || `Đã báo lấy hàng cho ${targetObj.label} (${targetObj.formatted}) thành công!`;
        const successMsg = isMobile ? `${baseMsg} Đang quay lại Zalo...` : baseMsg;
        showGlobalToast(successMsg, 'success');
        setNote('');
        fetchRecentRequests(portalToken);
        if (props.onSubmitted) {
          props.onSubmitted(res.data.data);
        }

        // Tự động đóng modal
        setVisible(false);

        // Ở dạng dùng trên Mobile: tự động back lại Zalo
        if (isMobile) {
          setTimeout(() => {
            handleBackToZalo();
          }, 800);
        }
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Không thể gửi báo hàng, vui lòng thử lại.';
      showGlobalToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Hủy lượt báo hàng
  const handleCancelRequest = async (requestId) => {
    if (!portalToken || !requestId) return;
    try {
      setLoading(true);
      const res = await axios.delete(`${API_HOST}/api/v1/portal/delivery-request/${portalToken}/${requestId}`);
      if (res.data?.success) {
        showGlobalToast('Đã hủy báo hàng thành công.', 'success');
        fetchRecentRequests(portalToken);
        if (props.onSubmitted) {
          props.onSubmitted();
        }
      }
    } catch (err) {
      showGlobalToast(err.response?.data?.message || 'Lỗi khi hủy báo hàng', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        {/* HEADER MODAL */}
        <View style={styles.headerRow}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerIcon}>📦</Text>
            <View>
              <Text style={styles.modalTitle}>BÁO LẤY HÀNG</Text>
              <Text style={styles.modalSubTitle}>
                Đăng ký nhận hàng để chủ buôn chủ động chuẩn bị thịt
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => setVisible(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollBody}
        >
          {/* NẾU LÀ NHÓM NHIỀU NHÀ HÀNG: CHỌN DANH SÁCH CÁC CƠ SỞ CÓ BÁO HÀNG */}
          {isChain && (
            <View style={styles.sectionCard}>
              <View style={styles.branchSelectHeader}>
                <View style={styles.branchSelectTitleWrap}>
                  <Text style={styles.fieldLabel}>Chọn nhà hàng có báo hàng:</Text>
                  <View style={styles.selectedCountBadge}>
                    <Text style={styles.selectedCountText}>
                      Đã chọn: {selectedCustomerIds.length}/{branches.length}
                    </Text>
                  </View>
                </View>
                <View style={styles.branchActionBtns}>
                  <TouchableOpacity
                    style={styles.actionPillBtn}
                    onPress={handleSelectAll}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionPillTextActive}>Chọn tất cả</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionPillBtn}
                    onPress={handleDeselectAll}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionPillText}>Bỏ chọn</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* BẢNG / DANH SÁCH CÁC NHÀ HÀNG TRONG NHÓM */}
              <View style={styles.branchListContainer}>
                {branches.map((b, idx) => {
                  const isChecked = selectedCustomerIds.includes(b.id);
                  const statusInfo = customerStatusMap[b.id];
                  const isLast = idx === branches.length - 1;

                  return (
                    <TouchableOpacity
                      key={b.id || idx}
                      style={[
                        styles.branchRowItem,
                        isChecked && styles.branchRowItemChecked,
                        !isLast && styles.branchRowItemBorder,
                      ]}
                      onPress={() => handleToggleCustomer(b.id)}
                      activeOpacity={0.7}
                    >
                      {/* Checkbox */}
                      <View style={[styles.checkboxBox, isChecked && styles.checkboxBoxChecked]}>
                        {isChecked && <Text style={styles.checkboxTick}>✓</Text>}
                      </View>

                      {/* Tên cơ sở */}
                      <View style={styles.branchNameWrap}>
                        <Text
                          style={[
                            styles.branchNameText,
                            isChecked && styles.branchNameTextChecked,
                          ]}
                          numberOfLines={1}
                        >
                          {b.name}
                        </Text>
                        {b.phone ? (
                          <Text style={styles.branchPhoneText} numberOfLines={1}>
                            SĐT: {b.phone}
                          </Text>
                        ) : null}
                      </View>

                      {/* Trạng thái báo hàng trong ngày đã chọn */}
                      <View style={styles.branchStatusWrap}>
                        {statusInfo ? (
                          <View
                            style={[
                              styles.miniStatusBadge,
                              statusInfo.isConfirmed
                                ? styles.miniStatusConfirmed
                                : styles.miniStatusPending,
                            ]}
                          >
                            <Text
                              style={[
                                styles.miniStatusText,
                                statusInfo.isConfirmed
                                  ? styles.miniStatusTextConfirmed
                                  : styles.miniStatusTextPending,
                              ]}
                            >
                              {statusInfo.isConfirmed ? '✅ Đã chốt' : '⏳ Đã báo'}
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.unreportedText}>Chưa báo</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* CHỌN NGÀY NHẬN HÀNG: HÔM NAY HOẶC NGÀY MAI */}
          <View style={styles.sectionCard}>
            <Text style={styles.fieldLabel}>Chọn ngày nhận hàng:</Text>
            <View style={styles.dateGrid}>
              {/* Thẻ 1: Hôm nay */}
              <TouchableOpacity
                style={[
                  styles.dateCard,
                  selectedDateType === 'today' && styles.dateCardActive,
                ]}
                onPress={() => setSelectedDateType('today')}
                activeOpacity={0.8}
              >
                <View style={styles.dateCardTop}>
                  <Text style={styles.dateCardIcon}>📅</Text>
                  <Text
                    style={[
                      styles.dateCardLabel,
                      selectedDateType === 'today' && styles.dateCardLabelActive,
                    ]}
                  >
                    HÔM NAY
                  </Text>
                </View>
                <Text
                  style={[
                    styles.dateCardDayName,
                    selectedDateType === 'today' && styles.dateCardDayNameActive,
                  ]}
                >
                  {dateOpts.today.dayName}
                </Text>
                <Text
                  style={[
                    styles.dateCardFormatted,
                    selectedDateType === 'today' && styles.dateCardFormattedActive,
                  ]}
                >
                  {dateOpts.today.formatted}
                </Text>
              </TouchableOpacity>

              {/* Thẻ 2: Ngày mai */}
              <TouchableOpacity
                style={[
                  styles.dateCard,
                  selectedDateType === 'tomorrow' && styles.dateCardActive,
                ]}
                onPress={() => setSelectedDateType('tomorrow')}
                activeOpacity={0.8}
              >
                <View style={styles.dateCardTop}>
                  <Text style={styles.dateCardIcon}>🚀</Text>
                  <Text
                    style={[
                      styles.dateCardLabel,
                      selectedDateType === 'tomorrow' && styles.dateCardLabelActive,
                    ]}
                  >
                    NGÀY MAI
                  </Text>
                </View>
                <Text
                  style={[
                    styles.dateCardDayName,
                    selectedDateType === 'tomorrow' && styles.dateCardDayNameActive,
                  ]}
                >
                  {dateOpts.tomorrow.dayName}
                </Text>
                <Text
                  style={[
                    styles.dateCardFormatted,
                    selectedDateType === 'tomorrow' && styles.dateCardFormattedActive,
                  ]}
                >
                  {dateOpts.tomorrow.formatted}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* GHI CHÚ BÁO HÀNG */}
          <View style={styles.sectionCard}>
            <Text style={styles.fieldLabel}>Ghi chú thêm (tùy chọn):</Text>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="VD: Lấy số lượng như hôm trước, giao sớm trước 7h sáng..."
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={3}
            />
          </View>

          {/* DANH SÁCH LƯỢT BÁO HÀNG ĐÃ GỬI (DẠNG BẢNG ĐỐI SOÁT) */}
          {recentRequests.length > 0 && (
            <View style={styles.historyCard}>
              <View style={styles.historyHeaderRow}>
                <Text style={styles.historyTitle}>📋 Lịch sử báo hàng gần đây:</Text>
                <Text style={styles.historySubBadge}>{recentRequests.length} lượt</Text>
              </View>

              <View style={styles.historyTable}>
                {recentRequests.map((req, idx) => {
                  const isConfirmed = req.isConfirmed;
                  const isLast = idx === recentRequests.length - 1;

                  return (
                    <View
                      key={req.id || idx}
                      style={[
                        styles.historyItemRow,
                        !isLast && styles.historyItemRowBorder,
                      ]}
                    >
                      <View style={styles.historyInfo}>
                        {/* Tên nhà hàng (nếu là nhóm) */}
                        {isChain && req.customer?.name ? (
                          <Text style={styles.historyBranchName} numberOfLines={1}>
                            🏪 {req.customer.name}
                          </Text>
                        ) : null}

                        <View style={styles.historyDayRow}>
                          <Text style={styles.historyDayText}>
                            {req.formattedDeliveryDate} ({req.dateType === 'tomorrow' ? 'Ngày mai' : 'Hôm nay'})
                          </Text>
                          <View
                            style={[
                              styles.statusBadge,
                              isConfirmed ? styles.statusBadgeConfirmed : styles.statusBadgePending,
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                isConfirmed ? styles.statusBadgeTextConfirmed : styles.statusBadgeTextPending,
                              ]}
                            >
                              {isConfirmed ? '✅ Đã chốt' : '⏳ Chờ chủ chốt'}
                            </Text>
                          </View>
                        </View>
                        {req.note ? (
                          <Text style={styles.historyNoteText} numberOfLines={2}>
                            Ghi chú: {req.note}
                          </Text>
                        ) : null}
                      </View>

                      {!isConfirmed && (
                        <TouchableOpacity
                          style={styles.cancelReqBtn}
                          onPress={() => handleCancelRequest(req.id)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.cancelReqBtnText}>✕ Hủy</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </ScrollView>

        {/* FOOTER NÚT BẤM FULL WIDTH */}
        <View style={styles.footerWrap}>
          <TouchableOpacity
            style={[
              styles.submitBtn,
              (submitting || (isChain && selectedCustomerIds.length === 0)) && styles.submitBtnDisabled,
            ]}
            onPress={handleSubmit}
            disabled={submitting || (isChain && selectedCustomerIds.length === 0)}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitBtnText}>
                {isChain
                  ? `XÁC NHẬN BÁO HÀNG (${selectedCustomerIds.length} CƠ SỞ - ${selectedDateType === 'tomorrow' ? 'NGÀY MAI' : 'HÔM NAY'})`
                  : `XÁC NHẬN BÁO HÀNG (${selectedDateType === 'tomorrow' ? 'NGÀY MAI' : 'HÔM NAY'})`}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SmoothModal>
  );
});

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 18,
    paddingHorizontal: 16,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  headerIcon: {
    fontSize: 24,
  },
  modalTitle: {
    fontSize: 16.5,
    fontWeight: 'bold',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  modalSubTitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
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
    fontSize: 14,
    color: '#475569',
    fontWeight: 'bold',
  },
  scrollBody: {
    paddingVertical: 14,
    gap: 14,
  },
  sectionCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
  },
  selectInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  dateGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  dateCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  dateCardActive: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  dateCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  dateCardIcon: {
    fontSize: 14,
  },
  dateCardLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#64748B',
  },
  dateCardLabelActive: {
    color: '#047857',
  },
  dateCardDayName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 2,
  },
  dateCardDayNameActive: {
    color: '#065F46',
  },
  dateCardFormatted: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  dateCardFormattedActive: {
    color: '#047857',
    fontWeight: 'bold',
  },
  noteInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 10,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 64,
    textAlignVertical: 'top',
  },
  historyCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 8,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E40AF',
  },
  historySubBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  historyTable: {
    gap: 8,
  },
  historyBranchName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: 3,
  },
  historyItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  historyItemRowBorder: {
    marginBottom: 2,
  },
  historyInfo: {
    flex: 1,
  },
  historyDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyDayText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgePending: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeConfirmed: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  statusBadgeTextPending: {
    color: '#B45309',
  },
  statusBadgeTextConfirmed: {
    color: '#15803D',
  },
  historyNoteText: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 4,
    fontStyle: 'italic',
  },
  cancelReqBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
    marginLeft: 8,
  },
  cancelReqBtnText: {
    fontSize: 11.5,
    color: '#DC2626',
    fontWeight: 'bold',
  },
  branchSelectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 6,
  },
  branchSelectTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  selectedCountBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 8,
  },
  selectedCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  branchActionBtns: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  actionPillBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  actionPillText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  actionPillTextActive: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: '700',
  },
  branchListContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
  },
  branchRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
  },
  branchRowItemChecked: {
    backgroundColor: '#F8FAFC',
  },
  branchRowItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    backgroundColor: '#FFFFFF',
  },
  checkboxBoxChecked: {
    borderColor: '#2563EB',
    backgroundColor: '#2563EB',
  },
  checkboxTick: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: -1,
  },
  branchNameWrap: {
    flex: 1,
    marginRight: 8,
  },
  branchNameText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#334155',
  },
  branchNameTextChecked: {
    color: '#0F172A',
    fontWeight: '700',
  },
  branchPhoneText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  branchStatusWrap: {
    alignItems: 'flex-end',
  },
  miniStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  miniStatusConfirmed: {
    backgroundColor: '#DCFCE7',
  },
  miniStatusPending: {
    backgroundColor: '#FEF3C7',
  },
  miniStatusText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  miniStatusTextConfirmed: {
    color: '#15803D',
  },
  miniStatusTextPending: {
    color: '#B45309',
  },
  unreportedText: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  footerWrap: {
    paddingTop: 10,
  },
  submitBtn: {
    backgroundColor: '#059669',
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: 14.5,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});

export default PortalDeliveryModal;
