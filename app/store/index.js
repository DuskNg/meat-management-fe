// meat-management-fe/app/store/index.js
import React, { useState, useRef, useMemo } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../src/api/client';
import { COLORS, FONTS, SHADOWS } from '../../src/theme';
import AddTableModal from '../../src/components/store/AddTableModal';
import AddMenuModal from '../../src/components/store/AddMenuModal';
import ScanInvoiceModal from '../../src/components/store/ScanInvoiceModal';
import StorePopupModal from '../../src/components/store/StorePopupModal';
import OrderModal from '../../src/components/store/OrderModal';
import TablePaymentModal from '../../src/components/store/TablePaymentModal';
import SmoothModal from '../../src/components/SmoothModal';
import { useAuthStore } from '../../src/store/authStore';
import ProfileModal from '../../src/components/ProfileModal';
import { startNativeRecording, stopNativeRecording } from '../../src/utils/mediaActions';

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

export default function StoreDashboardScreen() {
  const router = useRouter();
  // Tính kích thước ô vuông cố định: containerWidth tối đa 600, trừ padding 2x16 và gap 3x6
  const { width: windowWidth } = useWindowDimensions();
  const containerWidth = Math.min(windowWidth, 600);
  const cardSize = Math.floor((containerWidth - 32 - 18) / 4);

  const [searchQuery, setSearchQuery] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [showDailyRevModal, setShowDailyRevModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);

  const auth = useAuthStore();
  const addTableModalRef = useRef(null);
  const addMenuModalRef = useRef(null);
  const scanInvoiceModalRef = useRef(null);
  const popupModalRef = useRef(null);
  const profileModalRef = useRef(null);
  const orderModalRef = useRef(null);
  const paymentModalRef = useRef(null);
  const mediaRecorderRef = useRef(null);

  // 1. Tải danh sách bàn ăn (customers type = 'store')
  const {
    data: tablesResponse,
    isLoading: isLoadingTables,
    refetch: refetchTables,
    isRefetching: isRefetchingTables,
  } = useQuery({
    queryKey: ['store_tables'],
    queryFn: async () => {
      const response = await api.get('/store/customers');
      return response.data;
    },
  });

  // 2. Tải tổng doanh thu cửa hàng
  const { data: totalRevResponse, refetch: refetchTotalRev } = useQuery({
    queryKey: ['store_total_revenue'],
    queryFn: async () => {
      const response = await api.get('/store/revenue/total');
      return response.data;
    },
  });

  // 3. Tải doanh thu cửa hàng theo ngày
  const { data: dailyRevResponse, refetch: refetchDailyRev } = useQuery({
    queryKey: ['store_daily_revenue'],
    queryFn: async () => {
      const response = await api.get('/store/revenue/daily');
      return response.data;
    },
    enabled: showDailyRevModal,
  });

  const tables = tablesResponse?.data || [];
  const totalRevenue = totalRevResponse?.data?.totalRevenue || 0;
  const dailyRevenues = dailyRevResponse?.data || [];

  // Lọc danh sách bàn theo từ khóa tìm kiếm
  const filteredTables = useMemo(() => {
    if (!searchQuery.trim()) return tables;
    const q = searchQuery.toLowerCase().trim();
    return tables.filter((t) => t.name.toLowerCase().includes(q));
  }, [tables, searchQuery]);

  const handleRefresh = () => {
    refetchTables();
    refetchTotalRev();
    if (showDailyRevModal) refetchDailyRev();
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
      .format(val)
      .replace('₫', 'đ');
  };

  const convertIsoToDisplay = (isoStr) => {
    if (!isoStr) return '';
    const parts = isoStr.split('T')[0].split('-');
    if (parts.length !== 3) return isoStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  // Xử lý kết quả phân tích AI (OCR / Giọng nói)
  const processParseResult = (responseData, sourceTitle) => {
    const { data, customerName } = responseData;
    const results = Array.isArray(data) ? data : [data].filter(Boolean);
    const firstResult = results[0];

    if (!firstResult) {
      popupModalRef.current?.show({
        title: 'Không có kết quả',
        message: 'AI không nhận diện được món ăn hoặc bàn nào.',
        type: 'warning',
      });
      return;
    }

    const items = results.map((res) => {
      const qty = parseFloat(res.quantity) || 1;
      const amt = parseInt(res.amount) || 0;
      const prc = parseInt(res.price) || (qty > 0 ? Math.round(amt / qty) : 0);

      return {
        product: {
          name: res.product?.name || res.meat_type || 'Món lẻ',
          unit: res.product?.unit || 'phần',
          defaultPrice: prc,
        },
        quantity: qty,
        price: prc,
        amount: amt || Math.round(qty * prc),
        voiceDate: res.voiceDate || responseData.date || firstResult.date,
        voiceCustomerName: res.voiceCustomerName || customerName || '',
      };
    });

    scanInvoiceModalRef.current?.open(
      items,
      sourceTitle,
      responseData.rawTranscript || '',
      responseData.date || firstResult.date,
      customerName || ''
    );
  };

  // Mock Chụp hóa đơn để test OCR nhanh chóng
  const handleScanInvoiceMock = async () => {
    setScanning(true);
    try {
      const response = await api.post('/store/scan-invoice', {
        image: 'mock_base64_image_data',
      });

      if (response.data.success) {
        processParseResult(response.data, '📸 KẾT QUẢ QUÉT HÓA ĐƠN OCR');
      } else {
        popupModalRef.current?.show({
          title: 'Thất bại',
          message: response.data.message || 'Không thể quét hóa đơn.',
          type: 'error',
        });
      }
    } catch (err) {
      console.error(err);
      popupModalRef.current?.show({
        title: 'Lỗi',
        message: 'Lỗi kết nối mạng khi quét hóa đơn.',
        type: 'error',
      });
    } finally {
      setScanning(false);
    }
  };

  // Ghi âm gọi món bằng giọng nói
  const handleToggleRecording = async () => {
    if (isRecording) {
      setIsRecording(false);
      setScanning(true);
      try {
        let audioData = null;
        if (mediaRecorderRef.current) {
          audioData = await stopNativeRecording(mediaRecorderRef.current);
          mediaRecorderRef.current = null;
        }

        const response = await api.post('/store/voice-to-text', {
          audio: audioData ? audioData.dataUri : 'mock_audio_base64',
          mimeType: audioData ? audioData.mimeType : 'audio/webm',
        });

        if (response.data.success) {
          processParseResult(response.data, '🎤 KẾT QUẢ GHI NỢ GIỌNG NÓI');
        } else {
          popupModalRef.current?.show({
            title: 'Thất bại',
            message: response.data.message || 'Không thể nhận diện giọng nói.',
            type: 'error',
          });
        }
      } catch (err) {
        console.error(err);
        popupModalRef.current?.show({
          title: 'Lỗi',
          message: 'Lỗi kết nối máy chủ nhận diện giọng nói.',
          type: 'error',
        });
      } finally {
        setScanning(false);
      }
    } else {
      try {
        mediaRecorderRef.current = await startNativeRecording();
        setIsRecording(true);
      } catch (err) {
        // Fallback nhập văn bản bằng tay nếu thiết bị không hỗ trợ ghi âm
        popupModalRef.current?.show({
          title: 'Nhập câu lệnh gọi món',
          message: 'Ví dụ: "Bàn 3 gọi 2 đĩa bún chả, 2 lon bia"',
          type: 'confirm',
          showTextInput: true,
          textInputPlaceholder: 'Nhập nội dung gọi món...',
          onConfirm: async (text) => {
            if (!text) return;
            setScanning(true);
            try {
              const res = await api.post('/store/voice-to-text', {
                transcript: text,
              });
              if (res.data.success) {
                processParseResult(res.data, '🎤 KẾT QUẢ PHÂN TÍCH GIỌNG NÓI');
              }
            } catch (err2) {
              console.error(err2);
            } finally {
              setScanning(false);
            }
          },
        });
      }
    }
  };

  // Đổi tên bàn ăn
  const handleRenameTable = (item) => {
    popupModalRef.current?.show({
      title: '✏️ Sửa tên bàn ăn',
      message: `Nhập tên mới cho bàn: ${item.name}`,
      type: 'confirm',
      showTextInput: true,
      textInputPlaceholder: 'Ví dụ: Bàn 5...',
      textInputDefaultValue: item.name,
      onConfirm: async (newName) => {
        if (!newName || !newName.trim()) return;
        try {
          const res = await api.put(`/store/customers/${item.id}`, { name: newName.trim() });
          if (res.data.success) {
            handleRefresh();
          }
        } catch (err) {
          popupModalRef.current?.show({
            title: 'Lỗi',
            message: err.response?.data?.message || 'Không thể đổi tên bàn.',
            type: 'error',
          });
        }
      },
    });
  };

  // Xác nhận xóa bàn ăn
  const handleDeleteTable = (item) => {
    popupModalRef.current?.show({
      title: '🗑️ Xác nhận xóa bàn',
      message: `Bạn có chắc chắn muốn xóa bàn: ${item.name} không?`,
      type: 'confirm',
      confirmText: 'Xóa bàn',
      cancelText: 'Hủy',
      onConfirm: async () => {
        try {
          const res = await api.delete(`/store/customers/${item.id}`);
          if (res.data.success) {
            handleRefresh();
          }
        } catch (err) {
          popupModalRef.current?.show({
            title: 'Lỗi',
            message: err.response?.data?.message || 'Không thể xóa bàn.',
            type: 'error',
          });
        }
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <View style={styles.contentWrapper}>
        {/* HEADER đơn giản: Nút Quay lại bên trái, Profile chủ tài khoản bên phải (Avatar bên trái Tên) */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButtonNew}
            onPress={() => router.replace('/')}
            activeOpacity={0.7}
          >
            <Text style={styles.backTextNew}>← Quay lại</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.merchantProfileCardRight}
            onPress={() => profileModalRef.current?.open()}
            activeOpacity={0.7}
          >
            <View style={styles.avatarContainerRight}>
              <Text style={styles.avatarTextRight}>
                {(auth.user?.name || 'Hoa').trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.merchantDetailsRight}>
              <Text style={styles.merchantGreetingRight}>Chủ tài khoản 👋</Text>
              <Text style={styles.merchantNameRight}>{auth.user?.name || 'Cô Hoa'}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* TỔNG DOANH THU: Giao diện thẻ lớn đỏ hồng/tím nổi bật */}
        <View style={styles.summaryCard}>
          <TouchableOpacity
            style={styles.summaryMainRow}
            onPress={() => setShowDailyRevModal(true)}
            activeOpacity={0.85}
          >
            <View>
              <Text style={styles.summaryLabel}>💰 TỔNG DOANH THU CỬA HÀNG:</Text>
              <Text style={styles.summaryHint}>Bấm để xem lịch sử theo ngày</Text>
            </View>
            <Text style={styles.summaryValue}>{formatCurrency(totalRevenue)}</Text>
          </TouchableOpacity>
        </View>

        {/* NÚT THỐNG KÊ DOANH THU TRONG NGÀY */}
        <TouchableOpacity
          style={styles.dailyReportButton}
          onPress={() => setShowDailyRevModal(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.dailyReportButtonText}>📈 THỐNG KÊ DOANH THU TRONG NGÀY</Text>
        </TouchableOpacity>

        {/* HÀNG 4 NÚT TIỆN ÍCH AI & QUẢN LÝ */}
        <View style={styles.actionRowContainer}>
          <TouchableOpacity
            style={[styles.actionRowButton, styles.btnMeat]}
            onPress={() => addMenuModalRef.current?.open()}
            activeOpacity={0.7}
          >
            <Text style={styles.actionRowButtonTextWhite}>Thực đơn</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRowButton, styles.btnCustomer]}
            onPress={() => addTableModalRef.current?.open()}
            activeOpacity={0.7}
          >
            <Text style={styles.actionRowButtonTextWhite}>Thêm bàn</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRowButton, styles.btnScan]}
            onPress={handleScanInvoiceMock}
            activeOpacity={0.7}
          >
            <Text style={styles.actionRowButtonTextWhite}>Chụp hóa đơn</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionRowButton,
              styles.btnVoice,
              isRecording && styles.btnVoiceRecording,
              scanning && styles.actionRowButtonDisabled,
            ]}
            disabled={scanning}
            onPress={handleToggleRecording}
            activeOpacity={0.7}
          >
            {scanning ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.actionRowButtonTextWhite}>{isRecording ? '⏹️ Dừng' : 'Giọng nói'}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Ô Tìm Kiếm */}
        <View style={styles.searchSection}>
          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Gõ tên hoặc vị trí bàn ăn..."
              placeholderTextColor={COLORS.textLight}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>

        {/* Danh sách các bàn ăn */}
        <View style={styles.listSectionHeader}>
          <Text style={styles.listTitle}>📋 QUẢN LÝ BÀN ({tables.length})</Text>
          <Text style={styles.legendText}>🟢 Xanh: còn trống  |  🔴 Đỏ: đã có người ngồi</Text>
        </View>

        <FlatList
          style={{ flex: 1 }}
          data={filteredTables}
          keyExtractor={(item) => item.id.toString()}
          numColumns={4}
          columnWrapperStyle={styles.tableGridRow}
          contentContainerStyle={styles.tableGridContainer}
          refreshControl={<RefreshControl refreshing={isRefetchingTables} onRefresh={handleRefresh} colors={['#5B21B6']} />}
          ListEmptyComponent={
            isLoadingTables
              ? <ActivityIndicator size="large" color="#5B21B6" style={{ marginTop: 40 }} />
              : <Text style={styles.emptyText}>Chưa có bàn nào phù hợp với tìm kiếm.</Text>
          }
          renderItem={({ item }) => {
            const hasDebt = item.debt > 0;
            return (
              <TouchableOpacity
                style={[
                  styles.tableSquareCard,
                  { width: cardSize, height: cardSize },
                  hasDebt ? styles.tableSquareServing : styles.tableSquareEmpty,
                ]}
                onPress={() => {
                  setSelectedCustomerId(item.id);
                  orderModalRef.current?.open(item);
                }}
                onLongPress={() => {
                  setSelectedCustomerId(item.id);
                  popupModalRef.current?.show({
                    title: `Thao tác với ${item.name}`,
                    message: `Bạn muốn thực hiện thao tác nào với ${item.name}?`,
                    type: 'confirm',
                    confirmText: 'Đổi tên',
                    cancelText: 'Xóa bàn',
                    onConfirm: () => handleRenameTable(item),
                    onCancel: () => handleDeleteTable(item),
                  });
                }}
                delayLongPress={500}
                activeOpacity={0.7}
              >
                {/* Dấu tròn trạng thái ở góc trên bên phải */}
                <View style={[styles.statusDot, { backgroundColor: hasDebt ? '#EF4444' : '#10B981' }]} />

                <Text
                  style={[
                    styles.tableSquareName,
                    hasDebt ? styles.tableSquareNameServing : styles.tableSquareNameEmpty,
                  ]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>

                {hasDebt ? (
                  <Text style={styles.tableSquareBill} numberOfLines={1}>
                    {formatShortAmount(item.debt)}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Modal Báo cáo Doanh thu theo Ngày */}
      <SmoothModal visible={showDailyRevModal} onClose={() => setShowDailyRevModal(false)}>
        <View style={styles.modalView}>
          <Text style={styles.modalTitle}>📈 DOANH THU THEO NGÀY</Text>
          <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
            {dailyRevenues.map((item) => (
              <View key={item.dateKey} style={styles.revenueItemRow}>
                <Text style={styles.revenueItemDate}>{convertIsoToDisplay(item.dateKey)}</Text>
                <Text style={styles.revenueItemAmount}>{formatCurrency(item.amount)}</Text>
              </View>
            ))}
            {dailyRevenues.length === 0 && (
              <Text style={styles.emptyText}>Chưa có doanh thu phát sinh.</Text>
            )}
          </ScrollView>
          <TouchableOpacity style={styles.closeBtn} onPress={() => setShowDailyRevModal(false)}>
            <Text style={styles.closeBtnText}>Đóng</Text>
          </TouchableOpacity>
        </View>
      </SmoothModal>

      {/* Các Modals nghiệp vụ */}
      <AddTableModal ref={addTableModalRef} onRefresh={handleRefresh} />
      <AddMenuModal ref={addMenuModalRef} />
      <ScanInvoiceModal ref={scanInvoiceModalRef} onRefresh={handleRefresh} />
      <OrderModal ref={orderModalRef} customerId={selectedCustomerId} onRefresh={handleRefresh} />
      <TablePaymentModal ref={paymentModalRef} customerId={selectedCustomerId} onRefresh={handleRefresh} />
      <StorePopupModal ref={popupModalRef} />
      <ProfileModal ref={profileModalRef} />
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
    position: 'relative',
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
    borderColor: '#F1F5F9', // Viền siêu mỏng nhạt màu
    ...SHADOWS.card,
  },
  backButtonNew: {
    width: 90,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  backTextNew: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
  },
  merchantProfileCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainerRight: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    marginRight: 10,
  },
  avatarTextRight: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#5B21B6',
  },
  merchantDetailsRight: {
    alignItems: 'flex-start',
  },
  merchantGreetingRight: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  merchantNameRight: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
    maxWidth: 150,
  },
  summaryCard: {
    backgroundColor: '#F5F3FF', // Tông tím nhạt
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    ...SHADOWS.card,
  },
  summaryMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#5B21B6',
  },
  summaryHint: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#6D28D9',
    textAlign: 'right',
    flexShrink: 0,
  },
  dailyReportButton: {
    height: 40,
    backgroundColor: '#EDE9FE',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.card,
  },
  dailyReportButtonText: {
    color: '#5B21B6',
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  actionRowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  },
  actionRowButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    ...SHADOWS.card,
  },
  actionRowButtonDisabled: {
    opacity: 0.45,
  },
  btnMeat: {
    backgroundColor: '#BE123C',
    borderColor: '#9F1239',
  },
  btnCustomer: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  btnScan: {
    backgroundColor: '#4F46E5',
    borderColor: '#4338CA',
  },
  btnVoice: {
    backgroundColor: '#7C3AED',
    borderColor: '#6D28D9',
  },
  btnVoiceRecording: {
    backgroundColor: '#EF4444',
    borderColor: '#DC2626',
  },
  actionRowButtonTextWhite: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
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
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  tableGridContainer: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  tableGridRow: {
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
  tableSquareEmpty: {
    backgroundColor: '#F0FDF4', // Màu xanh lục pastel dịu mát cho bàn trống
    borderColor: '#BBF7D0',
  },
  tableSquareServing: {
    backgroundColor: '#FEF2F2', // Màu hồng pastel ấm áp cho bàn có khách
    borderColor: '#FCA5A5',
  },
  statusDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  tableSquareName: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  tableSquareNameEmpty: {
    color: '#059669', // Chữ màu xanh lục đậm
  },
  tableSquareNameServing: {
    color: '#DC2626', // Chữ màu đỏ đậm
  },
  tableSquareBill: {
    fontSize: 12,
    color: '#DC2626', // Chữ bill màu đỏ đậm nổi bật
    fontWeight: 'bold',
    marginTop: 4,
  },
  actionMenuContainer: {
    position: 'relative',
    zIndex: 100,
  },
  threeDotsBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  threeDotsText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 36,
    right: 0,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: 110,
    zIndex: 999,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'flex-start',
  },
  dropdownItemText: {
    fontSize: 13,
    color: COLORS.text,
  },
  menuDivider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  deleteText: {
    color: COLORS.danger,
  },
  emptyText: {
    color: COLORS.textLight,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 20,
    width: '100%',
  },
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#5B21B6',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalList: {
    marginBottom: 16,
  },
  revenueItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  revenueItemDate: {
    fontSize: 14,
    color: COLORS.text,
  },
  revenueItemAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#5B21B6',
  },
  closeBtn: {
    backgroundColor: COLORS.inputBg,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: COLORS.textSecondary,
    fontWeight: 'bold',
    fontSize: 14,
  },
});
