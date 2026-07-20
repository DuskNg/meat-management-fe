// meat-management-fe/src/components/ImagePreviewModal.js
import React, { useState, forwardRef, useImperativeHandle } from 'react';
import {
  Modal,
  StyleSheet,
  View,
  Image,
  TouchableOpacity,
  Text,
  Dimensions,
  TouchableWithoutFeedback,
  StatusBar,
  Platform,
} from 'react-native';

const { width, height } = Dimensions.get('window');

/**
 * Component hiển thị ảnh đối chiếu phóng to toàn màn hình.
 * Hỗ trợ đóng khi chạm vào bất kỳ đâu trên màn hình hoặc bấm nút đóng.
 */
const ImagePreviewModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  // Định nghĩa các hàm điều khiển modal để component cha gọi
  useImperativeHandle(ref, () => ({
    open: (url) => {
      setImageUrl(url);
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
  }));

  if (!imageUrl) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setVisible(false)}
    >
      {/* Ẩn thanh trạng thái khi xem ảnh toàn màn hình để tối ưu diện tích */}
      <StatusBar hidden={visible} backgroundColor="black" barStyle="light-content" />
      
      <TouchableWithoutFeedback onPress={() => setVisible(false)}>
        <View style={styles.container}>
          {/* Vùng chứa ảnh */}
          <TouchableWithoutFeedback>
            <View style={styles.imageWrapper}>
              <Image
                source={{ uri: imageUrl }}
                style={styles.image}
                resizeMode="contain"
              />
            </View>
          </TouchableWithoutFeedback>

          {/* Nút đóng ở góc trên bên phải */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setVisible(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000', // Đặt nền đen hoàn toàn để tôn lên ảnh đối chiếu
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageWrapper: {
    width: width,
    height: height,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 30,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
});

export default ImagePreviewModal;
