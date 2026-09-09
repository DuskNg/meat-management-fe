// meat-management-fe/src/components/PortalManagementModal.js
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
  Switch,
} from 'react-native';
import SmoothModal from './SmoothModal';
import CustomSelect from './CustomSelect';
import PopupModal from './PopupModal';
import { api } from '../api/client';
import { COLORS, SHADOWS } from '../theme';
import { showGlobalToast } from '../store/toastStore';
import PortalFeedbackAdminModal from './PortalFeedbackAdminModal';

const PortalManagementModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  // Ref popup thông báo / xác nhận dùng chung
  const popupRef = useRef(null);

  // Modal phụ xem phản hồi
  const feedbackModalRef = useRef(null);

  // Form tạo / sửa link
  const [isEditing, setIsEditing] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('customer'); // 'customer' | 'supplier'
  const [selectedCustomers, setSelectedCustomers] = useState([]); // Mảng các khách hàng đã chọn
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [pin, setPin] = useState('');
  const [note, setNote] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // zIndex container cho CustomSelect
  const [selectZIndex, setSelectZIndex] = useState(1);

  // Tải danh sách links
  const fetchLinks = async () => {
    try {
      setLoading(true);
      const res = await api.get('/portal/manage/links');
      setLinks(res.data?.data || []);
    } catch (err) {
      console.error('Lỗi tải danh sách link portal:', err);
    } finally {
      setLoading(false);
    }
  };

  // Tải danh sách khách hàng & NCC để chọn
  const fetchOptions = async () => {
    try {
      const [custRes, suppRes] = await Promise.all([
        api.get('/customers'),
        api.get('/suppliers').catch(() => ({ data: { data: [] } })),
      ]);
      setCustomers(custRes.data?.data || []);
      setSuppliers(suppRes.data?.data || []);
    } catch (err) {
      console.error('Lỗi tải options:', err);
    }
  };

  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true);
      setIsEditing(false);
      fetchLinks();
      fetchOptions();
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Xóa form và mở tạo mới
  const handleOpenCreateForm = () => {
    setEditingLinkId(null);
    setName('');
    setType('customer');
    setSelectedCustomers([]);
    setSelectedSupplier(null);
    setPin('');
    setNote('');
    setIsEditing(true);
  };

  // Mở form chỉnh sửa
  const handleOpenEditForm = (link) => {
    setEditingLinkId(link.id);
    setName(link.name);
    setType(link.type);
    setSelectedCustomers(link.customers || []);
    setSelectedSupplier(link.supplier || null);
    setPin(link.pin || '');
    setNote(link.note || '');
    setIsEditing(true);
  };

  // Thêm một khách hàng vào danh sách cơ sở của nhóm
  const handleAddCustomer = (c) => {
    if (!c) return;
    if (selectedCustomers.some((item) => item.id === c.id)) {
      showGlobalToast('Cơ sở này đã được thêm vào nhóm.');
      return;
    }
    setSelectedCustomers((prev) => [...prev, c]);
  };

  // Xóa khách hàng khỏi nhóm
  const handleRemoveCustomer = (cId) => {
    setSelectedCustomers((prev) => prev.filter((c) => c.id !== cId));
  };

  // Chọn nhanh toàn bộ khách hàng
  const handleSelectAllCustomers = () => {
    setSelectedCustomers(customers);
  };

  // Lưu link (Tạo mới hoặc Cập nhật)
  const handleSaveLink = async () => {
    if (!name.trim()) {
      showGlobalToast('Vui lòng nhập tên nhóm Zalo.', 'error');
      return;
    }

    if (type === 'customer' && selectedCustomers.length === 0) {
      showGlobalToast('Vui lòng chọn ít nhất một cơ sở/nhà hàng cho nhóm này.', 'error');
      return;
    }

    if (type === 'supplier' && !selectedSupplier) {
      showGlobalToast('Vui lòng chọn nhà cung cấp cho link này.', 'error');
      return;
    }

    try {
      setFormLoading(true);
      const payload = {
        name: name.trim(),
        type,
        pin: pin.trim() || null,
        note: note.trim() || null,
        customerIds: type === 'customer' ? selectedCustomers.map((c) => c.id) : [],
        supplierId: type === 'supplier' ? selectedSupplier.id : null,
      };

      if (editingLinkId) {
        await api.put(`/portal/manage/links/${editingLinkId}`, payload);
        showGlobalToast('Cập nhật link nhóm Zalo thành công!');
      } else {
        await api.post('/portal/manage/links', payload);
        showGlobalToast('Tạo link ghim Zalo mới thành công!');
      }

      setIsEditing(false);
      fetchLinks();
    } catch (err) {
      showGlobalToast(err.response?.data?.message || 'Có lỗi xảy ra khi lưu link.', 'error');
    } finally {
      setFormLoading(false);
    }
  };

  // Sao chép đường dẫn ghim Zalo
  const handleCopyLink = async (link) => {
    const origin =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:8081';
    const fullUrl = `${origin}/portal/${link.token}`;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fullUrl);
        showGlobalToast(`Đã sao chép link nhóm "${link.name}"! Dán ghim ngay vào Zalo.`);
      } else {
        showGlobalToast(`Link truy cập: ${fullUrl}`, 'info');
      }
    } catch (err) {
      showGlobalToast(`Link truy cập: ${fullUrl}`, 'info');
    }
  };

  // Xoay vòng link (Đổi mã link mới khi có biến động nhân sự)
  const handleRegenerateToken = (link) => {
    const confirmAction = async () => {
      try {
        await api.post(`/portal/manage/links/${link.id}/regenerate-token`);
        showGlobalToast('Đã thu hồi link cũ và sinh link mới thành công!');
        fetchLinks();
      } catch (err) {
        showGlobalToast(err.response?.data?.message || 'Không thể đổi link.', 'error');
      }
    };

    popupRef.current?.show({
      title: 'Đổi mã link Zalo',
      message: `Bạn có chắc muốn đổi link cho "${link.name}"? Link cũ trên nhóm Zalo sẽ bị khóa ngay lập tức và bạn cần gửi lại link mới.`,
      type: 'confirm',
      confirmText: 'Đổi link',
      cancelText: 'Hủy',
      onConfirm: confirmAction,
    });
  };

  // Bật / Tắt trạng thái link
  const handleToggleActive = async (link) => {
    try {
      await api.put(`/portal/manage/links/${link.id}`, {
        isActive: !link.isActive,
      });
      setLinks((prev) =>
        prev.map((l) => (l.id === link.id ? { ...l, isActive: !l.isActive } : l))
      );
      showGlobalToast(!link.isActive ? 'Đã kích hoạt link!' : 'Đã tạm khóa link!');
    } catch (err) {
      showGlobalToast('Không thể đổi trạng thái link.', 'error');
    }
  };

  // Xóa link
  const handleDeleteLink = (link) => {
    const confirmAction = async () => {
      try {
        await api.delete(`/portal/manage/links/${link.id}`);
        showGlobalToast('Đã xóa link ghim Zalo!');
        setLinks((prev) => prev.filter((l) => l.id !== link.id));
      } catch (err) {
        showGlobalToast('Không thể xóa link.', 'error');
      }
    };

    popupRef.current?.show({
      title: 'Xóa link nhóm Zalo',
      message: `Bạn có chắc muốn xóa vĩnh viễn link "${link.name}"?`,
      type: 'confirm',
      confirmText: 'Xóa vĩnh viễn',
      cancelText: 'Hủy',
      onConfirm: confirmAction,
    });
  };

  // Tổng số phản hồi đang chờ xử lý
  const totalPendingFeedbacks = links.reduce(
    (sum, l) => sum + (l.pendingFeedbacksCount || 0),
    0
  );

  return (
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)}>
        <View style={styles.modalView}>
          {/* HEADER MODAL CHUẨN CÓ NÚT ĐÓNG ✕ */}
          <View style={styles.modalHeaderRow}>
            <View style={styles.modalHeaderLeft}>
              <View style={styles.headerIconCircle}>
                <Text style={styles.headerIcon}>🔗</Text>
              </View>
              <View style={styles.modalHeaderTitleCol}>
                <Text style={styles.modalTitle}>QUẢN LÝ NHÓM ZALO</Text>
                <Text style={styles.modalSubTitle}>
                  Tạo link tra cứu công nợ & giá thịt ghim vào nhóm Zalo
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.closeHeaderBtn}
              onPress={() => setVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.closeHeaderBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* THANH ĐIỀU HƯỚNG TRÊN CÙNG */}
          <View style={styles.topActionsRow}>
            {!isEditing ? (
              <>
                <TouchableOpacity style={styles.createBtn} onPress={handleOpenCreateForm}>
                  <Text style={styles.createBtnText}>➕ Tạo Link Nhóm Mới</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.feedbackListBtn}
                  onPress={() => feedbackModalRef.current?.open('pending')}
                >
                  <Text style={styles.feedbackListBtnText}>
                    💬 Khiếu Nại / Báo Lệch
                    {totalPendingFeedbacks > 0 ? ` (${totalPendingFeedbacks} mới)` : ''}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => setIsEditing(false)}
              >
                <Text style={styles.backBtnText}>⬅ Quay lại danh sách</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* FORM TẠO / CHỈNH SỬA LINK */}
          {isEditing ? (
            <ScrollView
              contentContainerStyle={styles.formContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.formHeaderTitle}>
                {editingLinkId ? 'Chỉnh Sửa Link Nhóm Zalo' : 'Tạo Link Ghim Zalo Mới'}
              </Text>

              {/* Tên nhóm */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  Tên nhóm Zalo <Text style={{ color: '#EF4444' }}>*</Text>:
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ví dụ: Nhóm Bò Trường Hoàng (9 cơ sở), Phở Tiến..."
                  value={name}
                  onChangeText={setName}
                />
              </View>

              {/* Loại đối tác: Khách hàng hay Nhà cung cấp */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Loại đối tác:</Text>
                <View style={styles.typeToggleRow}>
                  <TouchableOpacity
                    style={[styles.typeToggleBtn, type === 'customer' && styles.typeToggleBtnActive]}
                    onPress={() => setType('customer')}
                  >
                    <Text
                      style={[
                        styles.typeToggleText,
                        type === 'customer' && styles.typeToggleTextActive,
                      ]}
                    >
                      🥩 Khách Mua Hàng (Xem giá & nợ)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.typeToggleBtn, type === 'supplier' && styles.typeToggleBtnActive]}
                    onPress={() => setType('supplier')}
                  >
                    <Text
                      style={[
                        styles.typeToggleText,
                        type === 'supplier' && styles.typeToggleTextActive,
                      ]}
                    >
                      🚚 Nhà Cung Cấp (Xem tiền hàng)
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* CHỌN CƠ SỞ KHÁCH HÀNG (Nếu type == customer) */}
              {type === 'customer' && (
                <View style={[styles.fieldGroup, { zIndex: selectZIndex }]}>
                  <View style={styles.branchHeaderRow}>
                    <Text style={styles.label}>
                      Chọn cơ sở thuộc nhóm ({selectedCustomers.length} cơ sở đã chọn):
                    </Text>
                    {customers.length > 1 && (
                      <TouchableOpacity onPress={handleSelectAllCustomers}>
                        <Text style={styles.selectAllText}>+ Chọn tất cả ({customers.length})</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <CustomSelect
                    options={customers}
                    getOptionLabel={(c) => c.name}
                    renderSelected={() => '➕ Bấm để thêm cơ sở vào nhóm...'}
                    onSelect={handleAddCustomer}
                    placeholder="Tìm kiếm và chọn cơ sở..."
                    zIndex={999999}
                    onOpenChange={(isOpen) => setSelectZIndex(isOpen ? 999999 : 1)}
                  />

                  {/* Danh sách chip các cơ sở đã chọn */}
                  {selectedCustomers.length > 0 && (
                    <View style={styles.selectedTagsWrap}>
                      {selectedCustomers.map((c) => (
                        <View key={c.id} style={styles.customerChip}>
                          <Text style={styles.customerChipText}>{c.name}</Text>
                          <TouchableOpacity
                            style={styles.removeChipBtn}
                            onPress={() => handleRemoveCustomer(c.id)}
                          >
                            <Text style={styles.removeChipText}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* CHỌN NHÀ CUNG CẤP (Nếu type == supplier) */}
              {type === 'supplier' && (
                <View style={[styles.fieldGroup, { zIndex: selectZIndex }]}>
                  <Text style={styles.label}>
                    Chọn nhà cung cấp <Text style={{ color: '#EF4444' }}>*</Text>:
                  </Text>
                  <CustomSelect
                    value={selectedSupplier}
                    options={suppliers}
                    getOptionLabel={(s) => s.name}
                    renderSelected={(s) => s?.name || ''}
                    onSelect={setSelectedSupplier}
                    placeholder="Chọn nhà cung cấp..."
                    zIndex={999999}
                    onOpenChange={(isOpen) => setSelectZIndex(isOpen ? 999999 : 1)}
                  />
                </View>
              )}

              {/* MÃ PIN BẢO MẬT NHÓM */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Mã PIN bảo mật nhóm (Tùy chọn - để trống nếu không cần):</Text>
                <TextInput
                  style={[styles.input, { width: 140, letterSpacing: 4, fontWeight: 'bold' }]}
                  placeholder="Ví dụ: 1234"
                  value={pin}
                  onChangeText={setPin}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <Text style={styles.pinTipText}>
                  💡 Khách chỉ cần nhập PIN 1 lần trên điện thoại, hệ thống sẽ tự động ghi nhớ 30 ngày.
                </Text>
              </View>

              {/* GHI CHÚ */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Ghi chú nội bộ:</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ví dụ: Link gửi riêng cho kế toán chuỗi..."
                  value={note}
                  onChangeText={setNote}
                />
              </View>

              {/* NÚT LƯU */}
              <View style={styles.formActions}>
                <TouchableOpacity
                  style={styles.cancelFormBtn}
                  onPress={() => setIsEditing(false)}
                  disabled={formLoading}
                >
                  <Text style={styles.cancelFormText}>Hủy</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.saveFormBtn}
                  onPress={handleSaveLink}
                  disabled={formLoading}
                >
                  {formLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.saveFormText}>
                      {editingLinkId ? 'Cập Nhật Link' : 'Tạo & Lấy Link Ghim'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            /* DANH SÁCH CÁC LINK GHIM ZALO HIỆN CÓ */
            <ScrollView
              style={styles.listContainer}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
            >
              {loading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator size="large" color="#10B981" />
                  <Text style={styles.loadingText}>Đang tải danh sách link...</Text>
                </View>
              ) : links.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyIcon}>🔗</Text>
                  <Text style={styles.emptyTitle}>Chưa có Link Ghim Zalo nào</Text>
                  <Text style={styles.emptyDesc}>
                    Bấm nút "+ Tạo Link Nhóm Mới" phía trên để tạo link ghim vào nhóm Zalo đối soát nợ & giá thịt.
                  </Text>
                </View>
              ) : (
                links.map((link) => {
                  const isChainLink = link.customers && link.customers.length > 1;

                  return (
                    <View key={link.id} style={[styles.linkCard, !link.isActive && styles.linkCardInactive]}>
                      {/* HEADER CARD */}
                      <View style={styles.cardHeader}>
                        <View style={{ flex: 1 }}>
                          <View style={styles.cardTitleRow}>
                            <Text style={styles.cardGroupName}>{link.name}</Text>
                            <View
                              style={[
                                styles.typeBadge,
                                link.type === 'supplier'
                                  ? { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }
                                  : { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.typeBadgeText,
                                  link.type === 'supplier' ? { color: '#1D4ED8' } : { color: '#065F46' },
                                ]}
                              >
                                {link.type === 'supplier' ? 'Nhà cung cấp' : 'Khách mua hàng'}
                              </Text>
                            </View>
                          </View>

                          {/* Chi tiết cơ sở liên kết */}
                          {link.type === 'customer' && (
                            <Text style={styles.cardBranchesText}>
                              📍 {isChainLink ? `Chuỗi ${link.customers.length} cơ sở: ` : 'Cơ sở: '}
                              <Text style={{ fontWeight: 'bold' }}>
                                {link.customers.map((c) => c.name).join(', ')}
                              </Text>
                            </Text>
                          )}

                          {link.type === 'supplier' && link.supplier && (
                            <Text style={styles.cardBranchesText}>
                              🚚 NCC: <Text style={{ fontWeight: 'bold' }}>{link.supplier.name}</Text>
                            </Text>
                          )}
                        </View>

                        {/* Công tắc Bật/Tắt */}
                        <View style={styles.switchWrap}>
                          <Switch
                            value={link.isActive}
                            onValueChange={() => handleToggleActive(link)}
                            trackColor={{ false: '#D1D5DB', true: '#A7F3D0' }}
                            thumbColor={link.isActive ? '#10B981' : '#9CA3AF'}
                          />
                          <Text style={[styles.switchLabel, !link.isActive && { color: '#9CA3AF' }]}>
                            {link.isActive ? 'Đang bật' : 'Đã khóa'}
                          </Text>
                        </View>
                      </View>

                      {/* BADGES & STATS */}
                      <View style={styles.cardMetaRow}>
                        <View style={styles.metaChip}>
                          <Text style={styles.metaChipText}>
                            {link.pin ? `🔒 PIN: ${link.pin}` : '🔓 Không có PIN'}
                          </Text>
                        </View>

                        <View style={styles.metaChip}>
                          <Text style={styles.metaChipText}>👁️ {link.viewCount || 0} lượt xem</Text>
                        </View>

                        {link.pendingFeedbacksCount > 0 && (
                          <TouchableOpacity
                            style={[styles.metaChip, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}
                            onPress={() => feedbackModalRef.current?.open('pending')}
                          >
                            <Text style={[styles.metaChipText, { color: '#DC2626', fontWeight: 'bold' }]}>
                              ⚠️ {link.pendingFeedbacksCount} phản hồi mới
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* FOOTER ACTIONS */}
                      <View style={styles.cardActionsRow}>
                        <TouchableOpacity
                          style={styles.copyBtn}
                          onPress={() => handleCopyLink(link)}
                        >
                          <Text style={styles.copyBtnText}>📋 Copy Link Ghim Zalo</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.editBtn}
                          onPress={() => handleOpenEditForm(link)}
                        >
                          <Text style={styles.editBtnText}>✏️ Sửa</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.regenerateBtn}
                          onPress={() => handleRegenerateToken(link)}
                          title="Đổi mã link mới (Thu hồi link cũ)"
                        >
                          <Text style={styles.regenerateBtnText}>🔄 Đổi link</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={() => handleDeleteLink(link)}
                        >
                          <Text style={styles.deleteBtnText}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          )}
        </View>
      </SmoothModal>

      {/* MODAL XEM PHẢN HỒI / KHIẾU NẠI */}
      <PortalFeedbackAdminModal ref={feedbackModalRef} />

      {/* POPUP THÔNG BÁO / XÁC NHẬN CHUẨN */}
      <PopupModal ref={popupRef} />
    </>
  );
});

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    width: '100%',
    maxWidth: 680,
    height: '85%',
    maxHeight: '94%',
    minHeight: 520,
    alignSelf: 'center',
    flexDirection: 'column',
    ...SHADOWS.large,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    fontSize: 20,
  },
  modalHeaderTitleCol: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  modalSubTitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  closeHeaderBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  closeHeaderBtnText: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: 'bold',
  },
  topActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  createBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  createBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  feedbackListBtn: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  feedbackListBtnText: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '600',
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
  },
  backBtnText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
  },

  // ─── LIST CONTAINER ───
  listContainer: {
    flex: 1,
  },
  loadingWrap: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#6B7280',
  },
  emptyWrap: {
    padding: 40,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },

  // ─── LINK CARD ───
  linkCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  linkCardInactive: {
    backgroundColor: '#F9FAFB',
    borderColor: '#D1D5DB',
    opacity: 0.7,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  cardGroupName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111827',
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  cardBranchesText: {
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 16,
    marginTop: 2,
  },
  switchWrap: {
    alignItems: 'center',
    marginLeft: 8,
  },
  switchLabel: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '600',
    marginTop: 2,
  },
  cardMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 8,
  },
  metaChip: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  metaChipText: {
    fontSize: 11,
    color: '#4B5563',
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 8,
  },
  copyBtn: {
    backgroundColor: '#065F46',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 6,
    flex: 1,
    alignItems: 'center',
  },
  copyBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  editBtn: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  editBtnText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
  },
  regenerateBtn: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  regenerateBtnText: {
    fontSize: 12,
    color: '#B45309',
    fontWeight: '600',
  },
  deleteBtn: {
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },
  deleteBtnText: {
    fontSize: 12,
  },

  // ─── FORM STYLES ───
  formContent: {
    paddingBottom: 20,
  },
  formHeaderTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 14,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    backgroundColor: '#F9FAFB',
    color: '#1F2937',
  },
  typeToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeToggleBtn: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  typeToggleBtnActive: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  typeToggleText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '600',
  },
  typeToggleTextActive: {
    color: '#065F46',
    fontWeight: 'bold',
  },
  branchHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  selectAllText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
  },
  selectedTagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  customerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 6,
  },
  customerChipText: {
    fontSize: 12,
    color: '#1E40AF',
    fontWeight: '500',
  },
  removeChipBtn: {
    padding: 2,
  },
  removeChipText: {
    fontSize: 11,
    color: '#EF4444',
    fontWeight: 'bold',
  },
  pinTipText: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 4,
    fontStyle: 'italic',
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  cancelFormBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
  },
  cancelFormText: {
    color: '#4B5563',
    fontSize: 13,
    fontWeight: '600',
  },
  saveFormBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#10B981',
  },
  saveFormText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
});

export default PortalManagementModal;
