// meat-management-fe/src/components/DailyBundlePreviewModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Image,
  ScrollView,
} from 'react-native';
import { COLORS, FONTS } from '../theme';
import SmoothModal from './SmoothModal';
import ImagePreviewModal from './ImagePreviewModal';
import { showGlobalToast } from '../store/toastStore';
import {
  downloadOrShareImage,
  downloadOrShareMultipleImages,
  isMobileDevice,
} from '../utils/imageShareHelper';
import { exportDailyReportBundle } from '../utils/dailyBundleExportHelper';

/**
 * Modal Xem trước & Chia sẻ trọn bộ 3 ảnh báo cáo ngày (Mobile-First Bottom-Sheet):
 * - Báo cáo công nợ ngày
 * - Khách quen chưa lên đơn hôm nay
 * - Báo cáo đơn nợ trùng trong ngày
 * - ĐẶC BIỆT: Ghép 1 ảnh dài tổng hợp duy nhất để tránh 100% bug Zalo Mobile gửi ảnh trùng lặp!
 */
const DailyBundlePreviewModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('Đang khởi tạo...');
  const [selectedDate, setSelectedDate] = useState('');
  const [bundleData, setBundleData] = useState(null);
  const [sharingCombined, setSharingCombined] = useState(false);
  const [sharingAll, setSharingAll] = useState(false);
  const [sharingSingleId, setSharingSingleId] = useState(null);

  const imagePreviewModalRef = useRef(null);

  // Mở modal và tự động tạo trọn bộ ảnh
  useImperativeHandle(ref, () => ({
    open: async ({
      selectedDate: targetDate,
      transactions = null,
      payments = null,
      customers = null,
    }) => {
      setVisible(true);
      setLoading(true);
      setSelectedDate(targetDate);
      setBundleData(null);
      setLoadingStep('Đang chuẩn bị dữ liệu báo cáo...');

      try {
        const result = await exportDailyReportBundle({
          selectedDate: targetDate,
          transactions,
          payments,
          customers,
          returnImagesOnly: true,
          onProgress: (msg) => setLoadingStep(msg),
        });

        if (result && result.success) {
          setBundleData(result);
        } else {
          showGlobalToast('Không thể tạo trọn bộ ảnh báo cáo.', 'error');
        }
      } catch (err) {
        console.error('[DAILY BUNDLE PREVIEW ERROR]', err);
        showGlobalToast('Đã xảy ra lỗi khi tạo hình ảnh báo cáo.', 'error');
      } finally {
        setLoading(false);
      }
    },
    close: () => {
      setVisible(false);
    },
  }));

  const isMobile = isMobileDevice();

  // Xử lý gửi 1 ảnh dài tổng hợp duy nhất qua Zalo (Giải pháp chống trùng 100%)
  const handleShareCombined = async () => {
    if (!bundleData?.combinedImg || sharingCombined) return;
    setSharingCombined(true);
    try {
      const cleanDate = (selectedDate || '').replace(/\//g, '_');
      await downloadOrShareImage({
        imageUri: bundleData.combinedImg,
        fileName: `BaoCaoTongHop_ToanDien_${cleanDate}.png`,
        title: `Báo cáo tổng hợp toàn diện ngày ${selectedDate}`,
        text: `Báo cáo công nợ ngày, khách quen sót đơn và đơn nợ trùng ngày ${selectedDate}`,
      });
    } catch (err) {
      console.error('Lỗi khi gửi ảnh dài tổng hợp:', err);
      showGlobalToast('Không thể chia sẻ ảnh tổng hợp.', 'error');
    } finally {
      setSharingCombined(false);
    }
  };

  // Xử lý gửi riêng 1 ảnh cụ thể
  const handleShareSingle = async (item) => {
    if (!item?.imageUri || sharingSingleId) return;
    setSharingSingleId(item.id);
    try {
      await downloadOrShareImage({
        imageUri: item.imageUri,
        fileName: item.fileName,
        title: item.title,
        text: item.title,
      });
    } catch (err) {
      console.error('Lỗi khi chia sẻ ảnh đơn lẻ:', err);
      showGlobalToast('Không thể chia sẻ ảnh này.', 'error');
    } finally {
      setSharingSingleId(null);
    }
  };

  // Xử lý chia sẻ cả 3 ảnh riêng biệt
  const handleShareAllSeparate = async () => {
    if (!bundleData?.itemsToExport || bundleData.itemsToExport.length === 0 || sharingAll) return;
    setSharingAll(true);
    try {
      await downloadOrShareMultipleImages({
        items: bundleData.itemsToExport,
        title: `Trọn bộ 3 ảnh báo cáo ngày ${selectedDate}`,
        text: `Báo cáo công nợ, khách chưa lên đơn và đơn trùng ngày ${selectedDate}`,
      });
    } catch (err) {
      console.error('Lỗi khi chia sẻ 3 ảnh:', err);
      showGlobalToast('Không thể chia sẻ trọn bộ ảnh.', 'error');
    } finally {
      setSharingAll(false);
    }
  };

  // Xem phóng to ảnh
  const handlePreviewZoom = (imageUri) => {
    if (!imageUri) return;
    imagePreviewModalRef.current?.open(imageUri);
  };

  const imageList = bundleData?.itemsToExport || [];

  return (
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)}>
        <View style={styles.modalView}>
          {/* Header Modal chuẩn Mobile-First */}
          <View style={styles.modalHeaderRow}>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                📦 TRỌN BỘ ẢNH BÁO CÁO NGÀY {selectedDate}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeHeaderBtn}
              onPress={() => setVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.closeHeaderBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Nội dung Modal cuộn mượt */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#059669" size="large" />
              <Text style={styles.loadingText}>{loadingStep}</Text>
              <Text style={styles.loadingSubText}>Hệ thống đang chuẩn bị độ phân giải sắc nét...</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.modalBodyScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {/* Banner Mẹo chống trùng Zalo trên Mobile */}
              <View style={styles.tipCard}>
                <Text style={styles.tipTitle}>💡 MẸO CHỐNG LỖI TRÙNG ẢNH TRÊN ZALO MOBILE</Text>
                <Text style={styles.tipDesc}>
                  Khi chia sẻ nhiều ảnh cùng lúc, Zalo điện thoại có thể hiển thị ảnh bị trùng nhau. Hãy bấm nút{' '}
                  <Text style={styles.tipHighlight}>"GỬI 1 ẢNH DÀI TỔNG HỢP"</Text> để gửi 1 bức ảnh duy nhất chứa trọn vẹn cả 3 báo cáo (100% không bao giờ bị trùng ảnh)!
                </Text>
              </View>

              {/* Nút 1: Gửi 1 ảnh dài tổng hợp (Khuyên dùng) */}
              {bundleData?.combinedImg && (
                <View style={styles.combinedActionBox}>
                  <TouchableOpacity
                    style={styles.btnCombinedShare}
                    onPress={handleShareCombined}
                    disabled={sharingCombined}
                    activeOpacity={0.8}
                  >
                    {sharingCombined ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Text style={styles.btnCombinedShareText} numberOfLines={1}>
                          {isMobile ? '🚀 GỬI 1 ẢNH DÀI TỔNG HỢP QUA ZALO' : '💾 TẢI 1 ẢNH DÀI TỔNG HỢP VỀ MÁY'}
                        </Text>
                        <Text style={styles.btnCombinedShareSubText}>
                          ⭐ Khuyên dùng cho Zalo Mobile • Tránh 100% lỗi trùng ảnh
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.btnPreviewCombined}
                    onPress={() => handlePreviewZoom(bundleData.combinedImg)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.btnPreviewCombinedText}>🔍 Xem trước ảnh dài tổng hợp</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Danh sách 3 ảnh báo cáo chi tiết */}
              <Text style={styles.sectionHeaderTitle}>📸 HOẶC GỬI RIÊNG TỪNG ẢNH BÁO CÁO:</Text>

              {imageList.map((item, index) => {
                const isItemSharing = sharingSingleId === item.id;
                return (
                  <View key={item.id || index} style={styles.imageItemCard}>
                    <TouchableOpacity
                      style={styles.thumbWrapper}
                      onPress={() => handlePreviewZoom(item.imageUri)}
                      activeOpacity={0.85}
                    >
                      <Image
                        source={{ uri: item.imageUri }}
                        style={styles.thumbImage}
                        resizeMode="cover"
                      />
                      <View style={styles.zoomBadge}>
                        <Text style={styles.zoomBadgeText}>🔍 Phóng to</Text>
                      </View>
                    </TouchableOpacity>

                    <View style={styles.itemInfoCol}>
                      <Text style={styles.itemTitleText} numberOfLines={2}>
                        {index + 1}. {item.title}
                      </Text>

                      <View style={styles.itemBtnGroup}>
                        <TouchableOpacity
                          style={styles.btnItemZoom}
                          onPress={() => handlePreviewZoom(item.imageUri)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.btnItemZoomText}>👁️ Xem</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.btnItemShare}
                          onPress={() => handleShareSingle(item)}
                          disabled={isItemSharing}
                          activeOpacity={0.8}
                        >
                          {isItemSharing ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                          ) : (
                            <Text style={styles.btnItemShareText}>
                              {isMobile ? '📲 Gửi Zalo' : '💾 Tải ảnh'}
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}

              {/* Nút hành động chia sẻ cả 3 file riêng biệt */}
              {imageList.length > 0 && (
                <TouchableOpacity
                  style={styles.btnShareAllSeparate}
                  onPress={handleShareAllSeparate}
                  disabled={sharingAll}
                  activeOpacity={0.8}
                >
                  {sharingAll ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.btnShareAllSeparateText}>
                      {isMobile ? '📤 CHUYỂN TIẾP CẢ 3 ẢNH RIÊNG BIỆT VÀO ZALO' : '💾 TẢI CẢ 3 ẢNH VỀ MÁY TÍNH'}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </ScrollView>
          )}

          {/* Footer nút đóng neo sát đáy */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.closeFooterBtn}
              onPress={() => setVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.closeFooterBtnText}>ĐÓNG LẠI</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SmoothModal>

      {/* Modal phóng to xem ảnh toàn màn hình độc lập bên ngoài */}
      <ImagePreviewModal ref={imagePreviewModalRef} />
    </>
  );
});

export default DailyBundlePreviewModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    maxHeight: '94%',
    flex: 1,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitleWrap: {
    flex: 1,
    paddingRight: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  closeHeaderBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeHeaderBtnText: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: 'bold',
  },
  loadingContainer: {
    paddingVertical: 50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
    textAlign: 'center',
  },
  loadingSubText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  modalBodyScroll: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 12,
    gap: 12,
  },
  tipCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 10,
  },
  tipTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#92400E',
    marginBottom: 4,
  },
  tipDesc: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 17,
  },
  tipHighlight: {
    fontWeight: 'bold',
    color: '#047857',
  },
  combinedActionBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  btnCombinedShare: {
    backgroundColor: '#059669',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCombinedShareText: {
    fontSize: 14.5,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  btnCombinedShareSubText: {
    fontSize: 11,
    color: '#D1FAE5',
    marginTop: 2,
    textAlign: 'center',
  },
  btnPreviewCombined: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPreviewCombinedText: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#047857',
  },
  sectionHeaderTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#475569',
    marginTop: 4,
  },
  imageItemCard: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    gap: 12,
    alignItems: 'center',
  },
  thumbWrapper: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  zoomBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingVertical: 2,
    alignItems: 'center',
  },
  zoomBadgeText: {
    fontSize: 9,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  itemInfoCol: {
    flex: 1,
    gap: 8,
  },
  itemTitleText: {
    fontSize: 13.5,
    fontWeight: 'bold',
    color: '#1E293B',
    lineHeight: 18,
  },
  itemBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnItemZoom: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  btnItemZoomText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#334155',
  },
  btnItemShare: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnItemShareText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  btnShareAllSeparate: {
    backgroundColor: '#1E293B',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  btnShareAllSeparateText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  modalFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  closeFooterBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFooterBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#475569',
  },
});
