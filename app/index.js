// meat-management-fe/app/index.js
import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../src/api/client';
import { useAuthStore } from '../src/store/authStore';
import { COLORS, FONTS, SHADOWS } from '../src/theme';
import AddCustomerModal from '../src/components/AddCustomerModal';
import ProductListModal from '../src/components/ProductListModal';
import ProfileModal from '../src/components/ProfileModal';
import EditCustomerModal from '../src/components/EditCustomerModal';
import PopupModal from '../src/components/PopupModal';
import ScanTicketModal from '../src/components/ScanTicketModal';
import ExportDebtModal from '../src/components/ExportDebtModal';
import DebtModal from '../src/components/DebtModal';
import PaymentModal from '../src/components/PaymentModal';
import TransactionDetailModal from '../src/components/TransactionDetailModal';
import EditDebtModal from '../src/components/EditDebtModal';
import EditPaymentModal from '../src/components/EditPaymentModal';
import CustomerDebtHistoryModal from '../src/components/CustomerDebtHistoryModal';

export default function DashboardScreen() {
  const router = useRouter();
  const auth = useAuthStore();
  const modalRef = useRef(null);
  const productModalRef = useRef(null);
  const profileModalRef = useRef(null);
  const editCustomerModalRef = useRef(null);
  const popupModalRef = useRef(null);
  const scanTicketModalRef = useRef(null);
  const exportDebtModalRef = useRef(null);
  const customerDebtHistoryModalRef = useRef(null);
  const debtModalRef = useRef(null);
  const paymentModalRef = useRef(null);
  const detailModalRef = useRef(null);
  const editDebtModalRef = useRef(null);
  const editPaymentModalRef = useRef(null);

  const [search, setSearch] = useState('');
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);

  const [isRecording, setIsRecording] = useState(false);
  const [scanning, setScanning] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // 1. Dùng React Query tải danh sách khách hàng và cache lại
  const { data: customersResponse, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await api.get('/customers');
      return response.data;
    },
  });

  // Xử lý xác nhận xóa khách hàng trực tiếp trên trang chủ qua PopupModal
  const confirmDeleteCustomer = (customerId, customerName) => {
    popupModalRef.current?.show({
      title: 'Xác nhận xóa',
      message: `Bạn có chắc chắn muốn xóa khách hàng "${customerName}" không? Mọi lịch sử giao dịch liên quan sẽ không thể truy cập trực tiếp nữa.`,
      type: 'confirm',
      confirmText: 'Xóa ngay',
      cancelText: 'Hủy bỏ',
      onConfirm: () => handleDeleteCustomer(customerId),
    });
  };

  // Gửi yêu cầu xóa khách hàng lên backend và làm mới danh sách
  const handleDeleteCustomer = async (customerId) => {
    try {
      const response = await api.delete(`/customers/${customerId}`);
      if (response.data.success) {
        popupModalRef.current?.show({
          title: 'Thành công',
          message: 'Đã xóa khách hàng thành công.',
          type: 'success',
          onConfirm: () => refetch(),
        });
      } else {
        popupModalRef.current?.show({
          title: 'Thất bại',
          message: response.data.message || 'Không thể xóa khách hàng.',
          type: 'error',
        });
      }
    } catch (err) {
      console.error(err);
      popupModalRef.current?.show({
        title: 'Lỗi kết nối',
        message: err.response?.data?.message || 'Có lỗi xảy ra khi kết nối máy chủ để xóa khách hàng.',
        type: 'error',
      });
    }
  };

  // Xử lý thu âm và phân tích ghi nợ giọng nói qua backend/Gemini
  const handleToggleRecording = async () => {
    if (Platform.OS !== 'web') {
      popupModalRef.current?.show({
        title: 'Thông báo',
        message: 'Chức năng ghi nợ giọng nói hiện hỗ trợ trên giao diện Web.',
        type: 'info'
      });
      return;
    }

    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunksRef.current = [];

        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach((track) => track.stop());

          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64Audio = reader.result;

            setScanning(true);
            try {
              const response = await api.post('/transactions/voice-to-text', {
                audio: base64Audio,
                mimeType: 'audio/webm'
              }, { timeout: 120000 });

              if (response.data.success) {
                const { customerId, customerName, data } = response.data;
                const { date, items, note } = data;
                scanTicketModalRef.current?.open(items, '🎤 KẾT QUẢ GHI NỢ GIỌNG NÓI', note, date, customerName, customerId);
              } else {
                popupModalRef.current?.show({
                  title: 'Thất bại',
                  message: response.data.message || 'Không thể dịch giọng nói.',
                  type: 'error'
                });
              }
            } catch (err) {
              console.error(err);
              popupModalRef.current?.show({
                title: err.response?.status === 400 ? 'Lỗi nhận diện' : 'Lỗi kết nối',
                message: err.response?.data?.message || 'Có lỗi xảy ra khi kết nối máy chủ dịch giọng nói.',
                type: 'error'
              });
            } finally {
              setScanning(false);
            }
          };
          reader.readAsDataURL(audioBlob);
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error(err);
        popupModalRef.current?.show({
          title: 'Lỗi thiết bị',
          message: 'Không thể truy cập Micro. Vui lòng cấp quyền micro cho trình duyệt.',
          type: 'error'
        });
      }
    }
  };

  const customers = customersResponse?.data || [];

  // 2. Tính toán tổng nợ của toàn bộ khách hàng để hiển thị
  const totalDebt = customers.reduce((sum, c) => sum + (c.debt || 0), 0);

  // 3. Bộ lọc tìm kiếm nhanh theo tên hoặc SĐT khách hàng
  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone && c.phone.includes(search))
  );

  // Định dạng hiển thị tiền VNĐ (Ví dụ: 1.500.000 đ)
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount).replace('₫', 'đ');
  };

  const renderCustomerItem = ({ item }) => {
    const hasDebt = item.debt > 0;
    // Lấy chữ cái đầu của tên khách hàng làm avatar
    const firstLetter = (item.name || 'K').trim().charAt(0).toUpperCase();

    // Xác định màu nền avatar ngẫu nhiên dựa trên tên để sinh động
    const avatarBgColors = ['#FFE2E2', '#E3F2FD', '#E8F5E9', '#FFF3E0', '#F3E5F5', '#E0F7FA'];
    const avatarTextColors = ['#D32F2F', '#1976D2', '#388E3C', '#F57C00', '#7B1FA2', '#0097A7'];
    const charCode = item.name ? item.name.charCodeAt(0) : 0;
    const colorIdx = charCode % avatarBgColors.length;
    const avatarBg = avatarBgColors[colorIdx];
    const avatarText = avatarTextColors[colorIdx];

    return (
      <View
        style={[
          styles.customerCard,
          hasDebt ? styles.customerCardDebtStripe : styles.customerCardNoDebtStripe,
          activeMenuId === item.id && { zIndex: 10, elevation: 10 }
        ]}
      >
        <TouchableOpacity
          style={styles.customerCardClickable}
          onPress={() => router.push(`/customer/${item.id}`)}
          activeOpacity={0.7}
        >
          {/* PHẦN TRÊN: Thông tin khách hàng và dư nợ */}
          <View style={styles.cardHeaderSection}>
            {/* Avatar chữ cái đại diện */}
            <View style={[styles.customerAvatar, { backgroundColor: avatarBg }]}>
              <Text style={[styles.customerAvatarText, { color: avatarText }]}>{firstLetter}</Text>
            </View>

            {/* Thông tin tên & số điện thoại */}
            <View style={styles.cardInfo}>
              <Text style={styles.customerName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.customerPhone} numberOfLines={1}>
                {item.phone ? `📞 ${item.phone}` : '📞 Không có số điện thoại'}
              </Text>
            </View>

            {/* Trạng thái công nợ bên phải */}
            <View style={styles.cardDebtStatusSection}>
              {hasDebt ? (
                <View style={styles.debtValueContainer}>
                  <Text style={styles.debtValueAmount}>{formatCurrency(item.debt)}</Text>
                  <Text style={styles.debtValueLabel}>còn nợ ⚠️</Text>
                </View>
              ) : (
                <View style={styles.noDebtBadge}>
                  <Text style={styles.noDebtBadgeText}>Hết nợ ✅</Text>
                </View>
              )}
            </View>
          </View>

          {/* Đường phân cách nét đứt nhẹ */}
          <View style={styles.cardDivider} />

          {/* PHẦN DƯỚI: Các nút hành động */}
          <View style={styles.cardDebtContainer}>
            <View style={styles.actionsRightGroup}>
              <TouchableOpacity
                style={styles.viewDebtBtn}
                onPress={(e) => {
                  if (e && e.stopPropagation) {
                    e.stopPropagation();
                  }
                  setSelectedCustomerId(item.id);
                  customerDebtHistoryModalRef.current?.open(item);
                }}
                activeOpacity={0.6}
              >
                <Text style={styles.viewDebtBtnText}>👁️ Xem nợ</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.addDebtBtn}
                onPress={(e) => {
                  if (e && e.stopPropagation) {
                    e.stopPropagation();
                  }
                  setSelectedCustomerId(item.id);
                  debtModalRef.current?.open();
                }}
                activeOpacity={0.6}
              >
                <Text style={styles.addDebtBtnText}>🔴 Ghi nợ</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.exportDebtBtn}
                onPress={(e) => {
                  if (e && e.stopPropagation) {
                    e.stopPropagation();
                  }
                  exportDebtModalRef.current?.open(item);
                }}
                activeOpacity={0.6}
              >
                <Text style={styles.exportDebtBtnText}>📊 Xuất nợ</Text>
              </TouchableOpacity>

              <View style={styles.actionMenuContainer}>
                <TouchableOpacity
                  style={styles.threeDotsBtn}
                  onPress={(e) => {
                    if (e && e.stopPropagation) {
                      e.stopPropagation();
                    }
                    setActiveMenuId(activeMenuId === item.id ? null : item.id);
                  }}
                  activeOpacity={0.6}
                >
                  <Text style={styles.threeDotsText}>⋮</Text>
                </TouchableOpacity>

                {activeMenuId === item.id && (
                  <View style={styles.dropdownMenu}>
                    <TouchableOpacity
                      style={styles.dropdownItem}
                      onPress={(e) => {
                        if (e && e.stopPropagation) {
                          e.stopPropagation();
                        }
                        setActiveMenuId(null);
                        editCustomerModalRef.current?.open(item);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>✏️ Sửa</Text>
                    </TouchableOpacity>
                    <View style={styles.menuDivider} />
                    <TouchableOpacity
                      style={styles.dropdownItem}
                      onPress={(e) => {
                        if (e && e.stopPropagation) {
                          e.stopPropagation();
                        }
                        setActiveMenuId(null);
                        confirmDeleteCustomer(item.id, item.name);
                      }}
                    >
                      <Text style={[styles.dropdownItemText, styles.deleteText]}>🗑️ Xóa</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const CustomCellRenderer = (cellProps) => {
    const isMenuOpen = activeMenuId === cellProps.item?.id;
    return (
      <View
        {...cellProps}
        style={[
          cellProps.style,
          { zIndex: isMenuOpen ? 999 : 1, elevation: isMenuOpen ? 999 : 1 }
        ]}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <View style={styles.contentWrapper}>
        {/* HEADER: Thiết kế mới sang trọng, gồm Avatar, Thông tin chủ sạp và Nút Đăng xuất */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.merchantProfileCard}
            onPress={() => profileModalRef.current?.open()}
            activeOpacity={0.7}
          >
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarText}>
                {(auth.user?.name || 'Hoa').trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.merchantDetails}>
              <Text style={styles.merchantGreeting}>Chủ sạp thịt quản lý 👋</Text>
              <Text style={styles.merchantName}>{auth.user?.name || 'Cô Hoa'}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutButtonNew}
            onPress={() => auth.logout()}
            activeOpacity={0.7}
          >
            <Text style={styles.logoutTextNew}>Thoát 🚪</Text>
          </TouchableOpacity>
        </View>

        {/* TỔNG TIỀN NỢ: To rõ, thu hút sự chú ý ngay */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>💰 TỔNG TIỀN NỢ:</Text>
          <Text style={styles.summaryValue}>{formatCurrency(totalDebt)}</Text>
        </View>

        {/* Ô TÌM KIẾM NHANH KHÁCH QUEN */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="🔍 Gõ tên hoặc SĐT khách quen..."
            placeholderTextColor={COLORS.textLight}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity style={styles.clearSearch} onPress={() => setSearch('')}>
              <Text style={styles.clearSearchText}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.listHeaderContainer}>
          <Text style={styles.listHeader}>👥 SỔ GHI NỢ KHÁCH QUEN ({filteredCustomers.length})</Text>
        </View>

        {/* DANH SÁCH KHÁCH HÀNG */}
        {isLoading ? (
          <ActivityIndicator size="large" color={COLORS.primaryDark} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={filteredCustomers}
            renderItem={renderCustomerItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshing={isRefetching}
            onRefresh={refetch}
            CellRendererComponent={CustomCellRenderer}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Chưa có ai trong danh sách. Hãy nhấn nút phía dưới để thêm!</Text>
              </View>
            }
          />
        )}

        {/* BANNER HƯỚNG DẪN GHI ÂM */}
        {isRecording && (
          <View style={styles.recordingBanner}>
            <Text style={styles.recordingBannerText}>
              🛑 Đang ghi âm... Hãy nói rõ: "Tên khách, ngày, tên thịt, số kg, giá" (ví dụ: Anh Khải ngày 23/6 1 cân bắp bò giá 28...)
            </Text>
          </View>
        )}

        {/* OVERLAY KHI ĐANG PHÂN TÍCH GIỌNG NÓI BẰNG AI */}
        {scanning && (
          <View style={styles.scanningOverlay}>
            <ActivityIndicator size="large" color={COLORS.primaryDark} />
            <Text style={styles.scanningText}>AI đang phân tích giọng nói...</Text>
          </View>
        )}

        {/* THANH ĐIỀU KHIỂN CỐ ĐỊNH Ở ĐÁY MÀN HÌNH */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.manageProductsButton}
            onPress={() => productModalRef.current?.open()}
            activeOpacity={0.8}
          >
            <Text style={styles.manageProductsButtonText}>🥩 QUẢN LÝ THỊT</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.voiceButton, isRecording && styles.voiceButtonRecording]}
            onPress={handleToggleRecording}
            activeOpacity={0.8}
          >
            <Text style={styles.voiceButtonText}>{isRecording ? '🛑' : '🎤'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addCustomerButton}
            onPress={() => modalRef.current?.open()}
            activeOpacity={0.8}
          >
            <Text style={styles.addCustomerButtonText}>➕ THÊM KHÁCH</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* MODAL THÊM KHÁCH MỚI (Ẩn) */}
      <AddCustomerModal ref={modalRef} onRefresh={refetch} />

      {/* MODAL SỬA KHÁCH HÀNG (Ẩn) */}
      <EditCustomerModal ref={editCustomerModalRef} onRefresh={refetch} />

      {/* MODAL HỒ SƠ CHỦ TÀI KHOẢN (Ẩn) */}
      <ProfileModal ref={profileModalRef} />

      {/* MODAL QUẢN LÝ DANH MỤC THỊT (Ẩn) */}
      <ProductListModal ref={productModalRef} />

      {/* POPUP THÔNG BÁO DÙNG CHUNG (Ẩn) */}
      <PopupModal ref={popupModalRef} />

      {/* MODAL KẾT QUẢ GHI NỢ GIỌNG NÓI (Ẩn) */}
      <ScanTicketModal ref={scanTicketModalRef} onRefresh={refetch} />

      {/* MODAL XUẤT CÔNG NỢ DẠNG ẢNH (Ẩn) */}
      <ExportDebtModal ref={exportDebtModalRef} />

      {/* MODAL XEM CHI TIẾT LỊCH SỬ NỢ THEO THÁNG/NGÀY (Ẩn) */}
      <CustomerDebtHistoryModal
        ref={customerDebtHistoryModalRef}
        paymentModalRef={paymentModalRef}
        detailModalRef={detailModalRef}
        debtModalRef={debtModalRef}
        onRefresh={refetch}
      />

      {/* CÁC SUB-MODAL PHỤC VỤ LỊCH SỬ NỢ */}
      <DebtModal ref={debtModalRef} customerId={selectedCustomerId} onRefresh={refetch} />
      <PaymentModal ref={paymentModalRef} customerId={selectedCustomerId} onRefresh={refetch} />
      <TransactionDetailModal
        ref={detailModalRef}
        customerId={selectedCustomerId}
        onRefresh={refetch}
        onEditTransaction={(transaction) => editDebtModalRef.current?.open(transaction)}
        onEditPayment={(payment) => editPaymentModalRef.current?.open(payment)}
      />
      <EditDebtModal ref={editDebtModalRef} onRefresh={refetch} />
      <EditPaymentModal ref={editPaymentModalRef} onRefresh={refetch} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    backgroundColor: COLORS.background,
    position: 'relative',
    borderLeftWidth: Platform.OS === 'web' ? 1 : 0,
    borderRightWidth: Platform.OS === 'web' ? 1 : 0,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9', // Viền siêu mỏng nhạt màu
    ...SHADOWS.card,
  },
  merchantProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ECFDF5', // Màu xanh bạc hà nhạt
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#047857', // Xanh lá đậm sang trọng
  },
  merchantDetails: {
    flexDirection: 'column',
  },
  merchantGreeting: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  merchantName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  logoutButtonNew: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF1F1', // Nền đỏ hồng pastel siêu nhạt
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  logoutTextNew: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#EF4444',
  },
  summaryCard: {
    backgroundColor: COLORS.dangerLight,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
    ...SHADOWS.card,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.dangerDark,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.danger,
  },
  searchContainer: {
    marginHorizontal: 16,
    marginBottom: 10,
    position: 'relative',
    justifyContent: 'center',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    height: 44, // Giảm chiều cao từ 56 xuống 44
    borderRadius: 10,
    paddingLeft: 14,
    paddingRight: 40,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  clearSearch: {
    position: 'absolute',
    right: 16,
    padding: 6,
  },
  clearSearchText: {
    fontSize: 18,
    color: COLORS.textLight,
    fontWeight: 'bold',
  },
  listHeaderContainer: {
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  listHeader: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 85, // Giảm khoảng trống đệm đáy do bottomBar nhỏ hơn
  },
  // Thẻ khách hàng chứa cả thông tin nhấp và nút xóa bên trong
  customerCard: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  // Nền đỏ nhạt pastel sang trọng cho khách nợ
  customerCardDebt: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  // Nền xanh lá nhạt pastel tươi sáng cho khách không nợ
  customerCardNoDebt: {
    backgroundColor: '#F0FDF4', // Nền xanh lá sáng tươi tắn (Green 50)
    borderColor: '#BBF7D0',     // Viền xanh lá sáng nổi bật hơn (Green 200)
  },
  // Vùng thông tin khách hàng có thể click
  customerCardClickable: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  actionMenuContainer: {
    position: 'relative',
    zIndex: 100,
  },
  threeDotsBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F1F5F9', // Nền xám Slate 100 nhẹ nhàng
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
    width: 110, // Khôi phục lại độ rộng cũ
    zIndex: 999,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  // Nút xem chi tiết nợ của khách hàng
  viewDebtBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#EFF6FF', // Nền xanh da trời nhẹ
    borderWidth: 1,
    borderColor: '#BFDBFE',
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.card,
  },
  viewDebtBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0068FF', // Màu xanh Zalo
  },
  // Nút ghi nợ mới trực tiếp từ trang chủ
  addDebtBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FFF1F1', // Nền đỏ pastel nhạt
    borderWidth: 1,
    borderColor: '#FECACA', // Viền đỏ nhạt
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.card,
  },
  addDebtBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.danger, // Màu đỏ ghi nợ thương hiệu
  },
  // Thẻ khách hàng chứa cả thông tin nhấp và nút xóa bên trong
  customerCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.card,
  },
  customerCardDebtStripe: {
    borderLeftWidth: 5,
    borderLeftColor: COLORS.danger,
  },
  customerCardNoDebtStripe: {
    borderLeftWidth: 5,
    borderLeftColor: COLORS.primary,
  },
  // Vùng thông tin khách hàng có thể click
  customerCardClickable: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  cardHeaderSection: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  customerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  customerAvatarText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  cardInfo: {
    flex: 1,
    paddingRight: 8,
  },
  // Tên khách hàng (giảm cỡ chữ và margin bottom)
  customerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 2,
  },
  // SĐT khách hàng (giảm cỡ chữ xuống caption)
  customerPhone: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  cardDebtStatusSection: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  debtValueContainer: {
    alignItems: 'flex-end',
  },
  debtValueAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.dangerDark,
  },
  debtValueLabel: {
    fontSize: 10,
    color: COLORS.textLight,
    marginTop: 1,
    fontWeight: '600',
  },
  noDebtBadge: {
    backgroundColor: '#ECFDF5',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  noDebtBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#047857',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
    width: '100%',
  },
  cardDebtContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
  },
  quickContactContainer: {
    justifyContent: 'center',
  },
  quickContactLabel: {
    fontSize: 12,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  actionsRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Nút xem chi tiết nợ của khách hàng
  viewDebtBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#EFF6FF', // Nền xanh da trời nhẹ
    borderWidth: 1,
    borderColor: '#BFDBFE',
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.card,
  },
  viewDebtBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0068FF', // Màu xanh Zalo
  },
  // Nút Xuất công nợ đặt trực tiếp trên thẻ khách hàng
  exportDebtBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FFFFFF', // Màu trắng nổi bật trên nền thẻ pastel
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.card, // Tạo độ nổi khối nhẹ
  },
  exportDebtBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.primaryDark, // Màu xanh lá cây đậm thương hiệu
  },
  actionMenuContainer: {
    position: 'relative',
    zIndex: 100,
  },
  threeDotsBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  threeDotsText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginTop: -4,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  menuDivider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  deleteText: {
    color: COLORS.danger,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FONTS.body,
    color: COLORS.textLight,
    textAlign: 'center',
    lineHeight: 22,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(248, 250, 252, 0.95)', // Bán trong suốt nền xám
    paddingVertical: 10, // Giảm từ 16 xuống 10
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row', // Chuyển sang dạng hàng ngang
    justifyContent: 'space-between',
    gap: 12,
  },
  manageProductsButton: {
    flex: 1,
    backgroundColor: '#FAF8F6', // Nền màu kem lanh nhẹ nhàng, cao cấp
    height: 46, // Giảm từ 60 xuống 46
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#7F1D1D', // Viền Bordeaux đồng màu chữ
    shadowColor: '#7F1D1D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  manageProductsButtonText: {
    color: '#7F1D1D', // Màu đỏ đun Bordeaux sang trọng
    fontSize: 14, // Giảm từ 16 xuống 14
    fontWeight: 'bold',
  },
  addCustomerButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    height: 46, // Giảm từ 60 xuống 46
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  addCustomerButtonText: {
    color: '#FFFFFF',
    fontSize: 14, // Giảm từ 16 xuống 14
    fontWeight: 'bold',
  },
  voiceButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  voiceButtonRecording: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
  },
  voiceButtonText: {
    fontSize: 20,
  },
  recordingBanner: {
    position: 'absolute',
    bottom: 70,
    left: 16,
    right: 16,
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    zIndex: 999,
  },
  recordingBannerText: {
    fontSize: 13,
    color: '#B45309',
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 18,
  },
  scanningOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  scanningText: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
});
