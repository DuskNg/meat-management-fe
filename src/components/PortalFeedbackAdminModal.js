// meat-management-fe/src/components/PortalFeedbackAdminModal.js
import React, { useState, forwardRef, useImperativeHandle, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  Image,
  TextInput,
} from 'react-native';
import SmoothModal from './SmoothModal';
import { api } from '../api/client';
import { COLORS, SHADOWS } from '../theme';
import { showGlobalToast } from '../store/toastStore';

const TYPE_LABELS = {
  DISCREPANCY: '⚠️ Lệch tiền / Lệch cân',
  PRICE_INQUIRY: '❓ Thắc mắc đơn giá',
  PAYMENT_CONFIRM: '💵 Báo đã chuyển khoản',
  OTHER: '📝 Góp ý khác',
};

const formatDate = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return `${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${d.toLocaleDateString('vi-VN')}`;
};

const PortalFeedbackAdminModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedbacks, setFeedbacks] = useState([]);
  const [statusFilter, setStatusFilter] = useState('pending'); // 'pending' | 'resolved' | ''
  const [resolvingId, setResolvingId] = useState(null);
  const [adminNote, setAdminNote] = useState('');

  const fetchFeedbacks = async (status = statusFilter) => {
    try {
      setLoading(true);
      const res = await api.get('/portal/manage/feedbacks', {
        params: { status: status || undefined },
      });
      setFeedbacks(res.data?.data || []);
    } catch (err) {
      console.error('Lỗi tải phản hồi portal:', err);
    } finally {
      setLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    open: (initialStatus = 'pending') => {
      setStatusFilter(initialStatus);
      setVisible(true);
      fetchFeedbacks(initialStatus);
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Đánh dấu đã xử lý phản hồi
  const handleResolve = async (id, status = 'resolved') => {
    try {
      await api.put(`/portal/manage/feedbacks/${id}`, {
        status,
        adminNote: adminNote.trim() || undefined,
      });

      showGlobalToast(
        status === 'resolved' ? 'Đã đánh dấu xử lý phản hồi thành công!' : 'Đã bác bỏ phản hồi.'
      );
      setResolvingId(null);
      setAdminNote('');
      fetchFeedbacks();
    } catch (err) {
      showGlobalToast(err.response?.data?.message || 'Không thể cập nhật phản hồi.', 'error');
    }
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        {/* HEADER MODAL CHUẨN CÓ NÚT ĐÓNG ✕ */}
        <View style={styles.modalHeaderRow}>
          <View style={styles.modalHeaderLeft}>
            <View style={styles.headerIconCircle}>
              <Text style={styles.headerIcon}>💬</Text>
            </View>
            <View style={styles.modalHeaderTitleCol}>
              <Text style={styles.modalTitle}>Ý KIẾN & KHIẾU NẠI TỪ KHÁCH</Text>
              <Text style={styles.modalSubTitle}>
                Theo dõi và giải quyết thắc mắc, lệch cân, chuyển khoản từ nhóm Zalo
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

        {/* THANH LỌC TRẠNG THÁI */}
        <View style={styles.filterBar}>
          <TouchableOpacity
            style={[styles.filterBtn, statusFilter === 'pending' && styles.filterBtnActive]}
            onPress={() => {
              setStatusFilter('pending');
              fetchFeedbacks('pending');
            }}
          >
            <Text style={[styles.filterBtnText, statusFilter === 'pending' && styles.filterBtnTextActive]}>
              Chờ xử lý
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterBtn, statusFilter === 'resolved' && styles.filterBtnActive]}
            onPress={() => {
              setStatusFilter('resolved');
              fetchFeedbacks('resolved');
            }}
          >
            <Text style={[styles.filterBtnText, statusFilter === 'resolved' && styles.filterBtnTextActive]}>
              Đã xử lý
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterBtn, statusFilter === '' && styles.filterBtnActive]}
            onPress={() => {
              setStatusFilter('');
              fetchFeedbacks('');
            }}
          >
            <Text style={[styles.filterBtnText, statusFilter === '' && styles.filterBtnTextActive]}>
              Tất cả
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color="#10B981" />
            <Text style={styles.loadingText}>Đang tải danh sách phản hồi...</Text>
          </View>
        ) : feedbacks.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>Không có ý kiến hoặc khiếu nại nào trong mục này.</Text>
          </View>
        ) : (
          <ScrollView style={styles.feedbackList} showsVerticalScrollIndicator={false}>
            {feedbacks.map((fb) => {
              let parsedImages = [];
              if (fb.imageUrls) {
                try {
                  parsedImages = typeof fb.imageUrls === 'string' ? JSON.parse(fb.imageUrls) : fb.imageUrls;
                  if (!Array.isArray(parsedImages)) parsedImages = [parsedImages];
                } catch (_) {
                  parsedImages = [fb.imageUrls];
                }
              }

              const isResolving = resolvingId === fb.id;

              return (
                <View key={fb.id} style={styles.feedbackCard}>
                  <View style={styles.cardTopRow}>
                    <View style={styles.typeBadge}>
                      <Text style={styles.typeBadgeText}>
                        {TYPE_LABELS[fb.type] || 'Phản hồi'}
                      </Text>
                    </View>
                    <Text style={styles.dateText}>{formatDate(fb.createdAt)}</Text>
                  </View>

                  <View style={styles.infoRow}>
                    <Text style={styles.groupText}>
                      Nhóm: <Text style={{ fontWeight: 'bold' }}>{fb.portalLink?.name}</Text>
                    </Text>
                    {fb.customer && (
                      <Text style={styles.branchText}>
                        📍 Cơ sở: <Text style={{ fontWeight: 'bold' }}>{fb.customer.name}</Text>
                      </Text>
                    )}
                  </View>

                  <Text style={styles.senderText}>
                    Người gửi: <Text style={{ fontWeight: '600' }}>{fb.senderName || 'Người trong nhóm'}</Text>
                    {fb.phone ? ` • SĐT: ${fb.phone}` : ''}
                  </Text>

                  <View style={styles.contentWrap}>
                    <Text style={styles.contentText}>{fb.content}</Text>
                  </View>

                  {/* Ảnh đính kèm */}
                  {parsedImages.length > 0 && (
                    <ScrollView horizontal style={styles.imageList} showsHorizontalScrollIndicator={false}>
                      {parsedImages.map((img, i) => (
                        <Image key={i} source={{ uri: img }} style={styles.imageThumb} />
                      ))}
                    </ScrollView>
                  )}

                  {/* Trạng thái & nút xử lý */}
                  {fb.status === 'pending' ? (
                    <View style={styles.actionWrap}>
                      {isResolving ? (
                        <View style={styles.resolveInputWrap}>
                          <TextInput
                            style={styles.resolveInput}
                            placeholder="Ghi chú xử lý (VD: Đã sửa lại cân đơn ngày 06/09)..."
                            value={adminNote}
                            onChangeText={setAdminNote}
                          />
                          <View style={styles.resolveActionsRow}>
                            <TouchableOpacity
                              style={styles.cancelActionBtn}
                              onPress={() => setResolvingId(null)}
                            >
                              <Text style={styles.cancelActionText}>Hủy</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.confirmResolveBtn}
                              onPress={() => handleResolve(fb.id, 'resolved')}
                            >
                              <Text style={styles.confirmResolveText}>Hoàn tất xử lý</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <View style={styles.actionBtnsRow}>
                          <TouchableOpacity
                            style={styles.rejectBtn}
                            onPress={() => handleResolve(fb.id, 'rejected')}
                          >
                            <Text style={styles.rejectBtnText}>Bác bỏ</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.resolveBtn}
                            onPress={() => {
                              setResolvingId(fb.id);
                              setAdminNote('');
                            }}
                          >
                            <Text style={styles.resolveBtnText}>✓ Đã xử lý xong</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={styles.resolvedBadge}>
                      <Text style={styles.resolvedBadgeText}>
                        {fb.status === 'resolved' ? '✅ Đã giải quyết' : '❌ Đã bác bỏ'}
                        {fb.adminNote ? ` • Ghi chú: ${fb.adminNote}` : ''}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    </SmoothModal>
  );
});

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    width: '100%',
    maxWidth: 680,
    height: '85%',
    maxHeight: '94%',
    minHeight: 520,
    alignSelf: 'center',
    flexDirection: 'column',
    ...SHADOWS.large,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
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
    backgroundColor: '#FEF3C7',
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
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.2,
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
  filterBar: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 3,
    marginBottom: 14,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  filterBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  filterBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterBtnTextActive: {
    color: '#111827',
    fontWeight: 'bold',
  },
  loadingWrap: {
    padding: 30,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 13,
    color: '#6B7280',
  },
  emptyWrap: {
    padding: 30,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  feedbackList: {
    maxHeight: 480,
  },
  feedbackCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    marginBottom: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#B45309',
  },
  dateText: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 4,
  },
  groupText: {
    fontSize: 13,
    color: '#374151',
  },
  branchText: {
    fontSize: 13,
    color: '#1D4ED8',
  },
  senderText: {
    fontSize: 12,
    color: '#4B5563',
    marginBottom: 8,
  },
  contentWrap: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
    marginBottom: 8,
  },
  contentText: {
    fontSize: 13,
    color: '#1F2937',
    lineHeight: 18,
  },
  imageList: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  imageThumb: {
    width: 60,
    height: 60,
    borderRadius: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  actionWrap: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 10,
  },
  actionBtnsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  rejectBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },
  rejectBtnText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
  },
  resolveBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: '#10B981',
  },
  resolveBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  resolveInputWrap: {
    marginTop: 4,
  },
  resolveInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    backgroundColor: '#F9FAFB',
    marginBottom: 8,
  },
  resolveActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  cancelActionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
  },
  cancelActionText: {
    color: '#4B5563',
    fontSize: 12,
  },
  confirmResolveBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: '#10B981',
  },
  confirmResolveText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  resolvedBadge: {
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#ECFDF5',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  resolvedBadgeText: {
    fontSize: 12,
    color: '#065F46',
    fontWeight: '500',
  },
});

export default PortalFeedbackAdminModal;
