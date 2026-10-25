// meat-management-fe/src/components/SepayWebhookGuideModal.js
import React, { useState, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Platform,
} from 'react-native';
import SmoothModal from './SmoothModal';
import AnimatedPressable from './AnimatedPressable';
import { COLORS } from '../theme';
import { showGlobalToast } from '../store/toastStore';

const TouchableOpacity = AnimatedPressable;

/**
 * Modal hiển thị hướng dẫn chi tiết từng bước kết nối SePay Webhook
 * Tuân thủ chuẩn Bottom-Sheet, Mobile-First, forwardRef & useImperativeHandle
 */
const SepayWebhookGuideModal = forwardRef(({ webhookUrl }, ref) => {
  const [visible, setVisible] = useState(false);

  useImperativeHandle(ref, () => ({
    open: () => setVisible(true),
    close: () => setVisible(false),
  }));

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(webhookUrl);
      showGlobalToast('Đã sao chép link Webhook SePay!', 'success');
    } else {
      showGlobalToast(`URL Webhook: ${webhookUrl}`, 'info');
    }
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        {/* HEADER MODAL */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.headerIcon}>🔗</Text>
            <Text style={styles.headerTitle}>HƯỚNG DẪN KẾT NỐI SEPAY</Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtnCircle}
            onPress={() => setVisible(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.closeBtnCircleText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* NỘI DUNG CUỘN */}
        <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
          {/* KHỐI 1: LINK WEBHOOK CẦN DÁN VÀO SEPAY */}
          <View style={styles.urlCard}>
            <Text style={styles.urlLabel}>ĐƯỜNG DẪN WEBHOOK CỦA BẠN (URL):</Text>
            <View style={styles.urlRow}>
              <Text style={styles.urlText} numberOfLines={2}>
                {webhookUrl}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.copyBtn}
              onPress={handleCopy}
              activeOpacity={0.8}
            >
              <Text style={styles.copyBtnText}>📋 Sao chép đường dẫn</Text>
            </TouchableOpacity>
          </View>

          {/* KHỐI 2: 3 BƯỚC CẤU HÌNH TRÊN SEPAY */}
          <View style={styles.stepsCard}>
            <Text style={styles.stepsTitle}>CÁC BƯỚC CẤU HÌNH TRÊN MY.SEPAY.VN:</Text>

            {/* Bước 1 */}
            <View style={styles.stepItem}>
              <View style={styles.stepNumberBadge}>
                <Text style={styles.stepNumberText}>1</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepHeading}>Đăng nhập trang quản trị SePay</Text>
                <Text style={styles.stepDesc}>
                  Truy cập <Text style={styles.boldText}>my.sepay.vn</Text> ➔ Vào menu <Text style={styles.boldText}>Tích hợp Webhook</Text> (Webhooks) ➔ Bấm nút <Text style={styles.boldText}>Thêm Webhook</Text>.
                </Text>
              </View>
            </View>

            {/* Bước 2 */}
            <View style={styles.stepItem}>
              <View style={styles.stepNumberBadge}>
                <Text style={styles.stepNumberText}>2</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepHeading}>Điền thông số Webhook</Text>
                <View style={styles.paramBox}>
                  <Text style={styles.paramLine}>• <Text style={styles.boldText}>Tài khoản ngân hàng:</Text> Chọn tài khoản của bạn</Text>
                  <Text style={styles.paramLine}>• <Text style={styles.boldText}>URL Webhook:</Text> Dán link đã sao chép ở trên</Text>
                  <Text style={styles.paramLine}>• <Text style={styles.boldText}>Kiểu dữ liệu:</Text> Chọn <Text style={styles.highlightText}>JSON (application/json)</Text></Text>
                  <Text style={styles.paramLine}>• <Text style={styles.boldText}>Sự kiện kích hoạt:</Text> Chọn <Text style={styles.highlightText}>Giao dịch tiền vào</Text></Text>
                  <Text style={styles.paramLine}>• <Text style={styles.boldText}>Xác thực:</Text> Chọn Không xác thực (hoặc API Key)</Text>
                </View>
              </View>
            </View>

            {/* Bước 3 */}
            <View style={styles.stepItem}>
              <View style={styles.stepNumberBadge}>
                <Text style={styles.stepNumberText}>3</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepHeading}>Lưu lại và Gửi thử nghiệm (Test)</Text>
                <Text style={styles.stepDesc}>
                  Bấm <Text style={styles.boldText}>Lưu Webhook</Text>, sau đó bấm nút <Text style={styles.boldText}>Gửi thử nghiệm</Text>. Ngay lập tức giao dịch mẫu sẽ được bắn sang ứng dụng Meat Management!
                </Text>
              </View>
            </View>
          </View>

          {/* KHỐI 3: MẸO TỰ ĐỘNG CẤN TRỪ NỢ (AUTO-MATCHING) */}
          <View style={styles.tipCard}>
            <View style={styles.tipHeader}>
              <Text style={styles.tipIcon}>⚡</Text>
              <Text style={styles.tipTitle}>TỰ ĐỘNG TRỪ NỢ THÔNG MINH</Text>
            </View>
            <Text style={styles.tipText}>
              Khi khách chuyển khoản, nếu trong nội dung có ghi <Text style={styles.boldText}>Số điện thoại khách hàng</Text> (ví dụ: <Text style={styles.highlightText}>0912345678</Text>), hệ thống sẽ <Text style={styles.boldText}>tự động nhận diện và tạo phiếu thu trừ nợ ngay lập tức</Text> mà bạn không cần phải bấm gán thủ công!
            </Text>
          </View>
        </ScrollView>

        {/* FOOTER FULL-WIDTH */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.closeFooterBtn}
            onPress={() => setVisible(false)}
            activeOpacity={0.8}
          >
            <Text style={styles.closeFooterBtnText}>ĐÃ HIỂU & ĐÓNG LẠI</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SmoothModal>
  );
});

export default SepayWebhookGuideModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: {
    fontSize: 18,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  closeBtnCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnCircleText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#64748B',
  },
  scrollBody: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  urlCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  urlLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  urlRow: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  urlText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803D',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  copyBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  stepsCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  stepsTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 12,
  },
  stepItem: {
    flexDirection: 'row',
    marginBottom: 14,
    gap: 10,
  },
  stepNumberBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  stepContent: {
    flex: 1,
  },
  stepHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  stepDesc: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  paramBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
    gap: 4,
  },
  paramLine: {
    fontSize: 11,
    color: '#334155',
    lineHeight: 17,
  },
  boldText: {
    fontWeight: '700',
    color: '#0F172A',
  },
  highlightText: {
    fontWeight: '700',
    color: '#059669',
  },
  tipCard: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  tipIcon: {
    fontSize: 16,
  },
  tipTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  tipText: {
    fontSize: 12,
    color: '#1E40AF',
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  closeFooterBtn: {
    backgroundColor: '#0F172A',
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFooterBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
});
