# نظام الغد للباطون الجاهز

تطبيق React وTypeScript لإدارة وزن الخرسانة المرتجعة والخلاطات والأرشيف، يعمل على **Cloudflare Pages Functions + D1**.

## الملفات

التطبيق مستقل داخل `artifacts/ghad-concrete/`. بقي هذا المسار لأن مشروع Pages الحالي مرتبط به.

```text
artifacts/ghad-concrete/
├── src/
│   ├── api/          # طلبات API وأنواع البيانات وReact Query
│   ├── components/   # العناصر المشتركة واختيار الخلاطة
│   ├── lib/          # البحث والتنسيق
│   └── pages/        # الميزان، الأرشيف، الخلاطات
├── functions/        # API والمصادقة وعمليات D1
├── migrations/       # ترحيلات قاعدة البيانات الأصلية
├── public/           # الأيقونة وrobots.txt
├── tests/            # فحوص المصادقة والبحث والعمليات
├── wrangler.toml     # إعداد Pages وربط D1
└── vite.config.ts    # بناء الواجهة
```

## التطوير

يتطلب Node.js 22.18 أو أحدث (يفضّل 24)، وpnpm 11.25.0.

```sh
cd artifacts/ghad-concrete
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
```

اضبط `ADMIN_USERNAME` و`ADMIN_PASSWORD` في `.dev.vars` بكلمة مرور لا تقل عن 14 حرفًا. لا ترفع هذا الملف إلى Git.

```sh
pnpm db:migrate:local
pnpm dev
```

الأمر `dev` يشغّل الواجهة وPages Functions وقاعدة محلية. بعد تعديل الواجهة أعد تشغيله لإعادة البناء.

```sh
pnpm typecheck
pnpm test
pnpm build
```

## النشر على Cloudflare Pages

إعدادات مشروع Pages الحالي `qaban` تبقى كما هي:

- المستودع: `ssawaftah/qaban1`، فرع الإنتاج: `main`.
- Root directory: `artifacts/ghad-concrete`.
- Build command: `pnpm run build`.
- Build output directory: `dist/public`.
- ربط قاعدة البيانات: `DB`، وقاعدة D1 الحالية المعرّفة في `wrangler.toml`.
- متغيرا الإنتاج السريان: `ADMIN_USERNAME` و`ADMIN_PASSWORD`، و`APP_BASE_PATH` فارغ.

لا تُطبّق الترحيلات على قاعدة الإنتاج تلقائيًا أثناء البناء. لم تتغير أسماء الترحيلات أو محتوياتها أو معرّف D1. لا تحذف أو تعِد إنشاء قاعدة البيانات عند نشر تحديثات الكود. أضف ترحيلًا جديدًا فقط إذا احتاج تعديل مستقبلي تغيير المخطط.

حُذفت أدوات Replit وSites والنسخ التجريبية. التشغيل والإنتاج يعتمدان على Cloudflare Pages مباشرةً.

## برنامج قبان الغد

مصدر تطبيق Windows موجود في `tools/qaban-bridge/`. يرسل الوزن كل ثانية للنظام الأساسي وللمرتجعات عبر قناتين مستقلتين، ويحتفظ بإعدادات النظام السابق. الرموز تُدخل محليًا وتُشفّر لحساب Windows؛ لا تُرفع إلى Git. تفاصيل الربط والتشغيل والاختبارات في [دليل ربط القبان](artifacts/ghad-concrete/SCALE_INTEGRATION.md).
