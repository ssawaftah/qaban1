import assert from 'node:assert/strict';
import {matchesMixerSearch} from '../artifacts/ghad-concrete/src/lib/mixer-search.ts';
const m={vehicleNumber:'12-34567',driverName:'أحمد'};
for (const q of ['', '67','٦٧','۶۷','34567','12-34567','أحمد','7'])assert.equal(matchesMixerSearch(m,q),true,q);
for (const q of ['12','34','٦٨','غير موجود'])assert.equal(matchesMixerSearch(m,q),false,q);
assert.equal(matchesMixerSearch({vehicleNumber:'١٢-٣٤٥٦٧',driverName:''},'67'),true);
console.log('PASS: last digits, Arabic and Persian digits, full plate, name, no false prefix matches');
