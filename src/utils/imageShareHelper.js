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
 * Kiểm tra xem người dùng có đang truy cập từ trình duyệt tích hợp của Zalo (In-App Browser / WebView) hay không
 * @returns {boolean}
 */
export const isZaloBrowser = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Zalo/i.test(ua);
};

/**
 * Hàm sao chép nội dung văn bản vào Clipboard an toàn (hỗ trợ cả Clipboard API và textarea fallback)
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export const copyTextToClipboard = async (text) => {
  if (!text) return false;
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {}
  }
  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (success) return true;
    } catch (_) {}
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
 * Bổ sung lastModified và index riêng biệt để tránh bug ContentProvider Android / Zalo cache trùng URI
 * @param {Blob} blob
 * @param {string} fileName
 * @param {number} [index=0]
 * @returns {File|Blob|null}
 */
export const createFileFromBlob = (blob, fileName, index = 0) => {
  if (!blob) return null;
  const modTimestamp = Date.now() + (index + 1) * 1000;
  try {
    if (typeof File !== 'undefined') {
      return new File([blob], fileName, {
        type: blob.type || 'image/png',
        lastModified: modTimestamp,
      });
    }
  } catch (fileErr) {
    console.warn('Trình duyệt không hỗ trợ File constructor, sử dụng Blob:', fileErr);
  }
  try {
    blob.name = fileName;
    blob.lastModified = modTimestamp;
    blob.lastModifiedDate = new Date(modTimestamp);
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

  // ─── 1. TRƯỜNG HỢP PC: LUÔN TẢI FILE ẢNH VỀ MÁY TÍNH & SAO CHÉP TEXT NẾU CÓ ───
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

        // Tự động sao chép text hóa đơn vào bộ nhớ tạm nếu có
        if (text && typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
          try {
            await navigator.clipboard.writeText(text);
            showGlobalToast('Đã tải ảnh về máy tính & sao chép nội dung hóa đơn để dán vào Zalo!', 'success');
          } catch (_) {
            showGlobalToast('Đã tải ảnh về máy tính thành công!', 'success');
          }
        } else {
          showGlobalToast('Đã tải ảnh về máy tính thành công!', 'success');
        }
      }
    } catch (err) {
      console.error('Lỗi khi tải ảnh trên PC:', err);
      showGlobalToast('Không thể tải ảnh về máy tính. Vui lòng thử lại.', 'error');
    }
    return;
  }

  // ─── 2. TRƯỜNG HỢP MOBILE: LUÔN CHUYỂN TIẾP ZALO (ẢNH + TEXT HÓA ĐƠN) ───
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

    // Sao chép nội dung text ngầm song song (không await để không làm mất quyền User Activation)
    if (text) {
      copyTextToClipboard(text);
    }

    const inZaloApp = isZaloBrowser();

    // Thử chia sẻ qua Web Share API (mở bảng chia sẻ hệ thống có Zalo)
    // Bỏ qua nếu đang mở bên trong Zalo in-app WebView vì Zalo WebView không hỗ trợ Web Share
    if (
      !inZaloApp &&
      typeof navigator !== 'undefined' &&
      navigator.share &&
      fileToShare &&
      navigator.canShare
    ) {
      let canShareWithText = false;
      let canShareFileOnly = false;
      if (text) {
        try {
          canShareWithText = navigator.canShare({ files: [fileToShare], text });
        } catch (_) {
          canShareWithText = false;
        }
      }
      try {
        canShareFileOnly = navigator.canShare({ files: [fileToShare] });
      } catch (_) {
        canShareFileOnly = false;
      }

      if (canShareWithText || canShareFileOnly) {
        try {
          if (canShareWithText && text) {
            await navigator.share({
              files: [fileToShare],
              text,
              title: title || 'Hóa đơn giao hàng',
            });
            showGlobalToast('Đã chuyển tiếp ảnh & nội dung hóa đơn sang Zalo!', 'success');
            return;
          } else {
            await navigator.share({
              files: [fileToShare],
            });
            if (text) {
              showGlobalToast('Đã chuyển tiếp ảnh sang Zalo (Nội dung hóa đơn đã sao chép sẵn vào bộ nhớ tạm)!', 'success');
            }
            return;
          }
        } catch (shareErr) {
          if (shareErr.name === 'AbortError') {
            return; // Người dùng chủ động đóng bảng chia sẻ
          }
          // Nếu chia sẻ kèm text thất bại do trình duyệt, thử lại chia sẻ riêng file ảnh
          if (canShareFileOnly && canShareWithText) {
            try {
              await navigator.share({ files: [fileToShare] });
              if (text) {
                showGlobalToast('Đã chuyển tiếp ảnh sang Zalo (Nội dung hóa đơn đã sao chép sẵn vào bộ nhớ tạm)!', 'success');
              }
              return;
            } catch (retryErr) {
              if (retryErr.name === 'AbortError') return;
            }
          }
          console.warn('[WebShare] Bảng chia sẻ file thất bại, chuyển sang lưu ảnh:', shareErr);
        }
      }
    }

    // Fallback: Tự động lưu ảnh vào máy nếu Web Share không mở được (hoặc trong Zalo In-App Browser)
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

    // Đảm bảo sao chép nội dung text vào Clipboard
    if (text) {
      await copyTextToClipboard(text);
    }

    // Thông báo cho người dùng trên Mobile thay vì redirect sang link zalo.me rỗng
    showGlobalToast(
      text
        ? 'Đã tải ảnh về máy & sao chép nội dung! Bạn chỉ cần chọn ảnh và Dán (Paste) vào Zalo để gửi.'
        : 'Đã tải ảnh hóa đơn về máy thành công!',
      'success'
    );
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

        // Tự động sao chép text hóa đơn vào bộ nhớ tạm nếu có
        if (text && typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
          try {
            await navigator.clipboard.writeText(text);
            showGlobalToast(`Đã tải về thành công ${downloadedCount} ảnh và sao chép nội dung hóa đơn để dán vào Zalo!`, 'success');
          } catch (_) {
            showGlobalToast(`Đã tải về thành công ${downloadedCount} ảnh báo cáo về máy tính!`, 'success');
          }
        } else {
          showGlobalToast(`Đã tải về thành công ${downloadedCount} ảnh báo cáo về máy tính!`, 'success');
        }
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

      const rawFileName = item.fileName || `Bao_cao_${i + 1}.png`;
      const extMatch = rawFileName.match(/\.[a-zA-Z0-9]+$/);
      const ext = extMatch ? extMatch[0] : '.png';
      const cleanBase = rawFileName.replace(ext, '');
      const uniqueFileName = `${cleanBase}_${i + 1}_${Date.now().toString(36)}${ext}`;

      if (item.imageUri.startsWith('data:image/')) {
        const blob = base64ToBlob(item.imageUri);
        if (blob) {
          blobDownloads.push({ blob, fileName: rawFileName });
          const file = createFileFromBlob(blob, uniqueFileName, i);
          if (file) filesToShare.push(file);
        }
      } else if (item.imageUri.startsWith('http://') || item.imageUri.startsWith('https://')) {
        try {
          const res = await fetch(item.imageUri);
          const blob = await res.blob();
          blobDownloads.push({ blob, fileName: rawFileName });
          const file = createFileFromBlob(blob, uniqueFileName, i);
          if (file) filesToShare.push(file);
        } catch (fetchErr) {
          console.warn('[MultiShare] Không thể fetch file:', item.fileName, fetchErr);
        }
      }
    }

    // Tự động sao chép trước nội dung text vào clipboard nếu có (không await để không chặn user activation)
    if (text) {
      copyTextToClipboard(text);
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
          setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
          // Tăng khoảng chờ giữa các file trên Mobile lên 750ms để trình duyệt không chặn popup download hàng loạt
          if (i < blobDownloads.length - 1) {
            await new Promise((r) => setTimeout(r, 750));
          }
        } catch (dlErr) {
          console.warn('Lỗi khi tải ảnh về thiết bị:', fileName, dlErr);
        }
      }
      // Đợi thêm 1200ms sau file cuối cùng để trình duyệt mobile hoàn tất kết nối download trước khi chuyển trang
      await new Promise((r) => setTimeout(r, 1200));
    };

    const inZaloApp = isZaloBrowser();

    // Kiểm tra khả năng hỗ trợ Web Share API (bỏ qua nếu trong Zalo WebView)
    let canUseWebShare = false;
    if (
      !inZaloApp &&
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
        let canShareWithText = false;
        if (text) {
          try {
            canShareWithText = navigator.canShare({ files: filesToShare, text });
          } catch (_) {
            canShareWithText = false;
          }
        }

        if (canShareWithText && text) {
          await navigator.share({
            files: filesToShare,
            text,
            title: title || 'Hóa đơn giao hàng',
          });
          showGlobalToast('Đã chuyển tiếp các ảnh & nội dung hóa đơn sang Zalo!', 'success');
          return { success: true, sharedVia: 'mobile_share' };
        } else {
          await navigator.share({
            files: filesToShare,
          });
          if (text) {
            showGlobalToast('Đã chuyển tiếp các ảnh sang Zalo (Nội dung hóa đơn đã sao chép sẵn vào bộ nhớ tạm)!', 'success');
          } else {
            showGlobalToast('Đã mở chia sẻ Zalo thành công!', 'success');
          }
          return { success: true, sharedVia: 'mobile_share' };
        }
      } catch (shareErr) {
        if (shareErr.name === 'AbortError') {
          // Người dùng chủ động đóng hộp thoại chia sẻ
          return { success: true, sharedVia: 'cancelled_by_user' };
        }
        console.warn('[WebShare Multi] Chia sẻ nhiều file không thành công, lưu ảnh về máy:', shareErr);
      }
    }

    // Fallback khi Web Share không thể mở (hoặc trong Zalo In-App Browser):
    // 1. Lưu tất cả ảnh về thư viện ảnh/tệp của máy
    await saveAllImagesLocally();

    // 2. Đảm bảo sao chép nội dung text vào clipboard nếu có
    if (text) {
      await copyTextToClipboard(text);
    }

    showGlobalToast(
      text
        ? `Đã lưu ${blobDownloads.length} ảnh vào máy & sao chép nội dung! Bạn chỉ cần chọn ảnh và Dán (Paste) vào Zalo để gửi.`
        : `Đã lưu ${blobDownloads.length} ảnh vào máy thành công!`,
      'success'
    );
    return { success: true, sharedVia: 'mobile_download' };

  } catch (err) {
    console.error('Lỗi khi chuyển tiếp ảnh Zalo hàng loạt trên Mobile:', err);
    showGlobalToast('Không thể mở chuyển tiếp Zalo.', 'error');
    return { success: false, sharedVia: 'mobile_error' };
  }
};

