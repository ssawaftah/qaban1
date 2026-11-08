using System;
using System.IO;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace WeighbridgeBridge {
 public sealed class SurfacePanel:Panel {
  public Color Surface=Color.White;
  public SurfacePanel(){DoubleBuffered=true;ResizeRedraw=true;Padding=new Padding(20);Margin=new Padding(0,0,0,16);}
  protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);if(Width<30||Height<30)return;e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;using(var path=new GraphicsPath()){float d=22,w=Width-1,h=Height-1;path.AddArc(0,0,d,d,180,90);path.AddArc(w-d,0,d,d,270,90);path.AddArc(w-d,h-d,d,d,0,90);path.AddArc(0,h-d,d,d,90,90);path.CloseFigure();using(var brush=new SolidBrush(Surface))e.Graphics.FillPath(brush,path);using(var pen=new Pen(Color.FromArgb(228,233,237)))e.Graphics.DrawPath(pen,path);}}
 }
 public sealed partial class MainForm {
  static readonly Color Ink=Color.FromArgb(24,43,57),Muted=Color.FromArgb(110,124,135),Canvas=Color.FromArgb(246,248,250),Accent=Color.FromArgb(0,121,113);
  Panel screenHost=new Panel(),overviewPage=new Panel(),settingsPage=new Panel(),logsPage=new Panel();
  Button overviewNav=new Button(),settingsNav=new Button(),logsNav=new Button();
  Label visibleSerial=new Label(),visibleHttp=new Label(),visibleServer=new Label();
  Label CenterLabel(string text,float size,Color color,Color background){return new Label{Text=text,Font=new Font("Segoe UI",size),ForeColor=color,BackColor=background,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleCenter,AutoEllipsis=true,Margin=new Padding(0)};}
  TableLayoutPanel Centered(Control control){var host=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=1,RowCount=1,BackColor=Canvas,Margin=new Padding(0)};host.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));host.RowStyles.Add(new RowStyle(SizeType.Percent,100));control.Anchor=AnchorStyles.None;host.Controls.Add(control,0,0);return host;}
  void StyleButton(Button b,string text,bool primary){b.Text=text;b.Font=new Font("Segoe UI",10,FontStyle.Bold);b.FlatStyle=FlatStyle.Flat;b.FlatAppearance.BorderSize=0;b.UseVisualStyleBackColor=false;b.BackColor=primary?Accent:Color.FromArgb(231,237,241);b.ForeColor=primary?Color.White:Ink;b.FlatAppearance.MouseOverBackColor=primary?Color.FromArgb(0,105,98):Color.FromArgb(219,229,235);b.Height=44;b.Width=142;b.Margin=new Padding(5);b.Cursor=Cursors.Hand;b.TextAlign=ContentAlignment.MiddleCenter;b.AccessibleName=text;}
  FlowLayoutPanel Buttons(params Control[] buttons){var flow=new FlowLayoutPanel{AutoSize=true,AutoSizeMode=AutoSizeMode.GrowAndShrink,WrapContents=false,FlowDirection=FlowDirection.RightToLeft,BackColor=Canvas,Margin=new Padding(0)};flow.Controls.AddRange(buttons);return flow;}
  void BuildInterface(){
   Text="قبان الغد";ClientSize=new Size(900,750);MinimumSize=new Size(760,640);StartPosition=FormStartPosition.CenterScreen;Font=new Font("Segoe UI",10);AutoScaleMode=AutoScaleMode.Font;RightToLeft=RightToLeft.Yes;RightToLeftLayout=true;BackColor=Canvas;
   try{Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);}catch{Icon=SystemIcons.Application;}
   var root=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=1,RowCount=3,Padding=new Padding(28,16,28,20),BackColor=Canvas};root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));root.RowStyles.Add(new RowStyle(SizeType.Absolute,54));root.RowStyles.Add(new RowStyle(SizeType.Absolute,62));root.RowStyles.Add(new RowStyle(SizeType.Percent,100));Controls.Add(root);
   var title=CenterLabel("قبان الغد",22,Ink,Canvas);title.Font=new Font("Segoe UI",22,FontStyle.Bold);root.Controls.Add(title,0,0);
   StyleButton(overviewNav,"الوزن",true);StyleButton(settingsNav,"الإعدادات",false);StyleButton(logsNav,"السجل",false);root.Controls.Add(Centered(Buttons(overviewNav,settingsNav,logsNav)),0,1);
   screenHost.Dock=DockStyle.Fill;screenHost.BackColor=Canvas;root.Controls.Add(screenHost,0,2);
   foreach(var page in new[]{overviewPage,settingsPage,logsPage}){page.Dock=DockStyle.Fill;page.AutoScroll=true;page.BackColor=Canvas;screenHost.Controls.Add(page);}
   BuildOverview();BuildSettings();BuildLogs();ShowScreen(overviewPage,overviewNav);
   overviewNav.Click+=(s,e)=>ShowScreen(overviewPage,overviewNav);settingsNav.Click+=(s,e)=>ShowScreen(settingsPage,settingsNav);logsNav.Click+=(s,e)=>ShowScreen(logsPage,logsNav);
   enableSend.CheckedChanged+=(s,e)=>RefreshInterface();RefreshInterface();
  }
  void ShowScreen(Panel page,Button selected){foreach(var p in new[]{overviewPage,settingsPage,logsPage})p.Visible=p==page;page.BringToFront();foreach(var b in new[]{overviewNav,settingsNav,logsNav}){bool on=b==selected;b.BackColor=on?Accent:Color.FromArgb(231,237,241);b.ForeColor=on?Color.White:Ink;b.FlatAppearance.MouseOverBackColor=on?Color.FromArgb(0,105,98):Color.FromArgb(219,229,235);}}
  void BuildOverview(){
   var layout=new TableLayoutPanel{Dock=DockStyle.Top,Height=450,ColumnCount=3,RowCount=4,BackColor=Canvas};layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,8));layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,84));layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,8));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,230));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,100));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,65));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,55));overviewPage.Controls.Add(layout);
   var hero=new SurfacePanel{Dock=DockStyle.Fill,BackColor=Canvas};weight.Text="— kg";weight.Font=new Font("Segoe UI",60,FontStyle.Bold);weight.ForeColor=Ink;weight.BackColor=Color.White;weight.TextAlign=ContentAlignment.MiddleCenter;weight.RightToLeft=RightToLeft.No;weight.Dock=DockStyle.Fill;hero.Controls.Add(weight);layout.Controls.Add(hero,1,0);
   var states=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=3,RowCount=1,BackColor=Canvas,Margin=new Padding(0)};states.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,33.33f));states.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,33.33f));states.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,33.34f));states.Controls.Add(StatusBlock("الميزان",visibleSerial),0,0);states.Controls.Add(StatusBlock("الإرسال",visibleHttp),1,0);states.Controls.Add(StatusBlock("رد الخادم",visibleServer),2,0);layout.Controls.Add(states,1,1);
   StyleButton(start,"تشغيل",true);StyleButton(stop,"إيقاف",false);stop.Enabled=false;layout.Controls.Add(Centered(Buttons(start,stop)),1,2);
   enableSend.Text="إرسال الوزن";enableSend.AutoSize=true;enableSend.Checked=false;enableSend.ForeColor=Ink;enableSend.BackColor=Canvas;enableSend.CheckAlign=ContentAlignment.MiddleRight;enableSend.TextAlign=ContentAlignment.MiddleCenter;layout.Controls.Add(Centered(enableSend),1,3);
   serialState.Text="الميزان: متوقف";httpState.Text="الإرسال: وضع مراقبة";
  }
  Control StatusBlock(string title,Label value){var panel=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=1,RowCount=2,BackColor=Canvas,Margin=new Padding(8)};panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));panel.RowStyles.Add(new RowStyle(SizeType.Absolute,26));panel.RowStyles.Add(new RowStyle(SizeType.Percent,100));panel.Controls.Add(CenterLabel(title,9,Muted,Canvas),0,0);value.Dock=DockStyle.Fill;value.TextAlign=ContentAlignment.MiddleCenter;value.Font=new Font("Segoe UI",12,FontStyle.Bold);value.ForeColor=Ink;value.BackColor=Canvas;value.AutoEllipsis=true;panel.Controls.Add(value,0,1);return panel;}
  void BuildSettings(){
   var outer=new TableLayoutPanel{Dock=DockStyle.Top,Height=480,ColumnCount=3,RowCount=2,BackColor=Canvas};outer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,6));outer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,88));outer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,6));outer.RowStyles.Add(new RowStyle(SizeType.Absolute,420));outer.RowStyles.Add(new RowStyle(SizeType.Absolute,60));settingsPage.Controls.Add(outer);
   fields.Dock=DockStyle.Fill;fields.BackColor=Canvas;fields.ColumnCount=2;fields.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,160));fields.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));fields.Margin=new Padding(0);outer.Controls.Add(fields,1,0);
   ConfigureNumber(baud,300,115200);ConfigureNumber(bits,5,8);ConfigureNumber(interval,1000,1000);ConfigureNumber(fresh,1000,30000);
   parity.DropDownStyle=ComboBoxStyle.DropDownList;parity.Items.AddRange(new object[]{"None","Even","Odd","Mark","Space"});parity.DrawMode=DrawMode.OwnerDrawFixed;parity.DrawItem+=(s,e)=>{e.DrawBackground();string text=e.Index<0?parity.Text:Convert.ToString(parity.Items[e.Index]);using(var brush=new SolidBrush(e.ForeColor))using(var format=new StringFormat{Alignment=StringAlignment.Center,LineAlignment=StringAlignment.Center})e.Graphics.DrawString(text,e.Font,brush,e.Bounds,format);e.DrawFocusRectangle();};
   MinimalField("المنفذ",port);MinimalField("السرعة",baud);MinimalField("بتات البيانات",bits);MinimalField("التكافؤ",parity);MinimalField("مهلة القراءة (ms)",fresh);MinimalField("عنوان النظام",endpoint);MinimalField("الشركة",company);token.UseSystemPasswordChar=true;MinimalField("رمز API",token);
   StyleButton(save,"حفظ",true);outer.Controls.Add(Centered(save),1,1);
  }
  void MinimalField(string title,Control input){int row=fields.RowCount++;fields.RowStyles.Add(new RowStyle(SizeType.Absolute,47));fields.Controls.Add(CenterLabel(title,10,Muted,Canvas),0,row);input.Dock=DockStyle.Fill;input.Margin=new Padding(0,8,0,8);input.Font=new Font("Segoe UI",10);input.RightToLeft=RightToLeft.No;input.AccessibleName=title;var box=input as TextBox;if(box!=null){box.TextAlign=HorizontalAlignment.Center;box.BorderStyle=BorderStyle.FixedSingle;box.BackColor=Color.White;}var number=input as NumericUpDown;if(number!=null)number.TextAlign=HorizontalAlignment.Center;fields.Controls.Add(input,1,row);}
  void BuildLogs(){
   var outer=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=1,RowCount=2,BackColor=Canvas};outer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));outer.RowStyles.Add(new RowStyle(SizeType.Percent,100));outer.RowStyles.Add(new RowStyle(SizeType.Absolute,60));logsPage.Controls.Add(outer);
   var card=new SurfacePanel{Dock=DockStyle.Fill,BackColor=Canvas};log.Multiline=true;log.ReadOnly=true;log.ScrollBars=ScrollBars.Vertical;log.WordWrap=true;log.Dock=DockStyle.Fill;log.RightToLeft=RightToLeft.No;log.TextAlign=HorizontalAlignment.Center;log.BorderStyle=BorderStyle.None;log.BackColor=Color.White;log.ForeColor=Ink;log.Font=new Font("Segoe UI",9);card.Controls.Add(log);outer.Controls.Add(card,0,0);
   var open=new Button();StyleButton(open,"فتح السجل",false);outer.Controls.Add(Centered(open),0,1);open.Click+=(s,e)=>{try{Directory.CreateDirectory(dataDir);Process.Start("explorer.exe","\""+dataDir+"\"");}catch(Exception ex){MessageBox.Show(ex.Message);}};
  }
  void RefreshInterface(){
   string serialText=serialState.Text??"";
   bool valid=running&&serialText.Contains("حديثة");
   visibleSerial.Text=!running?"متوقف":valid?"متصل":serialText.Contains("غير مدعوم")?"قراءة غير صالحة":serialText.Contains("تعذر")?"غير متصل":serialText.Contains("بانتظار")?"بانتظار الوزن":"لا توجد قراءة";
   visibleSerial.ForeColor=valid?Accent:Muted;
   ChannelStatus(primary,enableSend.Checked,visibleHttp,visibleServer);
  }
  void ChannelStatus(OutputChannel channel,bool enabled,Label sent,Label reply){
   sent.Text=!running?"متوقف":!enabled?"مغلق":!channel.Ready?"غير مهيأ":channel.Feedback.SendText;
   sent.ForeColor=running&&enabled&&channel.Feedback.SendText=="تم الإرسال"?Accent:Muted;
   reply.Text=!running||!enabled?"—":!channel.Ready?channel.ConfigurationError:channel.Feedback.ServerText;
   reply.ForeColor=channel.Feedback.ServerError||enabled&&!channel.Ready?Color.FromArgb(173,68,57):channel.Feedback.ServerText=="تم التحديث"?Accent:Muted;
  }
 }
}
