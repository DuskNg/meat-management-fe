// meat-management-fe/app/submit/[token].js
import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import GlobalToast from '../../src/components/GlobalToast';
import DatePickerInput from '../../src/components/DatePickerInput';
import ImagePreviewModal from '../../src/components/ImagePreviewModal';

// Helper chuẩn hóa URL hình ảnh/video (hỗ trợ cả link Cloudinary lẫn link cục bộ máy chủ)
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

// Helper kiểm tra an toàn tệp là ảnh hay video (hoạt động 100% trên cả iPhone khi file.type bị rỗng hoặc HEIC)
const getFileCategory = (file) => {
  if (!file) return { isVideo: false, isImage: true };
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();

  const isVideo = type.startsWith('video/') || /\.(mp4|mov|avi|webm|m4v|3gp|mkv)$/i.test(name);
  const isImage = type.startsWith('image/') || /\.(jpg|jpeg|png|heic|heif|webp|gif|bmp)$/i.test(name) || !isVideo;

  return {
    isVideo,
    isImage,
  };
};

// Helper nén ảnh siêu tốc bằng HTML5 Canvas + createImageBitmap / Blob URL (Tương thích cả iPhone HEIC & iOS Safari)
const compressImageClient = async (file, maxWidth = 1200, quality = 0.65) => {
  if (!file) return null;
  const { isImage } = getFileCategory(file);
  if (!isImage) return null;

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
          // Giải phóng ngay bộ nhớ đồ họa Canvas trên iOS
          canvas.width = 1;
          canvas.height = 1;
          ctx.clearRect(0, 0, 1, 1);
          return compressedDataUrl;
        }
      } catch (bitmapErr) {
        console.warn('createImageBitmap lỗi (đặc biệt trên Safari/HEIC), chuyển sang fallback Image Blob:', bitmapErr);
      }
    }

    // 2. Fallback sử dụng URL.createObjectURL
    return await new Promise((resolve) => {
      if (typeof URL === 'undefined' || !URL.createObjectURL) {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = () => resolve(null);
        return;
      }

      let blobUrl = null;
      try {
        blobUrl = URL.createObjectURL(file);
      } catch (err) {
        // Nếu không thể tạo blobUrl, fallback qua FileReader
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = () => resolve(null);
        return;
      }

      const img = new window.Image();
      img.onload = () => {
        try {
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

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
            // Dọn sạch VRAM Canvas & thu hồi Blob URL
            canvas.width = 1;
            canvas.height = 1;
            ctx.clearRect(0, 0, 1, 1);
            URL.revokeObjectURL(blobUrl);
            resolve(compressedDataUrl);
          } else {
            URL.revokeObjectURL(blobUrl);
            resolve(null);
          }
        } catch {
          URL.revokeObjectURL(blobUrl);
          resolve(null);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        // Nếu img.onerror (ví dụ HEIC thô không render được trên browser này), fallback đọc trực tiếp qua FileReader
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = () => resolve(null);
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

  // Danh sách hàng đợi tải ngầm (phong cách Zalo: đưa lên giao diện ngay lập tức trong 0ms)
  const [uploadQueue, setUploadQueue] = useState([]);
  const activeUploadsRef = useRef(0);
  const uploadQueueRef = useRef([]);
  uploadQueueRef.current = uploadQueue;

  // Lịch sử gửi trong ngày của nhóm
  const [historySubmissions, setHistorySubmissions] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Kiểm tra ngày đang chọn có phải là ngày hôm nay không
  const isToday = useMemo(() => {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    return selectedDate === `${d}/${m}/${y}`;
  }, [selectedDate]);

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

  // Tải lịch sử gửi theo ngày được chọn
  const fetchHistory = async (dateStr = selectedDate) => {
    if (!token) return;
    try {
      setLoadingHistory(true);
      let queryDate = '';
      if (dateStr) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          queryDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else {
          queryDate = dateStr;
        }
      }
      const res = await api.get(`/staff-submissions/public/history/${token}`, {
        params: {
          date: queryDate,
          _t: Date.now(),
        },
      });
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

  // Tự động tải lại lịch sử khi xác thực PIN hoặc khi đổi sang ngày khác
  useEffect(() => {
    if (isPinVerified) {
      fetchHistory(selectedDate);
    }
  }, [isPinVerified, selectedDate]);

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

  // Xử lý chọn nhiều ảnh và video từ thư viện máy: Đưa ngay lên giao diện tức thì (phong cách Zalo)
  const handleMediaChange = (e) => {
    try {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      // TUYỆT ĐỐI KHÔNG gán mediaInputRef.current.value = '' tại đây vì iOS Safari sẽ giải phóng con trỏ File ngay lập tức!
      // Việc reset value được thực hiện ở sự kiện onClick khi người dùng bắt đầu mở chọn tệp tiếp theo.

      const newItems = files.map((file) => {
        const { isVideo } = getFileCategory(file);
        let blobUrl = '';
        if (typeof URL !== 'undefined' && URL.createObjectURL) {
          try {
            blobUrl = URL.createObjectURL(file);
          } catch (blobErr) {
            console.warn('Không thể tạo blob URL cho tệp:', blobErr);
          }
        }

        return {
          id: `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          file,
          blobUrl,
          fileType: isVideo ? 'VIDEO' : 'IMAGE',
          name: file.name || (isVideo ? 'video.mp4' : 'image.jpg'),
          status: 'QUEUED', // 'QUEUED' | 'UPLOADING' | 'ERROR'
          errorMsg: '',
        };
      });

      setUploadQueue((prev) => [...prev, ...newItems]);
    } catch (err) {
      console.error('Lỗi trong handleMediaChange:', err);
    }
  };

  // Tự động điều phối hàng đợi upload ngầm (chế độ Băng chuyền 1 luồng: giải phóng RAM ngay sau mỗi ảnh, không lo tràn bộ nhớ)
  const processUploadQueue = async () => {
    const MAX_CONCURRENT = 1;
    if (activeUploadsRef.current >= MAX_CONCURRENT) return;

    const currentQueue = uploadQueueRef.current;
    const nextItem = currentQueue.find((it) => it.status === 'QUEUED');
    if (!nextItem) return;

    activeUploadsRef.current += 1;

    // Chuyển trạng thái sang UPLOADING
    setUploadQueue((prev) =>
      prev.map((it) => (it.id === nextItem.id ? { ...it, status: 'UPLOADING', errorMsg: '' } : it))
    );

    try {
      // 1. Đọc và nén dữ liệu tệp
      let fileData = null;
      if (nextItem.fileType === 'IMAGE') {
        fileData = await compressImageClient(nextItem.file);
        if (!fileData) {
          fileData = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(nextItem.file);
            reader.onload = (ev) => resolve(ev.target.result);
            reader.onerror = () => resolve(null);
          });
        }
      } else {
        fileData = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(nextItem.file);
          reader.onload = (ev) => resolve(ev.target.result);
          reader.onerror = () => resolve(null);
        });
      }

      if (!fileData) {
        throw new Error('Không thể đọc dữ liệu tệp.');
      }

      // 2. Gửi API lên máy chủ
      const [d, m, y] = selectedDate.split('/');
      const isoDate = `${y}-${m}-${d}`;

      const payload = {
        senderName: 'Nhân viên',
        note: '',
        date: isoDate,
        files: [
          {
            fileData,
            fileType: nextItem.fileType,
            fileName: nextItem.name,
          },
        ],
      };

      const res = await api.post(`/staff-submissions/public/submit/${token}`, payload);

      if (res.data?.success && res.data?.data?.length > 0) {
        const savedSubmission = res.data.data[0];

        // Thu hồi URL Blob để giải phóng RAM
        if (nextItem.blobUrl) {
          try {
            URL.revokeObjectURL(nextItem.blobUrl);
          } catch {}
        }

        // Đưa trực tiếp vào danh sách Đã gửi hôm nay
        setHistorySubmissions((prev) => [savedSubmission, ...prev]);

        // Xóa khỏi hàng đợi đang tải + kiểm tra hoàn thành toàn bộ
        setUploadQueue((prev) => {
          const updated = prev.filter((it) => it.id !== nextItem.id);
          // Kiểm tra nếu không còn file nào đang chờ/đang gửi → toast tổng kết
          const stillActive = updated.some((it) => it.status === 'QUEUED' || it.status === 'UPLOADING');
          if (!stillActive) {
            const errorCount = updated.filter((it) => it.status === 'ERROR').length;
            const isVideo = nextItem.fileType === 'VIDEO';
            if (errorCount === 0) {
              showGlobalToast(
                `✅ Đã gửi ${isVideo ? 'video' : 'ảnh'} hóa đơn thành công! Chủ buôn sẽ xem và duyệt sớm nhé.`,
                'success'
              );
            } else {
              showGlobalToast(
                `⚠️ Đã gửi xong, nhưng ${errorCount} tệp bị lỗi. Vui lòng kiểm tra lại!`,
                'warning'
              );
            }
          }
          return updated;
        });
      } else {
        throw new Error(res.data?.message || 'Không thể lưu hóa đơn.');
      }
    } catch (err) {
      console.error('Lỗi khi tải tệp lên:', err);
      setUploadQueue((prev) =>
        prev.map((it) =>
          it.id === nextItem.id
            ? { ...it, status: 'ERROR', errorMsg: err.response?.data?.message || err.message || 'Lỗi tải lên' }
            : it
        )
      );
    } finally {
      activeUploadsRef.current = Math.max(0, activeUploadsRef.current - 1);
      // Kích hoạt xử lý tệp kế tiếp trong hàng đợi
      processUploadQueue();
    }
  };

  // Kích hoạt tiến trình upload mỗi khi hàng đợi có tệp chờ
  useEffect(() => {
    const hasQueued = uploadQueue.some((it) => it.status === 'QUEUED');
    if (hasQueued) {
      processUploadQueue();
    }
  }, [uploadQueue]);

  // Hủy một tệp trong hàng đợi
  const handleCancelQueueItem = (id) => {
    setUploadQueue((prev) => {
      const item = prev.find((it) => it.id === id);
      if (item && item.blobUrl) {
        try {
          URL.revokeObjectURL(item.blobUrl);
        } catch {}
      }
      return prev.filter((it) => it.id !== id);
    });
  };

  // Thử lại tệp bị lỗi
  const handleRetryQueueItem = (id) => {
    setUploadQueue((prev) =>
      prev.map((it) => (it.id === id ? { ...it, status: 'QUEUED', errorMsg: '' } : it))
    );
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
  <>
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

          {/* Vùng chọn ảnh/video: Thẻ input native phủ kín toàn bộ nút bấm với opacity: 0 */}
          <View style={styles.pickMediaWrap}>
            {Platform.OS === 'web' && (
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                ref={mediaInputRef}
                onClick={(e) => {
                  // Chỉ dọn dẹp value cũ khi người dùng bắt đầu CHẠM để chọn đợt mới
                  try {
                    e.target.value = '';
                  } catch {}
                }}
                onChange={handleMediaChange}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  opacity: 0,
                  zIndex: 20,
                  cursor: 'pointer',
                }}
              />
            )}

            <View style={styles.btnPickMediaMain}>
              <Text style={styles.pickMediaIcon}>📸 🎬</Text>
              <Text style={styles.pickMediaTitle}>GỬI HÓA ĐƠN / VIDEO HÓA ĐƠN</Text>
              <Text style={styles.pickMediaSub}>Chạm để chọn nhiều ảnh hoặc video từ thư viện máy</Text>
            </View>
          </View>

          <Text style={styles.pickMediaTip}>
            ⚡ Hệ thống tự động nén nhẹ và tải ngầm siêu tốc, không lo đầy bộ nhớ máy
          </Text>

          {/* Banner thông báo trạng thái hàng đợi đang tải ngầm nếu có */}
          {uploadQueue.length > 0 && (
            <View style={styles.uploadQueueStatusBanner}>
              <ActivityIndicator size="small" color="#059669" />
              <Text style={styles.uploadQueueStatusText}>
                Đang tự động gửi {uploadQueue.length} tệp lên hệ thống...
              </Text>
            </View>
          )}
        </View>

        {/* ─── 3. LỊCH SỬ HÓA ĐƠN ĐÃ GỬI THEO NGÀY ─── */}
        <View style={styles.card}>
          <View style={styles.historyHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.historyTitle}>
                📋 {isToday ? 'Đã gửi hôm nay' : `Đã gửi ngày ${selectedDate}`} ({historySubmissions.length})
              </Text>
              {uploadQueue.length > 0 && (
                <View style={styles.uploadQueueBadge}>
                  <Text style={styles.uploadQueueBadgeText}>+{uploadQueue.length} đang tải</Text>
                </View>
              )}
            </View>
            <TouchableOpacity onPress={() => fetchHistory(selectedDate)} disabled={loadingHistory}>
              <Text style={styles.btnReloadHistory}>{loadingHistory ? 'Đang tải...' : '🔄 Làm mới'}</Text>
            </TouchableOpacity>
          </View>

          {uploadQueue.length === 0 && historySubmissions.length === 0 ? (
            <Text style={styles.historyEmptyText}>
              {isToday
                ? 'Chưa có hóa đơn nào được gửi trong ngày hôm nay.'
                : `Chưa có hóa đơn nào được gửi trong ngày ${selectedDate}.`}
            </Text>
          ) : (
            <View style={styles.historyGrid}>
              {/* CÁC TỆP ĐANG TẢI (HIỂN THỊ TỨC THÌ PHONG CÁCH ZALO) */}
              {uploadQueue.map((item) => {
                const isVideo = item.fileType === 'VIDEO';
                const isError = item.status === 'ERROR';

                return (
                  <View key={item.id} style={styles.historyGridBox}>
                    {isVideo ? (
                      <View style={styles.historyVideoWrap}>
                        {typeof window !== 'undefined' && item.blobUrl ? (
                          <video
                            src={item.blobUrl}
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
                        <View style={styles.videoBadgeTag}>
                          <Text style={styles.videoBadgeTagText}>VIDEO</Text>
                        </View>
                      </View>
                    ) : (
                      <Image source={{ uri: item.blobUrl }} style={styles.historyGridImg} resizeMode="cover" />
                    )}

                    {/* Lớp phủ trạng thái Zalo (Đang gửi hoặc Thử lại nếu lỗi) */}
                    {isError ? (
                      <TouchableOpacity
                        style={styles.uploadQueueOverlayError}
                        activeOpacity={0.8}
                        onPress={() => handleRetryQueueItem(item.id)}
                      >
                        <Text style={{ fontSize: 16 }}>⚠️</Text>
                        <Text style={styles.uploadQueueErrorText}>Thử lại</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.uploadQueueOverlay}>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                        <Text style={styles.uploadQueueLoadingText}>
                          {item.status === 'UPLOADING' ? 'Đang gửi...' : 'Chờ tải...'}
                        </Text>
                      </View>
                    )}

                    {/* Nút hủy ✕ góc trên phải */}
                    <TouchableOpacity
                      style={styles.btnCancelQueueItem}
                      activeOpacity={0.7}
                      onPress={() => handleCancelQueueItem(item.id)}
                    >
                      <Text style={styles.btnCancelQueueItemText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}

              {/* CÁC TỆP ĐÃ GỬI THÀNH CÔNG HÔM NAY */}
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
    </ScrollView>
    <GlobalToast />
  </>
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

  pickMediaWrap: {
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
    borderRadius: 10,
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
  pickMediaTip: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  // Banner thông báo tiến trình tải ngầm
  uploadQueueStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  uploadQueueStatusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#047857',
  },
  uploadQueueBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  uploadQueueBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#D97706',
  },

  // ── Lớp phủ trạng thái tải Zalo (Spinner tròn & Lỗi thử lại) ──
  uploadQueueOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
    zIndex: 5,
  },
  uploadQueueLoadingText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  uploadQueueOverlayError: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(220, 38, 38, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
    zIndex: 5,
    cursor: 'pointer',
  },
  uploadQueueErrorText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 3,
    textDecorationLine: 'underline',
  },
  btnCancelQueueItem: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  btnCancelQueueItemText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 'bold',
    lineHeight: 11,
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
});