/**
 * Hàm chuyên dụng gửi nội dung văn bản hóa đơn sang Zalo (dành cho hóa đơn Video hoặc text thuần):
 * - Tự động sao chép nội dung vào Clipboard.
 * - Trên Mobile: Mở menu chia sẻ Web Share API (chọn Zalo) hoặc mở trực tiếp chat Zalo theo số điện thoại.
 * - Trên PC: Mở Zalo Web / chat và thông báo đã copy text, người dùng chỉ cần dán (Ctrl+V).
 *
 * @param {Object} params
 * @param {string} params.text - Nội dung hóa đơn văn bản
 * @param {string} [params.title] - Tiêu đề chia sẻ
 * @param {string} [params.phone] - Số điện thoại khách hàng (để mở chat trực tiếp)
 * @param {string} [params.customerName] - Tên khách hàng
 * @returns {Promise<boolean>}
 */
export const shareTextToZalo = async ({
  text = '',
  title = 'Hóa đơn',
  phone = '',
  customerName = '',
}) => {
  if (!text) {
    showGlobalToast('Chưa có nội dung để gửi.', 'warning');
    return false;
  }

  const isMobile = isMobileDevice();
  const inZaloApp = isZaloBrowser();

  // 1. Trên Mobile (nếu KHÔNG phải trong Zalo in-app WebView) và trình duyệt hỗ trợ Web Share API:
  // BẮT BUỘC gọi navigator.share TRƯỚC HẾT để không làm mất quyền User Activation
  if (isMobile && !inZaloApp && typeof navigator !== 'undefined' && navigator.share) {
    try {
      let canShareText = true;
      if (navigator.canShare) {
        try {
          canShareText = navigator.canShare({ text });
        } catch (_) {
          canShareText = true;
        }
      }
      if (canShareText) {
        // Sao chép ngầm vào clipboard song song (không await chặn quyền user gesture)
        copyTextToClipboard(text);

        await navigator.share({
          title: title || 'Hóa đơn giao hàng',
          text,
        });
        showGlobalToast('Đã mở bảng chuyển tiếp tin nhắn sang Zalo!', 'success');
        return true;
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        // Người dùng chủ động đóng hộp thoại chia sẻ
        return false;
      }
      console.warn('[WebShare Text] Không thể mở bảng chia sẻ, chuyển sang phương án copy:', err);
    }
  }

  // 2. Sao chép nội dung vào Clipboard
  await copyTextToClipboard(text);

  // 3. Xử lý theo thiết bị:
  if (isMobile) {
    // Trên Mobile (kể cả trong Zalo In-App Browser): TUYỆT ĐỐI KHÔNG redirect sang link zalo.me vì link không nhận text
    showGlobalToast(
      'Đã sao chép nội dung hóa đơn! Bạn chỉ cần chạm giữ và Dán (Paste) vào khung chat Zalo để gửi.',
      'success'
    );
    return true;
  }

  // Trên PC: Mở Zalo Web hoặc chat Zalo theo SĐT và thông báo đã copy text
  const cleanPhone = phone ? String(phone).replace(/[^0-9]/g, '') : '';
  const targetZaloUrl = cleanPhone ? `https://zalo.me/${cleanPhone}` : 'https://chat.zalo.me';
  if (typeof window !== 'undefined') {
    window.open(targetZaloUrl, '_blank');
  } else {
    Linking.openURL(targetZaloUrl).catch(() => {});
  }

  showGlobalToast(
    customerName
      ? `Đã sao chép nội dung hóa đơn & mở Zalo của [${customerName}]! Nhấn Ctrl+V để gửi.`
      : 'Đã sao chép nội dung hóa đơn & mở Zalo! Nhấn Ctrl+V để gửi.',
    'success'
  );
  return true;
};


