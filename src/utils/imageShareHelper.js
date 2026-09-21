// meat-management-fe/src/utils/imageShareHelper.js
import { Platform, Linking } from 'react-native';
import { showGlobalToast } from '../store/toastStore';

/**
 * Kiểm tra xem người dùng có đang truy cập từ thiết bị di động (Mobile/Tablet) hay không
 * @returns {boolean}
 */
export const isMobileDevice = () => {
  if (Platform.OS !== 'web') return true;
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent || '';
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  }
  if (typeof window !== 'undefined' && window.innerWidth <= 768) {
    return true;
  }
  return false;
};

/**
 * Chuyển đổi chuỗi Base64 / Data URI sang Blob an toàn, hiệu năng cao và phân bổ bộ nhớ 1 lần
 * @param {string} base64Data
 * @param {string} contentType
 * @returns {Blob|null}
 */
export const base64ToBlob = (base64Data, contentType = 'image/png') => {
  if (!base64Data || typeof base64Data !== 'string') return null;
  try {
    const parts = base64Data.split(',');
    const rawBase64 = parts.length > 1 ? parts[1] : parts[0];

    // Phát hiện content type nếu có trong Data URI
    if (parts.length > 1 && parts[0].includes('image/')) {
      const match = parts[0].match(/:(.*?);/);
      if (match && match[1]) {
        contentType = match[1];
      }
    }

    if (!rawBase64) return null;
    const byteCharacters = atob(rawBase64.trim());
    const byteNumbers = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    return new Blob([byteNumbers], { type: contentType });
  } catch (err) {
    console.error('[base64ToBlob ERROR]', err);
    return null;
  }
};

/**
 * Tạo đối tượng File an toàn từ Blob (tương thích cả trình duyệt cũ / Safari)
 * @param {Blob} blob
 * @param {string} fileName
 * @returns {File|Blob|null}
 */
const createFileFromBlob = (blob, fileName) => {
  if (!blob) return null;
  try {
    if (typeof File !== 'undefined') {
      return new File([blob], fileName, { type: blob.type || 'image/png' });
    }
  } catch (fileErr) {
    console.warn('Trình duyệt không hỗ trợ File constructor, sử dụng Blob:', fileErr);
  }
  try {
    blob.name = fileName;
    blob.lastModifiedDate = new Date();
  } catch (e) {}
  return blob;
};

/**
 * Hàm dùng chung duy nhất để xử lý tải hoặc chia sẻ 1 ảnh:
 * - Trên PC: Luôn tải file ảnh trực tiếp về máy tính.
 * - Trên Mobile (Web điện thoại): Luôn chuyển tiếp ảnh vào Zalo (qua Web Share API hoặc lưu ảnh + mở Zalo).
 *
 * @param {Object} params
 * @param {string} params.imageUri - Dữ liệu ảnh dạng Data URI Base64 hoặc URL trực tiếp (Cloudinary, v.v.)
 * @param {string} [params.fileName] - Tên file khi tải về
 * @param {string} [params.title] - Tiêu đề khi chia sẻ
 * @param {string} [params.text] - Nội dung text đi kèm
 * @param {string} [params.phone] - Số điện thoại khách hàng (để mở Zalo chat trực tiếp nếu có)
 * @param {string} [params.customerName] - Tên khách hàng (để hiển thị thông báo)
 */
