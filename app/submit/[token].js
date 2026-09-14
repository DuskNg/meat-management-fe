// meat-management-fe/app/submit/[token].js
import React, { useState, useEffect, useRef } from 'react';
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
  Modal,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api } from '../../src/api/client';
import { showGlobalToast } from '../../src/store/toastStore';
import DatePickerInput from '../../src/components/DatePickerInput';
import ImagePreviewModal from '../../src/components/ImagePreviewModal';

// Helper nén ảnh bằng HTML5 Canvas trên trình duyệt trước khi upload
const compressImageClient = (file, maxWidth = 1800, quality = 0.85) => {
  return new Promise((resolve) => {
    if (!file || !file.type?.startsWith('image/')) {
      return resolve(null);
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new window.Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      img.onerror = () => resolve(event.target.result);
    };
    reader.onerror = () => resolve(null);
  });
};

// Helper sinh ảnh thumbnail thực tế từ frame đầu tiên của Video
const generateVideoThumbnail = (file) => {
  return new Promise((resolve) => {
    try {
      if (typeof document === 'undefined') return resolve(null);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      const url = URL.createObjectURL(file);
      video.src = url;

      let isResolved = false;

      const captureFrame = () => {
        if (isResolved) return;
        isResolved = true;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(video.videoWidth || 320, 480);
          canvas.height = Math.min(video.videoHeight || 240, 360);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumb = canvas.toDataURL('image/jpeg', 0.85);
          URL.revokeObjectURL(url);
          resolve(thumb);
        } catch (e) {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };

      video.onloadeddata = () => {
        video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
      };

      video.onseeked = () => {
        captureFrame();
      };

      video.onerror = () => {
        if (!isResolved) {
          isResolved = true;
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };

      setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          URL.revokeObjectURL(url);
          resolve(null);
        }
      }, 2500);
    } catch {
      resolve(null);
    }
  });
};

// Component hiển thị khung hình Video thực tế (thay cho icon mặc định)
const VideoThumbPreview = ({ file }) => {
  const [thumbSrc, setThumbSrc] = useState(file.thumbUrl || null);

  useEffect(() => {
    if (!thumbSrc && file.fileData && typeof document !== 'undefined') {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      v.playsInline = true;
      v.src = file.blobUrl || file.fileData;
      v.onloadeddata = () => {
        v.currentTime = 0.5;
      };
      v.onseeked = () => {
        try {
          const c = document.createElement('canvas');
          c.width = Math.min(v.videoWidth || 320, 480);
          c.height = Math.min(v.videoHeight || 240, 360);
          const ctx = c.getContext('2d');
          ctx.drawImage(v, 0, 0, c.width, c.height);
          setThumbSrc(c.toDataURL('image/jpeg', 0.8));
        } catch (e) {}
      };
    }
  }, [file]);

  return (
    <View style={styles.videoThumbWrap}>
      {thumbSrc ? (
        <Image source={{ uri: thumbSrc }} style={styles.thumbImage} resizeMode="cover" />
      ) : typeof window !== 'undefined' ? (
        <video
          src={file.blobUrl || file.fileData}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            pointerEvents: 'none',
            backgroundColor: '#0F172A',
          }}
          muted
          playsInline
          preload="metadata"
        />
      ) : (
        <View style={styles.thumbVideoFallback}>
          <Text style={{ fontSize: 22 }}>🎬</Text>
        </View>
      )}

      {/* Lớp phủ nút Play sắc nét ở giữa */}
      <View style={styles.videoPlayOverlay}>
        <View style={styles.videoPlayCircle}>
          <Text style={styles.videoPlayTriangle}>▶</Text>
        </View>
      </View>

      {/* Badge nhãn VIDEO góc dưới */}
      <View style={styles.videoBadgeTag}>
        <Text style={styles.videoBadgeTagText}>VIDEO</Text>
      </View>
    </View>
  );
};

