import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Filter, Pencil, RotateCcw, Search, Trash2, X } from 'lucide-react';
import {
  getGetDashboardSummaryQueryKey, getListOperationsQueryKey,
  useDeleteOperation, useListMixers, useListOperations, useUpdateOperation,
} from '@workspace/api-client-react';
import type { ListOperationsParams, Operation } from '@workspace/api-client-react';
import { EmptyState, ErrorBox, kg, LoadingBlock, localDateInput, PageHeading, tonnes, dateLabel } from '@/components/shared';

type FilterState = Record<string, string>;
const emptyFilters: FilterState = {
  dateFrom: '', dateTo: '', customerName: '', mixerId: '', vehicleNumber: '', driverName: '',
  grossMinKg: '', grossMaxKg: '', tareMinKg: '', tareMaxKg: '', concreteMinKg: '', concreteMaxKg: '',
};
const toParams = (filters: FilterState): ListOperationsParams => {
  const out: ListOperationsParams = {};
  if (filters.dateFrom) out.dateFrom = filters.dateFrom;
  if (filters.dateTo) out.dateTo = filters.dateTo;
  if (filters.customerName.trim()) out.customerName = filters.customerName.trim();
  if (filters.mixerId) out.mixerId = Number(filters.mixerId);
  if (filters.vehicleNumber.trim()) out.vehicleNumber = filters.vehicleNumber.trim();
  if (filters.driverName.trim()) out.driverName = filters.driverName.trim();
  (['grossMinKg','grossMaxKg','tareMinKg','tareMaxKg','concreteMinKg','concreteMaxKg'] as const).forEach((key) => {
    const value = filters[key];
    if (value !== '' && Number.isFinite(Number(value))) out[key] = Number(value);
  });
  return out;
};

