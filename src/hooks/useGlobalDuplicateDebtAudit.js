// meat-management-fe/src/hooks/useGlobalDuplicateDebtAudit.js
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  auditGlobalTransactionsForDuplicates,
  buildGlobalAuditWarningMessage,
  computeDuplicatesSignature,
  buildDuplicateKeysFromResults,
  addConfirmedValidDuplicateKeys,
  getConfirmedValidDuplicateKeys,
} from '../utils/debtExportAuditHelper';
import { showGlobalToast } from '../store/toastStore';

// Chu kỳ quét trùng lặp tự động định kỳ: 30 phút (30 * 60 * 1000 ms)
const DUPLICATE_AUDIT_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Custom Hook: Kiểm tra ngầm toàn cục trùng lặp đơn hàng trong ngày (Global Background Debt Audit)
 * - Tự động quét toàn bộ giao dịch phát sinh gần đây của các khách hàng định kỳ cứ 30 phút 1 lần.
 * - Phát hiện nếu trong cùng 1 ngày có từ 2 dòng thịt cùng tên và số kg lệch < 0.2kg.
 * - Bật Pop-up cảnh báo định kỳ 30 phút khi phát hiện đơn trùng hoặc ngay sau khi người dùng vừa lưu nợ.
 * - Cho phép người dùng bấm "Bằng cân nhưng đúng (Không báo lại)" để lưu trữ vĩnh viễn và không cảnh báo lại nữa.
 * - Ngăn chặn tình trạng popup hiển thị liên tục làm phiền người dùng khi họ đã bấm "Đã hiểu / Bỏ qua".
 * - Cung cấp danh sách trùng lặp để hiển thị thanh Banner cảnh báo ghim trên màn hình.
 */
