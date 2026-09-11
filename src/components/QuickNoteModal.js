// meat-management-fe/src/components/QuickNoteModal.js
import React, {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  useCallback,
} from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Platform,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import SmoothModal from './SmoothModal';
import { COLORS } from '../theme';
import { showGlobalToast } from '../store/toastStore';

// Khoá lưu ghi chú trong localStorage / SecureStore
const STORAGE_KEY = 'quick_note_content';
const MAX_LENGTH = 10000;

// Helper đọc ghi chú đa nền tảng
const loadNoteFromStorage = async () => {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(STORAGE_KEY) || '';
      }
    } else {
      const val = await SecureStore.getItemAsync(STORAGE_KEY);
      return val || '';
    }
  } catch (e) {
    console.error('Lỗi đọc ghi chú:', e);
  }
  return '';
};

// Helper lưu ghi chú đa nền tảng
const persistNoteToStorage = async (text) => {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, text);
      }
    } else {
      await SecureStore.setItemAsync(STORAGE_KEY, text);
    }
  } catch (e) {
    console.error('Lỗi lưu ghi chú:', e);
  }
};

/**
 * Modal Ghi Chú Nhanh:
 * - Hiển thị textarea rộng rãi để lưu mẹo công việc, giá riêng từng quán, lưu ý nợ
 * - Tự động lưu sau 600ms debounce
 * - Hỗ trợ nút Lưu thủ công và Xóa trắng
 * - Mở lại vẫn giữ nguyên nội dung
 */
const QuickNoteModal = forwardRef((_props, ref) => {
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState('');
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saving' | 'saved'
  const saveTimerRef = useRef(null);

  // Mở modal và khôi phục nội dung đã lưu
  useImperativeHandle(ref, () => ({
    open: async () => {
      const saved = await loadNoteFromStorage();
      setText(saved);
      setSaveStatus('saved');
      setVisible(true);
    },
    close: () => setVisible(false),
  }));

  // Xử lý thay đổi văn bản: cập nhật state và tự động lưu debounce
  const handleChange = useCallback((val) => {
    if (val.length > MAX_LENGTH) return;
    setText(val);
    setSaveStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await persistNoteToStorage(val);
      setSaveStatus('saved');
    }, 600);
  }, []);

  // Nút Lưu thủ công
  const handleManualSave = async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus('saving');
    await persistNoteToStorage(text);
    setSaveStatus('saved');
    showGlobalToast('Đã lưu ghi chú thành công!', 'success');
  };

  // Xóa toàn bộ ghi chú
  const handleClear = async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setText('');
    await persistNoteToStorage('');
    setSaveStatus('saved');
    showGlobalToast('Đã xóa toàn bộ ghi chú.', 'info');
  };

  // Dọn dẹp timer khi unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)} zIndex={88000}>
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerIcon}>📝</Text>
            <View>
              <Text style={styles.headerTitle}>Ghi chú cần nhớ</Text>
              <Text style={styles.headerSub}>Tự động lưu · Lưu giá riêng, mẹo việc, lưu ý</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <View style={[styles.saveBadge, saveStatus === 'saving' && styles.saveBadgeSaving]}>
              <Text style={[styles.saveBadgeText, saveStatus === 'saving' && styles.saveBadgeTextSaving]}>
                {saveStatus === 'saving' ? '⏳ Đang lưu...' : '✓ Đã lưu'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setVisible(false)} style={styles.closeBtn} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Textarea ghi chú */}
        <TextInput
          style={styles.textarea}
          multiline
          value={text}
          onChangeText={handleChange}
          placeholder="Gõ ghi chú, giá riêng từng quán, việc cần nhớ tại đây...&#10;(Ví dụ: Bún riêu nvl 220k, Bún riêu đan phượng 225k... Tự động lưu không bị mất)"
          placeholderTextColor="#94A3B8"
          textAlignVertical="top"
          autoFocus
          scrollEnabled
        />

        {/* Footer: nút lưu thủ công + nút xóa */}
        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <Text style={styles.charCount}>
              {text.length} ký tự
            </Text>
          </View>

          <View style={styles.footerRight}>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleManualSave}
              activeOpacity={0.8}
            >
              <Text style={styles.saveBtnText}>💾 Lưu lại</Text>
            </TouchableOpacity>

            {text.trim().length > 0 && (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={handleClear}
                activeOpacity={0.7}
              >
                <Text style={styles.clearBtnText}>🗑️ Xóa hết</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </SmoothModal>
  );
});

QuickNoteModal.displayName = 'QuickNoteModal';
export default QuickNoteModal;

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 580,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FAFBFC',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: { fontSize: 24 },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  headerSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  saveBadge: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  saveBadgeSaving: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
  },
  saveBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#065F46',
  },
  saveBadgeTextSaving: { color: '#92400E' },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: 'bold',
  },
  textarea: {
    minHeight: 320,
    maxHeight: 480,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    lineHeight: 22,
    color: '#1E293B',
    backgroundColor: '#FFFFFF',
    outlineWidth: 0,
    outlineStyle: 'none',
    borderWidth: 0,
    fontFamily: Platform.OS === 'web' ? 'inherit' : undefined,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FAFBFC',
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  charCount: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saveBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  clearBtn: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
});
