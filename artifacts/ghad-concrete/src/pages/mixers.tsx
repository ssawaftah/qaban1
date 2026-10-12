import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import {
  getGetDashboardSummaryQueryKey, getListMixersQueryKey,
  useCreateMixer, useDeleteMixer, useListMixers, useUpdateMixer, useUpdateMixerTare,
} from '@workspace/api-client-react';
import type { Mixer } from '@workspace/api-client-react';
import { EmptyState, ErrorBox, kg, LoadingBlock, localDateInput, PageHeading, dateLabel, tareFreshness } from '@/components/shared';

type FormState = { vehicleNumber: string; driverName: string; tareWeightKg: string; tareWeighedAt: string };
const blankForm = (): FormState => ({ vehicleNumber: '', driverName: '', tareWeightKg: '', tareWeighedAt: localDateInput() });
export default function MixersPage({ notify }: { notify: (message: string, error?: boolean) => void }) {
  const client = useQueryClient();
  const query = useListMixers();
  const create = useCreateMixer();
  const update = useUpdateMixer();
  const deleteMutation = useDeleteMixer();
  const updateTare = useUpdateMixerTare();
  const [dialog, setDialog] = useState<'mixer' | 'tare' | 'delete' | null>(null);
  const [selected, setSelected] = useState<Mixer | null>(null);
  const [form, setForm] = useState<FormState>(blankForm());
  const [error, setError] = useState('');
  const busy = create.isPending || update.isPending || updateTare.isPending || deleteMutation.isPending;
  const refresh = () => {
    void client.invalidateQueries({ queryKey: getListMixersQueryKey() });
    void client.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  };
  const openCreate = () => { setSelected(null); setForm(blankForm()); setError(''); setDialog('mixer'); };
  const openEdit = (mixer: Mixer) => { setSelected(mixer); setForm({ vehicleNumber: mixer.vehicleNumber, driverName: mixer.driverName, tareWeightKg: String(mixer.tareWeightKg), tareWeighedAt: localDateInput(mixer.tareWeighedAt) }); setError(''); setDialog('mixer'); };
  const openTare = (mixer: Mixer) => { setSelected(mixer); setForm({ ...blankForm(), tareWeightKg: String(mixer.tareWeightKg) }); setError(''); setDialog('tare'); };
  const saveMixer = () => {
    const vehicleNumber = form.vehicleNumber.trim();
    const driverName = form.driverName.trim();
    const tareWeightKg = Number(form.tareWeightKg);
    if (!vehicleNumber || vehicleNumber.length > 30) { setError('أدخل رقم مركبة من 1 إلى 30 حرفاً.'); return; }
    if (!driverName || driverName.length > 100) { setError('أدخل اسم السائق من 1 إلى 100 حرف.'); return; }
    if (!selected && (!Number.isFinite(tareWeightKg) || tareWeightKg <= 0)) { setError('أدخل وزناً فارغاً أكبر من صفر.'); return; }
    if (!form.tareWeighedAt) { setError('أدخل تاريخ قياس الوزن الفارغ.'); return; }
    const onSuccess = () => { refresh(); setDialog(null); notify(selected ? 'تم تحديث بيانات الخلاطة.' : 'أُضيفت الخلاطة إلى الأسطول.'); };
    if (selected) update.mutate({ id: selected.id, data: { vehicleNumber, driverName } }, { onSuccess, onError: () => setError('تعذّر تحديث الخلاطة. حاول مرة أخرى.') });
    else create.mutate({ data: { vehicleNumber, driverName, tareWeightKg, tareWeighedAt: form.tareWeighedAt } }, { onSuccess, onError: () => setError('تعذّر إضافة الخلاطة. تحقق من البيانات وحاول مجدداً.') });
  };
  const saveTare = () => {
    const tareWeightKg = Number(form.tareWeightKg);
    if (!selected) return;
    if (!Number.isFinite(tareWeightKg) || tareWeightKg <= 0) { setError('يجب أن يكون الوزن الفارغ أكبر من صفر.'); return; }
    if (!form.tareWeighedAt) { setError('أدخل تاريخ قياس الوزن.'); return; }
    updateTare.mutate({ id: selected.id, data: { tareWeightKg, tareWeighedAt: form.tareWeighedAt } }, {
      onSuccess: () => { refresh(); setDialog(null); notify('تم تسجيل الوزن الفارغ الجديد.'); },
      onError: () => setError('لم يتم تحديث الوزن. حاول مرة أخرى.'),
    });
  };
  const confirmDelete = () => {
    if (!selected) return;
    deleteMutation.mutate({ id: selected.id }, {
      onSuccess: () => { refresh(); setDialog(null); notify('تم حذف الخلاطة من الأسطول.'); },
      onError: () => setError('تعذّر حذف الخلاطة. قد تكون مرتبطة بعمليات محفوظة.'),
    });
  };
  return <>
    <PageHeading title="إدارة الخلاطات">
      <button type="button" className="btn btn-primary" onClick={openCreate} data-testid="button-add-mixer"><Plus />إضافة خلاطة</button>
    </PageHeading>
    <section className="panel">
      <div className="panel-head"><div className="panel-title">الخلاطات المسجلة{query.data ? ` · ${kg(query.data.length)}` : ''}</div>
        <div className="legend" aria-label="دليل حداثة الوزن"><span className="legend-item"><i className="legend-dot" style={{background:'#4d9a70'}}/>حديث · حتى ٣٠ يوماً</span><span className="legend-item"><i className="legend-dot" style={{background:'#d49a37'}}/>قريب · ٣١–٨٩ يوماً</span><span className="legend-item"><i className="legend-dot" style={{background:'#bc5a4e'}}/>متأخر · ٩٠ يوماً فأكثر</span></div>
      </div>
      {query.isError && <div style={{padding:18}}><ErrorBox retry={() => void query.refetch()} /></div>}
      {query.isLoading ? <div className="panel-body"><LoadingBlock rows={4}/></div> : query.data && query.data.length === 0 ? <EmptyState title="لا توجد خلاطات" /> : query.data && <div className="table-wrap"><table><thead><tr><th>رقم المركبة</th><th>السائق</th><th>الوزن الفارغ</th><th>آخر قياس</th><th>حداثة الوزن</th><th>الإجراءات</th></tr></thead><tbody>
        {query.data.map((mixer) => {
          const state = tareFreshness(mixer.tareWeighedAt);
          return <tr key={mixer.id} data-testid={`row-mixer-${mixer.id}`}>
            <td><strong data-testid={`text-vehicle-${mixer.id}`}>{mixer.vehicleNumber}</strong></td><td>{mixer.driverName}</td>
            <td><span className="mono" data-testid={`text-tare-${mixer.id}`}>{kg(mixer.tareWeightKg)} كغ</span></td><td className="muted">{dateLabel(mixer.tareWeighedAt)}</td>
            <td><span className={`status-pill ${state.cls}`} data-testid={`status-tare-${mixer.id}`}>{state.label} · {kg(state.age)} يوم</span></td>
            <td><div className="row-actions"><button type="button" className="icon-btn" title="تعديل البيانات" aria-label={`تعديل ${mixer.vehicleNumber}`} onClick={() => openEdit(mixer)} data-testid={`button-edit-mixer-${mixer.id}`}><Pencil/></button><button type="button" className="icon-btn" title="تحديث الوزن الفارغ" aria-label={`تحديث وزن ${mixer.vehicleNumber}`} onClick={() => openTare(mixer)} data-testid={`button-update-tare-${mixer.id}`}><RefreshCw/></button><button type="button" className="icon-btn danger" title="حذف الخلاطة" aria-label={`حذف ${mixer.vehicleNumber}`} onClick={() => { setSelected(mixer); setError(''); setDialog('delete'); }} data-testid={`button-delete-mixer-${mixer.id}`}><Trash2/></button></div></td>
          </tr>;
        })}
      </tbody></table></div>}
    </section>
    {dialog && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDialog(null); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="mixer-dialog-title">
        <div className="modal-head"><div><h2 id="mixer-dialog-title">{dialog === 'mixer' ? selected ? 'تعديل بيانات الخلاطة' : 'إضافة خلاطة جديدة' : dialog === 'tare' ? 'تسجيل وزن فارغ جديد' : 'تأكيد حذف الخلاطة'}</h2>{selected && <div className="panel-subtitle">{selected.vehicleNumber}</div>}</div><button type="button" className="icon-btn" onClick={() => setDialog(null)} disabled={busy} aria-label="إغلاق" data-testid="button-close-mixer-dialog"><X/></button></div>
        <div className="modal-body">
          {dialog === 'delete' ? <><div className="notice" style={{marginTop:0}}>سيتم حذف <strong>{selected?.vehicleNumber}</strong> من قائمة الخلاطات. لا يمكن التراجع عن هذا الإجراء.</div>{error && <div className="error-box">{error}</div>}<div className="actions"><button type="button" className="btn btn-danger" onClick={confirmDelete} disabled={busy} data-testid="button-confirm-delete-mixer"><Trash2/>{deleteMutation.isPending ? 'جارٍ الحذف…' : 'حذف الخلاطة'}</button><button type="button" className="btn btn-secondary" onClick={() => setDialog(null)} disabled={busy} data-testid="button-cancel-delete-mixer">إلغاء</button></div></> :
          <div className="grid field-grid">
            {dialog === 'mixer' && <>
              <div className="field"><label htmlFor="mixer-vehicle">رقم المركبة</label><input id="mixer-vehicle" className="control" maxLength={30} value={form.vehicleNumber} onChange={(e) => setForm({...form,vehicleNumber:e.target.value})} placeholder="رقم المركبة" data-testid="input-mixer-vehicle"/></div>
              <div className="field"><label htmlFor="mixer-driver">اسم السائق</label><input id="mixer-driver" className="control" maxLength={100} value={form.driverName} onChange={(e) => setForm({...form,driverName:e.target.value})} placeholder="اسم السائق" data-testid="input-mixer-driver"/></div>
            </>}
            {(!selected && dialog === 'mixer' || dialog === 'tare') && <>
              <div className="field"><label htmlFor="mixer-tare">الوزن الفارغ <span className="field-hint">كغ</span></label><input id="mixer-tare" type="number" min="1" step="1" dir="ltr" inputMode="decimal" className="control" value={form.tareWeightKg} onChange={(e) => setForm({...form,tareWeightKg:e.target.value})} placeholder="وزن الخلاطة" data-testid="input-mixer-tare"/></div>
              <div className="field"><label htmlFor="mixer-tare-date">تاريخ الوزن</label><input id="mixer-tare-date" type="date" className="control" value={form.tareWeighedAt} onChange={(e) => setForm({...form,tareWeighedAt:e.target.value})} data-testid="input-mixer-tare-date"/></div>
            </>}
            {error && <div className="error-box field full">{error}</div>}
            <div className="actions field full"><button type="button" className="btn btn-primary" onClick={dialog === 'tare' ? saveTare : saveMixer} disabled={busy} data-testid="button-submit-mixer"><Check/>{busy ? 'جارٍ الحفظ…' : dialog === 'tare' ? 'حفظ الوزن الجديد' : selected ? 'حفظ التعديلات' : 'إضافة إلى الأسطول'}</button><button type="button" className="btn btn-secondary" onClick={() => setDialog(null)} disabled={busy} data-testid="button-cancel-mixer">إلغاء</button></div>
          </div>}
        </div>
      </section>
    </div>}
  </>;
}
