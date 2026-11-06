import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import type { Mixer } from '@workspace/api-client-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { kg } from '@/components/shared';
import { matchesMixerSearch } from '@/lib/mixer-search';

export function MixerSelect({ id, value, onChange, mixers, placeholder = 'اختر الخلاطة', showTare = false, disabled = false, testId = id }: {
  id: string; value: string; onChange: (value: string) => void; mixers: Mixer[];
  placeholder?: string; showTare?: boolean; disabled?: boolean; testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = mixers.find((mixer) => String(mixer.id) === value);
  const results = mixers.filter((mixer) => matchesMixerSearch(mixer, search));
  const select = (next: string) => { onChange(next); setOpen(false); setSearch(''); };
  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSearch(''); }}>
    <PopoverTrigger asChild>
      <button id={id} type="button" role="combobox" aria-expanded={open} aria-haspopup="listbox" className="control mixer-select-trigger" disabled={disabled} data-testid={testId}>
        <span>{selected ? `${selected.vehicleNumber} — ${selected.driverName}${showTare ? ` · فارغ ${kg(selected.tareWeightKg)} كغ` : ''}` : placeholder}</span>
        <ChevronsUpDown size={16} aria-hidden="true" />
      </button>
    </PopoverTrigger>
    <PopoverContent className="mixer-select-popover" align="start" dir="rtl">
      <Command shouldFilter={false} label="اختيار الخلاطة">
        <CommandInput value={search} onValueChange={setSearch} placeholder="ابحث بآخر رقمين أو رقم الخلاطة" aria-label="البحث عن خلاطة بآخر رقمين أو رقمها" data-testid={`${testId}-search`} />
        <CommandList>
          <CommandEmpty>لا توجد خلاطة مطابقة</CommandEmpty>
          <CommandGroup>
            {!search.trim() && <CommandItem value="all" onSelect={() => select('')}><Check style={{opacity: value ? 0 : 1}} />{placeholder}</CommandItem>}
            {results.map((mixer) => <CommandItem key={mixer.id} value={String(mixer.id)} onSelect={() => select(String(mixer.id))} data-testid={`${testId}-option-${mixer.id}`}>
              <Check style={{opacity: value === String(mixer.id) ? 1 : 0}} />
              <span><b>{mixer.vehicleNumber}</b> — {mixer.driverName}{showTare && <small className="mixer-option-tare">فارغ {kg(mixer.tareWeightKg)} كغ</small>}</span>
            </CommandItem>)}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}
