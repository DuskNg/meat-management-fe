import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  Platform,
  Dimensions,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import SmoothModal from './SmoothModal';
import { API_HOST } from '../api/client';
import { api } from '../api/client';
import axios from 'axios';
import { downloadOrShareImage, isMobileDevice } from '../utils/imageShareHelper';
import { showGlobalToast } from '../store/toastStore';
import { getLunarDateString } from '../utils/lunarCalendar';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Kiểm tra URL có phải là định dạng Video hay không
const checkIsVideoUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('data:video/')) return true;
  if (url.includes('/video/upload/')) return true;
  return /\.(mp4|mov|webm|m4v|avi|mkv)($|\?)/i.test(url);
};

// Định dạng tiền tệ VND
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount || 0).replace('₫', 'đ');
};

// Format ngắn ngày dương lịch: DD/MM (bỏ năm)
const formatShortDate = (displayDate, dateKey) => {
  // displayDate dạng DD/MM/YYYY
  if (displayDate && displayDate.includes('/')) {
    const parts = displayDate.split('/');
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  }
  // dateKey dạng YYYY-MM-DD
  if (dateKey && dateKey.includes('-')) {
    const parts = dateKey.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
  }
  return displayDate || dateKey || '';
};

// Sao chép nội dung vào Clipboard
const copyTextToClipboard = async (text) => {
  if (!text) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {}
  return false;
};

/**
 * Modal xem ảnh hóa đơn phóng to:
 * - Hỗ trợ Zoom in (+) / Zoom out (-) đa cấp độ từ 0.5x -> 4.0x.
 * - Hỗ trợ kéo di chuyển (Pan / Drag) ảnh tự do bằng chuột hoặc cảm ứng.
 * - Hỗ trợ cuộn chuột (Mouse wheel) để zoom nhanh.
 * - Hỗ trợ xoay ảnh 90 độ (Rotate) và nhấp đúp để phóng to / đặt lại 100%.
 * - Hỗ trợ chuyển đổi giữa nhiều ảnh hóa đơn (Next/Prev).
 * - Hỗ trợ hiển thị bảng số liệu chi tiết ngày đó song song với ảnh (Side-by-side).
 * - Hỗ trợ nút chuyển nhanh sang hóa đơn hôm trước / hôm sau.
 */
