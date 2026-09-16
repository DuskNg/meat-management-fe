// meat-management-fe/src/components/StaffSubmissionReviewModal.js
import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import SmoothModal from './SmoothModal';
import CustomSelect from './CustomSelect';
import DatePickerInput from './DatePickerInput';
import ImagePreviewModal from './ImagePreviewModal';
import PopupModal from './PopupModal';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import { showGlobalToast } from '../store/toastStore';
import { removeDiacritics } from '../utils/searchHelper';

// Helper định dạng tiền VNĐ
const formatCurrency = (amount) =>
  new Intl.NumberFormat('vi-VN').format(Math.round(amount || 0));

const StaffSubmissionReviewModal = forwardRef(({ onRefresh }, ref) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [selectedSub, setSelectedSub] = useState(null);

  // Bộ lọc
  const [filterStatus, setFilterStatus] = useState('READY_FOR_REVIEW'); // READY_FOR_REVIEW | APPROVED | ALL
  const [filterDate, setFilterDate] = useState(() => {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    return `${d}/${m}/${y}`;
  });

  // Dữ liệu danh bạ khách hàng và sản phẩm
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);

  // Form chỉnh sửa hóa đơn đang chọn
  const [editCustomer, setEditCustomer] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editItems, setEditItems] = useState([]);
  const [submittingApprove, setSubmittingApprove] = useState(false);

  // Quản lý link Zalo nhân viên
  const [showLinkManager, setShowLinkManager] = useState(false);
  const [staffLinks, setStaffLinks] = useState([]);
  const [loadingLinks, setLoadingLinks] = useState(false);

  // Refs điều khiển modal phụ
  const imagePreviewModalRef = useRef(null);
  const popupModalRef = useRef(null);

  // Tải danh sách khách hàng và sản phẩm
  const fetchMasterData = async () => {
    try {
      const [custRes, prodRes] = await Promise.all([
        api.get('/customers?isBadDebt=false'),
        api.get('/products'),
      ]);
      if (custRes.data.success) setCustomers(custRes.data.data || []);
      if (prodRes.data.success) {
        setProducts(
          (prodRes.data.data || []).filter(
            (p) => p.name !== 'Tiền hàng' && !p.name.toLowerCase().startsWith('tiền')
          )
        );
      }
    } catch (err) {
      console.warn('Lỗi khi tải danh bạ:', err);
    }
  };

  // Tải danh sách hóa đơn nhân viên nộp
  const fetchSubmissions = async () => {
    try {
      setLoading(true);
      const params = { status: filterStatus };
      if (filterDate) {
        const [d, m, y] = filterDate.split('/');
        params.date = `${y}-${m}-${d}`;
      }
      const res = await api.get('/staff-submissions', { params });
      if (res.data.success) {
        const list = res.data.data || [];
        setSubmissions(list);
        if (list.length > 0) {
          // Tự động chọn hóa đơn đầu tiên để đối soát
          loadSubmissionToEdit(list[0]);
        } else {
          setSelectedSub(null);
        }
      }
    } catch (err) {
      console.error('Lỗi khi tải hóa đơn nhân viên:', err);
      showGlobalToast('Không thể tải danh sách hóa đơn nhân viên.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Tải danh mục thịt kèm giá riêng cho khách hàng
  const fetchCustomerPrices = async (customerId) => {
    if (!customerId) return;
    try {
      const res = await api.get(`/products?customerId=${customerId}`);
      if (res.data?.success) {
        const custProds = (res.data.data || []).filter(
          (p) => p.name !== 'Tiền hàng' && !p.name.toLowerCase().startsWith('tiền')
        );
        setProducts(custProds);
      }
    } catch (e) {
      console.warn('Lỗi tải giá riêng khách:', e);
    }
  };

  // Nạp 1 hóa đơn vào form chỉnh sửa
  const loadSubmissionToEdit = (sub) => {
    setSelectedSub(sub);
    const subDate = new Date(sub.date);
    const d = String(subDate.getDate()).padStart(2, '0');
    const m = String(subDate.getMonth() + 1).padStart(2, '0');
    const y = subDate.getFullYear();
    setEditDate(`${d}/${m}/${y}`);
    setEditNote(sub.note || '');

    // Khách hàng
    let matchedCust = null;
    if (sub.matchedCustomer) {
      matchedCust = sub.matchedCustomer;
      setEditCustomer(sub.matchedCustomer);
    } else if (sub.matchedCustomerId) {
      const found = customers.find((c) => c.id === sub.matchedCustomerId);
      matchedCust = found || null;
      setEditCustomer(found || null);
    } else {
      setEditCustomer(null);
    }

    if (matchedCust?.id) {
      fetchCustomerPrices(matchedCust.id);
    }

    // Danh sách món thịt
    const rawItems = (sub.items || []).map((it, idx) => {
      const matchedP = products.find((p) => p.id === it.matchedProductId);
      return {
        id: it.id || `temp_${idx}`,
        rawName: it.rawName,
        selectedProduct: matchedP || (it.rawName ? { id: '__manual__', name: it.rawName, unit: 'kg' } : null),
        matchedProductId: it.matchedProductId || null,
        quantity: it.quantity != null ? String(it.quantity) : '',
        price: it.price != null ? String(Math.round(it.price)) : '',
        amount: it.amount != null ? String(Math.round(it.amount)) : '',
      };
    });

    setEditItems(rawItems);
  };

  // Tải danh sách link nhân viên
  const fetchStaffLinks = async () => {
    try {
      setLoadingLinks(true);
      const res = await api.get('/staff-submissions/manage/links');
      if (res.data.success) {
        setStaffLinks(res.data.data || []);
      }
    } catch (err) {
      console.warn('Lỗi khi tải link nhân viên:', err);
    } finally {
      setLoadingLinks(false);
    }
  };

  useImperativeHandle(ref, () => ({
    open: (initialStatus) => {
      setVisible(true);
      if (initialStatus) setFilterStatus(initialStatus);
      fetchMasterData();
      fetchSubmissions();
    },
    close: () => setVisible(false),
  }));

  useEffect(() => {
    if (visible) {
      fetchSubmissions();
    }
  }, [filterStatus, filterDate]);

  // Thêm 1 dòng món thịt mới
  const handleAddItem = () => {
    setEditItems((prev) => [
      ...prev,
      {
        id: `temp_${Date.now()}_${Math.random()}`,
        rawName: '',
        selectedProduct: null,
        matchedProductId: null,
        quantity: '',
        price: '',
        amount: '',
      },
    ]);
  };

  // Cập nhật 1 dòng món thịt
  const handleUpdateItem = (index, field, value) => {
    setEditItems((prev) => {
      const next = [...prev];
      const item = { ...next[index], [field]: value };

      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.price) || 0;

      if (field === 'quantity' || field === 'price') {
        if (qty > 0 && price > 0) {
          item.amount = String(Math.round(qty * price));
        }
      } else if (field === 'amount') {
        const amt = parseFloat(value) || 0;
        if (amt > 0 && qty > 0) {
          item.price = String(Math.round(amt / qty));
        }
      }

      next[index] = item;
      return next;
    });
  };

  // Xóa 1 dòng món thịt
  const handleRemoveItem = (index) => {
    setEditItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Tính tổng tiền hóa đơn đang sửa
  const totalAmount = editItems.reduce((sum, it) => sum + (parseFloat(it.amount) || 0), 0);

  // Phê duyệt và lên đơn nợ
  const handleApprove = async () => {
    if (!selectedSub) return;
    if (!editCustomer) {
      showGlobalToast('Vui lòng chọn khách hàng để ghi nợ.', 'warning');
      return;
    }
    if (editItems.length === 0) {
      showGlobalToast('Vui lòng nhập ít nhất một mặt hàng thịt.', 'warning');
      return;
    }

    try {
      setSubmittingApprove(true);
      const [d, m, y] = editDate.split('/');
      const isoDate = `${y}-${m}-${d}`;

      const payload = {
        customerId: editCustomer.id,
        date: isoDate,
        note: editNote,
        items: editItems.map((it) => ({
          matchedProductId: it.selectedProduct?.id !== '__manual__' ? it.selectedProduct?.id : it.matchedProductId,
          rawName: it.selectedProduct?.name || it.rawName || 'Thịt',
          quantity: parseFloat(it.quantity) || 0,
          price: parseFloat(it.price) || 0,
          amount: parseFloat(it.amount) || Math.round((parseFloat(it.quantity) || 0) * (parseFloat(it.price) || 0)),
        })),
      };

      const res = await api.post(`/staff-submissions/${selectedSub.id}/approve`, payload);
      if (res.data.success) {
        showGlobalToast(`🎉 Đã duyệt và lên đơn nợ cho ${editCustomer.name} thành công!`, 'success');
        if (onRefresh) onRefresh();

        // Xóa hóa đơn đã duyệt khỏi danh sách chờ duyệt hiện tại
        setSubmissions((prev) => {
          const nextList = prev.filter((s) => s.id !== selectedSub.id);
          if (nextList.length > 0) {
            loadSubmissionToEdit(nextList[0]);
          } else {
            setSelectedSub(null);
          }
          return nextList;
        });
      }
    } catch (err) {
      console.error('Lỗi duyệt hóa đơn:', err);
      showGlobalToast(err.response?.data?.message || 'Không thể duyệt hóa đơn.', 'error');
    } finally {
      setSubmittingApprove(false);
    }
  };

  // Bác bỏ / xóa hóa đơn
  const handleReject = () => {
    if (!selectedSub) return;

    popupModalRef.current?.show({
      type: 'confirm',
      title: 'Bác bỏ hóa đơn này?',
      message: 'Hóa đơn này sẽ bị bỏ qua và không được lên đơn nợ. Bạn có chắc chắn không?',
      onConfirm: async () => {
        try {
          const res = await api.post(`/staff-submissions/${selectedSub.id}/reject`);
          if (res.data.success) {
            showGlobalToast('Đã bác bỏ hóa đơn.', 'info');
            setSubmissions((prev) => {
              const nextList = prev.filter((s) => s.id !== selectedSub.id);
              if (nextList.length > 0) {
                loadSubmissionToEdit(nextList[0]);
              } else {
                setSelectedSub(null);
              }
              return nextList;
            });
          }
        } catch (err) {
          showGlobalToast('Không thể bác bỏ hóa đơn.', 'error');
        }
      },
    });
  };

  // Copy link Zalo nhân viên
  const handleCopyLink = (tokenStr) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const fullUrl = `${origin}/submit/${tokenStr}`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(fullUrl);
      showGlobalToast('Đã sao chép link gửi hóa đơn Zalo vào bộ nhớ đệm!', 'success');
    } else {
      showGlobalToast(`Link: ${fullUrl}`, 'info');
    }
  };

  return (
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)} centered={false}>
        <View style={[styles.modalView, isMobile && styles.modalViewMobile]}>
          {/* ─── HEADER ─── */}
          <View style={[styles.headerRow, isMobile && styles.headerRowMobile]}>
            <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.modalTitle, isMobile && styles.modalTitleMobile]} numberOfLines={1}>
                  {isMobile ? '🤖 Duyệt hóa đơn' : '🤖 DUYỆT HÓA ĐƠN NHÂN VIÊN GỬI VỀ'}
                </Text>
                <View style={styles.badgePending}>
                  <Text style={styles.badgePendingText}>{submissions.length} đơn</Text>
                </View>
              </View>
              <Text style={[styles.modalSubtitle, isMobile && styles.modalSubtitleMobile]} numberOfLines={1}>
                {isMobile ? 'Đối chiếu ảnh gốc và xác nhận lên đơn nợ' : 'Đối chiếu ảnh/video gốc và xác nhận dữ liệu AI phân tích để lên đơn nợ'}
              </Text>
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity
                style={[styles.btnLinkManager, isMobile && styles.btnLinkManagerMobile]}
                onPress={() => {
                  setShowLinkManager(!showLinkManager);
                  if (!showLinkManager) fetchStaffLinks();
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.btnLinkManagerText, isMobile && styles.btnLinkManagerTextMobile]}>
                  {isMobile ? '🔗 Link Zalo' : '🔗 Link gửi Zalo'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.btnClose} onPress={() => setVisible(false)}>
                <Text style={styles.btnCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ─── THANH LINK GỬI HÓA ĐƠN/VIDEO ─── */}
          {showLinkManager && (
            <View style={styles.linkManagerBox}>
              {loadingLinks ? (
                <ActivityIndicator color="#10B981" size="small" />
              ) : (
                staffLinks.map((link) => (
                  <View key={link.id} style={styles.linkRowItem}>
                    <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                      <Text style={styles.linkItemName} numberOfLines={1}>
                        🔗 Gửi ảnh hóa đơn, video công nợ
                      </Text>
                      <Text style={styles.linkItemToken} numberOfLines={1}>
                        Mã: <Text style={{ color: '#0284C7', fontWeight: 'bold' }}>{link.token}</Text>
                        {link.pin ? ` • PIN: ${link.pin}` : ''}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity
                        style={styles.btnCopyLink}
                        onPress={() => handleCopyLink(link.token)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.btnCopyLinkText}>📋 Sao chép</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.btnCloseLinkBar}
                        onPress={() => setShowLinkManager(false)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.btnCloseLinkBarText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {/* ─── THANH BỘ LỌC ─── */}
          <View style={[styles.filterBar, isMobile && styles.filterBarMobile]}>
            <View style={[styles.statusTabs, isMobile && styles.statusTabsMobile]}>
              <TouchableOpacity
                style={[
                  styles.statusTab,
                  isMobile && styles.statusTabMobile,
                  filterStatus === 'READY_FOR_REVIEW' && styles.statusTabActive,
                ]}
                onPress={() => setFilterStatus('READY_FOR_REVIEW')}
              >
                <Text
                  style={[
                    styles.statusTabText,
                    isMobile && styles.statusTabTextMobile,
                    filterStatus === 'READY_FOR_REVIEW' && styles.statusTabTextActive,
                  ]}
                  numberOfLines={1}
                >
                  ⏳ Chờ duyệt ({submissions.filter((s) => s.status === 'READY_FOR_REVIEW' || s.status === 'PENDING' || s.status === 'ANALYZING').length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.statusTab,
                  isMobile && styles.statusTabMobile,
                  filterStatus === 'APPROVED' && styles.statusTabActive,
                ]}
                onPress={() => setFilterStatus('APPROVED')}
              >
                <Text
                  style={[
                    styles.statusTabText,
                    isMobile && styles.statusTabTextMobile,
                    filterStatus === 'APPROVED' && styles.statusTabTextActive,
                  ]}
                  numberOfLines={1}
                >
                  ✅ Đã lên đơn
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.statusTab,
                  isMobile && styles.statusTabMobile,
                  filterStatus === 'ALL' && styles.statusTabActive,
                ]}
                onPress={() => setFilterStatus('ALL')}
              >
                <Text
                  style={[
                    styles.statusTabText,
                    isMobile && styles.statusTabTextMobile,
                    filterStatus === 'ALL' && styles.statusTabTextActive,
                  ]}
                  numberOfLines={1}
                >
                  Tất cả
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.dateFilterWrap, isMobile && styles.dateFilterWrapMobile]}>
              {isMobile && (
                <Text style={styles.mobileDateLabel}>📅 Ngày xem:</Text>
              )}
              {filterDate ? (
                <View style={styles.datePickerHolder}>
                  <View style={{ width: isMobile ? 122 : 132 }}>
                    <DatePickerInput
                      value={filterDate}
                      onChange={setFilterDate}
                      compact={true}
                      showIcon={true}
                      alignRight={!isMobile}
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.btnClearFilterDate}
                    onPress={() => setFilterDate('')}
                    activeOpacity={0.7}
                    title="Xóa lọc ngày (Xem tất cả)"
                  >
                    <Text style={styles.btnClearFilterDateText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.btnPickDateAll, isMobile && styles.btnPickDateAllMobile]}
                  onPress={() => {
                    const today = new Date();
                    const d = String(today.getDate()).padStart(2, '0');
                    const m = String(today.getMonth() + 1).padStart(2, '0');
                    const y = today.getFullYear();
                    setFilterDate(`${d}/${m}/${y}`);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.btnPickDateAllText, isMobile && { fontSize: 11.5 }]}>
                    📅 Tất cả ngày (Bấm lọc)
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ─── THÂN ĐỐI SOÁT (2 CỘT HOẶC STACK DỌC TRÊN MOBILE) ─── */}
          {loading ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color="#10B981" />
              <Text style={{ color: '#64748B', marginTop: 10 }}>Đang tải danh sách hóa đơn...</Text>
            </View>
          ) : submissions.length === 0 ? (
            <View style={[styles.centerEmpty, isMobile && { padding: 16 }]}>
              <Text style={{ fontSize: isMobile ? 32 : 40, marginBottom: 8 }}>🎉</Text>
              <Text style={[styles.emptyTitle, isMobile && { fontSize: 15 }]}>Không có hóa đơn nào cần duyệt</Text>
              <Text style={[styles.emptyDesc, isMobile && { fontSize: 12 }]}>Toàn bộ hóa đơn do nhân viên gửi trong khoảng thời gian này đã được xử lý xong.</Text>
            </View>
          ) : (
            <View style={[styles.reviewBodyContainer, isMobile && styles.reviewBodyContainerMobile]}>
              {/* CỘT TRÁI: DANH SÁCH HÓA ĐƠN & ẢNH GỐC */}
              <View style={[styles.leftCol, isMobile && styles.leftColMobile]}>
                {/* Thanh chọn nhanh các hóa đơn */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subListBar}>
                  {submissions.map((sub, idx) => {
                    const isSelected = selectedSub?.id === sub.id;
                    return (
                      <TouchableOpacity
                        key={sub.id}
                        style={[styles.subTabItem, isSelected && styles.subTabItemActive]}
                        onPress={() => loadSubmissionToEdit(sub)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.subTabItemText, isSelected && styles.subTabItemTextActive]}>
                          #{idx + 1} {sub.detectedCustomerName || sub.matchedCustomer?.name || sub.senderName || 'Hóa đơn'}
                        </Text>
                        {sub.status === 'APPROVED' && <Text style={{ fontSize: 10 }}>✅</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Khung xem ảnh / video gốc */}
                {selectedSub && (
                  <View style={styles.mediaBox}>
                    <View style={styles.mediaHeader}>
                      <Text style={styles.mediaInfoText} numberOfLines={1}>
                        Người gửi: <Text style={{ fontWeight: 'bold' }}>{selectedSub.senderName || 'Nhân viên'}</Text>
                        {selectedSub.note ? ` • Ghi chú: ${selectedSub.note}` : ''}
                      </Text>

                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                          style={styles.btnZoomMedia}
                          onPress={() => imagePreviewModalRef.current?.open(selectedSub.fileUrl)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.btnZoomMediaText}>🔍 Phóng to</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.imageContainer}>
                      {selectedSub.fileType === 'VIDEO' ? (
                        <View style={styles.videoPlayerBox}>
                          {typeof window !== 'undefined' && selectedSub.fileUrl ? (
                            <video
                              key={selectedSub.fileUrl}
                              src={selectedSub.fileUrl}
                              controls
                              playsInline
                              style={{
                                width: '100%',
                                height: '100%',
                                maxHeight: isMobile ? 180 : 480,
                                backgroundColor: '#000000',
                                borderRadius: 8,
                                objectFit: 'contain',
                              }}
                            />
                          ) : (
                            <View style={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                              <Text style={{ fontSize: 36 }}>🎬</Text>
                              <Text style={styles.videoPlayerTitle}>Video số kg thịt</Text>
                              <TouchableOpacity
                                style={styles.btnOpenVideoLink}
                                onPress={() => window.open(selectedSub.fileUrl, '_blank')}
                              >
                                <Text style={styles.btnOpenVideoLinkText}>▶️ Mở phát video trong tab mới</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      ) : (
                        <TouchableOpacity
                          activeOpacity={0.9}
                          style={{ width: '100%', height: '100%' }}
                          onPress={() => imagePreviewModalRef.current?.open(selectedSub.fileUrl)}
                        >
                          <Image
                            source={{ uri: selectedSub.fileUrl }}
                            style={styles.mainMediaImg}
                            resizeMode="contain"
                          />
                        </TouchableOpacity>
                      )}
                    </View>

                    {selectedSub.aiError ? (
                      <View style={styles.aiErrorBanner}>
                        <Text style={styles.aiErrorText}>⚠️ AI không đọc được rõ tích kê: {selectedSub.aiError}. Vui lòng nhập tay bên phải.</Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </View>

              {/* CỘT PHẢI: BẢNG DỮ LIỆU ĐỐI SOÁT & SỬA LỖI */}
              <View style={[styles.rightCol, isMobile && styles.rightColMobile]}>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
                  <Text style={styles.sectionHeaderTitle}>BẢNG DỮ LIỆU BÓC TÁCH (AI):</Text>

                  {/* Chọn khách hàng */}
                  <View style={styles.formRow}>
                    <Text style={styles.fieldLabel}>
                      Khách hàng ghi nợ <Text style={{ color: '#EF4444' }}>*</Text>
                      {selectedSub?.detectedCustomerName ? (
                        <Text style={{ color: '#0EA5E9', fontWeight: 'normal', fontSize: 12 }}>
                          {' '}(AI đọc: "{selectedSub.detectedCustomerName}")
                        </Text>
                      ) : null}
                    </Text>
                    <CustomSelect
                      value={editCustomer}
                      placeholder="Chọn khách hàng từ danh bạ..."
                      options={customers}
                      onSelect={(c) => {
                        setEditCustomer(c);
                        if (c?.id) {
                          fetchCustomerPrices(c.id);
                        }
                      }}
                      renderSelected={(c) => c?.name || ''}
                      renderOption={(c) => (
                        <View style={styles.custOptionRow}>
                          <Text style={styles.custOptionName}>{c.name}</Text>
                          {c.phone ? <Text style={styles.custOptionPhone}>📞 {c.phone}</Text> : null}
                        </View>
                      )}
                    />
                  </View>

                  {/* Ngày giao hàng */}
                  <View style={styles.formRow}>
                    <Text style={styles.fieldLabel}>Ngày giao hàng</Text>
                    <DatePickerInput
                      value={editDate}
                      onChange={setEditDate}
                      placeholder="DD/MM/YYYY"
                    />
                  </View>

                  {/* Ghi chú đơn nợ */}
                  <View style={styles.formRow}>
                    <Text style={styles.fieldLabel}>Ghi chú đơn nợ</Text>
                    <TextInput
                      style={styles.inputNote}
                      value={editNote}
                      onChangeText={setEditNote}
                      placeholder="Ghi chú đơn hàng..."
                      placeholderTextColor="#94A3B8"
                    />
                  </View>

                  {/* Danh sách các mặt hàng thịt */}
                  <View style={styles.itemsSection}>
                    <View style={styles.itemsSectionHeader}>
                      <Text style={styles.itemsSectionTitle}>DANH SÁCH MÓN THỊT ({editItems.length})</Text>
                      <TouchableOpacity style={styles.btnAddRow} onPress={handleAddItem} activeOpacity={0.8}>
                        <Text style={styles.btnAddRowText}>+ Thêm món</Text>
                      </TouchableOpacity>
                    </View>

                    {editItems.map((item, idx) => (
                      isMobile ? (
                        /* Giao diện dạng thẻ 2 tầng trên Mobile */
                        <View key={item.id} style={styles.itemCardMobile}>
                          {/* Hàng 1: Tên món thịt + Nút xóa */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <View style={{ flex: 1 }}>
                              <CustomSelect
                                value={item.selectedProduct}
                                placeholder="Tên thịt..."
                                options={products}
                                onSelect={(p) => {
                                  handleUpdateItem(idx, 'selectedProduct', p);
                                  handleUpdateItem(idx, 'matchedProductId', p.id);
                                  const effectiveP = p.customPrice !== undefined && p.customPrice !== null ? p.customPrice : p.defaultPrice;
                                  if (effectiveP && !item.price) {
                                    handleUpdateItem(idx, 'price', String(Math.round(effectiveP)));
                                  }
                                }}
                                onInputChange={(txt) => handleUpdateItem(idx, 'rawName', txt)}
                                renderSelected={(p) => p?.name || item.rawName || ''}
                                renderOption={(p) => {
                                  const effectiveP = p.customPrice !== undefined && p.customPrice !== null ? p.customPrice : p.defaultPrice;
                                  return (
                                    <View style={styles.productOptionRow}>
                                      <Text style={styles.productOptionName}>{p.name}</Text>
                                      <Text style={styles.productOptionPrice}>{formatCurrency(effectiveP)}/{p.unit}</Text>
                                    </View>
                                  );
                                }}
                              />
                            </View>
                            <TouchableOpacity
                              style={styles.btnDeleteRow}
                              onPress={() => handleRemoveItem(idx)}
                              activeOpacity={0.7}
                            >
                              <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 16 }}>✕</Text>
                            </TouchableOpacity>
                          </View>

                          {/* Hàng 2: Số kg - Đơn giá - Thành tiền */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ flex: 1 }}>
                              <TextInput
                                style={styles.inputCell}
                                value={item.quantity}
                                onChangeText={(val) => handleUpdateItem(idx, 'quantity', val)}
                                placeholder="Số kg"
                                placeholderTextColor="#94A3B8"
                                keyboardType="numeric"
                              />
                            </View>
                            <View style={{ flex: 1.2 }}>
                              <TextInput
                                style={styles.inputCell}
                                value={item.price}
                                onChangeText={(val) => handleUpdateItem(idx, 'price', val)}
                                placeholder="Đơn giá"
                                placeholderTextColor="#94A3B8"
                                keyboardType="numeric"
                              />
                            </View>
                            <View style={{ flex: 1.4 }}>
                              <TextInput
                                style={[styles.inputCell, { fontWeight: 'bold', color: '#10B981' }]}
                                value={item.amount}
                                onChangeText={(val) => handleUpdateItem(idx, 'amount', val)}
                                placeholder="Thành tiền"
                                placeholderTextColor="#94A3B8"
                                keyboardType="numeric"
                              />
                            </View>
                          </View>
                        </View>
                      ) : (
                        /* Giao diện 1 hàng ngang trên Desktop */
                        <View key={item.id} style={styles.itemRow}>
                          {/* Cột Tên thịt */}
                          <View style={{ flex: 3 }}>
                            <CustomSelect
                              value={item.selectedProduct}
                              placeholder="Tên thịt..."
                              options={products}
                              onSelect={(p) => {
                                handleUpdateItem(idx, 'selectedProduct', p);
                                handleUpdateItem(idx, 'matchedProductId', p.id);
                                const effectiveP = p.customPrice !== undefined && p.customPrice !== null ? p.customPrice : p.defaultPrice;
                                if (effectiveP && !item.price) {
                                  handleUpdateItem(idx, 'price', String(Math.round(effectiveP)));
                                }
                              }}
                              onInputChange={(txt) => handleUpdateItem(idx, 'rawName', txt)}
                              renderSelected={(p) => p?.name || item.rawName || ''}
                              renderOption={(p) => {
                                const effectiveP = p.customPrice !== undefined && p.customPrice !== null ? p.customPrice : p.defaultPrice;
                                return (
                                  <View style={styles.productOptionRow}>
                                    <Text style={styles.productOptionName}>{p.name}</Text>
                                    <Text style={styles.productOptionPrice}>{formatCurrency(effectiveP)}/{p.unit}</Text>
                                  </View>
                                );
                              }}
                            />
                          </View>

                          {/* Cột Số kg */}
                          <View style={{ flex: 1.6 }}>
                            <TextInput
                              style={styles.inputCell}
                              value={item.quantity}
                              onChangeText={(val) => handleUpdateItem(idx, 'quantity', val)}
                              placeholder="Số kg"
                              placeholderTextColor="#94A3B8"
                              keyboardType="numeric"
                            />
                          </View>

                          {/* Cột Đơn giá */}
                          <View style={{ flex: 2 }}>
                            <TextInput
                              style={styles.inputCell}
                              value={item.price}
                              onChangeText={(val) => handleUpdateItem(idx, 'price', val)}
                              placeholder="Đơn giá"
                              placeholderTextColor="#94A3B8"
                              keyboardType="numeric"
                            />
                          </View>

                          {/* Cột Thành tiền */}
                          <View style={{ flex: 2.2 }}>
                            <TextInput
                              style={[styles.inputCell, { fontWeight: 'bold', color: '#10B981' }]}
                              value={item.amount}
                              onChangeText={(val) => handleUpdateItem(idx, 'amount', val)}
                              placeholder="Thành tiền"
                              placeholderTextColor="#94A3B8"
                              keyboardType="numeric"
                            />
                          </View>

                          {/* Nút xóa */}
                          <TouchableOpacity
                            style={styles.btnDeleteRow}
                            onPress={() => handleRemoveItem(idx)}
                            activeOpacity={0.7}
                          >
                            <Text style={{ color: '#EF4444', fontWeight: 'bold' }}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      )
                    ))}
                  </View>
                </ScrollView>

                {/* Footer tổng tiền và các nút duyệt */}
                <View style={[styles.reviewFooter, isMobile && styles.reviewFooterMobile]}>
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, isMobile && { fontSize: 13 }]}>TỔNG CỘNG ĐƠN HÀNG:</Text>
                    <Text style={[styles.totalValue, isMobile && { fontSize: 17 }]}>{formatCurrency(totalAmount)} đ</Text>
                  </View>

                  <View style={styles.actionBtnRow}>
                    <TouchableOpacity
                      style={[styles.btnReject, isMobile && { height: 40 }]}
                      onPress={handleReject}
                      disabled={submittingApprove}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.btnRejectText, isMobile && { fontSize: 12.5 }]}>🗑️ Bác bỏ</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.btnApprove, submittingApprove && { opacity: 0.7 }, isMobile && { height: 40 }]}
                      onPress={handleApprove}
                      disabled={submittingApprove}
                      activeOpacity={0.85}
                    >
                      {submittingApprove ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={[styles.btnApproveText, isMobile && { fontSize: 12.5 }]}>
                          {isMobile ? '✅ LÊN ĐƠN NỢ' : '✅ XÁC NHẬN & LÊN ĐƠN NỢ'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          )}
        </View>
      </SmoothModal>

      {/* Modal phóng to ảnh đối chiếu */}
      <ImagePreviewModal ref={imagePreviewModalRef} />

      {/* Popup Modal xác nhận */}
      <PopupModal ref={popupModalRef} />
    </>
  );
});

