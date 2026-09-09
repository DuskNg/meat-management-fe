// meat-management-fe/src/components/ImagePreviewModal.js
import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  Modal,
  StyleSheet,
  View,
  Image,
  TouchableOpacity,
  Text,
  StatusBar,
  Platform,
  ScrollView,
} from 'react-native';
import { showGlobalToast } from '../store/toastStore';

/**
 * Component hiển thị ảnh phóng to toàn màn hình với các chức năng:
 * - Zoom in (+) / Zoom out (-) đa cấp độ từ 50% đến 400%.
 * - Cuộn chuột (Mouse Wheel) trực tiếp trên ảnh để zoom mượt mà.
 * - Nhấp đúp chuột (Double Click) để phóng to nhanh 2x hoặc trở về 100%.
 * - Nút 🔄 Xoay: Xoay ảnh 90° từng lần.
 * - Kéo di chuyển ảnh (Drag / Pan) bằng chuột hoặc cảm ứng đến bất kỳ vị trí nào khi đang zoom to.
 * - Nút ↺ Đặt lại: Đưa ảnh về lại chính giữa khung hình với tỷ lệ 100% ban đầu.
 * - Hỗ trợ tải ảnh / chia sẻ ảnh.
 */
const ImagePreviewModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  // State điều khiển Zoom, Kéo ảnh và Xoay ảnh
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef(null);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // Đặt lại zoom & vị trí về mặc định (100%, căn giữa)
  const resetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
    setIsDragging(false);
  };

  // Tự động căn chỉnh phóng to vừa vặn chiều ngang màn hình (hỗ trợ đọc rõ và chụp màn hình trên điện thoại)
  const applyAutoFitWidth = (targetUrl = imageUrl) => {
    if (typeof window === 'undefined' || !targetUrl) return;
    const img = document.createElement('img');
    img.src = targetUrl;
    img.onload = () => {
      const nw = img.naturalWidth || 800;
      const nh = img.naturalHeight || 1200;
      const screenW = window.innerWidth || 390;
      const screenH = window.innerHeight ? window.innerHeight - 90 : 650;
      const imgRatio = nw / nh;
      const screenRatio = screenW / screenH;
      if (imgRatio < screenRatio) {
        const fitScale = Math.min(3.5, Math.max(1.0, Math.round((screenRatio / imgRatio) * 100) / 100));
        setScale(fitScale);
        const scaledH = screenH * fitScale;
        const topOffset = (scaledH - screenH) / 2;
        setPosition({ x: 0, y: topOffset > 0 ? topOffset : 0 });
      } else {
        setScale(1);
        setPosition({ x: 0, y: 0 });
      }
    };
  };

  // Đặt lại zoom khi modal bị ẩn
  useEffect(() => {
    if (!visible) {
      resetZoom();
    }
  }, [visible]);

  // Phơi bày hàm điều khiển ra ngoài ref
  useImperativeHandle(ref, () => ({
    open: (url, options = {}) => {
      setImageUrl(url);
      setRotation(0);
      setIsDragging(false);
      setVisible(true);

      if (options && options.autoFitWidth) {
        applyAutoFitWidth(url);
        if (options.isCaptureMode) {
          showGlobalToast('📸 Đã mở full ảnh! Hãy chụp ảnh màn hình để lưu vào Thư viện ảnh.', 'info');
        }
      } else {
        setScale(1);
        setPosition({ x: 0, y: 0 });
      }
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

  // Phóng to ảnh (bước nhảy 25%, tối đa 400%)
  const handleZoomIn = () => {
    setScale((prev) => Math.min(4.0, Math.round((prev + 0.25) * 100) / 100));
  };

  // Thu nhỏ ảnh (bước nhảy 25%, tối thiểu 50%)
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

  // Xử lý kéo di chuyển bằng cảm ứng trên điện thoại / máy tính bảng (Touch Events)
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

  // Tải hoặc chia sẻ ảnh qua Web Share API
  const handleDownloadOrShare = async () => {
    if (!imageUrl) return;
    try {
      const sliceSize = 512;
      const base64Part = imageUrl.includes(',') ? imageUrl.split(',')[1] : imageUrl;
      const byteCharacters = atob(base64Part);
      const byteArrays = [];
      for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        const slice = byteCharacters.slice(offset, offset + sliceSize);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
        }
        byteArrays.push(new Uint8Array(byteNumbers));
      }
      const blob = new Blob(byteArrays, { type: 'image/png' });
      const fileName = `HoaDon_${Date.now()}.png`;

      const isMobileDevice = typeof navigator !== 'undefined' &&
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

      if (isMobileDevice && typeof navigator !== 'undefined' && navigator.share && typeof File !== 'undefined') {
        const file = new File([blob], fileName, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: 'Ảnh hóa đơn',
            });
            return;
          } catch (e) {
            if (e.name === 'AbortError') return;
          }
        }
      }

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      showGlobalToast('Đã tải ảnh về máy thành công!', 'success');
    } catch (err) {
      console.error('Lỗi khi tải/chia sẻ ảnh:', err);
      showGlobalToast('Đã xảy ra lỗi khi tải ảnh.', 'error');
    }
  };

  if (!imageUrl) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
    >
      <StatusBar hidden={visible} backgroundColor="#000000" barStyle="light-content" />

      <View style={styles.container}>
        {/* THANH CÔNG CỤ ĐIỀU KHIỂN TRÊN CÙNG */}
        <View style={styles.topBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.leftScrollView}
            contentContainerStyle={styles.zoomControlsGroup}
          >
            <TouchableOpacity
              style={styles.controlButton}
              onPress={handleZoomOut}
              activeOpacity={0.7}
              title="Thu nhỏ (-)"
            >
              <Text style={styles.controlButtonText}>−</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.zoomTextBadge}
              onPress={resetZoom}
              activeOpacity={0.7}
              title="Nhấp để về 100%"
            >
              <Text style={styles.zoomPercentText}>{Math.round(scale * 100)}%</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlButton}
              onPress={handleZoomIn}
              activeOpacity={0.7}
              title="Phóng to (+)"
            >
              <Text style={styles.controlButtonText}>+</Text>
            </TouchableOpacity>

            {/* Nút Vừa ngang để chụp ảnh rõ nét */}
            <TouchableOpacity
              style={styles.toolButton}
              onPress={() => applyAutoFitWidth(imageUrl)}
              activeOpacity={0.7}
              title="Phóng to tràn ngang để chụp màn hình rõ nét"
            >
              <Text style={styles.toolButtonText}>📱 Vừa ngang</Text>
            </TouchableOpacity>

            {/* Nút Xoay ảnh 90 độ */}
            <TouchableOpacity
              style={styles.toolButton}
              onPress={handleRotate}
              activeOpacity={0.7}
              title="Xoay ảnh 90°"
            >
              <Text style={styles.toolButtonText}>🔄 Xoay</Text>
            </TouchableOpacity>

            {/* Nút Đặt lại vị trí ban đầu */}
            <TouchableOpacity
              style={styles.toolButton}
              onPress={resetZoom}
              activeOpacity={0.7}
              title="Đưa ảnh về giữa 100%"
            >
              <Text style={styles.toolButtonText}>↺ Đặt lại</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Nhóm nút bên phải: Cố định luôn hiển thị trọn vẹn, không bị đẩy ra ngoài */}
          <View style={styles.topRightActions}>
            <TouchableOpacity
              style={styles.shareButton}
              onPress={handleDownloadOrShare}
              activeOpacity={0.8}
            >
              <Text style={styles.shareButtonText}>
                {typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
                  ? '📲 Lưu / Gửi'
                  : '💾 Tải ảnh'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClose}
              activeOpacity={0.7}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* KHUNG HIỂN THỊ HÌNH ẢNH CÓ HỖ TRỢ ZOOM VÀ KÉO DI CHUYỂN */}
        <View
          ref={containerRef}
          style={styles.imageViewerBox}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDoubleClick={handleDoubleClick}
        >
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
                cursor: isDragging ? 'grabbing' : (scale > 1 ? 'grab' : 'grab'),
              },
            ]}
          >
            <Image
              source={{ uri: imageUrl }}
              style={styles.mainImage}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* DÒNG HƯỚNG DẪN Ở ĐÁY MÀN HÌNH */}
        <View style={styles.bottomHintBar}>
          <Text style={styles.bottomHintText}>
            💡 Mẹo: Nhấp đúp để phóng to • Cuộn chuột để zoom • Nhấn giữ chuột kéo để di chuyển ảnh
          </Text>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
    zIndex: 999999,
    elevation: 999999,
    display: 'flex',
    flexDirection: 'column',
    ...Platform.select({
      web: { userSelect: 'none' },
    }),
  },
  topBar: {
    height: 54,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    zIndex: 10,
  },
  leftScrollView: {
    flex: 1,
    marginRight: 6,
  },
  zoomControlsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  controlButton: {
    width: 32,
    height: 32,
    borderRadius: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  controlButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    lineHeight: 20,
  },
  zoomTextBadge: {
    minWidth: 46,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomPercentText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  toolButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  toolButtonText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '600',
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  shareButton: {
    backgroundColor: '#059669',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
    lineHeight: 18,
  },
  imageViewerBox: {
    flex: 1,
    width: '100%',
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
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
  bottomHintBar: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomHintText: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
  },
});

export default ImagePreviewModal;
