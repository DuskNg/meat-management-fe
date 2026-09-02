// meat-management-fe/src/components/WorkspaceMemberActionsModal.js
import React, { forwardRef, useImperativeHandle, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Platform,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import { api } from '../api/client';
import PopupModal from './PopupModal';
import WorkspaceEditActionModal from './WorkspaceEditActionModal';

const { height: SCREEN_H } = Dimensions.get('window');


const WebDateInput = (props) => {
  if (Platform.OS !== 'web') return null;
  const { value, onChange, style } = props;
  return React.createElement('input', {
    type: 'date',
    value,
    onChange,
    style,
  });
};

// Modal xem, sửa, xóa nhật ký thao tác của các thành viên trong Workspace (Giao diện Sáng)
const WorkspaceMemberActionsModal = forwardRef(function WorkspaceMemberActionsModal(props, ref) {
  const [visible, setVisible] = useState(false);
  const [ownerUser, setOwnerUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actions, setActions] = useState([]);
  const [members, setMembers] = useState([]);
  const [summary, setSummary] = useState({
    totalActions: 0,
    totalDebtCreated: 0,
    totalMoneyCollected: 0,
  });

  // Bộ lọc
  const getTodayString = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getYesterdayString = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const [dateInput, setDateInput] = useState(getTodayString());
  const [selectedMemberId, setSelectedMemberId] = useState('ALL');
  const [showMemberPicker, setShowMemberPicker] = useState(false);

  const popupRef = useRef(null);
  const editModalRef = useRef(null);

  useImperativeHandle(ref, () => ({
    open: (userObj, initialMemberId = 'ALL') => {
      setOwnerUser(userObj);
      setDateInput(getTodayString());
      setSelectedMemberId(initialMemberId);
      setActions([]);
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Hàm tải dữ liệu thao tác của các thành viên từ máy chủ
  const fetchActions = async (targetDate = dateInput, memberId = selectedMemberId) => {
    if (!ownerUser) return;
    setLoading(true);
    try {
      const res = await api.get('/workspace/member-actions', {
        params: {
          date: targetDate || undefined,
          memberId: memberId !== 'ALL' ? memberId : undefined,
        },
      });

      if (res.data?.success && res.data?.data) {
        setActions(res.data.data.actions || []);
        setMembers(res.data.data.members || []);
        setSummary(res.data.data.summary || {
          totalActions: 0,
          totalDebtCreated: 0,
          totalMoneyCollected: 0,
        });
      }
    } catch (error) {
      console.error('Lỗi khi tải thao tác thành viên:', error);
      popupRef.current?.show({
        title: 'Lỗi tải dữ liệu',
        message: error.response?.data?.message || 'Không thể tải danh sách thao tác của thành viên.',
        type: 'error',
        confirmText: 'ĐÓNG',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && ownerUser) {
      fetchActions(dateInput, selectedMemberId);
    }
  }, [visible, ownerUser, dateInput, selectedMemberId]);

  // Format giờ phút
  const formatTime = (dateStr) => {
    try {
      const d = new Date(dateStr);
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    } catch {
      return '';
    }
  };

  // Màu sắc badge phân loại theo thao tác
  const getBadgeColor = (type) => {
    switch (type) {
      case 'TRANSACTION':
        return '#D97706'; // Vàng cam cho nợ thịt
      case 'PAYMENT':
        return '#059669'; // Xanh lá cho thu tiền
      case 'CUSTOMER':
        return '#7C3AED'; // Tím cho khách hàng
      case 'STORE_ORDER':
        return '#0284C7'; // Xanh biển cho gọi món
      case 'STORE_PAYMENT':
        return '#0D9488'; // Xanh ngọc cho thanh toán bàn
      case 'SHOP_SESSION':
        return '#DB2777'; // Hồng cho tính giờ
      case 'INVENTORY':
        return '#4F46E5'; // Chàm cho kho
      case 'SUPPLIER_TX':
      case 'SUPPLIER_PAYMENT':
        return '#CA8A04'; // Vàng cho NCC
      default:
        return '#64748B';
    }
  };

  // Xác định màu viền trái của thẻ thao tác (bôi xanh lá khi đã thanh toán)
  const getBorderLeftColor = (item) => {
    if (item.type === 'SHOP_SESSION' && item.rawItem?.isPaid) {
      return '#059669'; // Xanh lá cho thu tiền/đã thanh toán
    }
    return getBadgeColor(item.type);
  };

  // Tùy chỉnh hiển thị tiêu đề hoạt động bida tính giờ
  const renderActionTitle = (item) => {
    if (item?.type === 'SHOP_SESSION' && item?.rawItem) {
      const { startTime, endTime, isPaid, totalAmount, table } = item.rawItem || {};
      const tableName = table?.name || 'Bàn/Phòng';
      
      const formatTimeOnly = (dateStr) => {
        if (!dateStr) return '';
        try {
          const d = new Date(dateStr);
          if (isNaN(d.getTime())) return '';
          const hours = String(d.getHours()).padStart(2, '0');
          const minutes = String(d.getMinutes()).padStart(2, '0');
          return `${hours}:${minutes}`;
        } catch {
          return '';
        }
      };

      const startStr = startTime ? formatTimeOnly(startTime) : '';
      const endStr = endTime ? formatTimeOnly(endTime) : 'đang chơi';
      const amountStr = totalAmount ? (parseFloat(totalAmount) || 0).toLocaleString('vi-VN') + 'đ' : '';

      return (
        <Text style={styles.actionTitle}>
          {tableName}: {startStr ? `${startStr} - ${endStr}` : endStr}
          {isPaid ? (
            <Text style={{ color: '#059669', fontWeight: 'bold' }}> (Đã thanh toán {amountStr})</Text>
          ) : endTime ? (
            <Text style={{ color: '#D97706', fontWeight: 'bold' }}> (Chờ thanh toán {amountStr})</Text>
          ) : (
            <Text style={{ color: '#0284C7', fontWeight: 'bold' }}> (Đang chơi)</Text>
          )}
        </Text>
      );
    }
    
    return <Text style={styles.actionTitle}>{item?.actionTitle || ''}</Text>;
  };

  // Mở modal sửa thao tác
  const handleEditAction = (item) => {
    editModalRef.current?.open(item, () => {
      fetchActions(dateInput, selectedMemberId);
    });
  };

  // Xác nhận và xóa thao tác
  const handleDeleteAction = (item) => {
    popupRef.current?.show({
      title: '⚠️ Xác nhận xóa thao tác',
      message: `Bạn có chắc chắn muốn xóa thao tác **"${item.actionTitle}"** của nhân viên **${item.actor?.name || 'nhân viên'}**?\n\nHệ thống sẽ tự động cập nhật lại sổ sách và công nợ.`,
      type: 'confirm',
      confirmText: 'XÓA NGAY',
      cancelText: 'HỦY',
      onConfirm: async () => {
        try {
          if (item.type === 'TRANSACTION') {
            await api.delete(`/transactions/${item.id}`);
          } else if (item.type === 'PAYMENT') {
            await api.delete(`/payments/${item.id}`);
          } else if (item.type === 'CUSTOMER') {
            await api.delete(`/customers/${item.id}`);
          } else if (item.type === 'STORE_ORDER') {
            await api.delete(`/store/transactions/${item.id}`);
          } else if (item.type === 'STORE_PAYMENT') {
            await api.delete(`/payments/${item.id}`);
          } else if (item.type === 'SHOP_SESSION') {
            await api.delete(`/shop/sessions/${item.id}`);
          } else if (item.type === 'INVENTORY') {
            await api.delete(`/inventory/products/${item.id}`);
          } else if (item.type === 'SUPPLIER_TX') {
            await api.delete(`/suppliers/transactions/${item.id}`);
          } else if (item.type === 'SUPPLIER_PAYMENT') {
            await api.delete(`/suppliers/payments/${item.id}`);
          }

          popupRef.current?.show({
            title: 'Thành công',
            message: 'Đã xóa thao tác của thành viên thành công.',
            type: 'success',
            confirmText: 'ĐÓNG',
            onConfirm: () => {
              fetchActions(dateInput, selectedMemberId);
            },
          });
        } catch (err) {
          popupRef.current?.show({
            title: 'Lỗi khi xóa',
            message: err.response?.data?.message || 'Không thể xóa thao tác này.',
            type: 'error',
            confirmText: 'ĐÓNG',
          });
        }
      },
    });
  };

  const getSelectedMemberName = () => {
    if (selectedMemberId === 'ALL') return 'Tất cả thành viên';
    const found = members.find((m) => m.id === selectedMemberId);
    return found ? `${found.name} (${found.phone})` : 'Chọn thành viên';
  };


  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={() => setVisible(false)}>
          <View style={StyleSheet.absoluteFillObject} />
        </TouchableWithoutFeedback>

        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>📜 Nhật ký thao tác thành viên</Text>
              <Text style={styles.subtitle}>
                Theo dõi và quản trị mọi hành vi của nhân viên trong ngày
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setVisible(false)}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Thanh bộ lọc đa năng */}
          <View style={styles.filterRow}>
            {/* 1. Chọn ngày */}
            <View style={[styles.inputContainer, { flex: 1.2 }]}>
              <Text style={styles.filterLabel}>📅 Chọn ngày:</Text>
              {Platform.OS === 'web' ? (
                <WebDateInput
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#CBD5E1',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    color: '#0F172A',
                    fontSize: '13px',
                    outline: 'none',
                    width: '100%',
                    height: '36px',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
              ) : (
                <TextInput
                  style={styles.dateInput}
                  value={dateInput}
                  onChangeText={setDateInput}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#94A3B8"
                />
              )}
            </View>

            {/* Phím tắt Hôm nay / Hôm qua */}
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end' }}>
              <TouchableOpacity
                style={[styles.quickDayBtn, dateInput === getTodayString() && styles.quickDayBtnActive]}
                onPress={() => setDateInput(getTodayString())}
              >
                <Text style={[styles.quickDayText, dateInput === getTodayString() && styles.quickDayTextActive]}>
                  Hôm nay
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.quickDayBtn, dateInput === getYesterdayString() && styles.quickDayBtnActive]}
                onPress={() => setDateInput(getYesterdayString())}
              >
                <Text style={[styles.quickDayText, dateInput === getYesterdayString() && styles.quickDayTextActive]}>
                  Hôm qua
                </Text>
              </TouchableOpacity>
            </View>

            {/* 2. Chọn thành viên */}
            <View style={[styles.inputContainer, { flex: 1.5 }]}>
              <Text style={styles.filterLabel}>👤 Nhân viên:</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowMemberPicker(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.pickerButtonText} numberOfLines={1}>
                  {getSelectedMemberName()}
                </Text>
                <Text style={styles.pickerButtonArrow}>▼</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* KPI Summary Cards */}
          <View style={styles.kpiRow}>
            <View style={[styles.kpiCard, { borderColor: '#E9D5FF', backgroundColor: '#FAF5FF' }]}>
              <Text style={styles.kpiLabel}>📋 Tổng thao tác</Text>
              <Text style={[styles.kpiValue, { color: '#7C3AED' }]}>{summary.totalActions}</Text>
            </View>
            <View style={[styles.kpiCard, { borderColor: '#FEF3C7', backgroundColor: '#FFFBEB' }]}>
              <Text style={styles.kpiLabel}>🔴 Nợ ghi mới</Text>
              <Text style={[styles.kpiValue, { color: '#D97706' }]}>
                {summary.totalDebtCreated.toLocaleString('vi-VN')} đ
              </Text>
            </View>
            <View style={[styles.kpiCard, { borderColor: '#D1FAE5', backgroundColor: '#ECFDF5' }]}>
              <Text style={styles.kpiLabel}>🟢 Tiền thu nợ</Text>
              <Text style={[styles.kpiValue, { color: '#059669' }]}>
                {summary.totalMoneyCollected.toLocaleString('vi-VN')} đ
              </Text>
            </View>
          </View>

          {/* Danh sách các thao tác sau khi lọc */}
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color="#7C3AED" size="large" />
              <Text style={styles.loadingText}>Đang tải nhật ký thao tác...</Text>
            </View>
          ) : (
            <ScrollView style={styles.actionList} contentContainerStyle={{ paddingBottom: 24 }}>
              {(() => {
                if (actions.length === 0) {
                  return (
                    <View style={styles.emptyBox}>
                      <Text style={styles.emptyIcon}>📭</Text>
                      <Text style={styles.emptyText}>
                        Không có thao tác nào của thành viên trong ngày được chọn.
                      </Text>
                    </View>
                  );
                }

                return actions.map((item) => {
                  const badgeColor = getBadgeColor(item.type);
                  return (
                    <View key={item.id} style={[styles.actionCard, { borderLeftColor: getBorderLeftColor(item) }]}>
                      {/* Top Header Card */}
                      <View style={styles.cardHeaderRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                          <View style={[styles.badge, { backgroundColor: badgeColor + '15', borderColor: badgeColor + '40' }]}>
                            <Text style={[styles.badgeText, { color: badgeColor }]}>{item.typeName}</Text>
                          </View>
                          <View style={styles.actorTag}>
                            <Text style={styles.actorName}>🧑‍💼 {item.actor?.name || 'Nhân viên'}</Text>
                            {item.actor?.phone ? (
                              <Text style={styles.actorPhone}>({item.actor.phone})</Text>
                            ) : null}
                          </View>
                        </View>
                        <Text style={styles.timeTag}>⏰ {formatTime(item.createdAt)}</Text>
                      </View>

                      {/* Tiêu đề tóm tắt */}
                      {renderActionTitle(item)}

                      {/* Chi tiết nội dung */}
                      {item.details ? (
                        <Text style={styles.actionDetails}>{item.details}</Text>
                      ) : null}

                      {/* Các nút Sửa và Xóa dành cho Chủ Workspace */}
                      <View style={styles.actionBtnRow}>
                        {item.canEdit && (
                          <TouchableOpacity
                            style={styles.editBtn}
                            onPress={() => handleEditAction(item)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.editBtnText}>✏️ Sửa thao tác</Text>
                          </TouchableOpacity>
                        )}
                        {item.canDelete && (
                          <TouchableOpacity
                            style={styles.deleteBtn}
                            onPress={() => handleDeleteAction(item)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.deleteBtnText}>🗑️ Xóa</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                });
              })()}
            </ScrollView>
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.closeFooterBtn} onPress={() => setVisible(false)}>
              <Text style={styles.closeFooterBtnText}>ĐÓNG</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Modal chọn thành viên */}
      <Modal visible={showMemberPicker} transparent animationType="fade" onRequestClose={() => setShowMemberPicker(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Lọc theo nhân viên</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              <TouchableOpacity
                style={[styles.pickerItem, selectedMemberId === 'ALL' && styles.pickerItemActive]}
                onPress={() => {
                  setSelectedMemberId('ALL');
                  setShowMemberPicker(false);
                }}
              >
                <Text style={[styles.pickerItemText, selectedMemberId === 'ALL' && styles.pickerItemTextActive]}>
                  👥 Tất cả thành viên ({members.length})
                </Text>
              </TouchableOpacity>
              {members.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.pickerItem, selectedMemberId === m.id && styles.pickerItemActive]}
                  onPress={() => {
                    setSelectedMemberId(m.id);
                    setShowMemberPicker(false);
                  }}
                >
                  <Text style={[styles.pickerItemText, selectedMemberId === m.id && styles.pickerItemTextActive]}>
                    🧑‍💼 {m.name} ({m.phone})
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.pickerClose} onPress={() => setShowMemberPicker(false)}>
              <Text style={styles.pickerCloseText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>


      <WorkspaceEditActionModal ref={editModalRef} />
      <PopupModal ref={popupRef} />
    </Modal>
  );
});

export default WorkspaceMemberActionsModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  card: {
    width: '98%',
    maxWidth: 960,
    height: '94%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 12,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#7C3AED',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    backgroundColor: '#F1F5F9',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: 'bold',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    gap: 8,
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  inputContainer: {
    minWidth: 110,
  },
  filterLabel: {
    fontSize: 11,
    color: '#475569',
    marginBottom: 4,
    fontWeight: '600',
  },
  dateInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    height: 36,
    color: '#0F172A',
    fontSize: 13,
  },
  quickDayBtn: {
    backgroundColor: '#E2E8F0',
    borderRadius: 6,
    height: 36,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickDayBtnActive: {
    backgroundColor: '#7C3AED',
  },
  quickDayText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  quickDayTextActive: {
    color: '#FFFFFF',
  },
  pickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 36,
  },
  pickerButtonText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  pickerButtonArrow: {
    color: '#64748B',
    fontSize: 10,
    marginLeft: 4,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  kpiLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 8,
  },
  actionList: {
    flex: 1,
    borderRadius: 8,
  },
  emptyBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
  },
  actionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  actorTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actorName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  actorPhone: {
    fontSize: 11,
    color: '#64748B',
  },
  timeTag: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 4,
  },
  actionDetails: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  actionBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  editBtn: {
    backgroundColor: '#FAF5FF',
    borderColor: '#C084FC',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  editBtnText: {
    color: '#7C3AED',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteBtn: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  deleteBtnText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 10,
    marginTop: 6,
  },
  closeFooterBtn: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 6,
  },
  closeFooterBtnText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: 'bold',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  pickerTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 12,
    textAlign: 'center',
  },
  pickerItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  pickerItemActive: {
    backgroundColor: '#FAF5FF',
  },
  pickerItemText: {
    fontSize: 13,
    color: '#334155',
  },
  pickerItemTextActive: {
    color: '#7C3AED',
    fontWeight: 'bold',
  },
  pickerClose: {
    marginTop: 12,
    backgroundColor: '#E2E8F0',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  pickerCloseText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
});
