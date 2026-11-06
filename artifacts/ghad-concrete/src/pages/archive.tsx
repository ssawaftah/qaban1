import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Filter, Pencil, RotateCcw, Search, Trash2, X } from 'lucide-react';
import {
  getGetDashboardSummaryQueryKey, getListOperationsQueryKey,
  useDeleteOperation, useListMixers, useListOperations, useUpdateOperation,
} from '@workspace/api-client-react';
import type { ListOperationsParams, Operation } from '@workspace/api-client-react';
import { cubicMeters, EmptyState, ErrorBox, kg, LoadingBlock, localDateInput, PageHeading, dateLabel } from '@/components/shared';

import { MixerSelect } from '@/components/mixer-select';

type FilterState = { dateFrom: string; dateTo: string; customerName: string; mixerId: string };
const defaultFilters = (): FilterState => {
  const today = localDateInput();
  return { dateFrom: today, dateTo: today, customerName: '', mixerId: '' };
};
const toParams = (filters: FilterState): ListOperationsParams => {
  const out: ListOperationsParams = {};
  if (filters.dateFrom) out.dateFrom = filters.dateFrom;
  if (filters.dateTo) out.dateTo = filters.dateTo;
  if (filters.customerName.trim()) out.customerName = filters.customerName.trim();
  if (filters.mixerId) out.mixerId = Number(filters.mixerId);
  return out;
};

