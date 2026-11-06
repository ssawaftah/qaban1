import { Link } from 'wouter';
import { ArrowRight, FileQuestion } from 'lucide-react';

export default function NotFound() {
  return <div className="empty-state" dir="rtl">
    <div className="empty-mark"><FileQuestion size={24}/></div>
    <h1>الصفحة غير موجودة</h1>
    <p>قد يكون الرابط غير صحيح أو تم نقل الصفحة.</p>
    <Link href="/" className="btn btn-primary" style={{marginTop:20}}><ArrowRight/>العودة إلى الميزان</Link>
  </div>;
}
