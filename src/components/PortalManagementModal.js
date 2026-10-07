import React, { useState, forwardRef, useImperativeHandle, useEffect, useRef, useMemo } from 'react';
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
import { removeDiacritics } from '../utils/searchHelper';
import ZaloIcon from './ZaloIcon';

const formatDateTime = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${min} ${dd}/${mm}/${yyyy}`;
};

// Định dạng thời gian truy cập gần nhất kèm khoảng thời gian tương đối
const formatLastViewedText = (isoStr) => {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return null;

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const timeStr = `${hh}:${min} ${dd}/${mm}/${yyyy}`;

  let relative = '';
  if (diffMins < 1) {
    relative = 'vừa xong';
  } else if (diffMins < 60) {
    relative = `${diffMins} phút trước`;
  } else if (diffHours < 24) {
    relative = `${diffHours} giờ trước`;
  } else if (diffDays === 1) {
    relative = 'hôm qua';
  } else if (diffDays < 30) {
    relative = `${diffDays} ngày trước`;
  }

  return relative ? `${timeStr} (${relative})` : timeStr;
};

const PortalManagementModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  // State tìm kiếm & bộ lọc
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'customer' | 'supplier' | 'active'
  const [copiedLinkId, setCopiedLinkId] = useState(null);

  // Ref popup thông báo / xác nhận dùng chung
  const popupRef = useRef(null);

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
        setCopiedLinkId(link.id);
        setTimeout(() => setCopiedLinkId(null), 2500);
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

  const [publishing, setPublishing] = useState(false);

  // Công bố số liệu mới cho TẤT CẢ các link nhóm Zalo
  const handlePublishAll = () => {
    popupRef.current?.show({
      title: 'Công Bố Số Liệu Mới Toàn Bộ',
      message: 'Hệ thống sẽ công bố số liệu đơn hàng & công nợ mới nhất hiện tại cho TẤT CẢ các nhóm Zalo. Khách hàng trên toàn hệ thống sẽ xem được ngay số liệu mới. Bạn có chắc muốn tiếp tục?',
      type: 'confirm',
      confirmText: 'Công bố ngay',
      cancelText: 'Hủy',
      onConfirm: async () => {
        try {
          setPublishing(true);
          const res = await api.post('/portal/manage/links/publish-all');
          showGlobalToast(res.data?.message || 'Đã công bố số liệu mới cho toàn bộ các nhóm Zalo!', 'success');
          fetchLinks();
        } catch (err) {
          showGlobalToast(err.response?.data?.message || 'Không thể công bố số liệu.', 'error');
        } finally {
          setPublishing(false);
        }
      },
    });
  };

  // Công bố số liệu mới cho 1 link cụ thể
  const handlePublishSingle = async (link) => {
    try {
      const res = await api.post(`/portal/manage/links/${link.id}/publish`);
      showGlobalToast(`Đã công bố số liệu mới cho nhóm "${link.name}"! Khách hàng có thể xem ngay.`, 'success');
      const publishedAt = res.data?.data?.lastPublishedAt || new Date().toISOString();
      setLinks((prev) =>
        prev.map((l) =>
          l.id === link.id
            ? { ...l, lastPublishedAt: publishedAt, unpublishedCount: 0 }
            : l
        )
      );
    } catch (err) {
      showGlobalToast(err.response?.data?.message || 'Không thể công bố số liệu.', 'error');
    }
  };

  // Tổng số đơn nợ mới chưa công bố trên toàn hệ thống
  const totalUnpublishedTxs = links.reduce(
    (sum, l) => sum + (l.unpublishedCount || 0),
    0
  );

  // Lọc danh sách nhóm Zalo theo từ khóa tìm kiếm và tab phân loại
  const filteredLinks = useMemo(() => {
    let result = links;

    // Lọc theo tab loại đối tác hoặc trạng thái
    if (filterType === 'customer') {
      result = result.filter((l) => l.type === 'customer');
    } else if (filterType === 'supplier') {
      result = result.filter((l) => l.type === 'supplier');
    } else if (filterType === 'active') {
      result = result.filter((l) => l.isActive);
    }

    // Lọc theo từ khóa tìm kiếm không dấu
    if (searchQuery.trim()) {
      const qClean = removeDiacritics(searchQuery.toLowerCase().trim());
      result = result.filter((l) => {
        const nameClean = removeDiacritics((l.name || '').toLowerCase());
        const noteClean = removeDiacritics((l.note || '').toLowerCase());
        const supClean = l.supplier ? removeDiacritics((l.supplier.name || '').toLowerCase()) : '';
        const custsClean = (l.customers || []).map((c) => removeDiacritics((c.name || '').toLowerCase())).join(' ');

        return (
          nameClean.includes(qClean) ||
          noteClean.includes(qClean) ||
          supClean.includes(qClean) ||
          custsClean.includes(qClean)
        );
      });
    }

    return result;
  }, [links, filterType, searchQuery]);

  // Thống kê số lượng nhóm theo từng tab
  const counts = useMemo(() => {
    return {
      all: links.length,
      customer: links.filter((l) => l.type === 'customer').length,
      supplier: links.filter((l) => l.type === 'supplier').length,
      active: links.filter((l) => l.isActive).length,
    };
  }, [links]);

  return (
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)}>
        <View style={styles.modalView}>
          {/* HEADER MODAL CHUẨN CÓ NÚT ĐÓNG ✕ */}
          <View style={styles.modalHeaderRow}>
            <View style={styles.modalHeaderLeft}>
              <View style={styles.headerIconCircle}>
                <ZaloIcon size={24} />
              </View>
              <View style={styles.modalHeaderTitleCol}>
                <View style={styles.headerTitleBadgeRow}>
                  <Text style={styles.modalTitle}>QUẢN LÝ NHÓM ZALO</Text>
                  <View style={styles.totalBadge}>
                    <Text style={styles.totalBadgeText}>{links.length} nhóm</Text>
                  </View>
                </View>
                <Text style={styles.modalSubTitle}>
                  Tra cứu công nợ & giá thịt ghim Zalo • ⏰ Tự động công bố 20:00 hàng ngày
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

          {/* THANH ĐIỀU HƯỚNG, TÌM KIẾM & BỘ LỌC TRÊN CÙNG */}
          {!isEditing ? (
            <View style={styles.topControlSection}>
              {/* Hàng 1: Nút tạo link mới & Nút công bố */}
              <View style={styles.topActionsRow}>
                <TouchableOpacity
                  style={styles.createBtn}
                  onPress={handleOpenCreateForm}
                  activeOpacity={0.85}
                >
                  <Text style={styles.createBtnIcon}>＋</Text>
                  <Text style={styles.createBtnText}>Tạo Link Nhóm</Text>
                </TouchableOpacity>

                {props.onOpenDeliveryRequests && (
                  <TouchableOpacity
                    style={styles.deliveryRequestsBtn}
                    onPress={() => {
                      setVisible(false);
                      props.onOpenDeliveryRequests();
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.deliveryRequestsBtnIcon}>📋</Text>
                    <Text style={styles.deliveryRequestsBtnText}>Quản Lý Báo Hàng</Text>
                  </TouchableOpacity>
                )}

                {totalUnpublishedTxs > 0 && (
                  <TouchableOpacity
                    style={[styles.publishAllBtn, styles.publishAllBtnActive]}
                    onPress={handlePublishAll}
                    disabled={publishing}
                    activeOpacity={0.85}
                  >
                    {publishing ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Text style={styles.publishAllBtnIcon}>📢</Text>
                        <Text style={styles.publishAllBtnText}>
                          Công Bố Tất Cả ({totalUnpublishedTxs} đơn mới)
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {/* Hàng 2: Thanh tìm kiếm thông minh */}
              <View style={styles.searchBarWrapper}>
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Tìm kiếm theo tên nhóm Zalo, cơ sở, khách hàng..."
                  placeholderTextColor="#94A3B8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  returnKeyType="search"
                />
                {searchQuery.trim() ? (
                  <TouchableOpacity
                    style={styles.clearSearchBtn}
                    onPress={() => setSearchQuery('')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.clearSearchText}>✕</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Hàng 3: Tabs phân loại đối tác & trạng thái */}
              <View style={styles.filterTabsRow}>
                <TouchableOpacity
                  style={[styles.filterTab, filterType === 'all' && styles.filterTabActive]}
                  onPress={() => setFilterType('all')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterTabText, filterType === 'all' && styles.filterTabTextActive]}>
                    Tất cả ({counts.all})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterTab, filterType === 'customer' && styles.filterTabActive]}
                  onPress={() => setFilterType('customer')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterTabText, filterType === 'customer' && styles.filterTabTextActive]}>
                    🥩 Khách mua ({counts.customer})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterTab, filterType === 'supplier' && styles.filterTabActive]}
                  onPress={() => setFilterType('supplier')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterTabText, filterType === 'supplier' && styles.filterTabTextActive]}>
                    🚚 NCC ({counts.supplier})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterTab, filterType === 'active' && styles.filterTabActive]}
                  onPress={() => setFilterType('active')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterTabText, filterType === 'active' && styles.filterTabTextActive]}>
                    ⚡ Đang bật ({counts.active})
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.topControlSection}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => setIsEditing(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.backBtnText}>⬅ Quay lại danh sách</Text>
              </TouchableOpacity>
            </View>
          )}

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
              contentContainerStyle={{ paddingBottom: 24 }}
            >
              {loading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator size="large" color="#059669" />
                  <Text style={styles.loadingText}>Đang tải danh sách link ghim Zalo...</Text>
                </View>
              ) : filteredLinks.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyIcon}>
                    {searchQuery.trim() ? '🔍' : '🔗'}
                  </Text>
                  <Text style={styles.emptyTitle}>
                    {searchQuery.trim()
                      ? 'Không tìm thấy nhóm Zalo phù hợp'
                      : 'Chưa có Link Ghim Zalo nào'}
                  </Text>
                  <Text style={styles.emptyDesc}>
                    {searchQuery.trim()
                      ? `Không có kết quả nào khớp với từ khóa "${searchQuery}". Hãy thử tìm kiếm bằng từ khóa khác hoặc xóa bộ lọc.`
                      : 'Bấm nút "+ Tạo Link Nhóm Mới" phía trên để tạo link ghim vào nhóm Zalo đối soát nợ & giá thịt.'}
                  </Text>
                  {searchQuery.trim() ? (
                    <TouchableOpacity
                      style={styles.clearFilterActionBtn}
                      onPress={() => {
                        setSearchQuery('');
                        setFilterType('all');
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.clearFilterActionText}>Xóa bộ lọc tìm kiếm</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : (
                filteredLinks.map((link) => {
                  const isChainLink = link.customers && link.customers.length > 1;
                  const isCopied = copiedLinkId === link.id;

                  return (
                    <View
                      key={link.id}
                      style={[styles.linkCard, !link.isActive && styles.linkCardInactive]}
                    >
                      {/* HEADER CARD */}
                      <View style={styles.cardHeader}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <View style={styles.cardTitleRow}>
                            <Text style={styles.cardGroupName} numberOfLines={1}>
                              {link.name}
                            </Text>
                            <View
                              style={[
                                styles.typeBadge,
                                link.type === 'supplier'
                                  ? styles.typeBadgeSupplier
                                  : styles.typeBadgeCustomer,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.typeBadgeText,
                                  link.type === 'supplier'
                                    ? styles.typeBadgeTextSupplier
                                    : styles.typeBadgeTextCustomer,
                                ]}
                              >
                                {link.type === 'supplier' ? '🚚 Nhà cung cấp' : '🥩 Khách mua hàng'}
                              </Text>
                            </View>
                          </View>

                          {/* Chi tiết cơ sở liên kết */}
                          {link.type === 'customer' && (
                            <View style={styles.cardBranchesBox}>
                              <Text style={styles.cardBranchesIcon}>📍</Text>
                              <Text style={styles.cardBranchesText} numberOfLines={2}>
                                {isChainLink ? `Chuỗi ${link.customers.length} cơ sở: ` : 'Cơ sở: '}
                                <Text style={styles.branchNameBold}>
                                  {link.customers.map((c) => c.name).join(', ')}
                                </Text>
                              </Text>
                            </View>
                          )}

                          {link.type === 'supplier' && link.supplier && (
                            <View style={styles.cardBranchesBox}>
                              <Text style={styles.cardBranchesIcon}>🚚</Text>
                              <Text style={styles.cardBranchesText} numberOfLines={2}>
                                NCC: <Text style={styles.branchNameBold}>{link.supplier.name}</Text>
                              </Text>
                            </View>
                          )}
                        </View>

                        {/* Switch Bật / Tắt trạng thái */}
                        <View style={styles.switchWrap}>
                          <Switch
                            value={link.isActive}
                            onValueChange={() => handleToggleActive(link)}
                            trackColor={{ false: '#E2E8F0', true: '#BBF7D0' }}
                            thumbColor={link.isActive ? '#10B981' : '#94A3B8'}
                          />
                          <View style={styles.statusIndicatorRow}>
                            <View
                              style={[
                                styles.statusDot,
                                { backgroundColor: link.isActive ? '#10B981' : '#94A3B8' },
                              ]}
                            />
                            <Text
                              style={[
                                styles.switchLabel,
                                { color: link.isActive ? '#047857' : '#94A3B8' },
                              ]}
                            >
                              {link.isActive ? 'Đang bật' : 'Đã khóa'}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* BADGES & STATS */}
                      <View style={styles.cardMetaRow}>
                        <View style={[styles.metaChip, link.pin && styles.metaChipPinActive]}>
                          <Text style={[styles.metaChipText, link.pin && styles.metaChipPinText]}>
                            {link.pin ? `🔒 PIN: ${link.pin}` : '🔓 Không có PIN'}
                          </Text>
                        </View>

                        <View style={styles.metaChip}>
                          <Text style={styles.metaChipText}>👁️ {link.viewCount || 0} lượt xem</Text>
                        </View>

                        <View
                          style={[
                            styles.metaChip,
                            link.lastViewedAt ? styles.metaChipRecentView : styles.metaChipNoView,
                          ]}
                        >
                          <Text
                            style={[
                              styles.metaChipText,
                              link.lastViewedAt ? styles.metaChipRecentText : styles.metaChipMutedText,
                            ]}
                          >
                            ⏱️ {link.lastViewedAt ? `Xem gần nhất: ${formatLastViewedText(link.lastViewedAt)}` : 'Chưa có lượt truy cập'}
                          </Text>
                        </View>
                      </View>

                      {/* TRẠNG THÁI CÔNG BỐ SỐ LIỆU CHO KHÁCH */}
                      {link.unpublishedCount > 0 ? (
                        <View style={styles.unpublishedAlertBox}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.unpublishedAlertTitle}>
                              ⚠️ Có {link.unpublishedCount} đơn mới chưa công bố
                            </Text>
                            <Text style={styles.unpublishedAlertSub}>
                              Khách đang xem mốc: {link.lastPublishedAt ? formatDateTime(link.lastPublishedAt) : 'Chưa công bố'}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.publishNowCardBtn}
                            onPress={() => handlePublishSingle(link)}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.publishNowCardBtnText}>📢 Công bố ngay</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.publishedGoodLine}>
                          <Text style={styles.publishedGoodText}>
                            🕒 Đã công bố: {link.lastPublishedAt ? formatDateTime(link.lastPublishedAt) : 'Chưa công bố'} • <Text style={{ color: '#059669', fontWeight: '600' }}>✓ Mới nhất</Text>
                          </Text>
                        </View>
                      )}

                      {/* HỘP LINK GHIM ZALO HIỆN ĐẠI & HÀNH ĐỘNG */}
                      <View style={styles.zaloLinkContainer}>
                        <View style={styles.zaloUrlRow}>
                          <View style={styles.zaloUrlPrefix}>
                            <Text style={styles.zaloUrlIcon}>🔗</Text>
                            <Text style={styles.zaloUrlText} numberOfLines={1}>
                              portal/{link.token}
                            </Text>
                          </View>

                          <TouchableOpacity
                            style={[styles.copyBtnPill, isCopied && styles.copyBtnPillSuccess]}
                            onPress={() => handleCopyLink(link)}
                            activeOpacity={0.85}
                          >
                            <Text style={[styles.copyBtnPillText, isCopied && styles.copyBtnPillTextSuccess]}>
                              {isCopied ? '✓ Đã sao chép link' : '📋 Copy Link Ghim Zalo'}
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {/* CÁC THAO TÁC PHỤ: SỬA, ĐỔI MÃ LINK, XÓA */}
                        <View style={styles.cardSecondaryActionsRow}>
                          <TouchableOpacity
                            style={styles.editBtn}
                            onPress={() => handleOpenEditForm(link)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.editBtnText}>✏️ Chỉnh sửa</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.regenerateBtn}
                            onPress={() => handleRegenerateToken(link)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.regenerateBtnText}>🔄 Đổi link</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.deleteBtn}
                            onPress={() => handleDeleteLink(link)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.deleteBtnText}>🗑️ Xóa</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          )}
        </View>
      </SmoothModal>

      {/* POPUP THÔNG BÁO / XÁC NHẬN CHUẨN */}
      <PopupModal ref={popupRef} />
    </>
  );
});

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    width: '100%',
    maxWidth: 720,
    height: '90%',
    maxHeight: '94%',
    minHeight: 540,
    alignSelf: 'center',
    flexDirection: 'column',
    ...SHADOWS.large,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    marginBottom: 10,
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
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  headerIcon: {
    fontSize: 20,
  },
  modalHeaderTitleCol: {
    flex: 1,
  },
  headerTitleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  totalBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  totalBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  modalSubTitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
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
    fontSize: 14,
    color: '#64748B',
    fontWeight: 'bold',
  },

  // ─── CONTROL SECTION: ACTIONS + SEARCH + TABS ───
  topControlSection: {
    marginBottom: 12,
    gap: 10,
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  createBtn: {
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 6,
    shadowColor: '#059669',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  createBtnIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    lineHeight: 18,
  },
  createBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  deliveryRequestsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 6,
  },
  deliveryRequestsBtnIcon: {
    fontSize: 14,
  },
  deliveryRequestsBtnText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
  publishAllBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  publishAllBtnActive: {
    backgroundColor: '#1D4ED8',
  },
  publishAllBtnIcon: {
    fontSize: 13,
  },
  publishAllBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  backBtnText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },

  // ─── THANH TÌM KIẾM ───
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 6,
    opacity: 0.7,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
    outlineStyle: 'none',
    outlineWidth: 0,
  },
  clearSearchBtn: {
    padding: 4,
    borderRadius: 10,
  },
  clearSearchText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: 'bold',
  },

  // ─── TABS BỘ LỌC ───
  filterTabsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  filterTab: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterTabActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
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
    color: '#64748B',
  },
  emptyWrap: {
    padding: 32,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 42,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 420,
  },
  clearFilterActionBtn: {
    marginTop: 14,
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  clearFilterActionText: {
    fontSize: 12.5,
    color: '#4338CA',
    fontWeight: '700',
  },

  // ─── LINK CARD HIỆN ĐẠI ───
  linkCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 13,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  linkCardInactive: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    opacity: 0.72,
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
    fontSize: 15.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 20,
    borderWidth: 1,
  },
  typeBadgeCustomer: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  typeBadgeSupplier: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  typeBadgeTextCustomer: {
    color: '#047857',
  },
  typeBadgeTextSupplier: {
    color: '#1D4ED8',
  },
  cardBranchesBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  cardBranchesIcon: {
    fontSize: 12,
  },
  cardBranchesText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
    flex: 1,
  },
  branchNameBold: {
    fontWeight: '700',
    color: '#1E293B',
  },

  // Trạng thái Switch
  switchWrap: {
    alignItems: 'center',
    marginLeft: 6,
  },
  statusIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  switchLabel: {
    fontSize: 10,
    fontWeight: '600',
  },

  // ─── METADATA BADGES ───
  cardMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    marginBottom: 6,
  },
  metaChip: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  metaChipPinActive: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  metaChipPinText: {
    color: '#0284C7',
    fontWeight: '600',
  },
  metaChipRecentView: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  metaChipNoView: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  metaChipText: {
    fontSize: 11,
    color: '#475569',
  },
  metaChipRecentText: {
    color: '#15803D',
    fontWeight: '600',
  },
  metaChipMutedText: {
    color: '#94A3B8',
  },

  // Cảnh báo công bố
  unpublishedAlertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginVertical: 6,
    gap: 8,
  },
  unpublishedAlertTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#DC2626',
  },
  unpublishedAlertSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  publishNowCardBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  publishNowCardBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: 'bold',
  },
  publishedGoodLine: {
    marginVertical: 4,
    paddingHorizontal: 2,
  },
  publishedGoodText: {
    fontSize: 11,
    color: '#64748B',
  },

  // ─── HỘP LINK GHIM ZALO & ACTIONS ───
  zaloLinkContainer: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 8,
  },
  zaloUrlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 4,
    gap: 8,
  },
  zaloUrlPrefix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    overflow: 'hidden',
  },
  zaloUrlIcon: {
    fontSize: 13,
  },
  zaloUrlText: {
    fontSize: 11.5,
    color: '#475569',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    flex: 1,
  },
  copyBtnPill: {
    backgroundColor: '#059669',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyBtnPillSuccess: {
    backgroundColor: '#10B981',
  },
  copyBtnPillText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  copyBtnPillTextSuccess: {
    color: '#FFFFFF',
  },

  cardSecondaryActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editBtn: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnText: {
    fontSize: 11.5,
    color: '#334155',
    fontWeight: '600',
  },
  regenerateBtn: {
    flex: 1,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regenerateBtnText: {
    fontSize: 11.5,
    color: '#B45309',
    fontWeight: '600',
  },
  deleteBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    fontSize: 11.5,
    color: '#DC2626',
    fontWeight: '600',
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
    backgroundColor: '#059669',
  },
  saveFormText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
});

export default PortalManagementModal;