export const useGlobalDuplicateDebtAudit = ({
  transactions = [],
  customers = [],
  popupModalRef = null,
  onInspectCustomer = null,
  onRefetchTransactions = null,
}) => {
  const [globalDuplicates, setGlobalDuplicates] = useState([]);

  // Dùng Ref để lưu trữ tham chiếu động, tránh trigger re-render vòng lặp
  const onInspectCustomerRef = useRef(onInspectCustomer);
  onInspectCustomerRef.current = onInspectCustomer;

  const onRefetchTransactionsRef = useRef(onRefetchTransactions);
  onRefetchTransactionsRef.current = onRefetchTransactions;

  const popupModalRefRef = useRef(popupModalRef);
  popupModalRefRef.current = popupModalRef;

  const customersRef = useRef(customers);
  customersRef.current = customers;

  const transactionsRef = useRef(transactions);
  transactionsRef.current = transactions;

  const globalDuplicatesRef = useRef([]);
  globalDuplicatesRef.current = globalDuplicates;

  const currentDuplicatesSigRef = useRef('');
  const lastAlertedSignatureRef = useRef('');
  const lastAlertTimestampRef = useRef(0);
  const isAfterSubmitRef = useRef(false);
  const dismissedSignatureRef = useRef('');
  const dismissedTimestampRef = useRef(0);

  // Mở popup cảnh báo chi tiết các khách hàng bị trùng
  const showDuplicateAlertModal = useCallback((customList = null) => {
    // Chỉ chấp nhận customList nếu là mảng thực sự (tránh nhận nhầm SyntheticEvent / ClickEvent khi gọi từ onPress)
    const targetList = Array.isArray(customList) ? customList : globalDuplicatesRef.current;
    if (!Array.isArray(targetList) || targetList.length === 0) return;

    const popupModal = popupModalRefRef.current?.current || popupModalRefRef.current;
    if (!popupModal) return;

    popupModal.show({
      type: 'confirm',
      title: '⚠️ CẢNH BÁO TRÙNG ĐƠN TRONG NGÀY',
      message: buildGlobalAuditWarningMessage(targetList),
      confirmText: 'Kiểm tra chi tiết',
      cancelText: 'Đã hiểu / Bỏ qua',
      neutralText: '✅ Bằng cân nhưng đúng (Không báo lại)',
      onNeutral: () => {
        // 1. Trích xuất các key của các đơn trùng trong targetList và lưu vào localStorage
        const keys = buildDuplicateKeysFromResults(targetList);
        addConfirmedValidDuplicateKeys(keys);

        // 2. Lấy lại danh sách confirmed mới nhất
        const updatedConfirmedSet = getConfirmedValidDuplicateKeys();

        // 3. Quét lại dữ liệu để loại bỏ ngay lập tức các đơn vừa xác nhận hợp lệ
        const remainingDuplicates = auditGlobalTransactionsForDuplicates({
          transactions: transactionsRef.current || [],
          customers: customersRef.current || [],
          confirmedKeys: updatedConfirmedSet,
        });

        const newSig = computeDuplicatesSignature(remainingDuplicates);
        currentDuplicatesSigRef.current = newSig;
        lastAlertedSignatureRef.current = newSig;
        setGlobalDuplicates(remainingDuplicates);
        isAfterSubmitRef.current = false;

        // 4. Hiển thị thông báo thành công qua toast chuẩn hệ thống
        showGlobalToast('Đã ghi nhận đơn đúng! Hệ thống sẽ không cảnh báo lại các đơn này nữa.', 'success');
      },
      onCancel: () => {
        // Người dùng chọn bỏ qua: Ghi nhận chữ ký hiện tại để không tự động bật lại popup khi vừa submit đơn khác
        dismissedSignatureRef.current = currentDuplicatesSigRef.current;
        dismissedTimestampRef.current = Date.now();
      },
      onConfirm: () => {
        const firstDup = targetList[0];
        if (firstDup && onInspectCustomerRef.current) {
          onInspectCustomerRef.current(firstDup.customerId, firstDup.customer);
        }
      },
    });
  }, []);

  // Hàm thực hiện kiểm tra ngầm
  const executeAudit = useCallback(
    (txList, isScheduledOrForce = false) => {
      const activeList = txList || transactionsRef.current;
      if (!activeList || activeList.length === 0) {
        if (currentDuplicatesSigRef.current !== '') {
          currentDuplicatesSigRef.current = '';
          setGlobalDuplicates([]);
        }
        return;
      }

      // Quét ngầm toàn bộ giao dịch trong vòng 7 ngày gần đây
      const duplicateResults = auditGlobalTransactionsForDuplicates({
        transactions: activeList,
        customers: customersRef.current || [],
      });

      const newSig = computeDuplicatesSignature(duplicateResults);

      // Cập nhật state nếu chữ ký trùng lặp thay đổi (ngăn re-render loop)
      if (newSig !== currentDuplicatesSigRef.current) {
        currentDuplicatesSigRef.current = newSig;
        setGlobalDuplicates(duplicateResults);
      }

      if (duplicateResults.length > 0) {
        const now = Date.now();
        const timeSinceLastAlert = now - lastAlertTimestampRef.current;
        const isNewSignature = newSig !== lastAlertedSignatureRef.current && newSig !== dismissedSignatureRef.current;
        const isDismissed = newSig === dismissedSignatureRef.current;

        // Bật pop-up nếu:
        // 1. Người dùng vừa bấm Lưu công nợ (isAfterSubmit) VÀ có đơn trùng mới chưa từng bị bỏ qua (!isDismissed)
        // 2. Hoặc phát sinh chữ ký trùng lặp mới hoàn toàn (isNewSignature)
        // 3. Hoặc định kỳ quét 30 phút kích hoạt VÀ chưa bị người dùng bấm Bỏ qua (!isDismissed && timeSinceLastAlert >= 30 phút)
        const shouldShowAfterSubmit = isAfterSubmitRef.current && !isDismissed;
        const shouldShowPeriodic = isScheduledOrForce && !isDismissed && timeSinceLastAlert >= DUPLICATE_AUDIT_INTERVAL_MS;

        if (shouldShowAfterSubmit || isNewSignature || shouldShowPeriodic) {
          lastAlertedSignatureRef.current = newSig;
          lastAlertTimestampRef.current = now;
          isAfterSubmitRef.current = false;
          showDuplicateAlertModal(duplicateResults);
        } else {
          isAfterSubmitRef.current = false;
        }
      } else {
        lastAlertedSignatureRef.current = '';
        dismissedSignatureRef.current = '';
        isAfterSubmitRef.current = false;
      }
    },
    [showDuplicateAlertModal]
  );

  // Lắng nghe thay đổi dữ liệu giao dịch từ API (sau khi refetch hoặc tải mới)
  useEffect(() => {
    if (transactions && transactions.length > 0) {
      const forceAlert = isAfterSubmitRef.current;
      executeAudit(transactions, forceAlert);
    }
  }, [transactions, executeAudit]);

  // Bộ đếm quét định kỳ: Cứ đúng 30 phút quét 1 lần
  useEffect(() => {
    const timer = setInterval(() => {
      console.log('[DUPLICATE_AUDIT] Kích hoạt quét trùng lặp định kỳ 30 phút...');
      // Nếu có hàm refetch giao dịch thì gọi tải mới dữ liệu từ server trước khi quét
      if (typeof onRefetchTransactionsRef.current === 'function') {
        onRefetchTransactionsRef.current()
          .then((res) => {
            const freshTxs = res?.data || transactionsRef.current;
            executeAudit(freshTxs, true);
          })
          .catch(() => {
            executeAudit(transactionsRef.current, true);
          });
      } else {
        executeAudit(transactionsRef.current, true);
      }
    }, DUPLICATE_AUDIT_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [executeAudit]);

  // Hàm được gọi từ bên ngoài để đánh dấu vừa submit ghi nợ thành công
  const notifyDebtSubmitted = useCallback(() => {
    isAfterSubmitRef.current = true;
  }, []);

  return {
    globalDuplicates,
    hasDuplicates: globalDuplicates.length > 0,
    showDuplicateAlertModal,
    notifyDebtSubmitted,
    recheckDuplicates: () => executeAudit(transactionsRef.current, true),
  };
};

export default useGlobalDuplicateDebtAudit;
