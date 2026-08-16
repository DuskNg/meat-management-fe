// meat-management-fe/app/inventory/index.js
import React, { useState, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../src/api/client';
import { COLORS, FONTS, SHADOWS } from '../../src/theme';
import AddInventoryProductModal from '../../src/components/inventory/AddInventoryProductModal';
import InventoryActionModal from '../../src/components/inventory/InventoryActionModal';
import InventoryHistoryModal from '../../src/components/inventory/InventoryHistoryModal';
import { useAuthStore } from '../../src/store/authStore';
import { useLockStore } from '../../src/store/lockStore';
import WorkspaceMemberActionsModal from '../../src/components/WorkspaceMemberActionsModal';
import ResourceLockBadge from '../../src/components/ResourceLockBadge';
import { matchItemSearch } from '../../src/utils/searchHelper';
import { getSocket, joinWorkspaceRoom, leaveWorkspaceRoom } from '../../src/utils/socket';

export default function InventoryDashboardScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const auth = useAuthStore();
  const user = auth.user;
  const { setLock, removeLock, getLock, syncLocks } = useLockStore();

  // States quản lý bộ lọc và tìm kiếm
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('ALL'); // 'ALL' | 'LOW' | 'OUT'

  // Refs của các pop-up modal
  const addModalRef = useRef(null);
  const actionModalRef = useRef(null);
  const historyModalRef = useRef(null);
  const memberActionsModalRef = useRef(null);

  const [showFloatingLogs, setShowFloatingLogs] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const { data: responseData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['inventoryProducts'],
    queryFn: async () => {
      const res = await api.get('/inventory/products');
      return res.data;
    },
  });

  // Lắng nghe sự kiện realtime từ Socket.IO (cập nhật kho + resource locking)
  React.useEffect(() => {
    const socket = getSocket();
    const currentWorkspaceId = user?.workspaceMember?.workspace?.ownerId || user?.id;

    if (socket && currentWorkspaceId) {
      joinWorkspaceRoom(currentWorkspaceId);

      // Cập nhật danh sách sản phẩm khi có thay đổi từ người dùng khác
      const handleInventoryUpdate = (data) => {
        console.log('[SOCKET] Nhận thông báo cập nhật kho hàng:', data);
        refetch();
        queryClient.invalidateQueries(['inventoryProducts']);
      };

      // Đồng bộ danh sách locks khi mới kết nối (nhận trạng thái hiện tại từ server)
      const handleLocksSync = ({ locks }) => {
        syncLocks(locks.filter((l) => l.type === 'INVENTORY_PRODUCT'));
      };

      // Cập nhật trạng thái khóa khi có người mở/đóng thao tác với sản phẩm
      const handleLockChanged = ({ action, lockInfo }) => {
        if (lockInfo.type !== 'INVENTORY_PRODUCT') return;
        if (action === 'LOCKED') {
          setLock(lockInfo.type, lockInfo.resourceId, lockInfo);
        } else if (action === 'UNLOCKED') {
          removeLock(lockInfo.type, lockInfo.resourceId);
        }
      };

      socket.on('INVENTORY_UPDATED', handleInventoryUpdate);
      socket.on('RESOURCE_LOCKS_SYNC', handleLocksSync);
      socket.on('RESOURCE_LOCK_CHANGED', handleLockChanged);

      return () => {
        socket.off('INVENTORY_UPDATED', handleInventoryUpdate);
        socket.off('RESOURCE_LOCKS_SYNC', handleLocksSync);
        socket.off('RESOURCE_LOCK_CHANGED', handleLockChanged);
      };
    }
  }, [user?.id, user?.workspaceMember?.workspace?.ownerId]);

  const products = responseData?.data?.products || [];

  // Tính toán thống kê nhanh cho Header
  const stats = useMemo(() => {
    let totalValue = 0;
    let lowCount = 0;
    let outCount = 0;

    products.forEach((p) => {
      const val = (parseFloat(p.quantity) || 0) * (parseFloat(p.price) || 0);
      totalValue += val;
      if (p.isLowStock) lowCount++;
      if (p.isOutOfStock) outCount++;
    });

    return {
      totalValue,
      total: products.length,
      lowCount,
      outCount,
    };
  }, [products]);

  // Lọc sản phẩm theo từ khóa tìm kiếm (hỗ trợ không dấu, viết tắt, nhiều từ rời rạc) và chip bộ lọc
  const filteredProducts = useMemo(() => {
    return products.filter((item) => {
      const matchSearch = matchItemSearch(item, search, ['name', 'barcode', 'sku', 'unit']);
      if (!matchSearch) return false;

      if (filterType === 'LOW') {
        return item.isLowStock;
      }
      if (filterType === 'OUT') {
        return item.isOutOfStock;
      }
      return true;
    });
  }, [products, search, filterType]);

  // Định dạng số tiền sang VND
  const formatVND = (num) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num || 0);
  };

  // Định dạng số lượng hiển thị
  const formatQuantity = (qty, unit) => {
    const num = parseFloat(qty || 0);
    return `${Number(num.toFixed(3))} ${unit}`;
  };

  // Xử lý Xóa sản phẩm kho
  const handleDeleteProduct = (productId, productName) => {
    Alert.alert(
      'Xác nhận xóa',
      `Bạn có chắc chắn muốn xóa sản phẩm "${productName}" khỏi kho không?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa ngay',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await api.delete(`/inventory/products/${productId}`);
              if (res.data && res.data.success) {
                queryClient.invalidateQueries(['inventory_products']);
              } else {
                Alert.alert('Thất bại', res.data.message || 'Không thể xóa sản phẩm.');
              }
            } catch (err) {
              console.error(err);
              Alert.alert('Lỗi', err.response?.data?.message || 'Có lỗi xảy ra khi kết nối máy chủ.');
            }
          },
        },
      ]
    );
  };

  // Xử lý khi nhấn giữ sản phẩm kho để sửa hoặc xóa
  const handleProductLongPress = (item) => {
    Alert.alert(
      'Tùy chọn sản phẩm',
      `Bạn muốn làm gì với sản phẩm "${item.name}"?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Sửa thông tin ✏️',
          onPress: () => addModalRef.current?.open(item),
        },
        {
          text: 'Xóa sản phẩm 🗑️',
          style: 'destructive',
          onPress: () => handleDeleteProduct(item.id, item.name),
        },
      ]
    );
  };

  // Các hàm định dạng và màu sắc bổ trợ cho bảng nhật ký nhanh
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

  const getBadgeColor = (type) => {
    switch (type) {
      case 'TRANSACTION': return '#D97706';
      case 'PAYMENT': return '#059669';
      case 'CUSTOMER': return '#7C3AED';
      case 'STORE_ORDER': return '#0284C7';
      case 'STORE_PAYMENT': return '#0D9488';
      case 'SHOP_SESSION': return '#DB2777';
      case 'INVENTORY': return '#4F46E5';
      case 'SUPPLIER_TX':
      case 'SUPPLIER_PAYMENT': return '#CA8A04';
      default: return '#64748B';
    }
  };

  const getBorderLeftColor = (item) => {
    if (item.type === 'SHOP_SESSION' && item.rawItem?.isPaid) {
      return '#059669'; // Xanh lá khi đã thanh toán
    }
    return getBadgeColor(item.type);
  };

  const renderActionTitleFloating = (item) => {
    if (item.type === 'SHOP_SESSION' && item.rawItem) {
      const { startTime, endTime, isPaid, totalAmount, table } = item.rawItem;
      const tableName = table?.name || 'Bàn/Phòng';
      
      const formatTimeOnly = (dateStr) => {
        try {
          const d = new Date(dateStr);
          const hours = String(d.getHours()).padStart(2, '0');
          const minutes = String(d.getMinutes()).padStart(2, '0');
          return `${hours}:${minutes}`;
        } catch {
          return '';
        }
      };

      const startStr = formatTimeOnly(startTime);
      const endStr = endTime ? formatTimeOnly(endTime) : 'đang chơi';
      const amountStr = totalAmount ? (parseFloat(totalAmount) || 0).toLocaleString('vi-VN') + 'đ' : '';

      return (
        <Text style={styles.floatingLogText} numberOfLines={2}>
          {tableName}: {startStr} - {endStr}
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
    
    return (
      <Text style={styles.floatingLogText} numberOfLines={2}>
        {item.actionTitle}
      </Text>
    );
  };

  // Tải nhanh 5 thao tác nhân viên mới nhất của ngày hiện tại
  const fetchRecentLogs = async () => {
    setLoadingLogs(true);
    try {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      const res = await api.get('/workspace/member-actions', {
        params: { date: dateStr },
      });
      if (res.data?.success && res.data?.data) {
        setLogs(res.data.data.actions?.slice(0, 5) || []);
      }
    } catch (error) {
      console.error('Lỗi khi tải nhật ký thao tác nhanh:', error);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleToggleFloatingLogs = () => {
    const nextState = !showFloatingLogs;
    setShowFloatingLogs(nextState);
    if (nextState) {
      fetchRecentLogs();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* HEADER: Nút Quay lại bên trái, Tiêu đề giữa */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.replace('/')}
          activeOpacity={0.7}
        >
          <Text style={styles.backBtnText}>← Quay lại</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Quản Lý Kho 📦</Text>
        <View style={{ width: 80 }} />
      </View>

      <View style={styles.content}>
        {/* Thẻ Summary: Hiển thị tổng giá trị kho và thống kê trạng thái */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>💰 TỔNG GIÁ TRỊ KHO HÀNG</Text>
          <Text style={styles.summaryValue}>{formatVND(stats.totalValue)}</Text>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.total}</Text>
              <Text style={styles.statLabel}>Mặt hàng</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, styles.textYellow]}>{stats.lowCount}</Text>
              <Text style={styles.statLabel}>Sắp hết</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, styles.textRed]}>{stats.outCount}</Text>
              <Text style={styles.statLabel}>Hết hàng</Text>
            </View>
          </View>
        </View>

        {/* Khung chức năng: Tìm kiếm và Nút thêm sản phẩm */}
        <View style={styles.actionRow}>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Tìm theo tên sản phẩm..."
            placeholderTextColor="#94A3B8"
          />

          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => addModalRef.current?.open()}
            activeOpacity={0.8}
          >
            <Text style={styles.addBtnText}>+ Thêm hàng</Text>
          </TouchableOpacity>
        </View>

        {/* Chips Bộ lọc nhanh */}
        <View style={styles.filterChipsContainer}>
          <TouchableOpacity
            style={[styles.filterChip, filterType === 'ALL' && styles.filterChipActive]}
            onPress={() => setFilterType('ALL')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipText, filterType === 'ALL' && styles.filterChipTextActive]}>
              Tất cả ({stats.total})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, filterType === 'LOW' && styles.filterChipActiveYellow]}
            onPress={() => setFilterType('LOW')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipText, filterType === 'LOW' && styles.filterChipTextYellow]}>
              ⚠️ Sắp hết ({stats.lowCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, filterType === 'OUT' && styles.filterChipActiveRed]}
            onPress={() => setFilterType('OUT')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipText, filterType === 'OUT' && styles.filterChipTextRed]}>
              🔴 Hết hàng ({stats.outCount})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Danh sách sản phẩm kho */}
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Đang tải dữ liệu kho...</Text>
          </View>
        ) : filteredProducts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {search.trim() || filterType !== 'ALL'
                ? 'Không tìm thấy sản phẩm nào khớp bộ lọc.'
                : 'Kho hàng hiện tại trống.'}
            </Text>
            {!search.trim() && filterType === 'ALL' && (
              <Text style={styles.emptySubText}>Nhấn nút "+ Thêm hàng" để bắt đầu quản lý.</Text>
            )}
          </View>
        ) : (
          <FlatList
            data={filteredProducts}
            keyExtractor={(item) => item.id}
            onRefresh={refetch}
            refreshing={isRefetching}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const isOut = item.isOutOfStock;
              const isLow = item.isLowStock;

              const currentQty = parseFloat(item.quantity || 0);
              const usedQty = parseFloat(item.usedQuantity || 0);
              const totalQty = currentQty + usedQty;

              return (
                <View style={[styles.productCard, isOut && styles.cardOut, isLow && styles.cardLow]}>
                  {/* Hàng 1: Tên sản phẩm + Badge trạng thái + Số lượng tồn */}
                  <View style={styles.cardHeaderRow}>
                    <TouchableOpacity
                      style={styles.cardTitleArea}
                      onPress={() => addModalRef.current?.open(item)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.productName} numberOfLines={1}>
                        {item.name}
                      </Text>

                      {isOut ? (
                        <View style={styles.badgeOut}>
                          <Text style={styles.badgeOutText}>Hết</Text>
                        </View>
                      ) : isLow ? (
                        <View style={styles.badgeLow}>
                          <Text style={styles.badgeLowText}>Sắp hết</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>

                    <Text
                      style={[
                        styles.stockValue,
                        isOut && styles.textRed,
                        isLow && styles.textYellow,
                      ]}
                    >
                      Tồn: {formatQuantity(item.quantity, item.unit)}
                    </Text>
                  </View>

                  {/* Hàng 2: Giá vốn • Tổng giá trị • Đã dùng */}
                  <View style={styles.cardSubRow}>
                    <Text style={styles.subMetaText}>
                      Giá: <Text style={styles.subMetaVal}>{formatVND(item.price)}</Text>
                    </Text>
                    <Text style={styles.subMetaDot}>•</Text>
                    <Text style={styles.subMetaText}>
                      Tổng: <Text style={styles.subMetaValHighlight}>{formatVND(item.amount)}</Text>
                    </Text>
                    {usedQty > 0 && (
                      <>
                        <Text style={styles.subMetaDot}>•</Text>
                        <Text style={styles.subMetaText}>
                          Đã dùng: <Text style={styles.usedHighlight}>{Number(usedQty.toFixed(3))}/{Number(totalQty.toFixed(3))}</Text>
                        </Text>
                      </>
                    )}
                  </View>

                  {/* Badge hiển thị khi có người khác đang thao tác với sản phẩm này */}
                  {(() => {
                    const activeLock = getLock('INVENTORY_PRODUCT', item.id);
                    const isLockedByOther = activeLock && activeLock.userId !== user?.id;
                    return isLockedByOther ? (
                      <ResourceLockBadge lockInfo={activeLock} style={styles.lockBadge} />
                    ) : null;
                  })()}

                  {/* Hàng 3: 3 nút thao tác: Kiểm kê / Sửa / Thẻ kho */}
                  <View style={styles.cardActionsRow}>
                    <TouchableOpacity
                      style={[styles.quickBtn, styles.btnAdjust]}
                      onPress={() => actionModalRef.current?.open(item, 'IN')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.btnAdjustText}>⚖️ Kiểm kê</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.quickBtn, styles.btnEdit]}
                      onPress={() => addModalRef.current?.open(item)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.btnEditText}>✏️ Sửa</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.quickBtn, styles.btnHistory]}
                      onPress={() => historyModalRef.current?.open(item)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.btnHistoryText}>📜 Lịch sử sử dụng</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>

      {/* 1. Modal Thêm/Sửa sản phẩm */}
      <AddInventoryProductModal
        ref={addModalRef}
        onSaveSuccess={() => {
          queryClient.invalidateQueries(['inventoryProducts']);
          refetch();
        }}
        onDeleteSuccess={() => {
          queryClient.invalidateQueries(['inventoryProducts']);
          refetch();
        }}
      />

      {/* 2. Modal Thao tác biến động kho (Nhập/Xuất/Kiểm kê) */}
      <InventoryActionModal
        ref={actionModalRef}
        onSuccess={() => {
          queryClient.invalidateQueries(['inventoryProducts']);
          refetch();
        }}
      />

      {/* 3. Modal Xem Thẻ Kho / Lịch sử biến động */}
      <InventoryHistoryModal ref={historyModalRef} />

      {/* Nút nổi và Bảng nhật ký nhanh của nhân viên (Dành riêng cho Chủ Workspace) */}
      {auth.user?.isWorkspaceOwner && (
        <View style={styles.floatingLogContainer}>
          {showFloatingLogs && (
            <View style={styles.floatingLogPanel}>
              <View style={styles.floatingLogHeader}>
                <Text style={styles.floatingLogTitle}>📋 Nhật ký hôm nay</Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowFloatingLogs(false);
                    memberActionsModalRef.current?.open(auth.user);
                  }}
                  style={styles.floatingLogExpandBtn}
                >
                  <Text style={styles.floatingLogExpandText}>Chi tiết ➔</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.floatingLogList}>
                {loadingLogs ? (
                  <ActivityIndicator size="small" color="#7C3AED" style={{ marginVertical: 15 }} />
                ) : logs.length === 0 ? (
                  <Text style={styles.floatingLogEmpty}>Không có thao tác nào trong ngày.</Text>
                ) : (
                  logs.map((item) => {
                    const badgeColor = getBadgeColor(item.type);
                    return (
                      <View key={item.id} style={[styles.floatingLogItem, { borderLeftColor: getBorderLeftColor(item) }]}>
                        <View style={styles.floatingLogItemHeader}>
                          <Text style={styles.floatingLogActor}>🧑‍💼 {item.actor?.name}</Text>
                          <Text style={styles.floatingLogTime}>{formatTime(item.createdAt)}</Text>
                        </View>
                        {renderActionTitleFloating(item)}
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          )}

          <TouchableOpacity
            style={styles.floatingLogButton}
            onPress={handleToggleFloatingLogs}
            activeOpacity={0.8}
          >
            <Text style={styles.floatingLogButtonText}>
              {showFloatingLogs ? '✕ Thu gọn' : '📜 Nhật ký nhân viên'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal xem nhật ký chi tiết */}
      <WorkspaceMemberActionsModal ref={memberActionsModalRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.card,
  },
  backBtn: {
    width: 80,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  backBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#64748B',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  summaryCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    marginBottom: 10,
    ...SHADOWS.card,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1E40AF',
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1D4ED8',
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderColor: '#DBEAFE',
    width: '100%',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  statLabel: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  statDivider: {
    width: 1,
    height: 16,
    backgroundColor: '#BFDBFE',
  },
  textYellow: { color: '#D97706' },
  textRed: { color: '#DC2626' },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  addBtn: {
    height: 42,
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  filterChipsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#1E293B',
    borderColor: '#1E293B',
  },
  filterChipActiveYellow: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  filterChipActiveRed: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
  },
  filterChipText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  filterChipTextYellow: {
    color: '#B45309',
    fontWeight: 'bold',
  },
  filterChipTextRed: {
    color: '#B91C1C',
    fontWeight: 'bold',
  },
  listContent: {
    gap: 8,
    paddingBottom: 24,
  },
  productCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.card,
  },
  cardLow: {
    borderColor: '#FCD34D',
    backgroundColor: '#FEF9C3', // Màu vàng ấm đậm rõ ràng hơn
  },
  cardOut: {
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitleArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 8,
  },
  productName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
    flexShrink: 1,
  },
  badgeLow: {
    backgroundColor: '#FDE047',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.8,
    borderColor: '#EAB308',
  },
  badgeLowText: {
    fontSize: 9,
    color: '#854D0E',
    fontWeight: 'bold',
  },
  badgeOut: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  badgeOutText: {
    fontSize: 9,
    color: '#DC2626',
    fontWeight: 'bold',
  },
  stockValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#059669',
  },
  usedQuantityText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
  cardSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 8,
    gap: 4,
  },
  subMetaText: {
    fontSize: 12,
    color: '#64748B',
  },
  subMetaVal: {
    color: '#334155',
    fontWeight: '600',
  },
  subMetaValHighlight: {
    color: '#2563EB',
    fontWeight: 'bold',
  },
  usedHighlight: {
    color: '#0F766E',
    fontWeight: 'bold',
  },
  subMetaDot: {
    fontSize: 11,
    color: '#CBD5E1',
    marginHorizontal: 2,
  },
  minStockHint: {
    fontSize: 11,
    color: '#D97706',
  },
  lockBadge: {
    marginBottom: 6,
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  quickBtn: {
    flex: 1,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnIn: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  btnInText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: 'bold',
  },
  btnOut: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  btnOutText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: 'bold',
  },
  btnAdjust: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  btnAdjustText: {
    color: '#2563EB',
    fontSize: 11,
    fontWeight: 'bold',
  },
  btnEdit: {
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  btnEditText: {
    color: '#7C3AED',
    fontSize: 11,
    fontWeight: 'bold',
  },
  btnHistory: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  btnHistoryText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 40,
  },
  loadingText: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  emptySubText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  floatingLogContainer: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    zIndex: 9999,
    alignItems: 'flex-end',
  },
  floatingLogButton: {
    backgroundColor: '#7C3AED',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  floatingLogButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  floatingLogPanel: {
    width: 320,
    maxHeight: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  floatingLogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8,
    marginBottom: 8,
  },
  floatingLogTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  floatingLogExpandBtn: {
    backgroundColor: '#FAF5FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  floatingLogExpandText: {
    fontSize: 11,
    color: '#7C3AED',
    fontWeight: 'bold',
  },
  floatingLogList: {
    flex: 1,
  },
  floatingLogEmpty: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: 20,
  },
  floatingLogItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  floatingLogItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  floatingLogActor: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#334155',
  },
  floatingLogTime: {
    fontSize: 10,
    color: '#94A3B8',
  },
  floatingLogText: {
    fontSize: 12,
    color: '#0F172A',
    lineHeight: 16,
  },
});