export default function ArchivePage({ notify }: { notify: (message: string, error?: boolean) => void }) {
  const client = useQueryClient();
  const mixersQuery = useListMixers();
  const [draft, setDraft] = useState<FilterState>(defaultFilters);
  const [active, setActive] = useState<FilterState>(() => ({...draft}));
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
  const applyFilters = () => {
    if (draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo) {
      notify('يجب أن يكون تاريخ البداية قبل تاريخ النهاية أو مساويًا له.', true);
      return;
    }
    setActive({...draft});
  };
  const clearFilters = () => { const defaults = defaultFilters(); setDraft(defaults); setActive({...defaults}); };
  const setFilter = (key: keyof FilterState, value: string) => setDraft((current) => ({...current,[key]:value}));
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
    <PageHeading title="أرشيف العمليات" description="كل رحلة في سجل واحد. ابحث، راجع، وأدر بيانات المرتجعات." />
    {mixersQuery.isError && <ErrorBox retry={() => void mixersQuery.refetch()} text="تعذّر تحميل قائمة الخلاطات اللازمة للتصفية والتعديل." />}
    <section className="panel filter-panel">
      <div className="panel-head"><div className="filter-heading"><Filter/><div><div className="panel-title">تصفية السجل</div><div className="panel-subtitle">حدّد الفترة والعميل والخلاطة للوصول إلى العملية المطلوبة</div></div></div><div className="actions" style={{margin:0}}><button type="button" className="btn btn-secondary" onClick={clearFilters} data-testid="button-clear-filters"><RotateCcw/>إعادة ضبط</button><button type="button" className="btn btn-primary" onClick={applyFilters} data-testid="button-apply-filters"><Search/>بحث</button></div></div>
      <div className="panel-body"><div className="grid filter-grid">
        <FilterInput label="من تاريخ" id="filter-date-from" type="date" value={draft.dateFrom} onChange={(v) => setFilter('dateFrom',v)} />
        <FilterInput label="إلى تاريخ" id="filter-date-to" type="date" value={draft.dateTo} onChange={(v) => setFilter('dateTo',v)} />
        <FilterInput label="اسم العميل" id="filter-customer" value={draft.customerName} onChange={(v) => setFilter('customerName',v)} placeholder="اسم العميل" />
        <div className="field"><label htmlFor="filter-mixer">الخلاطة</label><MixerSelect id="filter-mixer" value={draft.mixerId} onChange={(value) => setFilter('mixerId', value)} mixers={mixersQuery.data ?? []} placeholder="كل الخلاطات" disabled={mixersQuery.isLoading} /></div>
      </div></div>
    </section>

    <section className="panel">
      <div className="panel-head"><div className="panel-heading-group"><div className="panel-title">سجل العمليات</div>{query.data && <span className="count-badge">{kg(query.data.length)} عملية</span>}</div>{query.data && <div className="table-total"><span>إجمالي النتائج</span><strong>{cubicMeters(query.data.reduce((sum, operation) => sum + operation.concreteWeightKg, 0))} <small>م³</small></strong></div>}</div>
      {query.isError && <div style={{padding:18}}><ErrorBox retry={() => void query.refetch()} /></div>}
      {query.isLoading ? <div className="panel-body"><LoadingBlock rows={4}/></div> : query.data && query.data.length === 0 ? <EmptyState title={Object.values(active).some(Boolean) ? 'لا توجد عمليات تطابق البحث' : 'لا توجد عمليات محفوظة'} detail="جرّب تغيير الفترة أو العميل أو الخلاطة لعرض سجلات أخرى." /> : query.data && <div className="table-wrap" role="region" aria-label="جدول العمليات المؤرشفة" tabIndex={0}><table><thead><tr><th>التاريخ</th><th>العميل</th><th>المركبة / السائق</th><th>الوزن القائم</th><th>الوزن الفارغ</th><th>المرتجع</th><th>الإجراءات</th></tr></thead><tbody>
        {query.data.map((operation) => <tr key={operation.id} data-testid={`row-operation-${operation.id}`}>
          <td><span className="date-cell">{dateLabel(operation.operationDate)}</span></td><td><strong data-testid={`text-customer-${operation.id}`}>{operation.customerName}</strong></td>
          <td><div className="plate-number">{operation.vehicleNumber}</div><small className="muted">{operation.driverName || '—'}</small></td>
          <td><span className="mono" data-testid={`text-gross-${operation.id}`}>{kg(operation.grossWeightKg)} كغ</span></td>
          <td><span className="mono" data-testid={`text-snapshot-tare-${operation.id}`}>{kg(operation.tareWeightKg)} كغ</span></td>
          <td><strong className="mono" data-testid={`text-snapshot-concrete-${operation.id}`}>{cubicMeters(operation.concreteWeightKg)} م³</strong><small className="muted" style={{display:'block',marginTop:3}}>{kg(operation.concreteWeightKg)} كغ</small></td>
          <td><div className="row-actions"><button type="button" className="icon-btn" title="تعديل العملية" aria-label={`تعديل عملية ${operation.id}`} onClick={() => beginEdit(operation)} data-testid={`button-edit-operation-${operation.id}`}><Pencil/></button><button type="button" className="icon-btn danger" title="حذف العملية" aria-label={`حذف عملية ${operation.id}`} onClick={() => {setDeleting(operation);setDeleteError('');}} data-testid={`button-delete-operation-${operation.id}`}><Trash2/></button></div></td>
        </tr>)}
      </tbody></table></div>}
    </section>

    {editing && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !update.isPending) setEditing(null); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-operation-title">
        <div className="modal-head"><div><h2 id="edit-operation-title">تعديل عملية محفوظة</h2></div><button className="icon-btn" type="button" onClick={() => setEditing(null)} aria-label="إغلاق" data-testid="button-close-edit-operation"><X/></button></div>
        <div className="modal-body"><div className="grid field-grid">
          <div className="field"><label htmlFor="edit-operation-customer">اسم العميل</label><input id="edit-operation-customer" className="control" maxLength={150} value={editCustomer} onChange={(e) => setEditCustomer(e.target.value)} data-testid="input-edit-operation-customer"/></div>
          <div className="field"><label htmlFor="edit-operation-date">تاريخ العملية</label><input id="edit-operation-date" type="date" className="control" value={editDate} onChange={(e) => setEditDate(e.target.value)} data-testid="input-edit-operation-date"/></div>
          <div className="field full"><label htmlFor="edit-operation-mixer">الخلاطة</label><MixerSelect id="edit-operation-mixer" testId="select-edit-operation-mixer" value={editMixer} onChange={setEditMixer} mixers={mixersQuery.data ?? []} showTare disabled={mixersQuery.isLoading} /></div>
          <div className="field"><label htmlFor="edit-operation-gross">الوزن الإجمالي <span className="field-hint">كغ</span></label><input id="edit-operation-gross" type="number" min="1" step="1" dir="ltr" className="control" value={editGross} onChange={(e) => setEditGross(e.target.value)} data-testid="input-edit-operation-gross"/></div>
          <div className="field"><label>المرتجع الحالي</label><div className="notice" style={{margin:0}}>{cubicMeters(editing.concreteWeightKg)} م³ · {kg(editing.concreteWeightKg)} كغ</div></div>
          {editError && <div className="error-box field full" role="alert" data-testid="status-edit-error">{editError}</div>}
          <div className="actions field full"><button className="btn btn-primary" type="button" onClick={saveEdit} disabled={update.isPending || mixersQuery.isLoading} data-testid="button-submit-edit-operation"><Check/>{update.isPending ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}</button><button className="btn btn-secondary" type="button" onClick={() => setEditing(null)} disabled={update.isPending} data-testid="button-cancel-edit-operation">إلغاء</button></div>
        </div></div>
      </section>
    </div>}

    {deleting && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !deleteMutation.isPending) setDeleting(null); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-operation-title">
        <div className="modal-head"><div><h2 id="delete-operation-title">حذف العملية؟</h2></div><button className="icon-btn" type="button" onClick={() => setDeleting(null)} aria-label="إغلاق" data-testid="button-close-delete-operation"><X/></button></div>
        <div className="modal-body"><div className="notice" style={{marginTop:0}}>سيتم حذف رحلة <strong>{deleting.customerName}</strong> للمركبة <strong>{deleting.vehicleNumber}</strong> بتاريخ {dateLabel(deleting.operationDate)}.</div>{deleteError && <div className="error-box" role="alert" data-testid="status-delete-error">{deleteError}</div>}<div className="actions"><button type="button" className="btn btn-danger" onClick={confirmDelete} disabled={deleteMutation.isPending} data-testid="button-confirm-delete-operation"><Trash2/>{deleteMutation.isPending ? 'جارٍ الحذف…' : 'تأكيد الحذف'}</button><button type="button" className="btn btn-secondary" onClick={() => setDeleting(null)} disabled={deleteMutation.isPending} data-testid="button-cancel-delete-operation">إلغاء</button></div></div>
      </section>
    </div>}
  </>;
}

function FilterInput({label,id,type='text',value,onChange,placeholder}: {label:string;id:string;type?:string;value:string;onChange:(value:string)=>void;placeholder?:string}) {
  return <div className="field"><label htmlFor={id}>{label}</label><input id={id} className="control" type={type} inputMode={type === 'number' ? 'decimal' : undefined} dir={type === 'number' ? 'ltr' : undefined} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} data-testid={id}/></div>;
}
