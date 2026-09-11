// meat-management-fe/src/components/InvoiceImageViewerModal.js
import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  Platform,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import SmoothModal from './SmoothModal';
import { API_HOST } from '../api/client';
import { downloadOrShareImage, isMobileDevice } from '../utils/imageShareHelper';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Kiểm tra URL có phải là định dạng Video hay không
const checkIsVideoUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('data:video/')) return true;
  if (url.includes('/video/upload/')) return true;
  return /\.(mp4|mov|webm|m4v|avi|mkv)($|\?)/i.test(url);
};

/**
 * Modal xem ảnh hóa đơn phóng to:
 * - Hỗ trợ Zoom in (+) / Zoom out (-) đa cấp độ từ 0.5x -> 4.0x.
 * - Hỗ trợ kéo di chuyển (Pan / Drag) ảnh tự do bằng chuột hoặc cảm ứng.
 * - Hỗ trợ cuộn chuột (Mouse wheel) để zoom nhanh.
 * - Hỗ trợ xoay ảnh 90 độ (Rotate) và nhấp đúp để phóng to / đặt lại 100%.
 * - Hỗ trợ chuyển đổi giữa nhiều ảnh hóa đơn (Next/Prev).
 */
const InvoiceImageViewerModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [images, setImages] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [title, setTitle] = useState('Ảnh hóa đơn');
  const [subtitle, setSubtitle] = useState('');
  const [onDeleteCallback, setOnDeleteCallback] = useState(null);

  // State điều khiển Zoom, Kéo ảnh và Xoay ảnh
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // State quản lý trạng thái tải ảnh và bắt lỗi
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

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
  }, [currentIndex, visible, reloadKey]);

  // Phơi bày hàm điều khiển ra ngoài ref
  useImperativeHandle(ref, () => ({
    open: ({
      images: inputImages = [],
      initialIndex = 0,
      title: modalTitle = 'Ảnh hóa đơn',
      subtitle: modalSubtitle = '',
      onDelete = null,
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
      resetZoom();
      setImageLoading(true);
      setImageError(false);
      setVisible(true);
    },
    close: () => {
      setVisible(false);
      resetZoom();
    },
  }));

  const handleClose = () => {
    setVisible(false);
    resetZoom();
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
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:image/')) {
      return path;
    }
    const host = API_HOST || '';
    return `${host}${path.startsWith('/') ? '' : '/'}${path}`;
  };

  const currentUrl = currentItem ? getFullImageUrl(currentItem.imageUrl) : '';

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

  return (
    <SmoothModal visible={visible} onClose={handleClose} centered={true} zIndex={100000}>
      <View style={styles.container}>
        {/* Thanh Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.titleText} numberOfLines={1}>
              {isVideo ? '🎬' : '🧾'} {title} {images.length > 1 ? `(${currentIndex + 1}/${images.length})` : ''}
            </Text>
            {subtitle ? <Text style={styles.subText}>{subtitle}</Text> : null}
          </View>

          <View style={styles.headerActions}>
            {Platform.OS === 'web' && currentUrl ? (
              <>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={handleOpenInNewTab}
                  title="Mở trong tab mới"
                >
                  <Text style={styles.actionBtnText}>🔗 Mở tab</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={handleDownload}
                  title={isMobileDevice() ? 'Gửi Zalo' : (isVideo ? 'Tải video về máy' : 'Tải ảnh về máy')}
                >
                  <Text style={styles.actionBtnText}>
                    {isMobileDevice() ? '📲 Gửi Zalo' : (isVideo ? '⬇️ Tải video' : '⬇️ Lưu ảnh')}
                  </Text>
                </TouchableOpacity>
              </>
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
                    console.error('Lỗi khi tải video hóa đơn trên Web:', currentUrl, e);
                    setImageLoading(false);
                    setImageError(true);
                  }}
                  style={{
                    maxWidth: '92vw',
                    maxHeight: '80vh',
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

          {/* Thanh công cụ Zoom & Xoay ảnh nổi ở đáy khung xem ảnh */}
          <View style={styles.floatingZoomBar}>
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

        {/* Thanh ghi chú và mẹo tương tác dưới đáy */}
        <View style={styles.viewerFooter}>
          <Text style={styles.interactionHintText}>
            💡 Mẹo: Nhấp đúp để phóng to • Cuộn chuột để zoom • Nhấn giữ chuột kéo để di chuyển ảnh
          </Text>
        </View>
      </View>
    </SmoothModal>
  );
});

const styles = StyleSheet.create({
  container: {
    width: Platform.OS === 'web' ? Math.min(SCREEN_WIDTH * 0.95, 1200) : '96%',
    maxHeight: Platform.OS === 'web' ? Math.min(SCREEN_HEIGHT * 0.94, 900) : '94%',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
    alignSelf: 'center',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 100000,
    elevation: 100000,
    ...Platform.select({
      web: { userSelect: 'none' },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#1E293B',
  },
  titleText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  subText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
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
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  closeBtnText: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold',
  },
  imageViewerBox: {
    position: 'relative',
    width: '100%',
    height: Platform.OS === 'web' ? Math.min(SCREEN_HEIGHT * 0.78, 720) : 480,
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1E293B',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    alignItems: 'center',
  },
  interactionHintText: {
    fontSize: 12,
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

