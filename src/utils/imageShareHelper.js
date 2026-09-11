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
 * Chuyển đổi chuỗi Base64 / Data URI sang Blob
 * @param {string} base64Data
 * @param {string} contentType
 * @returns {Blob}
 */
export const base64ToBlob = (base64Data, contentType = 'image/png') => {
  if (!base64Data) return null;
  const parts = base64Data.split(',');
  const rawBase64 = parts.length > 1 ? parts[1] : parts[0];

  // Phát hiện content type nếu có trong Data URI
  if (parts.length > 1 && parts[0].includes('image/')) {
    const match = parts[0].match(/:(.*?);/);
    if (match && match[1]) {
      contentType = match[1];
    }
  }

  const byteCharacters = atob(rawBase64);
  const sliceSize = 512;
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }

  return new Blob(byteArrays, { type: contentType });
};

/**
 * Hàm dùng chung duy nhất để xử lý:
 * - Trên PC: Luôn tải file ảnh trực tiếp về máy tính.
 * - Trên Mobile (Web điện thoại): Luôn chuyển tiếp ảnh vào Zalo (qua Web Share API hoặc mở Zalo chat).
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
          blobUrl = URL.createObjectURL(blob);
          downloadUrl = blobUrl;
        }

        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = fileName;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        if (blobUrl) {
          setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
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

    // Chuẩn bị file ảnh cho Web Share API
    if (typeof File !== 'undefined') {
      if (imageUri.startsWith('data:image/')) {
        const blob = base64ToBlob(imageUri);
        fileToShare = new File([blob], fileName, { type: blob.type || 'image/png' });
      } else if (imageUri.startsWith('http://') || imageUri.startsWith('https://')) {
        try {
          const res = await fetch(imageUri);
          const blob = await res.blob();
          fileToShare = new File([blob], fileName, { type: blob.type || 'image/png' });
        } catch (fetchErr) {
          console.warn('[Share] Không thể fetch ảnh thành File, tiếp tục dùng URL/Zalo link:', fetchErr);
        }
      }
    }

    // Thử chia sẻ qua Web Share API (mở bảng chia sẻ hệ thống có Zalo)
    if (
      typeof navigator !== 'undefined' &&
      navigator.share &&
      fileToShare &&
      navigator.canShare &&
      navigator.canShare({ files: [fileToShare] })
    ) {
      try {
        await navigator.share({
          files: [fileToShare],
          title: title,
          text: text || title,
        });
        return; // Người dùng đã chọn Zalo và chia sẻ thành công
      } catch (shareErr) {
        if (shareErr.name === 'AbortError') {
          return; // Người dùng chủ động đóng bảng chia sẻ
        }
        console.warn('[WebShare] Bảng chia sẻ file thất bại, chuyển sang mở trực tiếp Zalo:', shareErr);
      }
    }

    // Fallback: Mở trực tiếp cuộc trò chuyện Zalo nếu có số điện thoại
    if (hasPhone) {
      const zaloUrl = `https://zalo.me/${cleanPhone}`;
      if (typeof window !== 'undefined') {
        window.open(zaloUrl, '_blank');
      } else {
        Linking.openURL(zaloUrl).catch(() => {});
      }
      showGlobalToast(
        customerName ? `Đang chuyển tiếp tới Zalo của ${customerName}...` : 'Đang chuyển tiếp tới Zalo...',
        'info'
      );
      return;
    }

    // Fallback khi không có số điện thoại: Mở app Zalo và tự động tải ảnh về máy
    const defaultZaloUrl = 'https://zalo.me';
    if (typeof window !== 'undefined') {
      window.open(defaultZaloUrl, '_blank');
    } else {
      Linking.openURL(defaultZaloUrl).catch(() => {});
    }
    showGlobalToast('Đang mở ứng dụng Zalo...', 'info');
  } catch (mobileErr) {
    console.error('Lỗi khi chuyển tiếp Zalo trên điện thoại:', mobileErr);
    showGlobalToast('Không thể mở chuyển tiếp Zalo.', 'error');
  }
};

/**
 * Hàm xử lý xuất / tải nhiều ảnh cùng lúc:
 * - Trên PC (Web PC): Tự động tải tất cả các file ảnh về máy tính lần lượt.
 * - Trên Mobile (Web điện thoại): Chuyển tiếp tất cả các ảnh xuất sang Zalo (qua Web Share API chứa danh sách Files).
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
            blobUrl = URL.createObjectURL(blob);
            downloadUrl = blobUrl;
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

        showGlobalToast(`Đã tải về thành công ${downloadedCount} ảnh bảng kê về máy tính!`, 'success');
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

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.imageUri) continue;

      const fileName = item.fileName || `Bang_ke_${i + 1}.png`;
      if (item.imageUri.startsWith('data:image/')) {
        const blob = base64ToBlob(item.imageUri);
        if (blob) {
          filesToShare.push(new File([blob], fileName, { type: blob.type || 'image/png' }));
        }
      } else if (item.imageUri.startsWith('http://') || item.imageUri.startsWith('https://')) {
        try {
          const res = await fetch(item.imageUri);
          const blob = await res.blob();
          filesToShare.push(new File([blob], fileName, { type: blob.type || 'image/png' }));
        } catch (fetchErr) {
          console.warn('[MultiShare] Không thể fetch file:', item.fileName, fetchErr);
        }
      }
    }

    // Nếu trình duyệt hỗ trợ chia sẻ nhiều file qua Web Share API (mở bảng chia sẻ tới Zalo)
    if (
      typeof navigator !== 'undefined' &&
      navigator.share &&
      filesToShare.length > 0 &&
      navigator.canShare &&
      navigator.canShare({ files: filesToShare })
    ) {
      try {
        await navigator.share({
          files: filesToShare,
          title: title,
          text: text,
        });
        showGlobalToast('Đã mở chia sẻ thành công!', 'success');
        return { success: true, sharedVia: 'mobile_share' };
      } catch (shareErr) {
        if (shareErr.name === 'AbortError') {
          // Người dùng chủ động đóng hộp thoại chia sẻ
          return { success: true, sharedVia: 'cancelled_by_user' };
        }
        console.warn('[WebShare Multi] Chia sẻ nhiều file không thành công:', shareErr);
      }
    }

    // Fallback: nếu không thể share gộp tất cả file 1 lần, mở Zalo
    const defaultZaloUrl = 'https://zalo.me';
    if (typeof window !== 'undefined') {
      window.open(defaultZaloUrl, '_blank');
    } else {
      Linking.openURL(defaultZaloUrl).catch(() => {});
    }
    showGlobalToast('Đang mở ứng dụng Zalo để chuyển tiếp ảnh...', 'info');
    return { success: true, sharedVia: 'mobile_fallback' };

  } catch (err) {
    console.error('Lỗi khi chuyển tiếp ảnh Zalo hàng loạt trên Mobile:', err);
    showGlobalToast('Không thể mở chuyển tiếp Zalo.', 'error');
    return { success: false, sharedVia: 'mobile_error' };
  }
};