export const downloadOrShareImage = async ({
  imageUri,
  fileName = `Anh_${Date.now()}.png`,
  title = 'Ảnh hóa đơn / Công nợ',
  text = '',
  phone = '',
  customerName = '',
}) => {
  if (!imageUri) {
    showGlobalToast('Chưa có dữ liệu hình ảnh để tải hoặc chia sẻ.', 'warning');
    return;
  }

  const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
  const hasPhone = cleanPhone.length >= 9;
  const isMobile = isMobileDevice();

  // ─── 1. TRƯỜNG HỢP PC: LUÔN TẢI FILE ẢNH VỀ MÁY TÍNH ───
  if (!isMobile) {
    try {
      if (typeof window !== 'undefined') {
        let downloadUrl = imageUri;
        let blobUrl = null;

        if (imageUri.startsWith('data:image/')) {
          const blob = base64ToBlob(imageUri);
          if (blob) {
            blobUrl = URL.createObjectURL(blob);
            downloadUrl = blobUrl;
          }
        }

        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = fileName;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        if (blobUrl) {
          setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        }

        showGlobalToast('Đã tải ảnh về máy tính thành công!', 'success');
      }
    } catch (err) {
      console.error('Lỗi khi tải ảnh trên PC:', err);
      showGlobalToast('Không thể tải ảnh về máy tính. Vui lòng thử lại.', 'error');
    }
    return;
  }

  // ─── 2. TRƯỜNG HỢP MOBILE: LUÔN CHUYỂN TIẾP ZALO ───
  try {
    let fileToShare = null;
    let localBlob = null;

    // Chuẩn bị file ảnh cho Web Share API
    if (imageUri.startsWith('data:image/')) {
      localBlob = base64ToBlob(imageUri);
      if (localBlob) {
        fileToShare = createFileFromBlob(localBlob, fileName);
      }
    } else if (imageUri.startsWith('http://') || imageUri.startsWith('https://')) {
      try {
        const res = await fetch(imageUri);
        localBlob = await res.blob();
        fileToShare = createFileFromBlob(localBlob, fileName);
      } catch (fetchErr) {
        console.warn('[Share] Không thể fetch ảnh thành File, tiếp tục dùng URL/Zalo link:', fetchErr);
      }
    }

    // Thử chia sẻ qua Web Share API (mở bảng chia sẻ hệ thống có Zalo)
    if (
      typeof navigator !== 'undefined' &&
      navigator.share &&
      fileToShare &&
      navigator.canShare
    ) {
      let canShareFile = false;
      try {
        canShareFile = navigator.canShare({ files: [fileToShare] });
      } catch (e) {
        canShareFile = false;
      }

      if (canShareFile) {
        try {
          // Chỉ truyền files để tránh lỗi tương thích trên iOS Safari khi gửi cùng text
          await navigator.share({
            files: [fileToShare],
          });
          return; // Người dùng đã chọn Zalo và chia sẻ thành công
        } catch (shareErr) {
          if (shareErr.name === 'AbortError') {
            return; // Người dùng chủ động đóng bảng chia sẻ
          }
          console.warn('[WebShare] Bảng chia sẻ file thất bại, chuyển sang lưu ảnh và mở Zalo:', shareErr);
        }
      }
    }

    // Fallback: Tự động lưu ảnh vào máy nếu Web Share không mở được
    if (localBlob && typeof window !== 'undefined') {
      try {
        const blobUrl = URL.createObjectURL(localBlob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      } catch (dlErr) {
        console.warn('Lỗi lưu ảnh về máy mobile:', dlErr);
      }
    }

    // Mở trực tiếp cuộc trò chuyện Zalo nếu có số điện thoại
    if (hasPhone) {
      const zaloUrl = `https://zalo.me/${cleanPhone}`;
      if (typeof window !== 'undefined') {
        window.open(zaloUrl, '_blank');
      } else {
        Linking.openURL(zaloUrl).catch(() => {});
      }
      showGlobalToast(
        customerName ? `Đã lưu ảnh & chuyển tiếp tới Zalo của ${customerName}...` : 'Đã lưu ảnh & chuyển tiếp tới Zalo...',
        'info'
      );
      return;
    }

    // Fallback khi không có số điện thoại: Mở app Zalo
    const defaultZaloUrl = 'https://zalo.me';
    if (typeof window !== 'undefined') {
      window.open(defaultZaloUrl, '_blank');
    } else {
      Linking.openURL(defaultZaloUrl).catch(() => {});
    }
    showGlobalToast('Đã lưu ảnh vào máy & đang mở Zalo để gửi...', 'info');
  } catch (mobileErr) {
    console.error('Lỗi khi chuyển tiếp Zalo trên điện thoại:', mobileErr);
    showGlobalToast('Không thể mở chuyển tiếp Zalo.', 'error');
  }
};

/**
 * Hàm xử lý xuất / tải nhiều ảnh cùng lúc:
 * - Trên PC (Web PC): Tự động tải tất cả các file ảnh về máy tính lần lượt.
 * - Trên Mobile (Web điện thoại): Chuyển tiếp tất cả các ảnh xuất sang Zalo (qua Web Share API chứa danh sách Files).
 *   Nếu Web Share không hỗ trợ hoặc bị chặn, tự động lưu toàn bộ ảnh về thiết bị rồi mở Zalo.
 *
 * @param {Object} params
 * @param {Array<{ imageUri: string, fileName?: string, customerName?: string, phone?: string }>} params.items - Danh sách ảnh kèm thông tin
 * @param {string} [params.title] - Tiêu đề chia sẻ
 * @param {string} [params.text] - Nội dung text đi kèm
 * @returns {Promise<{ success: boolean, sharedVia: string }>}
 */
export const downloadOrShareMultipleImages = async ({
  items = [],
  title = 'Bảng kê công nợ hàng loạt',
  text = 'Bảng kê công nợ chi tiết các khách hàng',
}) => {
  if (!items || items.length === 0) {
    showGlobalToast('Không có hình ảnh nào để tải hoặc chuyển tiếp.', 'warning');
    return { success: false, sharedVia: 'none' };
  }

  const isMobile = isMobileDevice();

  // ─── 1. TRƯỜNG HỢP PC: TỰ ĐỘNG TẢI TẤT CẢ FILE ẢNH VỀ MÁY TÍNH ───
  if (!isMobile) {
    try {
      if (typeof window !== 'undefined') {
        let downloadedCount = 0;

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (!item.imageUri) continue;

          let downloadUrl = item.imageUri;
          let blobUrl = null;

          if (item.imageUri.startsWith('data:image/')) {
            const blob = base64ToBlob(item.imageUri);
            if (blob) {
              blobUrl = URL.createObjectURL(blob);
              downloadUrl = blobUrl;
            }
          }

          const fileName = item.fileName || `Bang_ke_cong_no_${i + 1}.png`;
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = fileName;
          link.target = '_blank';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          if (blobUrl) {
            setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
          }
          downloadedCount++;

          // Nghỉ 350ms giữa mỗi file để trình duyệt không chặn popup download hàng loạt
          if (i < items.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 350));
          }
        }

        showGlobalToast(`Đã tải về thành công ${downloadedCount} ảnh báo cáo về máy tính!`, 'success');
        return { success: true, sharedVia: 'pc_download' };
      }
    } catch (err) {
      console.error('Lỗi khi tải nhiều ảnh trên PC:', err);
      showGlobalToast('Không thể hoàn tất tải ảnh về máy tính.', 'error');
      return { success: false, sharedVia: 'pc_download_error' };
    }
    return { success: true, sharedVia: 'pc_download' };
  }

  // ─── 2. TRƯỜNG HỢP MOBILE: CHUYỂN TIẾP TẤT CẢ CÁC ẢNH VÀO ZALO ───
  try {
    const filesToShare = [];
    const blobDownloads = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.imageUri) continue;

      const fileName = item.fileName || `Bao_cao_${i + 1}.png`;
      if (item.imageUri.startsWith('data:image/')) {
        const blob = base64ToBlob(item.imageUri);
        if (blob) {
          blobDownloads.push({ blob, fileName });
          const file = createFileFromBlob(blob, fileName);
          if (file) filesToShare.push(file);
        }
      } else if (item.imageUri.startsWith('http://') || item.imageUri.startsWith('https://')) {
        try {
          const res = await fetch(item.imageUri);
          const blob = await res.blob();
          blobDownloads.push({ blob, fileName });
          const file = createFileFromBlob(blob, fileName);
          if (file) filesToShare.push(file);
        } catch (fetchErr) {
          console.warn('[MultiShare] Không thể fetch file:', item.fileName, fetchErr);
        }
      }
    }

    // Hàm tự động tải lưu tất cả các file ảnh về bộ sưu tập thiết bị
    const saveAllImagesLocally = async () => {
      if (typeof window === 'undefined') return;
      for (let i = 0; i < blobDownloads.length; i++) {
        const { blob, fileName } = blobDownloads[i];
        try {
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = fileName;
          link.target = '_blank';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
          if (i < blobDownloads.length - 1) {
            await new Promise((r) => setTimeout(r, 350));
          }
        } catch (dlErr) {
          console.warn('Lỗi khi tải ảnh về thiết bị:', fileName, dlErr);
        }
      }
    };

    // Kiểm tra khả năng hỗ trợ Web Share API
    let canUseWebShare = false;
    if (
      typeof navigator !== 'undefined' &&
      navigator.share &&
      filesToShare.length > 0 &&
      navigator.canShare
    ) {
      try {
        canUseWebShare = navigator.canShare({ files: filesToShare });
      } catch (canShareErr) {
        console.warn('navigator.canShare ném lỗi:', canShareErr);
        canUseWebShare = false;
      }
    }

    if (canUseWebShare) {
      try {
        // Chỉ chia sẻ files (không kèm text/title dài để tránh lỗi WebKit trên iOS)
        await navigator.share({
          files: filesToShare,
        });
        showGlobalToast('Đã mở chia sẻ Zalo thành công!', 'success');
        return { success: true, sharedVia: 'mobile_share' };
      } catch (shareErr) {
        if (shareErr.name === 'AbortError') {
          // Người dùng chủ động đóng hộp thoại chia sẻ
          return { success: true, sharedVia: 'cancelled_by_user' };
        }
        console.warn('[WebShare Multi] Chia sẻ nhiều file không thành công, lưu ảnh về máy:', shareErr);
      }
    }

    // Fallback khi Web Share không thể mở:
    // 1. Lưu tất cả ảnh về thư viện ảnh/tệp của máy
    await saveAllImagesLocally();

    // 2. Mở ứng dụng Zalo để người dùng gửi
    const defaultZaloUrl = 'https://zalo.me';
    if (typeof window !== 'undefined') {
      window.open(defaultZaloUrl, '_blank');
    } else {
      Linking.openURL(defaultZaloUrl).catch(() => {});
    }
    showGlobalToast(`Đã lưu ${blobDownloads.length} ảnh vào máy & mở Zalo để gửi...`, 'success');
    return { success: true, sharedVia: 'mobile_download_and_zalo' };

  } catch (err) {
    console.error('Lỗi khi chuyển tiếp ảnh Zalo hàng loạt trên Mobile:', err);
    showGlobalToast('Không thể mở chuyển tiếp Zalo.', 'error');
    return { success: false, sharedVia: 'mobile_error' };
  }
};

