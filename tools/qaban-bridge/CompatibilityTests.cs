using System;
using System.Net;
using System.Net.Sockets;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Globalization;
using System.Diagnostics;

namespace WeighbridgeBridge {
 public static class CompatibilityTests {
  static int count;
  static void Check(bool result,string name){if(!result)throw new Exception("FAIL: "+name);count++;}
  static bool UsesFrameworkSplit(){
   var method=typeof(Protocol).GetMethod("Parse");var il=method.GetMethodBody().GetILAsByteArray();int calls=0;
   for(int i=0;i<il.Length-4;i++){
    if(il[i]!=0x28&&il[i]!=0x6f)continue;
    System.Reflection.MethodBase target;
    try{target=method.Module.ResolveMethod(BitConverter.ToInt32(il,i+1));}catch{continue;}
    if(target.DeclaringType!=typeof(string)||target.Name!="Split")continue;
    var parameters=target.GetParameters();if(parameters.Length!=1||parameters[0].ParameterType!=typeof(char[]))return false;calls++;
   }
   return calls==2;
  }
  public static void Run(){
   count=0;decimal weight;string raw;
   Check(UsesFrameworkSplit(),"compiled parser uses Framework-compatible Split(char[])");
   string[] valid={"ST,GS,+000120kg","ST,GS,-000020kg","ST,GS,1,+120kg","1,ST,120,kg","ST,NT,120,kg","ST,GS,   +120.50 kg"};
   decimal[] expected={120,-20,120,120,120,120.50m};
   for(int i=0;i<valid.Length;i++)Check(Protocol.Parse(valid[i],out weight)&&weight==expected[i],"legacy format "+i);
   var frames=new Frames();
   foreach(char c in "ST,GS,+00120kg\r"){
    bool ok=frames.Push(c.ToString(),out weight,out raw);
    Check(c=='\r'?ok&&weight==120:!ok,"one-byte fragmentation "+(int)c);
   }
   Check(frames.Push("ST,GS,+100kg\rST,GS,+200kg\r",out weight,out raw)&&weight==200,"latest complete frame");
   Check(!frames.Push("US,GS,+200kg\r",out weight,out raw),"unstable invalidates");
   Check(frames.Push("ST,GS,+0kg\r",out weight,out raw)&&weight==0,"real zero");
   Check(!frames.Push("ST,GS,+123oops\r",out weight,out raw),"garbage not stripped into weight");
   Check(!frames.Push(new string('x',17000),out weight,out raw),"bounded partial buffer");
   Check(frames.Push("ST,GS,+20kg\r",out weight,out raw)&&weight==20,"recovery after overflow");
   Check(!ReadingPolicy.IsFresh(5000,-1,3000),"no fabricated startup reading");
   Check(ReadingPolicy.IsFresh(5000,2000,3000),"fresh boundary");
   Check(!ReadingPolicy.IsFresh(5001,2000,3000),"stale stops");
   Check(ReadingPolicy.IsFresh(9000,8990,3000),"same weight new frame remains fresh");
   Check(ReadingPolicy.Deadline(4900,2000,3000)==100,"request limited to freshness");
   Check(ReadingPolicy.Deadline(10000,9999,30000)==8000,"request upper timeout");
   Check(ResponseRules.IsHtml("text/html","hello"),"HTML media rejected");
   Check(ResponseRules.IsHtml("application/json","  <html>login</html>"),"HTML body rejected");
   Check(!ResponseRules.Matches("unsuccessful","success"),"substring false-positive blocked");
   Check(ResponseRules.Matches(" success \r\n","success"),"full text acknowledgement");
   Check(!ResponseRules.Matches("success",""),"no guessed acknowledgement");
   Check(ResponseRules.Matches("{\"success\":true,\"weight\":120}","{\"success\":true}"),"typed JSON subset");
   Check(!ResponseRules.Matches("{\"success\":false}","{\"success\":true}"),"JSON failure blocked");
   Check(!ResponseRules.Matches("{\"success\":\"true\"}","{\"success\":true}"),"string not Boolean");
   Check(!ResponseRules.Matches("{\"other\":true}","{\"success\":true}"),"missing field blocked");
   Check(!ResponseRules.Matches("invalid JSON","{\"success\":true}"),"malformed response blocked");
   Check(!ResponseRules.Matches("{}","{}"),"empty pattern rejected");
   var culture=Thread.CurrentThread.CurrentCulture;
   try{Thread.CurrentThread.CurrentCulture=new CultureInfo("fr-FR");Check(Protocol.Parse("ST,GS,+12.5kg",out weight)&&weight==12.5m,"invariant parse");Check(Protocol.Payload("1",12.5m)=="{\"company_id\":\"1\",\"weight_scale\":\"12.5\"}","invariant wire strings");}
   finally{Thread.CurrentThread.CurrentCulture=culture;}
   Check(Protocol.Parse("ST,GS,    0,kg",out weight)&&weight==0,"actual scale zero comma kg");
   Check(Protocol.Parse("ST,GS,  120,kg",out weight)&&weight==120,"actual scale positive comma kg");
   Check(Protocol.Parse("ST,GS, -12.5,kg",out weight)&&weight==-12.5m,"actual scale signed decimal comma kg");
   Check(Protocol.Parse("st,gs ,  0,kg",out weight)&&weight==0,"spaced case-insensitive header");
   Check(Protocol.Parse("ST,NT, 120,kg",out weight)&&weight==120,"net comma kg");
   Check(Protocol.Parse("ST,GS,1,120,kg",out weight)&&weight==120,"channel comma kg");
   Check(!Protocol.Parse("ST,GS,120,,kg",out weight),"double unit delimiter rejected");
   Check(!Protocol.Parse("ST,GS,2,3,kg",out weight),"ambiguous extra numeric fields rejected");
   Check(!Protocol.Parse("US,GS,0,kg",out weight),"unstable comma kg rejected");
   Check(ResponseRules.KnownSuccess("{\"success\":\"Weight scale updated successfully\"}"),"observed real server acknowledgement");
   Check(!ResponseRules.KnownSuccess("{\"success\":false}"),"false not vendor acknowledgement");
   Check(ResponseRules.ExplicitFailure("{\"error\":\"server failed\"}"),"explicit JSON error");
   Check(ResponseRules.ExplicitFailure("{\"success\":false}"),"JSON false error");
   Check(!ResponseRules.ExplicitFailure("{\"success\":\"Weight scale updated successfully\"}"),"vendor success not error");
   var schedule=new DeliverySchedule();bool enabled=true;
   Check(schedule.CanSend(0,true,enabled,true,false),"initial current reading eligible");
   Check(schedule.Failed(100,0)==2000,"first retry after two seconds");
   Check(!schedule.CanSend(2099,true,enabled,true,false),"no retry storm");
   Check(schedule.CanSend(2100,true,enabled,true,false),"automatic retry retains enabled intent");
   Check(!schedule.CanSend(2100,true,enabled,false,false),"retry cannot send stale reading");
   Check(!schedule.CanSend(2100,true,enabled,true,true),"no parallel request");
   Check(!schedule.CanSend(2100,false,enabled,true,false),"stop prevents retry");
   Check(!schedule.CanSend(2100,true,false,true,false),"disabled prevents retry");
   Check(schedule.Failed(2100,7000)==7000,"honour server retry seconds");
   schedule.Success(10000,1000);Check(schedule.Failures==0&&schedule.NextAttempt==11000,"success returns to live interval");
   for(int i=0;i<20;i++)schedule.Failed(11000,0);
   Check(schedule.NextAttempt==41000,"bounded exponential retry");
   schedule.Reset();Check(schedule.Failures==0&&schedule.NextAttempt==0,"restart clears retry state");
   var changes=new DeliverySchedule();
   Check(changes.NeedsSend(0),"initial real zero must be sent");
   changes.Success(0,1000);Check(changes.NeedsSend(0),"HTTP response without acknowledgement does not suppress weight");
   changes.Confirm(0);Check(!changes.NeedsSend(0),"confirmed zero suppresses duplicates");
   Check(changes.NeedsSend(120),"changed value requires send");
   changes.Failed(1000,0);Check(changes.NeedsSend(120),"failed changed value remains eligible");
   Check(!changes.NeedsSend(0),"latest returns to last confirmed without replaying failed intermediate");
   changes.Confirm(120);Check(!changes.NeedsSend(120),"confirmed changed value suppresses repeats");
   Check(changes.NeedsSend(140),"new value while previous request completes stays pending");
   Check(changes.NeedsSend(0),"return to zero after nonzero must send");
   changes.Reset();Check(changes.NeedsSend(120),"restart resynchronizes even identical numeric value");
   var periodic=new DeliverySchedule();periodic.PeriodicStart(0,1000);
   Check(!periodic.CanSend(999,true,true,true,false),"periodic interval not early");
   Check(periodic.CanSend(1000,true,true,true,false),"periodic next second");
   periodic.Confirm(120);Check(periodic.CanSend(1000,true,true,true,false),"confirmed stable weight still sent periodically");
   periodic.PeriodicStart(1000,1000);periodic.PeriodicFailure(1100,0);
   Check(periodic.NextAttempt==2000,"HTTP 500 does not disable periodic sending");
   Check(periodic.CanSend(2000,true,true,true,false),"same weight retry at next second");
   Check(!periodic.CanSend(2000,true,true,false,false),"periodic does not send stale reading");
   Check(!periodic.CanSend(2000,true,true,true,true),"periodic never overlaps requests");
   periodic.PeriodicFailure(2100,5000);Check(periodic.NextAttempt==7100,"server retry hint respected");
   var feedback=new TransferFeedback();feedback.Begin();
   Check(feedback.SendText!="تم الإرسال","not sent before body write");
   feedback.BodyWritten();Check(feedback.SendText=="تم الإرسال","sent only after body write");
   feedback.Reply(500,false,false,true);
   Check(feedback.SendText=="تم الإرسال"&&feedback.ServerError&&feedback.ServerText.Contains("500"),"transport sent and server failure shown separately");
   feedback.Begin();feedback.NoReply();Check(feedback.SendText=="لم يتم الاتصال","failed next request cannot claim sent");
   feedback.Begin();feedback.BodyWritten();feedback.NoReply();Check(feedback.SendText=="تم الإرسال"&&feedback.ServerText=="لم يصل رد","written timeout distinguished from update");
   feedback.Begin();feedback.BodyWritten();feedback.Reply(200,true,false,false);Check(feedback.ServerText=="تم التحديث"&&!feedback.ServerError,"actual vendor acknowledgement displayed");
   Console.WriteLine("PASS: "+count+" additional compatibility checks");
  }
  // Optional development-only loopback integration checks. No production URLs,
  // credentials or serial ports are used. Not run by Build-and-Run.cmd.
  public static int Integration(){try{IntegrationAsync().GetAwaiter().GetResult();return 0;}catch(Exception ex){Console.WriteLine(ex);return 1;}}
  static async Task IntegrationAsync(){
   count=0;
   var reserve=new TcpListener(IPAddress.Loopback,0);reserve.Start();int port=((IPEndPoint)reserve.LocalEndpoint).Port;reserve.Stop();
   string url="http://127.0.0.1:"+port+"/";
   using(var listener=new HttpListener()){
    listener.Prefixes.Add(url);listener.Start();
    string[] bodies={"{\"success\":true}","", "<html>login</html>",new string('x',8193),"unauthorized","late","{\"error\":\"server failed\"}","{\"success\":\"Weight scale updated successfully\"}","{\"success\":\"Weight scale updated successfully\"}"};
    int[] codes={200,302,200,200,401,200,500,200,200};
    var serve=Task.Run(async()=>{
     for(int i=0;i<codes.Length;i++){
      var context=await listener.GetContextAsync();
      string requestBody;using(var reader=new StreamReader(context.Request.InputStream))requestBody=await reader.ReadToEndAsync();
      Check(context.Request.UserAgent=="QabanAlGhad/0.9","application identity "+i);
      Check(context.Request.HttpMethod=="POST","transport POST "+i);
      Check(context.Request.ContentType=="application/json","transport content type "+i);
      Check(context.Request.AcceptTypes!=null&&context.Request.AcceptTypes[0]=="application/json","transport accept "+i);
      Check(requestBody==Protocol.Payload("1",i>=7?200:120),"transport payload "+i);
      if(i==5)await Task.Delay(800);
      context.Response.StatusCode=codes[i];if(i==6)context.Response.Headers["Retry-After"]="3";if(i==1)context.Response.RedirectLocation=url+"login";
      context.Response.ContentType=i==2?"text/html":"application/json";
      byte[] bytes=Encoding.UTF8.GetBytes(bodies[i]);context.Response.ContentLength64=bytes.Length;
      try{await context.Response.OutputStream.WriteAsync(bytes,0,bytes.Length);}catch(IOException){}catch(HttpListenerException){}finally{context.Response.Close();}
     }
    });
    ApiReply reply=await ApiTransport.SendAsync(url,Protocol.Payload("1",120),"",3000,null);
    Check(reply.StatusCode==200&&ResponseRules.Matches(reply.Body,"{\"success\":true}"),"actual transport accepted response");
    reply=await ApiTransport.SendAsync(url,Protocol.Payload("1",120),"",3000,null);Check(reply.StatusCode==302,"redirect not followed");
    reply=await ApiTransport.SendAsync(url,Protocol.Payload("1",120),"",3000,null);Check(ResponseRules.IsHtml(reply.MediaType,reply.Body),"HTML detected after transport");
    bool oversized=false;try{await ApiTransport.SendAsync(url,Protocol.Payload("1",120),"",3000,null);}catch(InvalidDataException){oversized=true;}Check(oversized,"oversized response bounded");
    reply=await ApiTransport.SendAsync(url,Protocol.Payload("1",120),"",3000,null);Check(reply.StatusCode==401&&reply.Body=="unauthorized","HTTP error body available");
    bool timeout=false;var watch=Stopwatch.StartNew();try{await ApiTransport.SendAsync(url,Protocol.Payload("1",120),"",150,null);}catch(WebException){timeout=true;}Check(timeout&&watch.ElapsedMilliseconds<5000,"request timeout aborts");
    reply=await ApiTransport.SendAsync(url,Protocol.Payload("1",120),"",3000,null);
    Check(reply.StatusCode==500&&reply.Body.Contains("server failed")&&reply.RetryAfterMilliseconds==3000,"500 diagnostics retained");
    var delivery=new DeliverySchedule();Check(delivery.Failed(0,reply.RetryAfterMilliseconds)==3000,"500 creates retry schedule");
    Check(delivery.CanSend(3000,true,true,true,false),"fresh next reading eligible after 500");
    reply=await ApiTransport.SendAsync(url,Protocol.Payload("1",200),"",3000,null);
    Check(reply.StatusCode==200&&ResponseRules.KnownSuccess(reply.Body),"newest weight recovers after 500");
    bool written=false;reply=await ApiTransport.SendAsync(url,Protocol.Payload("1",200),"",3000,null,()=>written=true);
    Check(written&&reply.StatusCode==200,"same stable value transmitted again with write feedback");
    await serve;
    Console.WriteLine("PASS: "+count+" loopback HTTP transport assertions; no production requests");
   }
  }
 }
}
