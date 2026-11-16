// meat-management-fe/src/components/AiAliasManagerModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import SmoothModal from './SmoothModal';
import PopupModal from './PopupModal';
import CustomSelect from './CustomSelect';
import { api } from '../api/client';
import { showGlobalToast } from '../store/toastStore';

/**
 * Modal quản lý Từ điển AI tự học (Khách hàng & Món thịt)
 * Cho phép chủ buôn xem, chủ động thêm mới (dạy AI) và xóa các từ khóa viết tắt.
 */
const AiAliasManagerModal = forwardRef(({ customers = [], products = [] }, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('customer'); // 'customer' | 'product'
  const [searchText, setSearchText] = useState('');
  const [newAliasText, setNewAliasText] = useState('');
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [selectOpen, setSelectOpen] = useState(false);
  const [customerAliases, setCustomerAliases] = useState([]);
  const [productAliases, setProductAliases] = useState([]);
  const [deletingId, setDeletingId] = useState(null);

  const popupRef = useRef(null);

  // Tải danh sách từ điển AI từ Backend
  const fetchAliases = async () => {
    setLoading(true);
    try {
      const res = await api.get('/staff-submissions/ai-aliases');
      if (res?.data?.success) {
        setCustomerAliases(res.data.data?.customerAliases || []);
        setProductAliases(res.data.data?.productAliases || []);
      }
    } catch (err) {
      showGlobalToast('Không thể tải từ điển AI.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true);
      setSearchText('');
      setNewAliasText('');
      setSelectedTarget(null);
      fetchAliases();
    },
    close: () => setVisible(false),
  }));

  const handleClose = () => {
    setVisible(false);
  };

  // Đổi tab thì reset lựa chọn thêm mới để tránh nhầm loại
  const handleSwitchTab = (tab) => {
    setActiveTab(tab);
    setSelectedTarget(null);
  };

  // Danh sách đối tượng chuẩn cho CustomSelect
  const targetOptions = useMemo(() => {
    return activeTab === 'customer' ? (customers || []) : (products || []);
  }, [activeTab, customers, products]);

  // Chủ động lưu từ khóa mới để dạy AI
  const handleCreateAlias = async () => {
    const trimmed = newAliasText.trim();
    if (!trimmed) {
      showGlobalToast('Vui lòng nhập chữ viết tay / viết tắt cần dạy AI.', 'warning');
      return;
    }
    if (!selectedTarget?.id) {
      showGlobalToast(
        activeTab === 'customer' ? 'Vui lòng chọn khách hàng chuẩn.' : 'Vui lòng chọn món thịt chuẩn.',
        'warning'
      );
      return;
    }

    setSaving(true);
    try {
      const res = await api.post('/staff-submissions/ai-aliases', {
        type: activeTab,
        rawAlias: trimmed,
        targetId: selectedTarget.id,
      });
      if (res?.data?.success && res.data.data) {
        const created = res.data.data;
        if (activeTab === 'customer') {
          setCustomerAliases((prev) => [created, ...prev.filter((a) => a.id !== created.id)]);
        } else {
          setProductAliases((prev) => [created, ...prev.filter((a) => a.id !== created.id)]);
        }
        setNewAliasText('');
        setSelectedTarget(null);
        showGlobalToast('Đã dạy AI từ khóa mới thành công!', 'success');
      }
    } catch (err) {
      showGlobalToast(err?.response?.data?.message || 'Không thể lưu từ khóa dạy AI.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Lọc danh sách theo tab và ô tìm kiếm
  const filteredList = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const source = activeTab === 'customer' ? customerAliases : productAliases;
    if (!q) return source;
    return source.filter((item) => {
      const targetName = activeTab === 'customer' ? (item.customer?.name || '') : (item.product?.name || '');
      return (
        (item.rawAlias || '').toLowerCase().includes(q) ||
        targetName.toLowerCase().includes(q)
      );
    });
  }, [activeTab, customerAliases, productAliases, searchText]);

  // Xác nhận xóa từ khóa học nhầm
  const handleDelete = (item) => {
    const targetName = activeTab === 'customer' ? item.customer?.name : item.product?.name;
    popupRef.current?.show({
      type: 'confirm',
      title: 'Xóa khỏi từ điển AI',
      message: `Xóa từ khóa "${item.rawAlias}" → "${targetName || ''}"? Các lần quét sau AI sẽ không tự gán theo từ này nữa.`,
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      onConfirm: async () => {
        setDeletingId(item.id);
        try {
          await api.delete(`/staff-submissions/ai-aliases/${activeTab}/${item.id}`);
          if (activeTab === 'customer') {
            setCustomerAliases((prev) => prev.filter((a) => a.id !== item.id));
          } else {
            setProductAliases((prev) => prev.filter((a) => a.id !== item.id));
          }
          showGlobalToast('Đã xóa từ khóa khỏi từ điển AI.', 'success');
        } catch (err) {
          showGlobalToast(err?.response?.data?.message || 'Lỗi khi xóa từ khóa AI.', 'error');
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  return (
    <>
      <SmoothModal visible={visible} onClose={handleClose} zIndex={9999992}>
        <View style={styles.modalView}>
          {/* Header chuẩn Bottom-Sheet */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>📚 TỪ ĐIỂN AI TỰ HỌC</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Tab chuyển đổi Khách hàng / Món thịt */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'customer' && styles.tabBtnActive]}
              onPress={() => handleSwitchTab('customer')}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, activeTab === 'customer' && styles.tabTextActive]}>
                👤 Khách hàng ({customerAliases.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'product' && styles.tabBtnActive]}
              onPress={() => handleSwitchTab('product')}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, activeTab === 'product' && styles.tabTextActive]}>
                🥩 Món thịt ({productAliases.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Khối chủ động thêm từ khóa dạy AI */}
          <View style={[styles.addCard, selectOpen && styles.addCardActive]}>
            <Text style={styles.addTitle}>➕ Chủ động dạy AI từ khóa mới</Text>
            <View style={styles.addInputsRow}>
              <View style={styles.aliasInputWrap}>
                <TextInput
                  style={styles.aliasInput}
                  value={newAliasText}
                  onChangeText={setNewAliasText}
                  placeholder={activeTab === 'customer' ? 'Chữ viết tay (VD: Xã Pan)...' : 'Viết tắt (VD: g.cộc)...'}
                  placeholderTextColor="#94A3B8"
                />
              </View>
              <View style={[styles.selectWrap, selectOpen && styles.selectWrapActive]}>
                <CustomSelect
                  value={selectedTarget}
                  options={targetOptions}
                  placeholder={activeTab === 'customer' ? 'Chọn khách chuẩn...' : 'Chọn món chuẩn...'}
                  onSelect={(opt) => setSelectedTarget(opt)}
                  onOpenChange={setSelectOpen}
                  renderSelected={(item) => item?.name || ''}
                  compact={true}
                  zIndex={999999}
                  triggerStyle={styles.customSelectTrigger}
                  inputStyle={styles.customSelectInput}
                />
              </View>
              <TouchableOpacity
                style={[styles.addSaveBtn, saving && styles.addSaveBtnDisabled]}
                onPress={handleCreateAlias}
                disabled={saving}
                activeOpacity={0.8}
              >
                <Text style={styles.addSaveBtnText}>{saving ? '...' : 'Dạy AI'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Ô tìm kiếm nhanh */}
          <View style={styles.searchWrap}>
            <TextInput
              style={styles.searchInput}
              value={searchText}
              onChangeText={setSearchText}
              placeholder={activeTab === 'customer' ? 'Tìm chữ viết tay hoặc tên khách...' : 'Tìm chữ viết tắt hoặc tên thịt...'}
              placeholderTextColor="#94A3B8"
            />
          </View>

          {/* Bảng danh sách từ điển */}
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { width: 32 }]}>#</Text>
            <Text style={[styles.th, { flex: 1 }]}>Chữ AI đọc</Text>
            <Text style={[styles.th, { flex: 1.2 }]}>{activeTab === 'customer' ? 'Khách chuẩn' : 'Món chuẩn'}</Text>
            <Text style={[styles.th, { width: 42, textAlign: 'center' }]}>Lần</Text>
            <Text style={[styles.th, { width: 52, textAlign: 'right' }]}>Xóa</Text>
          </View>

          <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={styles.emptyBox}>
                <ActivityIndicator size="small" color="#059669" />
                <Text style={styles.emptyText}>Đang tải từ điển AI...</Text>
              </View>
            ) : filteredList.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>Chưa có từ khóa nào trong mục này.</Text>
              </View>
            ) : (
              filteredList.map((item, idx) => {
                const targetName = activeTab === 'customer' ? (item.customer?.name || '---') : (item.product?.name || '---');
                return (
                  <View key={item.id} style={[styles.row, idx % 2 === 1 && styles.rowAlt]}>
                    <Text style={[styles.cell, { width: 32, color: '#64748B' }]}>{idx + 1}</Text>
                    <Text style={[styles.cell, { flex: 1, fontWeight: '600', color: '#0F172A' }]} numberOfLines={2}>
                      {item.rawAlias}
                    </Text>
                    <Text style={[styles.cell, { flex: 1.2, color: '#047857', fontWeight: '600' }]} numberOfLines={2}>
                      {targetName}
                    </Text>
                    <Text style={[styles.cell, { width: 42, textAlign: 'center', color: '#475569' }]}>
                      {item.usageCount || 1}
                    </Text>
                    <View style={{ width: 52, alignItems: 'flex-end' }}>
                      <TouchableOpacity
                        style={styles.delBtn}
                        onPress={() => handleDelete(item)}
                        disabled={deletingId === item.id}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.delBtnText}>{deletingId === item.id ? '...' : '🗑️'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Footer neo đáy */}
          <TouchableOpacity style={styles.footerCloseBtn} onPress={handleClose} activeOpacity={0.8}>
            <Text style={styles.footerCloseBtnText}>ĐÓNG LẠI</Text>
          </TouchableOpacity>
        </View>
      </SmoothModal>

      {/* PopupModal xác nhận xóa độc lập ở tầng cao nhất */}
      <PopupModal ref={popupRef} zIndex={9999999} />
    </>
  );
});

