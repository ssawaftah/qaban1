using System;
using System.IO;
using System.IO.Ports;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Globalization;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Drawing;
using System.Web.Script.Serialization;
using System.Collections.Generic;

[assembly: System.Reflection.AssemblyTitle("قبان الغد")]
[assembly: System.Reflection.AssemblyProduct("قبان الغد")]
[assembly: System.Reflection.AssemblyDescription("قبان الغد")]
[assembly: System.Reflection.AssemblyVersion("0.9.0.0")]

namespace WeighbridgeBridge {
 public static class Protocol {
  public static bool Parse(string raw, out decimal weight) {
   weight=0; string s=raw.Trim('\x02','\x03','\n','\r',' ');
   s=Regex.Replace(s,@"^ST\s*,\s*(GS|NT)\s*,",m=>"ST,"+m.Groups[1].Value.ToUpperInvariant()+",",RegexOptions.IgnoreCase);
   if(s.StartsWith("ST,GS,")) {
    s=s.Substring(6);
    if(s.StartsWith("1,") && s.IndexOf(',')>=0) s=s.Substring(2);
   } else if(s.StartsWith("1,ST,")) s=s.Substring(5).Split(',')[0];
   else if(s.StartsWith("ST,NT,")) s=s.Substring(6).Split(',')[0];
   else return false;
   s=Regex.Replace(s,@"\s*,?\s*kg\s*$","",RegexOptions.IgnoreCase).Trim();
   return Regex.IsMatch(s,@"^[+-]?\s*\d+(?:\.\d+)?$") &&
     decimal.TryParse(s.Replace(" ",""),NumberStyles.AllowLeadingSign|NumberStyles.AllowDecimalPoint,CultureInfo.InvariantCulture,out weight);
  }
  public static string Payload(string company, decimal weight) {
   return "{\"company_id\":\""+company+"\",\"weight_scale\":\""+weight.ToString(CultureInfo.InvariantCulture)+"\"}";
  }
 }
 public sealed class Frames {
  string pending="";
  public bool Push(string part, out decimal weight, out string last) {
   weight=0;last="";bool valid=false; pending+=part;
   if(pending.Length>16384) {pending="";return false;}
   int k;
   while((k=pending.IndexOfAny(new char[]{'\r','\n'}))>=0) {
    string frame=pending.Substring(0,k);pending=pending.Substring(k+1);
    if(frame.Trim().Length==0) continue;
    last=frame;decimal w;
    // The latest complete frame is authoritative. An invalid newer frame
    // must invalidate any earlier valid one from the same read.
    valid=Protocol.Parse(frame,out w);if(valid) weight=w;
   }
   return valid;
  }
 }
 public sealed class Settings {
  public string Port="COM6",Parity="None",Endpoint="https://app.circlessoft.com:9083/api/store_weight_scale",Company="1",ResponseMarker="";
  public string ReturnsEndpoint="https://qaban-113.pages.dev/api/scale/weight",ReturnsTokenProtected="",PrimaryTokenProtected="";
  public bool ReturnsEnabled=false;
  public int Baud=9600,DataBits=8,Interval=1000,Freshness=3000;
 }
 public sealed partial class MainForm:Form {
  TextBox port=new TextBox(),endpoint=new TextBox(),company=new TextBox(),marker=new TextBox(),token=new TextBox(),returnsEndpoint=new TextBox(),returnsToken=new TextBox();
  NumericUpDown baud=new NumericUpDown(),bits=new NumericUpDown(),interval=new NumericUpDown(),fresh=new NumericUpDown();
  ComboBox parity=new ComboBox(); CheckBox enableSend=new CheckBox(),enableReturns=new CheckBox();
  Button start=new Button(),stop=new Button(),save=new Button();
  Label weight=new Label(),serialState=new Label(),httpState=new Label(),age=new Label();
  TextBox log=new TextBox(); TableLayoutPanel fields=new TableLayoutPanel();
  SerialPort serial;Frames frames;decimal latest;long received=-1;bool running;DateTime sampledAtUtc;
  readonly Stopwatch clock=Stopwatch.StartNew();long nextOpen;
  readonly System.Windows.Forms.Timer poll=new System.Windows.Forms.Timer();
  readonly string dataDir=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WeighbridgeBridge");
  Settings settings;
  readonly OutputChannel primary,returns;
  public MainForm() {
   primary=new OutputChannel(OutputKind.Primary,"الأساسي",()=>clock.ElapsedMilliseconds,WriteLog,SaveReply);
   returns=new OutputChannel(OutputKind.Returns,"المرتجعات",()=>clock.ElapsedMilliseconds,WriteLog,SaveReply);
   BuildInterface();
   settings=LoadSettings();Apply(settings);
   start.Click+=(s,e)=>StartReading();stop.Click+=(s,e)=>StopReading();
   save.Click+=(s,e)=>{try{var cfg=ReadSettings();Directory.CreateDirectory(dataDir);File.WriteAllText(Path.Combine(dataDir,"settings.json"),new JavaScriptSerializer().Serialize(cfg),Encoding.UTF8);WriteLog("تم حفظ الإعدادات؛ رموز الربط مشفرة لحساب Windows الحالي.");}catch(Exception ex){MessageBox.Show(ex.Message);}};
   poll.Interval=100;poll.Tick+=(s,e)=>{Tick(s,e);RefreshInterface();};poll.Start();FormClosing+=(s,e)=>{StopReading();poll.Stop();};
  }
  static void ConfigureNumber(NumericUpDown n,int min,int max){n.Minimum=min;n.Maximum=max;n.Width=100;}
  static FlowLayoutPanel Row(params Control[] controls){var p=new FlowLayoutPanel{Dock=DockStyle.Fill,AutoSize=true,WrapContents=true};foreach(var c in controls)p.Controls.Add(c);return p;}
  void AddField(string text,Control c){int r=fields.RowCount++;fields.RowStyles.Add(new RowStyle(SizeType.Absolute,34));fields.Controls.Add(new Label{Text=text,AutoSize=true,Anchor=AnchorStyles.Right},0,r);c.Dock=DockStyle.Fill;fields.Controls.Add(c,1,r);}
  Settings LoadSettings(){try{string f=Path.Combine(dataDir,"settings.json");if(File.Exists(f))return new JavaScriptSerializer().Deserialize<Settings>(File.ReadAllText(f))??new Settings();}catch{ }return new Settings();}
  void Apply(Settings c){port.Text=c.Port;endpoint.Text=c.Endpoint;company.Text=c.Company;marker.Text=c.ResponseMarker;baud.Value=Clamp(c.Baud,300,115200);bits.Value=Clamp(c.DataBits,5,8);interval.Value=1000;fresh.Value=Clamp(c.Freshness,1000,30000);returnsEndpoint.Text=c.ReturnsEndpoint;returnsToken.Text=LocalSecrets.Unprotect(c.ReturnsTokenProtected);token.Text=LocalSecrets.Unprotect(c.PrimaryTokenProtected);enableReturns.Checked=c.ReturnsEnabled;parity.SelectedItem=c.Parity;if(parity.SelectedIndex<0)parity.SelectedIndex=0;}
  static int Clamp(int v,int min,int max){return Math.Max(min,Math.Min(max,v));}
  Settings ReadSettings(){
   var c=new Settings{Port=port.Text.Trim(),Baud=(int)baud.Value,DataBits=(int)bits.Value,Parity=parity.Text,Endpoint=endpoint.Text.Trim(),Company=company.Text.Trim(),Interval=(int)interval.Value,Freshness=(int)fresh.Value,ResponseMarker=marker.Text,ReturnsEndpoint=returnsEndpoint.Text.Trim(),ReturnsEnabled=enableReturns.Checked,ReturnsTokenProtected=LocalSecrets.Protect(returnsToken.Text),PrimaryTokenProtected=LocalSecrets.Protect(token.Text)};
   if(!Regex.IsMatch(c.Port,@"^COM\d+$",RegexOptions.IgnoreCase))throw new Exception("أدخلي منفذًا مثل COM6.");
   if(!Regex.IsMatch(c.Company,@"^\d+$"))throw new Exception("رقم الشركة يجب أن يكون أرقامًا.");
   Uri u;if(!Uri.TryCreate(c.Endpoint,UriKind.Absolute,out u)||u.Scheme!="https"||u.UserInfo!=""||u.Fragment!=""||u.Query!="")throw new Exception("عنوان الإرسال يجب أن يكون HTTPS دون كلمة مرور أو معاملات إضافية.");
   return c;
  }
  void StartReading(){
   try{settings=ReadSettings();if(enableSend.Checked&&MessageBox.Show("سيُرسل وزن الميزان الحقيقي إلى:\n"+settings.Endpoint+"\nالشركة: "+settings.Company+"\nهل تأكدتِ من الوجهة وأغلقتِ برنامج الإرسال القديم؟","تفعيل الإرسال",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;
    primary.Configure(settings.Endpoint,token.Text,settings.Company,settings.Freshness);returns.Configure(settings.ReturnsEndpoint,returnsToken.Text,settings.Company,settings.Freshness);
    running=true;received=-1;frames=new Frames();nextOpen=0;fields.Enabled=false;enableSend.Enabled=false;enableReturns.Enabled=false;start.Enabled=false;stop.Enabled=true;save.Enabled=false;weight.Text="— kg";httpState.Text=enableSend.Checked?"الإرسال: بانتظار قراءة حديثة":"الإرسال: مراقبة فقط";WriteLog("بدء القراءة "+settings.Port+" / "+settings.Baud+" / "+settings.DataBits+" / "+settings.Parity+" / StopBits.One");
   }catch(Exception ex){MessageBox.Show(ex.Message);}
  }
  void StopReading(){running=false;received=-1;primary.Stop();returns.Stop();CloseSerial();fields.Enabled=true;enableSend.Enabled=true;enableReturns.Enabled=true;start.Enabled=true;stop.Enabled=false;save.Enabled=true;serialState.Text="الميزان: متوقف";httpState.Text="الإرسال: متوقف";weight.Text="— kg";}
  void CloseSerial(){if(serial!=null){try{serial.Close();serial.Dispose();}catch{ }serial=null;}}
  void WriteLog(string msg){string line=DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")+" "+msg;if(log.TextLength>50000)log.Text=log.Text.Substring(log.TextLength-25000);log.AppendText(line+Environment.NewLine);try{Directory.CreateDirectory(dataDir);string f=Path.Combine(dataDir,"bridge.log");if(File.Exists(f)&&new FileInfo(f).Length>2*1024*1024){string old=f+".1";if(File.Exists(old))File.Delete(old);File.Move(f,old);}File.AppendAllText(f,line+Environment.NewLine,Encoding.UTF8);}catch{ }}
  void Tick(object sender,EventArgs e){
   if(!running)return;
   long now=clock.ElapsedMilliseconds;
   if(serial==null && now>=nextOpen){try{serial=new SerialPort(settings.Port,settings.Baud,(Parity)Enum.Parse(typeof(Parity),settings.Parity),settings.DataBits,StopBits.One);serial.Handshake=Handshake.None;serial.DtrEnable=false;serial.RtsEnable=false;serial.Open();frames=new Frames();WriteLog("تم فتح منفذ الميزان.");serialState.Text="الميزان: متصل؛ بانتظار إطار كامل";}catch(Exception ex){CloseSerial();received=-1;nextOpen=now+3000;serialState.Text="الميزان: تعذر فتح المنفذ";WriteLog("فشل فتح المنفذ: "+ex.GetType().Name+". تأكدي من المنفذ وإغلاق البرنامج القديم.");}}
   if(serial!=null){try{string part=serial.ReadExisting();if(part.Length>0){decimal w;string raw;if(frames.Push(part,out w,out raw)){latest=w;received=now;sampledAtUtc=DateTime.UtcNow;weight.Text=w.ToString(CultureInfo.InvariantCulture)+" kg";serialState.Text="الميزان: قراءة حديثة";}else if(raw.Length>0){received=-1;weight.Text="— kg";serialState.Text="الميزان: إطار غير مدعوم أو غير مستقر";WriteLog("إطار: "+Regex.Replace(raw,@"[^\x20-\x7e]","?").Substring(0,Math.Min(120,raw.Length)));}}}catch(Exception ex){WriteLog("انقطاع المنفذ: "+ex.GetType().Name);CloseSerial();received=-1;nextOpen=now+3000;}}
   bool recent=ReadingPolicy.IsFresh(now,received,settings.Freshness);
   age.Text=received<0?"لا توجد قراءة صالحة":("عمر القراءة: "+((now-received)/1000.0).ToString("0.0")+" ثانية");
   if(!recent){weight.Text="— kg";if(received>=0)serialState.Text="الميزان: توقفت القراءات";if(enableSend.Checked&&!primary.Busy)httpState.Text="الإرسال: متوقف حتى تصل قراءة حديثة";}
   primary.Pump(now,enableSend.Checked,received,sampledAtUtc,latest);
   returns.Pump(now,enableReturns.Checked,received,sampledAtUtc,latest);
  }
  void SaveReply(ApiReply reply,string name){try{Directory.CreateDirectory(dataDir);File.WriteAllText(Path.Combine(dataDir,name),"HTTP "+reply.StatusCode+Environment.NewLine+(reply.Body??""),Encoding.UTF8);}catch{ }}
 }
 static class Program {
  static void Assert(bool condition,string name){if(!condition)throw new Exception("FAIL: "+name);}
  static int Tests(){try{decimal w;Assert(Protocol.Parse("ST,GS,+000120kg",out w)&&w==120,"GS");Assert(Protocol.Parse("ST,GS,-000020kg",out w)&&w==-20,"negative");Assert(Protocol.Parse("ST,GS,1,+42kg",out w)&&w==42,"channel GS");Assert(Protocol.Parse("1,ST,120,kg",out w)&&w==120,"channel ST");Assert(Protocol.Parse("ST,NT,12.5,kg",out w)&&w==12.5m,"NT");Assert(!Protocol.Parse("US,GS,+120kg",out w),"unstable");Assert(!Protocol.Parse("ST,GS,1 2xkg",out w),"malformed");Assert(Protocol.Parse("ST,GS,+000000kg",out w)&&w==0,"zero");var f=new Frames();string raw;Assert(!f.Push("ST,GS,+12",out w,out raw),"partial");Assert(f.Push("0kg\r\n",out w,out raw)&&w==120,"split");Assert(f.Push("ST,GS,+120kg\rST,GS,+120kg\r",out w,out raw)&&w==120,"unchanged fresh");Assert(!f.Push("ST,GS,+120kg\rUS,GS,+120kg\r",out w,out raw),"new invalid frame");Assert(Protocol.Payload("1",12.5m)=="{\"company_id\":\"1\",\"weight_scale\":\"12.5\"}","JSON");Console.WriteLine("PASS: 13 protocol/framing checks");CompatibilityTests.Run();return 0;}catch(Exception ex){Console.WriteLine(ex.Message);return 1;}}
  [STAThread] static int Main(string[] args){if(args.Length>0&&args[0]=="--self-test")return Tests();if(args.Length>0&&args[0]=="--integration-test")return CompatibilityTests.Integration();if(args.Length>0&&args[0]=="--dual-test")return DualDeliveryTests.Run();bool first;using(var gate=new Mutex(true,"WeighbridgeBridge.SingleInstance",out first)){if(!first){MessageBox.Show("البرنامج مفتوح بالفعل.");return 1;}Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new MainForm());return 0;}}
 }
}
