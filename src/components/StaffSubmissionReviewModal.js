// meat-management-fe/src/components/StaffSubmissionReviewModal.js
import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle, useMemo, useCallback } from 'react';
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
import StaffSubmissionDetailModal from './StaffSubmissionDetailModal';
import PopupModal from './PopupModal';
import MoneyInput from './MoneyInput';
import { api, API_HOST } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import { showGlobalToast } from '../store/toastStore';
import { removeDiacritics } from '../utils/searchHelper';

// Helper chuẩn hóa URL hình ảnh/video
const resolveMediaUrl = (url) => {
  if (!url) return '';
  let finalUrl = url;
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:') && !url.startsWith('blob:')) {
    finalUrl = `${API_HOST}${url}`;
  }
  // Với video Cloudinary có đuôi .mov từ iPhone, tự động chuyển sang .mp4 để trình duyệt máy tính Windows xem mượt mà
  if (finalUrl && finalUrl.includes('res.cloudinary.com') && /\.mov(\?.*)?$/i.test(finalUrl)) {
    finalUrl = finalUrl.replace(/\.mov(\?.*)?$/i, '.mp4$1');
  }
  return finalUrl;
};

// Helper kiểm tra tệp là video an toàn (kể cả khi DB chưa kịp cập nhật fileType)
const isVideoSubmission = (sub) => {
  if (!sub) return false;
  if (sub.fileType === 'VIDEO') return true;
  const url = (sub.fileUrl || '').toLowerCase();
  return /\.(mp4|mov|webm|avi|mkv)(\?.*)?$/i.test(url);
};

// Helper định dạng tiền VNĐ
const formatCurrency = (amount) =>
  new Intl.NumberFormat('vi-VN').format(Math.round(amount || 0));

