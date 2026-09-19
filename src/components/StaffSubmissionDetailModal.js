// meat-management-fe/src/components/StaffSubmissionDetailModal.js
import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle, useMemo } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import CustomSelect from './CustomSelect';
import DatePickerInput from './DatePickerInput';
import MoneyInput from './MoneyInput';
import { COLORS, FONTS, SHADOWS } from '../theme';
import { API_HOST } from '../api/client';
import { showGlobalToast } from '../store/toastStore';

// Helper định dạng tiền VNĐ
const formatCurrency = (amount) =>
  new Intl.NumberFormat('vi-VN').format(Math.round(amount || 0));

// Helper chuẩn hóa URL hình ảnh/video
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

// Helper lấy phần tử DOM thực tế từ ref
const getDomElement = (target) => {
  if (!target) return null;
  if (typeof target.nodeType === 'number') return target;
  if (target.getScrollableNode && typeof target.getScrollableNode().nodeType === 'number') {
    return target.getScrollableNode();
  }
  if (target._touchableNode && typeof target._touchableNode.nodeType === 'number') {
    return target._touchableNode;
  }
  if (target._node && typeof target._node.nodeType === 'number') {
    return target._node;
  }
  if (target._reactInternals?.stateNode && typeof target._reactInternals.stateNode.nodeType === 'number') {
    return target._reactInternals.stateNode;
  }
  return null;
};