export default function ArchivePage({ notify }: { notify: (message: string, error?: boolean) => void }) {
  const client = useQueryClient();
  const mixersQuery = useListMixers();
  const [draft, setDraft] = useState<FilterState>({...emptyFilters});
  const [active, setActive] = useState<FilterState>({...emptyFilters});
  const params = useMemo(() => toParams(active), [active]);
  const query = useListOperations(params);
  const update = useUpdateOperation();
  const deleteMutation = useDeleteOperation();
  const [editing, setEditing] = useState<Operation | null>(null);
  const [editCustomer, setEditCustomer] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editMixer, setEditMixer] = useState('');
  const [editGross, setEditGross] = useState('');
  const [editError, setEditError] = useState('');
  const [deleting, setDeleting] = useState<Operation | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const refresh = () => {
    void client.invalidateQueries({ queryKey: getListOperationsQueryKey() });
    void client.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  };
  const applyFilters = () => setActive({...draft});
  const clearFilters = () => { setDraft({...emptyFilters}); setActive({...emptyFilters}); };
  const setFilter = (key: string, value: string) => setDraft((current) => ({...current,[key]:value}));
  const beginEdit = (operation: Operation) => {
    setEditing(operation);
    setEditCustomer(operation.customerName);
    setEditDate(localDateInput(operation.operationDate));
    setEditMixer(operation.mixerId ? String(operation.mixerId) : '');
    setEditGross(String(operation.grossWeightKg));
    setEditError('');
  };
  const saveEdit = () => {
    const operation = editing;
    const grossWeightKg = Number(editGross);
    const mixerId = Number(editMixer);
    const mixer = (mixersQuery.data ?? []).find((item) => item.id === mixerId);
    if (!operation) return;
    if (!editCustomer.trim() || editCustomer.trim().length > 150) { setEditError('أدخل اسم العميل (حتى ١٥٠ حرفاً).'); return; }
    if (!editDate) { setEditError('أدخل تاريخ العملية.'); return; }
    if (!mixer) { setEditError('اختر خلاطة مسجلة لتحديث العملية.'); return; }
    const tareWeightForEdit = mixer.id === operation.mixerId ? operation.tareWeightKg : mixer.tareWeightKg;
    if (!Number.isFinite(grossWeightKg) || grossWeightKg <= tareWeightForEdit) { setEditError('يجب أن يتجاوز الإجمالي الوزن الفارغ المحفوظ للعملية أو وزن الخلاطة الجديدة.'); return; }
    update.mutate({ id: operation.id, data: {
      operationDate: editDate,
      mixerId,
      customerName: editCustomer.trim(),
      grossWeightKg,
    } }, {
      onSuccess: () => { refresh(); setEditing(null); notify('تم تحديث العملية المؤرشفة.'); },
      onError: () => setEditError('تعذّر تحديث العملية. ربما تغيّرت بيانات الخلاطة؛ أعد المحاولة.'),
    });
  };
  const confirmDelete = () => {
    if (!deleting) return;
    deleteMutation.mutate({id:deleting.id}, {
      onSuccess: () => { refresh(); setDeleting(null); notify('حُذفت العملية من الأرشيف.'); },
      onError: () => setDeleteError('تعذّر حذف العملية. حاول مرة أخرى.'),
    });
  };

  return <>
    <PageHeading eyebrow="ARCHIVE / ٠٢" title="أرشيف العمليات" description="ابحث في الرحلات المحفوظة. الوزن الفارغ والصافي هنا هما اللقطة التي خُزّنت وقت الأرشفة." />
    {mixersQuery.isError && <ErrorBox retry={() => void mixersQuery.refetch()} text="تعذّر تحميل قائمة الخلاطات اللازمة للتصفية والتعديل." />}
    <section className="panel filter-panel">
      <div className="panel-head"><div className="filter-heading"><Filter/><div><div className="panel-title">تصفية السجل</div><div className="panel-subtitle">كل الشروط تُرسل إلى الخادم عند تطبيق البحث</div></div></div><div className="actions" style={{margin:0}}><button type="button" className="btn btn-secondary" onClick={clearFilters} data-testid="button-clear-filters"><RotateCcw/>مسح</button><button type="button" className="btn btn-primary" onClick={applyFilters} data-testid="button-apply-filters"><Search/>بحث في الأرشيف</button></div></div>
      <div className="panel-body"><div className="grid filter-grid">
        <FilterInput label="من تاريخ" id="filter-date-from" type="date" value={draft.dateFrom} onChange={(v) => setFilter('dateFrom',v)} />
        <FilterInput label="إلى تاريخ" id="filter-date-to" type="date" value={draft.dateTo} onChange={(v) => setFilter('dateTo',v)} />
        <FilterInput label="اسم العميل" id="filter-customer" value={draft.customerName} onChange={(v) => setFilter('customerName',v)} placeholder="اسم العميل" />
        <div className="field"><label htmlFor="filter-mixer">الخلاطة</label><select id="filter-mixer" className="control select-control" value={draft.mixerId} onChange={(e) => setFilter('mixerId',e.target.value)} data-testid="filter-mixer"><option value="">كل الخلاطات</option>{(mixersQuery.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.vehicleNumber} — {m.driverName}</option>)}</select></div>
        <FilterInput label="رقم المركبة" id="filter-vehicle" value={draft.vehicleNumber} onChange={(v) => setFilter('vehicleNumber',v)} placeholder="رقم المركبة" />
        <FilterInput label="اسم السائق" id="filter-driver" value={draft.driverName} onChange={(v) => setFilter('driverName',v)} placeholder="اسم السائق" />
        <FilterInput label="إجمالي من (كغ)" id="filter-gross-min" type="number" value={draft.grossMinKg} onChange={(v) => setFilter('grossMinKg',v)} />
        <FilterInput label="إجمالي إلى (كغ)" id="filter-gross-max" type="number" value={draft.grossMaxKg} onChange={(v) => setFilter('grossMaxKg',v)} />
        <FilterInput label="فارغ من (كغ)" id="filter-tare-min" type="number" value={draft.tareMinKg} onChange={(v) => setFilter('tareMinKg',v)} />
        <FilterInput label="فارغ إلى (كغ)" id="filter-tare-max" type="number" value={draft.tareMaxKg} onChange={(v) => setFilter('tareMaxKg',v)} />
        <FilterInput label="صافي من (كغ)" id="filter-concrete-min" type="number" value={draft.concreteMinKg} onChange={(v) => setFilter('concreteMinKg',v)} />
        <FilterInput label="صافي إلى (كغ)" id="filter-concrete-max" type="number" value={draft.concreteMaxKg} onChange={(v) => setFilter('concreteMaxKg',v)} />
      </div></div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><div className="panel-title">الرحلات المحفوظة</div><div className="panel-subtitle">{query.data ? `${kg(query.data.length)} نتيجة من الخادم` : 'لقطات التشغيل الأصلية'}</div></div><span className="mini-mark">WEIGHT SNAPSHOT</span></div>
      {query.isError && <div style={{padding:18}}><ErrorBox retry={() => void query.refetch()} /></div>}
      {query.isLoading ? <div className="panel-body"><LoadingBlock rows={4}/></div> : query.data && query.data.length === 0 ? <EmptyState title={Object.values(active).some(Boolean) ? 'لا توجد نتائج مطابقة' : 'لا توجد عمليات مؤرشفة بعد'} detail={Object.values(active).some(Boolean) ? 'جرّب تعديل شروط البحث أو مسح عوامل التصفية.' : 'بعد حفظ أول رحلة من شاشة الميزان، ستظهر لقطة الوزن هنا.'} /> : query.data && <div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>العميل</th><th>المركبة / السائق</th><th>الإجمالي</th><th>الفارغ المحفوظ</th><th>الصافي المحفوظ</th><th>الإجراءات</th></tr></thead><tbody>
        {query.data.map((operation) => <tr key={operation.id} data-testid={`row-operation-${operation.id}`}>
          <td>{dateLabel(operation.operationDate)}</td><td><strong data-testid={`text-customer-${operation.id}`}>{operation.customerName}</strong></td>
          <td><div>{operation.vehicleNumber}</div><small className="muted">{operation.driverName || '—'}</small></td>
          <td><span className="mono" data-testid={`text-gross-${operation.id}`}>{kg(operation.grossWeightKg)} كغ</span></td>
          <td><span className="mono" data-testid={`text-snapshot-tare-${operation.id}`}>{kg(operation.tareWeightKg)} كغ</span></td>
          <td><span className="mono" data-testid={`text-snapshot-concrete-${operation.id}`}>{kg(operation.concreteWeightKg)} كغ</span><small className="muted" style={{display:'block',marginTop:3}}>{tonnes(operation.concreteWeightKg)} طن متري</small></td>
          <td><div className="row-actions"><button type="button" className="icon-btn" title="تعديل العملية" aria-label={`تعديل عملية ${operation.id}`} onClick={() => beginEdit(operation)} data-testid={`button-edit-operation-${operation.id}`}><Pencil/></button><button type="button" className="icon-btn danger" title="حذف العملية" aria-label={`حذف عملية ${operation.id}`} onClick={() => {setDeleting(operation);setDeleteError('');}} data-testid={`button-delete-operation-${operation.id}`}><Trash2/></button></div></td>
        </tr>)}
      </tbody></table></div>}
    </section>

    {editing && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !update.isPending) setEditing(null); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-operation-title">
        <div className="modal-head"><div><h2 id="edit-operation-title">تعديل عملية مؤرشفة</h2><div className="panel-subtitle">تغيير تفاصيل الرحلة لا يغيّر لقطة الوزن الأصلية للخلاطة نفسها</div></div><button className="icon-btn" type="button" onClick={() => setEditing(null)} aria-label="إغلاق" data-testid="button-close-edit-operation"><X/></button></div>
        <div className="modal-body"><div className="grid field-grid">
          <div className="field"><label htmlFor="edit-operation-customer">اسم العميل</label><input id="edit-operation-customer" className="control" maxLength={150} value={editCustomer} onChange={(e) => setEditCustomer(e.target.value)} data-testid="input-edit-operation-customer"/></div>
          <div className="field"><label htmlFor="edit-operation-date">تاريخ العملية</label><input id="edit-operation-date" type="date" className="control" value={editDate} onChange={(e) => setEditDate(e.target.value)} data-testid="input-edit-operation-date"/></div>
          <div className="field full"><label htmlFor="edit-operation-mixer">الخلاطة</label><select id="edit-operation-mixer" className="control select-control" value={editMixer} onChange={(e) => setEditMixer(e.target.value)} data-testid="select-edit-operation-mixer"><option value="">اختر الخلاطة</option>{(mixersQuery.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.vehicleNumber} — {m.driverName} · فارغ {kg(m.tareWeightKg)} كغ</option>)}</select></div>
          <div className="field"><label htmlFor="edit-operation-gross">الوزن الإجمالي <span className="field-hint">كغ</span></label><input id="edit-operation-gross" type="number" min="1" step="1" dir="ltr" className="control" value={editGross} onChange={(e) => setEditGross(e.target.value)} data-testid="input-edit-operation-gross"/></div>
          <div className="field"><label>لقطة محفوظة حالياً</label><div className="notice" style={{margin:0}}>فارغ {kg(editing.tareWeightKg)} كغ · صافي {kg(editing.concreteWeightKg)} كغ</div></div>
          {editError && <div className="error-box field full" role="alert" data-testid="status-edit-error">{editError}</div>}
          <div className="actions field full"><button className="btn btn-primary" type="button" onClick={saveEdit} disabled={update.isPending || mixersQuery.isLoading} data-testid="button-submit-edit-operation"><Check/>{update.isPending ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}</button><button className="btn btn-secondary" type="button" onClick={() => setEditing(null)} disabled={update.isPending} data-testid="button-cancel-edit-operation">إلغاء</button></div>
        </div></div>
      </section>
    </div>}

    {deleting && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !deleteMutation.isPending) setDeleting(null); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-operation-title">
        <div className="modal-head"><div><h2 id="delete-operation-title">حذف العملية؟</h2><div className="panel-subtitle">إجراء نهائي من الأرشيف</div></div><button className="icon-btn" type="button" onClick={() => setDeleting(null)} aria-label="إغلاق" data-testid="button-close-delete-operation"><X/></button></div>
        <div className="modal-body"><div className="notice" style={{marginTop:0}}>سيتم حذف رحلة <strong>{deleting.customerName}</strong> للمركبة <strong>{deleting.vehicleNumber}</strong> بتاريخ {dateLabel(deleting.operationDate)}.</div>{deleteError && <div className="error-box" role="alert" data-testid="status-delete-error">{deleteError}</div>}<div className="actions"><button type="button" className="btn btn-danger" onClick={confirmDelete} disabled={deleteMutation.isPending} data-testid="button-confirm-delete-operation"><Trash2/>{deleteMutation.isPending ? 'جارٍ الحذف…' : 'تأكيد الحذف'}</button><button type="button" className="btn btn-secondary" onClick={() => setDeleting(null)} disabled={deleteMutation.isPending} data-testid="button-cancel-delete-operation">إلغاء</button></div></div>
      </section>
    </div>}
  </>;
}

function FilterInput({label,id,type='text',value,onChange,placeholder}: {label:string;id:string;type?:string;value:string;onChange:(value:string)=>void;placeholder?:string}) {
  return <div className="field"><label htmlFor={id}>{label}</label><input id={id} className="control" type={type} inputMode={type === 'number' ? 'decimal' : undefined} dir={type === 'number' ? 'ltr' : undefined} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} data-testid={id}/></div>;
}