const InvoiceImageViewerModal = forwardRef((props, ref) => {
  // portalToken + portalSessionToken: chỉ truyền vào khi dùng trong portal khách hàng (không có auth Bearer)
  const { portalToken, portalSessionToken } = props;
  const isPortalMode = Boolean(portalToken);
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 840;

  const [visible, setVisible] = useState(false);
  const [images, setImages] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [title, setTitle] = useState('Ảnh hóa đơn');
  const [subtitle, setSubtitle] = useState('');
  const [onDeleteCallback, setOnDeleteCallback] = useState(null);

  // State hỗ trợ hiển thị số liệu ngày và điều hướng Hôm trước / Hôm sau
  const [dayData, setDayData] = useState(null);
  const [hasPrevDay, setHasPrevDay] = useState(false);
  const [hasNextDay, setHasNextDay] = useState(false);
  const [prevDayLabel, setPrevDayLabel] = useState('');
  const [nextDayLabel, setNextDayLabel] = useState('');
  const [onPrevDayCallback, setOnPrevDayCallback] = useState(null);
  const [onNextDayCallback, setOnNextDayCallback] = useState(null);

  // State điều khiển Zoom, Kéo ảnh và Xoay ảnh
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // State quản lý trạng thái tải ảnh và bắt lỗi
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // State đồng bộ Cloudinary khi video lỗi tải từ máy chủ cục bộ
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [isMissingFile, setIsMissingFile] = useState(false);
  const [syncedUrls, setSyncedUrls] = useState({}); // lưu cache URL sau khi sync theo id hoặc index

  const containerRef = useRef(null);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // Đặt lại zoom & vị trí về mặc định (100%, căn giữa)
  const resetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
    setIsDragging(false);
  };

  // Tự động đặt lại zoom và trạng thái tải khi chuyển ảnh hoặc mở modal
  useEffect(() => {
    resetZoom();
    setImageLoading(true);
    setImageError(false);
    setIsSyncingCloud(false);
    setIsMissingFile(false);
  }, [currentIndex, visible, reloadKey]);

  // Phơi bày hàm điều khiển ra ngoài ref
  useImperativeHandle(ref, () => ({
    open: ({
      images: inputImages = [],
      initialIndex = 0,
      title: modalTitle = 'Ảnh hóa đơn',
      subtitle: modalSubtitle = '',
      onDelete = null,
      dayData: inputDayData = null,
      hasPrevDay: inputHasPrev = false,
      hasNextDay: inputHasNext = false,
      prevDayLabel: inputPrevLabel = '',
      nextDayLabel: inputNextLabel = '',
      onPrevDay = null,
      onNextDay = null,
    }) => {
      const formatted = (inputImages || []).map((img, idx) => {
        if (typeof img === 'string') {
          return { id: `img-${idx}`, imageUrl: img };
        }
        return img;
      });

      setImages(formatted);
      setCurrentIndex(Math.max(0, Math.min(initialIndex, formatted.length - 1)));
      setTitle(modalTitle);
      setSubtitle(modalSubtitle);
      setOnDeleteCallback(() => onDelete);
      setDayData(inputDayData || null);
      setHasPrevDay(Boolean(inputHasPrev));
      setHasNextDay(Boolean(inputHasNext));
      setPrevDayLabel(inputPrevLabel || '');
      setNextDayLabel(inputNextLabel || '');
      setOnPrevDayCallback(() => onPrevDay);
      setOnNextDayCallback(() => onNextDay);
      resetZoom();
      setImageLoading(true);
      setImageError(false);
      setIsSyncingCloud(false);
      setIsMissingFile(false);
      setSyncedUrls({}); // Xóa cache URL đã sync của lần mở trước
      setVisible(true);
    },
    close: () => {
      setVisible(false);
      resetZoom();
      setDayData(null);
      setOnPrevDayCallback(null);
      setOnNextDayCallback(null);
    },
  }));

  const handleClose = () => {
    setVisible(false);
    resetZoom();
    setDayData(null);
    setOnPrevDayCallback(null);
    setOnNextDayCallback(null);
  };

  const handlePrevDay = () => {
    if (onPrevDayCallback) {
      onPrevDayCallback();
    }
  };

  const handleNextDay = () => {
    if (onNextDayCallback) {
      onNextDayCallback();
    }
  };

  const handleCopyDaySummary = async () => {
    if (!dayData) return;
    const lines = [];
    lines.push(`📅 BẢNG KÊ NGÀY: ${dayData.dateKey}${dayData.displayLunarDate ? ` (${dayData.displayLunarDate} âm)` : ''}`);
    if (dayData.customerName) lines.push(`🏢 Cơ sở: ${dayData.customerName}`);
    lines.push('--------------------------------');
    (dayData.entries || []).forEach((e) => {
      if (e.type === 'DAY_TOTAL' || e.type === 'DAY_PARTIAL_PAID' || e.type === 'DAY_PARTIAL_REMAINING') return;
      const isRet = e.type === 'RETURN';
      const qStr = e.quantity != null ? ` - ${e.quantity}kg` : '';
      const pStr = e.price != null ? ` x ${formatCurrency(e.price)}` : '';
      lines.push(`${isRet ? '[-] TRẢ HÀNG: ' : ''}${e.name}${qStr}${pStr} = ${isRet ? '-' : ''}${formatCurrency(e.amount)}`);
    });
    lines.push('--------------------------------');
    if (daySummary.totalQty > 0) lines.push(`Tổng kg thịt: ${daySummary.totalQty} kg`);
    lines.push(`TỔNG CỘNG: ${formatCurrency(daySummary.totalAmount)}`);
    const success = await copyTextToClipboard(lines.join('\n'));
    if (success) {
      showGlobalToast('Đã sao chép số liệu ngày vào bộ nhớ tạm!', 'success');
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const currentItem = images[currentIndex];

  // Chuẩn hóa đường dẫn ảnh đầy đủ
  const getFullImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:image/') || path.startsWith('data:video/')) {
      return path;
    }
    const host = API_HOST || '';
    return `${host}${path.startsWith('/') ? '' : '/'}${path}`;
  };

  // URL hiện tại — ưu tiên URL đã được sync Cloudinary nếu có
  const rawUrl = currentItem ? (syncedUrls[currentIndex] || currentItem.imageUrl) : '';
  const currentUrl = getFullImageUrl(rawUrl);

  // Hàm tự động thử sync Cloudinary khi video lỗi (chỉ khi có invoiceId và URL còn là /uploads/)
  const handleVideoError = async (errCode, errMsg) => {
    const invoiceId = currentItem?.id;
    const isLocalUrl = rawUrl && rawUrl.startsWith('/uploads/');

    // Nếu có invoiceId và là link /uploads/ — tự động gọi sync-cloud
    if (invoiceId && isLocalUrl && !isSyncingCloud) {
      setIsSyncingCloud(true);
      try {
        let res;
        if (isPortalMode) {
          // Chế độ Portal: gọi endpoint công khai, xác thực qua portal token + session
          const headers = {};
          if (portalSessionToken) {
            headers['x-portal-session'] = portalSessionToken;
          }
          res = await axios.post(
            `${API_HOST}/api/v1/portal/sync-invoice/${portalToken}/${invoiceId}`,
            {},
            { headers }
          );
        } else {
          // Chế độ Admin: gọi endpoint authenticated
          res = await api.post(`/transactions/invoices/${invoiceId}/sync-cloud`);
        }

        if (res.data?.success && res.data?.data?.imageUrl) {
          // Đã sync xong, lưu URL mới vào cache và reload video
          setSyncedUrls((prev) => ({ ...prev, [currentIndex]: res.data.data.imageUrl }));
          setImageError(false);
          setImageLoading(true);
          setReloadKey((k) => k + 1);
          return;
        } else if (res.data?.isMissingFile) {
          // File hết hạn trên server — hiển thị thông báo riêng
          setIsMissingFile(true);
          setImageLoading(false);
          setImageError(true);
          return;
        }
      } catch (_) {
        // Bỏ qua lỗi sync, tiếp tục hiển thị error UI bình thường
      } finally {
        setIsSyncingCloud(false);
      }
    }

    // Hiển thị error UI bình thường
    setImageLoading(false);
    setImageError(true);
  };

  // Mở ảnh trong tab mới
  const handleOpenInNewTab = () => {
    if (typeof window !== 'undefined' && currentUrl) {
      window.open(currentUrl, '_blank');
    }
  };

  // Tải ảnh (PC) hoặc chuyển tiếp Zalo (Mobile)
  const handleDownload = async () => {
    if (!currentUrl) return;
    await downloadOrShareImage({
      imageUri: currentUrl,
      fileName: `hoa_don_${currentIndex + 1}.jpg`,
      title: title || 'Ảnh hóa đơn',
      text: subtitle || '',
    });
  };

  // Phóng to ảnh
  const handleZoomIn = () => {
    setScale((prev) => Math.min(4.0, Math.round((prev + 0.25) * 100) / 100));
  };

  // Thu nhỏ ảnh
  const handleZoomOut = () => {
    setScale((prev) => {
      const next = Math.max(0.5, Math.round((prev - 0.25) * 100) / 100);
      if (next <= 1) {
        setPosition({ x: 0, y: 0 });
      }
      return next;
    });
  };

  // Xoay ảnh 90 độ
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Nhấp đúp để phóng to nhanh 2x hoặc quay lại 1x
  const handleDoubleClick = () => {
    if (scale > 1) {
      resetZoom();
    } else {
      setScale(2);
    }
  };

  // Lắng nghe sự kiện cuộn chuột (Mouse Wheel) để phóng to/thu nhỏ trên Web
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const node = containerRef.current;
    if (!node) return;

    const onWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.2 : -0.2;
      setScale((prev) => {
        const next = Math.min(4.0, Math.max(0.5, Math.round((prev + delta) * 100) / 100));
        if (next <= 1) {
          setPosition({ x: 0, y: 0 });
        }
        return next;
      });
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      node.removeEventListener('wheel', onWheel);
    };
  }, [visible]);

  // Xử lý kéo di chuyển ảnh bằng chuột (Mouse Dragging)
  const handleMouseDown = (e) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  };

  const handleMouseMove = (e) => {
    if (!isDragging || Platform.OS !== 'web') return;
    e.preventDefault();
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;
    setPosition({
      x: dragStartRef.current.posX + deltaX,
      y: dragStartRef.current.posY + deltaY,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Xử lý kéo di chuyển bằng cảm ứng trên điện thoại (Touch Events)
  const handleTouchStart = (e) => {
    if (e.nativeEvent.touches?.length === 1) {
      const touch = e.nativeEvent.touches[0];
      setIsDragging(true);
      dragStartRef.current = {
        x: touch.pageX,
        y: touch.pageY,
        posX: position.x,
        posY: position.y,
      };
    }
  };

  const handleTouchMove = (e) => {
    if (!isDragging || e.nativeEvent.touches?.length !== 1) return;
    const touch = e.nativeEvent.touches[0];
    const deltaX = touch.pageX - dragStartRef.current.x;
    const deltaY = touch.pageY - dragStartRef.current.y;
    setPosition({
      x: dragStartRef.current.posX + deltaX,
      y: dragStartRef.current.posY + deltaY,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleDelete = () => {
    if (onDeleteCallback && currentItem) {
      onDeleteCallback(currentItem, () => {
        const nextList = images.filter((_, idx) => idx !== currentIndex);
        if (nextList.length === 0) {
          setVisible(false);
        } else {
          setImages(nextList);
          setCurrentIndex(Math.min(currentIndex, nextList.length - 1));
        }
      });
    }
  };

  const isVideo = checkIsVideoUrl(currentUrl);

  // Tự động tính toán tổng hợp (Tổng tiền, Tổng kg, Tiền trả hàng) từ danh sách món nếu không được truyền vào
  const daySummary = useMemo(() => {
    if (!dayData) {
      return {
        totalAmount: 0,
        totalQty: 0,
        totalMeat: 0,
        totalReturn: 0,
        remainingDebt: null,
      };
    }

    let sumMeat = 0;
    let sumReturn = 0;
    let sumQty = 0;

    (dayData.entries || []).forEach((e) => {
      if (
        e.type === 'DAY_TOTAL' ||
        e.type === 'DAY_PARTIAL_PAID' ||
        e.type === 'DAY_PARTIAL_REMAINING'
      ) {
        return;
      }

      const amt = parseFloat(e.amount) || 0;
      const q = parseFloat(e.quantity) || 0;

      if (e.type === 'RETURN') {
        sumReturn += Math.abs(amt);
      } else {
        sumMeat += Math.abs(amt);
        sumQty += q;
      }
    });

    const netAmount = sumMeat - sumReturn;
    // Sửa: bỏ điều kiện > 0 để tính đúng khi ngày chỉ có trả hàng (net âm)
    const finalTotalAmount =
      dayData.totalAmount != null
        ? dayData.totalAmount
        : (netAmount !== 0 ? netAmount : 0);

    const finalTotalQty =
      dayData.totalQty != null && dayData.totalQty > 0
        ? dayData.totalQty
        : Math.round(sumQty * 100) / 100;

    const finalTotalMeat =
      dayData.totalMeat != null && dayData.totalMeat > 0
        ? dayData.totalMeat
        : sumMeat;

    const finalTotalReturn =
      dayData.totalReturn != null && dayData.totalReturn > 0
        ? dayData.totalReturn
        : sumReturn;

    const finalRemainingDebt =
      dayData.remainingDebt != null
        ? dayData.remainingDebt
        : (dayData.isPaid ? 0 : finalTotalAmount);

    return {
      totalAmount: finalTotalAmount,
      totalQty: finalTotalQty,
      totalMeat: finalTotalMeat,
      totalReturn: finalTotalReturn,
      remainingDebt: finalRemainingDebt,
    };
  }, [dayData]);

  return (
    <SmoothModal visible={visible} onClose={handleClose} centered={true} zIndex={50000}>
      <View style={[styles.container, dayData && (isWide ? styles.containerWide : styles.containerMobileWithData)]}>
        {/* Thanh Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerTitleContainer}>
            {dayData ? (
              <View style={styles.headerStatusRow}>
                <View style={[
                  styles.headerStatusBadge,
                  dayData.isPaid
                    ? styles.headerStatusBadgePaid
                    : dayData.isPartialPaid
                    ? styles.headerStatusBadgePartial
                    : styles.headerStatusBadgeUnpaid
                ]}>
                  <Text style={[
                    styles.headerStatusBadgeText,
                    dayData.isPaid
                      ? styles.headerStatusTextPaid
                      : dayData.isPartialPaid
                      ? styles.headerStatusTextPartial
                      : styles.headerStatusTextUnpaid
                  ]}>
                    {dayData.isPaid
                      ? '✓ ĐÃ THANH TOÁN'
                      : dayData.isPartialPaid
                      ? '⚡ TRẢ 1 PHẦN'
                      : '⏳ CÒN NỢ'}
                  </Text>
                </View>
                {images.length > 1 && (
                  <Text style={styles.headerImageIndex}>({currentIndex + 1}/{images.length})</Text>
                )}
              </View>
            ) : (
              <>
                <Text style={styles.titleText} numberOfLines={1}>
                  {isVideo ? '🎬 ' : ''}{title} {images.length > 1 ? `(${currentIndex + 1}/${images.length})` : ''}
                </Text>
                {subtitle ? <Text style={styles.subText} numberOfLines={1}>{subtitle}</Text> : null}
              </>
            )}
          </View>

          {/* Cụm điều hướng Hôm trước / Hôm sau trên Desktop */}
          {isWide && (onPrevDayCallback || onNextDayCallback) && (
            <View style={styles.dayNavCluster}>
              <TouchableOpacity
                style={[styles.dayNavClusterBtn, !hasPrevDay && styles.dayNavClusterBtnDisabled]}
                onPress={handlePrevDay}
                disabled={!hasPrevDay}
                activeOpacity={0.7}
              >
                <Text style={[styles.dayNavClusterBtnText, !hasPrevDay && styles.dayNavClusterBtnTextDisabled]}>
                  {prevDayLabel ? `◀ ${prevDayLabel}` : '◀ Hôm trước'}
                </Text>
              </TouchableOpacity>

              <View style={styles.desktopDayNavCenter}>
                {dayData?.dateKey ? (
                  <Text style={styles.desktopDayNavCurrentText}>
                    📅 {formatShortDate(dayData.displayDate, dayData.dateKey)}
                  </Text>
                ) : null}
                {(dayData?.displayLunarDate || (dayData?.dateKey && getLunarDateString(dayData.dateKey))) ? (
                  <Text style={styles.desktopDayNavLunarText}>
                    ({dayData?.displayLunarDate || getLunarDateString(dayData.dateKey)} âm)
                  </Text>
                ) : null}
              </View>

              <TouchableOpacity
                style={[styles.dayNavClusterBtn, !hasNextDay && styles.dayNavClusterBtnDisabled]}
                onPress={handleNextDay}
                disabled={!hasNextDay}
                activeOpacity={0.7}
              >
                <Text style={[styles.dayNavClusterBtnText, !hasNextDay && styles.dayNavClusterBtnTextDisabled]}>
                  {nextDayLabel ? `${nextDayLabel} ▶` : 'Hôm sau ▶'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.headerActions}>
            {/* Nút Sao chép số liệu ngày (thay thế nút Mở tab theo yêu cầu người dùng) */}
            {dayData && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={handleCopyDaySummary}
                title="Sao chép số liệu ngày"
              >
                <Text style={styles.actionBtnText}>📋 Copy</Text>
              </TouchableOpacity>
            )}

            {Platform.OS === 'web' && currentUrl ? (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={handleDownload}
                title={isMobileDevice() ? 'Gửi Zalo' : (isVideo ? 'Tải video về máy' : 'Tải ảnh về máy')}
              >
                <Text style={styles.actionBtnText}>
                  {isMobileDevice() ? '📲 Gửi Zalo' : (isVideo ? '⬇️ Tải video' : '⬇️ Lưu ảnh')}
                </Text>
              </TouchableOpacity>
            ) : null}

            {onDeleteCallback && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.deleteBtn]}
                onPress={handleDelete}
              >
                <Text style={styles.deleteBtnText}>🗑️ Xóa</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Thanh điều hướng Hôm trước / Hôm sau trên Mobile */}
        {!isWide && (onPrevDayCallback || onNextDayCallback) && (
          <View style={styles.mobileDayNavRow}>
            <TouchableOpacity
              style={[styles.mobileDayNavBtn, !hasPrevDay && styles.dayNavClusterBtnDisabled]}
              onPress={handlePrevDay}
              disabled={!hasPrevDay}
              activeOpacity={0.7}
            >
              <Text style={[styles.mobileDayNavBtnText, !hasPrevDay && styles.dayNavClusterBtnTextDisabled]}>
                {prevDayLabel ? `◀ ${prevDayLabel}` : '◀ Hôm trước'}
              </Text>
            </TouchableOpacity>

            <View style={styles.mobileDayNavCenter}>
              {dayData?.dateKey ? (
                <Text style={styles.mobileDayNavCurrentText} numberOfLines={1}>
                  📅 {formatShortDate(dayData.displayDate, dayData.dateKey)}
                </Text>
              ) : null}
              {(dayData?.displayLunarDate || (dayData?.dateKey && getLunarDateString(dayData.dateKey))) ? (
                <Text style={styles.mobileDayNavLunarText} numberOfLines={1}>
                  ({dayData?.displayLunarDate || getLunarDateString(dayData.dateKey)} âm)
                </Text>
              ) : null}
            </View>

            <TouchableOpacity
              style={[styles.mobileDayNavBtn, !hasNextDay && styles.dayNavClusterBtnDisabled]}
              onPress={handleNextDay}
              disabled={!hasNextDay}
              activeOpacity={0.7}
            >
              <Text style={[styles.mobileDayNavBtnText, !hasNextDay && styles.dayNavClusterBtnTextDisabled]}>
                {nextDayLabel ? `${nextDayLabel} ▶` : 'Hôm sau ▶'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Thân chính modal: Khi có dayData sẽ chia 2 bên (ảnh/video 1 bên, số liệu 1 bên) */}
        <View style={[styles.viewerMainBody, isWide && dayData && styles.viewerMainBodyWide]}>
          {/* Cụm xem ảnh/video + thanh công cụ riêng biệt không đè lên ảnh */}
          <View style={[
            styles.imageViewerSection,
            dayData && (isWide ? styles.imageViewerSectionSplit : styles.imageViewerSectionMobileSplit),
          ]}>
            {/* Khung hiển thị hình ảnh / video có hỗ trợ Zoom & Kéo */}
            <View
              ref={containerRef}
              style={styles.imageViewerBox}
          onMouseDown={!isVideo ? handleMouseDown : undefined}
          onMouseMove={!isVideo ? handleMouseMove : undefined}
          onMouseUp={!isVideo ? handleMouseUp : undefined}
          onMouseLeave={!isVideo ? handleMouseUp : undefined}
          onTouchStart={!isVideo ? handleTouchStart : undefined}
          onTouchMove={!isVideo ? handleTouchMove : undefined}
          onTouchEnd={!isVideo ? handleTouchEnd : undefined}
          onDoubleClick={!isVideo ? handleDoubleClick : undefined}
        >
          {/* Trạng thái đang tải */}
          {imageLoading && !imageError && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#10B981" />
              <Text style={styles.loadingText}>
                {isVideo ? 'Đang tải video hóa đơn...' : 'Đang tải ảnh hóa đơn...'}
              </Text>
            </View>
          )}

          {/* Trạng thái bị lỗi không tải được */}
          {imageError && (
            <View style={styles.errorContainer}>
              {isSyncingCloud ? (
                // Đang tự động thử sync Cloudinary
                <>
                  <ActivityIndicator size="large" color="#38BDF8" />
                  <Text style={[styles.errorTitle, { color: '#38BDF8', marginTop: 12 }]}>
                    Đang đồng bộ video lên đám mây...
                  </Text>
                  <Text style={styles.errorDesc}>
                    Video sẽ sẵn sàng trong vài giây. Vui lòng chờ.
                  </Text>
                </>
              ) : isMissingFile ? (
                // File hết hạn trên server
                <>
                  <Text style={styles.errorIcon}>🎬</Text>
                  <Text style={styles.errorTitle}>Video tạm đã hết hạn trên máy chủ</Text>
                  <Text style={styles.errorDesc}>
                    Dữ liệu AI nhận diện và đơn nợ vẫn được lưu an toàn. Tệp video tạm chỉ lưu 24-48 giờ nếu chưa kịp đồng bộ lên Cloudinary.
                  </Text>
                  <View style={[styles.errorBtnRow, { justifyContent: 'center' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#065F46', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}>
                      <Text style={{ color: '#34D399', fontSize: 12, fontWeight: 'bold' }}>✓ Dữ liệu đơn nợ an toàn</Text>
                    </View>
                  </View>
                </>
              ) : (
                // Lỗi tải thông thường
                <>
                  <Text style={styles.errorIcon}>⚠️</Text>
                  <Text style={styles.errorTitle}>
                    {isVideo ? 'Không thể phát video hóa đơn' : 'Không thể tải được hình ảnh hóa đơn'}
                  </Text>
                  <Text style={styles.errorDesc}>
                    Đường truyền mạng bị gián đoạn hoặc định dạng tệp không tương thích.
                  </Text>
                  <View style={styles.errorBtnRow}>
                    <TouchableOpacity
                      style={styles.retryBtn}
                      onPress={() => {
                        setImageError(false);
                        setImageLoading(true);
                        setIsMissingFile(false);
                        setReloadKey((k) => k + 1);
                      }}
                    >
                      <Text style={styles.retryBtnText}>🔄 Thử lại</Text>
                    </TouchableOpacity>

                    {Platform.OS === 'web' && currentUrl ? (
                      <TouchableOpacity style={styles.openTabBtn} onPress={handleOpenInNewTab}>
                        <Text style={styles.openTabBtnText}>🔗 Mở tab mới</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </>
              )}
            </View>
          )}

          {currentUrl && !imageError ? (
            isVideo ? (
              Platform.OS === 'web' ? (
                <video
                  key={`${currentUrl}_${reloadKey}`}
                  src={currentUrl}
                  controls
                  autoPlay
                  playsInline
                  onLoadedData={() => {
                    setImageLoading(false);
                    setImageError(false);
                  }}
                  onError={(e) => {
                    // Chỉ log thông tin an toàn, tránh circular structure từ HTMLVideoElement
                    const errCode = e?.target?.error?.code;
                    const errMsg = e?.target?.error?.message || 'Không xác định';
                    console.error('Lỗi khi tải video hóa đơn trên Web:', currentUrl, `code=${errCode}`, errMsg);
                    // Gọi hàm xử lý lỗi thông minh (tự sync Cloudinary nếu video iPhone chưa kịp upload)
                    handleVideoError(errCode, errMsg);
                  }}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    borderRadius: 8,
                    boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
                    backgroundColor: '#000000',
                  }}
                />
              ) : (
                <View style={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 16, marginBottom: 12 }}>🎬 Video hóa đơn</Text>
                  <TouchableOpacity style={styles.openTabBtn} onPress={handleOpenInNewTab}>
                    <Text style={styles.openTabBtnText}>▶️ Mở xem video</Text>
                  </TouchableOpacity>
                </View>
              )
            ) : (
              <View
                style={[
                  styles.imageTransformWrapper,
                  {
                    transform: [
                      { translateX: position.x },
                      { translateY: position.y },
                      { scale: scale },
                      { rotate: `${rotation}deg` },
                    ],
                    cursor: isDragging ? 'grabbing' : (scale > 1 ? 'grab' : 'default'),
                    display: imageLoading ? 'none' : 'flex',
                  },
                ]}
              >
                {Platform.OS === 'web' ? (
                  <img
                    key={`${currentUrl}_${reloadKey}`}
                    src={currentUrl}
                    alt={title || 'Hóa đơn'}
                    draggable={false}
                    onLoad={() => {
                      setImageLoading(false);
                      setImageError(false);
                    }}
                    onError={(e) => {
                      console.error('Lỗi khi tải ảnh hóa đơn trên Web:', currentUrl, e);
                      setImageLoading(false);
                      setImageError(true);
                    }}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                      userSelect: 'none',
                      pointerEvents: 'none',
                    }}
                  />
                ) : (
                  <Image
                    key={`${currentUrl}_${reloadKey}`}
                    source={{ uri: currentUrl }}
                    style={styles.mainImage}
                    resizeMode="contain"
                    onLoadStart={() => setImageLoading(true)}
                    onLoadEnd={() => setImageLoading(false)}
                    onError={() => {
                      setImageLoading(false);
                      setImageError(true);
                    }}
                  />
                )}
              </View>
            )
          ) : !currentUrl ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>Không thể hiển thị hình ảnh này.</Text>
            </View>
          ) : null}

          {/* Nút sang trái / sang phải khi có nhiều ảnh */}
          {images.length > 1 && (
            <>
              {currentIndex > 0 && (
                <TouchableOpacity
                  style={[styles.navBtn, styles.navBtnLeft]}
                  onPress={handlePrev}
                  activeOpacity={0.8}
                >
                  <Text style={styles.navBtnText}>‹</Text>
                </TouchableOpacity>
              )}

              {currentIndex < images.length - 1 && (
                <TouchableOpacity
                  style={[styles.navBtn, styles.navBtnRight]}
                  onPress={handleNext}
                  activeOpacity={0.8}
                >
                  <Text style={styles.navBtnText}>›</Text>
                </TouchableOpacity>
              )}
            </>
          )}

            </View>

            {/* Thanh công cụ Zoom & Xoay ảnh đặt riêng bên dưới, KHÔNG ĐÈ LÊN ẢNH */}
            <View style={styles.dedicatedZoomBar}>
              <TouchableOpacity style={styles.zoomBtn} onPress={handleZoomOut} title="Thu nhỏ (-)">
                <Text style={styles.zoomBtnText}>−</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.zoomPercentBtn} onPress={resetZoom} title="Nhấp để về 100%">
                <Text style={styles.zoomPercentText}>{Math.round(scale * 100)}%</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.zoomBtn} onPress={handleZoomIn} title="Phóng to (+)">
                <Text style={styles.zoomBtnText}>+</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.zoomToolBtn} onPress={handleRotate} title="Xoay ảnh 90°">
                <Text style={styles.zoomToolBtnText}>🔄 Xoay</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.zoomToolBtn} onPress={resetZoom} title="Đặt lại ảnh về giữa">
                <Text style={styles.zoomToolBtnText}>↺ Đặt lại</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* CỘT PHẢI (HOẶC NỬA DƯỚI TRÊN MOBILE): BẢNG SỐ LIỆU NGÀY ĐÓ */}
          {dayData && (
            <View style={[styles.dayDataBox, isWide ? styles.dayDataBoxSplit : styles.dayDataBoxMobileSplit]}>
              {/* Bảng danh sách chi tiết các món thịt (Đã bỏ khối tiêu đề số liệu ngày thừa) */}
              <ScrollView style={styles.dayDataScroll} showsVerticalScrollIndicator={true}>
                {/* Header bảng */}
                <View style={styles.dayDataTableHeader}>
                <Text style={[styles.dayDataTh, styles.dayDataColName]}>TÊN HÀNG</Text>
                <Text style={[styles.dayDataTh, styles.dayDataColQty]}>KG</Text>
                <Text style={[styles.dayDataTh, styles.dayDataColPrice]}>ĐƠN GIÁ</Text>
                <Text style={[styles.dayDataTh, styles.dayDataColAmount]}>THÀNH TIỀN</Text>
              </View>

              {/* Danh sách các món thịt */}
              {(dayData.entries || [])
                .filter((e) => e.type !== 'DAY_TOTAL' && e.type !== 'DAY_PARTIAL_PAID' && e.type !== 'DAY_PARTIAL_REMAINING')
                .map((item, idx) => {
                  const isReturn = item.type === 'RETURN';
                  return (
                    <View
                      key={idx}
                      style={[
                        styles.dayDataTableRow,
                        idx % 2 === 1 && styles.dayDataTableRowAlt,
                        isReturn && styles.dayDataTableRowReturn,
                      ]}
                    >
                      <View style={styles.dayDataColName}>
                        <Text style={[styles.dayDataCellText, styles.dayDataMeatName, isReturn && styles.textRed]}>
                          {isReturn ? `[TRẢ HÀNG] ${item.name}` : item.name}
                        </Text>
                        {item.customerName && dayData.customerName !== item.customerName ? (
                          <Text style={styles.dayDataBranchNote}>🏢 {item.customerName}</Text>
                        ) : null}
                      </View>

                      <Text style={[styles.dayDataCellText, styles.dayDataColQty, isReturn && styles.textRed]}>
                        {item.quantity != null ? item.quantity : '-'}
                      </Text>

                      <Text style={[styles.dayDataCellText, styles.dayDataColPrice, isReturn && styles.textRed]}>
                        {item.price != null ? formatCurrency(item.price) : '-'}
                      </Text>

                      <Text style={[styles.dayDataCellText, styles.dayDataColAmount, styles.dayDataAmountText, isReturn && styles.textRed]}>
                        {isReturn ? '-' : ''}{formatCurrency(item.amount)}
                      </Text>
                    </View>
                  );
                })}

              {/* Khối tổng kết ngày - đã bỏ tổng kg và còn nợ ngày */}
              <View style={styles.dayDataSummaryCard}>
                {/* Hiện dòng tiền mua khi có trả hàng (cần phân biệt 2 số) */}
                {daySummary.totalReturn > 0 && (
                  <>
                    <View style={styles.dayDataSummaryRow}>
                      <Text style={styles.dayDataSummaryLabel}>Tiền mua hàng:</Text>
                      <Text style={styles.dayDataSummaryValue}>+{formatCurrency(daySummary.totalMeat)}</Text>
                    </View>
                    <View style={styles.dayDataSummaryRow}>
                      <Text style={styles.dayDataSummaryLabel}>Tiền trả hàng (-):</Text>
                      <Text style={[styles.dayDataSummaryValue, styles.textRed]}>-{formatCurrency(daySummary.totalReturn)}</Text>
                    </View>
                  </>
                )}

                <View style={[styles.dayDataSummaryRow, styles.dayDataTotalGrandRow]}>
                  <Text style={styles.dayDataTotalGrandLabel}>TỔNG CỘNG:</Text>
                  <Text style={[
                    styles.dayDataTotalGrandValue,
                    dayData.isPaid ? styles.totalGrandPaid : styles.totalGrandUnpaid,
                  ]}>{formatCurrency(daySummary.totalAmount)}</Text>
                </View>
              </View>
            </ScrollView>
          </View>
        )}
      </View>

        {/* Thanh ghi chú và mẹo tương tác dưới đáy */}
        <View style={styles.viewerFooter}>
          <Text style={styles.interactionHintText} numberOfLines={1}>
            💡 Mẹo: Nhấp đúp phóng to • Cuộn chuột để zoom • Nhấn giữ chuột kéo ảnh
          </Text>
        </View>
      </View>
    </SmoothModal>
  );
});

