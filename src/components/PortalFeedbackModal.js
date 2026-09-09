// meat-management-fe/src/components/PortalFeedbackModal.js
import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import SmoothModal from './SmoothModal';
import { SHADOWS } from '../theme';
import { showGlobalToast } from '../store/toastStore';
import axios from 'axios';

const PortalFeedbackModal = forwardRef(({ token, apiHost, onSubmitted }, ref) => {
  const [visible, setVisible] = useState(false);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);

  const inputRef = useRef(null);

  useImperativeHandle(ref, () => ({
    open: (opts = {}) => {
      if (opts.currentCustomer) {
        setSelectedBranch(opts.currentCustomer);
      } else if (opts.branches && opts.branches.length > 0) {
        setSelectedBranch(opts.branches[0]);
      }
      setSessionToken(opts.sessionToken || null);
      setContent(opts.defaultContent || '');
      setVisible(true);

      // Tự động focus vào ô textarea khi mở modal
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Gửi phản hồi về máy chủ cho bên Trường Bò
  const handleSubmit = async () => {
    if (!content.trim()) {
      showGlobalToast('Vui lòng nhập nội dung phản hồi.', 'error');
      inputRef.current?.focus();
      return;
    }

    try {
      setLoading(true);
      const headers = {};
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }

      const host = apiHost || 'http://127.0.0.1:3000';
      await axios.post(
        `${host}/api/v1/portal/feedback/${token}`,
        {
          customerId: selectedBranch?.id || null,
          senderName: 'Nhóm Zalo',
          type: 'FEEDBACK',
          content: content.trim(),
        },
        { headers }
      );

      showGlobalToast('Gửi phản hồi thành công! Trường Bò đã nhận được ý kiến để kiểm tra xử lý.', 'success');
      setVisible(false);
      if (onSubmitted) onSubmitted();
    } catch (err) {
      const msg = err.response?.data?.message || 'Có lỗi xảy ra khi gửi phản hồi. Vui lòng thử lại.';
      showGlobalToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SmoothModal
      visible={visible}
      onClose={() => setVisible(false)}
      centered={Platform.OS === 'web'}
    >
      <View style={styles.modalView}>
        {/* Header modal */}
        <View style={styles.modalHeaderRow}>
          <View style={styles.modalHeaderLeft}>
            <View style={styles.headerIconCircle}>
              <Text style={styles.headerIcon}>💬</Text>
            </View>
            <View style={styles.modalHeaderTitleCol}>
              <Text style={styles.modalTitle}>PHẢN ÁNH</Text>
              <Text style={styles.modalSubTitle}>
                Gửi ý kiến phản ánh trực tiếp về bên Trường Bò
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.closeHeaderBtn}
            onPress={() => setVisible(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.closeHeaderBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Thân modal: chỉ hiển thị đúng 1 ô text area focus sẵn, cố định height và cho phép scroll */}
        <View style={styles.body}>
          <TextInput
            ref={inputRef}
            style={styles.textArea}
            placeholder="Nhập phản ánh của bạn (ví dụ: sai tiền thịt, đơn nợ không đúng, sai số cân... để chuyển về cho bên Trường Bò kiểm tra xử lý)"
            placeholderTextColor="#94A3B8"
            value={content}
            onChangeText={setContent}
            multiline
            numberOfLines={6}
            scrollEnabled={true}
            textAlignVertical="top"
            autoFocus={true}
          />
        </View>

        {/* Nút hành động */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => setVisible(false)}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelBtnText}>Đóng</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>Gửi cho Trường Bò</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SmoothModal>
  );
});

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderRadius: Platform.OS === 'web' ? 18 : 0,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
    flexDirection: 'column',
    ...SHADOWS.large,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    fontSize: 20,
  },
  modalHeaderTitleCol: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  modalSubTitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  closeHeaderBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  closeHeaderBtnText: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: 'bold',
  },
  body: {
    marginVertical: 4,
  },
  textArea: {
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14.5,
    lineHeight: 22,
    backgroundColor: '#F8FAFC',
    color: '#0F172A',
    height: 150,
    maxHeight: 150,
    overflowY: 'auto',
    textAlignVertical: 'top',
    outlineStyle: 'none',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 14,
  },
  submitBtn: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 8,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});

export default PortalFeedbackModal;
