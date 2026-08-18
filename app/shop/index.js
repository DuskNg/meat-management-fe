// meat-management-fe/app/shop/index.js
import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  TextInput,
  ScrollView,
  FlatList,
  RefreshControl,
  Platform,
  useWindowDimensions,
  Alert,
  TouchableWithoutFeedback,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../src/api/client';
import { COLORS, FONTS, SHADOWS } from '../../src/theme';
import AddShopTableModal from '../../src/components/shop/AddShopTableModal';
import ShopSessionModal from '../../src/components/shop/ShopSessionModal';
import StartTableSessionModal from '../../src/components/shop/StartTableSessionModal';
import ShopDailyRevenueModal from '../../src/components/shop/ShopDailyRevenueModal';
import PopupModal from '../../src/components/PopupModal';
import ProfileModal from '../../src/components/ProfileModal';
import { useAuthStore } from '../../src/store/authStore';
import { useLockStore } from '../../src/store/lockStore';
import WorkspaceMemberActionsModal from '../../src/components/WorkspaceMemberActionsModal';
import ResourceLockOverlay from '../../src/components/ResourceLockOverlay';
import { matchSearch } from '../../src/utils/searchHelper';
import { getSocket, joinWorkspaceRoom, leaveWorkspaceRoom } from '../../src/utils/socket';