const StaffSubmissionDetailModal = forwardRef((props, ref) => {
  const {
    submissions = [],
    cardDataMap = {},
    customers = [],
    products = [],
    custProductsMap = {},
    fetchProductsForCustomer,
    handleCustomerChange,
    updateCardField,
    updateCardItem,
    addCardItem,
    removeCardItem,
    selectProductForCardItem,
    toggleCardReturnType,
    toggleOrderMode,
    updateQuickAmount,
    addQuickSubAmount,
    updateQuickSubAmount,
    removeQuickSubAmount,
    handleSaveCard,
    handleRejectCard,
  } = props;

  const { width, height } = useWindowDimensions();
  const isMobile = width < 860;

  const [visible, setVisible] = useState(false);
  const [activeSubId, setActiveSubId] = useState(null);
  const [mobileTab, setMobileTab] = useState('split'); // 'image' | 'form' | 'split'

  // State điều khiển Zoom, Kéo rê (Pan) và Xoay ảnh ở cột Viewer
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef(null);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const modalRootRef = useRef(null);
  const formScrollRef = useRef(null);
  const submissionsRef = useRef(submissions);
  submissionsRef.current = submissions;

  // Tìm vị trí của submission hiện tại trong danh sách
  const currentIndex = useMemo(() => {
    if (!activeSubId || !submissions.length) return -1;
    return submissions.findIndex((s) => s.id === activeSubId);
  }, [activeSubId, submissions]);

  const currentSub = useMemo(() => {
    if (currentIndex === -1) return null;
    return submissions[currentIndex];
  }, [currentIndex, submissions]);

  const currentCard = useMemo(() => {
    if (!activeSubId) return null;
    return cardDataMap[activeSubId] || null;
  }, [activeSubId, cardDataMap]);

  // Nếu hóa đơn hiện tại bị xóa/bác bỏ khỏi danh sách submissions, tự động chuyển sang hóa đơn kế tiếp hoặc đóng modal
  useEffect(() => {
    if (!visible || !activeSubId) return;
    const exists = submissions.some((s) => s.id === activeSubId);
    if (!exists) {
      if (submissions.length > 0) {
        // Tự động chọn hóa đơn ở cùng vị trí index (chính là hóa đơn tiếp theo) hoặc hóa đơn liền trước nếu đang ở cuối danh sách
        const targetIdx = Math.min(currentIndex >= 0 ? currentIndex : 0, submissions.length - 1);
        setActiveSubId(submissions[targetIdx].id);
        resetZoom();
        formScrollRef.current?.scrollTo?.({ y: 0, animated: false });
      } else {
        setVisible(false);
      }
    }
  }, [submissions, activeSubId, visible, currentIndex]);

  // Đặt lại zoom & vị trí ảnh
  const resetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
    setIsDragging(false);
  };

  // Đảm bảo Modal nằm ở tầng zIndex (999999) trên Web
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (!visible) return;

    const applyPortalZ = () => {
      const elNode = getDomElement(modalRootRef.current);
      if (!elNode) return;
      let el = elNode;
      while (el && el.parentElement && el.parentElement !== document.body) {
        el = el.parentElement;
      }
      if (el && el.parentElement === document.body) {
        el.style.setProperty('z-index', '999999', 'important');
        if (el.firstElementChild) {
          el.firstElementChild.style.setProperty('z-index', '999999', 'important');
        }
      }
    };

    applyPortalZ();
    const t1 = setTimeout(applyPortalZ, 0);
    const t2 = setTimeout(applyPortalZ, 50);
    const t3 = setTimeout(applyPortalZ, 150);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [visible]);

  // Điều hướng chuyển sang thẻ tiếp theo hoặc trước đó
  const goToIndex = (targetIdx) => {
    const list = submissionsRef.current || submissions;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const targetSub = list[targetIdx];
    if (targetSub) {
      setActiveSubId(targetSub.id);
      resetZoom();
      formScrollRef.current?.scrollTo?.({ y: 0, animated: false });
    }
  };

  const handlePrev = () => {
    const list = submissionsRef.current || submissions;
    const curIdx = list.findIndex((s) => s.id === activeSubId);
    if (curIdx > 0) {
      goToIndex(curIdx - 1);
    }
  };

  const handleNext = () => {
    const list = submissionsRef.current || submissions;
    const curIdx = list.findIndex((s) => s.id === activeSubId);
    if (curIdx >= 0 && curIdx < list.length - 1) {
      goToIndex(curIdx + 1);
    }
  };

  // Lắng nghe phím mũi tên bàn phím: Left/Right để chuyển thẻ, Escape để đóng
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleKeyDown = (e) => {
      // Không bắt phím khi đang gõ vào input
      const tagName = e.target?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea') return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [visible, currentIndex, submissions]);

  // Phơi bày ref ra component cha
  useImperativeHandle(ref, () => ({
    open: (subId) => {
      setActiveSubId(subId);
      resetZoom();
      setVisible(true);
    },
    close: () => {
      setVisible(false);
      resetZoom();
    },
    next: handleNext,
    prev: handlePrev,
  }));

  const handleClose = () => {
    setVisible(false);
    resetZoom();
  };

  // Các thao tác phóng to / thu nhỏ / xoay ảnh
  const handleZoomIn = () => {
    setScale((prev) => Math.min(4.0, Math.round((prev + 0.25) * 100) / 100));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(0.5, Math.round((prev - 0.25) * 100) / 100));
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Xử lý kéo di chuyển ảnh bằng chuột / cảm ứng
  const handleMouseDown = (e) => {
    if (scale <= 1) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPosition({
      x: dragStartRef.current.posX + dx,
      y: dragStartRef.current.posY + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Cuộn chuột để zoom mượt mà
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      setScale((prev) => Math.min(4.0, Math.max(0.5, Math.round((prev + delta) * 100) / 100)));
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheel);
    };
  }, [visible, activeSubId]);

  // Phím tắt mũi tên Trái / Phải để chuyển hóa đơn nhanh khi không nhập liệu
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const handleKeyDown = (e) => {
      const activeEl = document.activeElement;
      const tag = activeEl?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || activeEl?.isContentEditable) return;

      if (e.key === 'ArrowLeft') {
        if (currentIndex > 0) {
          e.preventDefault();
          handlePrev();
        }
      } else if (e.key === 'ArrowRight') {
        if (currentIndex < submissions.length - 1) {
          e.preventDefault();
          handleNext();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [visible, currentIndex, submissions.length, handlePrev, handleNext]);

  // Xử lý khi nhấn nút Nhập công nợ trong modal chi tiết
  const handleSaveAndAutoNext = async (subId) => {
    if (!handleSaveCard) return;
    const success = await handleSaveCard(subId);
    // Nếu thành công và còn hóa đơn tiếp theo, tự động chuyển tiếp!
    if (success) {
      const list = submissionsRef.current || submissions;
      const curIdx = list.findIndex((s) => s.id === subId);
      if (curIdx >= 0 && curIdx < list.length - 1) {
        goToIndex(curIdx + 1);
      } else if (curIdx >= list.length - 1) {
        showGlobalToast('Đã đến hóa đơn cuối cùng trong danh sách!', 'info');
      }
    }
  };

  // Xử lý khi nhấn nút Bỏ qua / Xóa trong modal xem to: Tự động chuyển tiếp sang hóa đơn kế tiếp
  const handleRejectAndAutoNext = (subId) => {
    if (!handleRejectCard) return;

    const list = submissionsRef.current || submissions;
    const curIdx = list.findIndex((s) => s.id === subId);
    let nextSubId = null;
    if (curIdx >= 0 && curIdx < list.length - 1) {
      nextSubId = list[curIdx + 1].id;
    } else if (curIdx > 0) {
      nextSubId = list[curIdx - 1].id;
    }

    handleRejectCard(subId, () => {
      if (nextSubId) {
        setActiveSubId(nextSubId);
        resetZoom();
        formScrollRef.current?.scrollTo?.({ y: 0, animated: false });
      } else {
        setVisible(false);
      }
    });
  };

  if (!visible || !currentSub || !currentCard) return null;

  const isQuickMode = currentCard.orderMode === 'quick';

  const cardTotal = isQuickMode
    ? (parseFloat(currentCard.quickAmount) || 0)
    : (currentCard.items || []).reduce((sum, it) => {
      const amt = parseFloat(it.amount) || 0;
      return sum + amt;
    }, 0);

  const isApproved = currentSub.status === 'APPROVED';
  const isVideo = currentSub.fileType === 'VIDEO' || /\.(mp4|mov|webm|avi|mkv)(\?.*)?$/i.test(currentSub.fileUrl || '');
  const mediaUrl = resolveMediaUrl(currentSub.fileUrl);

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent={true}
    >
      <View ref={modalRootRef} style={styles.modalOverlay}>
        {/* Khung chứa chính toàn màn hình đối chiếu */}
        <View style={[styles.mainDialogContainer, isMobile && styles.mainDialogContainerMobile]}>
          {/* ═══ 1. THANH HEADER ĐIỀU HƯỚNG TỔNG ═══ */}
          <View style={styles.topNavigationHeader}>
            {/* Khoảng trống bù để căn giữa tiêu đề cân đối với nút đóng ✕ bên phải */}
            <View style={{ width: 32 }} />

            {/* Thông tin vị trí hóa đơn */}
            <View style={styles.navCenterInfoWrap}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.navCardIndexTitle}>
                  HÓA ĐƠN #{submissions.length - currentIndex}
                </Text>
                <View style={[styles.badgeStatusPill, isApproved ? styles.badgeApproved : styles.badgePending]}>
                  <Text style={[styles.badgeStatusText, isApproved ? styles.badgeTextApproved : styles.badgeTextPending]}>
                    {isApproved ? '✓ ĐÃ LÊN NỢ' : 'CHƯA LÊN NỢ'}
                  </Text>
                </View>
              </View>
              <Text style={styles.navCounterSubtitle}>
                (Đang xem: {currentIndex + 1} / {submissions.length} hóa đơn)
              </Text>
            </View>

            {/* Nút đóng modal */}
            <TouchableOpacity style={styles.btnCloseCircle} onPress={handleClose} activeOpacity={0.7}>
              <Text style={styles.btnCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Thanh chuyển Tab trên Mobile */}
          {isMobile && (
            <View style={styles.mobileTabRow}>
              <TouchableOpacity
                style={[styles.mobileTabBtn, mobileTab === 'split' && styles.mobileTabBtnActive]}
                onPress={() => setMobileTab('split')}
              >
                <Text style={[styles.mobileTabBtnText, mobileTab === 'split' && styles.mobileTabBtnTextActive]}>
                  ⚖️ Song song
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.mobileTabBtn, mobileTab === 'image' && styles.mobileTabBtnActive]}
                onPress={() => setMobileTab('image')}
              >
                <Text style={[styles.mobileTabBtnText, mobileTab === 'image' && styles.mobileTabBtnTextActive]}>
                  🖼️ Xem ảnh
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.mobileTabBtn, mobileTab === 'form' && styles.mobileTabBtnActive]}
                onPress={() => setMobileTab('form')}
              >
                <Text style={[styles.mobileTabBtnText, mobileTab === 'form' && styles.mobileTabBtnTextActive]}>
                  📝 Nhập nợ
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ═══ 2. NỘI DUNG CHÍNH CHIA 2 CỘT (SPLIT-VIEW) ═══ */}
          <View style={[styles.splitBodyWrap, isMobile && styles.splitBodyWrapMobile]}>
            {/* ───── CỘT TRÁI: VIEWER ẢNH / VIDEO PHÓNG TO ───── */}
            {(!isMobile || mobileTab === 'split' || mobileTab === 'image') && (
              <View
                style={[
                  styles.viewerCol,
                  isMobile && mobileTab === 'split' && { height: height * 0.38 },
                  isMobile && mobileTab === 'image' && { flex: 1 },
                ]}
              >
                {/* Thanh công cụ xem ảnh */}
                {!isVideo && (
                  <View style={styles.viewerToolbar}>
                    <View style={styles.zoomButtonGroup}>
                      <TouchableOpacity style={styles.toolBtn} onPress={handleZoomOut} activeOpacity={0.7}>
                        <Text style={styles.toolBtnText}>–</Text>
                      </TouchableOpacity>
                      <Text style={styles.toolScaleText}>{Math.round(scale * 100)}%</Text>
                      <TouchableOpacity style={styles.toolBtn} onPress={handleZoomIn} activeOpacity={0.7}>
                        <Text style={styles.toolBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity style={styles.toolActionBtn} onPress={handleRotate} activeOpacity={0.7}>
                      <Text style={styles.toolActionBtnText}>🔄 Xoay</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.toolActionBtn} onPress={resetZoom} activeOpacity={0.7}>
                      <Text style={styles.toolActionBtnText}>↺ Đặt lại</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Khung hiển thị ảnh hoặc video */}
                <View
                  ref={containerRef}
                  style={styles.imageCanvasWrap}
                  {...(Platform.OS === 'web'
                    ? {
                      onMouseDown: handleMouseDown,
                      onMouseMove: handleMouseMove,
                      onMouseUp: handleMouseUp,
                      onMouseLeave: handleMouseUp,
                    }
                    : {})}
                >
                  {isVideo ? (
                    Platform.OS === 'web' ? (
                      <video
                        src={mediaUrl}
                        controls
                        autoPlay
                        playsInline
                        onError={(e) => {
                          try {
                            e.target.removeAttribute('src');
                            e.target.load();
                          } catch { }
                        }}
                        style={{
                          width: '100%',
                          height: '100%',
                          maxHeight: '100%',
                          objectFit: 'contain',
                          backgroundColor: '#0F172A',
                          borderRadius: 8,
                        }}
                      />
                    ) : (
                      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 32 }}>🎬</Text>
                        <Text style={{ color: '#94A3B8', marginTop: 6 }}>Video hóa đơn</Text>
                      </View>
                    )
                  ) : (
                    <Image
                      source={{ uri: mediaUrl }}
                      style={[
                        styles.viewerMainImage,
                        Platform.OS === 'web' && {
                          transform: [
                            { translateX: position.x },
                            { translateY: position.y },
                            { scale: scale },
                            { rotate: `${rotation}deg` },
                          ],
                          cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
                          userSelect: 'none',
                        },
                      ]}
                      resizeMode="contain"
                    />
                  )}
                </View>

                {/* ═══ 2 NÚT ĐIỀU HƯỚNG CHUYỂN HÓA ĐƠN NỔI 2 BÊN SƯỜN ẢNH ═══ */}
                {/* Nút lùi hóa đơn trước (nổi ở cạnh trái khung ảnh) */}
                <TouchableOpacity
                  style={[
                    styles.floatingNavBtn,
                    styles.floatingNavBtnLeft,
                    currentIndex <= 0 && styles.floatingNavBtnDisabled,
                  ]}
                  onPress={handlePrev}
                  disabled={currentIndex <= 0}
                  activeOpacity={0.8}
                  {...(Platform.OS === 'web' ? { onMouseDown: (e) => e.stopPropagation() } : {})}
                >
                  <Text style={[styles.floatingNavBtnText, currentIndex <= 0 && styles.floatingNavBtnTextDisabled]}>
                    ◀ Trước
                  </Text>
                </TouchableOpacity>

                {/* Nút tiến hóa đơn sau (nổi ở cạnh phải khung ảnh) */}
                <TouchableOpacity
                  style={[
                    styles.floatingNavBtn,
                    styles.floatingNavBtnRight,
                    currentIndex >= submissions.length - 1 && styles.floatingNavBtnDisabled,
                  ]}
                  onPress={handleNext}
                  disabled={currentIndex >= submissions.length - 1}
                  activeOpacity={0.8}
                  {...(Platform.OS === 'web' ? { onMouseDown: (e) => e.stopPropagation() } : {})}
                >
                  <Text style={[styles.floatingNavBtnText, currentIndex >= submissions.length - 1 && styles.floatingNavBtnTextDisabled]}>
                    Sau ▶
                  </Text>
                </TouchableOpacity>

                {!isVideo && (
                  <Text style={styles.viewerTipText}>
                    💡 Mẹo: Cuộn chuột để phóng to / thu nhỏ. Nhấn giữ chuột để kéo di chuyển soi từng con số.
                  </Text>
                )}
              </View>
            )}

            {/* ───── CỘT PHẢI: FORM BÓC TÁCH & NHẬP CÔNG NỢ ───── */}
            {(!isMobile || mobileTab === 'split' || mobileTab === 'form') && (
              <View
                style={[
                  styles.formCol,
                  isMobile && mobileTab === 'split' && { flex: 1 },
                  isMobile && mobileTab === 'form' && { flex: 1 },
                ]}
              >
                <ScrollView ref={formScrollRef} showsVerticalScrollIndicator={true} contentContainerStyle={styles.formScrollContent}>
                  {/* Báo lỗi / nhắc nhở AI nếu có */}
                  {currentSub.aiError ? (
                    <View style={styles.alertBannerWrap}>
                      <Text style={styles.alertBannerText}>⚠️ {currentSub.aiError}</Text>
                    </View>
                  ) : null}

                  {/* BANNER THÔNG BÁO ĐANG NẠP BẢNG GIÁ RIÊNG */}
                  {currentCard.isLoadingPrice ? (
                    <View style={styles.cardLoadingPriceBanner}>
                      <ActivityIndicator size="small" color="#0284C7" />
                      <Text style={styles.cardLoadingPriceText}>Đang cập nhật giá riêng khách hàng...</Text>
                    </View>
                  ) : null}

                  {/* 1. KHÁCH HÀNG + NGÀY GIAO + GHI CHÚ */}
                  <View style={styles.formSectionBox}>
                    <Text style={styles.formFieldLabel}>
                      {currentCard.isReturn ? 'Khách hàng trả hàng' : 'Khách hàng ghi nợ'}{' '}
                      <Text style={{ color: '#EF4444' }}>*</Text>
                      {currentSub.detectedCustomerName ? (
                        <Text style={{ color: '#0EA5E9', fontWeight: 'normal', fontSize: 12 }}>
                          {' '}(AI bóc tách: "{currentSub.detectedCustomerName}")
                        </Text>
                      ) : null}
                    </Text>
                    <CustomSelect
                      value={currentCard.customer}
                      placeholder="Chọn khách hàng..."
                      options={customers}
                      disabled={currentCard.isLoadingPrice}
                      onSelect={(c) => handleCustomerChange(currentSub.id, c)}
                      renderSelected={(c) => c?.name || ''}
                      renderOption={(c) => (
                        <View style={styles.custOptionRow}>
                          <Text style={styles.custOptionName}>{c.name}</Text>
                          {c.phone ? <Text style={styles.custOptionPhone}>📞 {c.phone}</Text> : null}
                        </View>
                      )}
                    />

                    <View style={styles.dateAndNoteRow}>
                      <View style={{ flex: 1.2 }}>
                        <Text style={styles.formFieldLabel}>
                          {currentCard.isReturn ? 'Ngày trả hàng' : 'Ngày giao hàng'}
                        </Text>
                        <DatePickerInput
                          value={currentCard.date}
                          onChange={(d) => updateCardField(currentSub.id, 'date', d)}
                          placeholder="DD/MM/YYYY"
                          compact={true}
                          disabled={currentCard.isLoadingPrice}
                        />
                      </View>

                      <View style={{ flex: 2 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <Text style={styles.formFieldLabel}>Ghi chú đơn</Text>
                          <TouchableOpacity
                            style={[styles.btnToggleOrderType, currentCard.isReturn && styles.btnToggleOrderTypeReturn, currentCard.isLoadingPrice && { opacity: 0.5 }]}
                            onPress={() => toggleCardReturnType(currentSub.id)}
                            disabled={currentCard.isLoadingPrice}
                            activeOpacity={0.8}
                          >
                            <Text style={[styles.btnToggleOrderTypeText, currentCard.isReturn && styles.btnToggleOrderTypeTextReturn]}>
                              {currentCard.isReturn ? '↩️ Trả hàng' : '🥩 Xuất hàng'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <TextInput
                          style={[styles.textInputCompact, currentCard.isLoadingPrice && { backgroundColor: '#F1F5F9', opacity: 0.7 }]}
                          value={currentCard.note}
                          onChangeText={(txt) => updateCardField(currentSub.id, 'note', txt)}
                          editable={!currentCard.isLoadingPrice}
                          placeholder="Ghi chú đơn hàng..."
                          placeholderTextColor="#94A3B8"
                        />
                      </View>
                    </View>
                  </View>

                  {/* 2. CHỌN CHẾ ĐỘ: NHẬP NHANH (TIỀN HÀNG) HOẶC CHI TIẾT (MÓN THỊT) */}
                  <View style={styles.orderModeToggleBar}>
                    <TouchableOpacity
                      style={[styles.orderModeTabBtn, isQuickMode && styles.orderModeTabBtnActive]}
                      onPress={() => toggleOrderMode && toggleOrderMode(currentSub.id)}
                      disabled={currentCard.isLoadingPrice}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.orderModeTabText, isQuickMode && styles.orderModeTabTextActive]}>
                        ⚡ Nhập nhanh (Tiền hàng)
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.orderModeTabBtn, !isQuickMode && styles.orderModeTabBtnActive]}
                      onPress={() => toggleOrderMode && toggleOrderMode(currentSub.id)}
                      disabled={currentCard.isLoadingPrice}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.orderModeTabText, !isQuickMode && styles.orderModeTabTextActive]}>
                        🥩 Nhập chi tiết ({currentCard.items?.length || 0} món)
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {isQuickMode ? (
                    <View style={styles.quickDebtCard}>
                      <View style={styles.quickDebtAmountBox}>
                        <Text style={styles.quickDebtLabel}>SỐ TIỀN CÔNG NỢ (VND) *</Text>
                        <MoneyInput
                          style={styles.quickDebtMoneyContainer}
                          inputStyle={styles.quickDebtMoneyInput}
                          value={currentCard.quickAmount}
                          disabled={currentCard.isLoadingPrice}
                          onChangeValue={(val) => {
                            updateQuickAmount && updateQuickAmount(currentSub.id, val > 0 ? String(val) : '');
                          }}
                          placeholder="0"
                          textAlign="center"
                        />
                      </View>

                      {/* Các khoản tiền thành phần cộng lại */}
                      <View style={styles.quickSubAmountsContainer}>
                        <View style={styles.quickSubAmountsHeader}>
                          <Text style={styles.quickSubAmountsTitle}>
                            🧾 Các khoản tiền cộng gộp ({(currentCard.quickSubAmounts || []).length}):
                          </Text>
                          <TouchableOpacity
                            style={styles.btnAddSubAmount}
                            onPress={() => addQuickSubAmount && addQuickSubAmount(currentSub.id)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.btnAddSubAmountText}>+ Thêm khoản</Text>
                          </TouchableOpacity>
                        </View>

                        {(currentCard.quickSubAmounts || []).length > 0 ? (
                          <View style={styles.quickSubChipsWrap}>
                            {(currentCard.quickSubAmounts || []).map((subAmt, sIdx) => (
                              <View key={sIdx} style={styles.quickSubChip}>
                                <MoneyInput
                                  style={styles.subAmountMoneyContainer}
                                  inputStyle={styles.subAmountMoneyInput}
                                  value={subAmt}
                                  disabled={currentCard.isLoadingPrice}
                                  onChangeValue={(val) => {
                                    updateQuickSubAmount && updateQuickSubAmount(currentSub.id, sIdx, val > 0 ? val : 0);
                                  }}
                                  placeholder="Số tiền"
                                  textAlign="right"
                                />
                                <Text style={styles.subAmountCurrency}>đ</Text>
                                <TouchableOpacity
                                  style={styles.btnRemoveSubAmount}
                                  onPress={() => removeQuickSubAmount && removeQuickSubAmount(currentSub.id, sIdx)}
                                  activeOpacity={0.7}
                                >
                                  <Text style={styles.btnRemoveSubAmountText}>✕</Text>
                                </TouchableOpacity>
                              </View>
                            ))}
                          </View>
                        ) : (
                          <Text style={styles.quickSubAmountsEmptyHint}>
                            💡 Bạn có thể nhập trực tiếp tổng tiền ở trên hoặc bấm "+ Thêm khoản" để cộng dồn các khoản tiền nhỏ.
                          </Text>
                        )}
                      </View>
                    </View>
                  ) : (
                    /* 2. DANH SÁCH MÓN THỊT CHI TIẾT */
                    <View style={styles.formSectionBox}>
                      <View style={styles.itemsHeaderRow}>
                        <Text style={styles.itemsSectionTitle}>
                          DANH SÁCH MÓN THỊT ({currentCard.items?.length || 0})
                        </Text>
                        <TouchableOpacity
                          style={[styles.btnAddItemBtn, currentCard.isLoadingPrice && { opacity: 0.5 }]}
                          onPress={() => addCardItem(currentSub.id)}
                          disabled={currentCard.isLoadingPrice}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.btnAddItemText}>+ Thêm món</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Tiêu đề các cột */}
                      <View style={styles.tableHeaderRow}>
                        <Text style={[styles.tableHeadCell, { flex: 3.2 }]}>Tên món thịt</Text>
                        <Text style={[styles.tableHeadCell, { flex: 1.2, textAlign: 'center' }]}>Số kg</Text>
                        <Text style={[styles.tableHeadCell, { flex: 1.5, textAlign: 'right' }]}>Đơn giá (đ)</Text>
                        <Text style={[styles.tableHeadCell, { flex: 1.8, textAlign: 'right' }]}>Thành tiền (đ)</Text>
                        <View style={{ width: 28 }} />
                      </View>

                      {/* Danh sách từng dòng món thịt */}
                      {(currentCard.items || []).map((item, itemIdx) => (
                        <View key={item.id || itemIdx} style={styles.tableDataRow}>
                          {/* Chọn món thịt */}
                          <View style={{ flex: 3.2 }}>
                            <CustomSelect
                              value={item.selectedProduct}
                              placeholder="Tên thịt..."
                              options={(currentCard.customer?.id && custProductsMap[currentCard.customer.id]) || products}
                              disabled={currentCard.isLoadingPrice}
                              onOpenChange={(isOpen) => {
                                if (isOpen && currentCard.customer?.id && !custProductsMap[currentCard.customer.id]) {
                                  fetchProductsForCustomer(currentCard.customer.id);
                                }
                              }}
                              onSelect={(p) => selectProductForCardItem(currentSub.id, itemIdx, p)}
                              onInputChange={(txt) => updateCardItem(currentSub.id, itemIdx, 'rawName', txt)}
                              renderSelected={(p) => p?.name || item.rawName || ''}
                              renderOption={(p) => {
                                const isCustom = Boolean(p.hasCustomPrice || (p.customPrice !== undefined && p.customPrice !== null));
                                const effectivePrice = isCustom ? p.customPrice : (p.baseDefaultPrice ?? p.defaultPrice);
                                return (
                                  <View style={styles.productOptionRow}>
                                    <Text style={styles.productOptionName}>{p.name}</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                      {isCustom && (
                                        <View style={styles.customPriceBadge}>
                                          <Text style={styles.customPriceBadgeText}>Giá riêng</Text>
                                        </View>
                                      )}
                                      <Text style={[styles.productOptionPrice, isCustom && styles.productOptionCustomPrice]}>
                                        {formatCurrency(effectivePrice)}/{p.unit}
                                      </Text>
                                    </View>
                                  </View>
                                );
                              }}
                            />
                          </View>

                          {/* Số kg */}
                          <View style={{ flex: 1.2 }}>
                            <TextInput
                              style={[styles.compactInputCell, currentCard.isLoadingPrice && { backgroundColor: '#F1F5F9', opacity: 0.7 }]}
                              value={item.quantity}
                              onChangeText={(val) => updateCardItem(currentSub.id, itemIdx, 'quantity', val)}
                              editable={!currentCard.isLoadingPrice}
                              placeholder="Số kg"
                              placeholderTextColor="#94A3B8"
                              keyboardType="numeric"
                            />
                          </View>

                          {/* Đơn giá */}
                          <View style={{ flex: 1.5 }}>
                            <MoneyInput
                              style={styles.tableMoneyContainer}
                              inputStyle={styles.tableMoneyInput}
                              value={item.price}
                              disabled={currentCard.isLoadingPrice}
                              onChangeValue={(val) => {
                                const priceNum = val > 0 ? val : 0;
                                updateCardItem(currentSub.id, itemIdx, 'price', priceNum > 0 ? String(priceNum) : '');
                              }}
                              placeholder="Đơn giá"
                              textAlign="right"
                            />
                          </View>

                          {/* Thành tiền */}
                          <View style={{ flex: 1.8 }}>
                            <MoneyInput
                              style={styles.tableMoneyContainer}
                              inputStyle={styles.tableMoneyInputAmount}
                              value={item.amount}
                              disabled={currentCard.isLoadingPrice}
                              onChangeValue={(val) => {
                                const amtNum = val > 0 ? val : 0;
                                updateCardItem(currentSub.id, itemIdx, 'amount', amtNum > 0 ? String(amtNum) : '');
                              }}
                              placeholder="Thành tiền"
                              textAlign="right"
                            />
                          </View>

                          {/* Nút xóa dòng */}
                          <TouchableOpacity
                            style={[styles.btnRowDelete, currentCard.isLoadingPrice && { opacity: 0.4 }]}
                            onPress={() => removeCardItem(currentSub.id, itemIdx)}
                            disabled={currentCard.isLoadingPrice}
                            activeOpacity={0.7}
                          >
                            <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 16 }}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </ScrollView>

                {/* ═══ FOOTER CỘT PHẢI: TỔNG TIỀN VÀ NÚT NHẬP CÔNG NỢ ═══ */}
                <View style={styles.formFooterWrap}>
                  <View style={styles.totalMoneyBox}>
                    <Text style={[styles.totalMoneyLabel, currentCard.isReturn && { color: '#EA580C' }]}>
                      {currentCard.isReturn ? 'TIỀN TRẢ LẠI:' : 'TỔNG CỘNG:'}
                    </Text>
                    <Text style={[styles.totalMoneyValue, currentCard.isReturn && { color: '#F97316' }]}>
                      {currentCard.isReturn ? `-${formatCurrency(cardTotal)}` : formatCurrency(cardTotal)} đ
                    </Text>
                  </View>

                  <View style={styles.actionButtonsWrap}>
                    <TouchableOpacity
                      style={styles.btnSkipAction}
                      onPress={() => handleRejectAndAutoNext(currentSub.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.btnSkipActionText}>🗑️ Bỏ qua</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.btnSaveAction,
                        currentCard.isReturn && styles.btnSaveActionReturn,
                        isApproved && styles.btnSaveActionApproved,
                        (currentCard.isSaving || currentCard.isLoadingPrice) && { opacity: 0.7 },
                      ]}
                      onPress={() => handleSaveAndAutoNext(currentSub.id)}
                      disabled={currentCard.isSaving || currentCard.isLoadingPrice}
                      activeOpacity={0.85}
                    >
                      {currentCard.isSaving || currentCard.isLoadingPrice ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.btnSaveActionText}>
                          {isApproved ? '🔄 CẬP NHẬT LẠI' : currentCard.isReturn ? '↩️ TRẢ HÀNG (TRỪ NỢ)' : '💾 NHẬP CÔNG NỢ'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  mainDialogContainer: {
    width: '96%',
    maxWidth: 1440,
    height: '94%',
    maxHeight: 960,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    ...SHADOWS.card,
  },
  mainDialogContainerMobile: {
    width: '100%',
    height: '98%',
    borderRadius: 12,
  },

  // 1. Header điều hướng
  topNavigationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  floatingNavBtn: {
    position: 'absolute',
    top: '50%',
    transform: [{ translateY: -22 }],
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#475569',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
    ...(Platform.OS === 'web' ? { cursor: 'pointer', userSelect: 'none' } : {}),
  },
  floatingNavBtnLeft: {
    left: 14,
  },
  floatingNavBtnRight: {
    right: 14,
  },
  floatingNavBtnDisabled: {
    opacity: 0.25,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    borderColor: 'rgba(71, 85, 105, 0.3)',
    ...(Platform.OS === 'web' ? { cursor: 'default' } : {}),
  },
  floatingNavBtnText: {
    color: '#38BDF8',
    fontWeight: 'bold',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  floatingNavBtnTextDisabled: {
    color: '#64748B',
  },
  navCenterInfoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCardIndexTitle: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  navCounterSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  badgeStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgePending: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  badgeApproved: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  badgeStatusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  badgeTextPending: {
    color: '#F59E0B',
  },
  badgeTextApproved: {
    color: '#10B981',
  },
  btnCloseCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCloseText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },

  // Tab Mobile
  mobileTabRow: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    padding: 4,
  },
  mobileTabBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 6,
  },
  mobileTabBtnActive: {
    backgroundColor: '#0EA5E9',
  },
  mobileTabBtnText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  mobileTabBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },

  // 2. Nội dung chính Split-View
  splitBodyWrap: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    overflow: 'hidden',
  },
  splitBodyWrapMobile: {
    flexDirection: 'column',
  },

  // Cột trái: Viewer
  viewerCol: {
    flex: 1.15,
    backgroundColor: '#0F172A',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'relative',
  },
  viewerToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    zIndex: 10,
  },
  zoomButtonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  toolBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#1E293B',
  },
  toolBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  toolScaleText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: 'bold',
    paddingHorizontal: 8,
  },
  toolActionBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  toolActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  imageCanvasWrap: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 10,
  },
  viewerMainImage: {
    width: '100%',
    height: '100%',
  },
  viewerTipText: {
    color: '#64748B',
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 5,
    backgroundColor: '#0F172A',
  },

  // Cột phải: Form nhập nợ
  formCol: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  formScrollContent: {
    padding: 14,
    paddingBottom: 24,
  },
  alertBannerWrap: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  alertBannerText: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '500',
  },
  cardLoadingPriceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 10,
  },
  cardLoadingPriceText: {
    color: '#0369A1',
    fontSize: 12.5,
    fontWeight: '600',
  },
  formSectionBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 12,
  },
  formFieldLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#334155',
    marginBottom: 4,
  },
  dateAndNoteRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    alignItems: 'flex-start',
  },
  textInputCompact: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#1E293B',
  },
  btnToggleOrderType: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  btnToggleOrderTypeReturn: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FB923C',
  },
  btnToggleOrderTypeText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: 'bold',
  },
  btnToggleOrderTypeTextReturn: {
    color: '#C2410C',
  },

  // Danh sách món thịt
  itemsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemsSectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  btnAddItemBtn: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  btnAddItemText: {
    color: '#16A34A',
    fontWeight: 'bold',
    fontSize: 12,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 6,
    marginBottom: 6,
  },
  tableHeadCell: {
    fontSize: 11.5,
    fontWeight: 'bold',
    color: '#475569',
  },
  tableDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  compactInputCell: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 6,
    fontSize: 13,
    color: '#0F172A',
    textAlign: 'center',
  },
  tableMoneyContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  tableMoneyInput: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
  },
  tableMoneyInputAmount: {
    fontSize: 13,
    color: '#059669',
    fontWeight: 'bold',
  },
  btnRowDelete: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 13,
  },

  // Dropdown option styles
  custOptionRow: {
    paddingVertical: 6,
  },
  custOptionName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  custOptionPhone: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  productOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  productOptionName: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
  },
  productOptionPrice: {
    fontSize: 12,
    color: '#64748B',
  },
  productOptionCustomPrice: {
    color: '#059669',
    fontWeight: 'bold',
  },
  customPriceBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  customPriceBadgeText: {
    color: '#15803D',
    fontSize: 10,
    fontWeight: 'bold',
  },

  // Footer cột phải
  formFooterWrap: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalMoneyBox: {
    flexDirection: 'column',
  },
  totalMoneyLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#64748B',
  },
  totalMoneyValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#059669',
  },
  actionButtonsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnSkipAction: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  btnSkipActionText: {
    color: '#64748B',
    fontWeight: 'bold',
    fontSize: 12.5,
  },
  btnSaveAction: {
    backgroundColor: '#10B981',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
    minWidth: 140,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  btnSaveActionReturn: {
    backgroundColor: '#F97316',
  },
  btnSaveActionApproved: {
    backgroundColor: '#64748B',
  },
  btnSaveActionText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13.5,
    letterSpacing: 0.3,
  },
  orderModeToggleBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  orderModeTabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  orderModeTabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  orderModeTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  orderModeTabTextActive: {
    color: '#0F172A',
    fontWeight: 'bold',
  },
  quickDebtCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 12,
  },
  quickDebtAmountBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#10B981',
    alignItems: 'center',
    marginBottom: 12,
  },
  quickDebtLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#047857',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  quickDebtMoneyContainer: {
    width: '100%',
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingVertical: 0,
  },
  quickDebtMoneyInput: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#059669',
    textAlign: 'center',
  },
  quickSubAmountsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickSubAmountsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  quickSubAmountsTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  btnAddSubAmount: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  btnAddSubAmountText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  quickSubChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickSubChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 120,
  },
  subAmountMoneyContainer: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    flex: 1,
  },
  subAmountMoneyInput: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  subAmountCurrency: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#64748B',
    marginLeft: 2,
    marginRight: 6,
  },
  btnRemoveSubAmount: {
    padding: 2,
  },
  btnRemoveSubAmountText: {
    color: '#EF4444',
    fontWeight: 'bold',
    fontSize: 13,
  },
  quickSubAmountsEmptyHint: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
    paddingVertical: 4,
  },
});

export default StaffSubmissionDetailModal;