export default AiAliasManagerModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
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
    color: '#475569',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#047857',
  },
  addCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 8,
    marginBottom: 10,
    zIndex: 10,
  },
  addCardActive: {
    zIndex: 999999,
    elevation: 999999,
  },
  addTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 6,
  },
  addInputsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aliasInputWrap: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  aliasInput: {
    fontSize: 12.5,
    color: '#0F172A',
    borderWidth: 0,
    borderColor: 'transparent',
    outlineStyle: 'none',
    outlineWidth: 0,
    boxShadow: 'none',
  },
  selectWrap: {
    flex: 1.15,
  },
  selectWrapActive: {
    zIndex: 999999,
    elevation: 999999,
  },
  customSelectTrigger: {
    borderWidth: 0,
    borderColor: 'transparent',
    outlineStyle: 'none',
    outlineWidth: 0,
    boxShadow: 'none',
    backgroundColor: '#FFFFFF',
  },
  customSelectInput: {
    borderWidth: 0,
    borderColor: 'transparent',
    outlineStyle: 'none',
    outlineWidth: 0,
    boxShadow: 'none',
  },
  addSaveBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSaveBtnDisabled: {
    opacity: 0.6,
  },
  addSaveBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  searchWrap: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  searchInput: {
    fontSize: 13,
    color: '#0F172A',
    borderWidth: 0,
    borderColor: 'transparent',
    outlineStyle: 'none',
    outlineWidth: 0,
    boxShadow: 'none',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: '#F1F5F9',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  th: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  bodyScroll: {
    maxHeight: 330,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#E2E8F0',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 6,
  },
  rowAlt: {
    backgroundColor: '#F8FAFC',
  },
  cell: {
    fontSize: 12.5,
  },
  delBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  delBtnText: {
    fontSize: 12,
  },
  emptyBox: {
    paddingVertical: 28,
    alignItems: 'center',
    gap: 6,
  },
  emptyText: {
    fontSize: 13,
    color: '#64748B',
  },
  footerCloseBtn: {
    height: 46,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerCloseBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#334155',
  },
});