const styles = StyleSheet.create({
  container: {
    width: Platform.OS === 'web' ? 'min(96vw, 1100px)' : '96%',
    height: Platform.OS === 'web' ? 'min(90vh, 850px)' : '90%',
    maxHeight: Platform.OS === 'web' ? '90vh' : '90%',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
    alignSelf: 'center',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 10,
    elevation: 10,
    ...Platform.select({
      web: { userSelect: 'none' },
    }),
  },
  containerWide: {
    width: Platform.OS === 'web' ? 'min(98vw, 1320px)' : '98%',
    height: Platform.OS === 'web' ? 'min(94vh, 900px)' : '94%',
    maxHeight: Platform.OS === 'web' ? '94vh' : '94%',
  },
  containerMobileWithData: {
    width: '98%',
    height: Platform.OS === 'web' ? 'min(96vh, 920px)' : '96%',
    maxHeight: Platform.OS === 'web' ? '96vh' : '96%',
  },
  dayNavCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 10,
  },
  dayNavClusterBtn: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#38BDF8',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dayNavClusterBtnDisabled: {
    borderColor: '#334155',
    backgroundColor: '#1E293B',
    opacity: 0.4,
  },
  dayNavClusterBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38BDF8',
  },
  dayNavClusterBtnTextDisabled: {
    color: '#64748B',
  },
  desktopDayNavCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  desktopDayNavCurrentText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  desktopDayNavLunarText: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '500',
    marginTop: 1,
  },
  mobileDayNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  mobileDayNavBtn: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#38BDF8',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  mobileDayNavBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#38BDF8',
  },
  mobileDayNavCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileDayNavCurrentText: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  mobileDayNavLunarText: {
    fontSize: 10.5,
    color: '#94A3B8',
    fontWeight: '500',
    marginTop: 1,
  },
  viewerMainBody: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  viewerMainBodyWide: {
    flexDirection: 'row',
  },
  imageViewerSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#020617',
    overflow: 'hidden',
  },
  imageViewerSectionSplit: {
    flex: 1.15,
    borderRightWidth: 1,
    borderRightColor: '#334155',
  },
  imageViewerSectionMobileSplit: {
    height: 520,
    maxHeight: '70%',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  imageViewerBoxSplit: {
    flex: 1.15,
    borderRightWidth: 1,
    borderRightColor: '#334155',
  },
  imageViewerBoxMobileSplit: {
    height: 360,
    maxHeight: '52%',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  dayDataBox: {
    backgroundColor: '#FFFFFF',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  dayDataBoxSplit: {
    flex: 0.85,
    width: '42%',
  },
  dayDataBoxMobileSplit: {
    flex: 1,
  },
  dayDataHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  dayDataTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  dayDataTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  dayDataStatusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgePaid: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  statusBadgePartial: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  statusBadgeUnpaid: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  dayDataStatusBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  statusTextPaid: {
    color: '#15803D',
  },
  statusTextPartial: {
    color: '#B45309',
  },
  statusTextUnpaid: {
    color: '#B91C1C',
  },
  dayDataDateSubtitle: {
    fontSize: 11,
    color: '#64748B',
  },
  copyDayDataBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  copyDayDataBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  dayDataScroll: {
    flex: 1,
    padding: 10,
  },
  dayDataTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  dayDataTh: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.3,
  },
  dayDataColName: {
    flex: 2,
  },
  dayDataColQty: {
    flex: 0.8,
    textAlign: 'center',
  },
  dayDataColPrice: {
    flex: 1.1,
    textAlign: 'right',
  },
  dayDataColAmount: {
    flex: 1.3,
    textAlign: 'right',
  },
  dayDataTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  dayDataTableRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  dayDataTableRowReturn: {
    backgroundColor: '#FEF2F2',
  },
  dayDataCellText: {
    fontSize: 12,
    color: '#1E293B',
  },
  dayDataMeatName: {
    fontWeight: '700',
    color: '#0F172A',
  },
  dayDataBranchNote: {
    fontSize: 10,
    color: '#0284C7',
    marginTop: 1,
  },
  dayDataAmountText: {
    fontWeight: '700',
    color: '#0F172A',
  },
  dayDataSummaryCard: {
    marginTop: 12,
    marginBottom: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    gap: 5,
  },
  dayDataSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayDataSummaryLabel: {
    fontSize: 11.5,
    color: '#64748B',
  },
  dayDataSummaryValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  dayDataSummaryValueQty: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
  },
  dayDataTotalGrandRow: {
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
    paddingTop: 6,
    marginTop: 3,
  },
  dayDataTotalGrandLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  dayDataTotalGrandValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1E3A8A',
  },
  totalGrandUnpaid: {
    color: '#DC2626',
  },
  totalGrandPaid: {
    color: '#15803D',
  },
  dayDataRemainingRow: {
    marginTop: 3,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  dayDataRemainingLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#991B1B',
  },
  dayDataRemainingValue: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#DC2626',
  },
  textRed: {
    color: '#DC2626',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#1E293B',
    flexShrink: 0,
    zIndex: 10,
  },
  headerTitleContainer: {
    flex: 1,
    marginRight: 8,
    minWidth: 0,
  },
  headerTitleContainer: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  headerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerStatusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 7,
    borderWidth: 1,
  },
  headerStatusBadgePaid: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  headerStatusBadgePartial: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
  },
  headerStatusBadgeUnpaid: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  headerStatusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerStatusTextPaid: {
    color: '#15803D',
  },
  headerStatusTextPartial: {
    color: '#B45309',
  },
  headerStatusTextUnpaid: {
    color: '#B91C1C',
  },
  headerImageIndex: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  titleText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  subText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#334155',
  },
  actionBtnText: {
    color: '#F1F5F9',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  deleteBtnText: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '600',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
    flexShrink: 0,
  },
  closeBtnText: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold',
  },
  imageViewerBox: {
    position: 'relative',
    width: '100%',
    flex: 1,
    minHeight: 0,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imageTransformWrapper: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainImage: {
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  },
  navBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -25,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  navBtnLeft: {
    left: 16,
  },
  navBtnRight: {
    right: 16,
  },
  navBtnText: {
    color: '#FFFFFF',
    fontSize: 30,
    lineHeight: 34,
    fontWeight: 'bold',
  },
  floatingZoomBar: {
    position: 'absolute',
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    gap: 8,
    zIndex: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  dedicatedZoomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 8,
    flexShrink: 0,
  },
  zoomBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    lineHeight: 20,
  },
  zoomPercentBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  zoomPercentText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
    minWidth: 40,
    textAlign: 'center',
  },
  zoomToolBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  zoomToolBtnText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '600',
  },
  viewerFooter: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#1E293B',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    alignItems: 'center',
    flexShrink: 0,
  },
  interactionHintText: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 14,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#020617',
    zIndex: 15,
  },
  loadingText: {
    marginTop: 12,
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '500',
  },
  errorContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#020617',
    zIndex: 16,
  },
  errorIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  errorTitle: {
    color: '#F87171',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  errorDesc: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 400,
    marginBottom: 16,
    lineHeight: 18,
  },
  errorBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  retryBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  openTabBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  openTabBtnText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default InvoiceImageViewerModal;