export default function StaffSubmitScreen() {
  const { token } = useLocalSearchParams();

  // State thông tin link
  const [linkInfo, setLinkInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State mã PIN (nếu link yêu cầu)
  const [pin, setPin] = useState('');
  const [isPinVerified, setIsPinVerified] = useState(false);
  const [verifyingPin, setVerifyingPin] = useState(false);

  // Ngày trên hóa đơn (Mặc định hôm nay)
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    return `${d}/${m}/${y}`;
  });

  // Danh sách tệp đã chọn từ thư viện
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Lịch sử gửi trong ngày của nhóm
  const [historySubmissions, setHistorySubmissions] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Modal phóng to / thu nhỏ / xoay ảnh chuyên dụng
  const imagePreviewModalRef = useRef(null);

  // State phát video khi chạm vào tệp video
  const [previewVideoUrl, setPreviewVideoUrl] = useState(null);

  const mediaInputRef = useRef(null);

  // Mở phóng to ảnh (có zoom, pan, xoay) hoặc mở video
  const handlePreviewMedia = (url, fileType) => {
    if (!url) return;
    if (fileType === 'VIDEO') {
      setPreviewVideoUrl(url);
    } else {
      imagePreviewModalRef.current?.open(url, { autoFitWidth: true });
    }
  };

  // Tải thông tin link từ Backend
  const fetchLinkInfo = async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/staff-submissions/public/info/${token}`);
      if (res.data.success) {
        setLinkInfo(res.data.data);
        if (!res.data.data.hasPin) {
          setIsPinVerified(true);
        }
      }
    } catch (err) {
      console.error('Lỗi khi tải thông tin link nhân viên:', err);
      setError(err.response?.data?.message || 'Đường dẫn không tồn tại hoặc đã hết hiệu lực.');
    } finally {
      setLoading(false);
    }
  };

  // Tải lịch sử gửi trong ngày
  const fetchHistory = async () => {
    if (!token) return;
    try {
      setLoadingHistory(true);
      const res = await api.get(`/staff-submissions/public/history/${token}`);
      if (res.data.success) {
        setHistorySubmissions(res.data.data || []);
      }
    } catch (err) {
      console.warn('Lỗi khi tải lịch sử:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchLinkInfo();
  }, [token]);

  useEffect(() => {
    if (isPinVerified) {
      fetchHistory();
    }
  }, [isPinVerified]);

  // Xử lý xác thực mã PIN nếu có
  const handleVerifyPin = async () => {
    if (!pin.trim()) {
      showGlobalToast('Vui lòng nhập mã PIN bảo mật.', 'warning');
      return;
    }
    try {
      setVerifyingPin(true);
      const res = await api.post(`/staff-submissions/public/verify-pin/${token}`, { pin: pin.trim() });
      if (res.data.success) {
        setIsPinVerified(true);
        showGlobalToast('Xác thực mã PIN thành công.', 'success');
      }
    } catch (err) {
      showGlobalToast(err.response?.data?.message || 'Mã PIN không chính xác.', 'error');
    } finally {
      setVerifyingPin(false);
    }
  };

  // Xử lý chọn nhiều ảnh và video từ thư viện máy
  const handleMediaChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    showGlobalToast(`Đang tải và chuẩn bị ${files.length} tệp...`, 'info');

    const processedFiles = [];
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        try {
          const base64Data = await compressImageClient(file);
          if (base64Data) {
            processedFiles.push({
              id: `${Date.now()}_${Math.random()}`,
              name: file.name,
              fileType: 'IMAGE',
              fileData: base64Data,
              sizeStr: `${Math.round(file.size / 1024)} KB`,
            });
          }
        } catch (err) {
          console.error('Lỗi khi nén ảnh:', err);
        }
      } else if (file.type.startsWith('video/')) {
        let thumbUrl = null;
        let blobUrl = null;
        try {
          if (typeof URL !== 'undefined' && URL.createObjectURL) {
            blobUrl = URL.createObjectURL(file);
          }
          thumbUrl = await generateVideoThumbnail(file);
        } catch (e) {
          console.warn('Không thể tạo thumbnail video:', e);
        }

        await new Promise((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = (event) => {
            processedFiles.push({
              id: `${Date.now()}_${Math.random()}`,
              name: file.name,
              fileType: 'VIDEO',
              fileData: event.target.result,
              blobUrl: blobUrl || event.target.result,
              thumbUrl: thumbUrl || null,
              sizeStr: `${Math.round(file.size / (1024 * 1024))} MB`,
            });
            resolve();
          };
          reader.onerror = () => resolve();
        });
      }
    }

    setSelectedFiles((prev) => [...prev, ...processedFiles]);
    if (mediaInputRef.current) mediaInputRef.current.value = '';
  };

  // Xóa 1 file khỏi danh sách chọn
  const handleRemoveFile = (id) => {
    setSelectedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // Gửi toàn bộ hóa đơn / video lên: Lưu trữ trước -> Bắn thông báo thành công ngay -> AI chạy ngầm
  const handleSubmit = async () => {
    if (selectedFiles.length === 0) {
      showGlobalToast('Vui lòng chọn ít nhất 1 ảnh hóa đơn hoặc video.', 'warning');
      return;
    }

    const countToSend = selectedFiles.length;

    try {
      setUploading(true);
      setUploadProgress(25);

      // Chuẩn bị ngày theo định dạng YYYY-MM-DD
      const [d, m, y] = selectedDate.split('/');
      const isoDate = `${y}-${m}-${d}`;

      const payload = {
        senderName: 'Nhân viên',
        note: '',
        date: isoDate,
        files: selectedFiles.map((f) => ({
          fileData: f.fileData,
          fileType: f.fileType,
          fileName: f.name,
        })),
      };

      setUploadProgress(60);
      const res = await api.post(`/staff-submissions/public/submit/${token}`, payload);
      setUploadProgress(100);

      if (res.data.success) {
        setSelectedFiles([]);
        showGlobalToast(`🎉 Đã lưu ${countToSend} tệp thành công! Hệ thống đang tự động đọc dữ liệu ngầm.`, 'success');
        fetchHistory();
      }
    } catch (err) {
      console.error('Lỗi khi gửi hóa đơn:', err);
      showGlobalToast(err.response?.data?.message || 'Không thể gửi hóa đơn. Vui lòng kiểm tra lại kết nối mạng.', 'error');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Màn hình đang tải thông tin link
  if (loading) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Đang tải trang gửi hóa đơn...</Text>
      </View>
    );
  }

  // Màn hình lỗi link không tồn tại hoặc bị khóa
  if (error || !linkInfo) {
    return (
      <View style={styles.centerBox}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>Không thể truy cập</Text>
        <Text style={styles.errorDesc}>{error || 'Đường dẫn gửi hóa đơn không hợp lệ.'}</Text>
      </View>
    );
  }

  // Màn hình nhập mã PIN nếu có
  if (!isPinVerified) {
    return (
      <View style={styles.centerBox}>
        <View style={styles.pinCard}>
          <Text style={styles.pinCardIcon}>🔒</Text>
          <Text style={styles.pinCardTitle}>{linkInfo.name}</Text>
          <Text style={styles.pinCardSub}>Cửa hàng: {linkInfo.ownerName}</Text>
          <Text style={styles.pinCardDesc}>Vui lòng nhập mã PIN do chủ buôn cung cấp:</Text>

          <TextInput
            style={styles.pinInput}
            value={pin}
            onChangeText={setPin}
            placeholder="Nhập mã PIN..."
            placeholderTextColor="#94A3B8"
            keyboardType="number-pad"
            secureTextEntry={true}
            maxLength={10}
            onSubmitEditing={handleVerifyPin}
          />

          <TouchableOpacity
            style={[styles.btnVerifyPin, verifyingPin && { opacity: 0.6 }]}
            onPress={handleVerifyPin}
            disabled={verifyingPin}
            activeOpacity={0.8}
          >
            {verifyingPin ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.btnVerifyPinText}>XÁC NHẬN MÃ PIN</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.innerWrapper}>
        {/* ─── TIÊU ĐỀ GỌN GÀNG ─── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Gửi hóa đơn trong ngày</Text>
        </View>

        {/* ─── KHỐI THAO TÁC CỐT LÕI (CHỌN NGÀY & ĐĂNG ẢNH/VIDEO) ─── */}
        <View style={styles.card}>
          {/* Ô chọn ngày thu gọn (dense), không lãng phí diện tích */}
          <View style={styles.datePickerWrap}>
            <DatePickerInput
              value={selectedDate}
              onChange={setSelectedDate}
              dense={true}
              placeholder="DD/MM/YYYY"
            />
          </View>

          {/* Thẻ input ẩn cho Web */}
          {Platform.OS === 'web' && (
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              ref={mediaInputRef}
              style={{ display: 'none' }}
              onChange={handleMediaChange}
            />
          )}

          <TouchableOpacity
            style={styles.btnPickMediaMain}
            onPress={() => {
              if (Platform.OS === 'web' && mediaInputRef.current) {
                mediaInputRef.current.click();
              }
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.pickMediaIcon}>📸 🎬</Text>
            <Text style={styles.pickMediaTitle}>ĐĂNG ẢNH / VIDEO</Text>
            <Text style={styles.pickMediaSub}>Chạm để chọn nhiều ảnh hoặc video từ thư viện máy</Text>
          </TouchableOpacity>

          {/* DANH SÁCH ẢNH / VIDEO ĐÃ CHỌN (XEM TRƯỚC DẠNG LƯỚI) */}
          {selectedFiles.length > 0 && (
            <View style={styles.previewSection}>
              <View style={styles.previewHeaderRow}>
                <Text style={styles.previewHeaderTitle}>
                  Đã chọn <Text style={{ fontWeight: 'bold', color: '#059669' }}>{selectedFiles.length}</Text> tệp:
                </Text>
                <TouchableOpacity onPress={() => setSelectedFiles([])}>
                  <Text style={styles.btnClearAll}>Xóa tất cả</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.thumbGrid}>
                {selectedFiles.map((file, index) => (
                  <View key={file.id} style={styles.thumbBox}>
                    <TouchableOpacity
                      style={{ width: '100%', height: '100%' }}
                      activeOpacity={0.85}
                      onPress={() => handlePreviewMedia(file.blobUrl || file.fileData, file.fileType)}
                    >
                      {file.fileType === 'VIDEO' ? (
                        <VideoThumbPreview file={file} />
                      ) : (
                        <Image source={{ uri: file.fileData }} style={styles.thumbImage} resizeMode="cover" />
                      )}
                    </TouchableOpacity>

                    {/* Nút xóa ảnh đã chọn nhầm */}
                    <TouchableOpacity
                      style={styles.btnRemoveThumb}
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        handleRemoveFile(file.id);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.btnRemoveThumbText}>✕</Text>
                    </TouchableOpacity>

                    <Text style={styles.thumbIndexBadge}>#{index + 1}</Text>
                  </View>
                ))}
              </View>

              {/* NÚT GỬI LÊN CHO CHỦ BUÔN */}
              <TouchableOpacity
                style={[styles.btnSendSubmit, uploading && styles.btnSendSubmitDisabled]}
                onPress={handleSubmit}
                disabled={uploading}
                activeOpacity={0.85}
              >
                {uploading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <Text style={styles.btnSendSubmitText}>Đang gửi ({uploadProgress}%)...</Text>
                  </View>
                ) : (
                  <Text style={styles.btnSendSubmitText}>
                    🚀 Gửi {selectedFiles.length} hóa đơn
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ─── 3. LỊCH SỬ HÓA ĐƠN ĐÃ GỬI HÔM NAY ─── */}
        <View style={styles.card}>
          <View style={styles.historyHeaderRow}>
            <Text style={styles.historyTitle}>📋 Đã gửi hôm nay ({historySubmissions.length})</Text>
            <TouchableOpacity onPress={fetchHistory} disabled={loadingHistory}>
              <Text style={styles.btnReloadHistory}>{loadingHistory ? 'Đang tải...' : '🔄 Làm mới'}</Text>
            </TouchableOpacity>
          </View>

          {historySubmissions.length === 0 ? (
            <Text style={styles.historyEmptyText}>Chưa có hóa đơn nào được gửi trong ngày hôm nay.</Text>
          ) : (
            <View style={styles.historyList}>
              {historySubmissions.map((item, idx) => {
                const statusMap = {
                  PENDING: { label: '💾 Đã lưu • AI đang đọc ngầm...', color: '#B45309', bg: '#FEF3C7' },
                  ANALYZING: { label: '🤖 AI đang bóc tách số kg...', color: '#1D4ED8', bg: '#DBEAFE' },
                  READY_FOR_REVIEW: { label: '📋 Chờ chủ duyệt', color: '#047857', bg: '#D1FAE5' },
                  APPROVED: { label: '✅ Đã lên sổ nợ', color: '#059669', bg: '#ECFDF5' },
                  REJECTED: { label: '❌ Bỏ qua', color: '#B91C1C', bg: '#FEE2E2' },
                };
                const s = statusMap[item.status] || statusMap.PENDING;

                return (
                  <View key={item.id || idx} style={styles.historyRow}>
                    <TouchableOpacity
                      style={styles.historyThumbBox}
                      activeOpacity={0.8}
                      onPress={() => handlePreviewMedia(item.fileUrl, item.fileType)}
                    >
                      {item.fileType === 'VIDEO' ? (
                        <View style={styles.historyVideoThumbWrap}>
                          {typeof window !== 'undefined' && item.fileUrl ? (
                            <video
                              src={item.fileUrl}
                              poster={item.fileUrl?.replace(/\.(mp4|mov|avi|webm)$/i, '.jpg')}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                pointerEvents: 'none',
                                backgroundColor: '#0F172A',
                              }}
                              muted
                              playsInline
                              preload="metadata"
                            />
                          ) : (
                            <View style={styles.historyVideoPlaceholder}>
                              <Text style={{ fontSize: 18 }}>🎬</Text>
                            </View>
                          )}
                          <View style={styles.historyPlayBadge}>
                            <Text style={{ color: '#FFFFFF', fontSize: 9 }}>▶</Text>
                          </View>
                        </View>
                      ) : (
                        <Image source={{ uri: item.fileUrl }} style={styles.historyThumbImg} resizeMode="cover" />
                      )}
                    </TouchableOpacity>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyTime}>
                        🕒 {new Date(item.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <Text style={styles.historyDate}>
                        Ngày: {new Date(item.date).toLocaleDateString('vi-VN')}
                      </Text>
                    </View>

                    <View style={[styles.historyBadge, { backgroundColor: s.bg }]}>
                      <Text style={[styles.historyBadgeText, { color: s.color }]}>{s.label}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </View>

      {/* ─── MODAL PHÓNG TO / THU NHỎ / XOAY ẢNH CHUYÊN DỤNG ─── */}
      <ImagePreviewModal ref={imagePreviewModalRef} />

      {/* ─── MODAL PHÁT VIDEO ĐẦY ĐỦ ─── */}
      <Modal
        visible={!!previewVideoUrl}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPreviewVideoUrl(null)}
      >
        <View style={styles.previewModalOverlay}>
          <View style={styles.previewModalContent}>
            <View style={styles.previewModalHeader}>
              <Text style={styles.previewModalTitle} numberOfLines={1}>
                🎥 Video cân thịt
              </Text>
              <TouchableOpacity
                style={styles.btnClosePreviewModal}
                onPress={() => setPreviewVideoUrl(null)}
                activeOpacity={0.7}
              >
                <Text style={styles.btnClosePreviewModalText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.previewModalBody}>
              {typeof window !== 'undefined' && previewVideoUrl ? (
                <video
                  src={previewVideoUrl}
                  controls
                  autoPlay
                  playsInline
                  style={{
                    width: '100%',
                    maxHeight: '75vh',
                    borderRadius: 10,
                    backgroundColor: '#000000',
                  }}
                />
              ) : (
                <Text style={{ color: '#FFFFFF' }}>Không hỗ trợ phát video trên thiết bị này</Text>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF', // Toàn bộ màn hình nền trắng sáng tinh tế
  },
  contentContainer: {
    paddingTop: 10,
    paddingBottom: 24,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  innerWrapper: {
    width: '100%',
    maxWidth: 520,
  },
  centerBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 6,
  },
  errorDesc: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Khung nhập PIN (nếu có)
  pinCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
  },
  pinCardIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  pinCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  pinCardSub: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 12,
  },
  pinCardDesc: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  pinInput: {
    width: '100%',
    height: 48,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    paddingHorizontal: 16,
    fontSize: 18,
    textAlign: 'center',
    color: '#0F172A',
    fontWeight: 'bold',
    letterSpacing: 4,
    marginBottom: 16,
  },
  btnVerifyPin: {
    width: '100%',
    height: 46,
    backgroundColor: '#059669',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnVerifyPinText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // Header gọn nhẹ
  header: {
    marginBottom: 8,
    alignItems: 'center',
    paddingVertical: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  headerOwner: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
  },

  // Card trắng sạch sẽ gọn gàng
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
  },
  datePickerWrap: {
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
  },

  // Nút chính: ĐĂNG ẢNH / VIDEO (Một nút duy nhất, rõ ràng, chiều cao vừa vặn)
  btnPickMediaMain: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#86EFAC',
    borderRadius: 10,
    paddingVertical: 18,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  pickMediaIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  pickMediaTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  pickMediaSub: {
    fontSize: 12,
    color: '#059669',
    textAlign: 'center',
  },

  // Xem trước ảnh đã chọn
  previewSection: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  previewHeaderTitle: {
    fontSize: 13.5,
    color: '#334155',
  },
  btnClearAll: {
    fontSize: 12.5,
    color: '#EF4444',
    fontWeight: '600',
  },
  thumbGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  thumbBox: {
    position: 'relative',
    width: 76,
    height: 76,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbVideo: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EDE9FE',
  },
  thumbVideoBadge: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#7C3AED',
    marginTop: 2,
  },
  btnRemoveThumb: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  btnRemoveThumbText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
    lineHeight: 12,
  },
  thumbIndexBadge: {
    position: 'absolute',
    bottom: 3,
    left: 3,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 'bold',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },

  // Nút gửi hóa đơn
  btnSendSubmit: {
    backgroundColor: '#059669',
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)',
  },
  btnSendSubmitDisabled: {
    opacity: 0.6,
  },
  btnSendSubmitText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Lịch sử hôm nay
  historyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  btnReloadHistory: {
    fontSize: 12.5,
    color: '#059669',
    fontWeight: '600',
  },
  historyEmptyText: {
    fontSize: 12.5,
    color: '#94A3B8',
    textAlign: 'center',
    paddingVertical: 14,
    fontStyle: 'italic',
  },
  historyList: {
    gap: 8,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    gap: 10,
  },
  historyThumbBox: {
    width: 44,
    height: 44,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
  },
  historyThumbImg: {
    width: '100%',
    height: '100%',
  },
  historyVideoPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F3FF',
  },
  historyTime: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
  },
  historyDate: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  historyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  historyBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Giao diện Video Thumbnail chân thực ──
  videoThumbWrap: {
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#0F172A',
  },
  videoPlayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
  },
  videoPlayCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlayTriangle: {
    color: '#FFFFFF',
    fontSize: 10,
    marginLeft: 2,
    fontWeight: 'bold',
  },
  videoBadgeTag: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    backgroundColor: '#6366F1',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  videoBadgeTagText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },
  thumbVideoFallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EDE9FE',
  },

  // Lịch sử Video Thumbnail
  historyVideoThumbWrap: {
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    borderRadius: 6,
  },
  historyPlayBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },

  // ── Modal phóng to xem ảnh / video ──
  previewModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 999999,
  },
  previewModalContent: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
  },
  previewModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  previewModalTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  btnClosePreviewModal: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnClosePreviewModalText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  previewModalBody: {
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 250,
  },
  previewModalImage: {
    width: '100%',
    height: 420,
  },
});

