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
import { api, API_HOST } from '../../src/api/client';
import { showGlobalToast } from '../../src/store/toastStore';
import DatePickerInput from '../../src/components/DatePickerInput';
import ImagePreviewModal from '../../src/components/ImagePreviewModal';

// Helper chuẩn hóa URL hình ảnh/video (hỗ trợ cả link Cloudinary lẫn link cục bộ máy chủ)
const resolveMediaUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  return `${API_HOST}${url}`;
};

// Helper nén ảnh siêu tốc bằng HTML5 Canvas + createImageBitmap / Blob URL (Tối ưu tuyệt đối cho hóa đơn giấy)
const compressImageClient = async (file, maxWidth = 1280, quality = 0.70) => {
  if (!file || !file.type?.startsWith('image/')) {
    return null;
  }

  try {
    // 1. Ưu tiên giải mã phần cứng bằng createImageBitmap (cực nhanh, đa luồng off-thread, không tốn RAM)
    if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
      try {
        const bitmap = await createImageBitmap(file);
        let width = bitmap.width;
        let height = bitmap.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { alpha: false }); // Tắt alpha channel để tăng tốc render 2x
        if (ctx) {
          ctx.imageSmoothingQuality = 'medium'; // Tối ưu tốc độ xử lý điểm ảnh
          ctx.drawImage(bitmap, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          if (typeof bitmap.close === 'function') bitmap.close();
          return compressedDataUrl;
        }
      } catch (bitmapErr) {
        console.warn('createImageBitmap lỗi, chuyển sang fallback Blob URL:', bitmapErr);
      }
    }

    // 2. Fallback sử dụng URL.createObjectURL (nhanh hơn gấp nhiều lần FileReader thông thường)
    return await new Promise((resolve) => {
      if (typeof URL === 'undefined' || !URL.createObjectURL) {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = () => resolve(null);
        return;
      }

      const blobUrl = URL.createObjectURL(file);
      const img = new window.Image();
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
        const ctx = canvas.getContext('2d', { alpha: false });
        if (ctx) {
          ctx.imageSmoothingQuality = 'medium';
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          URL.revokeObjectURL(blobUrl);
          resolve(compressedDataUrl);
        } else {
          URL.revokeObjectURL(blobUrl);
          resolve(null);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        resolve(null);
      };
      img.src = blobUrl;
    });
  } catch (err) {
    console.error('Lỗi khi nén ảnh:', err);
    return null;
  }
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
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    if (!thumbSrc && file.fileData && typeof document !== 'undefined') {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      v.playsInline = true;
      v.src = file.blobUrl || file.fileData;
      v.onerror = () => {
        setVideoError(true);
      };
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
      ) : !videoError && typeof window !== 'undefined' ? (
        <video
          src={file.blobUrl || file.fileData}
          onError={(e) => {
            setVideoError(true);
            try {
              e.target.removeAttribute('src');
              e.target.load();
            } catch {}
          }}
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

  // Trạng thái xử lý và nén tệp khi người dùng vừa chọn từ thư viện
  const [isProcessingMedia, setIsProcessingMedia] = useState(false);
  const [processingStatus, setProcessingStatus] = useState({ current: 0, total: 0, text: '', percent: 0 });

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

  // Cập nhật tiêu đề tab trình duyệt web
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'Gửi ảnh hóa đơn, video công nợ';
    }
  }, []);

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

  // Xử lý chọn nhiều ảnh và video từ thư viện máy với cơ chế NÉN SONG SONG ĐA LUỒNG siêu tốc
  const handleMediaChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsProcessingMedia(true);
    setProcessingStatus({ current: 0, total: files.length, text: 'Bắt đầu nén song song...', percent: 10 });

    let completedCount = 0;

    // Xử lý 1 tệp độc lập
    const processSingleFile = async (file) => {
      const isVideo = file.type.startsWith('video/');
      try {
        if (file.type.startsWith('image/')) {
          const base64Data = await compressImageClient(file);
          completedCount++;
          setProcessingStatus({
            current: completedCount,
            total: files.length,
            text: `Đã nén tối ưu ${completedCount}/${files.length} tệp...`,
            percent: Math.round((completedCount / files.length) * 100),
          });

          if (base64Data) {
            const approxKb = Math.round((base64Data.length * 0.75) / 1024);
            return {
              id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: file.name,
              fileType: 'IMAGE',
              fileData: base64Data,
              sizeStr: `${approxKb} KB`,
            };
          }
        } else if (isVideo) {
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

          const fileData = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => resolve(event.target.result);
            reader.onerror = () => resolve(null);
          });

          completedCount++;
          setProcessingStatus({
            current: completedCount,
            total: files.length,
            text: `Đã xử lý ${completedCount}/${files.length} tệp...`,
            percent: Math.round((completedCount / files.length) * 100),
          });

          if (fileData) {
            return {
              id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: file.name,
              fileType: 'VIDEO',
              fileData,
              blobUrl: blobUrl || fileData,
              thumbUrl: thumbUrl || null,
              sizeStr: `${Math.round(file.size / (1024 * 1024))} MB`,
            };
          }
        }
      } catch (err) {
        console.error('Lỗi khi chuẩn bị tệp:', err);
      }
      return null;
    };

    // Chạy song song tất cả các tệp cùng lúc (cực nhanh, tận dụng đa nhân CPU)
    const results = await Promise.all(files.map(processSingleFile));
    const processedFiles = results.filter(Boolean);

    setSelectedFiles((prev) => [...prev, ...processedFiles]);
    setIsProcessingMedia(false);
    if (mediaInputRef.current) mediaInputRef.current.value = '';

    if (processedFiles.length > 0) {
      showGlobalToast(`⚡ Đã xử lý siêu tốc ${processedFiles.length} tệp, sẵn sàng gửi.`, 'success');
    }
  };

  // Xóa 1 file khỏi danh sách chọn
  const handleRemoveFile = (id) => {
    setSelectedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // Gửi toàn bộ hóa đơn / video lên: Upload kèm theo dõi tiến trình thực tế onUploadProgress
  const handleSubmit = async () => {
    if (selectedFiles.length === 0) {
      showGlobalToast('Vui lòng chọn ít nhất 1 ảnh hóa đơn hoặc video.', 'warning');
      return;
    }

    const countToSend = selectedFiles.length;

    try {
      setUploading(true);
      setUploadProgress(5);

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

      const res = await api.post(`/staff-submissions/public/submit/${token}`, payload, {
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.min(95, Math.round((progressEvent.loaded * 100) / progressEvent.total));
            setUploadProgress(percent);
          }
        },
      });

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
            style={[styles.btnPickMediaMain, isProcessingMedia && styles.btnPickMediaDisabled]}
            disabled={isProcessingMedia}
            onPress={() => {
              if (Platform.OS === 'web' && mediaInputRef.current) {
                mediaInputRef.current.click();
              }
            }}
            activeOpacity={0.85}
          >
            {isProcessingMedia ? (
              <View style={styles.processingMediaBox}>
                <ActivityIndicator size="small" color="#047857" style={{ marginBottom: 6 }} />
                <Text style={styles.pickMediaTitle}>ĐANG XỬ LÝ & TỐI ƯU TỆP...</Text>
                <Text style={styles.pickMediaSub}>{processingStatus.text}</Text>
                <View style={styles.miniProgressTrack}>
                  <View style={[styles.miniProgressFill, { width: `${processingStatus.percent}%` }]} />
                </View>
              </View>
            ) : (
              <>
                <Text style={styles.pickMediaIcon}>📸 🎬</Text>
                <Text style={styles.pickMediaTitle}>GỬI HÓA ĐƠN / VIDEO HÓA ĐƠN</Text>
                <Text style={styles.pickMediaSub}>Chạm để chọn nhiều ảnh hoặc video từ thư viện máy</Text>
              </>
            )}
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
            <View style={styles.historyGrid}>
              {historySubmissions.map((item, idx) => {
                const isVideo = item.fileType === 'VIDEO';
                const mediaUrl = resolveMediaUrl(item.fileUrl);
                const timeStr = item.createdAt
                  ? new Date(item.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                  : '';

                return (
                  <TouchableOpacity
                    key={item.id || idx}
                    style={styles.historyGridBox}
                    activeOpacity={0.85}
                    onPress={() => handlePreviewMedia(mediaUrl, item.fileType)}
                  >
                    {isVideo ? (
                      <View style={styles.historyVideoWrap}>
                        {typeof window !== 'undefined' && mediaUrl ? (
                          <video
                            src={mediaUrl}
                            poster={mediaUrl?.replace(/\.(mp4|mov|avi|webm)$/i, '.jpg')}
                            onError={(e) => {
                              try {
                                e.target.style.display = 'none';
                                e.target.removeAttribute('src');
                                e.target.load();
                              } catch {}
                            }}
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
                          <View style={styles.historyVideoFallback}>
                            <Text style={{ fontSize: 22 }}>🎬</Text>
                          </View>
                        )}
                        <View style={styles.videoPlayOverlay}>
                          <View style={styles.videoPlayCircle}>
                            <Text style={styles.videoPlayTriangle}>▶</Text>
                          </View>
                        </View>
                        <View style={styles.videoBadgeTag}>
                          <Text style={styles.videoBadgeTagText}>VIDEO</Text>
                        </View>
                      </View>
                    ) : (
                      <Image source={{ uri: mediaUrl }} style={styles.historyGridImg} resizeMode="cover" />
                    )}

                    {/* Số thứ tự và giờ gửi nhỏ ở góc */}
                    <View style={styles.historyIndexBadge}>
                      <Text style={styles.historyIndexBadgeText}>#{idx + 1}</Text>
                    </View>
                    {timeStr && !isVideo ? (
                      <View style={styles.historyTimeBadge}>
                        <Text style={styles.historyTimeBadgeText}>{timeStr}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
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
                  onError={(e) => {
                    try {
                      e.target.removeAttribute('src');
                      e.target.load();
                    } catch {}
                  }}
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

      {/* ─── MODAL TIẾN TRÌNH TẢI LÊN MÁY CHỦ (UPLOAD OVERLAY) ─── */}
      <Modal visible={uploading} transparent={true} animationType="fade">
        <View style={styles.uploadOverlay}>
          <View style={styles.uploadModalCard}>
            <View style={styles.uploadIconCircle}>
              <ActivityIndicator size="large" color="#059669" />
            </View>
            <Text style={styles.uploadModalTitle}>Đang tải hóa đơn lên...</Text>
            <Text style={styles.uploadModalSub}>
              Đã tải {uploadProgress}% • Vui lòng giữ màn hình
            </Text>

            {/* Thanh tiến trình Upload thực tế */}
            <View style={styles.uploadProgressBarTrack}>
              <View style={[styles.uploadProgressBarFill, { width: `${uploadProgress}%` }]} />
            </View>

            <Text style={styles.uploadModalTip}>
              ⚡ Tệp đã được nén tối ưu để gửi đi với tốc độ cao nhất
            </Text>
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
  btnPickMediaDisabled: {
    opacity: 0.95,
    backgroundColor: '#ECFDF5',
    borderColor: '#34D399',
  },
  processingMediaBox: {
    alignItems: 'center',
    width: '100%',
    paddingVertical: 2,
  },
  miniProgressTrack: {
    width: '80%',
    height: 6,
    backgroundColor: '#D1FAE5',
    borderRadius: 3,
    marginTop: 8,
    overflow: 'hidden',
  },
  miniProgressFill: {
    height: '100%',
    backgroundColor: '#059669',
    borderRadius: 3,
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
  historyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  historyGridBox: {
    position: 'relative',
    width: 76,
    height: 76,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  historyGridImg: {
    width: '100%',
    height: '100%',
  },
  historyVideoWrap: {
    width: '100%',
    height: '100%',
    position: 'relative',
    backgroundColor: '#0F172A',
  },
  historyVideoFallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E293B',
  },
  historyIndexBadge: {
    position: 'absolute',
    top: 3,
    left: 3,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    zIndex: 2,
  },
  historyIndexBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 'bold',
  },
  historyTimeBadge: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    zIndex: 2,
  },
  historyTimeBadgeText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: '600',
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
  // Modal Overlay khi đang upload lên server
  uploadOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 9999999,
  },
  uploadModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
  },
  uploadIconCircle: {
    marginBottom: 14,
  },
  uploadModalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  uploadModalSub: {
    fontSize: 13,
    color: '#059669',
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  uploadProgressBarTrack: {
    width: '100%',
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 14,
  },
  uploadProgressBarFill: {
    height: '100%',
    backgroundColor: '#059669',
    borderRadius: 4,
  },
  uploadModalTip: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
});

