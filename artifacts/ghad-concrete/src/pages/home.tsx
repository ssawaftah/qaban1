import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Check, RotateCcw, Scale, X } from 'lucide-react';
import {
  getGetDashboardSummaryQueryKey, getListMixersQueryKey, getListOperationsQueryKey,
  useCreateOperation, useGetDashboardSummary, useListMixers,
} from '@workspace/api-client-react';
import { CONCRETE_DENSITY_KG_PER_M3, cubicMeters, EmptyState, ErrorBox, kg, LoadingBlock, localDateInput, PageHeading, tareFreshness } from '@/components/shared';

export default function HomePage({ notify }: { notify: (message: string, error?: boolean) => void }) {
  const queryClient = useQueryClient();
  const mixersQuery = useListMixers();
  const summaryQuery = useGetDashboardSummary();
  const createOperation = useCreateOperation();
  const [mixerId, setMixerId] = useState('');
  const [gross, setGross] = useState('');
  const [date, setDate] = useState(localDateInput());
  const [customer, setCustomer] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [validation, setValidation] = useState('');

  const mixers = mixersQuery.data ?? [];
  const tareDueSoonCount = mixers.filter((mixer) => {
    const age = tareFreshness(mixer.tareWeighedAt).age;
    return age >= 31 && age <= 89;
  }).length;
  const tareOverdueCount = mixers.filter((mixer) => tareFreshness(mixer.tareWeighedAt).age >= 90).length;
  const selectedMixer = mixers.find((mixer) => mixer.id === Number(mixerId));
  const grossNumber = Number(gross);
  const netWeightKg = selectedMixer && grossNumber > selectedMixer.tareWeightKg ? grossNumber - selectedMixer.tareWeightKg : 0;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getListMixersQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListOperationsQueryKey() });
  };

  const clear = () => {
    setGross('');
    setCustomer('');
    setMixerId('');
    setDate(localDateInput());
    setValidation('');
  };
  const submit = () => {
    if (!mixerId || !selectedMixer) { setValidation('اختر الخلاطة قبل حفظ العملية.'); return; }
    if (!date) { setValidation('أدخل تاريخ العملية.'); return; }
    if (!Number.isFinite(grossNumber) || grossNumber <= selectedMixer.tareWeightKg) { setValidation('يجب أن يكون الوزن القائم أكبر من الوزن الفارغ للخلاطة.'); return; }
    if (!customer.trim()) { setValidation('أدخل اسم العميل لإتمام الأرشفة.'); return; }
    setValidation('');
    createOperation.mutate({
      data: {
        operationDate: date,
        mixerId: selectedMixer.id,
        customerName: customer.trim(),
        grossWeightKg: grossNumber,
      },
    }, {
      onSuccess: () => {
        refresh();
        setArchiveOpen(false);
        clear();
        notify('تم حفظ كمية المرتجع.');
      },
      onError: () => notify('لم تُحفظ العملية. تحقق من الاتصال وحاول مجدداً.', true),
    });
  };
  return <>
    <PageHeading title="حساب كمية المرتجع" />
    {mixersQuery.isError && <ErrorBox retry={() => void mixersQuery.refetch()} />}
    {summaryQuery.isError && <ErrorBox retry={() => void summaryQuery.refetch()} text="تعذّر تحميل ملخص التشغيل." />}
    {summaryQuery.isLoading ? <div className="stats-strip">{Array.from({ length: 4 }, (_, i) => <div className="stat" key={i}><div className="skeleton-line" /><div className="skeleton-line" /></div>)}</div> : summaryQuery.data && <section className="stats-strip" aria-label="ملخص التشغيل">
      <div className="stat" data-testid="stat-today-count"><div className="stat-label">رحلات اليوم</div><div className="stat-value">{kg(summaryQuery.data.todayOperationsCount)}</div><div className="stat-note">عملية مسجلة</div></div>
      <div className="stat" data-testid="stat-today-concrete"><div className="stat-label">مرتجع اليوم</div><div className="stat-value">{cubicMeters(summaryQuery.data.todayConcreteKg)} <small>م³</small></div></div>
      <div className="stat" data-testid="stat-mixer-count"><div className="stat-label">الخلاطات المسجلة</div><div className="stat-value">{kg(summaryQuery.data.mixerCount)}</div><div className="stat-note">ضمن الأسطول</div></div>
      <div className="stat" data-testid="stat-tare-alerts"><div className="stat-label">فحوصات وزن مستحقة</div><div className="stat-value">{mixersQuery.isLoading || mixersQuery.isError ? '—' : kg(tareDueSoonCount + tareOverdueCount)}</div><div className="stat-note">{mixersQuery.isLoading || mixersQuery.isError ? 'تعذّر احتساب الحالة' : `${kg(tareOverdueCount)} متأخرة · ${kg(tareDueSoonCount)} قريبة`}</div></div>
    </section>}

    <div className="grid calc-layout">
      <section className="panel">
        <div className="panel-head"><div className="panel-title">بيانات الوزن</div></div>
        <div className="panel-body">
          {mixersQuery.isLoading ? <LoadingBlock rows={3} /> : mixers.length === 0 ? <EmptyState title="لا توجد خلاطات" /> : <div className="grid field-grid">
            <div className="field full"><label htmlFor="weigh-mixer">رقم الخلاطة</label><select id="weigh-mixer" className="control select-control" value={mixerId} onChange={(event) => { setMixerId(event.target.value); setValidation(''); }} data-testid="select-operation-mixer"><option value="">اختر الخلاطة</option>{mixers.map((mixer) => <option key={mixer.id} value={mixer.id}>{mixer.vehicleNumber} — {mixer.driverName} · فارغ {kg(mixer.tareWeightKg)} كغ</option>)}</select>{selectedMixer && <span className="field-hint">الوزن الفارغ: <b>{kg(selectedMixer.tareWeightKg)} كغ</b></span>}</div>
            <div className="field"><label htmlFor="gross-weight">الوزن القائم <span className="field-hint">كغ</span></label><input id="gross-weight" type="number" min="1" step="1" inputMode="decimal" dir="ltr" className="control" value={gross} onChange={(event) => { setGross(event.target.value); setValidation(''); }} data-testid="input-gross-weight" /></div>
            <div className="field"><label htmlFor="operation-date">التاريخ</label><input id="operation-date" type="date" className="control" value={date} onChange={(event) => setDate(event.target.value)} data-testid="input-operation-date" /></div>
          </div>}
          {validation && <div className="error-box" role="alert" data-testid="status-validation">{validation}</div>}
          <div className="calc-equation" data-testid="text-calculation"><span>{gross && Number.isFinite(grossNumber) ? kg(grossNumber) : '—'}</span><span>−</span><span>{selectedMixer ? kg(selectedMixer.tareWeightKg) : '—'}</span><span>=</span><span>{netWeightKg ? kg(netWeightKg) : '—'} كغ</span><span>÷ 2330 =</span><strong>{netWeightKg ? cubicMeters(netWeightKg) : '—'} م³</strong></div>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={() => { if (!mixerId || !selectedMixer) { setValidation('اختر الخلاطة.'); return; } if (!date) { setValidation('أدخل تاريخ العملية.'); return; } if (!gross || !Number.isFinite(grossNumber) || netWeightKg <= 0) { setValidation('يجب أن يكون الوزن القائم أكبر من الوزن الفارغ.'); return; } setValidation(''); setArchiveOpen(true); }} disabled={mixersQuery.isLoading || mixers.length === 0 || !netWeightKg} data-testid="button-save-operation"><Scale />حفظ المرتجع</button>
            <button type="button" className="btn btn-secondary" onClick={clear} data-testid="button-clear-fields"><RotateCcw />مسح الحقول</button>
            <Link href="/mixers" className="btn btn-quiet" data-testid="link-add-mixer">إدارة الخلاطات</Link>
          </div>
        </div>
      </section>
      <aside className="grid">
        <div className="result-card">
          <div className="result-label">كمية المرتجع</div>
          <div className="result-number" data-testid="text-concrete-weight">{netWeightKg > 0 ? cubicMeters(netWeightKg) : '—'}</div>
          <div className="result-unit">متر مكعب</div>
          <hr className="result-rule" />
          <div className="result-tonnes"><span>فرق الوزن</span><strong data-testid="text-concrete-tonnes">{netWeightKg > 0 ? kg(netWeightKg) : '—'} كغ</strong></div>
        </div>
        <div className="density-note">الكثافة المعتمدة: {kg(CONCRETE_DENSITY_KG_PER_M3)} كغ/م³</div>
      </aside>
    </div>

    {archiveOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !createOperation.isPending) setArchiveOpen(false); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="archive-title">
        <div className="modal-head"><div><h2 id="archive-title">حفظ المرتجع</h2></div><button type="button" className="icon-btn" onClick={() => setArchiveOpen(false)} aria-label="إغلاق" data-testid="button-close-archive"><X /></button></div>
        <div className="modal-body">
          <div className="notice" style={{marginTop:0,marginBottom:18}}><strong>{selectedMixer?.vehicleNumber}</strong> · {selectedMixer?.driverName}<br/>{kg(grossNumber)} − {selectedMixer ? kg(selectedMixer.tareWeightKg) : '—'} = {kg(netWeightKg)} كغ<br/><strong>الكمية المرتجعة: {cubicMeters(netWeightKg)} م³</strong></div>
          <div className="field"><label htmlFor="customer-name">اسم العميل</label><input autoFocus id="customer-name" className="control" maxLength={150} placeholder="اسم العميل أو المشروع" value={customer} onChange={(event) => { setCustomer(event.target.value); setValidation(''); }} data-testid="input-customer-name" /></div>
          {validation && <div className="error-box" data-testid="status-validation">{validation}</div>}
          {createOperation.isError && <div className="error-box" role="alert">فشل الحفظ. راجع البيانات ثم حاول مجدداً.</div>}
          <div className="actions"><button type="button" className="btn btn-primary" onClick={submit} disabled={createOperation.isPending} data-testid="button-confirm-archive"><Check />{createOperation.isPending ? 'جارٍ الحفظ…' : 'حفظ العملية'}</button><button type="button" className="btn btn-secondary" onClick={() => setArchiveOpen(false)} disabled={createOperation.isPending} data-testid="button-cancel-archive">إلغاء</button></div>
        </div>
      </section>
    </div>}
  </>;
}
