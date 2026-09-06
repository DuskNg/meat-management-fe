// meat-management-fe/src/components/ImagePreviewModal.js
import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  Modal,
  StyleSheet,
  View,
  Image,
  TouchableOpacity,
  Text,
  useWindowDimensions,
  ScrollView,
  StatusBar,
  Platform,
} from 'react-native';

/**
 * Component hiển thị ảnh phóng to toàn màn hình với các chức năng:
 * - Zoom in (+) / Zoom out (-) đa cấp độ (0.5x -> 3.0x).
 * - Chuyển đổi giữa chế độ Vừa chiều rộng (đọc rõ văn bản, cuộn dọc) và Vừa màn hình (xem toàn cảnh).
 * - Chạm / Nhấp đúp vào ảnh để phóng to nhanh.
 * - Hỗ trợ cuộn mượt mà theo cả 2 trục (dọc và ngang).
 * - Nút đóng tiện lợi, lớp hiển thị cao nhất (zIndex 999999).
 */
const ImagePreviewModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [fitMode, setFitMode] = useState('width'); // 'width' (vừa chiều ngang) hoặc 'contain' (vừa màn hình)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  const { width: winWidth, height: winHeight } = useWindowDimensions();

  // Định nghĩa các hàm điều khiển modal để component cha gọi thông qua ref
  useImperativeHandle(ref, () => ({
    open: (url) => {
      setImageUrl(url);
      setZoomLevel(1);
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Khi mở ảnh mới, lấy kích thước thực tế của ảnh để tính tỉ lệ hiển thị tối ưu
  useEffect(() => {
    if (imageUrl) {
      setZoomLevel(1);
      Image.getSize(
        imageUrl,
        (w, h) => {
          setImageSize({ width: w, height: h });
          // Nếu ảnh dạng tài liệu dài (cao hơn rộng nhiều), mặc định vừa chiều ngang để đọc chữ to
          if (h > w * 1.3) {
            setFitMode('width');
          } else {
            setFitMode('contain');
          }
        },
        () => {
          setImageSize({ width: 0, height: 0 });
          setFitMode('width');
        }
      );
    }
  }, [imageUrl]);

  // Xử lý tăng tỉ lệ phóng to
  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(3.0, Math.round((prev + 0.25) * 100) / 100));
  };

  // Xử lý giảm tỉ lệ phóng to
  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(0.5, Math.round((prev - 0.25) * 100) / 100));
  };

  // Xử lý bật/tắt phóng to nhanh khi nhấp vào ảnh
  const handleToggleZoom = () => {
    if (zoomLevel === 1) {
      setZoomLevel(1.75);
    } else {
      setZoomLevel(1);
    }
  };

  // Chuyển đổi giữa chế độ Vừa chiều rộng và Vừa toàn màn hình
  const toggleFitMode = () => {
    setFitMode((prev) => (prev === 'width' ? 'contain' : 'width'));
    setZoomLevel(1);
  };

  // Tải hoặc chia sẻ ảnh qua Web Share API (hỗ trợ lưu trực tiếp vào Thư viện ảnh hoặc gửi qua Zalo trên iPhone/Android)
  const handleDownloadOrShare = async () => {
    if (!imageUrl) return;
    try {
      const sliceSize = 512;
      const byteCharacters = atob(imageUrl.split(',')[1]);
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
      const fileName = `CongNo_${Date.now()}.png`;

      // Kiểm tra xem có phải điện thoại / máy tính bảng hay không
      const isMobileDevice = typeof navigator !== 'undefined' && 
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

      // CHỈ dùng Web Share API trên thiết bị Điện thoại (để lưu vào Photos hoặc gửi Zalo)
      // Trên PC / Laptop: Tải trực tiếp file về máy tính
      if (isMobileDevice && typeof navigator !== 'undefined' && navigator.share && typeof File !== 'undefined') {
        const file = new File([blob], fileName, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: 'Bảng công nợ',
            });
            return;
          } catch (e) {
            if (e.name === 'AbortError') return;
          }
        }
      }

      // Phương thức tải file truyền thống nếu không hỗ trợ Web Share API
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
    } catch (err) {
      console.error('Lỗi khi tải/chia sẻ ảnh:', err);
      alert('Đã xảy ra lỗi khi tải ảnh. Bạn có thể nhấn giữ vào ảnh và chọn "Lưu hình ảnh".');
    }
  };

  if (!imageUrl) return null;

  // Tính toán kích thước hiển thị của ảnh dựa trên kích thước màn hình, kích thước ảnh và tỉ lệ zoom
  const aspectRatio = imageSize.width > 0 && imageSize.height > 0
    ? imageSize.height / imageSize.width
    : 1.5;

  let displayWidth = winWidth;
  let displayHeight = winWidth * aspectRatio;

  const usableHeight = Math.max(300, winHeight - 120);

  if (fitMode === 'contain') {
    // Co ảnh lại để nằm trọn trong khung màn hình
    const scaleToFit = Math.min((winWidth - 24) / (imageSize.width || winWidth), usableHeight / (imageSize.height || usableHeight));
    displayWidth = Math.max(100, (imageSize.width || winWidth) * scaleToFit * zoomLevel);
    displayHeight = Math.max(100, (imageSize.height || usableHeight) * scaleToFit * zoomLevel);
  } else {
    // Vừa chiều ngang: trên máy tính mở rộng thoải mái theo kích thước màn hình để chữ to và rõ nhất, trên điện thoại vừa khít chiều rộng
    const baseWidth = Platform.OS === 'web' ? Math.min(winWidth - 32, Math.max(1200, (imageSize.width ? Math.min(imageSize.width, winWidth - 32) : winWidth * 0.9))) : winWidth;
    displayWidth = baseWidth * zoomLevel;
    displayHeight = displayWidth * aspectRatio;
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setVisible(false)}
    >
      <StatusBar hidden={visible} backgroundColor="#000000" barStyle="light-content" />

      <View style={styles.container}>
        {/* THANH CÔNG CỤ ĐIỀU KHIỂN Ở TRÊN CÙNG */}
        <View style={styles.topBar}>
          <View style={styles.zoomControlsGroup}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={handleZoomOut}
              activeOpacity={0.7}
            >
              <Text style={styles.controlButtonText}>−</Text>
            </TouchableOpacity>

            <View style={styles.zoomTextBadge}>
              <Text style={styles.zoomPercentText}>{Math.round(zoomLevel * 100)}%</Text>
            </View>

            <TouchableOpacity
              style={styles.controlButton}
              onPress={handleZoomIn}
              activeOpacity={0.7}
            >
              <Text style={styles.controlButtonText}>+</Text>
            </TouchableOpacity>

            {/* Nút chuyển chế độ Vừa rộng / Toàn màn hình */}
            <TouchableOpacity
              style={[
                styles.modeToggleButton,
                fitMode === 'width' ? styles.modeToggleActive : null,
              ]}
              onPress={toggleFitMode}
              activeOpacity={0.7}
            >
              <Text style={styles.modeToggleText}>
                {fitMode === 'width' ? '↔ Vừa ngang' : '⛶ Toàn cảnh'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Nhóm nút bên phải: Nút Lưu/Gửi và Nút Đóng */}
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
              onPress={() => setVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* VÙNG CUỘN ĐA CHIỀU HIỂN THỊ ẢNH */}
        <ScrollView
          style={styles.scrollVertical}
          contentContainerStyle={styles.scrollVerticalContent}
          showsVerticalScrollIndicator={true}
          maximumZoomScale={Platform.OS === 'ios' ? 4 : undefined}
          minimumZoomScale={Platform.OS === 'ios' ? 0.5 : undefined}
        >
          <ScrollView
            horizontal
            style={styles.scrollHorizontal}
            contentContainerStyle={styles.scrollHorizontalContent}
            showsHorizontalScrollIndicator={true}
          >
            <TouchableOpacity
              activeOpacity={0.95}
              onPress={handleToggleZoom}
              style={[
                styles.imageTouchable,
                {
                  cursor: Platform.OS === 'web' ? (zoomLevel > 1 ? 'zoom-out' : 'zoom-in') : undefined,
                },
              ]}
            >
              <Image
                source={{ uri: imageUrl }}
                style={{
                  width: displayWidth,
                  height: displayHeight,
                  userSelect: 'auto',
                }}
                resizeMode="contain"
                onLoad={(e) => {
                  try {
                    const w = e?.nativeEvent?.source?.width || e?.target?.naturalWidth || e?.nativeEvent?.target?.naturalWidth;
                    const h = e?.nativeEvent?.source?.height || e?.target?.naturalHeight || e?.nativeEvent?.target?.naturalHeight;
                    if (w && h) {
                      setImageSize({ width: w, height: h });
                    }
                  } catch (err) {
                    // Bỏ qua nếu không parse được kích thước từ sự kiện
                  }
                }}
              />
            </TouchableOpacity>
          </ScrollView>
        </ScrollView>

        {/* DÒNG HƯỚNG DẪN Ở ĐÁY MÀN HÌNH */}
        <View style={styles.bottomHintBar}>
          <Text style={styles.bottomHintText}>
            💡 Nhấn giữ vào ảnh để chọn "Lưu hình ảnh" vào Thư viện ảnh • Chạm để phóng to
          </Text>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19', // Nền tối hiện đại làm nổi bật ảnh
    zIndex: 999999,
    elevation: 999999,
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    zIndex: 10,
  },
  zoomControlsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  controlButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    lineHeight: 22,
  },
  zoomTextBadge: {
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomPercentText: {
    color: '#38BDF8', // Xanh dương sáng
    fontSize: 13,
    fontWeight: '700',
  },
  modeToggleButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    marginLeft: 4,
  },
  modeToggleActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.25)',
    borderColor: '#38BDF8',
  },
  modeToggleText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shareButton: {
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: 'bold',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.8)', // Đỏ mờ nổi bật
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  scrollVertical: {
    flex: 1,
  },
  scrollVerticalContent: {
    minHeight: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  scrollHorizontal: {
    flexGrow: 0,
  },
  scrollHorizontalContent: {
    minWidth: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  imageTouchable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomHintBar: {
    paddingVertical: 8,
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