export default StaffSubmissionReviewModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '94%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  badgePending: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  badgePendingText: {
    color: '#D97706',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalSubtitle: {
    color: '#64748B',
    fontSize: 12.5,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  btnLinkManager: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  btnLinkManagerText: {
    color: '#4F46E5',
    fontSize: 12.5,
    fontWeight: 'bold',
  },
  btnClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnCloseText: {
    color: '#475569',
    fontSize: 16,
    fontWeight: 'bold',
  },
  linkManagerBox: {
    backgroundColor: '#F8FAFC',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  linkRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  linkItemName: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
  linkItemToken: {
    color: '#64748B',
    fontSize: 11.5,
    marginTop: 1,
  },
  btnCopyLink: {
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  btnCopyLinkText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  btnCloseLinkBar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnCloseLinkBarText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: 'bold',
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  statusTabs: {
    flexDirection: 'row',
    gap: 6,
  },
  statusTab: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
    backgroundColor: '#F1F5F9',
  },
  statusTabActive: {
    backgroundColor: '#10B981',
  },
  statusTabText: {
    color: '#475569',
    fontSize: 12.5,
    fontWeight: '600',
  },
  statusTabTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  dateFilterWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  datePickerHolder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  btnClearFilterDate: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  btnClearFilterDateText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#64748B',
  },
  btnPickDateAll: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  btnPickDateAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  emptyDesc: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 380,
  },
  reviewBodyContainer: {
    flex: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  leftCol: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    backgroundColor: '#0F172A',
    display: 'flex',
    flexDirection: 'column',
  },
  subListBar: {
    maxHeight: 46,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
  },
  subTabItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subTabItemActive: {
    borderBottomColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  subTabItemText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  subTabItemTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  mediaBox: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  mediaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  mediaInfoText: {
    color: '#E2E8F0',
    fontSize: 12,
    flex: 1,
  },
  btnZoomMedia: {
    backgroundColor: '#0EA5E9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  btnZoomMediaText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: 'bold',
  },
  imageContainer: {
    flex: 1,
    backgroundColor: '#020617',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainMediaImg: {
    width: '100%',
    height: '100%',
  },
  videoPlayerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  videoPlayerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 12,
  },
  btnOpenVideoLink: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnOpenVideoLinkText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  aiErrorBanner: {
    backgroundColor: '#FEF2F2',
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: '#FCA5A5',
  },
  aiErrorText: {
    color: '#DC2626',
    fontSize: 12,
  },
  rightCol: {
    flex: 1.25,
    backgroundColor: '#FFFFFF',
    display: 'flex',
    flexDirection: 'column',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sectionHeaderTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  formRow: {
    marginBottom: 10,
  },
  fieldLabel: {
    color: '#334155',
    fontSize: 12.5,
    fontWeight: '600',
    marginBottom: 4,
  },
  inputNote: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: '#0F172A',
  },
  itemsSection: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 10,
  },
  itemsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemsSectionTitle: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: 'bold',
  },
  btnAddRow: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  btnAddRowText: {
    color: '#059669',
    fontSize: 11.5,
    fontWeight: 'bold',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  inputCell: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 6,
    fontSize: 13,
    color: '#0F172A',
    textAlign: 'right',
  },
  btnDeleteRow: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewFooter: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  totalLabel: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: 'bold',
  },
  totalValue: {
    color: '#10B981',
    fontSize: 20,
    fontWeight: 'bold',
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btnReject: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  btnRejectText: {
    color: '#DC2626',
    fontSize: 13.5,
    fontWeight: 'bold',
  },
  btnApprove: {
    flex: 2.2,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  btnApproveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  custOptionRow: {
    paddingVertical: 4,
  },
  custOptionName: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '600',
  },
  custOptionPhone: {
    color: '#64748B',
    fontSize: 11,
  },
  productOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  productOptionName: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '600',
  },
  productOptionPrice: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: 'bold',
  },

  // ─── CÁC STYLE TỐI ƯU MOBILE ───
  modalViewMobile: {
    height: '96%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  headerRowMobile: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalTitleMobile: {
    fontSize: 15,
  },
  modalSubtitleMobile: {
    fontSize: 11.5,
    marginTop: 1,
  },
  btnLinkManagerMobile: {
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  btnLinkManagerTextMobile: {
    fontSize: 11.5,
  },
  filterBarMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusTabsMobile: {
    flexDirection: 'row',
    width: '100%',
    gap: 6,
  },
  statusTabMobile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  statusTabTextMobile: {
    fontSize: 11.5,
  },
  dateFilterWrapMobile: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  mobileDateLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  btnPickDateAllMobile: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    width: '100%',
    alignItems: 'center',
  },
  reviewBodyContainerMobile: {
    flexDirection: 'column',
  },
  leftColMobile: {
    height: 220,
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    borderRightWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  rightColMobile: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  itemCardMobile: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 8,
    marginBottom: 8,
  },
  reviewFooterMobile: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
});