export default function ShopDashboardScreen() {
  const router = useRouter();
  const auth = useAuthStore();
  const { setLock, removeLock, getLock, syncLocks } = useLockStore();
  const { width: windowWidth } = useWindowDimensions();

  // Tính toán kích thước ô vuông cho grid bàn chơi
  const containerWidth = Math.min(windowWidth, 600);
  const cardSize = Math.floor((containerWidth - 32 - 18) / 4);

  const [searchQuery, setSearchQuery] = useState('');
  
  // Ticker state để ép màn hình re-render cập nhật thời gian động
  const [tick, setTick] = useState(0);

  // Refs các modal
  const addShopTableModalRef = useRef(null);
  const shopSessionModalRef = useRef(null);
  const startTableSessionModalRef = useRef(null);
  const shopDailyRevenueModalRef = useRef(null);
  const popupModalRef = useRef(null);
  const profileModalRef = useRef(null);
  const memberActionsModalRef = useRef(null);
  const floatingLogRef = useRef(null);

  const [showFloatingLogs, setShowFloatingLogs] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // 1. Tải danh sách bàn chơi từ API
  const {
    data: tablesResponse,
    isLoading: isLoadingTables,
    refetch: refetchTables,
    isRefetching: isRefetchingTables,
  } = useQuery({
    queryKey: ['shop_tables'],
    queryFn: async () => {
      const response = await api.get('/shop/tables');
      return response.data;
    },
    enabled: auth.hasPermission('canManageShop'),
  });

  // 2. Tải tổng doanh thu
  const { data: totalRevResponse, refetch: refetchTotalRev } = useQuery({
    queryKey: ['shop_total_revenue'],
    queryFn: async () => {
      const response = await api.get('/shop/revenue/total');
      return response.data;
    },
    enabled: auth.hasPermission('canManageShop'),
  });

  const tables = tablesResponse?.data || [];
  const totalRevenue = totalRevResponse?.data?.totalRevenue || 0;

  // Lắng nghe Realtime qua WebSocket để tự động đồng bộ tức thì giữa Nhân viên và Chủ quán
  useEffect(() => {
    // Xác định Workspace ID (nếu là nhân viên thì lấy ownerId của workspace, nếu là chủ thì lấy auth.user.id)
    const currentWorkspaceId = auth.user?.workspaceMember?.workspace?.ownerId || auth.user?.id;
    if (!currentWorkspaceId) return;

    // Tham gia phòng Socket theo Workspace
    joinWorkspaceRoom(currentWorkspaceId);

    const socket = getSocket();
    const handleShopTableUpdated = (payload) => {
      // Khi có bất kỳ thay đổi nào (mở bàn, thêm món, kết thúc, thanh toán), tự động refetch ngay lập tức
      refetchTables();
      refetchTotalRev();
    };

    // Đồng bộ danh sách locks khi mới kết nối
    const handleLocksSync = ({ locks }) => {
      syncLocks(locks.filter((l) => l.type === 'SHOP_TABLE'));
    };

    // Cập nhật trạng thái khóa khi có người mở/đóng bàn
    const handleLockChanged = ({ action, lockInfo }) => {
      if (lockInfo.type !== 'SHOP_TABLE') return;
      if (action === 'LOCKED') {
        setLock(lockInfo.type, lockInfo.resourceId, lockInfo);
      } else if (action === 'UNLOCKED') {
        removeLock(lockInfo.type, lockInfo.resourceId);
      }
    };

    socket.on('SHOP_TABLE_UPDATED', handleShopTableUpdated);
    socket.on('RESOURCE_LOCKS_SYNC', handleLocksSync);
    socket.on('RESOURCE_LOCK_CHANGED', handleLockChanged);

    return () => {
      socket.off('SHOP_TABLE_UPDATED', handleShopTableUpdated);
      socket.off('RESOURCE_LOCKS_SYNC', handleLocksSync);
      socket.off('RESOURCE_LOCK_CHANGED', handleLockChanged);
      leaveWorkspaceRoom(currentWorkspaceId);
    };
  }, [auth.user?.id, auth.user?.workspaceMember]);

  // Tự động kích hoạt đếm giờ re-render mỗi 10 giây
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Tự động đóng nhật ký khi bấm ra ngoài (dành riêng cho Web để click xuyên qua và không bị block click đầu)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!showFloatingLogs) return;

    const handleClickOutside = (event) => {
      // Nếu click ra ngoài bảng nhật ký thì ẩn bảng đi
      if (floatingLogRef.current && !floatingLogRef.current.contains(event.target)) {
        setShowFloatingLogs(false);
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showFloatingLogs]);

  // Lọc danh sách bàn theo ô tìm kiếm (hỗ trợ không dấu, viết tắt, từ rời rạc)
  const filteredTables = useMemo(() => {
    if (!searchQuery.trim()) return tables;
    return tables.filter((t) => matchSearch(t.name, searchQuery));
  }, [tables, searchQuery]);

  const handleRefresh = () => {
    refetchTables();
    refetchTotalRev();
  };

  // Định dạng tiền tệ giống bên chi tiết (vi-VN, thêm chữ đ ở cuối)
  const formatCurrency = (val) => {
    if (!val && val !== 0) return '0đ';
    return new Intl.NumberFormat('vi-VN').format(val) + 'đ';
  };

  const formatShortAmount = (val) => {
    const num = parseFloat(val) || 0;
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1).replace('.0', '')}Tr`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(0)}k`;
    }
    return `${num}`;
  };

  const convertIsoToDisplay = (isoStr) => {
    if (!isoStr) return '';
    const parts = isoStr.split('T')[0].split('-');
    if (parts.length !== 3) return isoStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  // Tính thời gian chơi & tiền chơi trực tiếp (real-time ticker) cho giao diện lưới
  const getLiveSessionDetails = (tableItem) => {
    const activeSession = tableItem.sessions?.[0];
    if (!activeSession) return null;

    const start = new Date(activeSession.startTime);
    const end = activeSession.endTime ? new Date(activeSession.endTime) : new Date();
    const diffMs = Math.max(0, end - start);

    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = diffMs / (1000 * 60 * 60);
    const playAmount = Math.round(hours * tableItem.pricePerHour);
    const totalPlayAmount = playAmount + activeSession.extraAmount;

    const hr = Math.floor(totalMinutes / 60);
    const mn = totalMinutes % 60;
    const timeStr = hr > 0 ? `${hr}h ${mn} phút` : `${mn} phút`;

    return {
      timeStr,
      liveAmount: totalPlayAmount,
      isEnded: !!activeSession.endTime,
    };
  };

  // Xử lý khi nhấn vào bàn chơi
  const handleTablePress = (item) => {
    setShowFloatingLogs(false); // Tự động đóng nhật ký khi bấm vào bàn chơi
    const activeSession = item.sessions?.[0];
    if (activeSession) {
      // Mở modal chi tiết phiên chơi đang diễn ra
      shopSessionModalRef.current?.open(item, activeSession);
    } else {
      // Mở modal xác nhận bắt đầu phiên chơi mới (có tích hợp nút xem lịch sử bàn)
      startTableSessionModalRef.current?.open(item);
    }
  };

  // Đổi tên hoặc sửa giá bàn
  const handleEditTable = (item) => {
    addShopTableModalRef.current?.open(item);
  };

  // Xóa bàn chơi
  const handleDeleteTable = (item) => {
    popupModalRef.current?.show({
      title: '🗑️ XÁC NHẬN XÓA BÀN',
      message: `Bạn có chắc chắn muốn xóa bàn chơi "${item.name}" không?`,
      type: 'confirm',
      confirmText: 'XÓA NGAY',
      cancelText: 'HỦY',
      onConfirm: async () => {
        try {
          const response = await api.delete(`/shop/tables/${item.id}`);
          if (response.data.success) {
            handleRefresh();
          }
        } catch (err) {
          Alert.alert('Lỗi', err.response?.data?.message || 'Không thể xóa bàn chơi.');
        }
      },
    });
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

      <View style={styles.contentWrapper}>
        {/* Header điều hướng */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.replace('/')}
            activeOpacity={0.7}
          >
            <Text style={styles.backBtnText}>← Quay lại</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.profileCard}
            onPress={() => profileModalRef.current?.open()}
            activeOpacity={0.7}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(auth.user?.name || 'Shop').trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.profileDetails}>
              <Text style={styles.profileGreeting}>
                {auth.user?.workspaceMember ? 'Nhân viên 👋' : 'Chủ tài khoản 👋'}
              </Text>
              <Text style={styles.profileName}>{auth.user?.name || 'Chủ quán'}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Tổng doanh thu (Bấm trực tiếp để xem doanh thu từng ngày) */}
        <View style={styles.summaryCard}>
          <TouchableOpacity
            style={styles.summaryMain}
            onPress={() => {
              setShowFloatingLogs(false); // Tự động đóng nhật ký khi bấm xem doanh thu
              shopDailyRevenueModalRef.current?.open({ mode: 'ALL_DAYS' });
            }}
            activeOpacity={0.7}
          >
            <View>
              <Text style={styles.summaryLabel}>💰 TỔNG DOANH THU:</Text>
              <Text style={styles.summaryHint}>Bấm để xem chi tiết theo ngày</Text>
            </View>
            <Text style={styles.summaryValue}>{formatCurrency(totalRevenue)}</Text>
          </TouchableOpacity>
        </View>

        {/* Thanh công cụ quản lý */}
        <View style={styles.toolsRow}>
          <TouchableOpacity
            style={styles.addTableBtn}
            onPress={() => {
              setShowFloatingLogs(false); // Tự động đóng nhật ký khi bấm thêm bàn mới
              addShopTableModalRef.current?.open();
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.addTableBtnText}>🏪 Thêm bàn chơi mới</Text>
          </TouchableOpacity>
        </View>

        {/* Ô Tìm Kiếm */}
        <View style={styles.searchSection}>
          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm kiếm bàn hoặc phòng..."
              placeholderTextColor={COLORS.textLight}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>

        {/* Danh sách bàn */}
        <View style={styles.listSectionHeader}>
          <Text style={styles.listTitle}>📋 DANH SÁCH BÀN CHƠI ({tables.length})</Text>
          <Text style={styles.legendText}>🟢 Xanh: còn trống  |  🔴 Đỏ: đang chơi  |  🟡 Vàng: chờ thanh toán</Text>
        </View>

        <FlatList
          style={{ flex: 1 }}
          data={filteredTables}
          keyExtractor={(item) => item.id}
          numColumns={4}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContainer}
          refreshControl={
            <RefreshControl
              refreshing={isRefetchingTables}
              onRefresh={handleRefresh}
              colors={['#0F766E']}
            />
          }
          ListEmptyComponent={
            isLoadingTables ? (
              <ActivityIndicator size="large" color="#0F766E" style={{ marginTop: 40 }} />
            ) : (
              <Text style={styles.emptyText}>Chưa có bàn chơi nào được tạo.</Text>
            )
          }
          renderItem={({ item }) => {
            const liveDetails = getLiveSessionDetails(item);
            const isOccupied = !!liveDetails;
            const isWaitingPayment = liveDetails?.isEnded;

            let cardStyle = styles.tableEmpty;
            let textNameStyle = styles.tableNameEmpty;
            let statusDotColor = '#10B981';

            if (isWaitingPayment) {
              cardStyle = styles.tableWaitingPayment;
              textNameStyle = styles.tableNameWaiting;
              statusDotColor = '#F59E0B';
            } else if (isOccupied) {
              cardStyle = styles.tableOccupied;
              textNameStyle = styles.tableNameOccupied;
              statusDotColor = '#EF4444';
            }

            const activeLock = getLock('SHOP_TABLE', item.id);
            const isLockedByOther = activeLock && activeLock.userId !== auth.user?.id;

            return (
              <TouchableOpacity
                style={[
                  styles.tableSquareCard,
                  { width: cardSize, height: cardSize },
                  cardStyle,
                ]}
                onPress={() => handleTablePress(item)}
                onLongPress={() => {
                  popupModalRef.current?.show({
                    title: `Thao tác với ${item.name}`,
                    message: `Bạn muốn thực hiện thao tác nào với ${item.name}?`,
                    type: 'confirm',
                    confirmText: 'Chỉnh sửa',
                    cancelText: 'Xóa bàn',
                    onConfirm: () => handleEditTable(item),
                    onCancel: () => handleDeleteTable(item),
                  });
                }}
                delayLongPress={500}
                activeOpacity={0.7}
              >
                {/* Lớp phủ Overlay nếu bàn này đang có người khác xử lý */}
                {isLockedByOther ? (
                  <ResourceLockOverlay lockInfo={activeLock} borderRadius={12} />
                ) : null}

                {/* Dấu chấm trạng thái */}
                <View style={[styles.statusDot, { backgroundColor: statusDotColor }]} />

                {liveDetails ? (
                  <>
                    <Text style={[styles.tableName, textNameStyle]} numberOfLines={1} adjustsFontSizeToFit>
                      {item.name}
                    </Text>
                    <View style={styles.liveMeta}>
                      <Text style={styles.liveTime}>{liveDetails.timeStr}</Text>
                      <Text style={styles.liveBillDetail}>{formatCurrency(liveDetails.liveAmount)}</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={[styles.tableName, textNameStyle]} numberOfLines={1} adjustsFontSizeToFit>
                      {item.name}
                    </Text>
                    <Text style={styles.tablePrice} numberOfLines={1} adjustsFontSizeToFit>
                      {formatShortAmount(item.pricePerHour)}/h
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* 1. Modal Thêm/Sửa Bàn chơi */}
      <AddShopTableModal ref={addShopTableModalRef} onRefresh={handleRefresh} />

      {/* 2. Modal Chi tiết Phiên chơi đang chạy */}
      <ShopSessionModal ref={shopSessionModalRef} onRefresh={handleRefresh} />

      {/* 3. Modal Xác nhận Mở Bàn Chơi Mới kèm Nút Xem Lịch Sử Bàn & Chọn Món Kèm */}
      <StartTableSessionModal
        ref={startTableSessionModalRef}
        onStartSession={async (table, items) => {
          try {
            const payload = { tableId: table.id };
            if (items && items.length > 0) {
              payload.items = items;
            }
            const response = await api.post('/shop/sessions/start', payload);
            if (response.data.success) {
              handleRefresh();
            }
          } catch (err) {
            Alert.alert('Thất bại', err.response?.data?.message || 'Không thể bắt đầu phiên chơi.');
          }
        }}
        onViewTableHistory={(table) => {
          shopDailyRevenueModalRef.current?.open({
            tableId: table.id,
            tableName: table.name,
          });
        }}
      />

      {/* 4. Modal Báo Cáo Doanh Thu & Lịch Sử Chi Tiết Theo Ngày */}
      <ShopDailyRevenueModal ref={shopDailyRevenueModalRef} onRefresh={handleRefresh} />

      {/* 5. Modal Thông Báo & Profile */}
      <PopupModal ref={popupModalRef} />
      <ProfileModal ref={profileModalRef} />

      {/* Nút nổi và Bảng nhật ký nhanh của nhân viên (Dành riêng cho Chủ Workspace) */}
      {auth.user?.isWorkspaceOwner && showFloatingLogs && Platform.OS !== 'web' && (
        <TouchableWithoutFeedback onPress={() => setShowFloatingLogs(false)}>
          <View style={[StyleSheet.absoluteFillObject, { zIndex: 9998 }]} />
        </TouchableWithoutFeedback>
      )}

      {auth.user?.isWorkspaceOwner && (
        <View ref={floatingLogRef} style={styles.floatingLogContainer}>
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
  contentWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    backgroundColor: '#F8FAFC',
    borderLeftWidth: Platform.OS === 'web' ? 1 : 0,
    borderRightWidth: Platform.OS === 'web' ? 1 : 0,
    borderColor: '#E2E8F0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    ...SHADOWS.card,
  },
  backBtn: {
    width: 90,
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
    color: COLORS.textSecondary,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#CCFBF1',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#99F6E4',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F766E',
  },
  profileDetails: {
    alignItems: 'flex-start',
  },
  profileGreeting: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  profileName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
    maxWidth: 150,
  },
  summaryCard: {
    backgroundColor: '#F0FDFA', // Xanh teal nhạt
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#99F6E4',
    ...SHADOWS.card,
  },
  summaryMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F766E',
  },
  summaryHint: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0D9488',
    textAlign: 'right',
    flexShrink: 0,
  },
  toolsRow: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  addTableBtn: {
    backgroundColor: '#0F766E',
    height: 42,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#0D9488',
    ...SHADOWS.card,
  },
  addTableBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  searchSection: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 42,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    padding: 0,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      },
    }),
  },
  listSectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  legendText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  gridContainer: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  gridRow: {
    gap: 6,
    marginBottom: 6,
  },
  tableSquareCard: {
    borderRadius: 12,
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    position: 'relative',
    ...SHADOWS.card,
  },
  tableEmpty: {
    backgroundColor: '#F0FDF4', // Màu xanh lục nhạt
    borderColor: '#BBF7D0',
  },
  tableOccupied: {
    backgroundColor: '#FEF2F2', // Màu đỏ hồng nhạt
    borderColor: '#FCA5A5',
  },
  tableWaitingPayment: {
    backgroundColor: '#FEF3C7', // Màu vàng nhạt
    borderColor: '#FDE68A',
  },
  statusDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  tableName: {
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  tableNameEmpty: {
    color: '#059669',
  },
  tableNameOccupied: {
    color: '#DC2626',
  },
  tableNameWaiting: {
    color: '#D97706',
  },
  tablePrice: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  liveMeta: {
    alignItems: 'center',
  },
  liveTime: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  liveTimeEmpty: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  liveBill: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#DC2626',
    marginTop: 2,
  },
  liveBillDetail: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#DC2626',
    marginTop: 2,
  },
  liveBillEmpty: {
    fontSize: 12,
    fontWeight: '500',
    color: '#94A3B8',
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    marginTop: 40,
    fontSize: 14,
  },
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: FONTS.weightBold,
    color: '#0F766E',
    textAlign: 'center',
    marginBottom: 15,
  },
  modalList: {
    maxHeight: 250,
    marginBottom: 15,
  },
  revenueItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  revenueItemDate: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  revenueItemAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0D9488',
  },
  closeBtn: {
    backgroundColor: '#0F766E',
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
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