// Helper định dạng ngày giờ hiển thị
const formatDateTimeDisplay = (isoDate) => {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} (${hours}:${mins})`;
};

const formatDateOnly = (isoDate) => {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Tạo ghi chú tự động cho đơn trả hàng theo format: "1.5kg bắp(300), 2kg nạc(500)"
 * Là pure function để dùng được cả trong lúc init card lẫn khi toggle loại đơn
 */
const buildReturnNoteFromItems = (items) => {
  if (!items || items.length === 0) return '';
  return items
    .filter((item) => (item.name || item.selectedProduct?.name || item.rawName) && (parseFloat(item.amount) > 0 || ((parseFloat(item.quantity) || 0) > 0 && (parseFloat(item.price) || 0) > 0)))
    .map((item) => {
      const name = item.selectedProduct?.name || item.name || item.rawName || 'thịt';
      const qty = parseFloat(item.quantity) || 0;
      const amt = parseFloat(item.amount) || Math.round(qty * (parseFloat(item.price) || 0));
      const qtyStr = qty > 0 ? `${qty}kg ` : '';
      const amtStr = amt > 0 ? `(${formatCurrency(amt)})` : '';
      return `${qtyStr}${name} ${amtStr}`.trim();
    })
    .filter(Boolean)
    .join(', ');
};


/**
 * Component nút chuyển nhanh hóa đơn ở thanh điều hướng trên cùng.
/**
 * Component nút chuyển nhanh hóa đơn ở thanh điều hướng trên cùng.
 * Được bọc React.memo để không bị re-render vô ích khi người dùng gõ phím bên dưới.
 */
const QuickNavPill = React.memo(
  ({ sub, idx, isApproved, hasCustomer, customerName, onScroll, isMobile }) => (
    <TouchableOpacity
      style={[
        styles.quickNavPill,
        isMobile && styles.quickNavPillMobile,
        isApproved ? styles.quickNavPillApproved : hasCustomer ? styles.quickNavPillFilled : null,
      ]}
      onPress={onScroll}
      activeOpacity={0.8}
    >
      <Text
        style={[
          styles.quickNavPillText,
          isMobile && styles.quickNavPillTextMobile,
          isApproved && { color: '#059669' },
        ]}
      >
        #{idx + 1} {sub.detectedCustomerName || customerName || 'Đơn'}
      </Text>
      {isApproved ? (
        <Text style={{ fontSize: isMobile ? 9 : 10 }}>✅</Text>
      ) : hasCustomer ? (
        <View style={[styles.dotFilled, isMobile && { width: 5, height: 5, borderRadius: 2.5 }]} />
      ) : null}
    </TouchableOpacity>
  ),
  (prev, next) =>
    prev.sub === next.sub &&
    prev.idx === next.idx &&
    prev.isApproved === next.isApproved &&
    prev.hasCustomer === next.hasCustomer &&
    prev.customerName === next.customerName &&
    prev.isMobile === next.isMobile
);

/**
 * Component hiển thị 1 thẻ hóa đơn (được bọc React.memo để triệt tiêu hoàn toàn giật lag).
 * Khi người dùng nhập liệu ở bất kỳ thẻ nào, CHỈ DUY NHẤT thẻ đó re-render,
 * toàn bộ các thẻ khác sẽ được React bỏ qua hoàn toàn -> đạt 60fps mượt mà tuyệt đối.
 */
const InvoiceReviewCard = React.memo(
  ({
    sub,
    idx,
    card,
    cardResponsiveStyle,
    isApproved,
    isDropdownActive,
    isMobile,
    isTablet,
    customers,
    customerProducts,
    cardRef,
    isReparsing,
    onReparse,
    onOpenDetail,
    onOpenDropdown,
    onCustomerChange,
    onUpdateField,
    onToggleReturnType,
    onAddItem,
    onRemoveItem,
    onSelectProduct,
    onUpdateItem,
    onFetchCustomerProducts,
    onToggleOrderMode,
    onUpdateQuickAmount,
    onAddQuickSubAmount,
    onUpdateQuickSubAmount,
    onRemoveQuickSubAmount,
    onSave,
    onReject,
  }) => {
    // Trạng thái theo dõi lỗi tải video để hiện khung fallback thay vì màn hình đen 0:00
    const [videoError, setVideoError] = useState(false);
    const [videoRetryKey, setVideoRetryKey] = useState(0);
    const [isSyncingVideo, setIsSyncingVideo] = useState(false);
    const [isMissingFile, setIsMissingFile] = useState(false);

    // Tính tổng tiền của thẻ này một cách độc lập
    const cardTotal = useMemo(() => {
      if (!card) return 0;
      if (card.orderMode === 'quick') {
        return parseFloat(card.quickAmount) || 0;
      }
      return (card.items || []).reduce((sum, it) => sum + (parseFloat(it.amount) || 0), 0);
    }, [card?.orderMode, card?.quickAmount, card?.items]);

    return (
      <View
        ref={cardRef}
        style={[
          styles.invoiceCard,
          isApproved && styles.invoiceCardApproved,
          cardResponsiveStyle || (isMobile ? styles.invoiceCardMobile : (isTablet ? styles.invoiceCardTablet : styles.invoiceCardPC)),
          isDropdownActive && { zIndex: 999999, elevation: 999999 },
        ]}
      >
        {/* ═══ PHẦN TRÊN: ẢNH / VIDEO GỐC ═══ */}
        <View style={[styles.cardMediaCol, isMobile && styles.cardMediaColMobile]}>
          {/* Tiêu đề thẻ: Số thứ tự + Trạng thái */}
          <View style={styles.cardHeaderTop}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
              <Text style={styles.cardIndexBadge}>#{idx + 1}</Text>
              <Text style={styles.cardSenderText} numberOfLines={1}>
                {sub.senderName || 'Nhân viên'}
              </Text>
              {/* Hiển thị rõ ngày giờ tạo/gửi */}
              <View style={styles.cardDateBadge}>
                <Text style={styles.cardDateBadgeText}>
                  📅 {sub.createdAt ? formatDateTimeDisplay(sub.createdAt) : formatDateOnly(sub.date)}
                </Text>
              </View>
            </View>
            {sub.status === 'ANALYZING' ? (
              <View style={styles.badgeAnalyzingPill}>
                <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 4, transform: [{ scale: 0.7 }] }} />
                <Text style={styles.badgeAnalyzingPillText}>🤖 ĐANG QUÉT AI...</Text>
              </View>
            ) : isApproved ? (
              <View style={styles.badgeApprovedPill}>
                <Text style={styles.badgeApprovedPillText}>✅ ĐÃ LÊN NỢ</Text>
              </View>
            ) : card.isReturn ? (
              <View style={styles.badgeReturnPill}>
                <Text style={styles.badgeReturnPillText}>↩️ ĐƠN TRẢ HÀNG</Text>
              </View>
            ) : (
              <View style={styles.badgePendingPill}>
                <Text style={styles.badgePendingPillText}>⚡ CHƯA LÊN NỢ</Text>
              </View>
            )}
          </View>

          {/* Khung ảnh / video xem trước */}
          <View style={[styles.cardMediaBox, isMobile && styles.cardMediaBoxMobile]}>
            {isVideoSubmission(sub) ? (
              <View style={styles.cardVideoWrap}>
                {videoError ? (
                  <View style={styles.videoErrorBox}>
                    {isMissingFile ? (
                      <View style={{ alignItems: 'center', paddingHorizontal: 6 }}>
                        <Text style={{ fontSize: 26 }}>🎬</Text>
                        <Text style={{ color: '#F8FAFC', fontSize: 11.5, fontWeight: 'bold', marginTop: 4, textAlign: 'center' }}>
                          Video tạm hết hạn trên máy chủ
                        </Text>
                        <Text style={{ color: '#94A3B8', fontSize: 9.5, marginTop: 3, textAlign: 'center', lineHeight: 13 }}>
                          Dữ liệu đã được AI phân tích đầy đủ và lưu an toàn ở bảng bên phải. Bạn có thể kiểm tra và bấm Lưu công nợ.
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#065F46', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, marginTop: 8, gap: 4 }}>
                          <Text style={{ color: '#34D399', fontSize: 10.5, fontWeight: 'bold' }}>✓ Dữ liệu AI an toàn</Text>
                        </View>
                      </View>
                    ) : (
                      <>
                        <Text style={{ fontSize: 24 }}>⏳</Text>
                        <Text style={{ color: '#F1F5F9', fontSize: 11, fontWeight: '600', marginTop: 4, textAlign: 'center' }}>
                          Đang đồng bộ video lên đám mây...
                        </Text>
                        <TouchableOpacity
                          style={styles.btnRetryVideo}
                          disabled={isSyncingVideo}
                          onPress={async () => {
                            setIsSyncingVideo(true);
                            try {
                              const res = await api.post(`/staff-submissions/${sub.id}/sync-cloud`);
                              if (res.data?.success && res.data?.data?.fileUrl) {
                                const newUrl = res.data.data.fileUrl;
                                sub.fileUrl = newUrl;
                                setVideoError(false);
                                setIsMissingFile(false);
                                setVideoRetryKey((k) => k + 1);
                                showGlobalToast('Đã đồng bộ video lên đám mây thành công!', 'success');
                              } else if (res.data?.isMissingFile) {
                                setIsMissingFile(true);
                                showGlobalToast(res.data.message || 'Tệp video tạm không còn trên máy chủ. Dữ liệu AI đã lưu an toàn bên phải.', 'info');
                              } else {
                                setIsMissingFile(true);
                              }
                            } catch (err) {
                              setIsMissingFile(true);
                            } finally {
                              setIsSyncingVideo(false);
                            }
                          }}
                          activeOpacity={0.7}
                        >
                          {isSyncingVideo ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <ActivityIndicator size="small" color="#38BDF8" style={{ transform: [{ scale: 0.7 }] }} />
                              <Text style={{ color: '#38BDF8', fontSize: 10.5, fontWeight: 'bold' }}>Đang đồng bộ...</Text>
                            </View>
                          ) : (
                            <Text style={{ color: '#38BDF8', fontSize: 10.5, fontWeight: 'bold' }}>🔄 Thử tải lại / Đồng bộ</Text>
                          )}
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                ) : typeof window !== 'undefined' && sub.fileUrl ? (
                  <video
                    key={`${sub.id}_${videoRetryKey}`}
                    src={resolveMediaUrl(sub.fileUrl)}
                    controls
                    preload="metadata"
                    playsInline
                    onError={() => {
                      setVideoError(true);
                    }}
                    style={{
                      width: '100%',
                      height: '100%',
                      backgroundColor: '#0F172A',
                      borderRadius: 8,
                      objectFit: 'contain',
                    }}
                  />
                ) : (
                  <View style={styles.videoFallbackBox}>
                    <Text style={{ fontSize: 28 }}>🎬</Text>
                    <Text style={{ color: '#94A3B8', fontSize: 11, marginTop: 4 }}>Video hóa đơn</Text>
                  </View>
                )}

                {/* Nút Quét lại AI ở góc dưới bên trái */}
                <TouchableOpacity
                  style={[styles.reparseOverlayBadge, (isReparsing || sub.status === 'ANALYZING') && { opacity: 0.6 }]}
                  onPress={() => onReparse && onReparse(sub.id)}
                  disabled={isReparsing || sub.status === 'ANALYZING'}
                  activeOpacity={0.8}
                >
                  {isReparsing || sub.status === 'ANALYZING' ? (
                    <ActivityIndicator size="small" color="#38BDF8" style={{ transform: [{ scale: 0.7 }] }} />
                  ) : (
                    <Text style={styles.reparseOverlayText}>🔄 Quét lại AI</Text>
                  )}
                </TouchableOpacity>

                {/* Nút Xem to ở góc dưới bên phải */}
                <TouchableOpacity
                  style={styles.zoomOverlayBadge}
                  onPress={() => onOpenDetail(sub.id)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.zoomOverlayText}>🔍 Xem to</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.cardImageTouch}
                onPress={() => onOpenDetail(sub.id)}
              >
                <Image
                  source={{ uri: resolveMediaUrl(sub.fileUrl) }}
                  style={styles.cardImage}
                  resizeMode="contain"
                />
                {/* Nút Quét lại AI ở góc dưới bên trái của ảnh */}
                <TouchableOpacity
                  style={[styles.reparseOverlayBadge, (isReparsing || sub.status === 'ANALYZING') && { opacity: 0.6 }]}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    onReparse && onReparse(sub.id);
                  }}
                  disabled={isReparsing || sub.status === 'ANALYZING'}
                  activeOpacity={0.8}
                >
                  {isReparsing || sub.status === 'ANALYZING' ? (
                    <ActivityIndicator size="small" color="#38BDF8" style={{ transform: [{ scale: 0.7 }] }} />
                  ) : (
                    <Text style={styles.reparseOverlayText}>🔄 Quét lại AI</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.zoomOverlayBadge}>
                  <Text style={styles.zoomOverlayText}>🔍 Xem to</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          {/* Báo lỗi / nhắc nhở AI (nếu có) */}
          {sub.aiError ? (
            <View style={styles.cardAiErrorBanner}>
              <Text style={styles.cardAiErrorText}>
                ⚠️ {sub.aiError}
              </Text>
            </View>
          ) : null}
        </View>

        {/* ═══ PHẦN DƯỚI: FORM BÓC TÁCH & NHẬP NỢ ═══ */}
        <View style={[styles.cardFormCol, isMobile && styles.cardFormColMobile]}>
          {/* KHỐI NỘI DUNG NHẬP LIỆU: LIỀN MẠCH, TINH GỌN Ở TRÊN */}
          <View style={styles.cardFormBody}>
            {/* BANNER THÔNG BÁO ĐANG NẠP BẢNG GIÁ RIÊNG */}
            {card.isLoadingPrice ? (
              <View style={styles.cardLoadingPriceBanner}>
                <ActivityIndicator size="small" color="#0284C7" />
                <Text style={styles.cardLoadingPriceText}>Đang cập nhật giá riêng khách hàng...</Text>
              </View>
            ) : null}

            {/* HÀNG 1: KHÁCH HÀNG */}
            <View style={{ marginBottom: 8, width: '100%' }}>
              <Text style={styles.cardFieldLabel}>
                {card.isReturn ? 'Khách hàng trả hàng' : 'Khách hàng ghi nợ'} <Text style={{ color: '#EF4444' }}>*</Text>
                {sub.detectedCustomerName ? (
                  <Text style={{ color: '#0EA5E9', fontWeight: 'normal', fontSize: 11.5 }}>
                    {' '}(AI: "{sub.detectedCustomerName}")
                  </Text>
                ) : null}
              </Text>
              <CustomSelect
                value={card.customer}
                placeholder="Chọn khách hàng..."
                options={customers}
                disabled={card.isLoadingPrice}
                onOpenChange={onOpenDropdown}
                onSelect={(c) => onCustomerChange(sub.id, c)}
                renderSelected={(c) => c?.name || ''}
                renderOption={(c) => (
                  <View style={styles.custOptionRow}>
                    <Text style={styles.custOptionName}>{c.name}</Text>
                    {c.phone ? <Text style={styles.custOptionPhone}>📞 {c.phone}</Text> : null}
                  </View>
                )}
              />
            </View>

            {/* HÀNG 2: NGÀY GIAO & GHI CHÚ (2 CỘT SONG SONG) */}
            <View style={styles.mobileDateNoteRow}>
              <View style={{ flex: 1.1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 22, marginBottom: 3 }}>
                  <Text style={[styles.cardFieldLabel, { marginBottom: 0 }]}>{card.isReturn ? 'Ngày trả' : 'Ngày giao'}</Text>
                </View>
                <DatePickerInput
                  value={card.date}
                  onChange={(d) => onUpdateField(sub.id, 'date', d)}
                  placeholder="DD/MM/YYYY"
                  compact={true}
                  disabled={card.isLoadingPrice}
                />
              </View>

              <View style={{ flex: 1.6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 22, marginBottom: 3 }}>
                  <Text style={[styles.cardFieldLabel, { marginBottom: 0 }]}>Ghi chú</Text>
                  <TouchableOpacity
                    style={[styles.btnToggleOrderType, card.isReturn && styles.btnToggleOrderTypeReturn, card.isLoadingPrice && { opacity: 0.5 }]}
                    onPress={() => onToggleReturnType(sub.id)}
                    disabled={card.isLoadingPrice}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.btnToggleOrderTypeText, card.isReturn && styles.btnToggleOrderTypeTextReturn]}>
                      {card.isReturn ? '↩️ Trả' : '🥩 Xuất'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={[
                    styles.cardInputNote,
                    card.isReturn && { borderColor: '#FB923C', backgroundColor: '#FFF7ED' },
                    card.isLoadingPrice && { backgroundColor: '#F1F5F9', opacity: 0.7 },
                  ]}
                  value={card.note}
                  onChangeText={(val) => onUpdateField(sub.id, 'note', val)}
                  editable={!card.isLoadingPrice}
                  placeholder={card.isReturn ? '1.5kg bắp(300), 2kg nạc(500)' : 'Ghi chú đơn...'}
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>

            {/* HÀNG 3: THANH CHỌN CHẾ ĐỘ NHẬP NHANH (TIỀN HÀNG) HOẶC CHI TIẾT */}
            <View style={styles.cardModeToggleRow}>
              <TouchableOpacity
                style={[styles.cardModeBtn, card.orderMode === 'quick' && styles.cardModeBtnActive]}
                onPress={() => onToggleOrderMode && onToggleOrderMode(sub.id)}
                disabled={card.isLoadingPrice}
                activeOpacity={0.8}
              >
                <Text style={[styles.cardModeBtnText, card.orderMode === 'quick' && styles.cardModeBtnTextActive]}>
                  {card.isReturn ? '⚡ Trả nhanh' : '⚡ Nợ nhanh'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cardModeBtn, card.orderMode !== 'quick' && styles.cardModeBtnActive]}
                onPress={() => onToggleOrderMode && onToggleOrderMode(sub.id)}
                disabled={card.isLoadingPrice}
                activeOpacity={0.8}
              >
                <Text style={[styles.cardModeBtnText, card.orderMode !== 'quick' && styles.cardModeBtnTextActive]}>
                  {card.isReturn ? '↩️ Trả chi tiết' : '🥩 Chi tiết'} ({card.items?.length || 0})
                </Text>
              </TouchableOpacity>
            </View>

            {card.orderMode === 'quick' ? (
              <View style={styles.cardQuickDebtBox}>
                <Text style={styles.cardFieldLabel}>
                  {card.isReturn ? 'SỐ TIỀN TRẢ HÀNG (VND)' : 'SỐ TIỀN CÔNG NỢ (VND)'} <Text style={{ color: '#EF4444' }}>*</Text>
                </Text>
                <MoneyInput
                  style={styles.cardQuickMoneyContainer}
                  inputStyle={styles.cardQuickMoneyInput}
                  value={card.quickAmount}
                  disabled={card.isLoadingPrice}
                  onChangeValue={(val) => {
                    onUpdateQuickAmount && onUpdateQuickAmount(sub.id, val > 0 ? String(val) : '');
                  }}
                  placeholder="0"
                  textAlign="center"
                />

                {/* Danh sách khoản tiền con */}
                {(card.quickSubAmounts || []).length > 0 && (
                  <View style={styles.cardQuickSubWrap}>
                    <Text style={styles.cardQuickSubTitle}>Các khoản cộng lại:</Text>
                    <View style={styles.cardQuickSubChips}>
                      {(card.quickSubAmounts || []).map((subAmt, sIdx) => (
                        <View key={sIdx} style={styles.cardQuickSubChip}>
                          <Text style={styles.cardQuickSubChipText}>{formatCurrency(subAmt)}đ</Text>
                          <TouchableOpacity
                            onPress={() => onRemoveQuickSubAmount && onRemoveQuickSubAmount(sub.id, sIdx)}
                            hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                          >
                            <Text style={styles.cardQuickSubChipDelete}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                      <TouchableOpacity
                        style={styles.cardQuickAddChipBtn}
                        onPress={() => onAddQuickSubAmount && onAddQuickSubAmount(sub.id)}
                      >
                        <Text style={styles.cardQuickAddChipText}>+ Thêm</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ) : (
              /* BẢNG CÁC MÓN THỊT (DẠNG COMPACT 2 TẦNG TIỆN LỢI) */
              <View style={styles.cardItemsTable}>
                <View style={styles.cardItemsTableHeader}>
                  <Text style={styles.cardItemsTableTitle}>
                    DANH SÁCH MÓN THỊT ({card.items?.length || 0})
                  </Text>
                  <TouchableOpacity
                    style={[styles.cardBtnAddItem, card.isLoadingPrice && { opacity: 0.5 }]}
                    onPress={() => onAddItem(sub.id)}
                    disabled={card.isLoadingPrice}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.cardBtnAddItemText}>+ Thêm món</Text>
                  </TouchableOpacity>
                </View>

                {/* Tiêu đề các cột món thịt trên 1 dòng */}
                {(card.items && card.items.length > 0) && (
                  <View style={styles.cardItemColumnsHeader}>
                    <Text style={[styles.cardItemColText, { flex: 1.65 }]}>Tên thịt</Text>
                    <Text style={[styles.cardItemColText, { flex: 0.8, textAlign: 'center' }]}>Số kg</Text>
                    <Text style={[styles.cardItemColText, { flex: 1.2, textAlign: 'right' }]}>Đơn giá</Text>
                    <Text style={[styles.cardItemColText, { flex: 1.55, textAlign: 'right' }]}>Thành tiền</Text>
                    <View style={{ width: 20 }} />
                  </View>
                )}

                {/* Từng dòng món thịt (xếp chung toàn bộ trên 1 dòng duy nhất, size chữ nhỏ gọn riêng cho bảng này) */}
                {(card.items || []).map((item, itemIdx) => (
                  <View key={item.id || itemIdx} style={styles.cardItemRowSingle}>
                    {/* 1. Chọn món thịt */}
                    <View style={{ flex: 1.65, minWidth: 55 }}>
                      <CustomSelect
                        value={item.selectedProduct}
                        placeholder="Tên thịt..."
                        compact={true}
                        triggerStyle={styles.cardItemSelectTrigger}
                        inputStyle={styles.cardItemSelectInput}
                        options={customerProducts}
                        disabled={card.isLoadingPrice}
                        onOpenChange={(isOpen) => {
                          if (isOpen && card.customer?.id) {
                            onFetchCustomerProducts(card.customer.id);
                          }
                          onOpenDropdown(isOpen);
                        }}
                        onSelect={(p) => onSelectProduct(sub.id, itemIdx, p)}
                        onInputChange={(txt) => onUpdateItem(sub.id, itemIdx, 'rawName', txt)}
                        renderSelected={(p) => p?.name || item.rawName || ''}
                        renderOption={(p) => {
                          const isCustom = Boolean(p.hasCustomPrice || (p.customPrice !== undefined && p.customPrice !== null));
                          const effectivePrice = isCustom ? p.customPrice : (p.baseDefaultPrice ?? p.defaultPrice);
                          return (
                            <View style={styles.productOptionRow}>
                              <Text style={styles.productOptionName}>{p.name}</Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                {isCustom && (
                                  <View style={styles.customPriceBadge}>
                                    <Text style={styles.customPriceBadgeText}>Giá riêng</Text>
                                  </View>
                                )}
                                <Text style={[styles.productOptionPrice, isCustom && styles.productOptionCustomPrice]}>
                                  {formatCurrency(effectivePrice)}/{p.unit}
                                </Text>
                              </View>
                            </View>
                          );
                        }}
                      />
                    </View>

                    {/* 2. Số kg */}
                    <View style={{ flex: 0.8, minWidth: 34 }}>
                      <TextInput
                        style={[styles.cardItemCell, card.isLoadingPrice && { backgroundColor: '#F1F5F9', opacity: 0.7 }]}
                        value={item.quantity}
                        onChangeText={(val) => onUpdateItem(sub.id, itemIdx, 'quantity', val.replace(',', '.'))}
                        editable={!card.isLoadingPrice}
                        placeholder="Số kg"
                        placeholderTextColor="#94A3B8"
                        keyboardType="decimal-pad"
                        inputMode="decimal"
                        textAlign="center"
                      />
                    </View>

                    {/* 3. Đơn giá */}
                    <View style={{ flex: 1.2, minWidth: 50 }}>
                      <MoneyInput
                        style={styles.cardItemMoneyContainer}
                        inputStyle={styles.cardItemMoneyInput}
                        value={item.price}
                        disabled={card.isLoadingPrice}
                        onChangeValue={(val) => {
                          const priceNum = val > 0 ? val : 0;
                          onUpdateItem(sub.id, itemIdx, 'price', priceNum > 0 ? String(priceNum) : '');
                        }}
                        placeholder="Đơn giá"
                        textAlign="right"
                      />
                    </View>

                    {/* 4. Thành tiền */}
                    <View style={{ flex: 1.55, minWidth: 64 }}>
                      <MoneyInput
                        style={styles.cardItemMoneyContainer}
                        inputStyle={styles.cardItemAmountInput}
                        value={item.amount}
                        disabled={card.isLoadingPrice}
                        onChangeValue={(val) => {
                          const amtNum = val > 0 ? val : 0;
                          onUpdateItem(sub.id, itemIdx, 'amount', amtNum > 0 ? String(amtNum) : '');
                        }}
                        placeholder="Thành tiền"
                        textAlign="right"
                      />
                    </View>

                    {/* 5. Nút xóa món */}
                    <TouchableOpacity
                      style={[styles.btnRowDelete, styles.btnRowDeleteSingleRow, card.isLoadingPrice && { opacity: 0.4 }]}
                      onPress={() => onRemoveItem(sub.id, itemIdx)}
                      disabled={card.isLoadingPrice}
                      activeOpacity={0.7}
                    >
                      <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 10, lineHeight: 12 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* HÀNG 4: TỔNG TIỀN */}
          <View style={[styles.cardFooterRow, styles.cardFooterRowMobile]}>
            <View style={styles.cardTotalWrap}>
              <Text style={[styles.cardTotalLabel, card.isReturn && { color: '#EA580C' }]}>
                {card.isReturn ? 'TIỀN TRẢ:' : 'TỔNG CỘNG:'}
              </Text>
              <Text style={[styles.cardTotalValue, card.isReturn && { color: '#F97316' }]}>
                {card.isReturn ? `-${formatCurrency(cardTotal)}` : formatCurrency(cardTotal)} đ
              </Text>
            </View>
          </View>

          {/* HÀNG 5: CÁC NÚT HÀNH ĐỘNG — 1 hàng ngang, gọn */}
          <View style={styles.cardActionsRow}>
            {/* Nút icon-only Quét AI — nhỏ gọn, không chiếm space */}
            <TouchableOpacity
              style={[
                styles.btnIconReparse,
                (isReparsing || sub.status === 'ANALYZING') && { opacity: 0.55 },
              ]}
              onPress={() => onReparse && onReparse(sub.id)}
              disabled={isReparsing || sub.status === 'ANALYZING'}
              activeOpacity={0.75}
            >
              {isReparsing || sub.status === 'ANALYZING' ? (
                <ActivityIndicator size="small" color="#38BDF8" style={{ transform: [{ scale: 0.65 }] }} />
              ) : (
                <Text style={styles.btnIconReparseText}>🔄</Text>
              )}
            </TouchableOpacity>

            {!isApproved && (
              <TouchableOpacity
                style={[styles.btnCardReject, styles.btnCardRejectMobile]}
                onPress={() => onReject(sub.id)}
                activeOpacity={0.8}
              >
                <Text style={styles.btnCardRejectText}>🗑️ Bỏ qua</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.btnCardSave,
                card.isReturn && styles.btnCardSaveReturn,
                isApproved && styles.btnCardSaveApproved,
                styles.btnCardSaveMobile,
                (card.isSaving || card.isLoadingPrice) && { opacity: 0.7 },
              ]}
              onPress={() => onSave(sub.id)}
              disabled={card.isSaving || card.isLoadingPrice}
              activeOpacity={0.85}
            >
              {card.isSaving || card.isLoadingPrice ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.btnCardSaveText}>
                  {isApproved
                    ? '🔄 CẬP NHẬT LẠI'
                    : (card.isReturn ? '↩️ TRỪ NỢ TRẢ HÀNG' : '💾 NHẬP CÔNG NỢ')}
                </Text>
              )}
            </TouchableOpacity>
          </View>

        </View>
      </View>
    );
  },
  (prev, next) => {
    // Chỉ re-render khi dữ liệu của chính thẻ này hoặc môi trường hiển thị thay đổi
    if (prev.sub !== next.sub) return false;
    if (prev.card !== next.card) return false;
    if (prev.isApproved !== next.isApproved) return false;
    if (prev.isDropdownActive !== next.isDropdownActive) return false;
    if (prev.idx !== next.idx) return false;
    if (prev.isMobile !== next.isMobile) return false;
    if (prev.isTablet !== next.isTablet) return false;
    if (prev.cardResponsiveStyle !== next.cardResponsiveStyle) return false;
    if (prev.customers !== next.customers) return false;
    if (prev.customerProducts !== next.customerProducts) return false;
    if (prev.isReparsing !== next.isReparsing) return false;
    return true;
  }
);

/**
 * Hàm nhận diện và so khớp khách hàng chính xác theo từ khóa AI bóc tách
 */
const resolveCustomerForSub = (sub, custList) => {
  if (!sub) return null;
  // Khách hàng
  let matchedCust = sub.matchedCustomer || null;
  if (!matchedCust && sub.matchedCustomerId) {
    matchedCust = custList.find((c) => c.id === sub.matchedCustomerId) || null;
  }

  // ĐẶC BIỆT QUAN TRỌNG: Nếu hóa đơn đã được duyệt (APPROVED), khách hàng đã được lưu chính thức trong CSDL
  // -> TUYỆT ĐỐI KHÔNG để các quy tắc regex nhận diện sơ bộ của AI ghi đè lại khách hàng khác!
  if (sub.status === 'APPROVED') {
    return matchedCust;
  }

  // Kiểm tra và sửa lỗi nếu AI nhận diện có thông tin rõ ràng
  if (sub.detectedCustomerName) {
    // Làm sạch từ khóa trả hàng nếu có lẫn vào tên khách hàng (ví dụ "Thái Hà trả về", "Gửi lại Cô Thảo"...)
    const returnKeywordsRegex = /\b(trả hàng|gửi về|trả về|trả lại|gửi lại|hàng trả|thu hồi|bắn về|quay đầu|đổi trả|hoàn hàng|tra hang|gui ve|tra ve|tra lai|gui lai|hang tra|quay dau|doi tra|hoan hang|tra|trả)\b/gi;
    const rawCustNameClean = sub.detectedCustomerName.replace(returnKeywordsRegex, '').replace(/[-–—:()]/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanDetected = removeDiacritics((rawCustNameClean || sub.detectedCustomerName).toLowerCase().trim());
    const cleanDetectedNoSpace = cleanDetected.replace(/\s+/g, '');
    const currentCustClean = matchedCust ? removeDiacritics(matchedCust.name.toLowerCase().trim()) : '';

    // 1. ĐẶC BIỆT: Khớp ưu tiên khách "Bún huế văn khê" nếu AI nhận diện có chứa "bun hue" hoặc "van khe"
    if (
      cleanDetected.includes('bun hue') ||
      cleanDetected.includes('van khe') ||
      cleanDetectedNoSpace.includes('bunhue') ||
      cleanDetectedNoSpace.includes('vankhe')
    ) {
      if (!currentCustClean.includes('bun hue') && !currentCustClean.includes('van khe')) {
        const bunHueCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('bun hue') && cClean.includes('van khe');
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('van khe');
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('bun hue');
        }) || null;

        if (bunHueCust) {
          matchedCust = bunHueCust;
        }
      }
    }

    // 1a2. ĐẶC BIỆT: Khớp ưu tiên khách "Bếp 3 Miền Kim Liên" nếu AI nhận diện là "3mien", "3 miền", "bếp 3 miền", "kim liên"...
    if (
      cleanDetected.includes('3 mien') ||
      cleanDetected.includes('ba mien') ||
      cleanDetected.includes('bep 3 mien') ||
      cleanDetected.includes('kim lien') ||
      cleanDetectedNoSpace === '3mien' ||
      cleanDetectedNoSpace === '3m' ||
      cleanDetectedNoSpace.includes('3mien') ||
      cleanDetectedNoSpace.includes('bep3mien') ||
      cleanDetectedNoSpace.includes('kimlien') ||
      cleanDetectedNoSpace.includes('bamien')
    ) {
      if (!currentCustClean.includes('3 mien') && !currentCustClean.includes('3mien') && !currentCustClean.includes('kim lien')) {
        const bep3MienCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          const cNoSpace = cClean.replace(/\s+/g, '');
          return (cClean.includes('3 mien') || cNoSpace.includes('3mien') || cClean.includes('ba mien')) && cClean.includes('kim lien');
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          const cNoSpace = cClean.replace(/\s+/g, '');
          return cClean.includes('3 mien') || cNoSpace.includes('3mien') || cClean.includes('ba mien') || cClean.includes('bep 3 mien');
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('kim lien');
        }) || null;

        if (bep3MienCust) {
          matchedCust = bep3MienCust;
        }
      }
    }

    // 1b. ĐẶC BIỆT: Khớp ưu tiên khách "Huyền Đô Nghĩa" nếu AI nhận diện có chứa "huyen" hoặc "do nghia"
    if (
      cleanDetected.includes('huyen do nghia') ||
      cleanDetected.includes('huyen do ngia') ||
      cleanDetected.includes('do nghia') ||
      cleanDetectedNoSpace === 'huyen' ||
      cleanDetectedNoSpace === 'chihuyen' ||
      cleanDetected === 'huyen'
    ) {
      if (!currentCustClean.includes('huyen') && !currentCustClean.includes('do nghia') && !currentCustClean.includes('do ngia')) {
        const huyenCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('huyen') && (cClean.includes('do nghia') || cClean.includes('do ngia'));
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('do nghia') || cClean.includes('do ngia');
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('huyen');
        }) || null;

        if (huyenCust) {
          matchedCust = huyenCust;
        }
      }
    }

    // 1c. ĐẶC BIỆT: Khớp ưu tiên khách "Phở tưởng chị luyến" nếu AI nhận diện là "phở tưởng" hoặc "chị luyến"
    if (
      cleanDetected.includes('pho tuong') ||
      cleanDetected.includes('tuong') ||
      cleanDetected.includes('luyen') ||
      cleanDetectedNoSpace.includes('photuong') ||
      cleanDetectedNoSpace.includes('tuong') ||
      cleanDetectedNoSpace.includes('luyen')
    ) {
      if (!currentCustClean.includes('tuong') && !currentCustClean.includes('luyen')) {
        const phoTuongCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return (cClean.includes('tuong') || cClean.includes('pho tuong')) && cClean.includes('luyen');
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('tuong') && !cClean.includes('tien');
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('luyen');
        }) || null;

        if (phoTuongCust) {
          matchedCust = phoTuongCust;
        }
      }
    }

    // 1d. ĐẶC BIỆT: Khớp ưu tiên khách "Chị Thúy Nga" nếu AI nhận diện là "chinga", "chị nga", "nga"
    if (
      cleanDetected.includes('chinga') ||
      cleanDetected.includes('chi nga') ||
      cleanDetected.includes('thuy nga') ||
      cleanDetectedNoSpace.includes('chinga') ||
      cleanDetectedNoSpace.includes('thuynga') ||
      cleanDetectedNoSpace === 'nga' ||
      cleanDetected === 'nga'
    ) {
      if (!currentCustClean.includes('nga')) {
        const thuyNgaCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('thuy') && cClean.includes('nga');
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('nga');
        }) || null;

        if (thuyNgaCust) {
          matchedCust = thuyNgaCust;
        }
      }
    }

    // 1d2. ĐẶC BIỆT: Khớp ưu tiên khách "Cồ Hải" nếu AI nhận diện là cồ hải, cổ hải, co hai...
    if (
      cleanDetected.includes('co hai') ||
      cleanDetectedNoSpace.includes('cohai') ||
      cleanDetected === 'co hai' ||
      cleanDetectedNoSpace === 'cohai'
    ) {
      if (!currentCustClean.includes('co hai')) {
        const coHaiCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase().trim());
          return cClean === 'co hai' && c.isActive && !c.isBadDebt;
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase().trim());
          return cClean === 'co hai';
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase().trim());
          return cClean.includes('co hai');
        }) || null;

        if (coHaiCust) {
          matchedCust = coHaiCust;
        }
      }
    }

    // 1e. ĐẶC BIỆT: Khớp ưu tiên khách "Hà Trì" nếu AI nhận diện là ha tri, ha li, ha lu, co ha tri...
    if (
      cleanDetected.includes('ha tri') ||
      cleanDetected.includes('ha li') ||
      cleanDetected.includes('ha lu') ||
      cleanDetected.includes('ha thi') ||
      cleanDetected.includes('co ha tri') ||    // "cô hà trì" AI đọc thành "co ha tri"
      cleanDetected.includes('co ha ti') ||     // biến thể nuốt âm
      cleanDetected.includes('ha ti') ||        // "hà trì" nuốt âm "tr"
      cleanDetected === 'co ha' ||              // "cô hà" rút gọn
      cleanDetectedNoSpace === 'hatri' ||
      cleanDetectedNoSpace === 'hali' ||
      cleanDetectedNoSpace === 'halu' ||
      cleanDetectedNoSpace === 'hathi' ||
      cleanDetectedNoSpace === 'cohati' ||
      cleanDetectedNoSpace === 'cohatri' ||
      cleanDetectedNoSpace.includes('hatri')
    ) {
      if (!currentCustClean.includes('ha tri') && !currentCustClean.includes('tri')) {
        const isHanh = cleanDetected.includes('hanh');
        let targetCust = null;
        if (isHanh) {
          // Nếu người nói đọc là chị Hạnh -> Khớp khách chị hạnh sân bóng hà trì
          targetCust = custList.find((c) => {
            const cClean = removeDiacritics(c.name.toLowerCase());
            return cClean.includes('hanh');
          }) || null;
        } else {
          // Đọc là Hà Trì -> 100% là khách Hà Trì, TUYỆT ĐỐI KHÔNG chọn nhầm sang "Chị hạnh sân bóng hà trì"
          targetCust = custList.find((c) => {
            const cClean = removeDiacritics(c.name.toLowerCase()).trim();
            return cClean === 'ha tri';
          }) || custList.find((c) => {
            const cClean = removeDiacritics(c.name.toLowerCase());
            return (cClean.includes('ha tri') || (cClean.includes('ha') && cClean.includes('tri'))) && !cClean.includes('hanh');
          }) || custList.find((c) => {
            const cClean = removeDiacritics(c.name.toLowerCase());
            return cClean.includes('ha tri') || (cClean.includes('ha') && cClean.includes('tri'));
          }) || null;
        }

        if (targetCust) {
          matchedCust = targetCust;
        }
      }
    }


    // 1f. ĐẶC BIỆT: Khớp ưu tiên khách "Thăn bình đà(anh Nghĩa)" nếu AI nhận diện là anh nghĩa, anh ngĩa, nghĩa, ngĩa, bình đà...
    if (
      cleanDetected.includes('anh nghia') ||
      cleanDetected.includes('anh ngia') ||
      cleanDetected.includes('binh da') ||
      cleanDetected.includes('than binh da') ||
      cleanDetectedNoSpace.includes('anhnghia') ||
      cleanDetectedNoSpace.includes('anhngia') ||
      cleanDetectedNoSpace === 'nghia' ||
      cleanDetectedNoSpace === 'ngia'
    ) {
      if (!currentCustClean.includes('binh da') && !currentCustClean.includes('nghia')) {
        const thanBinhDaCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('binh da') && (cClean.includes('nghia') || cClean.includes('than'));
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('binh da');
        }) || null;

        if (thanBinhDaCust) {
          matchedCust = thanBinhDaCust;
        }
      }
    }

    // 1g. ĐẶC BIỆT: Khớp ưu tiên khách "Bà lưu" (kể cả khi AI đọc nhầm do nét chữ thảo: ba liu, ba linh, ba lui, ba lieu, ba lu, ba lúc)
    if (
      cleanDetected.includes('ba luu') ||
      cleanDetected.includes('bà lưu') ||
      cleanDetected.includes('ba liu') ||
      cleanDetected.includes('ba lui') ||
      cleanDetected.includes('ba lieu') ||
      cleanDetected.includes('ba linh') ||
      cleanDetected.includes('ba lu') ||
      cleanDetected.includes('ba luc') ||
      cleanDetectedNoSpace === 'baluu' ||
      cleanDetectedNoSpace === 'baliu' ||
      cleanDetectedNoSpace === 'balinh' ||
      cleanDetectedNoSpace === 'balui' ||
      cleanDetectedNoSpace === 'balieu' ||
      cleanDetectedNoSpace === 'balu' ||
      cleanDetectedNoSpace === 'luu' ||
      cleanDetectedNoSpace === 'liu'
    ) {
      if (!currentCustClean.includes('luu')) {
        const baLuuCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean === 'ba luu' || cClean.includes('ba luu');
        }) || null;

        if (baLuuCust) {
          matchedCust = baLuuCust;
        }
      }
    }

    // 1g2. ĐẶC BIỆT: Khớp ưu tiên khách "Nguyễn khuyến trường hoàng" (khi AI đọc được nguyễn . hoàng, nguyễn hoàng, nguyễn khuyến, trường hoàng...)
    const hasNguyenOrKhuyen = cleanDetected.includes('nguyen') || cleanDetected.includes('khuyen') || cleanDetectedNoSpace.includes('nguyen') || cleanDetectedNoSpace.includes('khuyen');
    const hasHoang = cleanDetected.includes('hoang') || cleanDetectedNoSpace.includes('hoang');
    const hasTruongHoang = cleanDetected.includes('truong hoang') || cleanDetectedNoSpace.includes('truonghoang');
    const hasNguyenKhuyen = cleanDetected.includes('nguyen khuyen') || cleanDetectedNoSpace.includes('nguyenkhuyen');

    if ((hasNguyenOrKhuyen && hasHoang) || (hasNguyenKhuyen && hasTruongHoang) || (hasNguyenKhuyen && hasHoang) || cleanDetected.includes('khuyen truong hoang')) {
      if (!currentCustClean.includes('khuyen') || !currentCustClean.includes('hoang')) {
        const nkCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return (cClean.includes('khuyen') && cClean.includes('hoang')) || (cClean.includes('nguyen') && cClean.includes('khuyen') && cClean.includes('hoang'));
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('khuyen') && (cClean.includes('truong') || cClean.includes('hoang'));
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('nguyen khuyen');
        }) || null;

        if (nkCust) {
          matchedCust = nkCust;
        }
      }
    }

    // 1h. ĐẶC BIỆT: Khớp ưu tiên khách "52  trần thái tông" nếu quét được số 52
    if (
      cleanDetected.includes('52') ||
      cleanDetectedNoSpace.includes('52') ||
      (cleanDetected.includes('tran thai tong') && !cleanDetected.includes('47'))
    ) {
      if (!currentCustClean.includes('52')) {
        const cust52 = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('52') && (cClean.includes('tran thai tong') || cClean.includes('thai tong') || cClean.includes('tran'));
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('52');
        }) || null;

        if (cust52) {
          matchedCust = cust52;
        }
      }
    }

    // 1i. ĐẶC BIỆT: Khớp ưu tiên khách "Minh trang" nếu đọc được chữ minh hoặc mih
    if (
      cleanDetected.includes('minh trang') ||
      cleanDetected.includes('mih trang') ||
      cleanDetected.includes('minh tuy') ||
      cleanDetected.includes('mih tuy') ||
      cleanDetected.includes('mih') ||
      cleanDetectedNoSpace === 'minh' ||
      cleanDetectedNoSpace === 'mih' ||
      cleanDetectedNoSpace.includes('minhtrang') ||
      cleanDetectedNoSpace.includes('mihtrang') ||
      cleanDetectedNoSpace.includes('mihtuy') ||
      cleanDetectedNoSpace.includes('minhtuy')
    ) {
      if (!currentCustClean.includes('minh') || !currentCustClean.includes('trang')) {
        const custMinhTrang = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('minh') && cClean.includes('trang');
        }) || null;

        if (custMinhTrang) {
          matchedCust = custMinhTrang;
        }
      }
    }

    // 1j. ĐẶC BIỆT: Khớp ưu tiên khách "Trung kính" / "Bếp trung kính" nếu đọc được trung kinh, tuy kh, tug kh, trung kh
    if (
      cleanDetected.includes('trung kinh') ||
      cleanDetected.includes('bep trung kinh') ||
      cleanDetected.includes('trung kh') ||
      cleanDetected.includes('tuy kh') ||
      cleanDetected.includes('tuy ks') ||
      cleanDetected.includes('tug kh') ||
      cleanDetected.includes('tung kh') ||
      cleanDetected.includes('truy kh') ||
      cleanDetectedNoSpace === 'trungkinh' ||
      cleanDetectedNoSpace === 'tuykh' ||
      cleanDetectedNoSpace === 'tuykhs' ||
      cleanDetectedNoSpace === 'tuyks' ||
      cleanDetectedNoSpace === 'tugkh' ||
      cleanDetectedNoSpace === 'tungkh' ||
      cleanDetectedNoSpace === 'truykh' ||
      cleanDetectedNoSpace.includes('trungkinh') ||
      cleanDetectedNoSpace.includes('beptrungkinh')
    ) {
      if (!currentCustClean.includes('trung') || !currentCustClean.includes('kinh')) {
        const custTrungKinh = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('bep trung kinh') || (cClean.includes('trung') && cClean.includes('kinh'));
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('trung kinh') || cClean === 'trungkinh';
        }) || null;

        if (custTrungKinh) {
          matchedCust = custTrungKinh;
        }
      }
    }

    // 1k. ĐẶC BIỆT: Phân biệt rõ khách "văn khê" và "Bún huế van khe"
    if (cleanDetected.includes('van khe') || cleanDetectedNoSpace.includes('vankhe')) {
      const hasBunHue = cleanDetected.includes('bun hue') || cleanDetected.includes('bun bo hue') ||
        cleanDetectedNoSpace.includes('bunhue') || (cleanDetected.includes('bun') && cleanDetected.includes('van khe'));
      if (!hasBunHue) {
        const custVanKhe = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean === 'van khe' || (cClean.includes('van khe') && !cClean.includes('bun'));
        }) || null;
        if (custVanKhe) matchedCust = custVanKhe;
      } else {
        const custBunHue = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return (cClean.includes('bun hue') && cClean.includes('van khe')) || (cClean.includes('bun') && cClean.includes('van khe'));
        }) || null;
        if (custBunHue) matchedCust = custBunHue;
      }
    } else if (cleanDetected.includes('bun hue') || cleanDetectedNoSpace.includes('bunhue')) {
      const custBunHue = custList.find((c) => {
        const cClean = removeDiacritics(c.name.toLowerCase());
        return cClean.includes('bun hue');
      }) || null;
      if (custBunHue) matchedCust = custBunHue;
    }

    // 1l. ĐẶC BIỆT: Khớp ưu tiên khách "Thái hà" nếu nhận diện thái hà, hku ha, hki ha, hai ha...
    if (
      cleanDetected.includes('thai ha') ||
      cleanDetected.includes('thái hà') ||
      cleanDetectedNoSpace.includes('thaiha') ||
      cleanDetected.includes('hku ha') ||
      cleanDetectedNoSpace.includes('hkuha') ||
      cleanDetected.includes('hki ha') ||
      cleanDetectedNoSpace.includes('hkiha') ||
      cleanDetected.includes('hkui ha') ||
      cleanDetectedNoSpace.includes('hkuiha') ||
      cleanDetected.includes('hkai ha') ||
      cleanDetectedNoSpace.includes('hkaiha') ||
      cleanDetected.includes('thki ha') ||
      cleanDetectedNoSpace.includes('thkiha') ||
      cleanDetected.includes('hai ha') ||
      cleanDetectedNoSpace.includes('haiha')
    ) {
      const custThaiHa = custList.find((c) => {
        const cClean = removeDiacritics(c.name.toLowerCase());
        // BẮT BUỘC tìm cụm từ "thai ha" LIỀN NHAU (có khoảng trắng giữa thai và ha)
        // TUYỆT ĐỐI KHÔNG dùng includes('thai') && includes('ha') riêng lẻ
        // vì "tran thai tong" → "thai" chứa chuỗi con "ha" → khớp sai!
        return (
          cClean === 'thai ha' ||
          cClean.includes('thai ha') ||      // cụm "thai ha" liền nhau có space
          cClean.startsWith('thai ha') ||
          (cleanDetectedNoSpace.includes('thaiha') && cClean.replace(/\s+/g, '').includes('thaiha'))
        ) && !cClean.includes('ngoc lam');
      }) || null;
      if (custThaiHa) matchedCust = custThaiHa;
    }


    // 1m. ĐẶC BIỆT: Khớp ưu tiên khách "Anh thắng phố cổ" nếu là A Thang, A Thắng, ATHang, thang pho co...
    if (
      cleanDetected === 'a thang' ||
      cleanDetected === 'athang' ||
      cleanDetected === 'a.thang' ||
      cleanDetected === 'anh thang' ||
      cleanDetectedNoSpace === 'athang' ||
      cleanDetectedNoSpace === 'anhthang' ||
      cleanDetected.includes('thang pho co') ||
      cleanDetectedNoSpace.includes('thangphoco') ||
      (cleanDetected.includes('thang') && !cleanDetected.includes('chu tu'))
    ) {
      const custThangPhoCo = custList.find((c) => {
        const cClean = removeDiacritics(c.name.toLowerCase());
        return cClean.includes('thang') && cClean.includes('pho co');
      }) || custList.find((c) => {
        const cClean = removeDiacritics(c.name.toLowerCase());
        return cClean === 'anh thang pho co';
      }) || null;
      if (custThangPhoCo) matchedCust = custThangPhoCo;
    }

    // 1n. ĐẶC BIỆT: Khớp ưu tiên khách "Phở đông" nếu là phở đg, phở đông, pho dg, pho dong...
    if (
      cleanDetected === 'pho dg' ||
      cleanDetected === 'phodg' ||
      cleanDetected === 'pho dong' ||
      cleanDetected === 'phodong' ||
      cleanDetected === 'dg' ||
      cleanDetectedNoSpace === 'phodg' ||
      cleanDetectedNoSpace === 'phodong' ||
      (cleanDetected.includes('pho') && (cleanDetected.includes('dg') || cleanDetected.includes('dong'))) ||
      cleanDetected.includes('pho dong')
    ) {
      const custPhoDong = custList.find((c) => {
        const cClean = removeDiacritics(c.name.toLowerCase());
        return cClean === 'pho dong' || (cClean.includes('pho') && cClean.includes('dong'));
      }) || null;
      if (custPhoDong) matchedCust = custPhoDong;
    }

    // 1o. ĐẶC BIỆT: Khớp ưu tiên khách "Gia Hưng cs2" nếu là Gia Hy CS2, Gia Hưng CS2, Gia Hưng 2...
    if (
      (cleanDetected.includes('gia') && (cleanDetected.includes('hung') || cleanDetected.includes('hy')) && (cleanDetected.includes('cs2') || cleanDetected.includes('cs 2') || cleanDetected.includes('co so 2') || cleanDetected.endsWith('2'))) ||
      cleanDetectedNoSpace.includes('giahycs2') ||
      cleanDetectedNoSpace.includes('giahungcs2') ||
      cleanDetected.includes('gia hy cs2') ||
      cleanDetected.includes('gia hung cs2')
    ) {
      const custGiaHungCs2 = custList.find((c) => {
        const cClean = removeDiacritics(c.name.toLowerCase());
        return cClean === 'gia hung cs2' || (cClean.includes('gia hung') && cClean.includes('cs2'));
      }) || null;
      if (custGiaHungCs2) matchedCust = custGiaHungCs2;
    }

    // 2. Nếu khách trước đó bị gán nhầm thành tên quá ngắn (1-2 ký tự như "N") trong khi AI đọc tên dài, hủy bỏ để tìm lại
    if (matchedCust && currentCustClean.length <= 2 && cleanDetected.length > 2) {
      matchedCust = null;
    }

    // 3. Ưu tiên khớp khách Cô thảo(thầy) nếu AI nhận diện là thầy hoặc cô thảo
    if (!matchedCust) {
      if (
        cleanDetectedNoSpace === 'thay' ||
        cleanDetectedNoSpace === 'cothao' ||
        cleanDetectedNoSpace === 'thao' ||
        cleanDetected.includes('thay') ||
        cleanDetected.includes('thao')
      ) {
        matchedCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('thao') && cClean.includes('thay');
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('thao');
        }) || null;
      }
    }

    // 4. Ưu tiên khớp khách Tuyết
    if (!matchedCust) {
      if (cleanDetected.includes('tuyet') || cleanDetectedNoSpace.includes('tuyet')) {
        matchedCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('tuyet');
        }) || null;
      }
    }

    // 5. Ưu tiên khớp các Bếp (B1, B2, B3, B4)
    if (!matchedCust) {
      if (
        cleanDetectedNoSpace === 'b1' ||
        cleanDetectedNoSpace === 'bep1' ||
        cleanDetectedNoSpace === 'bephangxom1' ||
        cleanDetectedNoSpace === 'bl' ||
        cleanDetectedNoSpace === 'bi' ||
        cleanDetectedNoSpace === 'b/' ||
        cleanDetectedNoSpace === 'ba' ||
        cleanDetectedNoSpace === 'ba1' ||
        cleanDetectedNoSpace === 'b-1' ||
        cleanDetectedNoSpace === 'b.1' ||
        cleanDetected.includes('bep hang xom 1') ||
        cleanDetected.includes('truong bo 1')
      ) {
        matchedCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return (cClean.includes('bep hang xom') && cClean.includes('1')) || (cClean.includes('hang xom') && cClean.includes('1'));
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean === 'b1' || cClean.includes('bep 1');
        }) || null;
      } else if (
        cleanDetectedNoSpace === 'b2' ||
        cleanDetectedNoSpace === 'bep2' ||
        cleanDetectedNoSpace === 'bephangxom2' ||
        cleanDetected.includes('bep hang xom 2')
      ) {
        matchedCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return (cClean.includes('bep hang xom') && cClean.includes('2')) || cClean.includes('b2') || cClean.includes('bep 2');
        }) || null;
      } else if (
        cleanDetectedNoSpace === 'b3' ||
        cleanDetectedNoSpace === 'bep3' ||
        cleanDetectedNoSpace === 'bephangxom3' ||
        cleanDetected.includes('bep hang xom 3')
      ) {
        matchedCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return (cClean.includes('bep hang xom') && cClean.includes('3')) || cClean.includes('b3') || cClean.includes('bep 3');
        }) || null;
      } else if (
        cleanDetectedNoSpace === 'b4' ||
        cleanDetectedNoSpace === 'bep4' ||
        cleanDetectedNoSpace === 'vuonxanh' ||
        cleanDetectedNoSpace === 'nhahangvuonxanh' ||
        cleanDetected.includes('vuon xanh')
      ) {
        matchedCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('vuon xanh') || cClean.includes('b4') || cClean.includes('bep 4');
        }) || null;
      }
    }

    // 5b. Ưu tiên khớp khách Huyền Đô Nghĩa nếu AI nhận diện là Huyền hoặc Huyền Đô Nghĩa
    if (!matchedCust) {
      if (
        cleanDetected.includes('huyen do nghia') ||
        cleanDetected.includes('huyen do ngia') ||
        cleanDetected.includes('do nghia') ||
        cleanDetectedNoSpace === 'huyen' ||
        cleanDetectedNoSpace === 'chihuyen' ||
        cleanDetected === 'huyen'
      ) {
        matchedCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('huyen') && (cClean.includes('do nghia') || cClean.includes('do ngia'));
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('do nghia') || cClean.includes('do ngia');
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('huyen');
        }) || null;
      }
    }

    // 5c. Ưu tiên khớp khách Phở tưởng (chị Luyến) nếu AI nhận diện là phở tưởng hoặc luyến
    if (!matchedCust) {
      if (
        cleanDetected.includes('pho tuong') ||
        cleanDetected.includes('tuong') ||
        cleanDetected.includes('luyen') ||
        cleanDetectedNoSpace.includes('photuong') ||
        cleanDetectedNoSpace.includes('tuong') ||
        cleanDetectedNoSpace.includes('luyen')
      ) {
        matchedCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return (cClean.includes('tuong') || cClean.includes('pho tuong')) && cClean.includes('luyen');
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('tuong') && !cClean.includes('tien');
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('luyen');
        }) || null;
      }
    }

    // 5d. Ưu tiên khớp khách Chị Thúy Nga nếu AI nhận diện là chinga, chị nga, nga
    if (!matchedCust) {
      if (
        cleanDetected.includes('chinga') ||
        cleanDetected.includes('chi nga') ||
        cleanDetected.includes('thuy nga') ||
        cleanDetectedNoSpace.includes('chinga') ||
        cleanDetectedNoSpace.includes('thuynga') ||
        cleanDetectedNoSpace === 'nga' ||
        cleanDetected === 'nga'
      ) {
        matchedCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('thuy') && cClean.includes('nga');
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('nga');
        }) || null;
      }
    }

    // 5d2. Ưu tiên khớp khách Cồ Hải
    if (!matchedCust) {
      if (
        cleanDetected.includes('co hai') ||
        cleanDetectedNoSpace.includes('cohai') ||
        cleanDetected === 'co hai' ||
        cleanDetectedNoSpace === 'cohai'
      ) {
        matchedCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase().trim());
          return cClean === 'co hai' && c.isActive && !c.isBadDebt;
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase().trim());
          return cClean === 'co hai';
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase().trim());
          return cClean.includes('co hai');
        }) || null;
      }
    }

    // 5e. Ưu tiên khớp khách Hà Trì
    if (!matchedCust) {
      if (
        cleanDetected.includes('ha tri') ||
        cleanDetected.includes('ha li') ||
        cleanDetected.includes('ha lu') ||
        cleanDetected.includes('ha thi') ||
        cleanDetectedNoSpace === 'hatri' ||
        cleanDetectedNoSpace === 'hali' ||
        cleanDetectedNoSpace === 'halu' ||
        cleanDetectedNoSpace === 'hathi' ||
        cleanDetectedNoSpace.includes('hatri')
      ) {
        const isHanh = cleanDetected.includes('hanh');
        if (isHanh) {
          // Nếu người nói đọc là chị Hạnh -> Khớp khách chị hạnh sân bóng hà trì
          matchedCust = custList.find((c) => {
            const cClean = removeDiacritics(c.name.toLowerCase());
            return cClean.includes('hanh');
          }) || null;
        } else {
          // Đọc là Hà Trì -> 100% là khách Hà Trì, TUYỆT ĐỐI KHÔNG chọn nhầm sang "Chị hạnh sân bóng hà trì"
          matchedCust = custList.find((c) => {
            const cClean = removeDiacritics(c.name.toLowerCase()).trim();
            return cClean === 'ha tri';
          }) || custList.find((c) => {
            const cClean = removeDiacritics(c.name.toLowerCase());
            return (cClean.includes('ha tri') || (cClean.includes('ha') && cClean.includes('tri'))) && !cClean.includes('hanh');
          }) || custList.find((c) => {
            const cClean = removeDiacritics(c.name.toLowerCase());
            return cClean.includes('ha tri') || (cClean.includes('ha') && cClean.includes('tri'));
          }) || null;
        }
      }
    }

    // 5f. Ưu tiên khớp khách Thăn bình đà(anh Nghĩa)
    if (!matchedCust) {
      if (
        cleanDetected.includes('anh nghia') ||
        cleanDetected.includes('anh ngia') ||
        cleanDetected.includes('binh da') ||
        cleanDetected.includes('than binh da') ||
        cleanDetectedNoSpace.includes('anhnghia') ||
        cleanDetectedNoSpace.includes('anhngia') ||
        cleanDetectedNoSpace === 'nghia' ||
        cleanDetectedNoSpace === 'ngia'
      ) {
        matchedCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('binh da') && (cClean.includes('nghia') || cClean.includes('than'));
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('binh da');
        }) || null;
      }
    }

    // 5g. Ưu tiên khớp khách Bà lưu
    if (!matchedCust) {
      if (
        cleanDetected.includes('ba luu') ||
        cleanDetected.includes('bà lưu') ||
        cleanDetectedNoSpace === 'baluu' ||
        cleanDetectedNoSpace === 'luu'
      ) {
        matchedCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean === 'ba luu' || cClean.includes('ba luu');
        }) || null;
      }
    }

    // 5h. Ưu tiên khớp khách 52 trần thái tông
    if (!matchedCust) {
      if (
        cleanDetected.includes('52') ||
        cleanDetectedNoSpace.includes('52') ||
        (cleanDetected.includes('tran thai tong') && !cleanDetected.includes('47'))
      ) {
        matchedCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('52') && (cClean.includes('tran thai tong') || cClean.includes('thai tong') || cClean.includes('tran'));
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('52');
        }) || null;
      }
    }

    // 5i-1. Ưu tiên khớp khách 126 Nguyễn Khánh Toàn
    if (!matchedCust) {
      if (
        cleanDetected.includes('126') ||
        cleanDetectedNoSpace.includes('126') ||
        cleanDetected.includes('khanh toan') ||
        cleanDetectedNoSpace.includes('khanhtoan')
      ) {
        matchedCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return (cClean.includes('126') && cClean.includes('toan')) ||
            (cClean.includes('khanh') && cClean.includes('toan')) ||
            cClean.includes('126');
        }) || null;
      }
    }

    // 5i. Ưu tiên khớp khách Minh trang
    if (!matchedCust) {
      if (
        cleanDetected.includes('minh trang') ||
        cleanDetected.includes('mih trang') ||
        cleanDetected.includes('minh tuy') ||
        cleanDetected.includes('mih tuy') ||
        cleanDetected.includes('mih') ||
        cleanDetectedNoSpace === 'minh' ||
        cleanDetectedNoSpace === 'mih' ||
        cleanDetectedNoSpace.includes('minhtrang') ||
        cleanDetectedNoSpace.includes('mihtrang') ||
        cleanDetectedNoSpace.includes('mihtuy') ||
        cleanDetectedNoSpace.includes('minhtuy')
      ) {
        matchedCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('minh') && cClean.includes('trang');
        }) || null;
      }
    }

    // 5j. Ưu tiên khớp khách Trung kính / Bếp trung kính
    if (!matchedCust) {
      if (
        cleanDetected.includes('trung kinh') ||
        cleanDetected.includes('bep trung kinh') ||
        cleanDetected.includes('trung kh') ||
        cleanDetected.includes('tuy kh') ||
        cleanDetected.includes('tuy ks') ||
        cleanDetected.includes('tug kh') ||
        cleanDetected.includes('tung kh') ||
        cleanDetected.includes('truy kh') ||
        cleanDetectedNoSpace === 'trungkinh' ||
        cleanDetectedNoSpace === 'tuykh' ||
        cleanDetectedNoSpace === 'tuykhs' ||
        cleanDetectedNoSpace === 'tuyks' ||
        cleanDetectedNoSpace === 'tugkh' ||
        cleanDetectedNoSpace === 'tungkh' ||
        cleanDetectedNoSpace === 'truykh' ||
        cleanDetectedNoSpace.includes('trungkinh') ||
        cleanDetectedNoSpace.includes('beptrungkinh')
      ) {
        matchedCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('bep trung kinh') || (cClean.includes('trung') && cClean.includes('kinh'));
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('trung kinh') || cClean === 'trungkinh';
        }) || null;
      }
    }

    // 5k. Ưu tiên phân biệt rõ khách "văn khê" và "Bún huế van khe"
    if (!matchedCust) {
      if (cleanDetected.includes('van khe') || cleanDetectedNoSpace.includes('vankhe')) {
        const hasBunHue = cleanDetected.includes('bun hue') || cleanDetected.includes('bun bo hue') ||
          cleanDetectedNoSpace.includes('bunhue') || (cleanDetected.includes('bun') && cleanDetected.includes('van khe'));
        if (!hasBunHue) {
          matchedCust = custList.find((c) => {
            const cClean = removeDiacritics(c.name.toLowerCase());
            return cClean === 'van khe' || (cClean.includes('van khe') && !cClean.includes('bun'));
          }) || null;
        } else {
          matchedCust = custList.find((c) => {
            const cClean = removeDiacritics(c.name.toLowerCase());
            return (cClean.includes('bun hue') && cClean.includes('van khe')) || (cClean.includes('bun') && cClean.includes('van khe'));
          }) || null;
        }
      } else if (cleanDetected.includes('bun hue') || cleanDetectedNoSpace.includes('bunhue')) {
        matchedCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('bun hue');
        }) || null;
      } else if (
        cleanDetected.includes('thai ha') ||
        cleanDetected.includes('thái hà') ||
        cleanDetectedNoSpace.includes('thaiha') ||
        cleanDetected.includes('hku ha') ||
        cleanDetectedNoSpace.includes('hkuha') ||
        cleanDetected.includes('hki ha') ||
        cleanDetectedNoSpace.includes('hkiha') ||
        cleanDetected.includes('hkui ha') ||
        cleanDetectedNoSpace.includes('hkuiha') ||
        cleanDetected.includes('hkai ha') ||
        cleanDetectedNoSpace.includes('hkaiha') ||
        cleanDetected.includes('thki ha') ||
        cleanDetectedNoSpace.includes('thkiha') ||
        cleanDetected.includes('hai ha') ||
        cleanDetectedNoSpace.includes('haiha')
      ) {
        matchedCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean === 'thai ha' || (cClean.includes('thai') && cClean.includes('ha') && !cClean.includes('ngoc lam'));
        }) || null;
      } else if (
        cleanDetected === 'a thang' ||
        cleanDetected === 'athang' ||
        cleanDetected === 'a.thang' ||
        cleanDetected === 'anh thang' ||
        cleanDetectedNoSpace === 'athang' ||
        cleanDetectedNoSpace === 'anhthang' ||
        cleanDetected.includes('thang pho co') ||
        cleanDetectedNoSpace.includes('thangphoco') ||
        (cleanDetected.includes('thang') && !cleanDetected.includes('chu tu'))
      ) {
        matchedCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean.includes('thang') && cClean.includes('pho co');
        }) || custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean === 'anh thang pho co';
        }) || null;
      } else if (
        cleanDetected === 'pho dg' ||
        cleanDetected === 'phodg' ||
        cleanDetected === 'pho dong' ||
        cleanDetected === 'phodong' ||
        cleanDetected === 'dg' ||
        cleanDetectedNoSpace === 'phodg' ||
        cleanDetectedNoSpace === 'phodong' ||
        (cleanDetected.includes('pho') && (cleanDetected.includes('dg') || cleanDetected.includes('dong'))) ||
        cleanDetected.includes('pho dong')
      ) {
        matchedCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean === 'pho dong' || (cClean.includes('pho') && cClean.includes('dong'));
        }) || null;
      } else if (
        (cleanDetected.includes('gia') && (cleanDetected.includes('hung') || cleanDetected.includes('hy')) && (cleanDetected.includes('cs2') || cleanDetected.includes('cs 2') || cleanDetected.includes('co so 2') || cleanDetected.endsWith('2'))) ||
        cleanDetectedNoSpace.includes('giahycs2') ||
        cleanDetectedNoSpace.includes('giahungcs2') ||
        cleanDetected.includes('gia hy cs2') ||
        cleanDetected.includes('gia hung cs2')
      ) {
        matchedCust = custList.find((c) => {
          const cClean = removeDiacritics(c.name.toLowerCase());
          return cClean === 'gia hung cs2' || (cClean.includes('gia hung') && cClean.includes('cs2'));
        }) || null;
      }
    }

    // 6. Khớp thông thường:
    // 6.1. BẮT BUỘC ƯU TIÊN KHỚP CHÍNH XÁC 100% (Exact Match) TRƯỚC
    // Tuyệt đối không để trường hợp khách "Kcc" bị nhận nhầm sang "Kcc1"!
    if (!matchedCust) {
      matchedCust = custList.find((c) => {
        const cName = removeDiacritics(c.name.toLowerCase().trim());
        const cNameNoSpace = cName.replace(/\s+/g, '');
        return cName === cleanDetected || cNameNoSpace === cleanDetectedNoSpace;
      }) || null;
    }

    // 6.2. Chỉ khi KHÔNG CÓ khách nào khớp 100%, mới tìm so khớp một phần (includes)
    if (!matchedCust) {
      const sortedCusts = [...custList].sort((a, b) => b.name.length - a.name.length);
      matchedCust = sortedCusts.find((c) => {
        const cName = removeDiacritics(c.name.toLowerCase().trim());
        const cNameNoSpace = cName.replace(/\s+/g, '');
        // Chỉ cho phép includes khi tên khách có ít nhất 3 ký tự (tránh khách 1 ký tự như "N")
        if (cName.length >= 3 && cleanDetected.includes(cName)) return true;
        if (cNameNoSpace.length >= 3 && cleanDetectedNoSpace.includes(cNameNoSpace)) return true;
        if (cleanDetected.length >= 3 && cName.includes(cleanDetected)) return true;
        if (cleanDetectedNoSpace.length >= 3 && cNameNoSpace.includes(cleanDetectedNoSpace)) return true;
        return false;
      }) || null;
    }
  }
  return matchedCust;
};

const StaffSubmissionReviewModal = forwardRef(({ onRefresh }, ref) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1024;
  const isPC = width >= 1024;

  // Tính toán số cột và độ rộng tối ưu để thẻ luôn vừa vặn mọi màn hình (Mobile, Tablet, Laptop 1366px, Desktop 1080p, Màn hình lớn 2K/4K)
  const cardResponsiveStyle = useMemo(() => {
    if (width < 640) {
      // Mobile: 1 thẻ chiếm trọn 100% chiều ngang
      return {
        width: '100%',
        maxWidth: '100%',
        flexBasis: '100%',
        flexGrow: 0,
        flexShrink: 0,
      };
    }

    let cols = 2;
    if (width >= 1800) {
      cols = 5; // Màn hình rất lớn / Ultrawide >= 1800px (mỗi thẻ ~340px - 380px)
    } else if (width >= 1440) {
      cols = 4; // Màn hình desktop Full HD tiêu chuẩn (mỗi thẻ ~340px - 410px)
    } else if (width >= 1050) {
      cols = 3; // Màn hình laptop phổ biến 13"-15" (1280px, 1366px, hoặc 1080p zoom 125%/150%) (mỗi thẻ ~330px - 430px)
    } else {
      cols = 2; // Tablet, iPad, hoặc cửa sổ thu nhỏ (mỗi thẻ ~310px - 480px)
    }

    const gap = 12;
    const totalGaps = (cols - 1) * gap;
    const widthPct = `calc((100% - ${totalGaps}px) / ${cols})`;

    return {
      width: widthPct,
      maxWidth: widthPct,
      flexBasis: widthPct,
      flexGrow: 0,
      flexShrink: 0,
    };
  }, [width]);

  const [activeDropdownSubId, setActiveDropdownSubId] = useState(null);

  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Bộ lọc
  const [filterStatus, setFilterStatus] = useState('ALL'); // ALL | UNPROCESSED | APPROVED
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

  // Quản lý dữ liệu form cho TỪNG hóa đơn (Key: sub.id)
  const [cardDataMap, setCardDataMap] = useState({});

  // Trạng thái lưu hàng loạt
  const [submittingBatch, setSubmittingBatch] = useState(false);

  // Quản lý link Zalo nhân viên
  const [showLinkManager, setShowLinkManager] = useState(false);
  const [staffLinks, setStaffLinks] = useState([]);
  const [loadingLinks, setLoadingLinks] = useState(false);

  // Refs điều khiển modal phụ và scroll
  const scrollViewRef = useRef(null);
  const cardLayoutRefs = useRef({});
  const imagePreviewModalRef = useRef(null);
  const detailModalRef = useRef(null);
  const popupModalRef = useRef(null);
  const isOpenActionRef = useRef(false);

  // Tải danh sách khách hàng và sản phẩm
  const fetchMasterData = async () => {
    try {
      const [custRes, prodRes] = await Promise.all([
        api.get('/customers?isBadDebt=false'),
        api.get('/products'),
      ]);
      const custList = custRes.data.success ? (custRes.data.data || []) : [];
      const prodList = prodRes.data.success
        ? (prodRes.data.data || []).filter(
          (p) => p.name !== 'Tiền hàng' && !p.name.toLowerCase().startsWith('tiền')
        )
        : [];
      if (custRes.data.success) setCustomers(custList);
      if (prodRes.data.success) setProducts(prodList);
      return { custList, prodList };
    } catch (err) {
      console.warn('Lỗi khi tải danh bạ:', err);
      return { custList: [], prodList: [] };
    }
  };

  // Quản lý giá thịt riêng theo từng khách hàng { [customerId]: productListWithCustomPrices }
  const [custProductsMap, setCustProductsMap] = useState({});

  // Tải danh sách hóa đơn nhân viên nộp và nạp xong toàn bộ bảng giá riêng mới hiển thị cho chỉnh sửa
  const fetchSubmissions = async (overrideCustList, overrideProdList) => {
    try {
      setLoading(true);
      const params = {};
      if (filterStatus === 'APPROVED') {
        params.status = 'APPROVED';
      } else if (filterStatus === 'UNPROCESSED') {
        params.status = 'READY_FOR_REVIEW';
      }
      if (filterDate) {
        const [d, m, y] = filterDate.split('/');
        params.date = `${y}-${m}-${d}`;
      }
      const res = await api.get('/staff-submissions', { params });
      if (res.data.success) {
        const list = res.data.data || [];
        setSubmissions(list);
        const effectiveCustList = (overrideCustList && overrideCustList.length > 0) ? overrideCustList : customers;
        const effectiveProdList = (overrideProdList && overrideProdList.length > 0) ? overrideProdList : products;

        // 1. Nhận diện khách hàng cho toàn bộ danh sách hóa đơn (lấy cả đơn đã duyệt và chưa duyệt)
        const allCustIds = [
          ...new Set(
            list
              .map((s) => {
                if (s.status === 'APPROVED') {
                  return s.matchedCustomerId || s.matchedCustomer?.id || resolveCustomerForSub(s, effectiveCustList)?.id;
                }
                return resolveCustomerForSub(s, effectiveCustList)?.id;
              })
              .filter(Boolean)
          ),
        ];

        // 2. BẮT BUỘC TẢI XONG BẢNG GIÁ RIÊNG CỦA TẤT CẢ KHÁCH HÀNG TRƯỚC KHI MỞ KHÓA CHO PHÉP CHỈNH SỬA
        const latestCustMap = { ...custProductsMap };
        const missingCustIds = allCustIds.filter((id) => !latestCustMap[id] || latestCustMap[id].length === 0);

        if (missingCustIds.length > 0) {
          const fetchResults = await Promise.all(
            missingCustIds.map(async (cId) => {
              try {
                const pRes = await api.get(`/products?customerId=${cId}`);
                const custProds = (pRes.data?.data || []).filter(
                  (p) => p.name !== 'Tiền hàng' && !p.name.toLowerCase().startsWith('tiền')
                );
                return [cId, custProds];
              } catch {
                return [cId, []];
              }
            })
          );
          fetchResults.forEach(([cId, prods]) => {
            if (prods && prods.length > 0) {
              latestCustMap[cId] = prods;
            }
          });
          setCustProductsMap(latestCustMap);
        }

        // 3. Khởi tạo dữ liệu form với đầy đủ giá riêng đã được tải xong
        initCardDataMap(list, effectiveCustList, effectiveProdList, latestCustMap);
      }
    } catch (err) {
      console.error('Lỗi khi tải hóa đơn nhân viên:', err);
      showGlobalToast('Không thể tải danh sách hóa đơn nhân viên.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Helper tìm kiếm sản phẩm phù hợp nhất trong danh mục món của khách hàng
  const findBestMatchingProduct = (it, prodList) => {
    if (!Array.isArray(prodList) || prodList.length === 0) return null;

    // 1. Khớp theo ID chính xác đã có
    if (it.matchedProductId) {
      const found = prodList.find((p) => p.id === it.matchedProductId);
      if (found) return found;
    }
    if (it.selectedProduct?.id && it.selectedProduct.id !== '__manual__') {
      const found = prodList.find((p) => p.id === it.selectedProduct.id);
      if (found) return found;
    }

    // 2. Lấy tên thô của món thịt
    const raw = (it.rawName || it.selectedProduct?.name || '').trim();
    if (!raw) return null;
    const cleanRaw = removeDiacritics(raw.toLowerCase());
    const cleanRawNoSpace = cleanRaw.replace(/[\s\(\)\-_,.]+/g, '');

    // 3. So khớp chính xác theo tên không dấu
    let match = prodList.find((p) => {
      const pClean = removeDiacritics(p.name.toLowerCase().trim());
      const pCleanNoSpace = pClean.replace(/[\s\(\)\-_,.]+/g, '');
      return pClean === cleanRaw || pCleanNoSpace === cleanRawNoSpace;
    });
    if (match) return match;

    // 4. So khớp theo các loại thịt phổ biến
    // Tái / Tái bò
    if (cleanRaw.includes('tai') || cleanRawNoSpace.includes('tai')) {
      match = prodList.find((p) => {
        const pClean = removeDiacritics(p.name.toLowerCase());
        return pClean.includes('tai');
      });
      if (match) return match;
    }

    // Bắp / Bắp bò
    if (cleanRaw.includes('bap') || cleanRawNoSpace.includes('bap')) {
      match = prodList.find((p) => {
        const pClean = removeDiacritics(p.name.toLowerCase());
        return pClean.includes('bap');
      });
      if (match) return match;
    }

    // Gầu / Gầu bò
    if (cleanRaw.includes('gau') || cleanRawNoSpace.includes('gau')) {
      match = prodList.find((p) => {
        const pClean = removeDiacritics(p.name.toLowerCase());
        return pClean.includes('gau');
      });
      if (match) return match;
    }

    // Nạm / Nạm bò / Lạm
    if (cleanRaw.includes('nam') || cleanRaw.includes('lam') || cleanRawNoSpace.includes('nam') || cleanRawNoSpace.includes('lam')) {
      match = prodList.find((p) => {
        const pClean = removeDiacritics(p.name.toLowerCase());
        return pClean.includes('nam') || pClean.includes('lam');
      });
      if (match) return match;
    }

    // Quả bằng / Bằng
    if (cleanRaw.includes('bang') || cleanRawNoSpace.includes('bang')) {
      match = prodList.find((p) => {
        const pClean = removeDiacritics(p.name.toLowerCase());
        return pClean.includes('bang') || pClean.includes('qua bang');
      });
      if (match) return match;
    }

    // Tràng bò / Tràng (Ưu tiên nhận diện trước quả trắng)
    if (cleanRaw.includes('trang bo') || cleanRawNoSpace.includes('trangbo') || (cleanRaw.includes('trang') && cleanRaw.includes('bo'))) {
      match = prodList.find((p) => {
        const pClean = removeDiacritics(p.name.toLowerCase());
        return pClean.includes('trang bo') || (pClean.includes('trang') && pClean.includes('bo'));
      }) || prodList.find((p) => {
        const pClean = removeDiacritics(p.name.toLowerCase());
        return pClean.includes('trang') && !pClean.includes('qua trang');
      });
      if (match) return match;
    }

    // Quả trắng / Trắng
    if (cleanRaw.includes('trang') || cleanRawNoSpace.includes('trang')) {
      match = prodList.find((p) => {
        const pClean = removeDiacritics(p.name.toLowerCase());
        return pClean.includes('trang') || pClean.includes('qua trang');
      });
      if (match) return match;
    }

    // Quạt / Xương quạt
    if (cleanRaw.includes('quat') || cleanRawNoSpace.includes('quat')) {
      match = prodList.find((p) => {
        const pClean = removeDiacritics(p.name.toLowerCase());
        return pClean.includes('quat');
      });
      if (match) return match;
    }

    // Xg / X / Xg bò / Xương
    if (
      cleanRaw === 'xg' ||
      cleanRaw === 'x' ||
      cleanRawNoSpace === 'xg' ||
      cleanRawNoSpace === 'x' ||
      cleanRaw.includes('xg') ||
      cleanRaw.includes('xuong')
    ) {
      match = prodList.find((p) => {
        const pClean = removeDiacritics(p.name.toLowerCase());
        return pClean.includes('xg') || pClean.includes('xuong') || pClean === 'x';
      });
      if (match) return match;
    }

    // Thăn / Thăn bò
    if (cleanRaw.includes('than') || cleanRawNoSpace.includes('than')) {
      match = prodList.find((p) => {
        const pClean = removeDiacritics(p.name.toLowerCase());
        return pClean.includes('than');
      });
      if (match) return match;
    }

    // Gân
    if (cleanRaw.includes('gan') || cleanRawNoSpace.includes('gan')) {
      match = prodList.find((p) => {
        const pClean = removeDiacritics(p.name.toLowerCase());
        return pClean.includes('gan');
      });
      if (match) return match;
    }

    // Sườn / Sườn bò / Sườn vai
    if (cleanRaw.includes('suon') || cleanRawNoSpace.includes('suon')) {
      match = prodList.find((p) => {
        const pClean = removeDiacritics(p.name.toLowerCase());
        return pClean.includes('suon');
      });
      if (match) return match;
    }

    // Lá / Lá vai / Thịt la vai / La / Sách
    if (
      cleanRaw === 'la' || cleanRaw === 'la vai' || cleanRaw === 'thit la vai' || cleanRaw === 'thit la' ||
      cleanRaw.includes('la vai') || cleanRaw.includes('la xach') || cleanRaw.includes('sach') ||
      cleanRawNoSpace.includes('lavai') || cleanRawNoSpace === 'la' || cleanRawNoSpace === 'thitla'
    ) {
      match = prodList.find((p) => {
        const pClean = removeDiacritics(p.name.toLowerCase());
        return pClean.includes('la vai') || pClean.includes('la') || pClean.includes('sach');
      });
      if (match) return match;
    }

    // Vai xay / Bò xay / Xay
    if (cleanRaw.includes('xay') || cleanRawNoSpace.includes('xay')) {
      match = prodList.find((p) => {
        const pClean = removeDiacritics(p.name.toLowerCase());
        return pClean.includes('xay') || pClean.includes('vai xay') || pClean.includes('bo xay');
      });
      if (match) return match;
    }

    // Lạm gầu
    if ((cleanRaw.includes('lam') && cleanRaw.includes('gau')) || (cleanRaw.includes('nam') && cleanRaw.includes('gau'))) {
      match = prodList.find((p) => {
        const pClean = removeDiacritics(p.name.toLowerCase());
        return (pClean.includes('lam') || pClean.includes('nam')) && pClean.includes('gau');
      });
      if (match) return match;
    }

    // Dẻ sườn
    if (cleanRaw.includes('de suon') || cleanRawNoSpace.includes('desuon')) {
      match = prodList.find((p) => {
        const pClean = removeDiacritics(p.name.toLowerCase());
        return pClean.includes('de suon');
      });
      if (match) return match;
    }

    // Bò / Thịt bò
    if (cleanRaw === 'bo' || cleanRaw === 'thit bo' || cleanRawNoSpace === 'bo' || cleanRawNoSpace === 'thitbo') {
      match = prodList.find((p) => {
        const pClean = removeDiacritics(p.name.toLowerCase().trim());
        return pClean === 'bo' || pClean === 'thit bo';
      });
      if (match) return match;
    }

    // Tiết / Tiết bò
    if (cleanRaw.includes('tiet') || cleanRawNoSpace.includes('tiet')) {
      match = prodList.find((p) => {
        const pClean = removeDiacritics(p.name.toLowerCase());
        return pClean.includes('tiet');
      });
      if (match) return match;
    }

    // Bê / Bê ba chỉ
    if (cleanRaw.includes('be') || cleanRawNoSpace.includes('be')) {
      match = prodList.find((p) => {
        const pClean = removeDiacritics(p.name.toLowerCase());
        return (pClean.includes('be') && pClean.includes('ba chi')) || pClean.includes('be');
      });
      if (match) return match;
    }

    // Thịt chín / chí / chín
    if (cleanRaw.includes('chin') || cleanRaw === 'chi' || cleanRawNoSpace.includes('chin')) {
      match = prodList.find((p) => {
        const pClean = removeDiacritics(p.name.toLowerCase());
        return pClean.includes('chin') || pClean.includes('thit chin');
      });
      if (match) return match;
    }

    // Xô / Thịt xô
    if (cleanRaw.includes('xo') || cleanRawNoSpace.includes('xo')) {
      match = prodList.find((p) => {
        const pClean = removeDiacritics(p.name.toLowerCase());
        return pClean.includes('xo');
      });
      if (match) return match;
    }

    // Tim, Cật, Đuôi
    if (cleanRaw.includes('tim')) {
      match = prodList.find((p) => removeDiacritics(p.name.toLowerCase()).includes('tim'));
      if (match) return match;
    }
    if (cleanRaw.includes('cat')) {
      match = prodList.find((p) => removeDiacritics(p.name.toLowerCase()).includes('cat'));
      if (match) return match;
    }
    if (cleanRaw.includes('duoi')) {
      match = prodList.find((p) => removeDiacritics(p.name.toLowerCase()).includes('duoi'));
      if (match) return match;
    }

    // 5. So khớp chứa chuỗi (nếu chuỗi >= 3 ký tự)
    match = prodList.find((p) => {
      const pClean = removeDiacritics(p.name.toLowerCase().trim());
      return (cleanRaw.length >= 3 && pClean.includes(cleanRaw)) ||
        (pClean.length >= 3 && cleanRaw.includes(pClean));
    });

    return match || null;
  };

  // Cập nhật giá riêng của khách hàng vào danh sách các món trong thẻ
  const applyCustPricesToItems = (items, custProds) => {
    if (!Array.isArray(items) || !Array.isArray(custProds)) return items;

    return items.map((it) => {
      const pData = findBestMatchingProduct(it, custProds);
      if (!pData) return it;

      // Ưu tiên giá riêng của khách nếu có, không thì lấy giá mặc định
      const hasCustPrice = pData.customPrice !== undefined && pData.customPrice !== null && !isNaN(Number(pData.customPrice)) && Number(pData.customPrice) > 0;
      const effectivePrice = hasCustPrice
        ? Number(pData.customPrice)
        : (pData.defaultPrice !== undefined && pData.defaultPrice !== null ? Number(pData.defaultPrice) : (pData.baseDefaultPrice ? Number(pData.baseDefaultPrice) : null));

      if (effectivePrice != null && !isNaN(effectivePrice) && effectivePrice > 0) {
        const cleanQtyStr = String(it.quantity || '').trim().replace(',', '.');
        const qty = parseFloat(cleanQtyStr) || 0;

        // BẮT BUỘC: RESET ĐƠN GIÁ VỀ ĐÚNG GIÁ RIÊNG CỦA KHÁCH ĐÓ
        const newPriceStr = String(Math.round(effectivePrice));
        // Thành tiền tự động tính lại = Số kg * Đơn giá riêng mới (nếu có số kg)
        const newAmountStr = qty > 0 ? String(Math.round(qty * effectivePrice)) : (it.amount || '');

        return {
          ...it,
          selectedProduct: pData,
          matchedProductId: pData.id,
          rawName: pData.name || it.rawName,
          price: newPriceStr,
          amount: newAmountStr,
        };
      }
      return {
        ...it,
        selectedProduct: pData,
        matchedProductId: pData.id,
        rawName: pData.name || it.rawName,
      };
    });
  };

  // Tải danh sách sản phẩm kèm giá riêng của khách hàng (hỗ trợ forceRefresh khi vừa cập nhật giá)
  const fetchProductsForCustomer = async (customerId, forceRefresh = false) => {
    if (!customerId) return [];
    if (!forceRefresh && custProductsMap[customerId]) {
      syncCardPricesWithCustomer(customerId, custProductsMap[customerId]);
      return custProductsMap[customerId];
    }
    try {
      const res = await api.get(`/products?customerId=${customerId}`);
      const custProds = (res.data?.data || []).filter(
        (p) => p.name !== 'Tiền hàng' && !p.name.toLowerCase().startsWith('tiền')
      );
      setCustProductsMap((prev) => ({ ...prev, [customerId]: custProds }));
      syncCardPricesWithCustomer(customerId, custProds);
      return custProds;
    } catch (e) {
      console.warn('[FETCH CUST PRODUCTS ERROR]', e);
      return [];
    }
  };

  // Đồng bộ lại giá riêng của khách hàng cho các thẻ đang chọn khách hàng này
  const syncCardPricesWithCustomer = (customerId, custProds) => {
    if (!Array.isArray(custProds) || custProds.length === 0) return;

    setCardDataMap((prev) => {
      let hasChange = false;
      const nextMap = { ...prev };

      Object.keys(nextMap).forEach((subId) => {
        const card = nextMap[subId];
        if (card.customer?.id !== customerId || !Array.isArray(card.items)) return;

        const newItems = applyCustPricesToItems(card.items, custProds);
        hasChange = true;
        nextMap[subId] = {
          ...card,
          items: newItems,
        };
      });

      return hasChange ? nextMap : prev;
    });
  };

  // Chọn 1 món thịt cho dòng dữ liệu: TỰ ĐỘNG CẬP NHẬT ĐƠN GIÁ và TÍNH LẠI THÀNH TIỀN
  const selectProductForCardItem = (subId, itemIdx, p) => {
    if (!p) return;
    setCardDataMap((prev) => {
      const card = prev[subId];
      if (!card) return prev;
      const nextItems = [...card.items];
      const currentItem = nextItems[itemIdx] || {};

      // Ưu tiên giá riêng (customPrice) của khách, nếu không có thì lấy giá mặc định (defaultPrice)
      const effectivePrice = p.customPrice !== undefined && p.customPrice !== null && !isNaN(Number(p.customPrice)) && Number(p.customPrice) > 0
        ? Number(p.customPrice)
        : (p.defaultPrice !== undefined && p.defaultPrice !== null ? Number(p.defaultPrice) : null);

      const qty = parseFloat(currentItem.quantity) || 0;
      let newPriceStr = currentItem.price || '';
      let newAmountStr = currentItem.amount || '';

      if (effectivePrice != null && !isNaN(effectivePrice) && effectivePrice > 0) {
        newPriceStr = String(Math.round(effectivePrice));
        // Tự động tính lại thành tiền: amount = qty * effectivePrice
        if (qty > 0) {
          newAmountStr = String(Math.round(qty * effectivePrice));
        }
      }

      nextItems[itemIdx] = {
        ...currentItem,
        selectedProduct: p,
        matchedProductId: p.id,
        rawName: p.name,
        price: newPriceStr,
        amount: newAmountStr,
      };

      return {
        ...prev,
        [subId]: {
          ...card,
          items: nextItems,
        },
      };
    });
  };

  // Xử lý khi người dùng chủ động chọn khách hàng cho một thẻ hóa đơn
  const handleCustomerChange = async (subId, selectedCustomer) => {
    if (!selectedCustomer) {
      updateCardField(subId, 'customer', null);
      return;
    }

    // 1. Cập nhật ngay tên khách vào thẻ và bật cờ isLoadingPrice = true để khóa ô nhập
    setCardDataMap((prev) => {
      const card = prev[subId] || {};
      return {
        ...prev,
        [subId]: {
          ...card,
          customer: selectedCustomer,
          isLoadingPrice: true,
        },
      };
    });

    try {
      // 2. BẮT BUỘC luôn lấy bảng giá sản phẩm (kèm giá riêng mới nhất) của khách hàng từ server
      let custProds = null;
      try {
        const res = await api.get(`/products?customerId=${selectedCustomer.id}`);
        custProds = (res.data?.data || []).filter(
          (p) => p.name !== 'Tiền hàng' && !p.name.toLowerCase().startsWith('tiền')
        );
        setCustProductsMap((prev) => ({ ...prev, [selectedCustomer.id]: custProds }));
      } catch (err) {
        console.warn('[HANDLE_CUST_CHANGE_FETCH_ERROR]', err);
        custProds = custProductsMap[selectedCustomer.id] || [];
      }

      // 3. Áp dụng giá riêng của khách hàng đó vào TẤT CẢ các dòng món thịt của thẻ này
      const sub = submissions.find((s) => s.id === subId);
      let customPriceCount = 0;
      setCardDataMap((prev) => {
        const card = prev[subId];
        if (!card) return prev;

        const updatedItems = (custProds && custProds.length > 0)
          ? applyCustPricesToItems(card.items, custProds)
          : card.items;

        customPriceCount = updatedItems.filter((it) => it.selectedProduct?.hasCustomPrice || it.selectedProduct?.customPrice != null).length;

        // Xử lý đặc thù Chị Tuyết: gửi về, trả về không có tên thịt -> Thịt chín
        const isTuyetChange = selectedCustomer.id === '585fa225-f5e2-407d-89ea-c0afecc8263b' ||
          removeDiacritics(selectedCustomer.name.toLowerCase()).includes('tuyet');
        const isCardReturnChange = card.isReturn || Boolean(sub?.note && /(trả|gửi về|trả về|trả lại|gửi lại|hàng trả)/i.test(sub.note));
        if (isTuyetChange && isCardReturnChange && updatedItems.length > 0 && custProds && custProds.length > 0) {
          const chinProduct = custProds.find((p) => {
            const pClean = removeDiacritics(p.name.toLowerCase().trim());
            return pClean.includes('chin') || pClean.includes('thit chin');
          }) || null;

          updatedItems.forEach((it, idx) => {
            const cleanRaw = removeDiacritics((it.rawName || '').toLowerCase().trim());
            const returnKeywordsRegex = /\b(trả hàng|gửi về|trả về|trả lại|gửi lại|hàng trả|thu hồi|bắn về|quay đầu|đổi trả|hoàn hàng|tra hang|gui ve|tra ve|tra lai|gui lai|hang tra|quay dau|doi tra|hoan hang|tra|trả)\b/gi;
            const pureClean = cleanRaw.replace(returnKeywordsRegex, '').trim();
            if (!pureClean || ['thit', 'thit bo', 'mon le', 'thit le', 'thit thai', ''].includes(pureClean)) {
              const qty = parseFloat(it.quantity) || 0;
              const hasChinPrice = chinProduct && chinProduct.customPrice != null && Number(chinProduct.customPrice) > 0;
              const chinPrice = hasChinPrice
                ? Number(chinProduct.customPrice)
                : (chinProduct?.defaultPrice != null ? Number(chinProduct.defaultPrice) : null);
              const priceStr = chinPrice ? String(Math.round(chinPrice)) : it.price;
              const amountStr = (qty > 0 && chinPrice) ? String(Math.round(qty * chinPrice)) : it.amount;

              updatedItems[idx] = {
                ...it,
                rawName: 'Thịt chín',
                selectedProduct: chinProduct || it.selectedProduct,
                matchedProductId: chinProduct?.id || it.matchedProductId,
                price: priceStr,
                amount: amountStr,
              };
            }
          });
        }

        // Xử lý đặc thù video khách Hương nếu có
        const isHuong = removeDiacritics(selectedCustomer.name.toLowerCase()).includes('huong');
        const isVideo = sub?.fileType === 'VIDEO';

        if (isHuong && isVideo && updatedItems.length > 0 && custProds && custProds.length > 0) {
          const xoProduct = custProds.find((p) => removeDiacritics(p.name.toLowerCase().trim()) === 'xo') || null;
          updatedItems.forEach((it, idx) => {
            const cleanRaw = removeDiacritics((it.rawName || '').toLowerCase().trim());
            if (!it.selectedProduct || !cleanRaw || ['thit', 'thit le', 'thit bo', 'mon le', 'xo', 'thit xo'].includes(cleanRaw) || cleanRaw.includes('xo')) {
              const qty = parseFloat(it.quantity) || 0;
              updatedItems[idx] = {
                ...it,
                rawName: 'xô',
                selectedProduct: xoProduct || it.selectedProduct,
                matchedProductId: xoProduct?.id || it.matchedProductId,
                price: it.price || '230000',
                amount: it.amount || (qty > 0 ? String(Math.round(qty * 230000)) : ''),
              };
            }
          });
        }

        return {
          ...prev,
          [subId]: {
            ...card,
            customer: selectedCustomer,
            items: updatedItems,
            isLoadingPrice: false,
          },
        };
      });

      if (customPriceCount > 0) {
        showGlobalToast(`Đã áp dụng giá riêng của ${selectedCustomer.name} cho ${customPriceCount} món!`, 'info');
      }
    } catch (e) {
      console.warn('Lỗi khi cập nhật giá riêng:', e);
      setCardDataMap((prev) => {
        const card = prev[subId];
        if (!card) return prev;
        return {
          ...prev,
          [subId]: {
            ...card,
            isLoadingPrice: false,
          },
        };
      });
    }
  };

  // ─── CÁC THAO TÁC CHẾ ĐỘ NHẬP NHANH (TIỀN HÀNG) ───
  const toggleOrderMode = (subId) => {
    setCardDataMap((prev) => {
      const card = prev[subId];
      if (!card) return prev;
      const newMode = card.orderMode === 'quick' ? 'detail' : 'quick';
      let quickAmt = card.quickAmount;
      let subAmounts = card.quickSubAmounts || [];
      if (newMode === 'quick') {
        if (!quickAmt || parseFloat(quickAmt) === 0) {
          const sum = (card.items || []).reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
          quickAmt = sum > 0 ? String(sum) : '';
        }
        if (subAmounts.length === 0 && Array.isArray(card.items) && card.items.length > 1) {
          subAmounts = card.items.map((it) => parseFloat(it.amount) || 0).filter((v) => v > 0);
        }
      }
      return {
        ...prev,
        [subId]: {
          ...card,
          orderMode: newMode,
          quickAmount: quickAmt,
          quickSubAmounts: subAmounts,
        },
      };
    });
  };

  const updateQuickAmount = (subId, amount) => {
    updateCardField(subId, 'quickAmount', amount);
  };

  const addQuickSubAmount = (subId) => {
    setCardDataMap((prev) => {
      const card = prev[subId];
      if (!card) return prev;
      const subAmounts = [...(card.quickSubAmounts || []), 0];
      return {
        ...prev,
        [subId]: {
          ...card,
          quickSubAmounts: subAmounts,
        },
      };
    });
  };

  const updateQuickSubAmount = (subId, idx, val) => {
    setCardDataMap((prev) => {
      const card = prev[subId];
      if (!card) return prev;
      const subAmounts = [...(card.quickSubAmounts || [])];
      subAmounts[idx] = parseFloat(val) || 0;
      const newTotal = subAmounts.reduce((s, v) => s + v, 0);
      return {
        ...prev,
        [subId]: {
          ...card,
          quickSubAmounts: subAmounts,
          quickAmount: newTotal > 0 ? String(newTotal) : card.quickAmount,
        },
      };
    });
  };

  const removeQuickSubAmount = (subId, idx) => {
    setCardDataMap((prev) => {
      const card = prev[subId];
      if (!card) return prev;
      const subAmounts = (card.quickSubAmounts || []).filter((_, i) => i !== idx);
      const newTotal = subAmounts.reduce((s, v) => s + v, 0);
      return {
        ...prev,
        [subId]: {
          ...card,
          quickSubAmounts: subAmounts,
          quickAmount: newTotal > 0 ? String(newTotal) : '',
        },
      };
    });
  };

  // Khởi tạo trạng thái form cho tất cả các hóa đơn hiển thị (Đã nạp sẵn bảng giá riêng)
  const initCardDataMap = (subList, custList, prodList, preloadedCustMap = custProductsMap) => {
    setCardDataMap((prev) => {
      const newMap = { ...prev };
      subList.forEach((sub, idx) => {
        const isApproved = sub.status === 'APPROVED';

        // Nếu đã có dữ liệu đang nhập dở của sub này:
        // CHỈ giữ lại card cũ nếu đơn CHƯA DUYỆT (đang gõ dở tay).
        // Nếu đơn ĐÃ DUYỆT (APPROVED), luôn cập nhật lại dữ liệu chuẩn từ server!
        if (newMap[sub.id]) {
          if (!isApproved) {
            const existingCard = newMap[sub.id];
            const existingHasRealItems = existingCard.items && existingCard.items.some((it) => (it.rawName && it.rawName.trim()) || (it.quantity && parseFloat(it.quantity) > 0));
            const serverHasRealItems = sub.items && sub.items.length > 0 && sub.items.some((it) => (it.rawName && it.rawName.trim()) || (it.quantity && parseFloat(it.quantity) > 0));
            if (existingHasRealItems || !serverHasRealItems) {
              const autoFixedCust = resolveCustomerForSub(sub, custList);
              if (autoFixedCust && (!existingCard.customer || existingCard.customer.id !== autoFixedCust.id)) {
                newMap[sub.id] = { ...existingCard, customer: autoFixedCust };
              }
              return;
            }
          }
        }

        // Ngày áp dụng cho đơn nợ:
        // Đối với đơn ĐÃ DUYỆT (APPROVED): Lấy chính xác ngày đã được lưu trong CSDL (sub.date)
        // Đối với đơn chưa duyệt: Ưu tiên ngày đang lọc (filterDate) hoặc hôm nay
        const applyDateStr = (isApproved && sub.date)
          ? formatDateOnly(sub.date)
          : (filterDate || (() => {
            const today = new Date();
            const dNow = String(today.getDate()).padStart(2, '0');
            const mNow = String(today.getMonth() + 1).padStart(2, '0');
            const yNow = today.getFullYear();
            return `${dNow}/${mNow}/${yNow}`;
          })());
        const dateStr = applyDateStr;

        // Khách hàng: Đối với đơn ĐÃ DUYỆT, lấy trực tiếp khách hàng đã lưu, không chạy lại regex AI
        const matchedCust = isApproved
          ? (sub.matchedCustomer || (sub.matchedCustomerId ? custList.find((c) => c.id === sub.matchedCustomerId) : null))
          : resolveCustomerForSub(sub, custList);

        // BẢNG GIÁ ĐÃ NẠP SẴN CỦA KHÁCH HÀNG NÀY (Ưu tiên giá riêng cao nhất)
        const cardProdList = (matchedCust?.id && preloadedCustMap && preloadedCustMap[matchedCust.id]) || prodList;

        if (isApproved) {
          // ─── ĐỐI VỚI HÓA ĐƠN ĐÃ DUYỆT: TẢI NGUYÊN BẢN CHÍNH XÁC NHỮNG GÌ CHỦ BUÔN ĐÃ LƯU ───
          const isReturn = Boolean(
            sub.note && (sub.note.includes('[Trả lại hàng]') || sub.note.includes('[Trả hàng]') || sub.note.includes('Trả lại') || sub.note.includes('Trả hàng') || /trả|tra/i.test(sub.note))
          );
          const cardNote = sub.note || '';

          let rawItems = (sub.items || [])
            .filter((it) => it.rawName || it.quantity || it.price || it.amount)
            .map((it, itemIdx) => {
              let matchedP = cardProdList.find((p) => p.id === it.matchedProductId) || null;
              if (!matchedP && it.rawName) {
                matchedP = cardProdList.find((p) => p.name.toLowerCase().trim() === it.rawName.toLowerCase().trim()) || null;
              }
              if (!matchedP && it.rawName) {
                matchedP = findBestMatchingProduct({ rawName: it.rawName, matchedProductId: it.matchedProductId }, cardProdList);
              }
              const rawName = it.rawName || (matchedP ? matchedP.name : 'Thịt');
              let qtyStr = it.quantity != null ? String(it.quantity).trim() : '';
              let priceStr = it.price != null ? String(Math.round(it.price)) : '';
              let amountStr = it.amount != null ? String(Math.round(it.amount)) : '';

              // ƯU TIÊN GIÁ RIÊNG CỦA KHÁCH HÀNG:
              if (matchedP) {
                const hasCustPrice = matchedP.customPrice !== undefined && matchedP.customPrice !== null && !isNaN(Number(matchedP.customPrice)) && Number(matchedP.customPrice) > 0;
                if (hasCustPrice) {
                  const custPriceNum = Number(matchedP.customPrice);
                  const parsedQty = parseFloat(qtyStr);
                  const isQuickDebt = (it.rawName === 'Tiền hàng' || !it.rawName) && (!parsedQty || parsedQty <= 0);
                  if (!isQuickDebt) {
                    priceStr = String(Math.round(custPriceNum));
                    if (parsedQty > 0) {
                      amountStr = String(Math.round(parsedQty * custPriceNum));
                    }
                  }
                }
              }

              return {
                id: it.id || `saved_${sub.id}_${itemIdx}`,
                rawName,
                selectedProduct: matchedP || (rawName ? { id: '__manual__', name: rawName, unit: 'kg' } : null),
                matchedProductId: matchedP ? matchedP.id : (it.matchedProductId || null),
                quantity: qtyStr,
                price: priceStr,
                amount: amountStr,
              };
            });

          // Nếu là đơn trả hàng mà sub.items chưa có hoặc rỗng, phân tích từ sub.note
          if (isReturn && rawItems.length === 0 && sub.note) {
            let noteClean = sub.note.replace(/\[Trả lại hàng\]|\[Trả hàng nhanh\]|\[Trả hàng\]/gi, '').trim();
            const itemRegex = /(?:(\d+(?:[.,]\d+)?)\s*([a-zA-ZÀ-ỹ]*)\s+)?(.+?)\s*\(\s*([\d.,]+)[\s\u00a0]*[đ₫VNDkK]?\s*\)(?:\s*,\s*|\s*$)/gi;
            let m;
            while ((m = itemRegex.exec(noteClean)) !== null) {
              const qty = parseFloat(m[1]?.replace(',', '.')) || 1;
              const prodName = m[3]?.trim() || '';
              const amt = parseFloat(m[4]?.replace(/[.,]/g, '')) || 0;
              if (prodName && !prodName.toLowerCase().includes('tra hang nhanh')) {
                const matchedP = cardProdList.find((p) => p.name.toLowerCase().trim() === prodName.toLowerCase()) || null;
                const price = qty > 0 ? Math.round(amt / qty) : amt;
                rawItems.push({
                  id: `parsed_${sub.id}_${rawItems.length}`,
                  rawName: prodName,
                  selectedProduct: matchedP || { id: '__manual__', name: prodName, unit: 'kg' },
                  matchedProductId: matchedP ? matchedP.id : null,
                  quantity: String(qty),
                  price: String(price),
                  amount: String(amt),
                });
              }
            }
          }

          if (rawItems.length === 0) {
            rawItems.push({
              id: `temp_${Date.now()}_${sub.id}`,
              rawName: '',
              selectedProduct: null,
              matchedProductId: null,
              quantity: '',
              price: '',
              amount: '',
            });
          }

          const isGenericMeatItem = (it) => {
            const cName = removeDiacritics((it.rawName || '').toLowerCase().trim());
            return !cName || cName.includes('tien hang') || cName.includes('thit le') || cName === 'mon le' || cName === 'tien' || cName.includes('tra hang nhanh');
          };

          const hasExplicitDetailItems = rawItems.some((it) => !isGenericMeatItem(it) && (parseFloat(it.quantity) > 0 || parseFloat(it.amount) > 0));
          const isQuickMode = !hasExplicitDetailItems && (rawItems.length === 0 || rawItems.every(isGenericMeatItem));

          let quickSubAmounts = [];
          let quickAmount = '';
          if (isQuickMode && rawItems.length > 0) {
            if (rawItems.length === 1) {
              quickAmount = rawItems[0].amount || rawItems[0].price || '';
              quickSubAmounts = [];
            } else {
              quickSubAmounts = rawItems.map((it) => parseFloat(it.amount || it.price) || 0).filter((v) => v > 0);
              const totalSum = quickSubAmounts.reduce((sum, v) => sum + v, 0);
              quickAmount = totalSum > 0 ? String(totalSum) : '';
            }
          }

          newMap[sub.id] = {
            customer: matchedCust,
            date: dateStr,
            note: cardNote,
            isReturn,
            orderMode: isQuickMode ? 'quick' : 'detail',
            quickAmount: quickAmount,
            quickSubAmounts,
            items: rawItems,
            isSaving: false,
            isLoadingPrice: false,
          };
          return;
        }

        const isHuongSub = matchedCust && removeDiacritics(matchedCust.name.toLowerCase()).includes('huong');
        const xoProduct = cardProdList.find((p) => removeDiacritics(p.name.toLowerCase().trim()) === 'xo') || null;

        // Danh sách items từ AI
        const rawItems = (sub.items || [])
          .filter((it) => it.rawName || it.quantity || it.price || it.amount)
          .map((it, itemIdx) => {
            let matchedP = cardProdList.find((p) => p.id === it.matchedProductId);
            let rawName = it.rawName;

            // Làm sạch các từ khóa trả hàng nếu vô tình lẫn vào tên món thịt
            let cleanedMeat = '';
            if (rawName) {
              const returnKeywordsRegex = /\b(trả hàng|gửi về|trả về|trả lại|gửi lại|hàng trả|thu hồi|bắn về|quay đầu|đổi trả|hoàn hàng|tra hang|gui ve|tra ve|tra lai|gui lai|hang tra|quay dau|doi tra|hoan hang|tra|trả)\b/gi;
              cleanedMeat = rawName.replace(returnKeywordsRegex, '').replace(/[-–—:()]/g, ' ').replace(/\s+/g, ' ').trim();
              if (cleanedMeat) {
                rawName = cleanedMeat;
              }
            }

            // Quy tắc đặc thù: chị tuyết gửi về, trả về... mà không có tên thịt thì sẽ là thịt chín
            const isCustTuyet = matchedCust && (
              matchedCust.id === '585fa225-f5e2-407d-89ea-c0afecc8263b' ||
              removeDiacritics(matchedCust.name.toLowerCase()).includes('tuyet')
            );
            const isReturnItem = Boolean(
              (sub.note && /(trả|gửi về|trả về|trả lại|gửi lại|hàng trả)/i.test(sub.note)) ||
              (sub.rawAiResponse && (sub.rawAiResponse.includes('"is_return": true') || sub.rawAiResponse.includes('"is_return":true') || /(trả|gửi về|trả về|trả lại|gửi lại)/i.test(sub.rawAiResponse))) ||
              (it.rawName && /(trả|gửi về|trả về|trả lại|gửi lại|hàng trả)/i.test(it.rawName))
            );

            if (isCustTuyet && isReturnItem) {
              const cleanCheck = removeDiacritics((rawName || '').toLowerCase().trim());
              if (!cleanedMeat || !cleanCheck || ['thit', 'thit bo', 'mon le', 'thit le', 'thit thai', ''].includes(cleanCheck)) {
                rawName = 'Thịt chín';
              }
            }

            let priceStr = it.price != null ? String(Math.round(it.price)) : '';
            let amountStr = it.amount != null ? String(Math.round(it.amount)) : '';

            // Nếu video khách Hương: quy tắc đặc thù thịt xô 230k
            if (sub.fileType === 'VIDEO' && isHuongSub) {
              const cleanRaw = removeDiacritics((rawName || '').toLowerCase().trim());
              if (!cleanRaw || ['thit', 'thit le', 'thit bo', 'mon le', 'xo', 'thit xo'].includes(cleanRaw) || cleanRaw.includes('xo')) {
                rawName = 'xô';
                if (xoProduct) matchedP = xoProduct;
                if (!priceStr) priceStr = '230000';
                if (!amountStr && it.quantity) {
                  amountStr = String(Math.round(parseFloat(it.quantity) * 230000));
                }
              }
            }

            const cleanRawMeat = removeDiacritics((rawName || '').toLowerCase().trim());

            // Quy tắc: Nếu đọc là bê hoặc ở hóa đơn chỉ viết là bê -> Bê ba chỉ
            if (cleanRawMeat === 'be' || cleanRawMeat === 'thit be' || cleanRawMeat === 'bc' || cleanRawMeat === 'b.' || cleanRawMeat === 'be ba chi') {
              rawName = 'Bê ba chỉ';
            } else if (cleanRawMeat === 'chi' || cleanRawMeat === 'chin' || cleanRawMeat === 'thit chi' || cleanRawMeat === 'thit chin') {
              // Quy tắc: chí, chín -> Thịt chín
              rawName = 'Thịt chín';
            } else if (cleanRawMeat === 'bang' || cleanRawMeat === 'qua bang' || cleanRawMeat === 'thit bang' || cleanRawMeat === 'bong' || cleanRawMeat === 'bọng') {
              // Quy tắc: bằng, bọng (AI đọc nhầm từ bằng) -> Quả bằng
              rawName = 'quả bằng';
            } else if (cleanRawMeat === 'trang bo' || cleanRawMeat === 'tràng bò' || cleanRawMeat === 'trangbo' || cleanRawMeat === 'thit trang bo' || cleanRawMeat === 'thịt tràng bò' || cleanRawMeat === 'long trang' || cleanRawMeat === 'lòng tràng') {
              // Quy tắc: tràng bò -> Tràng bò (TUYỆT ĐỐI KHÔNG NHẦM VỚI QUẢ TRẮNG)
              rawName = 'Tràng bò';
            } else if (cleanRawMeat === 'trang' || cleanRawMeat === 'qua trang' || cleanRawMeat === 'thit trang' || cleanRawMeat === 'trắng' || cleanRawMeat === 'quả trắng') {
              // Quy tắc: quả trắng -> Quả trắng
              rawName = 'quả trắng';
            } else if (cleanRawMeat === 'quat' || cleanRawMeat === 'thit quat' || cleanRawMeat === 'xuong quat') {
              // Quy tắc: quạt -> Quạt
              rawName = 'quạt';
            } else if (cleanRawMeat === 'suon vai' || cleanRawMeat === 'suon vay' || cleanRawMeat === 'sườn vai' || cleanRawMeat === 'sườn vay') {
              // Quy tắc: sườn vai -> Sườn bò / Sườn
              rawName = 'Sườn';
            } else if (cleanRawMeat === 'than' || cleanRawMeat === 'than bo' || cleanRawMeat === 'thit than') {
              // Quy tắc: thăn -> Thăn
              rawName = 'Thăn';
            } else if (cleanRawMeat === 'xg' || cleanRawMeat === 'x' || cleanRawMeat === 'xg bo' || cleanRawMeat === 'xuong' || cleanRawMeat === 'xuong bo') {
              // Quy tắc: xg, x -> Xg Bò
              rawName = 'Xg Bò';
            } else if (cleanRawMeat === 'nam' || cleanRawMeat === 'lam') {
              // Quy tắc: nạm, lạm -> Nam
              rawName = 'Nam';
            } else if (cleanRawMeat === 'gau' || cleanRawMeat === 'gau bo') {
              // Quy tắc: gầu -> Gầu Bò
              rawName = 'Gầu Bò';
            } else if (cleanRawMeat === 'tai' || cleanRawMeat === 'tái' || cleanRawMeat === 'thit tai' || cleanRawMeat === 'thịt tái' || cleanRawMeat === 'bo tai' || cleanRawMeat === 'bò tái') {
              // Quy tắc: tái -> Tái
              rawName = 'Tái';
            } else if (cleanRawMeat === 'la' || cleanRawMeat === 'lá' || cleanRawMeat === 'la vai' || cleanRawMeat === 'lá vai' || cleanRawMeat === 'thit la' || cleanRawMeat === 'thịt lá' || cleanRawMeat === 'thit la vai' || cleanRawMeat === 'thịt la vai' || cleanRawMeat === 'thịt lá vai' || cleanRawMeat === 'la bo' || cleanRawMeat === 'lá bò' || cleanRawMeat === 'la xach' || cleanRawMeat === 'lá xách' || cleanRawMeat === 'sach' || cleanRawMeat === 'sách') {
              // Quy tắc: lá, la -> thịt la vai
              rawName = 'thịt la vai';
            } else if (cleanRawMeat === 'suon' || cleanRawMeat === 'sườn' || cleanRawMeat === 'suon bo' || cleanRawMeat === 'sườn bò') {
              // Quy tắc: sườn -> Sườn
              rawName = 'Sườn';
            } else if (cleanRawMeat === 'bap' || cleanRawMeat === 'bắp' || cleanRawMeat === 'bap bo' || cleanRawMeat === 'bắp bò') {
              // Quy tắc: bắp -> Bắp Bò
              rawName = 'Bắp Bò';
            } else if (cleanRawMeat === 'bo xay' || cleanRawMeat === 'bò xay' || cleanRawMeat === 'thit bo xay' || cleanRawMeat === 'thịt bò xay' || cleanRawMeat === 'vai xay' || cleanRawMeat === 'thit vai xay' || cleanRawMeat === 'thịt vai xay' || cleanRawMeat === 'xay') {
              // Quy tắc: bò xay -> Vai xay
              rawName = 'Vai xay';
            }

            // Chuẩn hóa số kg nếu rơi vào trường hợp đọc 3 hoặc 4 chữ số liên tiếp trên cân điện tử (1 9 5 -> 1.95, 1 6 9 2 -> 16.92) - CHỈ ÁP DỤNG CHO VIDEO CHƯA DUYỆT
            let rawQty = it.quantity != null ? String(it.quantity).trim() : '';
            if (sub.status !== 'APPROVED') {
              if (rawQty && sub.fileType === 'VIDEO') {
                const cleanDigits = rawQty.replace(/\s+/g, '').replace(',', '.');
                if (/^\d+$/.test(cleanDigits)) {
                  if (cleanDigits.length === 3) {
                    rawQty = `${cleanDigits.slice(0, 1)}.${cleanDigits.slice(1)}`;
                  } else if (cleanDigits.length === 4) {
                    rawQty = `${cleanDigits.slice(0, 2)}.${cleanDigits.slice(2)}`;
                  }
                }
              } else if (rawQty && sub.fileType !== 'VIDEO') {
                // Trên hóa đơn ảnh: Các con số nguyên hàng trăm (>= 100) không có dấu phẩy là TIỀN (ĐƠN NỢ NHANH), không phải số cân
                const cleanDigits = rawQty.replace(/\s+/g, '').replace(',', '.');
                const numVal = parseFloat(cleanDigits);
                if (!isNaN(numVal) && numVal >= 100) {
                  if (!amountStr || parseFloat(amountStr) === 0) {
                    const amtVal = numVal < 10000 ? numVal * 1000 : numVal;
                    amountStr = String(Math.round(amtVal));
                    priceStr = amountStr;
                  }
                  rawQty = '';
                }
              }

              // Chuẩn hóa amountStr/priceStr nếu ghi dưới 10000 (đơn vị nghìn đồng)
              if (sub.fileType !== 'VIDEO') {
                const numAmt = parseFloat(amountStr);
                if (!isNaN(numAmt) && numAmt > 0 && numAmt < 10000) {
                  amountStr = String(Math.round(numAmt * 1000));
                }
                const numPrice = parseFloat(priceStr);
                if (!isNaN(numPrice) && numPrice > 0 && numPrice < 10000) {
                  priceStr = String(Math.round(numPrice * 1000));
                }
              }

              // Nếu số kg được chuẩn hóa lại và có đơn giá, tự động sửa lại thành tiền hợp lý (chỉ khi chưa có số tiền chốt)
              const parsedQty = parseFloat(rawQty);
              const parsedPrice = parseFloat(priceStr);
              if (parsedQty > 0 && parsedPrice > 0 && (!amountStr || parseFloat(amountStr) === 0)) {
                amountStr = String(Math.round(parsedQty * parsedPrice));
              }
            }

            // Tự động tìm kiếm sản phẩm phù hợp nhất trong danh mục món thịt của khách
            if (!matchedP) {
              matchedP = findBestMatchingProduct({ rawName, matchedProductId: it.matchedProductId }, cardProdList);
            }

            // BẮT BUỘC ƯU TIÊN ÁP GIÁ RIÊNG CỦA KHÁCH HÀNG
            if (matchedP) {
              const hasCustPrice = matchedP.customPrice !== undefined && matchedP.customPrice !== null && !isNaN(Number(matchedP.customPrice)) && Number(matchedP.customPrice) > 0;
              if (hasCustPrice) {
                const custPriceNum = Number(matchedP.customPrice);
                const parsedQty = parseFloat(rawQty);
                // Nếu không phải đơn nợ nhanh (có số kg hoặc chưa có amount), cập nhật giá theo giá riêng
                const isQuickDebt = (!parsedQty || parsedQty <= 0) && amountStr && parseFloat(amountStr) > 0;
                if (!isQuickDebt) {
                  priceStr = String(Math.round(custPriceNum));
                  if (parsedQty > 0) {
                    amountStr = String(Math.round(parsedQty * custPriceNum));
                  }
                }
              }
            }

            return {
              id: it.id || `temp_${sub.id}_${itemIdx}`,
              rawName: rawName,
              selectedProduct: matchedP || (rawName ? { id: '__manual__', name: rawName, unit: 'kg' } : null),
              matchedProductId: matchedP ? matchedP.id : (it.matchedProductId || null),
              quantity: rawQty,
              price: priceStr,
              amount: amountStr,
            };
          });

        // Luôn luôn có sẵn ít nhất 1 dòng để chủ buôn nhập
        if (rawItems.length === 0) {
          const isVideoHuong = sub.fileType === 'VIDEO' && isHuongSub;
          rawItems.push({
            id: `temp_${Date.now()}_${sub.id}`,
            rawName: isVideoHuong ? 'xô' : '',
            selectedProduct: isVideoHuong && xoProduct ? xoProduct : null,
            matchedProductId: isVideoHuong && xoProduct ? xoProduct.id : null,
            quantity: '',
            price: isVideoHuong ? '230000' : '',
            amount: '',
          });
        }

        const returnRegex = /(trả hàng|gửi về|trả về|trả lại|gửi lại|hàng trả|thu hồi|bắn về|quay đầu|đổi trả|hoàn hàng|tra hang|gui ve|tra ve|tra lai|gui lai|hang tra|quay dau|doi tra|hoan hang)/i;
        const isReturn = Boolean(
          (sub.note && (sub.note.includes('[Trả lại hàng]') || sub.note.includes('[Trả hàng]') || returnRegex.test(sub.note))) ||
          (sub.rawAiResponse && (sub.rawAiResponse.includes('"is_return": true') || sub.rawAiResponse.includes('"is_return":true') || returnRegex.test(sub.rawAiResponse))) ||
          (sub.detectedCustomerName && returnRegex.test(sub.detectedCustomerName)) ||
          rawItems.some((it) => returnRegex.test(it.rawName || '')) ||
          ((sub.items || []).some((it) => returnRegex.test(it.rawName || '')))
        );

        let cardNote = '';
        if (sub.note !== null && sub.note !== undefined && sub.note !== '') {
          cardNote = sub.note;
        } else if (sub.status !== 'APPROVED' && isReturn) {
          cardNote = buildReturnNoteFromItems(rawItems) || '';
        }

        // Tự động nhận diện chế độ Nhập Nhanh:
        // 1) AI trả về is_quick_debt: true hoặc có danh sách sub_amounts
        // 2) Toàn bộ các dòng món thịt là 'Thịt lẻ', 'Tiền hàng', hoặc tên rỗng VÀ không có số kg hợp lệ (> 0)
        let parsedAiData = null;
        try {
          if (sub.rawAiResponse) {
            parsedAiData = JSON.parse(sub.rawAiResponse);
          }
        } catch { }

        const isQuickDebtFromAi = Boolean(
          parsedAiData?.is_quick_debt === true ||
          (Array.isArray(parsedAiData?.sub_amounts) && parsedAiData.sub_amounts.length > 0)
        );

        const isGenericMeatItem = (it) => {
          const cName = removeDiacritics((it.rawName || '').toLowerCase().trim());
          const isTienHang = cName.includes('tien hang') || cName.includes('thit le') || cName === 'mon le' || cName === 'tien';
          const isBlank = !cName;
          const qty = parseFloat(it.quantity);
          return isTienHang || (isBlank && (!qty || qty <= 0));
        };

        const isQuickFromItems = rawItems.length > 0 && rawItems.every(isGenericMeatItem);
        const isQuickMode = isQuickDebtFromAi || isQuickFromItems;

        let quickSubAmounts = [];
        let quickAmount = '';
        if (Array.isArray(parsedAiData?.sub_amounts) && parsedAiData.sub_amounts.length > 0) {
          quickSubAmounts = parsedAiData.sub_amounts.map((v) => Number(v) || 0).filter((v) => v > 0);
          const totalSum = quickSubAmounts.reduce((sum, v) => sum + v, 0);
          quickAmount = totalSum > 0 ? String(totalSum) : '';
        } else if (rawItems.length > 1 && isQuickMode) {
          quickSubAmounts = rawItems
            .map((it) => parseFloat(it.amount) || parseFloat(it.price) || 0)
            .filter((v) => v > 0);
          const totalSum = quickSubAmounts.reduce((sum, v) => sum + v, 0);
          quickAmount = totalSum > 0 ? String(totalSum) : '';
        } else if (rawItems.length === 1 && isQuickMode) {
          quickAmount = String(parseFloat(rawItems[0].amount || rawItems[0].price || 0) || '');
          quickSubAmounts = [];
        } else {
          const totalSum = rawItems.reduce((sum, it) => sum + (parseFloat(it.amount) || 0), 0);
          quickAmount = totalSum > 0 ? String(totalSum) : '';
        }

        newMap[sub.id] = {
          customer: matchedCust,
          date: dateStr,
          note: cardNote,
          isReturn,
          orderMode: isQuickMode ? 'quick' : 'detail',
          quickAmount: quickAmount,
          quickSubAmounts,
          items: rawItems,
          isSaving: false,
          isLoadingPrice: false,
        };
      });
      return newMap;
    });
  };

  // Cập nhật thông tin trên 1 thẻ hóa đơn
  const updateCardField = (subId, field, value) => {
    if (field === 'customer') {
      handleCustomerChange(subId, value);
      return;
    }

    setCardDataMap((prev) => {
      const card = prev[subId] || {};
      const nextCard = { ...card, [field]: value };

      return {
        ...prev,
        [subId]: nextCard,
      };
    });
  };


  // Chuyển đổi loại đơn giữa Đơn xuất nợ và Đơn trả hàng (trừ nợ)
  const toggleCardReturnType = (subId) => {
    setCardDataMap((prev) => {
      const card = prev[subId];
      if (!card) return prev;
      const nextIsReturn = !card.isReturn;
      let nextNote = (card.note || '').trim();
      let nextItems = card.items;

      // Nếu chuyển sang ĐƠN TRẢ và khách là Chị Tuyết: tự động đổi món không tên thịt thành Thịt chín
      const isTuyetToggle = card.customer && (
        card.customer.id === '585fa225-f5e2-407d-89ea-c0afecc8263b' ||
        removeDiacritics(card.customer.name.toLowerCase()).includes('tuyet')
      );
      if (nextIsReturn && isTuyetToggle && Array.isArray(card.items)) {
        const custProds = (card.customer.id && custProductsMap[card.customer.id]) || products;
        const chinProduct = custProds.find((p) => {
          const pClean = removeDiacritics(p.name.toLowerCase().trim());
          return pClean.includes('chin') || pClean.includes('thit chin');
        }) || null;

        nextItems = card.items.map((it) => {
          const cleanRaw = removeDiacritics((it.rawName || '').toLowerCase().trim());
          const returnKeywordsRegex = /\b(trả hàng|gửi về|trả về|trả lại|gửi lại|hàng trả|thu hồi|bắn về|quay đầu|đổi trả|hoàn hàng|tra hang|gui ve|tra ve|tra lai|gui lai|hang tra|quay dau|doi tra|hoan hang|tra|trả)\b/gi;
          const pureClean = cleanRaw.replace(returnKeywordsRegex, '').trim();

          if (!pureClean || ['thit', 'thit bo', 'mon le', 'thit le', 'thit thai', ''].includes(pureClean)) {
            const qty = parseFloat(it.quantity) || 0;
            const hasChinPrice = chinProduct && chinProduct.customPrice != null && Number(chinProduct.customPrice) > 0;
            const chinPrice = hasChinPrice
              ? Number(chinProduct.customPrice)
              : (chinProduct?.defaultPrice != null ? Number(chinProduct.defaultPrice) : null);
            const priceStr = chinPrice ? String(Math.round(chinPrice)) : it.price;
            const amountStr = (qty > 0 && chinPrice) ? String(Math.round(qty * chinPrice)) : it.amount;

            return {
              ...it,
              rawName: 'Thịt chín',
              selectedProduct: chinProduct || it.selectedProduct,
              matchedProductId: chinProduct?.id || it.matchedProductId,
              price: priceStr,
              amount: amountStr,
            };
          }
          return it;
        });
      }

      if (nextIsReturn) {
        // Tự động tạo ghi chú từ danh sách items nếu có
        const autoNote = buildReturnNoteFromItems(nextItems);
        nextNote = autoNote || nextNote || '';
      } else {
        // Xóa ghi chú tự động khi chuyển về đơn xuất
        nextNote = '';
      }
      return {
        ...prev,
        [subId]: {
          ...card,
          isReturn: nextIsReturn,
          note: nextNote,
          items: nextItems,
        },
      };
    });
  };

  // Cập nhật 1 dòng món thịt trong 1 thẻ hóa đơn
  const updateCardItem = (subId, itemIdx, field, value) => {
    setCardDataMap((prev) => {
      const card = prev[subId];
      if (!card) return prev;
      const nextItems = [...card.items];
      const normalizedValue = field === 'quantity' && typeof value === 'string'
        ? value.replace(',', '.')
        : value;
      const item = { ...nextItems[itemIdx], [field]: normalizedValue };

      const cleanQtyStr = String(item.quantity || '').trim().replace(',', '.');
      const qty = parseFloat(cleanQtyStr) || 0;
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

      nextItems[itemIdx] = item;
      return {
        ...prev,
        [subId]: {
          ...card,
          items: nextItems,
        },
      };
    });
  };

  // Thêm dòng món thịt vào 1 thẻ
  const addCardItem = (subId) => {
    setCardDataMap((prev) => {
      const card = prev[subId];
      if (!card) return prev;
      return {
        ...prev,
        [subId]: {
          ...card,
          items: [
            ...card.items,
            {
              id: `temp_${Date.now()}_${Math.random()}`,
              rawName: '',
              selectedProduct: null,
              matchedProductId: null,
              quantity: '',
              price: '',
              amount: '',
            },
          ],
        },
      };
    });
  };

  // Xóa 1 dòng món thịt khỏi 1 thẻ (luôn giữ lại 1 dòng)
  const removeCardItem = (subId, itemIdx) => {
    setCardDataMap((prev) => {
      const card = prev[subId];
      if (!card) return prev;
      const nextItems = card.items.filter((_, idx) => idx !== itemIdx);
      if (nextItems.length === 0) {
        nextItems.push({
          id: `temp_${Date.now()}`,
          rawName: '',
          selectedProduct: null,
          matchedProductId: null,
          quantity: '',
          price: '',
          amount: '',
        });
      }
      return {
        ...prev,
        [subId]: {
          ...card,
          items: nextItems,
        },
      };
    });
  };

  // Tính tổng tiền của 1 thẻ
  const getCardTotal = (subId) => {
    const card = cardDataMap[subId];
    if (!card || !card.items) return 0;
    return card.items.reduce((sum, it) => sum + (parseFloat(it.amount) || 0), 0);
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

  const handleCloseModal = () => {
    setVisible(false);
    setCardDataMap({});
    setSearchQuery('');
  };

  useImperativeHandle(ref, () => ({
    open: async (initialStatus) => {
      isOpenActionRef.current = true;
      setVisible(true);
      setFilterStatus(initialStatus || 'ALL');
      setCardDataMap({});
      setSearchQuery('');
      try {
        const { custList, prodList } = await fetchMasterData();
        await fetchSubmissions(custList, prodList);
      } finally {
        isOpenActionRef.current = false;
      }
    },
    close: handleCloseModal,
  }));

  useEffect(() => {
    if (visible && !isOpenActionRef.current) {
      fetchSubmissions();
    }
  }, [filterStatus, filterDate]);

  // Cuộn nhanh đến 1 hóa đơn khi bấm tab thumbnail
  const scrollToCard = (subId) => {
    const node = cardLayoutRefs.current[subId];
    if (node && scrollViewRef.current) {
      node.measureLayout(
        scrollViewRef.current,
        (x, y) => {
          scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 20), animated: true });
        },
        () => { }
      );
    }
  };

  // Lưu nợ cho 1 hóa đơn riêng lẻ
  const handleSaveCard = async (subId) => {
    const card = cardDataMap[subId];
    if (!card) return false;
    if (!card.customer) {
      showGlobalToast('Vui lòng chọn khách hàng để ghi nợ.', 'warning');
      return false;
    }
    let payloadItems = [];
    if (card.orderMode === 'quick') {
      const quickAmtNum = parseFloat(card.quickAmount) || 0;
      if (quickAmtNum <= 0) {
        showGlobalToast(card.isReturn ? 'Vui lòng nhập số tiền trả hàng lớn hơn 0đ.' : 'Vui lòng nhập số tiền nợ lớn hơn 0đ.', 'warning');
        return false;
      }
      payloadItems = [
        {
          matchedProductId: null,
          rawName: card.isReturn ? 'Trả hàng nhanh' : 'Tiền hàng',
          quantity: 1,
          price: quickAmtNum,
          amount: quickAmtNum,
        },
      ];
    } else {
      const validItems = (card.items || []).filter(
        (it) => (it.selectedProduct?.name || it.rawName) && (parseFloat(it.amount || 0) > 0 || ((parseFloat(it.quantity) || 0) > 0 && (parseFloat(it.price) || 0) > 0))
      );
      if (validItems.length === 0) {
        showGlobalToast('Vui lòng nhập ít nhất một mặt hàng thịt có thành tiền.', 'warning');
        return false;
      }
      payloadItems = validItems.map((it) => {
        const qty = parseFloat(it.quantity) || 0;
        const price = parseFloat(it.price) || 0;
        const amount = parseFloat(it.amount) || Math.round(qty * price);
        return {
          matchedProductId: it.selectedProduct?.id !== '__manual__' ? it.selectedProduct?.id : it.matchedProductId,
          rawName: it.selectedProduct?.name || it.rawName || (card.isReturn ? 'Thịt trả lại' : 'Thịt'),
          quantity: qty,
          price: price,
          amount: amount,
        };
      });
    }

    try {
      updateCardField(subId, 'isSaving', true);
      const [d, m, y] = card.date.split('/');
      const isoDate = `${y}-${m}-${d}`;

      let finalNote = (card.note || '').trim();
      if (card.isReturn) {
        if (card.orderMode === 'quick') {
          let cleanNote = finalNote
            .replace(/\[Trả lại hàng\]|\[Trả hàng nhanh\]|\[Trả hàng\]/gi, '')
            .replace(/^Trả hàng nhanh\s*[:-]?\s*/gi, '')
            .trim();
          finalNote = cleanNote ? `[Trả lại hàng] Trả hàng nhanh - ${cleanNote}` : `[Trả lại hàng] Trả hàng nhanh`;
        } else {
          const itemsDesc = buildReturnNoteFromItems(payloadItems);
          let cleanNote = finalNote
            .replace(/\[Trả lại hàng\]|\[Trả hàng nhanh\]|\[Trả hàng\]/gi, '')
            .replace(/^Trả hàng nhanh\s*[:-]?\s*/gi, '')
            .trim();
          if (cleanNote.includes('(') && cleanNote.includes(')')) {
            const lastParen = cleanNote.lastIndexOf(')');
            cleanNote = cleanNote.substring(lastParen + 1).replace(/^-+\s*/, '').trim();
          }
          finalNote = cleanNote ? `[Trả lại hàng] ${itemsDesc} - ${cleanNote}` : `[Trả lại hàng] ${itemsDesc}`;
        }
      } else {
        if (card.orderMode === 'quick' && card.quickSubAmounts && card.quickSubAmounts.length > 1) {
          const breakdownStr = card.quickSubAmounts.map((amt) => `${Math.round(amt / 1000)}k`).join(' + ');
          if (!finalNote) {
            finalNote = `Tiền hàng (${breakdownStr})`;
          } else if (!finalNote.includes(breakdownStr)) {
            finalNote = `${finalNote} (${breakdownStr})`;
          }
        }
      }

      const payload = {
        customerId: card.customer.id,
        date: isoDate,
        note: finalNote,
        isReturn: Boolean(card.isReturn),
        orderMode: card.orderMode,
        items: payloadItems,
      };

      const res = await api.post(`/staff-submissions/${subId}/approve`, payload);
      if (res.data.success) {
        if (card.isReturn) {
          showGlobalToast(`🎉 Đã trừ nợ trả hàng cho ${card.customer.name} thành công!`, 'success');
        } else {
          showGlobalToast(`🎉 Đã nhập nợ cho ${card.customer.name} thành công!`, 'success');
        }
        const updatedSub = res.data?.data?.submission;
        setSubmissions((prev) =>
          prev.map((s) => {
            if (s.id === subId) {
              return updatedSub || {
                ...s,
                status: 'APPROVED',
                note: payload.note,
                date: payload.date,
                matchedCustomerId: card.customer.id,
                matchedCustomer: card.customer,
                items: payload.items,
              };
            }
            return s;
          })
        );
        // Đồng bộ cập nhật ngay lập tức vào cardDataMap
        setCardDataMap((prev) => {
          const currentCard = prev[subId] || card;
          return {
            ...prev,
            [subId]: {
              ...currentCard,
              customer: card.customer,
              date: card.date,
              note: finalNote,
              isReturn: Boolean(card.isReturn),
              orderMode: card.orderMode,
              items: card.items,
              isSaving: false,
            },
          };
        });
        // Cập nhật lại cache bảng giá riêng của khách hàng này ngay lập tức
        if (card.customer?.id) {
          fetchProductsForCustomer(card.customer.id, true);
        }
        if (onRefresh) onRefresh();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Lỗi khi nhập nợ:', err);
      showGlobalToast(err.response?.data?.message || 'Không thể nhập nợ.', 'error');
      return false;
    } finally {
      updateCardField(subId, 'isSaving', false);
    }
  };

  // Bác bỏ / bỏ qua 1 hóa đơn
  const handleRejectCard = (subId, onRejectedSuccess) => {
    popupModalRef.current?.show({
      type: 'confirm',
      title: 'Bỏ qua hóa đơn này?',
      message: 'Hóa đơn này sẽ bị bỏ qua và không lên đơn nợ. Bạn có chắc chắn không?',
      onConfirm: async () => {
        try {
          const res = await api.post(`/staff-submissions/${subId}/reject`);
          if (res.data.success) {
            showGlobalToast('Đã bỏ qua hóa đơn.', 'info');
            setSubmissions((prev) => prev.filter((s) => s.id !== subId));
            if (typeof onRejectedSuccess === 'function') {
              onRejectedSuccess();
            }
          }
        } catch (err) {
          showGlobalToast('Không thể bỏ qua hóa đơn.', 'error');
        }
      },
    });
  };

  // Trạng thái theo dõi các thẻ đang được kích hoạt quét lại AI
  const [reparsingMap, setReparsingMap] = useState({});

  // Chủ buôn kích hoạt AI quét lại một hóa đơn / video
  const handleReparseCard = async (subId) => {
    try {
      setReparsingMap((prev) => ({ ...prev, [subId]: true }));
      showGlobalToast('Đang gửi yêu cầu AI quét lại...', 'info');

      const res = await api.post(`/staff-submissions/${subId}/reparse`);
      if (res.data?.success) {
        showGlobalToast('AI đang bắt đầu quét lại, kết quả sẽ tự cập nhật!', 'success');
        // Đánh dấu thẻ sang trạng thái ANALYZING trên giao diện
        setSubmissions((prev) =>
          prev.map((s) => (s.id === subId ? { ...s, status: 'ANALYZING', aiError: null } : s))
        );

        // Polling kiểm tra kết quả sau 2.5s, 5s, 7.5s, 10s, 12.5s
        let attempts = 0;
        const intervalId = setInterval(async () => {
          attempts += 1;
          try {
            const checkRes = await api.get(`/staff-submissions/${subId}`);
            if (checkRes.data?.success) {
              const latestSub = checkRes.data.data;
              if (latestSub.status !== 'ANALYZING' && latestSub.status !== 'PENDING') {
                clearInterval(intervalId);
                setReparsingMap((prev) => ({ ...prev, [subId]: false }));
                fetchSubmissions();
                showGlobalToast('🎉 AI đã hoàn tất quét lại hóa đơn!', 'success');
              }
            }
          } catch { }

          if (attempts >= 6) {
            clearInterval(intervalId);
            setReparsingMap((prev) => ({ ...prev, [subId]: false }));
            fetchSubmissions();
          }
        }, 2500);
      }
    } catch (err) {
      console.error('Lỗi khi kích hoạt AI quét lại:', err);
      showGlobalToast(err.response?.data?.message || 'Không thể quét lại AI lúc này.', 'error');
      setReparsingMap((prev) => ({ ...prev, [subId]: false }));
    }
  };

  // Lọc danh sách hóa đơn theo từ khóa tìm kiếm (tên khách, SĐT, người gửi, món thịt, tiền, note)
  const filteredSubmissions = useMemo(() => {
    if (!searchQuery || !searchQuery.trim()) {
      return submissions;
    }
    const qClean = removeDiacritics(searchQuery.trim().toLowerCase());
    const qDigits = searchQuery.replace(/\D/g, '');

    return submissions.filter((sub) => {
      const card = cardDataMap[sub.id];

      // 1. Tên khách hàng (đã chọn trong thẻ, hoặc tên lưu DB, hoặc AI nhận diện)
      const custName = removeDiacritics((card?.customer?.name || sub.matchedCustomer?.name || sub.detectedCustomerName || '').toLowerCase());
      if (custName.includes(qClean)) return true;

      // 2. Số điện thoại khách hàng
      const custPhone = (card?.customer?.phone || sub.matchedCustomer?.phone || '').toLowerCase();
      if (custPhone && custPhone.includes(qClean)) return true;

      // 3. Tên nhân viên / người gửi / link nộp
      const senderName = removeDiacritics((sub.senderName || sub.link?.name || '').toLowerCase());
      if (senderName.includes(qClean)) return true;

      // 4. Ghi chú hóa đơn
      const noteStr = removeDiacritics((card?.note || sub.note || '').toLowerCase());
      if (noteStr.includes(qClean)) return true;

      // 5. Tên các món thịt trong đơn
      const itemsList = (card?.items && card.items.length > 0) ? card.items : (sub.items || []);
      const matchItem = itemsList.some((it) => {
        const iName = removeDiacritics((it.selectedProduct?.name || it.rawName || '').toLowerCase());
        return iName.includes(qClean);
      });
      if (matchItem) return true;

      // 6. Số tiền nợ hoặc đơn giá
      if (qDigits && qDigits.length >= 2) {
        if (card?.quickAmount && String(card.quickAmount).includes(qDigits)) return true;
        const matchAmount = itemsList.some((it) => String(Math.round(it.amount || 0)).includes(qDigits) || String(Math.round(it.price || 0)).includes(qDigits));
        if (matchAmount) return true;
      }

      // 7. Tìm theo loại đơn (trả hàng / xuất nợ)
      if (qClean === 'tra' || qClean === 'tra hang' || qClean === 'tra lai') {
        if (card?.isReturn) return true;
      }
      if (qClean === 'xuat' || qClean === 'xuat no' || qClean === 'ban' || qClean === 'no') {
        if (!card?.isReturn) return true;
      }

      return false;
    });
  }, [submissions, cardDataMap, searchQuery]);

  // Đếm số đơn hợp lệ sẵn sàng lưu hàng loạt
  const validBatchCount = useMemo(() => {
    const unapprovedSubs = filteredSubmissions.filter((s) => s.status !== 'APPROVED');
    return unapprovedSubs.filter((s) => {
      const card = cardDataMap[s.id];
      if (!card || !card.customer) return false;
      return card.items.some((it) => parseFloat(it.amount || 0) > 0);
    }).length;
  }, [filteredSubmissions, cardDataMap]);

  // Lưu hàng loạt tất cả các đơn đã điền đầy đủ
  const handleSaveAllValid = async () => {
    const unapprovedSubs = filteredSubmissions.filter((s) => s.status !== 'APPROVED');
    const validSubs = unapprovedSubs.filter((s) => {
      const card = cardDataMap[s.id];
      if (!card || !card.customer) return false;
      return card.items.some((it) => parseFloat(it.amount || 0) > 0);
    });

    if (validSubs.length === 0) {
      showGlobalToast('Chưa có hóa đơn nào đủ điều kiện (cần chọn khách hàng & có thành tiền).', 'warning');
      return;
    }

    popupModalRef.current?.show({
      type: 'confirm',
      title: `Nhập nợ hàng loạt ${validSubs.length} hóa đơn?`,
      message: `Hệ thống sẽ tự động tạo đơn nợ cho ${validSubs.length} hóa đơn đã điền thông tin. Bạn có chắc chắn muốn tiếp tục?`,
      onConfirm: async () => {
        setSubmittingBatch(true);
        let successCount = 0;
        for (const sub of validSubs) {
          try {
            const card = cardDataMap[sub.id];
            const [d, m, y] = card.date.split('/');
            const isoDate = `${y}-${m}-${d}`;
            let payloadItems = [];
            if (card.orderMode === 'quick') {
              const quickAmtNum = parseFloat(card.quickAmount) || 0;
              if (quickAmtNum <= 0) continue;
              payloadItems = [
                {
                  matchedProductId: null,
                  rawName: card.isReturn ? 'Trả hàng nhanh' : 'Tiền hàng',
                  quantity: 1,
                  price: quickAmtNum,
                  amount: quickAmtNum,
                },
              ];
            } else {
              const validItems = (card.items || []).filter(
                (it) => (it.selectedProduct?.name || it.rawName) && (parseFloat(it.amount || 0) > 0 || ((parseFloat(it.quantity) || 0) > 0 && (parseFloat(it.price) || 0) > 0))
              );
              if (validItems.length === 0) continue;
              payloadItems = validItems.map((it) => {
                const qty = parseFloat(it.quantity) || 0;
                const price = parseFloat(it.price) || 0;
                const amount = parseFloat(it.amount) || Math.round(qty * price);
                return {
                  matchedProductId: it.selectedProduct?.id !== '__manual__' ? it.selectedProduct?.id : it.matchedProductId,
                  rawName: it.selectedProduct?.name || it.rawName || (card.isReturn ? 'Thịt trả lại' : 'Thịt'),
                  quantity: qty,
                  price: price,
                  amount: amount,
                };
              });
            }

            let finalNote = (card.note || '').trim();
            if (card.isReturn) {
              if (card.orderMode === 'quick') {
                let cleanNote = finalNote
                  .replace(/\[Trả lại hàng\]|\[Trả hàng nhanh\]|\[Trả hàng\]/gi, '')
                  .replace(/^Trả hàng nhanh\s*[:-]?\s*/gi, '')
                  .trim();
                finalNote = cleanNote ? `[Trả lại hàng] Trả hàng nhanh - ${cleanNote}` : `[Trả lại hàng] Trả hàng nhanh`;
              } else {
                const itemsDesc = buildReturnNoteFromItems(payloadItems);
                let cleanNote = finalNote
                  .replace(/\[Trả lại hàng\]|\[Trả hàng nhanh\]|\[Trả hàng\]/gi, '')
                  .replace(/^Trả hàng nhanh\s*[:-]?\s*/gi, '')
                  .trim();
                if (cleanNote.includes('(') && cleanNote.includes(')')) {
                  const lastParen = cleanNote.lastIndexOf(')');
                  cleanNote = cleanNote.substring(lastParen + 1).replace(/^-+\s*/, '').trim();
                }
                finalNote = cleanNote ? `[Trả lại hàng] ${itemsDesc} - ${cleanNote}` : `[Trả lại hàng] ${itemsDesc}`;
              }
            } else {
              if (card.orderMode === 'quick' && card.quickSubAmounts && card.quickSubAmounts.length > 1) {
                const breakdownStr = card.quickSubAmounts.map((amt) => `${Math.round(amt / 1000)}k`).join(' + ');
                if (!finalNote) {
                  finalNote = `Tiền hàng (${breakdownStr})`;
                } else if (!finalNote.includes(breakdownStr)) {
                  finalNote = `${finalNote} (${breakdownStr})`;
                }
              }
            }

            const payload = {
              customerId: card.customer.id,
              date: isoDate,
              note: finalNote,
              isReturn: Boolean(card.isReturn),
              orderMode: card.orderMode,
              items: payloadItems,
            };

            const res = await api.post(`/staff-submissions/${sub.id}/approve`, payload);
            if (res.data.success) {
              successCount++;
              const updatedSub = res.data?.data?.submission;
              setSubmissions((prev) =>
                prev.map((s) => {
                  if (s.id === sub.id) {
                    return updatedSub || {
                      ...s,
                      status: 'APPROVED',
                      note: payload.note,
                      date: payload.date,
                      matchedCustomerId: card.customer.id,
                      matchedCustomer: card.customer,
                      items: payload.items,
                    };
                  }
                  return s;
                })
              );
            }
          } catch (e) {
            console.error(`Lỗi khi nhập đơn ${sub.id}:`, e);
          }
        }
        setSubmittingBatch(false);
        showGlobalToast(`🎉 Đã nhập nợ thành công ${successCount}/${validSubs.length} hóa đơn!`, 'success');
        const savedCustomerIds = [...new Set(validSubs.map((s) => cardDataMap[s.id]?.customer?.id).filter(Boolean))];
        savedCustomerIds.forEach((cId) => fetchProductsForCustomer(cId, true));
        if (onRefresh) onRefresh();
      },
    });
  };

  // Xóa / Bác bỏ toàn bộ hóa đơn đang hiển thị
  const handleRejectAll = () => {
    if (submissions.length === 0) return;
    popupModalRef.current?.show({
      type: 'confirm',
      title: `Xóa tất cả ${submissions.length} hóa đơn?`,
      message: `Bạn có chắc chắn muốn xóa/bỏ qua toàn bộ ${submissions.length} hóa đơn này không? Thao tác này sẽ dọn sạch danh sách hóa đơn gửi về.`,
      onConfirm: async () => {
        try {
          setSubmittingBatch(true);
          const ids = submissions.map((s) => s.id);
          const res = await api.post('/staff-submissions/batch-reject', { ids });
          if (res.data.success) {
            showGlobalToast(`Đã xóa tất cả ${ids.length} hóa đơn thành công!`, 'info');
            setSubmissions([]);
            setCardDataMap({});
            if (onRefresh) onRefresh();
          }
        } catch (err) {
          console.error('Lỗi khi xóa hàng loạt:', err);
          showGlobalToast(err.response?.data?.message || 'Không thể xóa hóa đơn.', 'error');
        } finally {
          setSubmittingBatch(false);
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
      <SmoothModal visible={visible} onClose={handleCloseModal} centered={false}>
        <View style={[styles.modalView, isMobile && styles.modalViewMobile]}>
          {/* ─── HEADER ─── */}
          <View style={[styles.headerRow, isMobile && styles.headerRowMobile]}>
            <View style={{ flex: 1, minWidth: 0, marginRight: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: isMobile ? 'nowrap' : 'wrap' }}>
                <Text style={[styles.modalTitle, isMobile && styles.modalTitleMobile]} numberOfLines={1}>
                  {isMobile ? '🤖 Phân tích hóa đơn' : '🤖 PHÂN TÍCH HÓA ĐƠN & NHẬP CÔNG NỢ'}
                </Text>
                <View style={[styles.badgePending, isMobile && styles.badgePendingMobile]}>
                  <Text style={[styles.badgePendingText, isMobile && styles.badgePendingTextMobile]}>
                    {submissions.length} {isMobile ? 'đơn' : 'hóa đơn'}
                  </Text>
                </View>
                {validBatchCount > 0 && (
                  <View style={[styles.badgeReadyBatch, isMobile && styles.badgeReadyBatchMobile]}>
                    <Text style={[styles.badgeReadyBatchText, isMobile && styles.badgeReadyBatchTextMobile]}>
                      {validBatchCount} {isMobile ? 'sẵn sàng' : 'đơn sẵn sàng lưu'}
                    </Text>
                  </View>
                )}
              </View>
              {!isMobile && (
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  Xem & nhập công nợ trực tiếp cho nhiều hóa đơn cùng lúc
                </Text>
              )}
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
                  {isMobile ? '🔗 Zalo' : '🔗 Link gửi Zalo'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnClose, isMobile && styles.btnCloseMobile]}
                onPress={handleCloseModal}
              >
                <Text style={[styles.btnCloseText, isMobile && styles.btnCloseTextMobile]}>✕</Text>
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

          {/* ─── THANH BỘ LỌC & NÚT LƯU HÀNG LOẠT ─── */}
          <View style={[styles.filterBar, isMobile && styles.filterBarMobile]}>
            {/* Tabs lọc trạng thái: Cho phép cuộn ngang mượt mà trên Mobile */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.statusTabs, isMobile && styles.statusTabsMobile]}
            >
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
                  Tất cả ({submissions.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.statusTab,
                  isMobile && styles.statusTabMobile,
                  filterStatus === 'UNPROCESSED' && styles.statusTabActive,
                ]}
                onPress={() => setFilterStatus('UNPROCESSED')}
              >
                <Text
                  style={[
                    styles.statusTabText,
                    isMobile && styles.statusTabTextMobile,
                    filterStatus === 'UNPROCESSED' && styles.statusTabTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {isMobile ? '⚡ Chưa nợ' : '⚡ Chưa lên nợ'} ({submissions.filter((s) => s.status !== 'APPROVED').length})
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
                  {isMobile ? '✅ Đã lên' : '✅ Đã lên nợ'} ({submissions.filter((s) => s.status === 'APPROVED').length})
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Ngày lọc & Cụm nút hành động lưu/xóa hàng loạt */}
            <View style={[styles.filterActionsContainer, isMobile && styles.filterActionsContainerMobile]}>
              <View style={[styles.dateFilterWrap, isMobile && styles.dateFilterWrapMobile]}>
                {/* Button xem danh sách TỔNG CÁC ĐƠN PHÂN TÍCH */}
                <TouchableOpacity
                  style={[
                    styles.btnAllSubmissions,
                    !filterDate && styles.btnAllSubmissionsActive,
                    isMobile && styles.btnAllSubmissionsMobile,
                  ]}
                  onPress={() => setFilterDate('')}
                  activeOpacity={0.8}
                  title="Xem toàn bộ danh sách tất cả các đơn phân tích từ trước đến nay"
                >
                  <Text
                    style={[
                      styles.btnAllSubmissionsText,
                      !filterDate && styles.btnAllSubmissionsTextActive,
                      isMobile && { fontSize: 10.5 },
                    ]}
                  >
                    {!filterDate ? (isMobile ? '🌐 TẤT CẢ' : '🌐 TẤT CẢ ĐƠN') : (isMobile ? '🌐 TỔNG' : '🌐 TỔNG CÁC ĐƠN')}
                  </Text>
                </TouchableOpacity>

                {filterDate ? (
                  <View style={styles.datePickerHolder}>
                    <View style={{ width: isMobile ? 112 : 132 }}>
                      <DatePickerInput
                        value={filterDate}
                        onChange={setFilterDate}
                        compact={true}
                        showIcon={true}
                        alignRight={!isMobile}
                      />
                    </View>
                    <TouchableOpacity
                      style={[styles.btnClearFilterDate, isMobile && styles.btnClearFilterDateMobile]}
                      onPress={() => setFilterDate('')}
                      activeOpacity={0.7}
                      title="Xóa lọc ngày (Xem tổng tất cả đơn)"
                    >
                      <Text style={[styles.btnClearFilterDateText, isMobile && { fontSize: 10 }]}>✕</Text>
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
                    <Text style={[styles.btnPickDateAllText, isMobile && { fontSize: 10.5 }]}>
                      📅 {isMobile ? 'Chọn ngày' : 'Lọc theo ngày'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Nhóm nút hành động: Tự động co giãn vừa vặn trên Mobile, không bị tràn mép */}
              <View style={[styles.batchActionsWrap, isMobile && styles.batchActionsWrapMobile]}>
                {validBatchCount > 0 && (
                  <TouchableOpacity
                    style={[
                      styles.btnBatchSaveAll,
                      isMobile && styles.btnBatchSaveAllMobile,
                      submittingBatch && { opacity: 0.6 },
                    ]}
                    onPress={handleSaveAllValid}
                    disabled={submittingBatch}
                    activeOpacity={0.85}
                  >
                    {submittingBatch ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={[styles.btnBatchSaveAllText, isMobile && styles.btnBatchSaveAllTextMobile]}>
                        {isMobile ? `🚀 LƯU (${validBatchCount})` : `🚀 LƯU TẤT CẢ (${validBatchCount} ĐƠN)`}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}

                {submissions.length > 0 && (
                  <TouchableOpacity
                    style={[
                      styles.btnBatchRejectAll,
                      isMobile && styles.btnBatchRejectAllMobile,
                      submittingBatch && { opacity: 0.6 },
                    ]}
                    onPress={handleRejectAll}
                    disabled={submittingBatch}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.btnBatchRejectAllText, isMobile && styles.btnBatchRejectAllTextMobile]}>
                      {isMobile ? '🗑️ Xóa hết' : `🗑️ Xóa tất cả (${submissions.length})`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Banner thông báo khi đang xem TỔNG CÁC ĐƠN PHÂN TÍCH */}
            {!filterDate && (
              <View style={[styles.allSubsNoticeBanner, isMobile && styles.allSubsNoticeBannerMobile]}>
                <Text style={[styles.allSubsNoticeText, isMobile && styles.allSubsNoticeTextMobile]} numberOfLines={1}>
                  🌐 <Text style={{ fontWeight: 'bold' }}>Tất cả đơn</Text> ({submissions.length} đơn)
                </Text>
                <TouchableOpacity
                  style={[styles.btnBackToToday, isMobile && styles.btnBackToTodayMobile]}
                  onPress={() => {
                    const today = new Date();
                    const d = String(today.getDate()).padStart(2, '0');
                    const m = String(today.getMonth() + 1).padStart(2, '0');
                    const y = today.getFullYear();
                    setFilterDate(`${d}/${m}/${y}`);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.btnBackToTodayText, isMobile && { fontSize: 10.5 }]}>📅 Hôm nay</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ─── THANH TÌM KIẾM HÓA ĐƠN & KHÁCH HÀNG ─── */}
          {submissions.length > 0 && (
            <View style={[styles.searchBarContainer, isMobile && styles.searchBarContainerMobile]}>
              <View style={[styles.searchBoxWrap, isMobile && styles.searchBoxWrapMobile]}>
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                  style={[styles.searchInput, isMobile && styles.searchInputMobile]}
                  placeholder={isMobile ? 'Tìm khách, SĐT, người gửi, món thịt...' : 'Tìm kiếm nhanh theo tên khách hàng, SĐT, người gửi, món thịt, số tiền, ghi chú...'}
                  placeholderTextColor="#94A3B8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  returnKeyType="search"
                />
                {searchQuery ? (
                  <TouchableOpacity
                    onPress={() => setSearchQuery('')}
                    style={styles.clearSearchBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.clearSearchText}>✕</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {searchQuery ? (
                <View style={[styles.searchResultBadge, isMobile && styles.searchResultBadgeMobile]}>
                  <Text style={[styles.searchResultBadgeText, isMobile && styles.searchResultBadgeTextMobile]}>
                    {filteredSubmissions.length}/{submissions.length} đơn
                  </Text>
                </View>
              ) : null}
            </View>
          )}

          {/* ─── THANH ĐIỀU HƯỚNG NHANH CÁC HÓA ĐƠN (QUICK JUMP THUMBNAILS) ─── */}
          {filteredSubmissions.length > 1 && (
            <View style={[styles.quickNavStrip, isMobile && styles.quickNavStripMobile]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: isMobile ? 8 : 12, gap: isMobile ? 6 : 8, alignItems: 'center' }}
              >
                <Text style={[styles.quickNavLabel, isMobile && styles.quickNavLabelMobile]}>
                  {isMobile ? '⚡' : 'Chuyển nhanh:'}
                </Text>
                {filteredSubmissions.map((sub, idx) => {
                  const isApproved = sub.status === 'APPROVED';
                  const card = cardDataMap[sub.id];
                  return (
                    <QuickNavPill
                      key={sub.id}
                      sub={sub}
                      idx={idx}
                      isApproved={isApproved}
                      hasCustomer={Boolean(card?.customer)}
                      customerName={card?.customer?.name}
                      onScroll={() => scrollToCard(sub.id)}
                      isMobile={isMobile}
                    />
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* ─── THÂN CUỘN CHÍNH: HIỂN THỊ HÀNG LOẠT THẺ HÓA ĐƠN ĐỐI SOÁT ─── */}
          {loading ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color="#10B981" />
              <Text style={{ color: '#64748B', marginTop: 10 }}>Đang tải danh sách hóa đơn...</Text>
            </View>
          ) : submissions.length === 0 ? (
            <View style={[styles.centerEmpty, isMobile && { padding: 16 }]}>
              <Text style={{ fontSize: isMobile ? 32 : 40, marginBottom: 8 }}>📋</Text>
              <Text style={[styles.emptyTitle, isMobile && { fontSize: 15 }]}>Không có hóa đơn nào</Text>
              <Text style={[styles.emptyDesc, isMobile && { fontSize: 12 }]}>
                Chưa có hóa đơn hoặc video nào được gửi về trong ngày đã chọn.
              </Text>
            </View>
          ) : filteredSubmissions.length === 0 ? (
            <View style={[styles.centerEmpty, isMobile && { padding: 16 }]}>
              <Text style={{ fontSize: isMobile ? 32 : 40, marginBottom: 8 }}>🔍</Text>
              <Text style={[styles.emptyTitle, isMobile && { fontSize: 15 }]}>Không tìm thấy hóa đơn</Text>
              <Text style={[styles.emptyDesc, isMobile && { fontSize: 12 }]}>
                Không có hóa đơn nào phù hợp với từ khóa "{searchQuery}".
              </Text>
              <TouchableOpacity
                style={styles.btnClearSearchFilter}
                onPress={() => setSearchQuery('')}
                activeOpacity={0.8}
              >
                <Text style={styles.btnClearSearchFilterText}>✕ Xóa tìm kiếm ({submissions.length} đơn)</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              ref={scrollViewRef}
              style={styles.cardsScrollArea}
              contentContainerStyle={[
                styles.cardsScrollContent,
                !isMobile && styles.cardsScrollContentPC,
              ]}
              showsVerticalScrollIndicator={true}
            >
              <View style={[styles.cardsGrid, !isMobile && styles.cardsGridPC]}>
                {filteredSubmissions.map((sub, idx) => {
                  const card = cardDataMap[sub.id] || {
                    customer: null,
                    date: '',
                    note: '',
                    items: [],
                    isSaving: false,
                  };
                  const isApproved = sub.status === 'APPROVED';
                  const isDropdownActive = activeDropdownSubId === sub.id;
                  const custProds = (card.customer?.id && custProductsMap[card.customer.id]) || products;

                  return (
                    <InvoiceReviewCard
                      key={sub.id}
                      sub={sub}
                      idx={idx}
                      card={card}
                      cardResponsiveStyle={cardResponsiveStyle}
                      isApproved={isApproved}
                      isDropdownActive={isDropdownActive}
                      isMobile={isMobile}
                      isTablet={isTablet}
                      customers={customers}
                      customerProducts={custProds}
                      cardRef={(el) => {
                        if (el) cardLayoutRefs.current[sub.id] = el;
                      }}
                      isReparsing={Boolean(reparsingMap[sub.id])}
                      onReparse={handleReparseCard}
                      onOpenDetail={(subId) => detailModalRef.current?.open(subId)}
                      onOpenDropdown={(isOpen) => setActiveDropdownSubId(isOpen ? sub.id : null)}
                      onCustomerChange={handleCustomerChange}
                      onUpdateField={updateCardField}
                      onToggleReturnType={toggleCardReturnType}
                      onAddItem={addCardItem}
                      onRemoveItem={removeCardItem}
                      onSelectProduct={selectProductForCardItem}
                      onUpdateItem={updateCardItem}
                      onFetchCustomerProducts={fetchProductsForCustomer}
                      onToggleOrderMode={toggleOrderMode}
                      onUpdateQuickAmount={updateQuickAmount}
                      onAddQuickSubAmount={addQuickSubAmount}
                      onUpdateQuickSubAmount={updateQuickSubAmount}
                      onRemoveQuickSubAmount={removeQuickSubAmount}
                      onSave={handleSaveCard}
                      onReject={handleRejectCard}
                    />
                  );
                })}
              </View>
            </ScrollView>
          )}

          {/* ─── FOOTER MODAL ─── */}
          <View style={[styles.modalFooterBar, isMobile && styles.modalFooterBarMobile]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={[styles.footerSummaryText, isMobile && styles.footerSummaryTextMobile]}>
                Đã lên nợ: <Text style={{ fontWeight: 'bold', color: '#059669' }}>{submissions.filter((s) => s.status === 'APPROVED').length}</Text> / {submissions.length} hóa đơn
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.btnCloseFooter, isMobile && styles.btnCloseFooterMobile]}
              onPress={handleCloseModal}
              activeOpacity={0.8}
            >
              <Text style={[styles.btnCloseFooterText, isMobile && styles.btnCloseFooterTextMobile]}>ĐÓNG LẠI</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SmoothModal>

      {/* Modal phóng to ảnh xem thường */}
      <ImagePreviewModal ref={imagePreviewModalRef} />

      {/* Modal xem to đối chiếu song song Split-View (Ảnh/Video 1 bên, Form 1 bên, nút Next/Prev) */}
      <StaffSubmissionDetailModal
        ref={detailModalRef}
        submissions={submissions}
        cardDataMap={cardDataMap}
        customers={customers}
        products={products}
        custProductsMap={custProductsMap}
        fetchProductsForCustomer={fetchProductsForCustomer}
        handleCustomerChange={handleCustomerChange}
        updateCardField={updateCardField}
        updateCardItem={updateCardItem}
        addCardItem={addCardItem}
        removeCardItem={removeCardItem}
        selectProductForCardItem={selectProductForCardItem}
        toggleCardReturnType={toggleCardReturnType}
        toggleOrderMode={toggleOrderMode}
        updateQuickAmount={updateQuickAmount}
        addQuickSubAmount={addQuickSubAmount}
        updateQuickSubAmount={updateQuickSubAmount}
        removeQuickSubAmount={removeQuickSubAmount}
        handleSaveCard={handleSaveCard}
        handleRejectCard={handleRejectCard}
      />

      {/* Popup Modal xác nhận - zIndex 9999999 để đè lên StaffSubmissionDetailModal (999999) */}
      <PopupModal ref={popupModalRef} zIndex={9999999} />
    </>
  );
});

export default StaffSubmissionReviewModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '95%',
    maxHeight: '95%',
    width: '100%',
    maxWidth: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  modalViewMobile: {
    height: '100%',
    maxHeight: '100%',
    width: '100%',
    maxWidth: '100%',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderRadius: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  headerRowMobile: {
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  modalTitle: {
    fontSize: 16.5,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  modalTitleMobile: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  badgePending: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  badgePendingMobile: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  badgePendingText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: 'bold',
  },
  badgePendingTextMobile: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeReadyBatch: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  badgeReadyBatchMobile: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  badgeReadyBatchText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: 'bold',
  },
  badgeReadyBatchTextMobile: {
    fontSize: 11,
    fontWeight: '700',
  },
  modalSubtitle: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  modalSubtitleMobile: {
    fontSize: 11,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  btnLinkManager: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  btnLinkManagerMobile: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
  },
  btnLinkManagerText: {
    color: '#4F46E5',
    fontSize: 12,
    fontWeight: 'bold',
  },
  btnLinkManagerTextMobile: {
    fontSize: 11,
    fontWeight: '600',
  },
  btnClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnCloseMobile: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  btnCloseText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: 'bold',
  },
  btnCloseTextMobile: {
    fontSize: 13,
  },
  linkManagerBox: {
    backgroundColor: '#F8FAFC',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  linkRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  linkItemName: {
    color: '#0F172A',
    fontSize: 12.5,
    fontWeight: '700',
  },
  linkItemToken: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 1,
  },
  btnCopyLink: {
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  btnCopyLinkText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: 'bold',
  },
  btnCloseLinkBar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnCloseLinkBarText: {
    color: '#64748B',
    fontSize: 11.5,
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
    flexWrap: 'wrap',
    gap: 8,
  },
  filterBarMobile: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  statusTabs: {
    flexDirection: 'row',
    gap: 6,
  },
  statusTabsMobile: {
    gap: 4,
  },
  statusTab: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: '#F1F5F9',
  },
  statusTabMobile: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusTabActive: {
    backgroundColor: '#0F172A',
  },
  statusTabText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  statusTabTextMobile: {
    fontSize: 11,
  },
  statusTabTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  dateFilterWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateFilterWrapMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  datePickerHolder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  btnClearFilterDate: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  btnClearFilterDateMobile: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  btnClearFilterDateText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#64748B',
  },
  btnPickDateAll: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  btnPickDateAllMobile: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
  },
  btnPickDateAllText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
  },
  btnAllSubmissions: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 7,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#6366F1',
    marginRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnAllSubmissionsActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4338CA',
  },
  btnAllSubmissionsMobile: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    marginRight: 3,
  },
  btnAllSubmissionsText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  btnAllSubmissionsTextActive: {
    color: '#FFFFFF',
  },
  allSubsNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    marginTop: 6,
    marginBottom: 4,
    gap: 8,
  },
  allSubsNoticeBannerMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 2,
    marginBottom: 1,
    gap: 4,
  },
  allSubsNoticeText: {
    fontSize: 12,
    color: '#1E40AF',
    flex: 1,
  },
  allSubsNoticeTextMobile: {
    fontSize: 10.5,
  },
  btnBackToToday: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 5,
  },
  btnBackToTodayMobile: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  btnBackToTodayText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  cardDateBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cardDateBadgeText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  filterActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  filterActionsContainerMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 4,
    marginTop: 2,
  },
  batchActionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  batchActionsWrapMobile: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: 4,
  },
  btnBatchSaveAll: {
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 7,
    ...SHADOWS.sm,
  },
  btnBatchSaveAllMobile: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },
  btnBatchSaveAllText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  btnBatchSaveAllTextMobile: {
    fontSize: 10.5,
    fontWeight: 'bold',
  },
  btnBatchRejectAll: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  btnBatchRejectAllMobile: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 5,
  },
  btnBatchRejectAllText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: 'bold',
  },
  btnBatchRejectAllTextMobile: {
    fontSize: 10.5,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  searchBarContainerMobile: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
  },
  searchBoxWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    height: 36,
  },
  searchBoxWrapMobile: {
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  searchIcon: {
    fontSize: 13,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
    outlineStyle: 'none',
    outlineWidth: 0,
  },
  searchInputMobile: {
    fontSize: 12,
  },
  clearSearchBtn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearSearchText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: 'bold',
  },
  searchResultBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  searchResultBadgeMobile: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
  },
  searchResultBadgeText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#0284C7',
  },
  searchResultBadgeTextMobile: {
    fontSize: 10.5,
  },
  btnClearSearchFilter: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  btnClearSearchFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  quickNavStrip: {
    backgroundColor: '#F8FAFC',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  quickNavStripMobile: {
    paddingVertical: 3,
    backgroundColor: '#F8FAFC',
  },
  quickNavLabel: {
    color: '#64748B',
    fontSize: 11.5,
    fontWeight: '600',
    marginRight: 4,
  },
  quickNavLabelMobile: {
    fontSize: 11,
    marginRight: 2,
    fontWeight: '700',
  },
  quickNavPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  quickNavPillMobile: {
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 7,
    gap: 3,
  },
  quickNavPillApproved: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  quickNavPillFilled: {
    borderColor: '#38BDF8',
    backgroundColor: '#F0F9FF',
  },
  quickNavPillText: {
    fontSize: 11.5,
    color: '#334155',
    fontWeight: '600',
  },
  quickNavPillTextMobile: {
    fontSize: 10.5,
  },
  dotFilled: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0284C7',
  },
  cardsScrollArea: {
    flex: 1,
    width: '100%',
    maxWidth: '100%',
  },
  cardsScrollContent: {
    padding: 10,
    paddingBottom: 70,
    width: '100%',
    maxWidth: '100%',
  },
  cardsScrollContentPC: {
    padding: 12,
    paddingBottom: 70,
    width: '100%',
    maxWidth: '100%',
  },
  cardsGrid: {
    width: '100%',
    maxWidth: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  cardsGridPC: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'flex-start',
    width: '100%',
    maxWidth: '100%',
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
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  emptyDesc: {
    color: '#64748B',
    fontSize: 12.5,
    textAlign: 'center',
    maxWidth: 360,
  },

  /* ═══ THẺ HÓA ĐƠN (INVOICE CARD) ═══ */
  invoiceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'column',
    overflow: 'hidden',
    width: '100%',
    ...SHADOWS.sm,
  },
  invoiceCardPC: {
    width: 'calc((100% - 24px) / 3)',
    flexBasis: 'calc((100% - 24px) / 3)',
    flexGrow: 0,
    flexShrink: 0,
    maxWidth: 'calc((100% - 24px) / 3)',
  },
  invoiceCardTablet: {
    width: 'calc((100% - 12px) / 2)',
    flexBasis: 'calc((100% - 12px) / 2)',
    flexGrow: 0,
    flexShrink: 0,
    maxWidth: 'calc((100% - 12px) / 2)',
  },
  invoiceCardMobile: {
    width: '100%',
  },
  invoiceCardApproved: {
    borderColor: '#86EFAC',
    backgroundColor: '#FAFCFA',
  },
  cardMediaCol: {
    width: '100%',
    backgroundColor: '#0F172A',
    borderRightWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
  },
  cardMediaColMobile: {
    padding: 8,
  },
  cardHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardIndexBadge: {
    backgroundColor: '#1E293B',
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: 'bold',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    overflow: 'hidden',
  },
  cardSenderText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 90,
  },
  badgeApprovedPill: {
    backgroundColor: '#064E3B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeApprovedPillText: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: 'bold',
  },
  badgePendingPill: {
    backgroundColor: '#78350F',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgePendingPillText: {
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: 'bold',
  },
  badgeReturnPill: {
    backgroundColor: '#581C87',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeReturnPillText: {
    color: '#D8B4FE',
    fontSize: 10,
    fontWeight: 'bold',
  },
  badgeAnalyzingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284C7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeAnalyzingPillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  cardMediaBox: {
    height: 125,
    backgroundColor: '#020617',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardMediaBoxMobile: {
    height: 120,
  },
  cardVideoWrap: {
    width: '100%',
    height: '100%',
  },
  videoFallbackBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoErrorBox: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  btnRetryVideo: {
    marginTop: 6,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38BDF8',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  cardImageTouch: {
    width: '100%',
    height: '100%',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  zoomOverlayBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  zoomOverlayText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  reparseOverlayBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderWidth: 1,
    borderColor: '#38BDF8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reparseOverlayText: {
    color: '#38BDF8',
    fontSize: 10.5,
    fontWeight: 'bold',
  },
  cardAiErrorBanner: {
    backgroundColor: '#450A0A',
    borderRadius: 6,
    padding: 6,
    marginTop: 6,
  },
  cardAiErrorText: {
    color: '#F87171',
    fontSize: 11,
  },
  cardLoadingPriceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 8,
  },
  cardLoadingPriceText: {
    color: '#0369A1',
    fontSize: 12,
    fontWeight: '600',
  },

  /* Form bên phải của Thẻ */
  cardFormCol: {
    flex: 1,
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
  },
  cardFormBody: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  cardFormColMobile: {
    padding: 8,
  },
  cardFormHeaderRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  cardFormHeaderRowMobile: {
    gap: 6,
    marginBottom: 6,
  },
  mobileDateNoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    width: '100%',
    marginBottom: 8,
  },
  cardFieldLabel: {
    color: '#334155',
    fontSize: 11.5,
    fontWeight: '600',
    marginBottom: 3,
  },
  cardInputNote: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 12,
    color: '#0F172A',
    height: 36,
  },

  /* Bảng món thịt trong Thẻ */
  cardItemsTable: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 8,
    marginBottom: 8,
  },
  cardItemsTableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardItemsTableTitle: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardBtnAddItem: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  cardBtnAddItemText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: 'bold',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 4,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  colHeadText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  desktopItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  mobileItemCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    padding: 6,
    marginBottom: 6,
  },
  mobileItemCardCompact: {
    padding: 6,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  compactInputCell: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontSize: 12,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    height: 34,
  },
  compactInputCellMobile: {
    height: 33,
    paddingHorizontal: 3,
    fontSize: 11.5,
  },
  btnRowDelete: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnRowDeleteMobile: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  btnRowDeleteSingleRow: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardItemColumnsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 2,
    marginBottom: 3,
  },
  cardItemColText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  cardItemRowSingle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  cardItemSelectTrigger: {
    height: 30,
    paddingLeft: 4,
    paddingRight: 2,
    borderRadius: 6,
  },
  cardItemSelectInput: {
    fontSize: 11,
    color: '#0F172A',
    fontWeight: '500',
  },
  cardItemCell: {
    height: 30,
    paddingHorizontal: 2,
    fontSize: 11,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
  },
  cardItemMoneyContainer: {
    height: 30,
    paddingHorizontal: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  cardItemMoneyInput: {
    fontSize: 11,
    color: '#0F172A',
    fontWeight: '500',
    paddingHorizontal: 0,
  },
  cardItemAmountInput: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#059669',
    paddingHorizontal: 0,
  },

  /* Footer của Thẻ */
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  cardFooterRowMobile: {
    flexDirection: 'row',       // Luôn ngang: tổng tiền bên trái, chip Quét AI bên phải
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  cardTotalWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    flexWrap: 'wrap',
  },
  cardTotalLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#475569',
  },
  cardTotalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#059669',
  },
  cardActionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  cardActionsWrapMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 8,
  },
  // 1 hàng ngang chứa toàn bộ nút hành động
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    width: '100%',
  },
  // Nút icon tròn nhỏ Quét AI (chỉ icon, không text)
  btnIconReparse: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56,189,248,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  btnIconReparseText: {
    fontSize: 15,
  },


  // Chip "Quét AI" nhỏ gọn nằm cạnh tổng tiền (hàng trên)
  btnCardReparseChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56,189,248,0.08)',
    minWidth: 70,
    height: 28,
  },
  btnCardReparseChipText: {
    color: '#0EA5E9',
    fontSize: 10.5,
    fontWeight: '700',
  },
  // (legacy — giữ lại để không lỗi nếu còn ref)
  btnCardReparse: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#38BDF8',
    flex: 1,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 72,
    maxWidth: 90,
  },
  btnCardReparseText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },

  btnCardReject: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  btnCardRejectMobile: {
    flex: 1,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  btnCardRejectText: {
    color: '#64748B',
    fontSize: 11.5,
    fontWeight: '600',
  },
  btnCardSave: {
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
    ...SHADOWS.sm,
  },
  btnCardSaveMobile: {
    flex: 2,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  btnCardSaveApproved: {
    backgroundColor: '#0284C7',
  },
  btnCardSaveReturn: {
    backgroundColor: '#F97316',
  },
  btnToggleOrderType: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  btnToggleOrderTypeReturn: {
    borderColor: '#FB923C',
    backgroundColor: '#FFF7ED',
  },
  btnToggleOrderTypeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#475569',
  },
  btnToggleOrderTypeTextReturn: {
    color: '#C2410C',
    fontWeight: 'bold',
  },
  btnCardSaveText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },

  /* Footer đáy modal */
  modalFooterBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  modalFooterBarMobile: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  footerSummaryText: {
    color: '#475569',
    fontSize: 12.5,
  },
  footerSummaryTextMobile: {
    fontSize: 11.5,
  },
  btnCloseFooter: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnCloseFooterMobile: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  btnCloseFooterText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  btnCloseFooterTextMobile: {
    fontSize: 11.5,
  },

  /* Dropdown Select Option Rows */
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
    marginTop: 2,
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
    color: '#64748B',
    fontSize: 12,
    fontWeight: '500',
  },
  productOptionCustomPrice: {
    color: '#7C3AED',
    fontSize: 12,
    fontWeight: 'bold',
  },
  customPriceBadge: {
    backgroundColor: '#F3E8FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  customPriceBadgeText: {
    color: '#7C3AED',
    fontSize: 10,
    fontWeight: '700',
  },
  tableMoneyContainer: {
    height: 34,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 6,
    justifyContent: 'center',
  },
  tableMoneyContainerMobile: {
    height: 33,
    paddingHorizontal: 4,
  },
  tableMoneyInput: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '500',
  },
  tableMoneyInputMobile: {
    fontSize: 11.5,
    paddingHorizontal: 0,
  },
  tableMoneyInputAmount: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#059669',
  },
  tableMoneyInputAmountMobile: {
    fontSize: 11.5,
    fontWeight: 'bold',
    color: '#059669',
    paddingHorizontal: 0,
  },
  cardModeToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 2,
    marginBottom: 8,
  },
  cardModeBtn: {
    flex: 1,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  cardModeBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  cardModeBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  cardModeBtnTextActive: {
    color: '#0F172A',
    fontWeight: 'bold',
  },
  cardQuickDebtBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 8,
    marginBottom: 8,
  },
  cardQuickMoneyContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 4,
    marginBottom: 6,
  },
  cardQuickMoneyInput: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#059669',
    textAlign: 'center',
  },
  cardQuickSubWrap: {
    marginTop: 4,
  },
  cardQuickSubTitle: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 4,
  },
  cardQuickSubChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    alignItems: 'center',
  },
  cardQuickSubChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 4,
  },
  cardQuickSubChipText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  cardQuickSubChipDelete: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: 'bold',
  },
  cardQuickAddChipBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  cardQuickAddChipText: {
    fontSize: 10.5,
    fontWeight: 'bold',
    color: '#2563EB',
  },
});
